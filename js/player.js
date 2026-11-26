/**
 * player.js
 * Player state, equipped skin/flashlight/gear modifiers, smooth sub-tile wall/door
 * collision with corner sliding, sprint/stamina, silk-web slow, battery, and hiding.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const cfg = require('./config.js');
    const catalog = require('./catalog.js');
    module.exports = factory(cfg, catalog);
  } else {
    root.HorrorMaze = root.HorrorMaze || {};
    Object.assign(root.HorrorMaze, factory(root.HorrorMaze, root.HorrorMaze));
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (cfg, catalog) {
  const { TILE, PLAYER_CFG } = cfg;

  function createPlayer(startTile, diffCfg, loadout) {
    const skin =
      catalog && loadout && loadout.skinId
        ? catalog.getById(catalog.PLAYER_SKINS, loadout.skinId)
        : catalog && catalog.PLAYER_SKINS
        ? catalog.PLAYER_SKINS[0]
        : null;
    const flashlight =
      catalog && loadout && loadout.flashlightId
        ? catalog.getById(catalog.FLASHLIGHTS, loadout.flashlightId)
        : null;
    const gear =
      catalog && loadout && loadout.gearId
        ? catalog.getById(catalog.GEAR_ITEMS, loadout.gearId)
        : null;

    const skinMods = skin
      ? skin.mods
      : { hpMult: 1, speedMult: 1, staminaMult: 1, stealthMult: 1, visionMult: 1 };
    const flMods = flashlight
      ? flashlight.mods
      : { range: 8.8, spreadDeg: 58, drainMult: 1, trapRevealMult: 1 };
    const gearMods = gear
      ? gear.mods
      : {
          hearingMult: 1,
          batteryCapMult: 1,
          disarmBonus: 0,
          regenMult: 1,
          ambientVisionBonus: 0,
          sonarSense: false,
          bonusSmoke: 0,
        };
    const skill = skin && skin.skill ? skin.skill : {
      id: 'map_scan',
      mode: 'active',
      cooldownSec: 60,
      durationSec: 8,
    };

    const maxHp = Math.round((diffCfg.playerMaxHp || 100) * skinMods.hpMult);
    const maxStamina = Math.round(PLAYER_CFG.MAX_STAMINA * skinMods.staminaMult);
    const maxBattery = Math.round(PLAYER_CFG.MAX_BATTERY * gearMods.batteryCapMult);
    const maxSmokeBombs = PLAYER_CFG.MAX_SMOKE_BOMBS;
    const startSmoke = Math.min(
      maxSmokeBombs,
      (PLAYER_CFG.STARTING_SMOKE_BOMBS || 2) + (gearMods.bonusSmoke || 0)
    );

    return {
      x: startTile.x + 0.5,
      y: startTile.y + 0.5,
      vx: 0,
      vy: 0,
      radius: PLAYER_CFG.RADIUS,
      angle: 0,
      hp: maxHp,
      maxHp,
      stamina: maxStamina,
      maxStamina,
      exhaustTimer: 0,
      isSprinting: false,
      isCrouching: false,
      isMoving: false,
      flashlightOn: true,
      battery: maxBattery,
      maxBattery,
      smokeBombs: startSmoke,
      maxSmokeBombs,
      hidden: false,
      hurtTimer: 0,
      webSlowTimer: 0,
      toxicSlowTimer: 0,
      cloakTimer: 0,
      stepDistAccum: 0,
      keysCollected: [],
      relicsCollected: 0,
      trapsDisarmed: 0,
      hidesUsed: 0,
      tookDamage: false,
      alive: true,
      deathReason: '',
      finishedRank: null,

      // Character Skill State
      skillId: skill.id,
      skillMode: skill.mode,
      skillCooldownMax: skill.cooldownSec || 50,
      skillDurationSec: skill.durationSec || 6,
      skillCooldownTimer: 0,
      skillActiveTimer: 0,
      smokeCraftTimer: skill.id === 'alchemical_immunity' ? skill.cooldownSec || 45 : 0,
      toxicImmune: skill.id === 'alchemical_immunity',

      // Customization & Modifiers
      skinId: skin ? skin.id : 'explorer',
      flashlightId: flashlight ? flashlight.id : 'standard',
      gearId: gear ? gear.id : 'none',
      mods: {
        speedMult: skinMods.speedMult,
        stealthMult: skinMods.stealthMult,
        visionMult: skinMods.visionMult || 1,
        hearingMult: gearMods.hearingMult,
        regenMult: gearMods.regenMult,
        disarmBonus: gearMods.disarmBonus,
        ambientVisionBonus: gearMods.ambientVisionBonus || 0,
        sonarSense: Boolean(gearMods.sonarSense),
        lightRange: flMods.range,
        lightSpreadRad: (flMods.spreadDeg * Math.PI) / 180,
        lightDrainMult: flMods.drainMult,
        trapRevealMult: flMods.trapRevealMult,
      },
    };
  }

  function toggleCrouch(player) {
    if (!player || !player.alive) return false;
    player.isCrouching = !player.isCrouching;
    if (player.isCrouching) {
      player.isSprinting = false;
    }
    return player.isCrouching;
  }

  function triggerPassiveAutoCloak(player) {
    if (!player || !player.alive) return false;
    if (player.skillId !== 'auto_cloak') return false;
    if ((player.skillCooldownTimer || 0) > 0 || (player.cloakTimer || 0) > 0) return false;
    player.cloakTimer = player.skillDurationSec || 5;
    player.skillActiveTimer = player.cloakTimer;
    player.skillCooldownTimer = player.skillCooldownMax || 40;
    return true;
  }

  function activatePlayerSkill(player, enemies) {
    if (!player || !player.alive) return { activated: false, reason: 'dead' };
    if (player.skillMode !== 'active') return { activated: false, reason: 'passive' };
    if ((player.skillCooldownTimer || 0) > 0) {
      return { activated: false, reason: 'cooldown', remaining: player.skillCooldownTimer };
    }

    if (player.skillId === 'map_scan') {
      const dur = player.skillDurationSec || 8;
      player.skillActiveTimer = dur;
      player.skillCooldownTimer = player.skillCooldownMax || 60;
      return { activated: true, skillId: 'map_scan', fullMapRevealSec: dur };
    }

    if (player.skillId === 'adrenaline_rush') {
      const dur = player.skillDurationSec || 6.5;
      player.skillActiveTimer = dur;
      player.skillCooldownTimer = player.skillCooldownMax || 32;
      player.stamina = player.maxStamina;
      player.exhaustTimer = 0;
      return { activated: true, skillId: 'adrenaline_rush', durationSec: dur };
    }

    if (player.skillId === 'shock_stun') {
      const stunRange = 6.2;
      const baseStunSec = player.skillDurationSec || 20;
      const bossMult = cfg.BOSS_CFG ? cfg.BOSS_CFG.STUN_DURATION_MULT : 0.8;
      const list = Array.isArray(enemies) ? enemies : enemies ? [enemies] : [];
      let stunnedCount = 0;
      for (let i = 0; i < list.length; i++) {
        const en = list[i];
        if (!en) continue;
        const d = Math.hypot(en.x - player.x, en.y - player.y);
        if (d <= stunRange) {
          const stunDur = en.isBoss ? Math.round(baseStunSec * bossMult) : baseStunSec;
          en.stunTimer = Math.max(en.stunTimer || 0, stunDur);
          en.telegraphTimer = 0;
          en.dashActiveTimer = 0;
          en.surgeTimer = 0;
          stunnedCount++;
        }
      }
      player.skillActiveTimer = 0.7;
      player.skillCooldownTimer =
        stunnedCount > 0 ? player.skillCooldownMax || 50 : Math.min(8, player.skillCooldownMax || 50);
      return {
        activated: true,
        skillId: 'shock_stun',
        stunnedCount,
        range: stunRange,
      };
    }

    return { activated: false, reason: 'unknown' };
  }

  function isSolidForActor(grid, tx, ty, doorsByCoord, blockedCoords) {
    const rows = grid.length;
    const cols = grid[0].length;
    if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) return true;
    const tile = grid[ty][tx];
    if (tile === TILE.WALL) return true;
    if (tile === TILE.DOOR) {
      const door = doorsByCoord && doorsByCoord.get(tx + ',' + ty);
      if (!door || !door.unlocked) return true;
    }
    if (blockedCoords && blockedCoords.has(tx + ',' + ty)) return true;
    return false;
  }

  function collidesWithMaze(grid, cx, cy, radius, doorsByCoord, blockedCoords) {
    const minTx = Math.floor(cx - radius);
    const maxTx = Math.floor(cx + radius);
    const minTy = Math.floor(cy - radius);
    const maxTy = Math.floor(cy + radius);

    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        if (!isSolidForActor(grid, tx, ty, doorsByCoord, blockedCoords)) continue;
        const closestX = Math.max(tx, Math.min(cx, tx + 1));
        const closestY = Math.max(ty, Math.min(cy, ty + 1));
        const dx = cx - closestX;
        const dy = cy - closestY;
        if (dx * dx + dy * dy < radius * radius) {
          return true;
        }
      }
    }
    return false;
  }

  function moveWithCollision(grid, entity, dx, dy, doorsByCoord, blockedCoords) {
    const r = entity.radius;
    let moved = false;

    if (dx !== 0) {
      const nextX = entity.x + dx;
      if (!collidesWithMaze(grid, nextX, entity.y, r, doorsByCoord, blockedCoords)) {
        entity.x = nextX;
        moved = true;
      } else {
        const tileCenterY = Math.floor(entity.y) + 0.5;
        const offset = tileCenterY - entity.y;
        if (Math.abs(offset) > 0.04) {
          const nudge = Math.sign(offset) * Math.min(Math.abs(dx) * 0.75, Math.abs(offset));
          if (!collidesWithMaze(grid, nextX, entity.y + nudge, r, doorsByCoord, blockedCoords)) {
            entity.x = nextX;
            entity.y += nudge;
            moved = true;
          }
        }
      }
    }

    if (dy !== 0) {
      const nextY = entity.y + dy;
      if (!collidesWithMaze(grid, entity.x, nextY, r, doorsByCoord, blockedCoords)) {
        entity.y = nextY;
        moved = true;
      } else {
        const tileCenterX = Math.floor(entity.x) + 0.5;
        const offset = tileCenterX - entity.x;
        if (Math.abs(offset) > 0.04) {
          const nudge = Math.sign(offset) * Math.min(Math.abs(dy) * 0.75, Math.abs(offset));
          if (!collidesWithMaze(grid, entity.x + nudge, nextY, r, doorsByCoord, blockedCoords)) {
            entity.y = nextY;
            entity.x += nudge;
            moved = true;
          }
        }
      }
    }

    return moved;
  }

  function updatePlayer(player, input, grid, doorsByCoord, blockedCoords, dt) {
    if (!player.alive) {
      return { stepTriggered: false, isQuietStep: false, batteryEmpty: false, brewedSmoke: false };
    }

    if (player.hurtTimer > 0) {
      player.hurtTimer = Math.max(0, player.hurtTimer - dt);
    }
    if (player.webSlowTimer > 0) {
      player.webSlowTimer = Math.max(0, player.webSlowTimer - dt);
    }
    if (player.toxicSlowTimer > 0) {
      player.toxicSlowTimer = Math.max(0, player.toxicSlowTimer - dt);
    }
    if (player.cloakTimer > 0) {
      player.cloakTimer = Math.max(0, player.cloakTimer - dt);
    }
    if (player.skillCooldownTimer > 0) {
      player.skillCooldownTimer = Math.max(0, player.skillCooldownTimer - dt);
    }
    if (player.skillActiveTimer > 0) {
      player.skillActiveTimer = Math.max(0, player.skillActiveTimer - dt);
    }

    // Passive Doctor (Plague Alchemist): passive health regeneration & periodic smoke bomb crafting
    let brewedSmoke = false;
    if (player.skillId === 'alchemical_immunity') {
      if (player.hurtTimer <= 0 && player.hp < player.maxHp) {
        player.hp = Math.min(player.maxHp, player.hp + 2.5 * dt);
      }
      if ((player.smokeBombs || 0) < (player.maxSmokeBombs || 4)) {
        player.smokeCraftTimer -= dt;
        if (player.smokeCraftTimer <= 0) {
          player.smokeCraftTimer = player.skillCooldownMax || 45;
          player.smokeBombs = Math.min(player.maxSmokeBombs || 4, (player.smokeBombs || 0) + 1);
          brewedSmoke = true;
        }
      }
    }

    let ix = input.moveX || 0;
    let iy = input.moveY || 0;
    const len = Math.hypot(ix, iy);
    if (len > 0) {
      ix /= len;
      iy /= len;
    }

    const wantsMove = len > 0.05;
    if (wantsMove && player.hidden) {
      const curTile = grid[Math.floor(player.y)] && grid[Math.floor(player.y)][Math.floor(player.x)];
      if (curTile !== TILE.ALCOVE) {
        player.hidden = false;
      }
    }

    const isOverdrive = player.skillId === 'adrenaline_rush' && player.skillActiveTimer > 0;
    const canSprint = isOverdrive || (!player.hidden && player.exhaustTimer <= 0 && player.stamina > 1);
    player.isSprinting = Boolean(wantsMove && input.sprint && canSprint);
    if (player.isSprinting && player.isCrouching) {
      player.isCrouching = false;
    }

    if (player.exhaustTimer > 0) {
      player.exhaustTimer = Math.max(0, player.exhaustTimer - dt);
    }

    const regenMult = player.mods ? player.mods.regenMult : 1;
    if (isOverdrive) {
      player.stamina = player.maxStamina;
    } else if (player.isSprinting) {
      player.stamina = Math.max(0, player.stamina - PLAYER_CFG.STAMINA_DRAIN_PER_SEC * dt);
      if (player.stamina <= 0) {
        player.exhaustTimer = PLAYER_CFG.STAMINA_EXHAUST_DELAY;
        player.isSprinting = false;
      }
    } else if (player.exhaustTimer <= 0) {
      player.stamina = Math.min(
        player.maxStamina,
        player.stamina + PLAYER_CFG.STAMINA_REGEN_PER_SEC * regenMult * dt
      );
    }

    // Flashlight Battery
    let batteryEmpty = false;
    const drainMult = player.mods ? player.mods.lightDrainMult : 1;
    if (player.flashlightOn) {
      player.battery = Math.max(0, player.battery - PLAYER_CFG.BATTERY_DRAIN_PER_SEC * drainMult * dt);
      if (player.battery <= 0) {
        player.flashlightOn = false;
        batteryEmpty = true;
      }
    } else {
      player.battery = Math.min(
        player.maxBattery,
        player.battery + PLAYER_CFG.BATTERY_RECHARGE_PER_SEC * dt
      );
    }

    const baseSpeed = player.isSprinting
      ? PLAYER_CFG.SPRINT_SPEED
      : player.isCrouching
      ? PLAYER_CFG.WALK_SPEED * (PLAYER_CFG.CROUCH_SPEED_MULT || 0.38)
      : PLAYER_CFG.WALK_SPEED;
    const speedMult = player.mods ? player.mods.speedMult : 1;
    const overdriveMult = isOverdrive ? 1.38 : 1.0;
    const webMult = player.webSlowTimer > 0 ? PLAYER_CFG.SILK_SLOW_MULT : 1;
    const toxicMult = player.toxicSlowTimer > 0 && !player.toxicImmune ? 0.68 : 1;
    const speed = baseSpeed * speedMult * overdriveMult * webMult * toxicMult;

    const prevX = player.x;
    const prevY = player.y;

    if (wantsMove) {
      moveWithCollision(grid, player, ix * speed * dt, iy * speed * dt, doorsByCoord, blockedCoords);
    }

    const movedDist = Math.hypot(player.x - prevX, player.y - prevY);
    player.vx = dt > 0 ? (player.x - prevX) / dt : 0;
    player.vy = dt > 0 ? (player.y - prevY) / dt : 0;
    player.isMoving = movedDist > 0.001;

    if (player.hidden) {
      const tx = Math.floor(player.x);
      const ty = Math.floor(player.y);
      if (!grid[ty] || grid[ty][tx] !== TILE.ALCOVE) {
        player.hidden = false;
      }
    }

    if (typeof input.aimAngle === 'number') {
      player.angle = input.aimAngle;
    } else if (wantsMove) {
      const targetAngle = Math.atan2(iy, ix);
      let diff = targetAngle - player.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      player.angle += diff * Math.min(1, dt * 14);
    }

    let stepTriggered = false;
    if (player.isMoving && !player.hidden) {
      player.stepDistAccum += movedDist;
      const stepStride = player.isSprinting ? 0.85 : player.isCrouching ? 1.05 : 0.72;
      if (player.stepDistAccum >= stepStride) {
        player.stepDistAccum -= stepStride;
        stepTriggered = true;
      }
    }

    return {
      stepTriggered,
      isQuietStep: Boolean(player.isCrouching),
      batteryEmpty,
      brewedSmoke,
    };
  }

  function damagePlayer(player, amount, reason) {
    if (!player.alive || player.hurtTimer > 0 || amount <= 0) {
      return { tookDamage: false, died: false };
    }
    player.tookDamage = true;
    player.hp = Math.max(0, player.hp - amount);
    player.hurtTimer = PLAYER_CFG.HURT_INVULN_SEC;
    if (player.hp <= 0) {
      player.alive = false;
      player.deathReason = reason || 'Succumbed to your wounds';
      return { tookDamage: true, died: true };
    }
    return { tookDamage: true, died: false };
  }

  return {
    createPlayer,
    toggleCrouch,
    activatePlayerSkill,
    triggerPassiveAutoCloak,
    isSolidForActor,
    collidesWithMaze,
    moveWithCollision,
    updatePlayer,
    damagePlayer,
  };
});
