/**
 * storage.js
 * Persistent localStorage profile manager for audio volumes, bilingual preference,
 * Soul Shards economy, XP/level, unlocked Skins/Flashlights/Gear/Maps/Creatures,
 * missions, achievements, best escape records, and hidden developer unlock state.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./catalog.js'));
  } else {
    root.HorrorMaze = root.HorrorMaze || {};
    Object.assign(root.HorrorMaze, factory(root.HorrorMaze));
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (catalog) {
  const STORAGE_KEY_V2 = 'hollow_labyrinth_save_v2';
  const STORAGE_KEY_V1 = 'hollow_labyrinth_save_v1';

  function createDefaults() {
    return {
      version: 2,
      language: 'en',
      playerName: 'Survivor',
      sfxEnabled: true,
      musicEnabled: true,
      sfxVolume: 0.65,
      musicVolume: 0.55,
      difficulty: 'normal',
      showMinimap: true,

      currency: 50000, // Generous starter treasury so players can freely unlock shop items
      starterGrant50k: true,
      xp: 0,
      level: 1,

      unlockedSkins: ['explorer'],
      equippedSkin: 'explorer',
      unlockedFlashlights: ['standard'],
      equippedFlashlight: 'standard',
      unlockedGear: ['none'],
      equippedGear: 'none',
      unlockedMaps: ['crypt'],
      equippedMap: 'crypt',
      unlockedEnemies: ['stalker'],
      equippedEnemy: 'stalker',

      devUnlocked: false,

      stats: {
        wins: 0,
        keys: 0,
        disarms: 0,
        relics: 0,
        hides: 0,
        purchases: 0,
        mp_win: 0,
        fast_win: 0,
        no_damage_win: 0,
        hard_win: 0,
      },
      claimedMissions: [],
      unlockedAchievements: [],

      bestRuns: {
        easy: null,
        normal: null,
        hard: null,
      },
    };
  }

  function getLevelFromXp(xp) {
    const safeXp = Math.max(0, Number(xp) || 0);
    return 1 + Math.floor(Math.sqrt(safeXp / 90));
  }

  function sanitizeArray(arr, fallback) {
    if (!Array.isArray(arr) || arr.length === 0) return [...fallback];
    return Array.from(new Set([...fallback, ...arr.filter((x) => typeof x === 'string')]));
  }

  function loadSaveData() {
    const merged = createDefaults();
    try {
      if (typeof localStorage === 'undefined') return merged;
      const rawV2 = localStorage.getItem(STORAGE_KEY_V2);
      const rawV1 = !rawV2 ? localStorage.getItem(STORAGE_KEY_V1) : null;
      const raw = rawV2 || rawV1;
      if (!raw) return merged;

      const parsed = JSON.parse(raw);
      if (parsed.language === 'fa' || parsed.language === 'en') merged.language = parsed.language;
      if (typeof parsed.playerName === 'string' && parsed.playerName.trim()) {
        merged.playerName = parsed.playerName.trim().slice(0, 18);
      }
      if (typeof parsed.sfxEnabled === 'boolean') merged.sfxEnabled = parsed.sfxEnabled;
      if (typeof parsed.musicEnabled === 'boolean') merged.musicEnabled = parsed.musicEnabled;
      if (typeof parsed.sfxVolume === 'number') merged.sfxVolume = Math.max(0, Math.min(1, parsed.sfxVolume));
      if (typeof parsed.musicVolume === 'number') merged.musicVolume = Math.max(0, Math.min(1, parsed.musicVolume));
      if (typeof parsed.showMinimap === 'boolean') merged.showMinimap = parsed.showMinimap;
      if (parsed.difficulty === 'easy' || parsed.difficulty === 'normal' || parsed.difficulty === 'hard') {
        merged.difficulty = parsed.difficulty;
      }

      if (typeof parsed.currency === 'number' && parsed.currency >= 0) {
        merged.currency = Math.floor(parsed.currency);
      }
      if (!parsed.starterGrant50k) {
        merged.currency = Math.max(merged.currency, 50000);
        merged.starterGrant50k = true;
      }
      if (typeof parsed.xp === 'number' && parsed.xp >= 0) {
        merged.xp = Math.floor(parsed.xp);
        merged.level = getLevelFromXp(merged.xp);
      }

      merged.unlockedSkins = sanitizeArray(parsed.unlockedSkins, ['explorer']);
      merged.unlockedFlashlights = sanitizeArray(parsed.unlockedFlashlights, ['standard']);
      merged.unlockedGear = sanitizeArray(parsed.unlockedGear, ['none']);
      merged.unlockedMaps = sanitizeArray(parsed.unlockedMaps, ['crypt']);
      merged.unlockedEnemies = sanitizeArray(parsed.unlockedEnemies, ['stalker']);

      if (typeof parsed.equippedSkin === 'string' && merged.unlockedSkins.includes(parsed.equippedSkin)) {
        merged.equippedSkin = parsed.equippedSkin;
      }
      if (typeof parsed.equippedFlashlight === 'string' && merged.unlockedFlashlights.includes(parsed.equippedFlashlight)) {
        merged.equippedFlashlight = parsed.equippedFlashlight;
      }
      if (typeof parsed.equippedGear === 'string' && merged.unlockedGear.includes(parsed.equippedGear)) {
        merged.equippedGear = parsed.equippedGear;
      }
      if (typeof parsed.equippedMap === 'string' && merged.unlockedMaps.includes(parsed.equippedMap)) {
        merged.equippedMap = parsed.equippedMap;
      }
      if (typeof parsed.equippedEnemy === 'string' && merged.unlockedEnemies.includes(parsed.equippedEnemy)) {
        merged.equippedEnemy = parsed.equippedEnemy;
      }

      merged.devUnlocked = Boolean(parsed.devUnlocked);

      if (parsed.stats && typeof parsed.stats === 'object') {
        for (const k of Object.keys(merged.stats)) {
          if (typeof parsed.stats[k] === 'number' && parsed.stats[k] >= 0) {
            merged.stats[k] = Math.floor(parsed.stats[k]);
          }
        }
      }
      if (Array.isArray(parsed.claimedMissions)) {
        merged.claimedMissions = parsed.claimedMissions.filter((x) => typeof x === 'string');
      }
      if (Array.isArray(parsed.unlockedAchievements)) {
        merged.unlockedAchievements = parsed.unlockedAchievements.filter((x) => typeof x === 'string');
      }

      if (parsed.bestRuns && typeof parsed.bestRuns === 'object') {
        for (const diff of ['easy', 'normal', 'hard']) {
          const entry = parsed.bestRuns[diff];
          if (entry && typeof entry.bestTimeSec === 'number' && typeof entry.bestScore === 'number') {
            merged.bestRuns[diff] = {
              bestTimeSec: entry.bestTimeSec,
              bestScore: entry.bestScore,
              wins: typeof entry.wins === 'number' ? entry.wins : 1,
            };
          }
        }
      }
      return merged;
    } catch (_err) {
      return merged;
    }
  }

  function persistSaveData(data) {
    try {
      if (typeof localStorage === 'undefined') return false;
      localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(data));
      return true;
    } catch (_err) {
      return false;
    }
  }

  function getCategoryKeys(category) {
    switch (category) {
      case 'skins':
        return { list: catalog.PLAYER_SKINS, unlockedKey: 'unlockedSkins', equippedKey: 'equippedSkin' };
      case 'flashlights':
        return { list: catalog.FLASHLIGHTS, unlockedKey: 'unlockedFlashlights', equippedKey: 'equippedFlashlight' };
      case 'gear':
        return { list: catalog.GEAR_ITEMS, unlockedKey: 'unlockedGear', equippedKey: 'equippedGear' };
      case 'maps':
        return { list: catalog.MAP_THEMES, unlockedKey: 'unlockedMaps', equippedKey: 'equippedMap' };
      case 'enemies':
        return { list: catalog.ENEMY_TYPES, unlockedKey: 'unlockedEnemies', equippedKey: 'equippedEnemy' };
      default:
        return null;
    }
  }

  function purchaseItem(saveData, category, itemId) {
    const meta = getCategoryKeys(category);
    if (!meta) return { ok: false, reason: 'invalid_category' };
    const item = meta.list.find((x) => x.id === itemId);
    if (!item) return { ok: false, reason: 'not_found' };
    const owned = saveData[meta.unlockedKey];
    if (owned.includes(itemId)) {
      saveData[meta.equippedKey] = itemId;
      persistSaveData(saveData);
      return { ok: true, alreadyOwned: true };
    }
    if (saveData.currency < item.price) {
      return { ok: false, reason: 'insufficient_funds' };
    }
    saveData.currency -= item.price;
    owned.push(itemId);
    saveData[meta.equippedKey] = itemId;
    saveData.stats.purchases = (saveData.stats.purchases || 0) + 1;
    checkMissionsAndAchievements(saveData);
    persistSaveData(saveData);
    return { ok: true, pricePaid: item.price };
  }

  function equipItem(saveData, category, itemId) {
    const meta = getCategoryKeys(category);
    if (!meta) return false;
    if (!saveData[meta.unlockedKey].includes(itemId)) return false;
    saveData[meta.equippedKey] = itemId;
    persistSaveData(saveData);
    return true;
  }

  function activateDevMode(saveData) {
    saveData.devUnlocked = true;
    saveData.currency = Math.max(saveData.currency || 0, 99999);
    saveData.unlockedSkins = catalog.PLAYER_SKINS.map((x) => x.id);
    saveData.unlockedFlashlights = catalog.FLASHLIGHTS.map((x) => x.id);
    saveData.unlockedGear = catalog.GEAR_ITEMS.map((x) => x.id);
    saveData.unlockedMaps = catalog.MAP_THEMES.map((x) => x.id);
    saveData.unlockedEnemies = catalog.ENEMY_TYPES.map((x) => x.id);
    persistSaveData(saveData);
    return true;
  }

  function checkMissionsAndAchievements(saveData) {
    const newlyCompleted = [];
    for (const m of catalog.MISSIONS) {
      if (saveData.claimedMissions.includes(m.id)) continue;
      const val = saveData.stats[m.type] || 0;
      if (val >= m.target) {
        saveData.claimedMissions.push(m.id);
        saveData.currency += m.reward;
        newlyCompleted.push(m);
      }
    }
    for (const a of catalog.ACHIEVEMENTS) {
      if (saveData.unlockedAchievements.includes(a.id)) continue;
      const val = saveData.stats[a.type] || 0;
      if (val >= a.target) {
        saveData.unlockedAchievements.push(a.id);
        saveData.currency += a.reward;
        newlyCompleted.push(a);
      }
    }
    return newlyCompleted;
  }

  function applyRunProgression(saveData, runInfo) {
    const {
      victory = false,
      difficultyId = 'normal',
      elapsedTime = 0,
      timeRemaining = 0,
      keysCollected = 0,
      trapsDisarmed = 0,
      relicsCollected = 0,
      hidesUsed = 0,
      tookDamage = true,
      score = 0,
      shardsEarned = 0,
      xpEarned = 0,
      mpRank = null,
    } = runInfo;

    saveData.currency += Math.max(0, Math.floor(shardsEarned));
    saveData.xp += Math.max(0, Math.floor(xpEarned));
    saveData.level = getLevelFromXp(saveData.xp);

    saveData.stats.keys += keysCollected;
    saveData.stats.disarms += trapsDisarmed;
    saveData.stats.relics += relicsCollected;
    saveData.stats.hides += hidesUsed;

    let isNewBest = false;
    if (mpRank !== null) {
      if (mpRank === 1) {
        saveData.stats.mp_win = (saveData.stats.mp_win || 0) + 1;
      }
    } else if (victory) {
      saveData.stats.wins += 1;
      if (timeRemaining >= 90) saveData.stats.fast_win += 1;
      if (!tookDamage) saveData.stats.no_damage_win += 1;
      if (difficultyId === 'hard') saveData.stats.hard_win += 1;
      isNewBest = recordVictory(saveData, difficultyId, elapsedTime, score);
    }

    const newlyCompleted = checkMissionsAndAchievements(saveData);
    persistSaveData(saveData);
    return { isNewBest, newlyCompleted };
  }

  function recordVictory(saveData, difficultyId, clearTimeSec, score) {
    const prev = saveData.bestRuns[difficultyId];
    let isNewBest = false;
    if (!prev) {
      saveData.bestRuns[difficultyId] = {
        bestTimeSec: clearTimeSec,
        bestScore: score,
        wins: 1,
      };
      isNewBest = true;
    } else {
      prev.wins = (prev.wins || 0) + 1;
      if (clearTimeSec < prev.bestTimeSec) {
        prev.bestTimeSec = clearTimeSec;
        isNewBest = true;
      }
      if (score > prev.bestScore) {
        prev.bestScore = score;
      }
    }
    persistSaveData(saveData);
    return isNewBest;
  }

  return {
    createDefaults,
    getLevelFromXp,
    loadSaveData,
    persistSaveData,
    purchaseItem,
    equipItem,
    activateDevMode,
    applyRunProgression,
    recordVictory,
  };
});
