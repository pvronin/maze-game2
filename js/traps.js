/**
 * traps.js
 * Trap placement, strict graph-bridge safety verification (guaranteeing collapsing
 * floors and hidden pits never soft-lock key wings or return routes), trap updates,
 * disarming, and trigger logic.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const cfg = require('./config.js');
    const pf = require('./pathfinding.js');
    module.exports = factory(cfg, pf);
  } else {
    root.HorrorMaze = root.HorrorMaze || {};
    Object.assign(root.HorrorMaze, factory(root.HorrorMaze, root.HorrorMaze));
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (cfg, pf) {
  const { TILE, TRAP_TYPE } = cfg;
  const { computeDistancesBFS } = pf;

  /**
   * Counts all walkable cells reachable from `start` when ignoring lock states.
   */
  function countReachableWalkable(grid, start, doorsByCoord, blockedCoords) {
    const dist = computeDistancesBFS(grid, start.x, start.y, {
      canPassDoors: true,
      blockedCoords,
      doorsByCoord,
    });
    let count = 0;
    for (let y = 0; y < dist.length; y++) {
      for (let x = 0; x < dist[y].length; x++) {
        if (dist[y][x] !== -1) count++;
      }
    }
    return { count, dist };
  }

  /**
   * Strict bi-directional bridge / articulation safety check:
   * Checks whether blocking `(tx, ty)` disconnects `start` from ANY target OR
   * turns `(tx, ty)` into a cut-vertex that traps a walkable branch (e.g. a key wing
   * or dead-end return route) behind a collapsed chasm.
   *
   * Requiring `after.count === base.count - 1` guarantees `(tx, ty)` lies on a cycle/loop,
   * so collapsing or falling there NEVER prevents returning to the main labyrinth or Exit!
   */
  function isCriticalBridgeTile(grid, start, targets, tx, ty, doorsByCoord, existingBlocked) {
    const base = countReachableWalkable(grid, start, doorsByCoord, existingBlocked || null);
    const blocked = new Set(existingBlocked ? Array.from(existingBlocked) : []);
    blocked.add(tx + ',' + ty);
    const after = countReachableWalkable(grid, start, doorsByCoord, blocked);

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (after.dist[t.y][t.x] === -1) return true;
    }

    // If any tile other than (tx, ty) became unreachable, (tx, ty) is an articulation point
    return after.count < base.count - 1;
  }

  /**
   * Creates a trap instance object.
   */
  function createTrap(id, type, x, y, hidden, diffCfg) {
    let damage = 0;
    if (type === TRAP_TYPE.SPIKE_TRAP) damage = diffCfg.spikeDamage;
    else if (type === TRAP_TYPE.HIDDEN_PIT) damage = diffCfg.pitDamage;
    else if (type === TRAP_TYPE.PRESSURE_PLATE) damage = diffCfg.plateDamage;

    return {
      id,
      type,
      x,
      y,
      hidden,
      revealed: !hidden,
      triggered: false,
      disarmed: false,
      cooldown: 0,
      damage,
      cycleTimer: (id * 0.73) % 3.2,
      spikesExtended: false,
      collapsing: false,
      collapseTimer: 0,
      collapsed: false,
      flashTimer: 0,
    };
  }

  /**
   * Places balanced, fair traps across valid maze floor cells.
   * Guarantees no trap sits on start(s), exit, keys, doors, alcoves, relics,
   * and collapsing floors / hidden pits never sit on articulation cut-tiles.
   */
  function placeTraps(mazeData, diffCfg, rng, extraReserved) {
    const { grid, start, exit, keys = [], doors = [], doorsByCoord, falsePaths = [], relics = [] } = mazeData;
    const rows = grid.length;
    const cols = grid[0].length;

    const reserved = new Set();
    const starts = Array.isArray(mazeData.spawns) && mazeData.spawns.length > 0 ? mazeData.spawns : [start];
    for (const s of starts) reserved.add(s.x + ',' + s.y);
    reserved.add(exit.x + ',' + exit.y);
    for (const k of keys) reserved.add(k.x + ',' + k.y);
    for (const d of doors) reserved.add(d.x + ',' + d.y);
    for (const r of relics) reserved.add(r.x + ',' + r.y);
    if (extraReserved) {
      for (const c of extraReserved) reserved.add(c);
    }

    const criticalTargets = [exit, ...keys, ...doors, ...starts];

    const candidates = [];
    const falsePathSet = new Set(falsePaths.map((p) => p.x + ',' + p.y));

    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        if (grid[y][x] !== TILE.FLOOR) continue;
        const coord = x + ',' + y;
        if (reserved.has(coord)) continue;

        let nearSpawn = false;
        for (const s of starts) {
          if (Math.abs(x - s.x) + Math.abs(y - s.y) <= 2) {
            nearSpawn = true;
            break;
          }
        }
        if (nearSpawn) continue;

        let adjDoor = false;
        for (const d of doors) {
          if (Math.abs(x - d.x) + Math.abs(y - d.y) <= 1) {
            adjDoor = true;
            break;
          }
        }
        if (adjDoor) continue;

        candidates.push({
          x,
          y,
          isFalsePath: falsePathSet.has(coord),
        });
      }
    }

    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = candidates[i];
      candidates[i] = candidates[j];
      candidates[j] = tmp;
    }
    candidates.sort((a, b) => (b.isFalsePath ? 1 : 0) - (a.isFalsePath ? 1 : 0));

    const traps = [];
    const placedBlockingCoords = new Set();
    const types = [
      TRAP_TYPE.SPIKE_TRAP,
      TRAP_TYPE.HIDDEN_PIT,
      TRAP_TYPE.PRESSURE_PLATE,
      TRAP_TYPE.COLLAPSING_FLOOR,
    ];

    let nextId = 1;
    const trapLimit = diffCfg.trapCount || 12;
    for (let i = 0; i < candidates.length && traps.length < trapLimit; i++) {
      const c = candidates[i];
      let tooClose = false;
      for (const t of traps) {
        if (Math.abs(t.x - c.x) + Math.abs(t.y - c.y) <= 1) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      let type = types[(nextId - 1) % types.length];
      if (type === TRAP_TYPE.COLLAPSING_FLOOR || type === TRAP_TYPE.HIDDEN_PIT) {
        if (isCriticalBridgeTile(grid, start, criticalTargets, c.x, c.y, doorsByCoord, placedBlockingCoords)) {
          type = type === TRAP_TYPE.COLLAPSING_FLOOR ? TRAP_TYPE.SPIKE_TRAP : TRAP_TYPE.PRESSURE_PLATE;
        } else {
          placedBlockingCoords.add(c.x + ',' + c.y);
        }
      }

      const canBeHidden =
        type === TRAP_TYPE.HIDDEN_PIT || type === TRAP_TYPE.PRESSURE_PLATE;
      const hidden = canBeHidden && rng() < (diffCfg.hiddenTrapRatio ?? 0.5);

      const trap = createTrap(nextId++, type, c.x, c.y, hidden, diffCfg);
      traps.push(trap);
    }

    return traps;
  }

  /**
   * Updates all active traps (spike cycles, collapsing floor timers, cooldowns).
   */
  function updateTraps(traps, dt, blockedCoords) {
    const events = [];
    for (let i = 0; i < traps.length; i++) {
      const trap = traps[i];
      if (trap.flashTimer > 0) {
        trap.flashTimer = Math.max(0, trap.flashTimer - dt);
      }
      if (trap.disarmed) continue;

      if (trap.cooldown > 0) {
        trap.cooldown = Math.max(0, trap.cooldown - dt);
      }

      if (trap.type === TRAP_TYPE.SPIKE_TRAP) {
        trap.cycleTimer = (trap.cycleTimer + dt) % 3.2;
        const wasExtended = trap.spikesExtended;
        trap.spikesExtended = trap.cycleTimer >= 2.1;
        if (!wasExtended && trap.spikesExtended) {
          events.push({ type: 'spikes_extend', trap });
        }
      } else if (trap.type === TRAP_TYPE.COLLAPSING_FLOOR && trap.collapsing && !trap.collapsed) {
        trap.collapseTimer -= dt;
        if (trap.collapseTimer <= 0) {
          trap.collapsed = true;
          trap.collapsing = false;
          trap.triggered = true;
          trap.revealed = true;
          blockedCoords.add(trap.x + ',' + trap.y);
          events.push({ type: 'floor_collapsed', trap });
        }
      }
    }
    return events;
  }

  /**
   * Evaluates player stepping onto a trap tile.
   */
  function checkPlayerTrapInteraction(trap, player) {
    if (!trap || trap.disarmed) return null;

    if (trap.type === TRAP_TYPE.COLLAPSING_FLOOR) {
      if (trap.collapsed) return null;
      if (!trap.collapsing) {
        trap.collapsing = true;
        trap.collapseTimer = 0.55;
        trap.revealed = true;
        return {
          event: 'floor_cracking',
          damage: 0,
          alertEnemy: false,
          fatalReason: null,
        };
      }
      return null;
    }

    if (trap.type === TRAP_TYPE.HIDDEN_PIT) {
      if (trap.triggered) return null;
      trap.triggered = true;
      trap.revealed = true;
      trap.hidden = false;
      trap.flashTimer = 0.5;
      return {
        event: 'pit_fall',
        damage: trap.damage,
        alertEnemy: true,
        fatalReason: 'Fell into a concealed chasm',
      };
    }

    if (trap.type === TRAP_TYPE.SPIKE_TRAP) {
      if (trap.cooldown > 0) return null;
      trap.cooldown = 1.6;
      trap.triggered = true;
      trap.spikesExtended = true;
      trap.cycleTimer = 2.2;
      trap.flashTimer = 0.45;
      return {
        event: 'spike_hit',
        damage: trap.damage,
        alertEnemy: false,
        fatalReason: 'Impaled by floor spikes',
      };
    }

    if (trap.type === TRAP_TYPE.PRESSURE_PLATE) {
      if (trap.cooldown > 0) return null;
      trap.cooldown = 3.5;
      trap.triggered = true;
      trap.revealed = true;
      trap.hidden = false;
      trap.flashTimer = 0.5;
      return {
        event: 'plate_triggered',
        damage: trap.damage,
        alertEnemy: true,
        fatalReason: 'Killed by a pressure-plate dart trap',
      };
    }

    return null;
  }

  function canDisarmTrap(trap) {
    if (!trap || trap.disarmed || trap.collapsed) return false;
    if (trap.type === TRAP_TYPE.HIDDEN_PIT && trap.triggered) return false;
    return trap.revealed;
  }

  function disarmTrap(trap) {
    if (!canDisarmTrap(trap)) return false;
    trap.disarmed = true;
    trap.revealed = true;
    trap.hidden = false;
    trap.collapsing = false;
    trap.spikesExtended = false;
    return true;
  }

  return {
    isCriticalBridgeTile,
    createTrap,
    placeTraps,
    updateTraps,
    checkPlayerTrapInteraction,
    canDisarmTrap,
    disarmTrap,
  };
});
