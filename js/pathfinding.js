/**
 * pathfinding.js
 * Deterministic grid A* pathfinding, BFS distance mapping, and continuous
 * tile-space line-of-sight raycasting.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const cfg = require('./config.js');
    module.exports = factory(cfg);
  } else {
    root.HorrorMaze = root.HorrorMaze || {};
    Object.assign(root.HorrorMaze, factory(root.HorrorMaze));
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (cfg) {
  const { TILE } = cfg;

  const DIRS_4 = [
    { dx: 0, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
  ];

  /**
   * Checks if a tile coordinate is walkable given door states and extra blocked tiles.
   */
  function isTileWalkable(grid, x, y, options) {
    const rows = grid.length;
    const cols = grid[0].length;
    if (x < 0 || y < 0 || x >= cols || y >= rows) return false;
    const tile = grid[y][x];
    if (tile === TILE.WALL) return false;
    if (tile === TILE.DOOR) {
      if (options && options.canPassDoors) return true;
      if (options && options.doorsByCoord) {
        const door = options.doorsByCoord.get(x + ',' + y);
        if (!door || !door.unlocked) return false;
      } else {
        return false;
      }
    }
    if (options && options.blockedCoords && options.blockedCoords.has(x + ',' + y)) {
      return false;
    }
    return true;
  }

  /**
   * A* pathfinding between integer tile coordinates.
   * Returns an array of { x, y } steps excluding start and including goal,
   * or [] if unreachable or already at goal.
   */
  function findPath(grid, startX, startY, goalX, goalY, options) {
    const rows = grid.length;
    const cols = grid[0].length;
    if (startX === goalX && startY === goalY) return [];
    if (!isTileWalkable(grid, goalX, goalY, options)) return [];

    const total = cols * rows;
    const gScore = new Float32Array(total);
    const fScore = new Float32Array(total);
    const parent = new Int32Array(total);
    const closed = new Uint8Array(total);
    const inOpen = new Uint8Array(total);

    gScore.fill(Infinity);
    fScore.fill(Infinity);
    parent.fill(-1);

    const startIdx = startY * cols + startX;
    const goalIdx = goalY * cols + goalX;
    gScore[startIdx] = 0;
    fScore[startIdx] = Math.abs(goalX - startX) + Math.abs(goalY - startY);

    // Simple binary min-heap on tile indices
    const heap = [startIdx];
    inOpen[startIdx] = 1;

    function heapPush(idx) {
      heap.push(idx);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (fScore[heap[p]] <= fScore[heap[i]]) break;
        const tmp = heap[p];
        heap[p] = heap[i];
        heap[i] = tmp;
        i = p;
      }
    }

    function heapPop() {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length > 0) {
        heap[0] = last;
        let i = 0;
        const n = heap.length;
        while (true) {
          let smallest = i;
          const l = (i << 1) + 1;
          const r = l + 1;
          if (l < n && fScore[heap[l]] < fScore[heap[smallest]]) smallest = l;
          if (r < n && fScore[heap[r]] < fScore[heap[smallest]]) smallest = r;
          if (smallest === i) break;
          const tmp = heap[i];
          heap[i] = heap[smallest];
          heap[smallest] = tmp;
          i = smallest;
        }
      }
      return top;
    }

    while (heap.length > 0) {
      const current = heapPop();
      inOpen[current] = 0;
      if (current === goalIdx) {
        const path = [];
        let cur = goalIdx;
        while (cur !== startIdx && cur !== -1) {
          path.push({ x: cur % cols, y: Math.floor(cur / cols) });
          cur = parent[cur];
        }
        path.reverse();
        return path;
      }

      closed[current] = 1;
      const cx = current % cols;
      const cy = Math.floor(current / cols);
      const nextG = gScore[current] + 1;

      for (let d = 0; d < 4; d++) {
        const nx = cx + DIRS_4[d].dx;
        const ny = cy + DIRS_4[d].dy;
        if (!isTileWalkable(grid, nx, ny, options)) continue;
        const nIdx = ny * cols + nx;
        if (closed[nIdx]) continue;

        if (nextG < gScore[nIdx]) {
          parent[nIdx] = current;
          gScore[nIdx] = nextG;
          fScore[nIdx] = nextG + Math.abs(goalX - nx) + Math.abs(goalY - ny);
          if (!inOpen[nIdx]) {
            inOpen[nIdx] = 1;
            heapPush(nIdx);
          }
        }
      }
    }

    return [];
  }

  /**
   * BFS distance table from (startX, startY). Unreachable cells have distance -1.
   */
  function computeDistancesBFS(grid, startX, startY, options) {
    const rows = grid.length;
    const cols = grid[0].length;
    const dist = Array.from({ length: rows }, () => new Int32Array(cols).fill(-1));
    if (!isTileWalkable(grid, startX, startY, options)) return dist;

    const queue = [{ x: startX, y: startY }];
    dist[startY][startX] = 0;
    let head = 0;

    while (head < queue.length) {
      const cur = queue[head++];
      const nextDist = dist[cur.y][cur.x] + 1;
      for (let d = 0; d < 4; d++) {
        const nx = cur.x + DIRS_4[d].dx;
        const ny = cur.y + DIRS_4[d].dy;
        if (!isTileWalkable(grid, nx, ny, options)) continue;
        if (dist[ny][nx] !== -1) continue;
        dist[ny][nx] = nextDist;
        queue.push({ x: nx, y: ny });
      }
    }

    return dist;
  }

  /**
   * Checks whether a tile blocks line-of-sight (walls and locked doors).
   */
  function isTileOpaque(grid, tx, ty, doorsByCoord) {
    const rows = grid.length;
    const cols = grid[0].length;
    if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) return true;
    const tile = grid[ty][tx];
    if (tile === TILE.WALL) return true;
    if (tile === TILE.DOOR) {
      if (!doorsByCoord) return true;
      const door = doorsByCoord.get(tx + ',' + ty);
      return !door || !door.unlocked;
    }
    return false;
  }

  /**
   * Continuous tile-space line-of-sight check between (x0, y0) and (x1, y1).
   */
  function hasLineOfSight(grid, x0, y0, x1, y1, doorsByCoord) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.05) return true;
    const step = 0.14;
    const steps = Math.ceil(dist / step);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const rx = x0 + dx * t;
      const ry = y0 + dy * t;
      if (isTileOpaque(grid, Math.floor(rx), Math.floor(ry), doorsByCoord)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Casts a single ray from (x0, y0) at angle `angle` up to `maxDist` tiles.
   * Returns hit point { x, y, dist, hitWall }.
   */
  function castRay(grid, x0, y0, angle, maxDist, doorsByCoord) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const step = 0.12;
    let d = 0;
    while (d < maxDist) {
      d += step;
      if (d > maxDist) d = maxDist;
      const rx = x0 + cos * d;
      const ry = y0 + sin * d;
      if (isTileOpaque(grid, Math.floor(rx), Math.floor(ry), doorsByCoord)) {
        // Binary refine edge for crisp shadow alignment
        let lo = Math.max(0, d - step);
        let hi = d;
        for (let k = 0; k < 4; k++) {
          const mid = (lo + hi) * 0.5;
          if (isTileOpaque(grid, Math.floor(x0 + cos * mid), Math.floor(y0 + sin * mid), doorsByCoord)) {
            hi = mid;
          } else {
            lo = mid;
          }
        }
        return {
          x: x0 + cos * hi,
          y: y0 + sin * hi,
          dist: hi,
          hitWall: true,
        };
      }
      if (d >= maxDist) break;
    }
    return {
      x: x0 + cos * maxDist,
      y: y0 + sin * maxDist,
      dist: maxDist,
      hitWall: false,
    };
  }

  return {
    DIRS_4,
    isTileWalkable,
    findPath,
    computeDistancesBFS,
    isTileOpaque,
    hasLineOfSight,
    castRay,
  };
});
