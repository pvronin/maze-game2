/**
 * maze.js
 * Procedural Horror Maze Generator:
 *  - Single-player progressive labyrinths (Keys -> Doors -> Exit, Alcoves, Relics, Traps)
 *  - Multiplayer square labyrinths (2–4 corners racing to shared Center Sanctuary)
 *  - Strict BFS solvability verifier (verifyMazeSolvable & verifyMultiplayerSolvable)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const cfg = require('./config.js');
    const pf = require('./pathfinding.js');
    const traps = require('./traps.js');
    const catalog = require('./catalog.js');
    module.exports = factory(cfg, pf, traps, catalog);
  } else {
    root.HorrorMaze = root.HorrorMaze || {};
    Object.assign(
      root.HorrorMaze,
      factory(root.HorrorMaze, root.HorrorMaze, root.HorrorMaze, root.HorrorMaze)
    );
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (cfg, pf, trapsMod, catalog) {
  const { TILE, KEY_DEFS, DIFFICULTIES, MP_CONFIG } = cfg;
  const { DIRS_4, computeDistancesBFS } = pf;

  function createRng(seed) {
    if (typeof seed !== 'number') {
      return Math.random;
    }
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function countFloorNeighbors(grid, x, y) {
    let count = 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DIRS_4[d].dx;
      const ny = y + DIRS_4[d].dy;
      if (grid[ny] && grid[ny][nx] !== TILE.WALL) count++;
    }
    return count;
  }

  function verifyMazeSolvable(mazeData) {
    const { grid, start, exit, keys, doors, traps } = mazeData;
    const blocked = new Set();
    if (traps) {
      for (const t of traps) {
        if (t.collapsed) blocked.add(t.x + ',' + t.y);
      }
    }

    const simDoors = new Map();
    for (const d of doors) {
      simDoors.set(d.x + ',' + d.y, { ...d, unlocked: false });
    }

    const collectedKeys = new Set();
    let progress = true;
    let reachedExit = false;

    while (progress) {
      progress = false;
      const dist = computeDistancesBFS(grid, start.x, start.y, {
        canPassDoors: false,
        doorsByCoord: simDoors,
        blockedCoords: blocked,
      });

      if (dist[exit.y][exit.x] !== -1) {
        reachedExit = true;
      }

      for (const k of keys) {
        if (!collectedKeys.has(k.keyIndex) && dist[k.y][k.x] !== -1) {
          collectedKeys.add(k.keyIndex);
          progress = true;
        }
      }

      for (const [, door] of simDoors) {
        if (!door.unlocked && collectedKeys.has(door.keyIndex)) {
          for (let i = 0; i < 4; i++) {
            const ax = door.x + DIRS_4[i].dx;
            const ay = door.y + DIRS_4[i].dy;
            if (dist[ay] && dist[ay][ax] !== -1) {
              door.unlocked = true;
              progress = true;
              break;
            }
          }
        }
      }
    }

    const initialDist = computeDistancesBFS(grid, start.x, start.y, {
      canPassDoors: false,
      doorsByCoord: new Map(doors.map((d) => [d.x + ',' + d.y, { ...d, unlocked: false }])),
      blockedCoords: blocked,
    });
    const enemyReachable =
      mazeData.enemySpawn &&
      initialDist[mazeData.enemySpawn.y] &&
      initialDist[mazeData.enemySpawn.y][mazeData.enemySpawn.x] !== -1;

    return (
      reachedExit &&
      collectedKeys.size === keys.length &&
      Array.from(simDoors.values()).every((d) => d.unlocked) &&
      Boolean(enemyReachable)
    );
  }

  function buildMazeCandidate(diffCfg, rng, mapTheme) {
    const cols = diffCfg.cols;
    const rows = diffCfg.rows;
    const grid = Array.from({ length: rows }, () => new Array(cols).fill(TILE.WALL));

    const start = { x: 1, y: 1 };
    grid[start.y][start.x] = TILE.FLOOR;

    // 1. Randomized DFS spanning-tree carving
    const stack = [{ x: start.x, y: start.y }];
    while (stack.length > 0) {
      const cur = stack[stack.length - 1];
      const dirs = shuffle(
        [
          { dx: 0, dy: -2 },
          { dx: 2, dy: 0 },
          { dx: 0, dy: 2 },
          { dx: -2, dy: 0 },
        ],
        rng
      );
      let carved = false;
      for (const d of dirs) {
        const nx = cur.x + d.dx;
        const ny = cur.y + d.dy;
        if (nx > 0 && ny > 0 && nx < cols - 1 && ny < rows - 1 && grid[ny][nx] === TILE.WALL) {
          grid[cur.y + d.dy / 2][cur.x + d.dx / 2] = TILE.FLOOR;
          grid[ny][nx] = TILE.FLOOR;
          stack.push({ x: nx, y: ny });
          carved = true;
          break;
        }
      }
      if (!carved) stack.pop();
    }

    if (grid[1][2] === TILE.WALL && grid[2][1] === TILE.WALL) {
      grid[1][2] = TILE.FLOOR;
    }

    // 2. BFS parent tree
    const parentMap = new Map();
    const dist = Array.from({ length: rows }, () => new Int32Array(cols).fill(-1));
    const queue = [start];
    dist[start.y][start.x] = 0;
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      for (let d = 0; d < 4; d++) {
        const nx = cur.x + DIRS_4[d].dx;
        const ny = cur.y + DIRS_4[d].dy;
        if (grid[ny][nx] !== TILE.WALL && dist[ny][nx] === -1) {
          dist[ny][nx] = dist[cur.y][cur.x] + 1;
          parentMap.set(nx + ',' + ny, cur);
          queue.push({ x: nx, y: ny });
        }
      }
    }

    const minExitManhattan = Math.floor((cols + rows) * 0.42);
    let exit = null;
    let bestExitScore = -1;
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        if (grid[y][x] !== TILE.FLOOR) continue;
        if (x === start.x && y === start.y) continue;
        if (countFloorNeighbors(grid, x, y) !== 1) continue;
        const manhattan = Math.abs(x - start.x) + Math.abs(y - start.y);
        if (manhattan < minExitManhattan) continue;
        const score = dist[y][x] + manhattan * 1.5;
        if (score > bestExitScore) {
          bestExitScore = score;
          exit = { x, y };
        }
      }
    }
    if (!exit) return null;

    const spineSet = new Set();
    let curSpine = exit;
    while (curSpine) {
      spineSet.add(curSpine.x + ',' + curSpine.y);
      curSpine = parentMap.get(curSpine.x + ',' + curSpine.y) || null;
    }

    const exitParent = parentMap.get(exit.x + ',' + exit.y);
    if (!exitParent || (exitParent.x === start.x && exitParent.y === start.y)) return null;
    const finalDoorCoord = exitParent.x + ',' + exitParent.y;

    const childrenMap = new Map();
    for (const [childKey, p] of parentMap) {
      const pKey = p.x + ',' + p.y;
      if (!childrenMap.has(pKey)) childrenMap.set(pKey, []);
      const [cx, cy] = childKey.split(',').map(Number);
      childrenMap.get(pKey).push({ x: cx, y: cy });
    }

    function collectSubtree(rootCell) {
      const nodes = [];
      const q = [rootCell];
      let h = 0;
      while (h < q.length) {
        const n = q[h++];
        nodes.push(n);
        const ch = childrenMap.get(n.x + ',' + n.y) || [];
        for (const c of ch) q.push(c);
      }
      return nodes;
    }

    const wingCandidates = [];
    for (const coord of spineSet) {
      if (coord === exit.x + ',' + exit.y || coord === finalDoorCoord) continue;
      const children = childrenMap.get(coord) || [];
      for (const ch of children) {
        const chCoord = ch.x + ',' + ch.y;
        if (spineSet.has(chCoord)) continue;
        const nodes = collectSubtree(ch);
        if (nodes.length >= 3) {
          wingCandidates.push({
            doorTile: ch,
            interior: nodes.slice(1),
            size: nodes.length,
          });
        }
      }
    }

    const neededWings = diffCfg.keyCount - 1;
    if (wingCandidates.length < neededWings) {
      for (const w of [...wingCandidates]) {
        const subCh = childrenMap.get(w.doorTile.x + ',' + w.doorTile.y) || [];
        for (const sc of subCh) {
          const nodes = collectSubtree(sc);
          if (nodes.length >= 3) {
            wingCandidates.push({
              doorTile: sc,
              interior: nodes.slice(1),
              size: nodes.length,
            });
          }
        }
      }
    }

    wingCandidates.sort((a, b) => Math.abs(a.size - 6) - Math.abs(b.size - 6));

    const chosenWings = [];
    const protectedCoords = new Set([
      start.x + ',' + start.y,
      exit.x + ',' + exit.y,
      finalDoorCoord,
    ]);

    for (const w of wingCandidates) {
      if (chosenWings.length >= neededWings) break;
      const allWingTiles = [w.doorTile, ...w.interior];
      let overlaps = false;
      for (const t of allWingTiles) {
        if (protectedCoords.has(t.x + ',' + t.y)) {
          overlaps = true;
          break;
        }
      }
      if (overlaps) continue;
      chosenWings.push(w);
      for (const t of allWingTiles) {
        protectedCoords.add(t.x + ',' + t.y);
      }
    }

    if (chosenWings.length < neededWings) return null;

    // 4. Braid dead-ends inside open main region
    const effectiveBraid = Math.max(
      0.16,
      Math.min(0.48, diffCfg.braidFactor + (mapTheme ? mapTheme.braidBonus || 0 : 0))
    );
    const sealedOrProtected = new Set(protectedCoords);
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        if (grid[y][x] !== TILE.FLOOR) continue;
        const coord = x + ',' + y;
        if (sealedOrProtected.has(coord)) continue;
        if (countFloorNeighbors(grid, x, y) !== 1) continue;
        if (rng() > effectiveBraid) continue;

        const candidates = [];
        for (let d = 0; d < 4; d++) {
          const wx = x + DIRS_4[d].dx;
          const wy = y + DIRS_4[d].dy;
          const nx = x + DIRS_4[d].dx * 2;
          const ny = y + DIRS_4[d].dy * 2;
          if (nx <= 0 || ny <= 0 || nx >= cols - 1 || ny >= rows - 1) continue;
          if (grid[wy][wx] !== TILE.WALL || grid[ny][nx] !== TILE.FLOOR) continue;
          if (sealedOrProtected.has(nx + ',' + ny)) continue;
          candidates.push({ wx, wy });
        }
        if (candidates.length > 0) {
          const pick = candidates[Math.floor(rng() * candidates.length)];
          grid[pick.wy][pick.wx] = TILE.FLOOR;
        }
      }
    }

    // 5. Place Exit & Locked Doors
    grid[exit.y][exit.x] = TILE.EXIT;

    const doors = [];
    const doorsByCoord = new Map();

    for (let i = 0; i < chosenWings.length; i++) {
      const w = chosenWings[i];
      grid[w.doorTile.y][w.doorTile.x] = TILE.DOOR;
      const keyDef = KEY_DEFS[i % KEY_DEFS.length];
      const door = {
        x: w.doorTile.x,
        y: w.doorTile.y,
        keyIndex: i,
        name: keyDef.doorName,
        faName: keyDef.faDoorName,
        color: keyDef.color,
        unlocked: false,
        openAnim: 0,
      };
      doors.push(door);
      doorsByCoord.set(door.x + ',' + door.y, door);
    }

    const finalIdx = diffCfg.keyCount - 1;
    const finalKeyDef = KEY_DEFS[finalIdx % KEY_DEFS.length];
    grid[exitParent.y][exitParent.x] = TILE.DOOR;
    const finalDoor = {
      x: exitParent.x,
      y: exitParent.y,
      keyIndex: finalIdx,
      name: finalKeyDef.doorName,
      faName: finalKeyDef.faDoorName,
      color: finalKeyDef.color,
      unlocked: false,
      openAnim: 0,
    };
    doors.push(finalDoor);
    doorsByCoord.set(finalDoor.x + ',' + finalDoor.y, finalDoor);

    const openDist = computeDistancesBFS(grid, start.x, start.y, {
      canPassDoors: false,
      doorsByCoord,
    });

    const openCells = [];
    let maxOpenDist = 0;
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        if (grid[y][x] === TILE.FLOOR && openDist[y][x] > 0) {
          openCells.push({ x, y, dist: openDist[y][x] });
          if (openDist[y][x] > maxOpenDist) maxOpenDist = openDist[y][x];
        }
      }
    }
    if (openCells.length < 12) return null;

    const key0Pool = openCells.filter((c) => c.dist >= Math.max(5, Math.floor(maxOpenDist * 0.38)));
    const key0Pick =
      key0Pool.length > 0
        ? key0Pool[Math.floor(rng() * key0Pool.length)]
        : openCells[openCells.length - 1];

    const keys = [];
    const k0Def = KEY_DEFS[0];
    keys.push({
      x: key0Pick.x,
      y: key0Pick.y,
      keyIndex: 0,
      name: k0Def.name,
      faName: k0Def.faName,
      color: k0Def.color,
      glow: k0Def.glow,
      collected: false,
    });

    for (let i = 0; i < chosenWings.length; i++) {
      const interior = chosenWings[i].interior;
      interior.sort((a, b) => dist[b.y][b.x] - dist[a.y][a.x]);
      const spot = interior[0];
      const def = KEY_DEFS[(i + 1) % KEY_DEFS.length];
      keys.push({
        x: spot.x,
        y: spot.y,
        keyIndex: i + 1,
        name: def.name,
        faName: def.faName,
        color: def.color,
        glow: def.glow,
        collected: false,
      });
    }

    // 7. Hiding Alcoves
    const key0Coord = key0Pick.x + ',' + key0Pick.y;
    const alcoveCandidates = [];
    for (const c of openCells) {
      const coord = c.x + ',' + c.y;
      if (coord === key0Coord) continue;
      if (c.dist < 3) continue;
      if (countFloorNeighbors(grid, c.x, c.y) === 1) {
        alcoveCandidates.push(c);
      }
    }
    shuffle(alcoveCandidates, rng);

    const alcoves = [];
    for (const ac of alcoveCandidates) {
      if (alcoves.length >= diffCfg.alcoveCount) break;
      let nearOther = false;
      for (const existing of alcoves) {
        if (Math.abs(existing.x - ac.x) + Math.abs(existing.y - ac.y) < 4) {
          nearOther = true;
          break;
        }
      }
      if (nearOther) continue;
      grid[ac.y][ac.x] = TILE.ALCOVE;
      alcoves.push({ x: ac.x, y: ac.y });
    }

    // 8. False Paths & Hidden Ancient Relics
    const alcoveSet = new Set(alcoves.map((a) => a.x + ',' + a.y));
    const falsePaths = [];
    for (const c of openCells) {
      const coord = c.x + ',' + c.y;
      if (coord === key0Coord || alcoveSet.has(coord)) continue;
      if (c.dist >= 4 && countFloorNeighbors(grid, c.x, c.y) === 1) {
        falsePaths.push({ x: c.x, y: c.y });
      }
    }

    // 9. Enemy Spawn
    const minEnemyDist = Math.max(8, Math.floor((cols + rows) * 0.42));
    const enemyPool = openCells.filter(
      (c) =>
        grid[c.y][c.x] === TILE.FLOOR &&
        c.dist >= minEnemyDist &&
        c.x + ',' + c.y !== key0Coord
    );
    let enemySpawn = null;
    if (enemyPool.length > 0) {
      enemySpawn = enemyPool[Math.floor(rng() * enemyPool.length)];
    } else {
      const sorted = openCells
        .filter((c) => grid[c.y][c.x] === TILE.FLOOR)
        .sort((a, b) => b.dist - a.dist);
      enemySpawn = sorted[0];
    }
    if (!enemySpawn) return null;

    // 10. Relics & Pickups (Batteries & Medkits)
    const occupied = new Set([
      start.x + ',' + start.y,
      exit.x + ',' + exit.y,
      enemySpawn.x + ',' + enemySpawn.y,
      ...keys.map((k) => k.x + ',' + k.y),
      ...doors.map((d) => d.x + ',' + d.y),
      ...alcoves.map((a) => a.x + ',' + a.y),
    ]);

    const relics = [];
    const relicCount = diffCfg.relicCount || 1;
    const relicPool = shuffle(
      [...falsePaths, ...openCells.filter((c) => c.dist >= 6 && grid[c.y][c.x] === TILE.FLOOR)],
      rng
    );
    for (const rp of relicPool) {
      if (relics.length >= relicCount) break;
      const coord = rp.x + ',' + rp.y;
      if (occupied.has(coord)) continue;
      relics.push({ x: rp.x, y: rp.y, collected: false });
      occupied.add(coord);
    }

    const pickupPool = openCells.filter(
      (c) =>
        grid[c.y][c.x] === TILE.FLOOR &&
        c.dist >= 4 &&
        !occupied.has(c.x + ',' + c.y)
    );
    shuffle(pickupPool, rng);

    const pickups = [];
    let pIdx = 0;
    for (let i = 0; i < diffCfg.batteryCount && pIdx < pickupPool.length; i++, pIdx++) {
      const pt = pickupPool[pIdx];
      pickups.push({ x: pt.x, y: pt.y, type: 'battery', collected: false });
      occupied.add(pt.x + ',' + pt.y);
    }
    for (let i = 0; i < diffCfg.medkitCount && pIdx < pickupPool.length; i++, pIdx++) {
      const pt = pickupPool[pIdx];
      pickups.push({ x: pt.x, y: pt.y, type: 'medkit', collected: false });
      occupied.add(pt.x + ',' + pt.y);
    }
    const smokePickupCount = diffCfg.smokeCount || 2;
    for (let i = 0; i < smokePickupCount && pIdx < pickupPool.length; i++, pIdx++) {
      const pt = pickupPool[pIdx];
      pickups.push({ x: pt.x, y: pt.y, type: 'smoke', collected: false });
      occupied.add(pt.x + ',' + pt.y);
    }

    const extraEnemySpawns = [];
    const extraNeeded = diffCfg.extraEnemies || 0;
    if (extraNeeded > 0) {
      const extraPool = openCells
        .filter(
          (c) =>
            grid[c.y][c.x] === TILE.FLOOR &&
            c.dist >= 8 &&
            Math.hypot(c.x - enemySpawn.x, c.y - enemySpawn.y) >= 4 &&
            c.x + ',' + c.y !== key0Coord
        )
        .sort((a, b) => b.dist - a.dist);
      for (let i = 0; i < extraNeeded && i < extraPool.length; i++) {
        extraEnemySpawns.push({ x: extraPool[i].x, y: extraPool[i].y });
      }
    }

    const mazeData = {
      cols,
      rows,
      grid,
      start,
      exit,
      keys,
      doors,
      doorsByCoord,
      alcoves,
      falsePaths,
      relics,
      pickups,
      enemySpawn: { x: enemySpawn.x, y: enemySpawn.y },
      extraEnemySpawns,
      traps: [],
    };

    mazeData.traps = trapsMod.placeTraps(mazeData, diffCfg, rng);
    const trapCoords = new Set(mazeData.traps.map((t) => t.x + ',' + t.y));
    mazeData.pickups = mazeData.pickups.filter((p) => !trapCoords.has(p.x + ',' + p.y));

    if (!verifyMazeSolvable(mazeData)) return null;
    return mazeData;
  }

  function generateMaze(difficultyId, seed, options) {
    const stageNum = options && options.stage ? options.stage : 1;
    const diffCfg =
      typeof cfg.getStageDifficultyConfig === 'function'
        ? cfg.getStageDifficultyConfig(difficultyId, stageNum)
        : DIFFICULTIES[difficultyId] || DIFFICULTIES.normal;
    const baseSeed = typeof seed === 'number' ? seed : Math.floor(Math.random() * 1e9);
    const mapId = options && options.mapId ? options.mapId : 'crypt';
    const mapTheme = catalog ? catalog.getById(catalog.MAP_THEMES, mapId) : null;

    for (let attempt = 0; attempt < 30; attempt++) {
      const rng = createRng(baseSeed + attempt * 7919);
      const candidate = buildMazeCandidate(diffCfg, rng, mapTheme);
      if (candidate) {
        candidate.difficulty = diffCfg;
        candidate.stage = stageNum;
        candidate.seed = baseSeed + attempt * 7919;
        candidate.mapId = mapId;
        return candidate;
      }
    }

    throw new Error('Failed to generate solvable maze after 30 attempts');
  }

  /**
   * Generates a square Multiplayer maze where 2–4 players spawn in outer corners
   * and race through traps, braided loops, and optional creatures to the Center Sanctuary.
   */
  function generateMultiplayerMaze(playerCount, mapId, seed) {
    const count = Math.max(2, Math.min(4, Number(playerCount) || 2));
    const size = MP_CONFIG.SIZES[count] || 29;
    const baseSeed = typeof seed === 'number' ? seed : Math.floor(Math.random() * 1e9);
    const mapTheme = catalog ? catalog.getById(catalog.MAP_THEMES, mapId || 'crypt') : null;

    for (let attempt = 0; attempt < 15; attempt++) {
      const rng = createRng(baseSeed + attempt * 4999);
      const grid = Array.from({ length: size }, () => new Array(size).fill(TILE.WALL));

      // 1. Randomized DFS on odd coordinates
      const start = { x: 1, y: 1 };
      grid[start.y][start.x] = TILE.FLOOR;
      const stack = [start];
      while (stack.length > 0) {
        const cur = stack[stack.length - 1];
        const dirs = shuffle(
          [
            { dx: 0, dy: -2 },
            { dx: 2, dy: 0 },
            { dx: 0, dy: 2 },
            { dx: -2, dy: 0 },
          ],
          rng
        );
        let carved = false;
        for (const d of dirs) {
          const nx = cur.x + d.dx;
          const ny = cur.y + d.dy;
          if (nx > 0 && ny > 0 && nx < size - 1 && ny < size - 1 && grid[ny][nx] === TILE.WALL) {
            grid[cur.y + d.dy / 2][cur.x + d.dx / 2] = TILE.FLOOR;
            grid[ny][nx] = TILE.FLOOR;
            stack.push({ x: nx, y: ny });
            carved = true;
            break;
          }
        }
        if (!carved) stack.pop();
      }

      // 2. Carve central 3x3 Sanctuary Plaza & Exit at center
      const mid = Math.floor(size / 2);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          grid[mid + dy][mid + dx] = TILE.FLOOR;
        }
      }
      // Open cardinal connectors into center plaza for 4-way approach races
      grid[mid - 2][mid] = TILE.FLOOR;
      grid[mid + 2][mid] = TILE.FLOOR;
      grid[mid][mid - 2] = TILE.FLOOR;
      grid[mid][mid + 2] = TILE.FLOOR;
      const exit = { x: mid, y: mid };
      grid[exit.y][exit.x] = TILE.EXIT;

      // 3. Braid ~35% of dead-ends so racing players have multiple tactical routes
      for (let y = 1; y < size - 1; y++) {
        for (let x = 1; x < size - 1; x++) {
          if (grid[y][x] !== TILE.FLOOR) continue;
          if (countFloorNeighbors(grid, x, y) !== 1) continue;
          if (rng() > 0.36) continue;
          const candidates = [];
          for (let d = 0; d < 4; d++) {
            const wx = x + DIRS_4[d].dx;
            const wy = y + DIRS_4[d].dy;
            const nx = x + DIRS_4[d].dx * 2;
            const ny = y + DIRS_4[d].dy * 2;
            if (nx <= 0 || ny <= 0 || nx >= size - 1 || ny >= size - 1) continue;
            if (grid[wy][wx] === TILE.WALL && grid[ny][nx] === TILE.FLOOR) {
              candidates.push({ wx, wy });
            }
          }
          if (candidates.length > 0) {
            const pick = candidates[Math.floor(rng() * candidates.length)];
            grid[pick.wy][pick.wx] = TILE.FLOOR;
          }
        }
      }

      // 4. Corner Spawn Points:
      // 2P -> opposite corners (TL, BR)
      // 3P -> TL, TR, BL
      // 4P -> all 4 corners
      const tl = { x: 1, y: 1 };
      const br = { x: size - 2, y: size - 2 };
      const tr = { x: size - 2, y: 1 };
      const bl = { x: 1, y: size - 2 };
      const spawns = count === 2 ? [tl, br] : count === 3 ? [tl, tr, bl] : [tl, tr, bl, br];

      // Ensure each corner has at least 2 open exits
      for (const s of spawns) {
        grid[s.y][s.x] = TILE.FLOOR;
        const dx = s.x === 1 ? 1 : -1;
        const dy = s.y === 1 ? 1 : -1;
        grid[s.y][s.x + dx] = TILE.FLOOR;
        grid[s.y + dy][s.x] = TILE.FLOOR;
      }

      const doors = [];
      const doorsByCoord = new Map();

      // Verify all corners reach center exit
      let allReachable = true;
      for (const s of spawns) {
        const dMap = computeDistancesBFS(grid, s.x, s.y, { canPassDoors: false, doorsByCoord });
        if (dMap[exit.y][exit.x] === -1) {
          allReachable = false;
          break;
        }
      }
      if (!allReachable) continue;

      // 5. Alcoves, Pickups, Relics, Enemy Spawn, Fair Traps
      const reserved = new Set([exit.x + ',' + exit.y, ...spawns.map((s) => s.x + ',' + s.y)]);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          reserved.add(mid + dx + ',' + (mid + dy));
        }
      }

      const floorCells = [];
      const alcoves = [];
      const falsePaths = [];
      for (let y = 1; y < size - 1; y++) {
        for (let x = 1; x < size - 1; x++) {
          if (grid[y][x] !== TILE.FLOOR) continue;
          const coord = x + ',' + y;
          if (reserved.has(coord)) continue;
          const deg = countFloorNeighbors(grid, x, y);
          floorCells.push({ x, y, deg });
          if (deg === 1) falsePaths.push({ x, y });
        }
      }
      shuffle(floorCells, rng);

      for (const c of floorCells) {
        if (alcoves.length >= 6) break;
        if (c.deg === 1 && !reserved.has(c.x + ',' + c.y)) {
          grid[c.y][c.x] = TILE.ALCOVE;
          alcoves.push({ x: c.x, y: c.y });
          reserved.add(c.x + ',' + c.y);
        }
      }

      const pickups = [];
      const relics = [];
      for (const c of floorCells) {
        const coord = c.x + ',' + c.y;
        if (reserved.has(coord) || grid[c.y][c.x] !== TILE.FLOOR) continue;
        if (relics.length < 3) {
          relics.push({ x: c.x, y: c.y, collected: false });
          reserved.add(coord);
        } else if (pickups.length < 6) {
          pickups.push({
            x: c.x,
            y: c.y,
            type: pickups.length % 2 === 0 ? 'battery' : 'medkit',
            collected: false,
          });
          reserved.add(coord);
        }
      }

      // Enemy spawn near mid-ring (>= 7 tiles from all players and >= 3 from exact exit)
      let enemySpawn = { x: mid - 3, y: mid - 3 };
      const enemyCandidates = floorCells.filter((c) => {
        if (grid[c.y][c.x] !== TILE.FLOOR) return false;
        const dExit = Math.hypot(c.x - exit.x, c.y - exit.y);
        if (dExit < 3 || dExit > 7) return false;
        return spawns.every((s) => Math.hypot(c.x - s.x, c.y - s.y) >= 7);
      });
      if (enemyCandidates.length > 0) {
        enemySpawn = enemyCandidates[Math.floor(rng() * enemyCandidates.length)];
      }

      const mpDiff = {
        ...MP_CONFIG.DIFF_PRESET,
        trapCount: count === 2 ? 14 : count === 3 ? 18 : 24,
      };

      const mazeData = {
        cols: size,
        rows: size,
        grid,
        start: spawns[0],
        spawns,
        exit,
        keys: [],
        doors,
        doorsByCoord,
        alcoves,
        falsePaths,
        relics,
        pickups,
        enemySpawn: { x: enemySpawn.x, y: enemySpawn.y },
        traps: [],
        isMultiplayer: true,
        playerCount: count,
        mapId: mapTheme ? mapTheme.id : 'crypt',
        seed: baseSeed + attempt * 4999,
        difficulty: mpDiff,
      };

      mazeData.traps = trapsMod.placeTraps(mazeData, mpDiff, rng, reserved);
      const trapCoords = new Set(mazeData.traps.map((t) => t.x + ',' + t.y));
      mazeData.pickups = mazeData.pickups.filter((p) => !trapCoords.has(p.x + ',' + p.y));

      return mazeData;
    }

    throw new Error('Failed to generate multiplayer maze');
  }

  return {
    createRng,
    verifyMazeSolvable,
    generateMaze,
    generateMultiplayerMaze,
  };
});
