import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { createGameServer } from '../server.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function loadGameNamespace() {
  const context = {
    globalThis: null,
    console,
    Math,
    Set,
    Map,
    Array,
    Float32Array,
    Int32Array,
    Int8Array,
    Uint8Array,
    Boolean,
    Number,
    String,
    Error,
    Object,
    URL,
    TextEncoder,
  };
  context.globalThis = context;
  vm.createContext(context);

  const files = [
    'js/config.js',
    'js/i18n.js',
    'js/catalog.js',
    'js/storage.js',
    'js/pathfinding.js',
    'js/traps.js',
    'js/maze.js',
    'js/player.js',
    'js/enemy.js',
    'js/net.js',
    'js/qr.js',
  ];

  for (const rel of files) {
    const code = fs.readFileSync(path.join(rootDir, rel), 'utf8');
    vm.runInContext(code, context, { filename: rel });
  }
  return context.HorrorMaze;
}

const HM = loadGameNamespace();

test('maze generator produces 100% solvable mazes across Easy, Normal, and Hard even if all collapsing floors collapse', () => {
  for (const diff of ['easy', 'normal', 'hard']) {
    for (let s = 1; s <= 12; s++) {
      const maze = HM.generateMaze(diff, 1000 + s * 37);
      assert.equal(HM.verifyMazeSolvable(maze), true, `${diff} seed ${s} must be solvable`);
      assert.equal(maze.keys.length, HM.DIFFICULTIES[diff].keyCount);
      assert.equal(maze.doors.length, HM.DIFFICULTIES[diff].keyCount);

      const spawnDist = Math.hypot(
        maze.enemySpawn.x - maze.start.x,
        maze.enemySpawn.y - maze.start.y
      );
      assert.ok(spawnDist >= 6, `Enemy spawn too close on ${diff}: ${spawnDist}`);

      const exitDist =
        Math.abs(maze.exit.x - maze.start.x) + Math.abs(maze.exit.y - maze.start.y);
      assert.ok(exitDist >= 6, `Exit too close to start on ${diff}: ${exitDist}`);

      // Simulate ALL collapsing floors collapsing at once: maze MUST remain 100% solvable
      for (const tr of maze.traps) {
        if (tr.type === HM.TRAP_TYPE.COLLAPSING_FLOOR) tr.collapsed = true;
      }
      assert.equal(
        HM.verifyMazeSolvable(maze),
        true,
        `${diff} seed ${s} became unsolvable after collapsing floors!`
      );
    }
  }
});

test('multiplayer square maze generator spawns 2, 3, and 4 players in distinct corners with valid paths to center', () => {
  for (const count of [2, 3, 4]) {
    const maze = HM.generateMultiplayerMaze(count, 'spider_nest', 7000 + count * 13);
    assert.equal(maze.cols, maze.rows, 'Multiplayer maze must be square');
    assert.equal(maze.cols, HM.MP_CONFIG.SIZES[count]);
    assert.equal(maze.spawns.length, count);
    assert.equal(maze.exit.x, Math.floor(maze.cols / 2));
    assert.equal(maze.exit.y, Math.floor(maze.rows / 2));

    for (const sp of maze.spawns) {
      const d = HM.computeDistancesBFS(maze.grid, sp.x, sp.y, {
        canPassDoors: false,
        doorsByCoord: maze.doorsByCoord,
      });
      assert.ok(d[maze.exit.y][maze.exit.x] > 0, `${count}P corner must reach center exit`);
    }
  }
});

test('locked doors strictly block reaching the exit until unlocked with matching keys', () => {
  const maze = HM.generateMaze('normal', 4242);
  const blockedDist = HM.computeDistancesBFS(maze.grid, maze.start.x, maze.start.y, {
    canPassDoors: false,
    doorsByCoord: maze.doorsByCoord,
  });
  assert.equal(blockedDist[maze.exit.y][maze.exit.x], -1);

  for (const d of maze.doors) d.unlocked = true;
  const openDist = HM.computeDistancesBFS(maze.grid, maze.start.x, maze.start.y, {
    canPassDoors: false,
    doorsByCoord: maze.doorsByCoord,
  });
  assert.ok(openDist[maze.exit.y][maze.exit.x] > 0);
});

test('A* pathfinding routes around walls and refuses locked doors', () => {
  const { FLOOR, WALL, DOOR } = HM.TILE;
  const grid = [
    [WALL, WALL, WALL, WALL, WALL],
    [WALL, FLOOR, WALL, FLOOR, WALL],
    [WALL, FLOOR, DOOR, FLOOR, WALL],
    [WALL, FLOOR, FLOOR, FLOOR, WALL],
    [WALL, WALL, WALL, WALL, WALL],
  ];
  const doorsByCoord = new Map([['2,2', { x: 2, y: 2, unlocked: false }]]);

  const path = HM.findPath(grid, 1, 1, 3, 1, { canPassDoors: false, doorsByCoord });
  assert.ok(path.length > 0);
  assert.equal(path.some((p) => p.x === 2 && p.y === 2), false);

  doorsByCoord.get('2,2').unlocked = true;
  const shortPath = HM.findPath(grid, 1, 1, 3, 1, { canPassDoors: false, doorsByCoord });
  assert.ok(shortPath.length < path.length);
  assert.equal(shortPath.some((p) => p.x === 2 && p.y === 2), true);
});

test('line of sight is blocked by walls and locked doors, cleared when unlocked', () => {
  const { FLOOR, WALL, DOOR } = HM.TILE;
  const grid = [
    [WALL, WALL, WALL, WALL, WALL],
    [WALL, FLOOR, DOOR, FLOOR, WALL],
    [WALL, WALL, WALL, WALL, WALL],
  ];
  const doorsByCoord = new Map([['2,1', { x: 2, y: 1, unlocked: false }]]);

  assert.equal(HM.hasLineOfSight(grid, 1.5, 1.5, 3.5, 1.5, doorsByCoord), false);
  doorsByCoord.get('2,1').unlocked = true;
  assert.equal(HM.hasLineOfSight(grid, 1.5, 1.5, 3.5, 1.5, doorsByCoord), true);
});

test('traps trigger damage, collapsing floor opens warning before collapsing, and disarming neutralizes traps', () => {
  const diffCfg = HM.DIFFICULTIES.normal;
  const player = HM.createPlayer({ x: 1, y: 1 }, diffCfg);
  const blockedCoords = new Set();

  const hiddenPit = HM.createTrap(1, HM.TRAP_TYPE.HIDDEN_PIT, 3, 1, true, diffCfg);
  const pitOutcome = HM.checkPlayerTrapInteraction(hiddenPit, player);
  assert.equal(pitOutcome.event, 'pit_fall');
  assert.equal(pitOutcome.damage, diffCfg.pitDamage);
  assert.equal(hiddenPit.revealed, true);

  const collapse = HM.createTrap(2, HM.TRAP_TYPE.COLLAPSING_FLOOR, 4, 1, false, diffCfg);
  const stepOutcome = HM.checkPlayerTrapInteraction(collapse, player);
  assert.equal(stepOutcome.event, 'floor_cracking');
  assert.equal(collapse.collapsed, false);
  HM.updateTraps([collapse], 0.6, blockedCoords);
  assert.equal(collapse.collapsed, true);
  assert.equal(blockedCoords.has('4,1'), true);

  const spikes = HM.createTrap(3, HM.TRAP_TYPE.SPIKE_TRAP, 5, 1, false, diffCfg);
  assert.equal(HM.canDisarmTrap(spikes), true);
  assert.equal(HM.disarmTrap(spikes), true);
  assert.equal(HM.checkPlayerTrapInteraction(spikes, player), null);
});

test('enemy AI detects visible player, enters CHASE, ignores hidden alcove player, and spider weaves webs', () => {
  const { FLOOR, WALL, ALCOVE } = HM.TILE;
  const grid = [
    [WALL, WALL, WALL, WALL, WALL, WALL, WALL],
    [WALL, FLOOR, FLOOR, FLOOR, FLOOR, ALCOVE, WALL],
    [WALL, WALL, WALL, WALL, WALL, WALL, WALL],
  ];
  const diffCfg = HM.DIFFICULTIES.normal;
  const doorsByCoord = new Map();
  const blockedCoords = new Set();

  const player = HM.createPlayer({ x: 5, y: 1 }, diffCfg);
  const spider = HM.createEnemy({ x: 1, y: 1 }, diffCfg, 'widow_weaver');
  spider.angle = 0;

  const res1 = HM.updateEnemy(
    spider,
    player,
    grid,
    doorsByCoord,
    blockedCoords,
    diffCfg,
    0.05
  );
  assert.equal(res1.detectedNow, true);
  assert.equal(spider.state, HM.ENEMY_STATE.CHASE);
  assert.equal(spider.archetype, 'spider');

  spider.state = HM.ENEMY_STATE.PATROL;
  player.hidden = true;
  assert.equal(HM.canSeePlayer(spider, player, grid, doorsByCoord, diffCfg), false);
});

test('shop economy, rating calculation, bilingual i18n, and hidden developer unlock work accurately', () => {
  const save = HM.createDefaults();
  assert.equal(save.currency, 50000);

  // Insufficient funds for 160-shard skin when low on currency
  save.currency = 100;
  const failRes = HM.purchaseItem(save, 'skins', 'scout');
  assert.equal(failRes.ok, false);
  assert.equal(failRes.reason, 'insufficient_funds');

  // Grant currency & purchase
  save.currency = 200;
  const buyRes = HM.purchaseItem(save, 'skins', 'scout');
  assert.equal(buyRes.ok, true);
  assert.equal(save.currency, 40);
  assert.equal(save.unlockedSkins.includes('scout'), true);
  assert.equal(save.equippedSkin, 'scout');

  // Rating S-tier calculation
  const rating = HM.calculateRunRating({
    victory: true,
    elapsedTime: 65,
    timeRemaining: 145,
    keysCollected: 3,
    totalKeys: 3,
    trapsDisarmed: 4,
    relicsCollected: 2,
    hpRatio: 1,
    tookDamage: false,
    difficultyId: 'hard',
    mapId: 'spider_nest',
  });
  assert.equal(rating.grade, 'S');
  assert.equal(rating.stars, 5);
  assert.ok(rating.shardsEarned > 50);

  // Bilingual switch
  HM.setLanguage('fa');
  assert.equal(HM.getLanguage(), 'fa');
  assert.ok(HM.t('startGame').length > 0);
  HM.setLanguage('en');

  // Hidden developer unlock
  HM.activateDevMode(save);
  assert.equal(save.devUnlocked, true);
  assert.ok(save.currency >= 99999);
  assert.equal(save.unlockedEnemies.length, HM.ENEMY_TYPES.length);
  assert.equal(save.unlockedMaps.length, HM.MAP_THEMES.length);
});

// Helper for WebSocket JSON message queue
function createWsClient(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const queue = [];
    const waiters = [];
    ws.on('message', (buf) => {
      const msg = JSON.parse(String(buf));
      if (waiters.length > 0) {
        const w = waiters.shift();
        w(msg);
      } else {
        queue.push(msg);
      }
    });
    ws.on('open', () => {
      resolve({
        ws,
        send: (obj) => ws.send(JSON.stringify(obj)),
        nextMessage: (predicate) =>
          new Promise((res) => {
            const idx = queue.findIndex((m) => (!predicate ? true : predicate(m)));
            if (idx !== -1) {
              res(queue.splice(idx, 1)[0]);
              return;
            }
            const check = (msg) => {
              if (!predicate || predicate(msg)) res(msg);
              else waiters.push(check);
            };
            waiters.push(check);
          }),
        close: () => new Promise((res) => (ws.readyState === WebSocket.CLOSED ? res() : (ws.once('close', res), ws.close()))),
      });
    });
    ws.on('error', reject);
  });
}

test('QR code generator and WebSocket URL resolver handle LAN and HTTPS invite links', () => {
  assert.equal(HM.resolveWsUrl('http://192.168.1.12:3000/?join=ABCD'), 'ws://192.168.1.12:3000');
  assert.equal(HM.resolveWsUrl('https://hollow.example.run.app/?join=WXYZ'), 'wss://hollow.example.run.app');
  assert.equal(HM.resolveWsUrl('192.168.43.1'), 'ws://192.168.43.1:3000');

  const qrShort = HM.encodeQrMatrix('http://192.168.1.5:3000/?join=ABCD');
  assert.equal(qrShort.size, 17 + qrShort.version * 4);
  // Top-left finder corners must be dark
  assert.equal(qrShort.matrix[0][0], 1);
  assert.equal(qrShort.matrix[0][6], 1);
  assert.equal(qrShort.matrix[6][0], 1);
  assert.equal(qrShort.matrix[3][3], 1);
  // Format strip symmetry between top-left and split strips
  assert.equal(qrShort.matrix[8][0], qrShort.matrix[qrShort.size - 1][8]);
  assert.equal(qrShort.matrix[0][8], qrShort.matrix[8][qrShort.size - 1]);

  const qrLong = HM.encodeQrMatrix('https://hollow-labyrinth-demo-multiplayer-invite.example.run.app/?join=QWER');
  assert.ok(qrLong.version >= 4);
  assert.equal(qrLong.matrix[8][0], qrLong.matrix[qrLong.size - 1][8]);
});

test('WebSocket multiplayer server enforces 2P/4P capacity, lists /api/rooms, syncs movement & enemy, broadcasts finishers, and resets lobby', async () => {
  const srv = await createGameServer({ port: 0, attachVite: false });
  const url = `ws://127.0.0.1:${srv.port}`;
  const httpBase = `http://127.0.0.1:${srv.port}`;

  try {
    // 1. Test 2-player room capacity enforcement and finish order
    const host = await createWsClient(url);
    const p2 = await createWsClient(url);
    const p3 = await createWsClient(url);

    host.send({ type: 'host:create', playerName: 'Alice', maxPlayers: 2, mapId: 'crypt' });
    const created = await host.nextMessage((m) => m.type === 'room:created');
    assert.equal(created.room.maxPlayers, 2);

    // Open rooms HTTP endpoint should list the newly created room
    const openResp = await fetch(`${httpBase}/api/rooms`);
    const openData = await openResp.json();
    assert.equal(openData.rooms.length, 1);
    assert.equal(openData.rooms[0].code, created.roomCode);
    assert.equal(openData.rooms[0].hostName, 'Alice');

    p2.send({ type: 'room:join', roomCode: created.roomCode, playerName: 'Bob' });
    const joined2 = await p2.nextMessage((m) => m.type === 'room:joined');
    assert.equal(joined2.slotIndex, 1);

    // Once full, /api/rooms should not show it
    const fullResp = await fetch(`${httpBase}/api/rooms`);
    const fullData = await fullResp.json();
    assert.equal(fullData.rooms.length, 0);

    // 3rd player must be rejected with ROOM_FULL
    p3.send({ type: 'room:join', roomCode: created.roomCode, playerName: 'Eve' });
    const err3 = await p3.nextMessage((m) => m.type === 'error');
    assert.equal(err3.code, 'ROOM_FULL');

    // Start 2P match
    host.send({ type: 'match:start' });
    const startH = await host.nextMessage((m) => m.type === 'match:started');
    const start2 = await p2.nextMessage((m) => m.type === 'match:started');
    assert.equal(startH.seed, start2.seed);

    // Sync movement
    p2.send({ type: 'player:update', x: 5.2, y: 8.4, angle: 1.2, flashlightOn: true, hp: 100, hidden: false, alive: true });
    const syncH = await host.nextMessage((m) => m.type === 'player:sync');
    assert.equal(syncH.x, 5.2);

    // Host syncs authoritative enemy state to guest
    host.send({ type: 'enemy:sync', x: 10.5, y: 9.25, angle: 0.8, state: 'chase', animPhase: 3.1 });
    const eSync = await p2.nextMessage((m) => m.type === 'enemy:sync');
    assert.equal(eSync.x, 10.5);
    assert.equal(eSync.state, 'chase');

    // Finishers: Alice 1st, Bob 2nd -> ends 2P match
    host.send({ type: 'player:finish', elapsedTime: 42 });
    const fin1 = await p2.nextMessage((m) => m.type === 'player:finished');
    assert.equal(fin1.rank, 1);
    assert.equal(fin1.name, 'Alice');

    p2.send({ type: 'player:finish', elapsedTime: 55 });
    const end2p = await host.nextMessage((m) => m.type === 'match:ended');
    assert.equal(end2p.rankings[0].name, 'Alice');
    assert.equal(end2p.rankings[0].rank, 1);
    assert.equal(end2p.rankings[1].name, 'Bob');
    assert.equal(end2p.rankings[1].rank, 2);

    // Return to lobby cleanly resets room for rematch
    p2.send({ type: 'room:return_lobby' });
    const resetH = await host.nextMessage((m) => m.type === 'room:state' && m.room.started === false);
    assert.equal(resetH.room.ended, false);

    await Promise.all([host.close(), p2.close(), p3.close()]);

    // 2. Test 4-player room ends immediately once top 3 finish
    const clients = await Promise.all([1, 2, 3, 4].map(() => createWsClient(url)));
    clients[0].send({ type: 'host:create', playerName: 'P1', maxPlayers: 4 });
    const r4 = await clients[0].nextMessage((m) => m.type === 'room:created');

    for (let i = 1; i < 4; i++) {
      clients[i].send({ type: 'room:join', roomCode: r4.roomCode, playerName: `P${i + 1}` });
      await clients[i].nextMessage((m) => m.type === 'room:joined');
    }

    clients[0].send({ type: 'match:start' });
    await Promise.all(clients.map((c) => c.nextMessage((m) => m.type === 'match:started')));

    clients[2].send({ type: 'player:finish', elapsedTime: 30 });
    clients[0].send({ type: 'player:finish', elapsedTime: 35 });
    clients[3].send({ type: 'player:finish', elapsedTime: 40 });

    const end4p = await clients[1].nextMessage((m) => m.type === 'match:ended');
    assert.equal(end4p.rankings.length, 4);
    assert.equal(end4p.rankings[0].rank, 1);
    assert.equal(end4p.rankings[0].name, 'P3');
    assert.equal(end4p.rankings[2].rank, 3);
    assert.equal(end4p.rankings[3].rank, 0); // 4th player DNF once top 3 finished

    await Promise.all(clients.map((c) => c.close()));
  } finally {
    await srv.close();
  }
});

test('smoke bomb clouds blind creature line-of-sight and block catches', () => {
  const { FLOOR, WALL } = HM.TILE;
  const grid = [
    [WALL, WALL, WALL, WALL, WALL, WALL, WALL],
    [WALL, FLOOR, FLOOR, FLOOR, FLOOR, FLOOR, WALL],
    [WALL, WALL, WALL, WALL, WALL, WALL, WALL],
  ];
  const diffCfg = HM.DIFFICULTIES.normal;
  const doorsByCoord = new Map();
  const blockedCoords = new Set();

  const player = HM.createPlayer({ x: 3, y: 1 }, diffCfg);
  const stalker = HM.createEnemy({ x: 1, y: 1 }, diffCfg, 'stalker');
  stalker.angle = 0;

  // Without smoke, enemy spots player
  assert.equal(HM.canSeePlayer(stalker, player, grid, doorsByCoord, diffCfg), true);

  // Smoke cloud covering player blocks sight and catches
  const smokeClouds = [{ x: player.x, y: player.y, radius: 2.6, ttl: 5.0 }];
  assert.equal(HM.isPointInSmoke(player.x, player.y, smokeClouds), true);
  assert.equal(
    HM.canSeePlayer(stalker, player, grid, doorsByCoord, diffCfg, smokeClouds),
    false
  );

  // Even at point-blank distance inside smoke, caughtPlayer stays false
  stalker.x = player.x - 0.3;
  stalker.y = player.y;
  const res = HM.updateEnemy(
    stalker,
    player,
    grid,
    doorsByCoord,
    blockedCoords,
    diffCfg,
    0.05,
    { smokeClouds }
  );
  assert.equal(res.caughtPlayer, false);
});

test('crouch mode lowers movement speed, produces quiet steps, auto-stands on sprint, and cuts enemy detection range', () => {
  const { FLOOR, WALL } = HM.TILE;
  const grid = [
    [WALL, WALL, WALL, WALL, WALL, WALL, WALL, WALL, WALL],
    [WALL, FLOOR, FLOOR, FLOOR, FLOOR, FLOOR, FLOOR, FLOOR, WALL],
    [WALL, WALL, WALL, WALL, WALL, WALL, WALL, WALL, WALL],
  ];
  const diffCfg = HM.DIFFICULTIES.normal;
  const doorsByCoord = new Map();
  const blockedCoords = new Set();

  const pStand = HM.createPlayer({ x: 1, y: 1 }, diffCfg);
  const pCrouch = HM.createPlayer({ x: 1, y: 1 }, diffCfg);
  assert.equal(HM.toggleCrouch(pCrouch), true);
  assert.equal(pCrouch.isCrouching, true);

  const standRes = HM.updatePlayer(pStand, { moveX: 1, moveY: 0, sprint: false }, grid, doorsByCoord, blockedCoords, 0.25);
  const crouchRes = HM.updatePlayer(pCrouch, { moveX: 1, moveY: 0, sprint: false }, grid, doorsByCoord, blockedCoords, 0.25);
  assert.ok(pCrouch.x < pStand.x, 'Crouching must walk slower than standing');
  assert.equal(standRes.isQuietStep, false);
  assert.equal(crouchRes.isQuietStep, true);

  // Sprinting automatically stands player up
  HM.updatePlayer(pCrouch, { moveX: 1, moveY: 0, sprint: true }, grid, doorsByCoord, blockedCoords, 0.05);
  assert.equal(pCrouch.isCrouching, false);
  assert.equal(pCrouch.isSprinting, true);

  // Enemy sight range reduced when crouching
  const watcher = HM.createEnemy({ x: 1, y: 1 }, diffCfg, 'stalker');
  watcher.angle = 0;
  const edgeTarget = HM.createPlayer({ x: 5, y: 1 }, diffCfg); // 4.0 tiles away (normal sight 5.7, crouch ~3.1)
  assert.equal(HM.canSeePlayer(watcher, edgeTarget, grid, doorsByCoord, diffCfg), true);
  HM.toggleCrouch(edgeTarget);
  assert.equal(HM.canSeePlayer(watcher, edgeTarget, grid, doorsByCoord, diffCfg), false);
});

test('circular vision stats, keen_senses perk, 4-stage progression, and difficulty enemy speeds work correctly', () => {
  // Difficulty enemy speeds scale Easy < Normal < Hard and swipe damage is non-fatal (<100)
  assert.ok(HM.DIFFICULTIES.easy.enemySpeed < HM.DIFFICULTIES.normal.enemySpeed);
  assert.ok(HM.DIFFICULTIES.normal.enemySpeed < HM.DIFFICULTIES.hard.enemySpeed);
  assert.ok(HM.DIFFICULTIES.easy.enemyChaseSpeed < HM.DIFFICULTIES.normal.enemyChaseSpeed);
  assert.ok(HM.DIFFICULTIES.normal.enemyChaseSpeed < HM.DIFFICULTIES.hard.enemyChaseSpeed);
  assert.ok(HM.DIFFICULTIES.hard.enemySwipeDamage < 100);

  // Skins expose 0-100 vision stat & visionMult; keen_senses gear enables sonarSense + ambientVisionBonus
  for (const skin of HM.PLAYER_SKINS) {
    assert.ok(typeof skin.stats.vision === 'number' && skin.stats.vision > 0);
    assert.ok(typeof skin.mods.visionMult === 'number' && skin.mods.visionMult > 0);
  }
  const keenPlayer = HM.createPlayer({ x: 1, y: 1 }, HM.DIFFICULTIES.normal, {
    skinId: 'doctor',
    flashlightId: 'standard',
    gearId: 'keen_senses',
  });
  assert.equal(keenPlayer.mods.sonarSense, true);
  assert.ok(keenPlayer.mods.ambientVisionBonus > 1.0);
  assert.ok(keenPlayer.mods.visionMult > 1.2);
  assert.equal(keenPlayer.smokeBombs, HM.PLAYER_CFG.STARTING_SMOKE_BOMBS);

  // Stages 1..4 remain solvable, grow in size/speed, spawn smoke pickups, and Stage 4 spawns a 2nd creature
  let prevCols = 0;
  for (let st = 1; st <= HM.MAX_STAGES; st++) {
    const maze = HM.generateMaze('normal', 9000 + st * 17, { stage: st });
    assert.equal(HM.verifyMazeSolvable(maze), true, `Stage ${st} must be solvable`);
    assert.ok(maze.cols > prevCols, `Stage ${st} maze should grow`);
    prevCols = maze.cols;
    assert.ok(maze.pickups.some((p) => p.type === 'smoke'), `Stage ${st} should include smoke pickups`);
    if (st < 4) {
      assert.equal(maze.extraEnemySpawns.length, 0);
    } else {
      assert.equal(maze.extraEnemySpawns.length, 1);
    }
  }
});

test('even slower crouch speed, all 5 character skills, and Stage 4 Abyssal Warden boss mechanics', () => {
  const { FLOOR, WALL } = HM.TILE;
  const grid = [
    [WALL, WALL, WALL, WALL, WALL, WALL, WALL, WALL, WALL, WALL],
    [WALL, FLOOR, FLOOR, FLOOR, FLOOR, FLOOR, FLOOR, FLOOR, FLOOR, WALL],
    [WALL, WALL, WALL, WALL, WALL, WALL, WALL, WALL, WALL, WALL],
  ];
  const diffCfg = HM.DIFFICULTIES.normal;
  const doorsByCoord = new Map();
  const blockedCoords = new Set();

  // 1. Crouch speed is noticeably slower than 0.45x walk speed
  assert.ok(HM.PLAYER_CFG.CROUCH_SPEED_MULT <= 0.4);
  const pWalk = HM.createPlayer({ x: 1, y: 1 }, diffCfg);
  const pSneak = HM.createPlayer({ x: 1, y: 1 }, diffCfg);
  HM.toggleCrouch(pSneak);
  HM.updatePlayer(pWalk, { moveX: 1, moveY: 0, sprint: false }, grid, doorsByCoord, blockedCoords, 0.4);
  HM.updatePlayer(pSneak, { moveX: 1, moveY: 0, sprint: false }, grid, doorsByCoord, blockedCoords, 0.4);
  assert.ok((pSneak.x - 1.5) < (pWalk.x - 1.5) * 0.48, 'Crouch must be much slower than half walk speed');

  // 2. Explorer: 60s CD active full-map scan
  const exp = HM.createPlayer({ x: 1, y: 1 }, diffCfg, { skinId: 'explorer' });
  const expAct = HM.activatePlayerSkill(exp, []);
  assert.equal(expAct.activated, true);
  assert.equal(expAct.skillId, 'map_scan');
  assert.equal(exp.skillCooldownTimer, 60);
  assert.ok(exp.skillActiveTimer > 0);
  assert.equal(HM.activatePlayerSkill(exp, []).activated, false);

  // 3. Scout: 32s CD adrenaline overdrive fills stamina and boosts speed
  const scout = HM.createPlayer({ x: 1, y: 1 }, diffCfg, { skinId: 'scout' });
  scout.stamina = 15;
  const scAct = HM.activatePlayerSkill(scout, []);
  assert.equal(scAct.activated, true);
  assert.equal(scAct.skillId, 'adrenaline_rush');
  assert.equal(scout.stamina, scout.maxStamina);
  assert.equal(scout.skillCooldownTimer, 32);

  // 4. Warden: 50s CD shock-strike stuns regular enemies for 20s and Boss for 16s
  const warden = HM.createPlayer({ x: 2, y: 1 }, diffCfg, { skinId: 'warden' });
  const grunt = HM.createEnemy({ x: 4, y: 1 }, diffCfg, 'stalker');
  const boss = HM.createEnemy({ x: 5, y: 1 }, diffCfg, 'abyssal_warden', { isBoss: true });
  assert.equal(boss.isBoss, true);
  const wHit = HM.activatePlayerSkill(warden, [grunt, boss]);
  assert.equal(wHit.activated, true);
  assert.equal(wHit.stunnedCount, 2);
  assert.equal(grunt.stunTimer, 20);
  assert.equal(boss.stunTimer, 16);
  assert.equal(warden.skillCooldownTimer, 50);

  // Stunned enemy cannot see or catch player or move
  const gruntXBefore = grunt.x;
  const stunnedStep = HM.updateEnemy(grunt, warden, grid, doorsByCoord, blockedCoords, diffCfg, 0.25);
  assert.equal(stunnedStep.caughtPlayer, false);
  assert.equal(stunnedStep.detectedNow, false);
  assert.equal(grunt.x, gruntXBefore);

  // 5. Phantom: passive auto-cloak breaks sight & prevents detection/catches
  const phantom = HM.createPlayer({ x: 3, y: 1 }, diffCfg, { skinId: 'phantom' });
  const hunter = HM.createEnemy({ x: 1, y: 1 }, diffCfg, 'stalker');
  hunter.angle = 0;
  assert.equal(HM.canSeePlayer(hunter, phantom, grid, doorsByCoord, diffCfg), true);
  assert.equal(HM.triggerPassiveAutoCloak(phantom), true);
  assert.equal(phantom.cloakTimer, 5.0);
  assert.equal(phantom.skillCooldownTimer, 40);
  assert.equal(HM.canSeePlayer(hunter, phantom, grid, doorsByCoord, diffCfg), false);
  assert.equal(HM.triggerPassiveAutoCloak(phantom), false);

  // 6. Doctor: passive toxic immunity, HP regen, and 45s auto-brew smoke bomb
  const doc = HM.createPlayer({ x: 1, y: 1 }, diffCfg, { skinId: 'doctor' });
  assert.equal(doc.toxicImmune, true);
  doc.hp = doc.maxHp - 10;
  doc.hurtTimer = 0;
  doc.smokeBombs = 1;
  doc.smokeCraftTimer = 44.9;
  const docRes = HM.updatePlayer(doc, { moveX: 0, moveY: 0, sprint: false }, grid, doorsByCoord, blockedCoords, 0.2);
  assert.ok(doc.hp > doc.maxHp - 10, 'Doctor regenerates HP passively');
  assert.equal(docRes.brewedSmoke, true);
  assert.equal(doc.smokeBombs, 2);

  // 7. Boss telegraph windup & shockwave slam trigger when chasing close target
  const boss2 = HM.createEnemy({ x: 2, y: 1 }, diffCfg, 'abyssal_warden', { isBoss: true });
  boss2.angle = 0;
  boss2.shockwaveCooldownTimer = 0;
  const prey = HM.createPlayer({ x: 4, y: 1 }, diffCfg);
  const bStart = HM.updateEnemy(boss2, prey, grid, doorsByCoord, blockedCoords, diffCfg, 0.1);
  assert.equal(bStart.bossTelegraphStarted, true);
  assert.ok(boss2.telegraphTimer > 0);
  const bFire = HM.updateEnemy(
    boss2,
    prey,
    grid,
    doorsByCoord,
    blockedCoords,
    diffCfg,
    HM.BOSS_CFG.TELEGRAPH_SEC + 0.05
  );
  assert.equal(bFire.bossShockwaveFired, true);
});


