/**
 * config.js
 * Central game constants, tile definitions, trap archetypes, key definitions,
 * multiplayer presets, and balanced difficulty presets for The Hollow Labyrinth.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HorrorMaze = root.HorrorMaze || {};
    Object.assign(root.HorrorMaze, factory());
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const TILE = {
    FLOOR: 0,
    WALL: 1,
    EXIT: 2,
    DOOR: 3,
    ALCOVE: 4,
  };

  const TRAP_TYPE = {
    HIDDEN_PIT: 'hidden_pit',
    SPIKE_TRAP: 'spike_trap',
    PRESSURE_PLATE: 'pressure_plate',
    COLLAPSING_FLOOR: 'collapsing_floor',
  };

  const ENEMY_STATE = {
    PATROL: 'patrol',
    INVESTIGATE: 'investigate',
    CHASE: 'chase',
    SEARCH: 'search',
  };

  const GAME_STATE = {
    TITLE: 'title',
    PLAYING: 'playing',
    PAUSED: 'paused',
    GAMEOVER: 'gameover',
  };

  const KEY_DEFS = [
    {
      id: 0,
      name: 'Brass Key',
      faName: 'کلید برنجی',
      doorName: 'Brass Gate',
      faDoorName: 'دروازه برنجی',
      color: '#eab308',
      darkColor: '#854d0e',
      glow: 'rgba(234, 179, 8, 0.48)',
    },
    {
      id: 1,
      name: 'Crimson Key',
      faName: 'کلید سرخ',
      doorName: 'Crimson Gate',
      faDoorName: 'دروازه سرخ',
      color: '#ef4444',
      darkColor: '#7f1d1d',
      glow: 'rgba(239, 68, 68, 0.48)',
    },
    {
      id: 2,
      name: 'Cobalt Key',
      faName: 'کلید کبالتی',
      doorName: 'Cobalt Gate',
      faDoorName: 'دروازه کبالتی',
      color: '#38bdf8',
      darkColor: '#0c4a6e',
      glow: 'rgba(56, 189, 248, 0.48)',
    },
    {
      id: 3,
      name: 'Obsidian Key',
      faName: 'کلید ابسیدین',
      doorName: 'Vault Seal',
      faDoorName: 'مهر خزانه',
      color: '#c084fc',
      darkColor: '#4c1d95',
      glow: 'rgba(192, 132, 252, 0.48)',
    },
  ];

  const DIFFICULTIES = {
    easy: {
      id: 'easy',
      label: 'Easy',
      faLabel: 'آسان',
      subtitle: 'Small crypt · Slow stalker · Visible hazards',
      cols: 15,
      rows: 13,
      timeLimit: 240,
      keyCount: 2,
      playerMaxHp: 110,
      enemySpeed: 1.5,
      enemyChaseSpeed: 2.05,
      enemySightRange: 4.7,
      enemyHearingRange: 3.7,
      enemyFovDeg: 98,
      enemySearchTime: 3.5,
      enemyPathInterval: 0.48,
      enemyPredict: false,
      enemySwipeDamage: 30,
      trapCount: 5,
      hiddenTrapRatio: 0.15,
      spikeDamage: 15,
      pitDamage: 20,
      plateDamage: 12,
      alcoveCount: 5,
      batteryCount: 4,
      medkitCount: 3,
      smokeCount: 2,
      relicCount: 2,
      braidFactor: 0.4,
      falsePathTraps: 1,
    },
    normal: {
      id: 'normal',
      label: 'Normal',
      faLabel: 'متوسط',
      subtitle: 'Medium labyrinth · Fair hunt · Balanced traps',
      cols: 21,
      rows: 17,
      timeLimit: 270,
      keyCount: 3,
      playerMaxHp: 100,
      enemySpeed: 1.84,
      enemyChaseSpeed: 2.52,
      enemySightRange: 5.7,
      enemyHearingRange: 4.5,
      enemyFovDeg: 115,
      enemySearchTime: 4.8,
      enemyPathInterval: 0.34,
      enemyPredict: false,
      enemySwipeDamage: 38,
      trapCount: 9,
      hiddenTrapRatio: 0.35,
      spikeDamage: 22,
      pitDamage: 30,
      plateDamage: 16,
      alcoveCount: 5,
      batteryCount: 4,
      medkitCount: 3,
      smokeCount: 2,
      relicCount: 2,
      braidFactor: 0.34,
      falsePathTraps: 3,
    },
    hard: {
      id: 'hard',
      label: 'Hard',
      faLabel: 'سخت',
      subtitle: 'Deep catacombs · Fast stalker · Hidden traps',
      cols: 27,
      rows: 21,
      timeLimit: 300,
      keyCount: 4,
      playerMaxHp: 100,
      enemySpeed: 2.24,
      enemyChaseSpeed: 3.04,
      enemySightRange: 7.0,
      enemyHearingRange: 5.7,
      enemyFovDeg: 132,
      enemySearchTime: 6.2,
      enemyPathInterval: 0.22,
      enemyPredict: true,
      enemySwipeDamage: 50,
      trapCount: 15,
      hiddenTrapRatio: 0.55,
      spikeDamage: 32,
      pitDamage: 42,
      plateDamage: 24,
      alcoveCount: 5,
      batteryCount: 3,
      medkitCount: 2,
      smokeCount: 2,
      relicCount: 3,
      braidFactor: 0.28,
      falsePathTraps: 4,
    },
  };

  const MAX_STAGES = 4;

  function getStageDifficultyConfig(difficultyId, stageNum) {
    const base = DIFFICULTIES[difficultyId] || DIFFICULTIES.normal;
    const stage = Math.max(1, Math.min(MAX_STAGES, Math.floor(Number(stageNum) || 1)));
    const step = stage - 1;
    const sizeBump = step * 2;
    const speedBump = 1 + step * 0.055;

    return {
      ...base,
      stage,
      maxStages: MAX_STAGES,
      cols: base.cols + sizeBump,
      rows: base.rows + sizeBump,
      keyCount: Math.min(4, base.keyCount + (stage >= 3 ? 1 : 0)),
      timeLimit: base.timeLimit + step * 20,
      enemySpeed: Number((base.enemySpeed * speedBump).toFixed(2)),
      enemyChaseSpeed: Number((base.enemyChaseSpeed * speedBump).toFixed(2)),
      enemySightRange: Number((base.enemySightRange + step * 0.35).toFixed(2)),
      trapCount: base.trapCount + step * 3,
      hiddenTrapRatio: Math.min(0.75, base.hiddenTrapRatio + step * 0.08),
      extraEnemies: stage >= 4 ? 1 : 0,
    };
  }

  const MP_CONFIG = {
    SIZES: {
      2: 25,
      3: 29,
      4: 33,
    },
    TIME_LIMIT: 270,
    PLAYER_COLORS: ['#38bdf8', '#f59e0b', '#10b981', '#ec4899'],
    DIFF_PRESET: {
      id: 'mp',
      label: 'Multiplayer',
      faLabel: 'چندنفره',
      playerMaxHp: 100,
      enemySpeed: 1.78,
      enemyChaseSpeed: 2.45,
      enemySightRange: 5.4,
      enemyHearingRange: 4.4,
      enemyFovDeg: 112,
      enemySearchTime: 4.5,
      enemyPathInterval: 0.34,
      enemyPredict: false,
      enemySwipeDamage: 38,
      hiddenTrapRatio: 0.3,
      spikeDamage: 20,
      pitDamage: 28,
      plateDamage: 15,
    },
  };

  const PLAYER_CFG = {
    WALK_SPEED: 3.85,
    CROUCH_SPEED_MULT: 0.38,
    CROUCH_STEALTH_MULT: 0.52,
    CROUCH_HEARING_MULT: 0.38,
    SPRINT_SPEED: 5.8,
    RADIUS: 0.27,
    MAX_STAMINA: 100,
    STAMINA_DRAIN_PER_SEC: 19,
    STAMINA_REGEN_PER_SEC: 28,
    STAMINA_EXHAUST_DELAY: 0.75,
    MAX_BATTERY: 100,
    BATTERY_DRAIN_PER_SEC: 2.5,
    BATTERY_RECHARGE_PER_SEC: 4.5,
    HURT_INVULN_SEC: 1.65,
    DISARM_DURATION_SEC: 0.4,
    DISARM_RANGE: 1.35,
    HIDE_RANGE: 1.0,
    SILK_SLOW_MULT: 0.62,
    STARTING_SMOKE_BOMBS: 2,
    MAX_SMOKE_BOMBS: 4,
    SMOKE_RADIUS: 2.6,
    SMOKE_DURATION_SEC: 6.0,
  };

  const BOSS_CFG = {
    SHOCKWAVE_COOLDOWN: 11.5,
    TELEGRAPH_SEC: 1.25,
    SHOCKWAVE_RADIUS: 3.35,
    SHOCKWAVE_DAMAGE: 20,
    SURGE_COOLDOWN: 14.0,
    SURGE_DURATION: 1.75,
    SURGE_SPEED_MULT: 1.38,
    STUN_DURATION_MULT: 0.8,
  };

  const RENDER_CFG = {
    TILE_SIZE: 52,
    AMBIENT_RADIUS_OFF: 2.25,
    AMBIENT_RADIUS_ON: 2.8,
    FLASHLIGHT_RANGE: 8.8,
    FLASHLIGHT_SPREAD_RAD: (58 * Math.PI) / 180,
    RAY_COUNT_AMBIENT: 72,
    RAY_COUNT_CONE: 64,
    PARTICLE_POOL_SIZE: 180,
  };

  const PALETTE = {
    BG: '#04060a',
    FLOOR_A: '#1e2634',
    FLOOR_B: '#18202c',
    WALL_TOP: '#334155',
    WALL_FACE: '#1e293b',
    WALL_EDGE: '#52637a',
    ALCOVE_BG: '#0d1523',
    ALCOVE_BORDER: '#475569',
    EXIT_GLOW: '#10b981',
    EXIT_LOCKED: '#64748b',
    DANGER: '#ef4444',
    AMBER: '#f59e0b',
    TEXT: '#e2e8f0',
  };

  return {
    TILE,
    TRAP_TYPE,
    ENEMY_STATE,
    GAME_STATE,
    KEY_DEFS,
    DIFFICULTIES,
    MAX_STAGES,
    getStageDifficultyConfig,
    MP_CONFIG,
    PLAYER_CFG,
    BOSS_CFG,
    RENDER_CFG,
    PALETTE,
  };
});
