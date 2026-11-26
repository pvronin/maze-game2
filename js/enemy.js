/**
 * enemy.js
 * Creature AI controller supporting multiple enemy species (The Stalker, Cellar Skitterer,
 * Crimson Widow, Crypt Wraith, Abyssal Broodmother), A* pathfinding, sight/hearing detection,
 * periodic dash lunges, and spider silk web placement.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const cfg = require('./config.js');
    const pf = require('./pathfinding.js');
    const catalog = require('./catalog.js');
    module.exports = factory(cfg, pf, catalog);
  } else {
    root.HorrorMaze = root.HorrorMaze || {};
    Object.assign(root.HorrorMaze, factory(root.HorrorMaze, root.HorrorMaze, root.HorrorMaze));
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (cfg, pf, catalog) {
  const { TILE, ENEMY_STATE } = cfg;
  const { findPath, hasLineOfSight, isTileWalkable } = pf;

  function createEnemy(spawnTile, diffCfg, enemyTypeId, options) {
    const isBoss = Boolean((options && options.isBoss) || enemyTypeId === 'abyssal_warden');
    const def = isBoss && catalog && catalog.BOSS_DEF
      ? catalog.BOSS_DEF
      : catalog && enemyTypeId
      ? catalog.getById(catalog.ENEMY_TYPES, enemyTypeId)
      : catalog
      ? catalog.ENEMY_TYPES[0]
      : null;

    const mods = def
      ? def.mods
      : { speedMult: 1.0, sightMult: 1.0, dashCooldown: 0, dropsWeb: false };

    const bossCfg = cfg.BOSS_CFG || {
      SHOCKWAVE_COOLDOWN: 11.5,
      SURGE_COOLDOWN: 14.0,
    };

    return {
      x: spawnTile.x + 0.5,
      y: spawnTile.y + 0.5,
      radius: isBoss ? 0.36 : 0.3,
      angle: 0,
      isBoss,
      typeId: def ? def.id : 'stalker',
      archetype: def ? def.archetype : 'humanoid',
      state: ENEMY_STATE.PATROL,
      path: [],
      pathTimer: 0,
      patrolTarget: null,
      lastKnownPos: null,
      searchTimer: 0,
      alertFlashTimer: 0,
      stepDistAccum: 0,
      sawPlayerLastFrame: false,
      animPhase: 0,
      dashCooldownTimer: mods.dashCooldown || 0,
      dashActiveTimer: 0,
      webCooldownTimer: mods.dropsWeb ? 4.5 : 0,
      hitCooldownTimer: 0,
      stunTimer: 0,
      shockwaveCooldownTimer: isBoss ? bossCfg.SHOCKWAVE_COOLDOWN * 0.65 : 0,
      telegraphTimer: 0,
      surgeCooldownTimer: isBoss ? bossCfg.SURGE_COOLDOWN * 0.7 : 0,
      surgeTimer: 0,
      mods,
    };
  }

  function angleDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function pickPatrolTarget(grid, ex, ey, doorsByCoord, blockedCoords, rng) {
    const rows = grid.length;
    const cols = grid[0].length;
    const candidates = [];
    const curTx = Math.floor(ex);
    const curTy = Math.floor(ey);

    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        if (grid[y][x] !== TILE.FLOOR) continue;
        if (!isTileWalkable(grid, x, y, { canPassDoors: false, doorsByCoord, blockedCoords })) {
          continue;
        }
        const md = Math.abs(x - curTx) + Math.abs(y - curTy);
        if (md >= 4) candidates.push({ x, y });
      }
    }

    if (candidates.length === 0) return { x: curTx, y: curTy };
    return candidates[Math.floor((rng ? rng() : Math.random()) * candidates.length)];
  }

  function isPointInSmoke(x, y, smokeClouds) {
    if (!smokeClouds || smokeClouds.length === 0) return false;
    for (let i = 0; i < smokeClouds.length; i++) {
      const c = smokeClouds[i];
      if (!c || c.ttl <= 0) continue;
      if (Math.hypot(x - c.x, y - c.y) <= c.radius) return true;
    }
    return false;
  }

  function segmentIntersectsSmoke(x1, y1, x2, y2, smokeClouds) {
    if (!smokeClouds || smokeClouds.length === 0) return false;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq <= 0.0001) return isPointInSmoke(x1, y1, smokeClouds);
    for (let i = 0; i < smokeClouds.length; i++) {
      const c = smokeClouds[i];
      if (!c || c.ttl <= 0) continue;
      const t = Math.max(0, Math.min(1, ((c.x - x1) * dx + (c.y - y1) * dy) / lenSq));
      const px = x1 + t * dx;
      const py = y1 + t * dy;
      if (Math.hypot(px - c.x, py - c.y) <= c.radius * 0.92) return true;
    }
    return false;
  }

  function canSeePlayer(enemy, player, grid, doorsByCoord, diffCfg, smokeClouds) {
    if (!player.alive) return false;
    if ((enemy.stunTimer || 0) > 0) return false;
    if ((player.cloakTimer || 0) > 0) return false;

    if (
      isPointInSmoke(player.x, player.y, smokeClouds) ||
      isPointInSmoke(enemy.x, enemy.y, smokeClouds) ||
      segmentIntersectsSmoke(enemy.x, enemy.y, player.x, player.y, smokeClouds)
    ) {
      return false;
    }

    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const dist = Math.hypot(dx, dy);

    if (player.hidden) {
      if (enemy.state === ENEMY_STATE.CHASE && dist <= 1.35) {
        return hasLineOfSight(grid, enemy.x, enemy.y, player.x, player.y, doorsByCoord);
      }
      return false;
    }

    const crouchMult = player.isCrouching ? cfg.PLAYER_CFG.CROUCH_STEALTH_MULT || 0.52 : 1.0;
    const sightMult =
      (enemy.mods ? enemy.mods.sightMult : 1) *
      (player.mods ? player.mods.stealthMult : 1) *
      crouchMult;
    const effectiveSight = diffCfg.enemySightRange * sightMult;
    if (dist > effectiveSight) return false;
    if (!hasLineOfSight(grid, enemy.x, enemy.y, player.x, player.y, doorsByCoord)) {
      return false;
    }

    const closeSenseDist = player.isCrouching ? 1.25 : 2.1;
    if (dist <= closeSenseDist) return true;

    const angleToPlayer = Math.atan2(dy, dx);
    const halfFov = ((diffCfg.enemyFovDeg * Math.PI) / 180) * 0.5;
    const inFov = Math.abs(angleDiff(angleToPlayer, enemy.angle)) <= halfFov;
    const glareRatio = player.isCrouching ? 0.5 : 0.72;
    return inFov || (player.flashlightOn && dist <= effectiveSight * glareRatio);
  }

  function alertEnemyToPosition(enemy, tx, ty) {
    if ((enemy.stunTimer || 0) > 0) return;
    if (enemy.state === ENEMY_STATE.CHASE) return;
    enemy.state = ENEMY_STATE.INVESTIGATE;
    enemy.lastKnownPos = { x: tx, y: ty };
    enemy.pathTimer = 0;
  }

  function updateEnemy(
    enemy,
    playerOrPlayers,
    grid,
    doorsByCoord,
    blockedCoords,
    diffCfg,
    dt,
    rng,
    options
  ) {
    if (typeof rng === 'object' && rng !== null && !options) {
      options = rng;
      rng = undefined;
    }
    const smokeClouds = options && options.smokeClouds ? options.smokeClouds : null;
    const candidates = Array.isArray(playerOrPlayers)
      ? playerOrPlayers.filter((p) => p && p.alive && p.finishedRank === null)
      : [playerOrPlayers];
    let player = candidates[0] || (Array.isArray(playerOrPlayers) ? playerOrPlayers[0] : playerOrPlayers);
    if (candidates.length > 1) {
      let bestScore = Infinity;
      for (const cand of candidates) {
        const d = Math.hypot(cand.x - enemy.x, cand.y - enemy.y);
        const visible = canSeePlayer(enemy, cand, grid, doorsByCoord, diffCfg, smokeClouds);
        const score = visible ? d * 0.45 : d;
        if (score < bestScore) {
          bestScore = score;
          player = cand;
        }
      }
    }

    if (enemy.alertFlashTimer > 0) {
      enemy.alertFlashTimer = Math.max(0, enemy.alertFlashTimer - dt);
    }
    if (enemy.hitCooldownTimer > 0) {
      enemy.hitCooldownTimer = Math.max(0, enemy.hitCooldownTimer - dt);
    }

    const distToPlayer = Math.hypot(player.x - enemy.x, player.y - enemy.y);

    // Stunned enemies are completely immobilized, blind, and harmless until stunTimer expires
    if ((enemy.stunTimer || 0) > 0) {
      enemy.stunTimer = Math.max(0, enemy.stunTimer - dt);
      enemy.telegraphTimer = 0;
      enemy.dashActiveTimer = 0;
      enemy.surgeTimer = 0;
      enemy.sawPlayerLastFrame = false;
      if (enemy.state === ENEMY_STATE.CHASE) {
        enemy.state = ENEMY_STATE.SEARCH;
      }
      return {
        detectedNow: false,
        caughtPlayer: false,
        stepTriggered: false,
        distToPlayer,
        droppedWeb: null,
        bossTelegraphStarted: false,
        bossShockwaveFired: null,
        targetPlayer: player,
      };
    }

    enemy.animPhase += dt * (enemy.state === ENEMY_STATE.CHASE ? 10.5 : 5);

    // Spider dash bursts during chase
    if (enemy.mods && enemy.mods.dashCooldown > 0) {
      if (enemy.dashActiveTimer > 0) {
        enemy.dashActiveTimer = Math.max(0, enemy.dashActiveTimer - dt);
      } else {
        enemy.dashCooldownTimer = Math.max(0, enemy.dashCooldownTimer - dt);
      }
    }

    // Silk web dropping for weaver spiders
    let droppedWeb = null;
    if (enemy.mods && enemy.mods.dropsWeb) {
      enemy.webCooldownTimer -= dt;
      if (enemy.webCooldownTimer <= 0) {
        enemy.webCooldownTimer = enemy.state === ENEMY_STATE.CHASE ? 4.4 : 7.5;
        const wtx = Math.floor(enemy.x);
        const wty = Math.floor(enemy.y);
        if (grid[wty] && grid[wty][wtx] === TILE.FLOOR) {
          droppedWeb = { x: wtx + 0.5, y: wty + 0.5, ttl: 10 };
        }
      }
    }

    // Boss special abilities (Abyssal Warden): telegraphed seismic shockwave & shadow surge
    const bossCfg = cfg.BOSS_CFG || {
      SHOCKWAVE_COOLDOWN: 11.5,
      TELEGRAPH_SEC: 1.25,
      SHOCKWAVE_RADIUS: 3.35,
      SHOCKWAVE_DAMAGE: 20,
      SURGE_COOLDOWN: 14.0,
      SURGE_DURATION: 1.75,
      SURGE_SPEED_MULT: 1.38,
    };
    let bossTelegraphStarted = false;
    let bossShockwaveFired = null;
    if (enemy.isBoss) {
      if ((enemy.telegraphTimer || 0) > 0) {
        enemy.telegraphTimer -= dt;
        if (enemy.telegraphTimer <= 0) {
          enemy.telegraphTimer = 0;
          enemy.shockwaveCooldownTimer = bossCfg.SHOCKWAVE_COOLDOWN;
          bossShockwaveFired = {
            x: enemy.x,
            y: enemy.y,
            radius: bossCfg.SHOCKWAVE_RADIUS,
            damage: bossCfg.SHOCKWAVE_DAMAGE,
          };
        }
      } else {
        enemy.shockwaveCooldownTimer = Math.max(0, (enemy.shockwaveCooldownTimer || 0) - dt);
        if (
          enemy.state === ENEMY_STATE.CHASE &&
          distToPlayer <= bossCfg.SHOCKWAVE_RADIUS + 0.9 &&
          enemy.shockwaveCooldownTimer <= 0 &&
          !isPointInSmoke(enemy.x, enemy.y, smokeClouds)
        ) {
          enemy.telegraphTimer = bossCfg.TELEGRAPH_SEC;
          bossTelegraphStarted = true;
        }
      }

      if ((enemy.surgeTimer || 0) > 0) {
        enemy.surgeTimer = Math.max(0, enemy.surgeTimer - dt);
      } else {
        enemy.surgeCooldownTimer = Math.max(0, (enemy.surgeCooldownTimer || 0) - dt);
        if (
          enemy.state === ENEMY_STATE.CHASE &&
          (enemy.telegraphTimer || 0) <= 0 &&
          enemy.surgeCooldownTimer <= 0 &&
          distToPlayer > 3.0 &&
          distToPlayer < 8.5
        ) {
          enemy.surgeTimer = bossCfg.SURGE_DURATION;
          enemy.surgeCooldownTimer = bossCfg.SURGE_COOLDOWN;
        }
      }
    }

    const sees = canSeePlayer(enemy, player, grid, doorsByCoord, diffCfg, smokeClouds);
    let detectedNow = false;

    if (sees) {
      if (enemy.state !== ENEMY_STATE.CHASE) {
        detectedNow = true;
        enemy.alertFlashTimer = 0.85;
        enemy.pathTimer = 0;
      }
      enemy.state = ENEMY_STATE.CHASE;
      enemy.lastKnownPos = { x: Math.floor(player.x), y: Math.floor(player.y) };
      enemy.searchTimer = diffCfg.enemySearchTime;

      if (
        enemy.mods &&
        enemy.mods.dashCooldown > 0 &&
        enemy.dashCooldownTimer <= 0 &&
        distToPlayer > 2.2 &&
        distToPlayer < 6.5
      ) {
        enemy.dashActiveTimer = 0.85;
        enemy.dashCooldownTimer = enemy.mods.dashCooldown;
      }
    } else {
      const crouchHearMult = player.isCrouching ? cfg.PLAYER_CFG.CROUCH_HEARING_MULT || 0.38 : 1.0;
      const hearMult =
        (player.mods ? player.mods.hearingMult : 1) *
        (player.mods ? player.mods.stealthMult : 1) *
        crouchHearMult;
      const effectiveHear = diffCfg.enemyHearingRange * hearMult;
      if (
        player.alive &&
        !player.hidden &&
        (player.cloakTimer || 0) <= 0 &&
        player.isSprinting &&
        player.isMoving &&
        distToPlayer <= effectiveHear
      ) {
        alertEnemyToPosition(enemy, Math.floor(player.x), Math.floor(player.y));
      }

      if (enemy.state === ENEMY_STATE.CHASE) {
        enemy.state = ENEMY_STATE.SEARCH;
        enemy.searchTimer = diffCfg.enemySearchTime;
      }
    }

    enemy.sawPlayerLastFrame = sees;

    enemy.pathTimer -= dt;
    const eTx = Math.floor(enemy.x);
    const eTy = Math.floor(enemy.y);

    if (enemy.pathTimer <= 0 || enemy.path.length === 0) {
      enemy.pathTimer = diffCfg.enemyPathInterval;
      let goal = null;

      if (enemy.state === ENEMY_STATE.CHASE) {
        let gx = Math.floor(player.x);
        let gy = Math.floor(player.y);
        if (diffCfg.enemyPredict && Math.hypot(player.vx, player.vy) > 0.5) {
          const leadX = Math.floor(player.x + Math.sign(player.vx));
          const leadY = Math.floor(player.y + Math.sign(player.vy));
          if (
            isTileWalkable(grid, leadX, leadY, {
              canPassDoors: false,
              doorsByCoord,
              blockedCoords,
            }) &&
            distToPlayer > 2.2
          ) {
            gx = leadX;
            gy = leadY;
          }
        }
        goal = { x: gx, y: gy };
      } else if (enemy.state === ENEMY_STATE.INVESTIGATE || enemy.state === ENEMY_STATE.SEARCH) {
        if (enemy.lastKnownPos) goal = enemy.lastKnownPos;
      }

      if (!goal && enemy.state === ENEMY_STATE.PATROL) {
        if (
          !enemy.patrolTarget ||
          (enemy.patrolTarget.x === eTx && enemy.patrolTarget.y === eTy)
        ) {
          enemy.patrolTarget = pickPatrolTarget(
            grid,
            enemy.x,
            enemy.y,
            doorsByCoord,
            blockedCoords,
            rng
          );
        }
        goal = enemy.patrolTarget;
      }

      if (goal) {
        const computed = findPath(grid, eTx, eTy, goal.x, goal.y, {
          canPassDoors: false,
          doorsByCoord,
          blockedCoords,
        });
        if (computed.length > 0) {
          enemy.path = computed;
        } else if (enemy.state === ENEMY_STATE.PATROL) {
          enemy.patrolTarget = pickPatrolTarget(
            grid,
            enemy.x,
            enemy.y,
            doorsByCoord,
            blockedCoords,
            rng
          );
        } else if (enemy.state === ENEMY_STATE.INVESTIGATE) {
          enemy.state = ENEMY_STATE.PATROL;
          enemy.lastKnownPos = null;
        }
      }
    }

    if (enemy.state === ENEMY_STATE.SEARCH) {
      enemy.searchTimer -= dt;
      if (
        enemy.lastKnownPos &&
        eTx === enemy.lastKnownPos.x &&
        eTy === enemy.lastKnownPos.y
      ) {
        enemy.lastKnownPos = pickPatrolTarget(
          grid,
          enemy.x,
          enemy.y,
          doorsByCoord,
          blockedCoords,
          rng
        );
        enemy.pathTimer = 0;
      }
      if (enemy.searchTimer <= 0) {
        enemy.state = ENEMY_STATE.PATROL;
        enemy.lastKnownPos = null;
        enemy.patrolTarget = null;
      }
    } else if (enemy.state === ENEMY_STATE.INVESTIGATE) {
      if (
        enemy.lastKnownPos &&
        eTx === enemy.lastKnownPos.x &&
        eTy === enemy.lastKnownPos.y &&
        enemy.path.length === 0
      ) {
        enemy.state = ENEMY_STATE.SEARCH;
        enemy.searchTimer = Math.max(2.5, diffCfg.enemySearchTime * 0.55);
      }
    }

    const baseSpeed =
      enemy.state === ENEMY_STATE.CHASE
        ? diffCfg.enemyChaseSpeed
        : enemy.state === ENEMY_STATE.INVESTIGATE || enemy.state === ENEMY_STATE.SEARCH
        ? diffCfg.enemySpeed * 1.15
        : diffCfg.enemySpeed;

    const dashBoost = enemy.dashActiveTimer > 0 ? 1.32 : 1.0;
    const bossSurgeMult = enemy.surgeTimer > 0 ? bossCfg.SURGE_SPEED_MULT : 1.0;
    const telegraphSlow = enemy.telegraphTimer > 0 ? 0.25 : 1.0;
    const stunSlow = enemy.hitCooldownTimer > 0 ? 0.35 : 1.0;
    const speed =
      baseSpeed *
      (enemy.mods ? enemy.mods.speedMult : 1) *
      dashBoost *
      bossSurgeMult *
      telegraphSlow *
      stunSlow;

    let targetX = enemy.x;
    let targetY = enemy.y;

    if (
      enemy.state === ENEMY_STATE.CHASE &&
      sees &&
      distToPlayer < 2.8 &&
      hasLineOfSight(grid, enemy.x, enemy.y, player.x, player.y, doorsByCoord)
    ) {
      targetX = player.x;
      targetY = player.y;
    } else if (enemy.path.length > 0) {
      const wp = enemy.path[0];
      targetX = wp.x + 0.5;
      targetY = wp.y + 0.5;
      if (Math.hypot(targetX - enemy.x, targetY - enemy.y) < 0.16) {
        enemy.path.shift();
        if (enemy.path.length > 0) {
          targetX = enemy.path[0].x + 0.5;
          targetY = enemy.path[0].y + 0.5;
        }
      }
    }

    const mdx = targetX - enemy.x;
    const mdy = targetY - enemy.y;
    const mDist = Math.hypot(mdx, mdy);
    let stepTriggered = false;

    if (mDist > 0.01) {
      const moveAmt = Math.min(mDist, speed * dt);
      const nx = enemy.x + (mdx / mDist) * moveAmt;
      const ny = enemy.y + (mdy / mDist) * moveAmt;

      const nTx = Math.floor(nx);
      const nTy = Math.floor(ny);
      if (isTileWalkable(grid, nTx, nTy, { canPassDoors: false, doorsByCoord, blockedCoords })) {
        enemy.x = nx;
        enemy.y = ny;
      }

      const desiredAngle = Math.atan2(mdy, mdx);
      enemy.angle += angleDiff(desiredAngle, enemy.angle) * Math.min(1, dt * 10);

      enemy.stepDistAccum += moveAmt;
      const stride = enemy.state === ENEMY_STATE.CHASE ? 0.8 : 0.95;
      if (enemy.stepDistAccum >= stride) {
        enemy.stepDistAccum -= stride;
        stepTriggered = true;
      }
    }

    const caughtPlayer =
      (enemy.stunTimer || 0) <= 0 &&
      (player.cloakTimer || 0) <= 0 &&
      enemy.hitCooldownTimer <= 0 &&
      player.alive &&
      player.hurtTimer <= 0 &&
      !isPointInSmoke(player.x, player.y, smokeClouds) &&
      !isPointInSmoke(enemy.x, enemy.y, smokeClouds) &&
      Math.hypot(player.x - enemy.x, player.y - enemy.y) <= player.radius + enemy.radius - 0.04;

    return {
      detectedNow,
      caughtPlayer,
      stepTriggered,
      distToPlayer,
      droppedWeb,
      bossTelegraphStarted,
      bossShockwaveFired,
      targetPlayer: player,
    };
  }

  return {
    createEnemy,
    isPointInSmoke,
    canSeePlayer,
    alertEnemyToPosition,
    updateEnemy,
  };
});
