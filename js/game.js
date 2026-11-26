/**
 * game.js
 * Main simulation controller:
 *  - Clamped dt game loop, unified keyboard/mouse/touch input, hitstop & camera shake
 *  - Single-Player survival mode (with equipped Skin/Flashlight/Gear/Map/Creature & Relics)
 *  - 2–4 Player Host-based LAN/Web Multiplayer race mode via WebSockets (net.js)
 *  - Shop, Missions/Achievements, Bilingual EN/FA switching, and Hidden Developer Unlock
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./config.js'),
      require('./i18n.js'),
      require('./catalog.js'),
      require('./storage.js'),
      require('./maze.js'),
      require('./traps.js'),
      require('./player.js'),
      require('./enemy.js'),
      require('./net.js'),
      require('./audio.js'),
      require('./renderer.js'),
      require('./ui.js')
    );
  } else {
    root.HorrorMaze = root.HorrorMaze || {};
    Object.assign(
      root.HorrorMaze,
      factory(
        root.HorrorMaze,
        root.HorrorMaze,
        root.HorrorMaze,
        root.HorrorMaze,
        root.HorrorMaze,
        root.HorrorMaze,
        root.HorrorMaze,
        root.HorrorMaze,
        root.HorrorMaze,
        root.HorrorMaze,
        root.HorrorMaze,
        root.HorrorMaze
      )
    );
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (
  cfg,
  i18n,
  catalog,
  storageMod,
  mazeMod,
  trapsMod,
  playerMod,
  enemyMod,
  netMod,
  audioMod,
  rendererMod,
  uiMod
) {
  const { TILE, GAME_STATE, DIFFICULTIES, MP_CONFIG, PLAYER_CFG, ENEMY_STATE } = cfg;

  class HorrorMazeGame {
    constructor(canvas) {
      this.canvas = canvas;
      this.saveData = storageMod.loadSaveData();
      i18n.setLanguage(this.saveData.language || 'en');

      this.sound = new audioMod.SoundEngine();
      this.sound.setSfxEnabled(this.saveData.sfxEnabled);
      this.sound.setMusicEnabled(this.saveData.musicEnabled);
      this.sound.setSfxVolume(this.saveData.sfxVolume ?? 0.65);
      this.sound.setMusicVolume(this.saveData.musicVolume ?? 0.55);
      this.sound.setMusicMode('menu');

      this.renderer = new rendererMod.MazeRenderer(canvas);
      this.lanUrls = [];
      this.net = new netMod.MultiplayerClient({
        onRoomState: (room) => {
          this.ui.showMpError('');
          if (room && !room.started && this.state === GAME_STATE.GAMEOVER && this.world && this.world.isMultiplayer) {
            this.world = null;
            this.state = GAME_STATE.TITLE;
            this.sound.setMusicMode('menu');
            this.ui.setState(GAME_STATE.TITLE);
            this.ui.renderTitleMeta(this.saveData);
            this.ui.openModal('mp');
          }
          this.ui.renderMpLobby(room, this.net.playerId, this.lanUrls);
        },
        onMatchStarted: (payload) => {
          this.sound.unlock();
          this.startMultiplayerMatch(payload);
        },
        onPlayerSync: (msg) => this.handleRemotePlayerSync(msg),
        onEnemySync: (msg) => this.handleRemoteEnemySync(msg),
        onPlayerFinished: (msg) => this.handleRemotePlayerFinished(msg),
        onMatchEnded: (msg) => this.handleMultiplayerMatchEnded(msg),
        onError: (code) => {
          const msg =
            code === 'ROOM_FULL'
              ? i18n.t('mpFullError')
              : code === 'ROOM_NOT_FOUND'
              ? i18n.t('mpNotFoundError')
              : code;
          this.ui.showMpError(msg);
        },
        onClose: () => {
          if (this.world && this.world.isMultiplayer && this.state === GAME_STATE.PLAYING) {
            this.ui.showToast('Disconnected from multiplayer host', 'danger');
          }
          this.ui.renderMpLobby(null, null, this.lanUrls);
        },
      });

      this.ui = new uiMod.GameUI({
        onSelectDifficulty: (diff) => this.selectDifficulty(diff),
        onStartGame: () => {
          this.sound.unlock();
          this.startNewGame(1);
        },
        onPlayAgain: (action) => {
          this.sound.unlock();
          this.handlePlayAgain(action);
        },
        onRestartGame: () => {
          this.sound.unlock();
          if (this.world && this.world.isMultiplayer) return;
          this.startNewGame(this.currentStage);
        },
        onResumeGame: () => this.resumeGame(),
        onTogglePause: () => this.togglePause(),
        onReturnTitle: () => this.returnToTitle(),
        onToggleSfx: () => this.toggleSfx(),
        onToggleMusic: () => this.toggleMusic(),
        onChangeSfxVolume: (v) => this.changeSfxVolume(v),
        onChangeMusicVolume: (v) => this.changeMusicVolume(v),
        onToggleMinimap: () => this.toggleMinimap(),
        onToggleLanguage: () => this.toggleLanguage(),
        onActivateSkill: () => this.handleActivateSkill(),

        onOpenShop: () => {
          this.ui.renderShop(this.saveData);
          this.ui.openModal('shop');
        },
        onRefreshShop: () => this.ui.renderShop(this.saveData),
        onShopAction: (cat, itemId) => this.handleShopAction(cat, itemId),

        onOpenMissions: () => {
          this.ui.renderMissions(this.saveData);
          this.ui.openModal('missions');
        },
        onRefreshMissions: () => this.ui.renderMissions(this.saveData),

        onOpenMp: () => this.openMultiplayerModal(),
        onRefreshOpenRooms: () => this.refreshOpenRooms(),
        onMpCreate: (opts) => this.handleMpCreate(opts),
        onMpJoin: (opts) => this.handleMpJoin(opts),
        onMpStart: () => this.net.startMatch(),
        onLeaveMp: () => {
          this.net.disconnect();
          this.ui.renderMpLobby(null, null, this.lanUrls);
        },
        onReturnMpLobby: () => this.returnToMpLobby(),
      });

      this.state = GAME_STATE.TITLE;
      this.currentStage = 1;
      this.world = null;
      this.hitstopTimer = 0;
      this.deathBeatTimer = 0;
      this.pendingEndSnapshot = null;
      this.heartbeatCooldown = 0;
      this.lastTime = 0;
      this.animTime = 0;

      // Secret Dev Unlock trackers (hidden from normal UI)
      this.emblemClicks = 0;
      this.emblemClickTimer = 0;
      this.devKeyBuffer = '';

      this.keysHeld = new Set();
      this.touchMove = { x: 0, y: 0, sprint: false };
      this.mouseAimActive = false;
      this.mouseClient = { x: 0, y: 0 };

      this.bindInputListeners();
      this.ui.setState(GAME_STATE.TITLE);
      this.ui.renderTitleMeta(this.saveData);
    }

    triggerHiddenDevUnlock() {
      storageMod.activateDevMode(this.saveData);
      this.sound.playKeyPickup();
      this.ui.renderTitleMeta(this.saveData);
      if (this.ui.el.shopModal && !this.ui.el.shopModal.hidden) {
        this.ui.renderShop(this.saveData);
      }
      this.ui.showToast(i18n.t('toastDevUnlocked'), 'good');
    }

    bindInputListeners() {
      if (this.ui.el.titleEmblem) {
        this.ui.el.titleEmblem.addEventListener('click', () => {
          this.emblemClicks++;
          this.emblemClickTimer = 2.0;
          if (this.emblemClicks >= 7) {
            this.emblemClicks = 0;
            this.triggerHiddenDevUnlock();
          }
        });
      }

      window.addEventListener('keydown', (e) => {
        this.sound.unlock();
        const code = e.code;
        const activeTag = document.activeElement ? document.activeElement.tagName : '';
        const isTyping = activeTag === 'INPUT' || activeTag === 'SELECT' || activeTag === 'TEXTAREA';

        // Secret developer unlock: Ctrl + Shift + Alt + D
        if (e.ctrlKey && e.shiftKey && e.altKey && code === 'KeyD') {
          e.preventDefault();
          this.triggerHiddenDevUnlock();
          return;
        }

        if (this.state === GAME_STATE.TITLE && !isTyping) {
          if (e.key && e.key.length === 1) {
            this.devKeyBuffer = (this.devKeyBuffer + e.key.toLowerCase()).slice(-9);
            if (this.devKeyBuffer === 'hollowdev') {
              this.devKeyBuffer = '';
              this.triggerHiddenDevUnlock();
              return;
            }
          }

          if (code === 'Escape' && this.ui.isAnyTitleModalOpen()) {
            this.ui.closeAllTitleModals();
            return;
          }
          if ((code === 'Enter' || code === 'Space') && !this.ui.isAnyTitleModalOpen()) {
            e.preventDefault();
            this.startNewGame(1);
          }
          return;
        }

        if (isTyping) return;

        if (
          code === 'ArrowUp' ||
          code === 'ArrowDown' ||
          code === 'ArrowLeft' ||
          code === 'ArrowRight' ||
          code === 'Space' ||
          code === 'Tab'
        ) {
          if (this.state === GAME_STATE.PLAYING) e.preventDefault();
        }

        if (this.state === GAME_STATE.GAMEOVER) {
          if ((code === 'Enter' || code === 'Space') && (!this.world || !this.world.isMultiplayer)) {
            e.preventDefault();
            const act =
              this.ui.el.btnPlayAgain && this.ui.el.btnPlayAgain.dataset
                ? this.ui.el.btnPlayAgain.dataset.action
                : 'restart';
            this.handlePlayAgain(act);
          }
          return;
        }

        if (code === 'Escape' || code === 'KeyP') {
          if (!e.repeat) {
            if (this.state === GAME_STATE.PLAYING) this.pauseGame();
            else if (this.state === GAME_STATE.PAUSED) this.resumeGame();
          }
          return;
        }

        if (this.state !== GAME_STATE.PLAYING) return;

        if (!e.repeat) {
          if (code === 'KeyF') this.toggleFlashlight();
          else if (code === 'KeyE') this.handleInteract();
          else if (code === 'KeyC') this.handleToggleCrouch();
          else if (code === 'KeyQ') this.handleDeploySmoke();
          else if (code === 'KeyV') this.handleActivateSkill();
          else if (code === 'KeyM') this.toggleSfx();
          else if (code === 'KeyR' && (!this.world || !this.world.isMultiplayer)) this.startNewGame(this.currentStage);
          else if (code === 'Tab') this.toggleMinimap();
        }

        this.keysHeld.add(code);
      });

      window.addEventListener('keyup', (e) => {
        this.keysHeld.delete(e.code);
      });

      this.canvas.addEventListener('mousemove', (e) => {
        if (this.state !== GAME_STATE.PLAYING) return;
        this.mouseAimActive = true;
        this.mouseClient.x = e.clientX;
        this.mouseClient.y = e.clientY;
      });

      this.canvas.addEventListener('mousedown', () => {
        this.sound.unlock();
      });

      const clearInputs = () => {
        this.keysHeld.clear();
        this.touchMove.x = 0;
        this.touchMove.y = 0;
        this.touchMove.sprint = false;
      };
      window.addEventListener('blur', clearInputs);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) clearInputs();
      });

      this.bindTouchControls();
    }

    bindTouchControls() {
      const padButtons = document.querySelectorAll('[data-touch-dir]');
      padButtons.forEach((btn) => {
        const dir = btn.dataset.touchDir;
        const setDir = (active) => {
          this.sound.unlock();
          if (!active) {
            this.touchMove.x = 0;
            this.touchMove.y = 0;
            btn.classList.remove('is-pressed');
            return;
          }
          btn.classList.add('is-pressed');
          if (dir === 'up') { this.touchMove.x = 0; this.touchMove.y = -1; }
          else if (dir === 'down') { this.touchMove.x = 0; this.touchMove.y = 1; }
          else if (dir === 'left') { this.touchMove.x = -1; this.touchMove.y = 0; }
          else if (dir === 'right') { this.touchMove.x = 1; this.touchMove.y = 0; }
        };
        btn.addEventListener('pointerdown', (e) => { e.preventDefault(); setDir(true); });
        btn.addEventListener('pointerup', () => setDir(false));
        btn.addEventListener('pointercancel', () => setDir(false));
        btn.addEventListener('pointerleave', () => setDir(false));
      });

      const sprintBtn = document.getElementById('touch-sprint');
      if (sprintBtn) {
        sprintBtn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          this.touchMove.sprint = true;
          sprintBtn.classList.add('is-pressed');
        });
        const releaseSprint = () => {
          this.touchMove.sprint = false;
          sprintBtn.classList.remove('is-pressed');
        };
        sprintBtn.addEventListener('pointerup', releaseSprint);
        sprintBtn.addEventListener('pointercancel', releaseSprint);
      }

      const lightBtn = document.getElementById('touch-light');
      if (lightBtn) {
        lightBtn.addEventListener('click', (e) => {
          e.currentTarget.blur();
          this.toggleFlashlight();
        });
      }

      const interactBtn = document.getElementById('touch-interact');
      if (interactBtn) {
        interactBtn.addEventListener('click', (e) => {
          e.currentTarget.blur();
          this.handleInteract();
        });
      }

      const crouchBtn = document.getElementById('touch-crouch');
      if (crouchBtn) {
        crouchBtn.addEventListener('click', (e) => {
          e.currentTarget.blur();
          this.handleToggleCrouch();
        });
      }

      const smokeBtn = document.getElementById('touch-smoke');
      if (smokeBtn) {
        smokeBtn.addEventListener('click', (e) => {
          e.currentTarget.blur();
          this.handleDeploySmoke();
        });
      }

      const skillBtn = document.getElementById('touch-skill');
      if (skillBtn) {
        skillBtn.addEventListener('click', (e) => {
          e.currentTarget.blur();
          this.handleActivateSkill();
        });
      }
    }

    toggleLanguage() {
      const next = i18n.getLanguage() === 'en' ? 'fa' : 'en';
      i18n.setLanguage(next);
      this.saveData.language = next;
      storageMod.persistSaveData(this.saveData);
      this.ui.renderTitleMeta(this.saveData);
      if (this.ui.el.shopModal && !this.ui.el.shopModal.hidden) this.ui.renderShop(this.saveData);
      if (this.ui.el.missionsModal && !this.ui.el.missionsModal.hidden) this.ui.renderMissions(this.saveData);
      if (this.ui.el.mpModal && !this.ui.el.mpModal.hidden) {
        this.ui.populateMpMapSelect(this.saveData);
        this.ui.renderMpLobby(this.net.room, this.net.playerId, this.lanUrls);
      }
    }

    handleShopAction(category, itemId) {
      this.sound.unlock();
      const res = storageMod.purchaseItem(this.saveData, category, itemId);
      if (res.ok) {
        this.sound.playPickupItem();
        this.ui.renderShop(this.saveData);
        this.ui.renderTitleMeta(this.saveData);
      }
    }

    async refreshOpenRooms() {
      const serverUrl = this.ui.el.mpServerUrlInput ? this.ui.el.mpServerUrlInput.value.trim() : '';
      const rooms = await netMod.fetchOpenRooms(serverUrl);
      this.ui.renderOpenRooms(rooms, (roomCode) => {
        if (this.ui.el.mpRoomCodeInput) this.ui.el.mpRoomCodeInput.value = roomCode;
        this.handleMpJoin({
          playerName: (this.ui.el.mpNameInput && this.ui.el.mpNameInput.value.trim()) || 'Player',
          roomCode,
          serverUrl,
        });
      });
    }

    async autoJoinFromUrl(roomCode, serverUrl) {
      const cleanCode = (roomCode || '').trim().toUpperCase();
      if (!cleanCode) return;
      await this.openMultiplayerModal();
      this.ui.setMpTab('join');
      if (this.ui.el.mpRoomCodeInput) this.ui.el.mpRoomCodeInput.value = cleanCode;
      if (serverUrl && this.ui.el.mpServerUrlInput) {
        this.ui.el.mpServerUrlInput.value = serverUrl;
      }
      await this.handleMpJoin({
        playerName: this.saveData.playerName || 'Player',
        roomCode: cleanCode,
        serverUrl: serverUrl || '',
      });
    }

    async openMultiplayerModal() {
      this.ui.populateMpMapSelect(this.saveData);
      if (this.ui.el.mpNameInput) {
        this.ui.el.mpNameInput.value = this.saveData.playerName || 'Survivor';
      }
      this.ui.showMpError('');
      this.ui.renderMpLobby(this.net.room, this.net.playerId, this.lanUrls);
      this.ui.openModal('mp');
      this.refreshOpenRooms();

      try {
        if (typeof fetch === 'function' && window.location.protocol.startsWith('http')) {
          const resp = await fetch('/api/server-info');
          if (resp.ok) {
            const info = await resp.json();
            this.lanUrls = info.lanUrls || [];
            if (this.net.room) {
              this.ui.renderMpLobby(this.net.room, this.net.playerId, this.lanUrls);
            }
          }
        }
      } catch (_err) {
        // ignore
      }
    }

    async handleMpCreate(opts) {
      this.sound.unlock();
      this.saveData.playerName = opts.playerName;
      storageMod.persistSaveData(this.saveData);
      this.ui.showMpError('');
      try {
        await this.net.connect('');
        this.net.hostRoom({
          playerName: opts.playerName,
          maxPlayers: opts.maxPlayers,
          mapId: opts.mapId,
          skinId: this.saveData.equippedSkin,
          flashlightId: this.saveData.equippedFlashlight,
          withEnemy: opts.withEnemy,
          enemyTypeId: this.saveData.equippedEnemy,
        });
      } catch (_err) {
        this.ui.showMpError(i18n.t('mpNotFoundError'));
      }
    }

    async handleMpJoin(opts) {
      this.sound.unlock();
      this.saveData.playerName = opts.playerName;
      storageMod.persistSaveData(this.saveData);
      this.ui.showMpError('');
      if (!opts.roomCode) {
        this.ui.showMpError(i18n.t('mpNotFoundError'));
        return;
      }
      try {
        await this.net.connect(opts.serverUrl);
        this.net.joinRoom({
          roomCode: opts.roomCode,
          playerName: opts.playerName,
          skinId: this.saveData.equippedSkin,
          flashlightId: this.saveData.equippedFlashlight,
        });
      } catch (_err) {
        this.ui.showMpError(i18n.t('mpNotFoundError'));
      }
    }

    selectDifficulty(diffId) {
      if (!DIFFICULTIES[diffId]) return;
      this.currentStage = 1;
      this.saveData.difficulty = diffId;
      storageMod.persistSaveData(this.saveData);
      this.ui.renderTitleMeta(this.saveData);
    }

    toggleSfx() {
      this.sound.unlock();
      this.saveData.sfxEnabled = !this.saveData.sfxEnabled;
      this.sound.setSfxEnabled(this.saveData.sfxEnabled);
      storageMod.persistSaveData(this.saveData);
      this.ui.syncAudioButtons(this.saveData);
    }

    toggleMusic() {
      this.sound.unlock();
      this.saveData.musicEnabled = !this.saveData.musicEnabled;
      this.sound.setMusicEnabled(this.saveData.musicEnabled);
      storageMod.persistSaveData(this.saveData);
      this.ui.syncAudioButtons(this.saveData);
    }

    changeSfxVolume(vol) {
      this.sound.unlock();
      this.saveData.sfxVolume = Math.max(0, Math.min(1, vol));
      this.sound.setSfxVolume(this.saveData.sfxVolume);
      storageMod.persistSaveData(this.saveData);
      this.ui.syncAudioButtons(this.saveData);
    }

    changeMusicVolume(vol) {
      this.sound.unlock();
      this.saveData.musicVolume = Math.max(0, Math.min(1, vol));
      this.sound.setMusicVolume(this.saveData.musicVolume);
      storageMod.persistSaveData(this.saveData);
      this.ui.syncAudioButtons(this.saveData);
    }

    toggleMinimap() {
      this.saveData.showMinimap = !this.saveData.showMinimap;
      storageMod.persistSaveData(this.saveData);
      if (this.world) this.world.showMinimap = this.saveData.showMinimap;
      this.ui.syncAudioButtons(this.saveData);
    }

    getEquippedLoadout() {
      return {
        skinId: this.saveData.equippedSkin,
        flashlightId: this.saveData.equippedFlashlight,
        gearId: this.saveData.equippedGear,
      };
    }

    handlePlayAgain(action) {
      const maxStages = cfg.MAX_STAGES || 4;
      if (action === 'next_stage') {
        this.startNewGame(Math.min(maxStages, this.currentStage + 1));
      } else if (action === 'restart_campaign') {
        this.startNewGame(1);
      } else {
        this.startNewGame(this.currentStage);
      }
    }

    startNewGame(stageOverride) {
      this.keysHeld.clear();
      this.mouseAimActive = false;
      this.hitstopTimer = 0;
      this.deathBeatTimer = 0;
      this.pendingEndSnapshot = null;

      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }

      const maxStages = cfg.MAX_STAGES || 4;
      if (typeof stageOverride === 'number' && !Number.isNaN(stageOverride)) {
        this.currentStage = Math.max(1, Math.min(maxStages, Math.floor(stageOverride)));
      }

      const diffId = this.saveData.difficulty || 'normal';
      const maze = mazeMod.generateMaze(diffId, undefined, {
        mapId: this.saveData.equippedMap,
        stage: this.currentStage,
      });
      const diffCfg = maze.difficulty;
      const player = playerMod.createPlayer(maze.start, diffCfg, this.getEquippedLoadout());
      const isBossStage = this.currentStage >= maxStages;
      const enemies = [
        isBossStage
          ? enemyMod.createEnemy(maze.enemySpawn, diffCfg, 'abyssal_warden', { isBoss: true })
          : enemyMod.createEnemy(maze.enemySpawn, diffCfg, this.saveData.equippedEnemy),
      ];
      for (const sp of maze.extraEnemySpawns || []) {
        enemies.push(enemyMod.createEnemy(sp, diffCfg, this.saveData.equippedEnemy));
      }
      const explored = Array.from({ length: maze.rows }, () => new Uint8Array(maze.cols));

      this.world = {
        isMultiplayer: false,
        stage: this.currentStage,
        maxStages,
        maze,
        diffCfg,
        player,
        enemy: enemies[0],
        enemies,
        webs: [],
        smokeClouds: [],
        gasClouds: [],
        gasDamageTick: 0,
        shockwaveRings: [],
        sonarPulses: [],
        sonarCooldown: 0.6,
        remotePlayers: [],
        explored,
        blockedCoords: new Set(),
        cols: maze.cols,
        rows: maze.rows,
        timeLimit: diffCfg.timeLimit,
        timeLeft: diffCfg.timeLimit,
        elapsedTime: 0,
        nextEventTimer: this.currentStage >= 2 ? 22 : 36,
        surgeTimer: 0,
        powerOutageTimer: 0,
        fullMapRevealTimer: 0,
        interactLabel: '',
        showMinimap: this.saveData.showMinimap,
      };

      this.renderer.camX = player.x;
      this.renderer.camY = player.y;
      this.renderer.trauma = 0;
      this.renderer.hitFlash = 0;
      this.renderer.jumpscareFlash = 0;

      this.sound.setChaseState(false);
      this.sound.setMusicMode('gameplay');
      this.ui.initKeySlots(maze.keys.length, false);
      this.ui.hpGhostPct = 100;
      this.state = GAME_STATE.PLAYING;
      this.ui.setState(GAME_STATE.PLAYING);
      this.ui.showToast(
        isBossStage
          ? i18n.t('toastBossSpawn')
          : `${i18n.t('stageBadge', { cur: this.currentStage, max: maxStages })} · ${i18n.t('toastStart')}`,
        isBossStage ? 'danger' : 'info'
      );
      this.ui.updateHUD(this.world, 0);
    }

    startMultiplayerMatch(payload) {
      this.keysHeld.clear();
      this.mouseAimActive = false;
      this.hitstopTimer = 0;
      this.deathBeatTimer = 0;
      this.pendingEndSnapshot = null;

      const { seed, maxPlayers, mapId, withEnemy, enemyTypeId, players } = payload;
      const maze = mazeMod.generateMultiplayerMaze(maxPlayers, mapId, seed);
      const diffCfg = maze.difficulty;

      const selfInfo = players.find((p) => p.id === this.net.playerId) || players[0];
      const spawnTile = maze.spawns[selfInfo.slotIndex % maze.spawns.length];
      const player = playerMod.createPlayer(spawnTile, diffCfg, this.getEquippedLoadout());

      const remotePlayers = players
        .filter((p) => p.id !== selfInfo.id)
        .map((p) => {
          const sp = maze.spawns[p.slotIndex % maze.spawns.length];
          return {
            id: p.id,
            slotIndex: p.slotIndex,
            name: p.name,
            skinId: p.skinId || 'explorer',
            flashlightId: p.flashlightId || 'standard',
            x: sp.x + 0.5,
            y: sp.y + 0.5,
            angle: 0,
            flashlightOn: true,
            hp: 100,
            hidden: false,
            alive: true,
            finishedRank: null,
            isMoving: false,
            isSprinting: false,
            hurtTimer: 0,
          };
        });

      const enemy = withEnemy
        ? enemyMod.createEnemy(maze.enemySpawn, diffCfg, enemyTypeId || 'stalker')
        : null;
      const explored = Array.from({ length: maze.rows }, () => new Uint8Array(maze.cols));

      this.world = {
        isMultiplayer: true,
        stage: 1,
        maxStages: 1,
        selfId: selfInfo.id,
        selfSlot: selfInfo.slotIndex,
        selfName: selfInfo.name,
        mpPlayerCount: maxPlayers,
        mpTargetFinishers: maxPlayers === 4 ? 3 : maxPlayers,
        mpFinishers: [],
        maze,
        diffCfg,
        player,
        enemy,
        enemies: enemy ? [enemy] : [],
        webs: [],
        smokeClouds: [],
        gasClouds: [],
        gasDamageTick: 0,
        shockwaveRings: [],
        sonarPulses: [],
        sonarCooldown: 0.8,
        remotePlayers,
        explored,
        blockedCoords: new Set(),
        cols: maze.cols,
        rows: maze.rows,
        timeLimit: MP_CONFIG.TIME_LIMIT,
        timeLeft: MP_CONFIG.TIME_LIMIT,
        elapsedTime: 0,
        nextEventTimer: 45,
        surgeTimer: 0,
        powerOutageTimer: 0,
        fullMapRevealTimer: 0,
        interactLabel: '',
        showMinimap: this.saveData.showMinimap,
      };

      this.renderer.camX = player.x;
      this.renderer.camY = player.y;
      this.renderer.trauma = 0;
      this.renderer.hitFlash = 0;
      this.renderer.jumpscareFlash = 0;

      this.sound.setChaseState(false);
      this.sound.setMusicMode('gameplay');
      this.ui.initKeySlots(0, true);
      this.ui.hpGhostPct = 100;
      this.state = GAME_STATE.PLAYING;
      this.ui.setState(GAME_STATE.PLAYING);
      this.ui.showToast(i18n.t('toastStartMp'), 'info');
      this.ui.updateHUD(this.world, 0);
      this.net.sendPlayerState(player, true);
    }

    handleRemotePlayerSync(msg) {
      if (!this.world || !this.world.isMultiplayer) return;
      const rp = this.world.remotePlayers.find((p) => p.id === msg.playerId);
      if (!rp) return;
      rp.x = msg.x;
      rp.y = msg.y;
      rp.angle = msg.angle;
      rp.flashlightOn = msg.flashlightOn;
      rp.hp = msg.hp;
      rp.hidden = msg.hidden;
      rp.alive = msg.alive;
    }

    handleRemoteEnemySync(msg) {
      if (!this.world || !this.world.isMultiplayer || !this.world.enemy) return;
      if (this.net.room && this.net.room.hostId === this.net.playerId) return;
      this.world.enemySyncTarget = {
        x: msg.x,
        y: msg.y,
        angle: msg.angle,
        state: msg.state,
        animPhase: msg.animPhase,
      };
      if (msg.droppedWeb) {
        this.world.webs.push(msg.droppedWeb);
      }
    }

    handleRemotePlayerFinished(msg) {
      if (!this.world || !this.world.isMultiplayer) return;
      this.world.mpFinishers.push(msg);

      if (msg.playerId === this.world.selfId) {
        this.world.player.finishedRank = msg.rank;
      } else {
        const rp = this.world.remotePlayers.find((p) => p.id === msg.playerId);
        if (rp) rp.finishedRank = msg.rank;
      }

      const rankWord =
        msg.rank === 1
          ? i18n.t('mpRank1')
          : msg.rank === 2
          ? i18n.t('mpRank2')
          : msg.rank === 3
          ? i18n.t('mpRank3')
          : i18n.t('mpRank4');
      this.sound.playKeyPickup();
      this.ui.showToast(i18n.t('toastFinishedMp', { name: msg.name, rank: rankWord }), 'good');
    }

    handleMultiplayerMatchEnded(msg) {
      if (!this.world || !this.world.isMultiplayer) return;
      const w = this.world;
      const selfEntry = msg.rankings.find((r) => r.playerId === w.selfId);
      const myRank = selfEntry && selfEntry.rank > 0 ? selfEntry.rank : null;
      const victory = myRank === 1 || (myRank !== null && myRank <= 3);

      const rating = catalog.calculateRunRating({
        victory,
        elapsedTime: Math.round(w.elapsedTime),
        timeRemaining: w.timeLeft,
        keysCollected: 0,
        totalKeys: 0,
        trapsDisarmed: w.player.trapsDisarmed,
        relicsCollected: w.player.relicsCollected,
        hpRatio: w.player.hp / w.player.maxHp,
        tookDamage: w.player.tookDamage,
        difficultyId: 'normal',
        mapId: w.maze.mapId || 'crypt',
        mpRank: myRank || 4,
        mpPlayerCount: w.mpPlayerCount,
      });

      storageMod.applyRunProgression(this.saveData, {
        victory,
        elapsedTime: Math.round(w.elapsedTime),
        timeRemaining: w.timeLeft,
        trapsDisarmed: w.player.trapsDisarmed,
        relicsCollected: w.player.relicsCollected,
        hidesUsed: w.player.hidesUsed,
        score: rating.totalScore,
        shardsEarned: rating.shardsEarned,
        xpEarned: rating.xpEarned,
        mpRank: myRank || 4,
      });

      if (victory) this.sound.playVictory();
      else this.sound.playGameOver();

      const rankLabel =
        myRank === 1
          ? i18n.t('mpRank1')
          : myRank === 2
          ? i18n.t('mpRank2')
          : myRank === 3
          ? i18n.t('mpRank3')
          : i18n.t('mpDnf');

      this.sound.setMusicMode('menu');
      this.sound.setAmbienceTension(0);
      this.state = GAME_STATE.GAMEOVER;
      this.ui.showEndScreen({
        isMultiplayer: true,
        victory,
        reason: `${rankLabel}`,
        elapsedTime: Math.round(w.elapsedTime),
        mpRankLabel: rankLabel,
        mpRankings: msg.rankings,
        rating,
      });
    }

    returnToMpLobby() {
      this.world = null;
      this.state = GAME_STATE.TITLE;
      this.sound.setMusicMode('menu');
      this.ui.setState(GAME_STATE.TITLE);
      this.ui.renderTitleMeta(this.saveData);
      if (this.net.room) {
        this.net.returnToLobby();
      }
      this.openMultiplayerModal();
    }

    pauseGame() {
      if (this.state !== GAME_STATE.PLAYING || this.deathBeatTimer > 0) return;
      if (this.world && this.world.isMultiplayer) return; // Don't freeze real-time MP
      this.keysHeld.clear();
      this.state = GAME_STATE.PAUSED;
      this.sound.setAmbienceTension(0);
      this.ui.setState(GAME_STATE.PAUSED);
    }

    resumeGame() {
      if (this.state !== GAME_STATE.PAUSED) return;
      this.keysHeld.clear();
      this.state = GAME_STATE.PLAYING;
      this.ui.setState(GAME_STATE.PLAYING);
    }

    togglePause() {
      if (this.state === GAME_STATE.PLAYING) this.pauseGame();
      else if (this.state === GAME_STATE.PAUSED) this.resumeGame();
    }

    returnToTitle() {
      this.keysHeld.clear();
      if (this.world && this.world.isMultiplayer) {
        this.net.disconnect();
      }
      this.world = null;
      this.currentStage = 1;
      this.deathBeatTimer = 0;
      this.pendingEndSnapshot = null;
      this.state = GAME_STATE.TITLE;
      this.sound.setChaseState(false);
      this.sound.setMusicMode('menu');
      this.sound.setAmbienceTension(0);
      this.ui.setState(GAME_STATE.TITLE);
      this.ui.renderTitleMeta(this.saveData);
    }

    toggleFlashlight() {
      if (!this.world || !this.world.player.alive) return;
      const p = this.world.player;
      if (!p.flashlightOn && p.battery < 4) {
        this.ui.showToast(i18n.t('toastBatteryEmpty'), 'warn');
        return;
      }
      p.flashlightOn = !p.flashlightOn;
      this.sound.playFlashlightToggle();
    }

    handleToggleCrouch() {
      if (!this.world || !this.world.player.alive) return;
      const crouching = playerMod.toggleCrouch(this.world.player);
      this.sound.playCrouchToggle(crouching);
      this.ui.showToast(i18n.t(crouching ? 'toastCrouchOn' : 'toastCrouchOff'), 'info');
    }

    handleDeploySmoke() {
      if (!this.world || !this.world.player.alive) return;
      const p = this.world.player;
      if ((p.smokeBombs || 0) <= 0) {
        this.ui.showToast(i18n.t('toastNoSmoke'), 'warn');
        return;
      }
      p.smokeBombs -= 1;
      const dur = PLAYER_CFG.SMOKE_DURATION_SEC || 6.0;
      const rad = PLAYER_CFG.SMOKE_RADIUS || 2.6;
      if (!Array.isArray(this.world.smokeClouds)) this.world.smokeClouds = [];
      this.world.smokeClouds.push({
        x: p.x,
        y: p.y,
        radius: rad,
        ttl: dur,
        maxTtl: dur,
      });
      this.sound.playSmokeDeploy();
      this.renderer.spawnBurst(p.x, p.y, 18, '#cbd5e1', 0.9, 2.8, 0.7);
      this.ui.showToast(i18n.t('toastSmokeUsed'), 'good');
    }

    handleActivateSkill() {
      if (!this.world || !this.world.player.alive) return;
      const w = this.world;
      const p = w.player;
      const activeEnemies =
        Array.isArray(w.enemies) && w.enemies.length > 0 ? w.enemies : w.enemy ? [w.enemy] : [];
      const res = playerMod.activatePlayerSkill(p, activeEnemies);

      if (!res.activated) {
        if (res.reason === 'passive') {
          const skin = catalog.getById(catalog.PLAYER_SKINS, p.skinId || 'explorer');
          const sName = skin && skin.skill ? i18n.pick(skin.skill.name) : '';
          this.ui.showToast(i18n.t('toastSkillPassiveNote', { name: sName }), 'info');
        } else if (res.reason === 'cooldown') {
          this.ui.showToast(i18n.t('toastSkillCooldown', { sec: Math.ceil(res.remaining || 1) }), 'warn');
        }
        return;
      }

      this.sound.playSkillActivate(res.skillId);
      if (res.skillId === 'map_scan') {
        w.fullMapRevealTimer = res.durationSec || 8.0;
        this.renderer.spawnBurst(p.x, p.y, 20, '#38bdf8', 1.4, 4.2, 0.65);
        this.ui.showToast(i18n.t('toastSkillMapScan'), 'good');
      } else if (res.skillId === 'adrenaline_rush') {
        this.renderer.spawnBurst(p.x, p.y, 18, '#fbbf24', 1.5, 4.5, 0.55);
        this.ui.showToast(i18n.t('toastSkillOverdrive'), 'good');
      } else if (res.skillId === 'shock_stun') {
        w.shockwaveRings.push({ x: p.x, y: p.y, radius: 6.2, ttl: 0.45, maxTtl: 0.45 });
        this.renderer.addTrauma(0.38);
        this.renderer.spawnBurst(p.x, p.y, 24, '#38bdf8', 1.8, 5.2, 0.55);
        if (res.stunnedCount > 0) {
          this.ui.showToast(i18n.t('toastSkillStun', { count: res.stunnedCount }), 'good');
        } else {
          this.ui.showToast(i18n.t('toastSkillStunMiss', { sec: 8 }), 'warn');
        }
      }
    }

    findNearestInteractable() {
      if (!this.world) return null;
      const { player, maze } = this.world;

      for (const door of maze.doors) {
        if (door.unlocked) continue;
        const d = Math.hypot(door.x + 0.5 - player.x, door.y + 0.5 - player.y);
        if (d <= 1.35) {
          const hasKey = player.keysCollected.includes(door.keyIndex);
          const dName = i18n.getLanguage() === 'fa' ? door.faName : door.name;
          if (hasKey) {
            return { kind: 'door', target: door, label: i18n.t('promptUnlock', { door: dName }) };
          }
          const kDef = cfg.KEY_DEFS[door.keyIndex];
          const kName = i18n.getLanguage() === 'fa' ? kDef.faName : kDef.name;
          return { kind: 'locked_door_hint', target: door, label: i18n.t('promptLocked', { key: kName }) };
        }
      }

      let bestTrap = null;
      let bestTrapDist = PLAYER_CFG.DISARM_RANGE + (player.mods ? player.mods.disarmBonus : 0);
      for (const trap of maze.traps) {
        if (!trapsMod.canDisarmTrap(trap)) continue;
        const d = Math.hypot(trap.x + 0.5 - player.x, trap.y + 0.5 - player.y);
        if (d <= bestTrapDist) {
          bestTrapDist = d;
          bestTrap = trap;
        }
      }
      if (bestTrap) {
        return { kind: 'trap', target: bestTrap, label: i18n.t('promptDisarm') };
      }

      const pTx = Math.floor(player.x);
      const pTy = Math.floor(player.y);
      if (maze.grid[pTy] && maze.grid[pTy][pTx] === TILE.ALCOVE) {
        return {
          kind: 'alcove',
          target: { x: pTx, y: pTy },
          label: player.hidden ? i18n.t('promptUnhide') : i18n.t('promptHide'),
        };
      }
      for (let i = 0; i < maze.alcoves.length; i++) {
        const ac = maze.alcoves[i];
        const d = Math.hypot(ac.x + 0.5 - player.x, ac.y + 0.5 - player.y);
        if (d <= PLAYER_CFG.HIDE_RANGE) {
          return { kind: 'alcove', target: ac, label: i18n.t('promptHide') };
        }
      }

      return null;
    }

    handleInteract() {
      if (!this.world || !this.world.player.alive) return;
      const item = this.findNearestInteractable();
      if (!item) return;

      const { player } = this.world;

      if (item.kind === 'door') {
        const door = item.target;
        door.unlocked = true;
        this.sound.playDoorUnlock();
        this.renderer.spawnBurst(door.x + 0.5, door.y + 0.5, 18, door.color, 1.5, 4.5, 0.55);
        this.renderer.addTrauma(0.22);
        this.hitstopTimer = 0.04;
        const dName = i18n.getLanguage() === 'fa' ? door.faName : door.name;
        this.ui.showToast(i18n.t('toastUnlocked', { door: dName }), 'good');
      } else if (item.kind === 'trap') {
        if (trapsMod.disarmTrap(item.target)) {
          player.trapsDisarmed++;
          this.sound.playDisarm();
          this.renderer.spawnBurst(item.target.x + 0.5, item.target.y + 0.5, 10, '#94a3b8', 1.0, 3.0, 0.4);
          this.ui.showToast(i18n.t('toastDisarmed'), 'good');
        }
      } else if (item.kind === 'alcove') {
        player.hidden = !player.hidden;
        if (player.hidden) {
          player.hidesUsed++;
          player.x = item.target.x + 0.5;
          player.y = item.target.y + 0.5;
          player.isSprinting = false;
          this.ui.showToast(i18n.t('toastHidden'), 'info');
        } else {
          this.ui.showToast(i18n.t('toastUnhidden'), 'info');
        }
      } else if (item.kind === 'locked_door_hint') {
        this.ui.showToast(item.label, 'warn');
      }
    }

    computeMovementInput() {
      let mx = 0;
      let my = 0;
      if (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp')) my -= 1;
      if (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown')) my += 1;
      if (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft')) mx -= 1;
      if (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight')) mx += 1;

      if (mx === 0 && my === 0) {
        mx = this.touchMove.x;
        my = this.touchMove.y;
      }

      const sprint =
        this.keysHeld.has('ShiftLeft') ||
        this.keysHeld.has('ShiftRight') ||
        this.touchMove.sprint;

      let aimAngle = null;
      if (this.mouseAimActive && this.world) {
        const wPos = this.renderer.screenToWorld(this.mouseClient.x, this.mouseClient.y);
        const dx = wPos.x - this.world.player.x;
        const dy = wPos.y - this.world.player.y;
        if (Math.hypot(dx, dy) > 0.15) {
          aimAngle = Math.atan2(dy, dx);
        }
      }

      return { moveX: mx, moveY: my, sprint, aimAngle };
    }

    triggerEndSequence(victory, reason) {
      if (this.pendingEndSnapshot) return;
      const w = this.world;
      const elapsed = Math.round(w.elapsedTime);
      const rating = catalog.calculateRunRating({
        victory,
        elapsedTime: elapsed,
        timeRemaining: w.timeLeft,
        keysCollected: w.player.keysCollected.length,
        totalKeys: w.maze.keys.length,
        trapsDisarmed: w.player.trapsDisarmed,
        relicsCollected: w.player.relicsCollected,
        hpRatio: w.player.hp / w.player.maxHp,
        tookDamage: w.player.tookDamage,
        difficultyId: w.diffCfg.id,
        mapId: w.maze.mapId || 'crypt',
      });

      const prog = storageMod.applyRunProgression(this.saveData, {
        victory,
        difficultyId: w.diffCfg.id,
        elapsedTime: elapsed,
        timeRemaining: w.timeLeft,
        keysCollected: w.player.keysCollected.length,
        trapsDisarmed: w.player.trapsDisarmed,
        relicsCollected: w.player.relicsCollected,
        hidesUsed: w.player.hidesUsed,
        tookDamage: w.player.tookDamage,
        score: rating.totalScore,
        shardsEarned: rating.shardsEarned,
        xpEarned: rating.xpEarned,
      });

      if (victory) {
        this.sound.playVictory();
      } else {
        this.sound.playGameOver();
        this.renderer.triggerJumpscare();
      }

      const best = this.saveData.bestRuns[w.diffCfg.id];
      const diffName = i18n.getLanguage() === 'fa' ? w.diffCfg.faLabel : w.diffCfg.label;
      this.pendingEndSnapshot = {
        isMultiplayer: false,
        victory,
        reason,
        stage: w.stage || 1,
        maxStages: w.maxStages || cfg.MAX_STAGES || 4,
        difficultyLabel: diffName,
        elapsedTime: elapsed,
        timeRemaining: w.timeLeft,
        keysCollected: w.player.keysCollected.length,
        totalKeys: w.maze.keys.length,
        rating,
        isNewBest: prog.isNewBest,
        bestTimeSec: best ? best.bestTimeSec : null,
      };

      this.sound.setChaseState(false);
      this.sound.setMusicMode('menu');
      this.sound.setAmbienceTension(0);
      this.deathBeatTimer = victory ? 0.12 : 0.55;
    }

    stepSimulation(dt) {
      const w = this.world;
      if (!w) return;

      if (this.deathBeatTimer > 0) {
        this.deathBeatTimer -= dt;
        if (this.deathBeatTimer <= 0) {
          this.state = GAME_STATE.GAMEOVER;
          this.ui.showEndScreen(this.pendingEndSnapshot);
          this.pendingEndSnapshot = null;
        }
        return;
      }

      if (this.hitstopTimer > 0) {
        this.hitstopTimer -= dt;
        return;
      }

      w.elapsedTime += dt;
      w.timeLeft = Math.max(0, w.timeLeft - dt);
      if (w.timeLeft <= 0) {
        if (w.isMultiplayer) {
          this.net.sendTimeout();
          return;
        }
        w.player.alive = false;
        this.triggerEndSequence(false, 'The labyrinth sealed shut before you escaped');
        return;
      }

      // Higher-stage environmental hazards & mid-run events
      if (w.surgeTimer > 0) w.surgeTimer = Math.max(0, w.surgeTimer - dt);
      if (w.powerOutageTimer > 0) w.powerOutageTimer = Math.max(0, w.powerOutageTimer - dt);
      if (w.fullMapRevealTimer > 0) w.fullMapRevealTimer = Math.max(0, w.fullMapRevealTimer - dt);

      w.nextEventTimer -= dt;
      if (w.nextEventTimer <= 0) {
        w.nextEventTimer = w.stage >= 2 ? 26 + Math.random() * 14 : 42 + Math.random() * 22;
        const mapId = w.maze.mapId || 'crypt';
        const roll = Math.random();
        if (!w.isMultiplayer && w.stage >= 2) {
          const outageBias = mapId === 'bio_lab' ? 0.45 : 0.32;
          const gasBias = mapId === 'sewers' ? 0.78 : 0.64;
          if (roll < outageBias) {
            w.powerOutageTimer = 6.5;
            this.sound.playPowerOutage();
            this.renderer.addTrauma(0.22);
            this.ui.showToast(i18n.t('toastPowerOutage'), 'danger');
          } else if (roll < gasBias) {
            // Spawn 2 toxic gas clouds near corridors ahead of player
            const floorTiles = [];
            const pTx = Math.floor(w.player.x);
            const pTy = Math.floor(w.player.y);
            for (let dy = -4; dy <= 4; dy++) {
              for (let dx = -4; dx <= 4; dx++) {
                const tx = pTx + dx;
                const ty = pTy + dy;
                const dist = Math.hypot(dx, dy);
                if (
                  dist >= 1.5 &&
                  dist <= 4.5 &&
                  w.maze.grid[ty] &&
                  w.maze.grid[ty][tx] !== TILE.WALL
                ) {
                  floorTiles.push({ x: tx + 0.5, y: ty + 0.5 });
                }
              }
            }
            const count = Math.min(2, floorTiles.length);
            for (let c = 0; c < count; c++) {
              const idx = Math.floor(Math.random() * floorTiles.length);
              const spot = floorTiles.splice(idx, 1)[0];
              w.gasClouds.push({ x: spot.x, y: spot.y, radius: 1.95, ttl: 9.5, maxTtl: 9.5 });
            }
            this.sound.playSmokeDeploy();
            this.ui.showToast(i18n.t('toastToxicGas'), 'warn');
          } else {
            this.renderer.addTrauma(0.28);
            for (const tr of w.maze.traps) {
              if (Math.hypot(tr.x + 0.5 - w.player.x, tr.y + 0.5 - w.player.y) <= 5.5) {
                tr.revealed = true;
              }
            }
            this.ui.showToast(i18n.t('toastEventTremor'), 'info');
          }
        } else if (roll < 0.55) {
          w.surgeTimer = 3.0;
          this.sound.playFlashlightToggle();
          this.ui.showToast(i18n.t('toastEventSurge'), 'warn');
        } else {
          this.renderer.addTrauma(0.28);
          for (const tr of w.maze.traps) {
            if (Math.hypot(tr.x + 0.5 - w.player.x, tr.y + 0.5 - w.player.y) <= 5.5) {
              tr.revealed = true;
            }
          }
          this.ui.showToast(i18n.t('toastEventTremor'), 'info');
        }
      }

      // Tick active smoke clouds, gas clouds, shockwave rings & sonar pulses
      if (Array.isArray(w.smokeClouds)) {
        for (let i = w.smokeClouds.length - 1; i >= 0; i--) {
          w.smokeClouds[i].ttl -= dt;
          if (w.smokeClouds[i].ttl <= 0) w.smokeClouds.splice(i, 1);
        }
      }
      if (Array.isArray(w.gasClouds)) {
        for (let i = w.gasClouds.length - 1; i >= 0; i--) {
          w.gasClouds[i].ttl -= dt;
          if (w.gasClouds[i].ttl <= 0) w.gasClouds.splice(i, 1);
        }
      }
      if (Array.isArray(w.shockwaveRings)) {
        for (let i = w.shockwaveRings.length - 1; i >= 0; i--) {
          w.shockwaveRings[i].ttl -= dt;
          if (w.shockwaveRings[i].ttl <= 0) w.shockwaveRings.splice(i, 1);
        }
      }
      if (Array.isArray(w.sonarPulses)) {
        for (let i = w.sonarPulses.length - 1; i >= 0; i--) {
          w.sonarPulses[i].ttl -= dt;
          if (w.sonarPulses[i].ttl <= 0) w.sonarPulses.splice(i, 1);
        }
      }

      // 1. Update Local Player (unless already finished MP race -> spectate/wait)
      if (w.player.alive && w.player.finishedRank === null) {
        if (!w.player.toxicImmune && Array.isArray(w.gasClouds) && w.gasClouds.length > 0) {
          const inGas = w.gasClouds.some(
            (gc) => Math.hypot(w.player.x - gc.x, w.player.y - gc.y) <= gc.radius
          );
          if (inGas) {
            w.player.toxicSlowTimer = 0.35;
            w.gasDamageTick = (w.gasDamageTick || 0) + dt;
            if (w.gasDamageTick >= 1.2) {
              w.gasDamageTick -= 1.2;
              const gasDmg = playerMod.damagePlayer(w.player, 6, 'Overcome by toxic sewer gas');
              if (gasDmg.tookDamage) {
                this.renderer.triggerHitFlash(0.45);
                if (gasDmg.died) {
                  this.triggerEndSequence(false, 'Overcome by toxic sewer gas');
                  return;
                }
              }
            }
          }
        }

        const input = this.computeMovementInput();
        const pRes = playerMod.updatePlayer(
          w.player,
          input,
          w.maze.grid,
          w.maze.doorsByCoord,
          w.blockedCoords,
          dt
        );
        if (pRes.brewedSmoke) {
          this.sound.playSkillActivate('alchemical_immunity');
          this.ui.showToast(i18n.t('toastDoctorBrew'), 'good');
        }
        if (pRes.stepTriggered) {
          this.sound.playFootstep(w.player.isSprinting, pRes.isQuietStep);
        }
        if (pRes.batteryEmpty) {
          this.sound.playFlashlightToggle();
          this.ui.showToast(i18n.t('toastBatteryEmpty'), 'warn');
        }
      }

      // 2. Doors Auto-unlock
      for (const door of w.maze.doors) {
        if (door.unlocked) continue;
        const distDoor = Math.hypot(door.x + 0.5 - w.player.x, door.y + 0.5 - w.player.y);
        if (distDoor < 0.85 && w.player.keysCollected.includes(door.keyIndex)) {
          door.unlocked = true;
          this.sound.playDoorUnlock();
          this.renderer.spawnBurst(door.x + 0.5, door.y + 0.5, 18, door.color, 1.5, 4.5, 0.55);
          this.renderer.addTrauma(0.22);
          this.hitstopTimer = 0.04;
          const dName = i18n.getLanguage() === 'fa' ? door.faName : door.name;
          this.ui.showToast(i18n.t('toastUnlocked', { door: dName }), 'good');
        }
      }

      // 3. Collect Keys, Relics, Pickups
      for (const k of w.maze.keys) {
        if (k.collected) continue;
        if (Math.hypot(k.x + 0.5 - w.player.x, k.y + 0.5 - w.player.y) < 0.65) {
          k.collected = true;
          w.player.keysCollected.push(k.keyIndex);
          this.sound.playKeyPickup();
          this.renderer.spawnBurst(k.x + 0.5, k.y + 0.5, 22, k.color, 1.5, 5.0, 0.6);
          const kName = i18n.getLanguage() === 'fa' ? k.faName : k.name;
          this.ui.showToast(i18n.t('toastKey', { key: kName }), 'good');
        }
      }

      for (const rel of w.maze.relics || []) {
        if (rel.collected) continue;
        if (Math.hypot(rel.x + 0.5 - w.player.x, rel.y + 0.5 - w.player.y) < 0.65) {
          rel.collected = true;
          w.player.relicsCollected++;
          this.sound.playRelicPickup();
          this.renderer.spawnBurst(rel.x + 0.5, rel.y + 0.5, 18, '#c084fc', 1.4, 4.5, 0.55);
          this.ui.showToast(i18n.t('toastRelic'), 'good');
        }
      }

      for (const item of w.maze.pickups) {
        if (item.collected) continue;
        if (Math.hypot(item.x + 0.5 - w.player.x, item.y + 0.5 - w.player.y) < 0.62) {
          item.collected = true;
          this.sound.playPickupItem();
          if (item.type === 'battery') {
            w.player.battery = Math.min(w.player.maxBattery, w.player.battery + 45);
            this.renderer.spawnBurst(item.x + 0.5, item.y + 0.5, 12, '#38bdf8', 1.2, 3.5, 0.45);
            this.ui.showToast(i18n.t('toastBattery'), 'info');
          } else if (item.type === 'smoke') {
            w.player.smokeBombs = Math.min(w.player.maxSmokeBombs || 4, (w.player.smokeBombs || 0) + 1);
            this.renderer.spawnBurst(item.x + 0.5, item.y + 0.5, 12, '#cbd5e1', 1.2, 3.5, 0.45);
            this.ui.showToast(i18n.t('toastSmokePickup'), 'good');
          } else {
            w.player.hp = Math.min(w.player.maxHp, w.player.hp + 35);
            this.renderer.spawnBurst(item.x + 0.5, item.y + 0.5, 12, '#10b981', 1.2, 3.5, 0.45);
            this.ui.showToast(i18n.t('toastMedkit'), 'good');
          }
        }
      }

      // 4. Spider Silk Webs
      for (let i = w.webs.length - 1; i >= 0; i--) {
        const web = w.webs[i];
        web.ttl -= dt;
        if (web.ttl <= 0) {
          w.webs.splice(i, 1);
          continue;
        }
        if (
          w.player.alive &&
          w.player.webSlowTimer <= 0 &&
          Math.hypot(web.x - w.player.x, web.y - w.player.y) < 0.58
        ) {
          w.player.webSlowTimer = 2.6;
          this.sound.playWebSnare();
          w.webs.splice(i, 1);
        }
      }

      // 5. Traps
      trapsMod.updateTraps(w.maze.traps, dt, w.blockedCoords);
      const pTx = Math.floor(w.player.x);
      const pTy = Math.floor(w.player.y);
      if (w.player.alive && w.player.finishedRank === null) {
        for (const trap of w.maze.traps) {
          if (trap.x === pTx && trap.y === pTy) {
            const dCenter = Math.hypot(trap.x + 0.5 - w.player.x, trap.y + 0.5 - w.player.y);
            if (dCenter < 0.45) {
              const outcome = trapsMod.checkPlayerTrapInteraction(trap, w.player);
              if (outcome) {
                if (outcome.event === 'floor_cracking') {
                  this.ui.showToast(i18n.t('toastCracking'), 'warn');
                  this.renderer.addTrauma(0.18);
                  this.renderer.spawnBurst(trap.x + 0.5, trap.y + 0.5, 8, '#94a3b8', 0.8, 2.2, 0.35);
                } else {
                  this.sound.playTrapTrigger(outcome.event);
                  if (outcome.alertEnemy) {
                    const alertTargets =
                      Array.isArray(w.enemies) && w.enemies.length > 0
                        ? w.enemies
                        : w.enemy
                        ? [w.enemy]
                        : [];
                    for (const en of alertTargets) {
                      enemyMod.alertEnemyToPosition(en, trap.x, trap.y);
                    }
                  }
                  const dmgRes = playerMod.damagePlayer(w.player, outcome.damage, outcome.fatalReason);
                  if (dmgRes.tookDamage) {
                    this.renderer.addTrauma(0.6);
                    this.renderer.triggerHitFlash(1.0);
                    this.hitstopTimer = 0.055;
                    this.renderer.spawnBurst(w.player.x, w.player.y, 20, '#ef4444', 1.5, 5.2, 0.5);
                    this.ui.showToast(
                      outcome.event === 'plate_triggered'
                        ? i18n.t('toastPlate')
                        : i18n.t('toastTrapHit', { dmg: outcome.damage }),
                      'danger'
                    );
                    if (dmgRes.died) {
                      if (w.isMultiplayer) {
                        this.net.sendPlayerState(w.player, true);
                        this.ui.showToast(outcome.fatalReason, 'danger');
                      } else {
                        this.triggerEndSequence(false, outcome.fatalReason);
                        return;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      // 6. Check Exit / Center Sanctuary Victory
      if (w.player.alive && pTx === w.maze.exit.x && pTy === w.maze.exit.y) {
        if (w.isMultiplayer) {
          if (w.player.finishedRank === null) {
            w.player.finishedRank = -1; // pending server confirmation
            this.net.sendFinish(w.elapsedTime);
          }
        } else if (w.maze.doors.every((d) => d.unlocked)) {
          this.triggerEndSequence(true, 'Escaped!');
          return;
        }
      }

      // 7. Creature AI (Supports single or Stage 4 multi-creature, smoke blinding, non-fatal swipes + chase music)
      const activeEnemies =
        Array.isArray(w.enemies) && w.enemies.length > 0
          ? w.enemies
          : w.enemy
          ? [w.enemy]
          : [];

      if (activeEnemies.length > 0) {
        const isHost =
          !w.isMultiplayer || (this.net.room && this.net.room.hostId === this.net.playerId);
        let closestDist = Infinity;
        let anyChase = false;
        let anyDetectedNow = false;
        let detectedArchetype = activeEnemies[0].archetype;

        for (let ei = 0; ei < activeEnemies.length; ei++) {
          const en = activeEnemies[ei];
          let eRes;

          if (isHost) {
            const targets = w.isMultiplayer ? [w.player, ...w.remotePlayers] : w.player;
            eRes = enemyMod.updateEnemy(
              en,
              targets,
              w.maze.grid,
              w.maze.doorsByCoord,
              w.blockedCoords,
              w.diffCfg,
              dt,
              { smokeClouds: w.smokeClouds }
            );
            if (eRes.droppedWeb) {
              w.webs.push(eRes.droppedWeb);
            }
            if (w.isMultiplayer && ei === 0) {
              this.net.sendEnemyState(en, eRes.droppedWeb);
            }
            if (eRes.bossTelegraphStarted) {
              this.sound.playBossTelegraph();
              this.ui.showToast(i18n.t('toastBossTelegraph'), 'warn');
            }
            if (eRes.bossShockwaveFired) {
              const sRad = (cfg.BOSS_CFG && cfg.BOSS_CFG.SHOCKWAVE_RADIUS) || 3.35;
              const sDmg = (cfg.BOSS_CFG && cfg.BOSS_CFG.SHOCKWAVE_DAMAGE) || 20;
              w.shockwaveRings.push({ x: en.x, y: en.y, radius: sRad, ttl: 0.48, maxTtl: 0.48 });
              this.sound.playBossShockwave();
              this.renderer.addTrauma(0.55);
              const dBoss = Math.hypot(en.x - w.player.x, en.y - w.player.y);
              const inSmokeNow =
                enemyMod.isPointInSmoke && enemyMod.isPointInSmoke(w.player.x, w.player.y, w.smokeClouds);
              if (
                w.player.alive &&
                dBoss <= sRad &&
                !w.player.hidden &&
                !inSmokeNow &&
                (w.player.cloakTimer || 0) <= 0
              ) {
                const shockRes = playerMod.damagePlayer(
                  w.player,
                  sDmg,
                  'Crushed by the Abyssal Warden shockwave'
                );
                if (shockRes.tookDamage) {
                  this.renderer.triggerHitFlash(0.85);
                  this.renderer.spawnBurst(w.player.x, w.player.y, 16, '#fb7185', 1.4, 4.4, 0.5);
                  this.ui.showToast(i18n.t('toastBossShockHit', { dmg: sDmg }), 'danger');
                }
                if (shockRes.died) {
                  w.player.alive = false;
                  this.triggerEndSequence(false, 'Crushed by the Abyssal Warden shockwave');
                  return;
                }
              }
            }
            eRes.distToPlayer = Math.hypot(en.x - w.player.x, en.y - w.player.y);
            const inSmoke =
              enemyMod.isPointInSmoke &&
              (enemyMod.isPointInSmoke(w.player.x, w.player.y, w.smokeClouds) ||
                enemyMod.isPointInSmoke(en.x, en.y, w.smokeClouds));
            eRes.caughtPlayer =
              eRes.distToPlayer < 0.62 &&
              !w.player.hidden &&
              !inSmoke &&
              (w.player.cloakTimer || 0) <= 0 &&
              (en.stunTimer || 0) <= 0 &&
              (en.hitCooldownTimer || 0) <= 0;
          } else {
            if (en.hitCooldownTimer > 0) {
              en.hitCooldownTimer = Math.max(0, en.hitCooldownTimer - dt);
            }
            const prevState = en.state;
            if (w.enemySyncTarget) {
              const blend = 1 - Math.exp(-14 * dt);
              en.x += (w.enemySyncTarget.x - en.x) * blend;
              en.y += (w.enemySyncTarget.y - en.y) * blend;
              let diffAng = w.enemySyncTarget.angle - en.angle;
              while (diffAng > Math.PI) diffAng -= Math.PI * 2;
              while (diffAng < -Math.PI) diffAng += Math.PI * 2;
              en.angle += diffAng * blend;
              en.state = w.enemySyncTarget.state;
            }
            en.animPhase += dt * (en.state === ENEMY_STATE.CHASE ? 12 : 6);
            const distToLocal = Math.hypot(en.x - w.player.x, en.y - w.player.y);
            const inSmoke =
              enemyMod.isPointInSmoke &&
              (enemyMod.isPointInSmoke(w.player.x, w.player.y, w.smokeClouds) ||
                enemyMod.isPointInSmoke(en.x, en.y, w.smokeClouds));
            eRes = {
              distToPlayer: distToLocal,
              caughtPlayer:
                distToLocal < 0.62 &&
                !w.player.hidden &&
                !inSmoke &&
                (w.player.cloakTimer || 0) <= 0 &&
                (en.stunTimer || 0) <= 0 &&
                (en.hitCooldownTimer || 0) <= 0,
              detectedNow:
                prevState !== ENEMY_STATE.CHASE &&
                en.state === ENEMY_STATE.CHASE &&
                distToLocal < 7.5,
              stepTriggered: false,
            };
          }

          if (eRes.distToPlayer < closestDist) closestDist = eRes.distToPlayer;
          if (eRes.detectedNow && w.player.skillId === 'auto_cloak') {
            if (playerMod.triggerPassiveAutoCloak(w.player)) {
              en.state = ENEMY_STATE.SEARCH;
              en.path = [];
              this.sound.playSkillActivate('auto_cloak');
              this.renderer.spawnBurst(w.player.x, w.player.y, 18, '#c084fc', 1.2, 3.8, 0.6);
              this.ui.showToast(i18n.t('toastAutoCloak'), 'good');
              eRes.detectedNow = false;
            }
          }
          if (en.state === ENEMY_STATE.CHASE && (en.stunTimer || 0) <= 0) anyChase = true;
          if (eRes.detectedNow) {
            anyDetectedNow = true;
            detectedArchetype = en.archetype;
          }
          if (eRes.stepTriggered) {
            this.sound.playEnemyStep(eRes.distToPlayer, en.archetype);
          }

          if (eRes.caughtPlayer && w.player.finishedRank === null && w.player.alive) {
            const swipeDmg = w.diffCfg.enemySwipeDamage || (w.diffCfg.id === 'hard' ? 50 : 38);
            const dmgRes = playerMod.damagePlayer(
              w.player,
              swipeDmg,
              'Caught by the creature in the dark'
            );
            if (dmgRes.tookDamage) {
              en.hitCooldownTimer = 2.4;
              const kDx = w.player.x - en.x;
              const kDy = w.player.y - en.y;
              const kLen = Math.hypot(kDx, kDy) || 1;
              playerMod.moveWithCollision(
                w.maze.grid,
                w.player,
                (kDx / kLen) * 0.45,
                (kDy / kLen) * 0.45,
                w.maze.doorsByCoord,
                w.blockedCoords
              );
              this.renderer.addTrauma(0.75);
              this.renderer.triggerHitFlash(1.0);
              this.hitstopTimer = 0.065;
              this.renderer.spawnBurst(w.player.x, w.player.y, 24, '#ef4444', 1.8, 5.5, 0.55);
              this.sound.playTrapTrigger('plate_triggered');
              this.ui.showToast(i18n.t('toastCreatureHit', { dmg: swipeDmg }), 'danger');
            }
            if (dmgRes.died) {
              w.player.alive = false;
              if (w.isMultiplayer) {
                this.net.sendPlayerState(w.player, true);
                this.renderer.triggerJumpscare();
                this.sound.playGameOver();
              } else {
                this.triggerEndSequence(false, 'Caught by the creature in the dark');
                return;
              }
            }
          }
        }

        if (anyDetectedNow) {
          this.sound.playEnemyDetected(detectedArchetype);
          this.renderer.addTrauma(0.32);
          this.ui.showToast(i18n.t('toastSpotted'), 'danger');
        }

        const tension = Math.max(0, Math.min(1, 1 - closestDist / 9));
        this.sound.setChaseState(anyChase);
        this.sound.setAmbienceTension(anyChase ? 1 : tension * 0.7);
        this.heartbeatCooldown -= dt;
        if ((anyChase || closestDist < 6.5) && this.heartbeatCooldown <= 0) {
          this.sound.playHeartbeat(0.35 + tension * 0.65);
          this.heartbeatCooldown = anyChase ? 0.68 : 1.05;
        }
      } else {
        this.sound.setChaseState(false);
        this.sound.setAmbienceTension(0);
      }

      // 7b. Keen Hearing / Expanded Vision Echolocation Sonar Pulses
      const hasSonar =
        w.player.mods && (w.player.mods.sonarSense || (w.player.mods.visionMult || 1) >= 1.25);
      if (hasSonar && w.player.alive && !w.isMultiplayer) {
        w.sonarCooldown -= dt;
        if (w.sonarCooldown <= 0) {
          w.sonarCooldown = w.player.mods.sonarSense ? 1.45 : 2.3;
          const senseRange = w.player.mods.sonarSense ? 9.5 : 6.8;
          for (const en of activeEnemies) {
            const d = Math.hypot(en.x - w.player.x, en.y - w.player.y);
            if (d <= senseRange) {
              w.sonarPulses.push({
                x: en.x,
                y: en.y,
                ttl: 0.9,
                maxTtl: 0.9,
                color: en.state === ENEMY_STATE.CHASE ? 'rgba(248, 113, 113, 0.85)' : 'rgba(56, 189, 248, 0.82)',
              });
            }
          }
          if (w.player.mods.sonarSense) {
            for (const k of w.maze.keys) {
              if (k.collected) continue;
              const dk = Math.hypot(k.x + 0.5 - w.player.x, k.y + 0.5 - w.player.y);
              if (dk <= 6.8) {
                w.sonarPulses.push({
                  x: k.x + 0.5,
                  y: k.y + 0.5,
                  ttl: 0.85,
                  maxTtl: 0.85,
                  color: 'rgba(251, 191, 36, 0.72)',
                });
              }
            }
          }
        }
      }

      // 8. Broadcast local state in Multiplayer
      if (w.isMultiplayer) {
        this.net.sendPlayerState(w.player, false);
      }

      // 9. Update Interact Prompt & HUD
      const near = this.findNearestInteractable();
      w.interactLabel = near ? near.label : '';
      this.ui.updateHUD(w, dt);
    }

    tick(timestamp) {
      if (!this.lastTime) this.lastTime = timestamp;
      const rawDt = (timestamp - this.lastTime) / 1000;

      if (this.state !== GAME_STATE.PLAYING && rawDt < 0.032) {
        requestAnimationFrame((ts) => this.tick(ts));
        return;
      }

      this.lastTime = timestamp;
      const dt = Math.min(Math.max(rawDt, 0), 0.05);
      this.animTime += dt;

      if (this.emblemClickTimer > 0) {
        this.emblemClickTimer -= dt;
        if (this.emblemClickTimer <= 0) this.emblemClicks = 0;
      }

      this.renderer.updateEffects(dt);

      if (this.state === GAME_STATE.TITLE) {
        this.renderer.renderTitleBackdrop(this.animTime, this.saveData.equippedMap);
        if (this.ui.el.shopModal && !this.ui.el.shopModal.hidden) {
          this.ui.animateShopPreview(this.animTime);
        }
      } else if (this.world) {
        if (this.state === GAME_STATE.PLAYING) {
          this.stepSimulation(dt);
        }
        this.renderer.renderGame(this.world, this.animTime, dt);
      }

      requestAnimationFrame((ts) => this.tick(ts));
    }

    startLoop() {
      requestAnimationFrame((ts) => this.tick(ts));
    }
  }

  return { HorrorMazeGame };
});
