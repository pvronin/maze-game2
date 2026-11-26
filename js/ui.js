/**
 * ui.js
 * Bilingual (EN/FA RTL) DOM UI controller for Title Menu, Armory Shop (0–100 stat bars),
 * Missions & Achievements, Host-based 2–4P Multiplayer Lobby, HUD, Pause, and Results.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./config.js'),
      require('./i18n.js'),
      require('./catalog.js'),
      null,
      null
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
        root.HorrorMaze
      )
    );
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (
  cfg,
  i18n,
  catalog,
  rendererMod,
  qrMod
) {
  const { DIFFICULTIES, KEY_DEFS, GAME_STATE, ENEMY_STATE, MP_CONFIG } = cfg;

  function formatTime(totalSec) {
    const clamped = Math.max(0, Math.ceil(totalSec));
    const m = Math.floor(clamped / 60);
    const s = clamped % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  class GameUI {
    constructor(handlers) {
      this.handlers = handlers;
      this.shopCategory = 'skins';
      this.selectedShopItemId = 'explorer';
      this.missionTab = 'missions';
      this.mpTab = 'host';
      this.mpPlayerCount = 2;

      this.el = {
        titleScreen: document.getElementById('title-screen'),
        hud: document.getElementById('game-hud'),
        pauseModal: document.getElementById('pause-modal'),
        gameoverModal: document.getElementById('gameover-modal'),
        howToModal: document.getElementById('howto-modal'),
        shopModal: document.getElementById('shop-modal'),
        missionsModal: document.getElementById('missions-modal'),
        mpModal: document.getElementById('mp-modal'),

        titleCurrency: document.getElementById('title-currency'),
        titleLevel: document.getElementById('title-level'),
        titleEmblem: document.getElementById('title-emblem'),
        btnLangToggle: document.getElementById('btn-lang-toggle'),
        btnInstallApp: document.getElementById('btn-install-app'),

        diffButtons: Array.from(document.querySelectorAll('[data-difficulty]')),
        diffSummary: document.getElementById('diff-summary'),
        bestRunBanner: document.getElementById('best-run-banner'),

        btnStart: document.getElementById('btn-start'),
        btnMultiplayer: document.getElementById('btn-multiplayer'),
        btnShop: document.getElementById('btn-shop'),
        btnMissions: document.getElementById('btn-missions'),
        btnHowTo: document.getElementById('btn-howto'),
        btnCloseHowTo: document.getElementById('btn-close-howto'),
        btnCloseShop: document.getElementById('btn-close-shop'),
        btnCloseMissions: document.getElementById('btn-close-missions'),
        btnCloseMp: document.getElementById('btn-close-mp'),

        titleSfxToggle: document.getElementById('title-sfx-toggle'),
        titleMusicToggle: document.getElementById('title-music-toggle'),
        titleSfxVol: document.getElementById('title-sfx-vol'),
        titleMusicVol: document.getElementById('title-music-vol'),
        pauseSfxToggle: document.getElementById('pause-sfx-toggle'),
        pauseMusicToggle: document.getElementById('pause-music-toggle'),
        pauseSfxVol: document.getElementById('pause-sfx-vol'),
        pauseMusicVol: document.getElementById('pause-music-vol'),

        // Shop
        shopCurrency: document.getElementById('shop-currency'),
        shopTabs: Array.from(document.querySelectorAll('[data-shop-tab]')),
        shopGrid: document.getElementById('shop-items-grid'),
        inspPreview: document.getElementById('insp-preview'),
        inspName: document.getElementById('insp-name'),
        inspDesc: document.getElementById('insp-desc'),
        inspSkillBox: document.getElementById('insp-skill-box'),
        inspSkillBadge: document.getElementById('insp-skill-badge'),
        inspSkillName: document.getElementById('insp-skill-name'),
        inspSkillDesc: document.getElementById('insp-skill-desc'),
        inspStats: document.getElementById('insp-stats'),
        inspActionBtn: document.getElementById('insp-action-btn'),

        // Missions
        missionTabs: Array.from(document.querySelectorAll('[data-mission-tab]')),
        missionsList: document.getElementById('missions-list'),

        // Multiplayer
        mpNameInput: document.getElementById('mp-player-name'),
        mpTabs: Array.from(document.querySelectorAll('[data-mp-tab]')),
        mpHostPanel: document.getElementById('mp-host-panel'),
        mpJoinPanel: document.getElementById('mp-join-panel'),
        mpOpenRooms: document.getElementById('mp-open-rooms'),
        btnMpRefreshRooms: document.getElementById('btn-mp-refresh-rooms'),
        mpCountButtons: Array.from(document.querySelectorAll('[data-mp-count]')),
        mpMapSelect: document.getElementById('mp-map-select'),
        mpEnemyToggle: document.getElementById('mp-enemy-toggle'),
        btnMpCreate: document.getElementById('btn-mp-create'),
        mpRoomCodeInput: document.getElementById('mp-room-code-input'),
        mpServerUrlInput: document.getElementById('mp-server-url-input'),
        btnMpJoin: document.getElementById('btn-mp-join'),
        mpSetupView: document.getElementById('mp-setup-view'),
        mpRoomView: document.getElementById('mp-room-view'),
        mpActiveCode: document.getElementById('mp-active-code'),
        mpWaitingLabel: document.getElementById('mp-waiting-label'),
        mpLanUrls: document.getElementById('mp-lan-urls'),
        btnMpCopyLink: document.getElementById('btn-mp-copy-link'),
        mpQrCanvas: document.getElementById('mp-qr-canvas'),
        mpRoster: document.getElementById('mp-roster'),
        btnMpStart: document.getElementById('btn-mp-start'),
        btnMpLeave: document.getElementById('btn-mp-leave'),
        mpErrorMsg: document.getElementById('mp-error-msg'),

        // HUD
        hpFill: document.getElementById('hud-hp-fill'),
        hpGhost: document.getElementById('hud-hp-ghost'),
        hpText: document.getElementById('hud-hp-text'),
        staminaFill: document.getElementById('hud-stamina-fill'),
        batteryFill: document.getElementById('hud-battery-fill'),
        flashlightState: document.getElementById('hud-flashlight-state'),
        timerText: document.getElementById('hud-timer'),
        stageBadge: document.getElementById('hud-stage-badge'),
        smokeChip: document.getElementById('hud-smoke-chip'),
        crouchChip: document.getElementById('hud-crouch-chip'),
        btnHudSkill: document.getElementById('hud-btn-skill'),
        bossBar: document.getElementById('hud-boss-bar'),
        bossName: document.getElementById('hud-boss-name'),
        bossStatus: document.getElementById('hud-boss-status'),
        objectiveText: document.getElementById('hud-objective'),
        threatBanner: document.getElementById('hud-threat-banner'),
        keysList: document.getElementById('hud-keys-list'),
        mpStandings: document.getElementById('hud-mp-standings'),
        interactPrompt: document.getElementById('hud-interact-prompt'),
        eventToast: document.getElementById('hud-event-toast'),

        btnHudSfx: document.getElementById('hud-btn-sfx'),
        btnHudMusic: document.getElementById('hud-btn-music'),
        btnHudMap: document.getElementById('hud-btn-map'),
        btnHudPause: document.getElementById('hud-btn-pause'),
        btnHudRestart: document.getElementById('hud-btn-restart'),

        // Pause
        btnResume: document.getElementById('btn-resume'),
        btnPauseRestart: document.getElementById('btn-pause-restart'),
        btnPauseTitle: document.getElementById('btn-pause-title'),

        // Results
        goBadge: document.getElementById('go-badge'),
        goTitle: document.getElementById('go-title'),
        goReason: document.getElementById('go-reason'),
        goGradeRow: document.getElementById('go-grade-row'),
        goGradeLetter: document.getElementById('go-grade-letter'),
        goStars: document.getElementById('go-stars'),
        goStatTime: document.getElementById('go-stat-time'),
        goStatKeys: document.getElementById('go-stat-keys'),
        goStatScore: document.getElementById('go-stat-score'),
        goStatShards: document.getElementById('go-stat-shards'),
        goBreakdown: document.getElementById('go-breakdown'),
        goMpRankings: document.getElementById('go-mp-rankings'),
        goBestNote: document.getElementById('go-best-note'),
        btnPlayAgain: document.getElementById('btn-play-again'),
        btnMpLobbyReturn: document.getElementById('btn-mp-lobby-return'),
        btnGoTitle: document.getElementById('btn-go-title'),
      };

      this.toastTimer = 0;
      this.hpGhostPct = 100;
      this.currentInviteUrl = '';
      this.copyResetTimer = null;
      this.bindEvents();
    }

    bindEvents() {
      const blurClick = (el, fn) => {
        if (!el) return;
        el.addEventListener('click', (e) => {
          e.currentTarget.blur();
          fn(e);
        });
      };

      for (const btn of this.el.diffButtons) {
        blurClick(btn, () => this.handlers.onSelectDifficulty(btn.dataset.difficulty));
      }

      blurClick(this.el.btnStart, () => this.handlers.onStartGame());
      blurClick(this.el.btnHowTo, () => this.openModal('howto'));
      blurClick(this.el.btnCloseHowTo, () => this.closeAllTitleModals());

      blurClick(this.el.btnShop, () => this.handlers.onOpenShop());
      blurClick(this.el.btnCloseShop, () => this.closeAllTitleModals());

      blurClick(this.el.btnMissions, () => this.handlers.onOpenMissions());
      blurClick(this.el.btnCloseMissions, () => this.closeAllTitleModals());

      blurClick(this.el.btnMultiplayer, () => this.handlers.onOpenMp());
      blurClick(this.el.btnCloseMp, () => {
        this.handlers.onLeaveMp();
        this.closeAllTitleModals();
      });

      blurClick(this.el.btnLangToggle, () => this.handlers.onToggleLanguage());

      blurClick(this.el.titleSfxToggle, () => this.handlers.onToggleSfx());
      blurClick(this.el.titleMusicToggle, () => this.handlers.onToggleMusic());
      blurClick(this.el.pauseSfxToggle, () => this.handlers.onToggleSfx());
      blurClick(this.el.pauseMusicToggle, () => this.handlers.onToggleMusic());

      for (const sl of [this.el.titleSfxVol, this.el.pauseSfxVol]) {
        if (sl) {
          sl.addEventListener('input', (e) => {
            this.handlers.onChangeSfxVolume(Number(e.target.value) / 100);
          });
        }
      }
      for (const sl of [this.el.titleMusicVol, this.el.pauseMusicVol]) {
        if (sl) {
          sl.addEventListener('input', (e) => {
            this.handlers.onChangeMusicVolume(Number(e.target.value) / 100);
          });
        }
      }

      // Shop tabs & buy/equip
      for (const tab of this.el.shopTabs) {
        blurClick(tab, () => {
          this.shopCategory = tab.dataset.shopTab;
          const list = this.getCatalogList(this.shopCategory);
          if (list.length > 0) this.selectedShopItemId = list[0].id;
          this.handlers.onRefreshShop();
        });
      }
      blurClick(this.el.inspActionBtn, () => {
        this.handlers.onShopAction(this.shopCategory, this.selectedShopItemId);
      });

      // Mission tabs
      for (const tab of this.el.missionTabs) {
        blurClick(tab, () => {
          this.missionTab = tab.dataset.missionTab;
          this.handlers.onRefreshMissions();
        });
      }

      // Multiplayer Lobby
      for (const tab of this.el.mpTabs) {
        blurClick(tab, () => {
          this.setMpTab(tab.dataset.mpTab);
          if (this.mpTab === 'join' && this.handlers.onRefreshOpenRooms) {
            this.handlers.onRefreshOpenRooms();
          }
        });
      }
      blurClick(this.el.btnMpRefreshRooms, () => {
        if (this.handlers.onRefreshOpenRooms) this.handlers.onRefreshOpenRooms();
      });
      blurClick(this.el.btnMpCopyLink, () => this.copyInviteLink());
      for (const btn of this.el.mpCountButtons) {
        blurClick(btn, () => {
          this.mpPlayerCount = Number(btn.dataset.mpCount) || 2;
          this.el.mpCountButtons.forEach((b) => b.classList.toggle('is-active', b === btn));
        });
      }
      blurClick(this.el.btnMpCreate, () => {
        this.handlers.onMpCreate({
          playerName: this.el.mpNameInput.value.trim() || 'Host',
          maxPlayers: this.mpPlayerCount,
          mapId: this.el.mpMapSelect.value || 'crypt',
          withEnemy: this.el.mpEnemyToggle.checked,
        });
      });
      blurClick(this.el.btnMpJoin, () => {
        this.handlers.onMpJoin({
          playerName: this.el.mpNameInput.value.trim() || 'Player',
          roomCode: this.el.mpRoomCodeInput.value.trim().toUpperCase(),
          serverUrl: this.el.mpServerUrlInput.value.trim(),
        });
      });
      blurClick(this.el.btnMpStart, () => this.handlers.onMpStart());
      blurClick(this.el.btnMpLeave, () => this.handlers.onLeaveMp());

      // HUD buttons
      blurClick(this.el.btnHudSkill, () => {
        if (this.handlers.onActivateSkill) this.handlers.onActivateSkill();
      });
      blurClick(this.el.btnHudSfx, () => this.handlers.onToggleSfx());
      blurClick(this.el.btnHudMusic, () => this.handlers.onToggleMusic());
      blurClick(this.el.btnHudMap, () => this.handlers.onToggleMinimap());
      blurClick(this.el.btnHudPause, () => this.handlers.onTogglePause());
      blurClick(this.el.btnHudRestart, () => this.handlers.onRestartGame());

      // Pause & Results
      blurClick(this.el.btnResume, () => this.handlers.onResumeGame());
      blurClick(this.el.btnPauseRestart, () => this.handlers.onRestartGame());
      blurClick(this.el.btnPauseTitle, () => this.handlers.onReturnTitle());
      blurClick(this.el.btnPlayAgain, () => {
        if (this.handlers.onPlayAgain) {
          this.handlers.onPlayAgain(this.el.btnPlayAgain.dataset.action || 'restart');
        } else {
          this.handlers.onStartGame();
        }
      });
      blurClick(this.el.btnMpLobbyReturn, () => this.handlers.onReturnMpLobby());
      blurClick(this.el.btnGoTitle, () => this.handlers.onReturnTitle());
    }

    applyTranslations() {
      const nodes = document.querySelectorAll('[data-i18n]');
      for (const el of nodes) {
        const key = el.getAttribute('data-i18n');
        if (key) el.textContent = i18n.t(key);
      }
    }

    openModal(name) {
      this.closeAllTitleModals();
      if (name === 'howto' && this.el.howToModal) this.el.howToModal.hidden = false;
      if (name === 'shop' && this.el.shopModal) this.el.shopModal.hidden = false;
      if (name === 'missions' && this.el.missionsModal) this.el.missionsModal.hidden = false;
      if (name === 'mp' && this.el.mpModal) this.el.mpModal.hidden = false;
    }

    closeAllTitleModals() {
      if (this.el.howToModal) this.el.howToModal.hidden = true;
      if (this.el.shopModal) this.el.shopModal.hidden = true;
      if (this.el.missionsModal) this.el.missionsModal.hidden = true;
      if (this.el.mpModal) this.el.mpModal.hidden = true;
    }

    isAnyTitleModalOpen() {
      return Boolean(
        (this.el.howToModal && !this.el.howToModal.hidden) ||
          (this.el.shopModal && !this.el.shopModal.hidden) ||
          (this.el.missionsModal && !this.el.missionsModal.hidden) ||
          (this.el.mpModal && !this.el.mpModal.hidden)
      );
    }

    isHowToOpen() {
      return Boolean(this.el.howToModal && !this.el.howToModal.hidden);
    }

    toggleHowTo(open) {
      if (open) this.openModal('howto');
      else this.closeAllTitleModals();
    }

    setState(state) {
      document.body.dataset.state = state;
      this.el.titleScreen.hidden = state !== GAME_STATE.TITLE;
      this.el.hud.hidden = state !== GAME_STATE.PLAYING && state !== GAME_STATE.PAUSED;
      this.el.pauseModal.hidden = state !== GAME_STATE.PAUSED;
      this.el.gameoverModal.hidden = state !== GAME_STATE.GAMEOVER;
      if (state !== GAME_STATE.TITLE) {
        this.closeAllTitleModals();
      }
    }

    renderTitleMeta(saveData) {
      this.applyTranslations();
      if (this.el.titleCurrency) this.el.titleCurrency.textContent = String(saveData.currency);
      if (this.el.titleLevel) this.el.titleLevel.textContent = String(saveData.level);

      const diff = DIFFICULTIES[saveData.difficulty] || DIFFICULTIES.normal;
      for (const btn of this.el.diffButtons) {
        const active = btn.dataset.difficulty === diff.id;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      }

      const diffName = i18n.getLanguage() === 'fa' ? diff.faLabel : diff.label;
      if (this.el.diffSummary) {
        this.el.diffSummary.textContent = i18n.t('diffSummary', {
          cols: diff.cols,
          rows: diff.rows,
          keys: diff.keyCount,
          time: formatTime(diff.timeLimit),
        });
      }

      if (this.el.bestRunBanner) {
        const best = saveData.bestRuns && saveData.bestRuns[diff.id];
        if (best) {
          this.el.bestRunBanner.textContent = i18n.t('bestEscape', {
            diff: diffName,
            time: formatTime(best.bestTimeSec),
            score: best.bestScore,
            wins: best.wins,
          });
        } else {
          this.el.bestRunBanner.textContent = i18n.t('noEscapes', { diff: diffName });
        }
      }

      this.syncAudioButtons(saveData);
    }

    syncAudioButtons(saveData) {
      const sfxLabel = `${i18n.t('sfx')}: ${saveData.sfxEnabled ? i18n.t('on') : i18n.t('off')}`;
      const musicLabel = `${i18n.t('music')}: ${saveData.musicEnabled ? i18n.t('on') : i18n.t('off')}`;

      for (const btn of [this.el.titleSfxToggle, this.el.pauseSfxToggle]) {
        if (!btn) continue;
        btn.textContent = sfxLabel;
        btn.setAttribute('aria-pressed', saveData.sfxEnabled ? 'true' : 'false');
        btn.classList.toggle('is-muted', !saveData.sfxEnabled);
      }
      for (const btn of [this.el.titleMusicToggle, this.el.pauseMusicToggle]) {
        if (!btn) continue;
        btn.textContent = musicLabel;
        btn.setAttribute('aria-pressed', saveData.musicEnabled ? 'true' : 'false');
        btn.classList.toggle('is-muted', !saveData.musicEnabled);
      }

      for (const sl of [this.el.titleSfxVol, this.el.pauseSfxVol]) {
        if (sl) sl.value = String(Math.round((saveData.sfxVolume ?? 0.65) * 100));
      }
      for (const sl of [this.el.titleMusicVol, this.el.pauseMusicVol]) {
        if (sl) sl.value = String(Math.round((saveData.musicVolume ?? 0.55) * 100));
      }

      if (this.el.btnHudSfx) {
        this.el.btnHudSfx.classList.toggle('is-muted', !saveData.sfxEnabled);
        this.el.btnHudSfx.setAttribute('aria-pressed', saveData.sfxEnabled ? 'true' : 'false');
      }
      if (this.el.btnHudMusic) {
        this.el.btnHudMusic.classList.toggle('is-muted', !saveData.musicEnabled);
        this.el.btnHudMusic.setAttribute('aria-pressed', saveData.musicEnabled ? 'true' : 'false');
      }
      if (this.el.btnHudMap) {
        this.el.btnHudMap.classList.toggle('is-muted', !saveData.showMinimap);
        this.el.btnHudMap.setAttribute('aria-pressed', saveData.showMinimap ? 'true' : 'false');
      }
    }

    getCatalogList(cat) {
      if (cat === 'skins') return catalog.PLAYER_SKINS;
      if (cat === 'flashlights') return catalog.FLASHLIGHTS;
      if (cat === 'gear') return catalog.GEAR_ITEMS;
      if (cat === 'maps') return catalog.MAP_THEMES;
      if (cat === 'enemies') return catalog.ENEMY_TYPES;
      return [];
    }

    getOwnershipMeta(saveData, cat) {
      if (cat === 'skins') return { owned: saveData.unlockedSkins, equipped: saveData.equippedSkin };
      if (cat === 'flashlights') return { owned: saveData.unlockedFlashlights, equipped: saveData.equippedFlashlight };
      if (cat === 'gear') return { owned: saveData.unlockedGear, equipped: saveData.equippedGear };
      if (cat === 'maps') return { owned: saveData.unlockedMaps, equipped: saveData.equippedMap };
      return { owned: saveData.unlockedEnemies, equipped: saveData.equippedEnemy };
    }

    getItemSwatchColor(cat, item) {
      if (cat === 'skins') return item.trim || item.color;
      if (cat === 'flashlights') return item.bulbColor;
      if (cat === 'maps') return item.palette.accent;
      if (cat === 'enemies') return item.eyeColor;
      return '#fbbf24';
    }

    renderShop(saveData) {
      if (this.el.shopCurrency) this.el.shopCurrency.textContent = String(saveData.currency);
      for (const t of this.el.shopTabs) {
        t.classList.toggle('is-active', t.dataset.shopTab === this.shopCategory);
      }

      const list = this.getCatalogList(this.shopCategory);
      const meta = this.getOwnershipMeta(saveData, this.shopCategory);
      if (!list.some((x) => x.id === this.selectedShopItemId)) {
        this.selectedShopItemId = meta.equipped || list[0].id;
      }

      this.el.shopGrid.innerHTML = '';
      for (const item of list) {
        const isOwned = meta.owned.includes(item.id);
        const isEquipped = meta.equipped === item.id;
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'shop-card' + (item.id === this.selectedShopItemId ? ' is-selected' : '');
        card.dataset.itemId = item.id;

        const tagText = isEquipped
          ? i18n.t('equipped')
          : isOwned
          ? i18n.t('owned')
          : String(item.price);
        const tagClass = isEquipped ? 'is-equipped' : isOwned ? 'is-owned' : '';

        card.innerHTML = `
          <div class="shop-card-top">
            <canvas class="shop-preview-canvas" width="56" height="56" aria-hidden="true"></canvas>
            <span class="shop-tag ${tagClass}">${tagText}</span>
          </div>
          <div class="shop-card-name">${escapeHtml(i18n.pick(item.name))}</div>
        `;
        const previewCanvas = card.querySelector('.shop-preview-canvas');
        if (previewCanvas && rendererMod && rendererMod.renderShopPreview) {
          rendererMod.renderShopPreview(previewCanvas, this.shopCategory, item, 0.3);
        }
        card.addEventListener('click', () => {
          this.selectedShopItemId = item.id;
          this.renderShop(saveData);
        });
        this.el.shopGrid.appendChild(card);
      }

      // Render Right Inspector with real visual preview & 0–100 stat bars
      const selected = catalog.getById(list, this.selectedShopItemId);
      const isOwned = meta.owned.includes(selected.id);
      const isEquipped = meta.equipped === selected.id;
      if (this.el.inspPreview && rendererMod && rendererMod.renderShopPreview) {
        rendererMod.renderShopPreview(this.el.inspPreview, this.shopCategory, selected, 0.4);
      }
      this.el.inspName.textContent = i18n.pick(selected.name);
      this.el.inspDesc.textContent = i18n.pick(selected.desc);

      if (this.el.inspSkillBox) {
        if (this.shopCategory === 'skins' && selected.skill) {
          const sk = selected.skill;
          const isPassive = sk.mode === 'passive';
          this.el.inspSkillBox.hidden = false;
          if (this.el.inspSkillBadge) {
            this.el.inspSkillBadge.textContent = isPassive
              ? i18n.t('skillBadgePassive')
              : i18n.t('skillBadgeActive');
            this.el.inspSkillBadge.classList.toggle('is-passive', isPassive);
          }
          if (this.el.inspSkillName) this.el.inspSkillName.textContent = i18n.pick(sk.name);
          if (this.el.inspSkillDesc) this.el.inspSkillDesc.textContent = i18n.pick(sk.desc);
        } else {
          this.el.inspSkillBox.hidden = true;
        }
      }

      const statLabelMap = {
        hp: 'statHp',
        speed: 'statSpeed',
        stamina: 'statStamina',
        stealth: 'statStealth',
        vision: 'statVision',
        power: 'statPower',
        battery: 'statBattery',
        width: 'statWidth',
        utility: 'statUtility',
        threat: 'statThreat',
        reward: 'statReward',
      };

      this.el.inspStats.innerHTML = '';
      for (const [key, val] of Object.entries(selected.stats || {})) {
        const clamped = Math.max(0, Math.min(100, Number(val) || 0));
        const row = document.createElement('div');
        row.className = 'attr-row';
        row.innerHTML = `
          <div class="attr-label-line">
            <span>${i18n.t(statLabelMap[key] || key)}</span>
            <span class="attr-num">${clamped}/100</span>
          </div>
          <div class="attr-track"><div class="attr-fill" style="width:${clamped}%"></div></div>
        `;
        this.el.inspStats.appendChild(row);
      }

      const actBtn = this.el.inspActionBtn;
      if (isEquipped) {
        actBtn.textContent = i18n.t('equipped');
        actBtn.disabled = true;
      } else if (isOwned) {
        actBtn.textContent = i18n.t('equip');
        actBtn.disabled = false;
      } else if (saveData.currency >= selected.price) {
        actBtn.textContent = i18n.t('buy', { price: selected.price });
        actBtn.disabled = false;
      } else {
        actBtn.textContent = i18n.t('cantAfford', { price: selected.price });
        actBtn.disabled = true;
      }
    }

    animateShopPreview(timeSec) {
      if (!this.el.inspPreview || !rendererMod || !rendererMod.renderShopPreview) return;
      const list = this.getCatalogList(this.shopCategory);
      const selected = catalog.getById(list, this.selectedShopItemId);
      if (selected) {
        rendererMod.renderShopPreview(this.el.inspPreview, this.shopCategory, selected, timeSec);
      }
    }

    renderMissions(saveData) {
      for (const t of this.el.missionTabs) {
        t.classList.toggle('is-active', t.dataset.missionTab === this.missionTab);
      }
      const list = this.missionTab === 'achievements' ? catalog.ACHIEVEMENTS : catalog.MISSIONS;
      const doneList =
        this.missionTab === 'achievements' ? saveData.unlockedAchievements : saveData.claimedMissions;

      this.el.missionsList.innerHTML = '';
      for (const item of list) {
        const cur = Math.min(item.target, saveData.stats[item.type] || 0);
        const isDone = doneList.includes(item.id) || cur >= item.target;
        const pct = Math.round((cur / item.target) * 100);

        const card = document.createElement('div');
        card.className = 'mission-card' + (isDone ? ' is-done' : '');
        card.innerHTML = `
          <div class="mission-head">
            <span class="mission-name">${i18n.pick(item.name)}</span>
            <span class="mission-reward ${isDone ? 'is-done' : ''}">
              ${isDone ? i18n.t('completed') : i18n.t('rewardLabel', { shards: item.reward })}
            </span>
          </div>
          <div class="mission-desc">${i18n.pick(item.desc)} (${cur}/${item.target})</div>
          <div class="attr-track"><div class="attr-fill" style="width:${pct}%"></div></div>
        `;
        this.el.missionsList.appendChild(card);
      }
    }

    populateMpMapSelect(saveData) {
      if (!this.el.mpMapSelect) return;
      this.el.mpMapSelect.innerHTML = '';
      for (const m of catalog.MAP_THEMES) {
        if (!saveData.unlockedMaps.includes(m.id)) continue;
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = i18n.pick(m.name);
        if (m.id === saveData.equippedMap) opt.selected = true;
        this.el.mpMapSelect.appendChild(opt);
      }
    }

    showMpError(msg) {
      if (!this.el.mpErrorMsg) return;
      if (!msg) {
        this.el.mpErrorMsg.hidden = true;
        this.el.mpErrorMsg.textContent = '';
      } else {
        this.el.mpErrorMsg.hidden = false;
        this.el.mpErrorMsg.textContent = msg;
      }
    }

    setMpTab(tabName) {
      this.mpTab = tabName === 'join' ? 'join' : 'host';
      this.el.mpTabs.forEach((b) => b.classList.toggle('is-active', b.dataset.mpTab === this.mpTab));
      if (this.el.mpHostPanel) this.el.mpHostPanel.hidden = this.mpTab !== 'host';
      if (this.el.mpJoinPanel) this.el.mpJoinPanel.hidden = this.mpTab !== 'join';
      this.showMpError('');
    }

    renderOpenRooms(rooms, onQuickJoin) {
      if (!this.el.mpOpenRooms) return;
      this.el.mpOpenRooms.innerHTML = '';
      if (!Array.isArray(rooms) || rooms.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'mp-open-rooms-empty';
        empty.textContent = i18n.t('mpNoOpenRooms');
        this.el.mpOpenRooms.appendChild(empty);
        return;
      }

      for (const r of rooms) {
        const row = document.createElement('div');
        row.className = 'open-room-row';
        const mapObj = catalog.getById(catalog.MAP_THEMES, r.mapId || 'crypt');
        const mapName = mapObj ? i18n.pick(mapObj.name) : r.mapId;
        row.innerHTML = `
          <div class="open-room-meta">
            <strong>${escapeHtml(r.code)} · ${escapeHtml(r.hostName)}</strong>
            <span>${escapeHtml(mapName)} · ${r.playerCount}/${r.maxPlayers}</span>
          </div>
          <button type="button" class="btn-primary">${i18n.t('mpJoinQuick')}</button>
        `;
        const btn = row.querySelector('button');
        btn.addEventListener('click', () => {
          if (onQuickJoin) onQuickJoin(r.code);
        });
        this.el.mpOpenRooms.appendChild(row);
      }
    }

    copyInviteLink() {
      const text = this.currentInviteUrl;
      if (!text) return;
      const markCopied = () => {
        if (!this.el.btnMpCopyLink) return;
        this.el.btnMpCopyLink.textContent = i18n.t('mpLinkCopied');
        if (this.copyResetTimer) clearTimeout(this.copyResetTimer);
        this.copyResetTimer = setTimeout(() => {
          if (this.el.btnMpCopyLink) {
            this.el.btnMpCopyLink.textContent = i18n.t('mpCopyLink');
          }
        }, 2000);
      };
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(markCopied).catch(() => {
          markCopied();
        });
      } else if (typeof document !== 'undefined') {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
        } catch (_err) {
          // ignore
        }
        document.body.removeChild(ta);
        markCopied();
      }
    }

    renderMpLobby(room, selfId, lanUrls) {
      if (!room) {
        this.el.mpSetupView.hidden = false;
        this.el.mpRoomView.hidden = true;
        this.currentInviteUrl = '';
        return;
      }

      this.el.mpSetupView.hidden = true;
      this.el.mpRoomView.hidden = false;
      this.el.mpActiveCode.textContent = room.code;
      this.el.mpWaitingLabel.textContent = i18n.t('mpWaiting', {
        cur: room.players.length,
        max: room.maxPlayers,
      });

      const isLocalHost =
        typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const origin =
        typeof window !== 'undefined' && window.location && window.location.origin.startsWith('http')
          ? window.location.origin
          : '';
      const baseUrl =
        isLocalHost && Array.isArray(lanUrls) && lanUrls.length > 0
          ? lanUrls[0]
          : origin || (Array.isArray(lanUrls) && lanUrls[0]) || 'http://localhost:3000';
      const inviteUrl = `${baseUrl}/?join=${encodeURIComponent(room.code)}`;
      this.currentInviteUrl = inviteUrl;

      this.el.mpLanUrls.textContent = inviteUrl;
      if (this.el.mpQrCanvas && qrMod && qrMod.renderQrCanvas) {
        qrMod.renderQrCanvas(this.el.mpQrCanvas, inviteUrl);
      }

      this.el.mpRoster.innerHTML = '';
      for (let slot = 0; slot < room.maxPlayers; slot++) {
        const p = room.players.find((pl) => pl.slotIndex === slot);
        const div = document.createElement('div');
        div.className = 'roster-slot' + (p ? '' : ' is-empty');
        const dotColor = MP_CONFIG.PLAYER_COLORS[slot % MP_CONFIG.PLAYER_COLORS.length];
        if (p) {
          const tags = [];
          if (p.isHost) tags.push(i18n.t('mpHostBadge'));
          if (p.id === selfId) tags.push(i18n.t('mpYouBadge'));
          div.innerHTML = `
            <span style="display:flex;align-items:center;gap:8px;">
              <span class="mp-standing-dot" style="background:${dotColor}"></span>
              <strong>${escapeHtml(p.name)}</strong>
            </span>
            <span class="stat-label">${tags.join(' · ')}</span>
          `;
        } else {
          div.innerHTML = `<span>Slot ${slot + 1}</span><span>...</span>`;
        }
        this.el.mpRoster.appendChild(div);
      }

      const isHost = room.hostId === selfId;
      this.el.btnMpStart.hidden = !isHost;
      this.el.btnMpStart.disabled = !isHost || room.players.length < 2;
    }

    initKeySlots(keyCount, isMultiplayer) {
      if (this.el.keysList) {
        this.el.keysList.hidden = Boolean(isMultiplayer);
        this.el.keysList.innerHTML = '';
        if (!isMultiplayer) {
          for (let i = 0; i < keyCount; i++) {
            const def = KEY_DEFS[i % KEY_DEFS.length];
            const slot = document.createElement('div');
            slot.className = 'key-slot';
            slot.dataset.keyIndex = String(i);
            slot.title = i18n.getLanguage() === 'fa' ? def.faName : def.name;
            slot.innerHTML = `
              <svg viewBox="0 0 24 24" aria-hidden="true" class="key-svg" style="--key-color:${def.color}">
                <circle cx="8" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="2"/>
                <path d="M12.5 12H21M18 12v3.5M21 12v3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
              <span class="key-label">${(i18n.getLanguage() === 'fa' ? def.faName : def.name).replace(' Key', '').replace('کلید ', '')}</span>
            `;
            this.el.keysList.appendChild(slot);
          }
        }
      }
      if (this.el.mpStandings) {
        this.el.mpStandings.hidden = !isMultiplayer;
      }
      if (this.el.btnHudRestart) {
        this.el.btnHudRestart.hidden = Boolean(isMultiplayer);
      }
    }

    showToast(message, tone) {
      if (!this.el.eventToast) return;
      this.el.eventToast.textContent = message;
      this.el.eventToast.dataset.tone = tone || 'info';
      this.el.eventToast.hidden = false;
      this.toastTimer = 2.8;
    }

    updateHUD(world, dt) {
      const { player, enemy, maze, timeLeft, interactLabel } = world;

      if (this.toastTimer > 0) {
        this.toastTimer -= dt;
        if (this.toastTimer <= 0) {
          this.el.eventToast.hidden = true;
        }
      }

      const hpPct = Math.max(0, Math.min(100, (player.hp / player.maxHp) * 100));
      if (this.hpGhostPct > hpPct) {
        this.hpGhostPct = Math.max(hpPct, this.hpGhostPct - dt * 36);
      } else {
        this.hpGhostPct = hpPct;
      }
      this.el.hpFill.style.transform = `scaleX(${hpPct / 100})`;
      this.el.hpGhost.style.transform = `scaleX(${this.hpGhostPct / 100})`;

      const statusKey = hpPct <= 35 ? 'critical' : hpPct <= 65 ? 'injured' : 'stable';
      this.el.hpText.textContent = `${Math.round(player.hp)}/${player.maxHp} · ${i18n.t(statusKey)}`;
      this.el.hpFill.dataset.status = statusKey;

      const stamPct = Math.max(0, Math.min(100, (player.stamina / player.maxStamina) * 100));
      this.el.staminaFill.style.transform = `scaleX(${stamPct / 100})`;
      this.el.staminaFill.classList.toggle('is-exhausted', player.exhaustTimer > 0);

      const batPct = Math.max(0, Math.min(100, (player.battery / player.maxBattery) * 100));
      this.el.batteryFill.style.transform = `scaleX(${batPct / 100})`;
      this.el.flashlightState.textContent = `${Math.round(batPct)}% · ${
        player.flashlightOn ? i18n.t('on') : i18n.t('off')
      }`;

      this.el.timerText.textContent = formatTime(timeLeft);
      this.el.timerText.classList.toggle('is-critical', timeLeft <= 30);

      if (this.el.stageBadge) {
        this.el.stageBadge.hidden = Boolean(world.isMultiplayer);
        if (!world.isMultiplayer) {
          this.el.stageBadge.textContent = i18n.t('stageBadge', {
            cur: world.stage || 1,
            max: world.maxStages || cfg.MAX_STAGES || 4,
          });
        }
      }

      if (this.el.smokeChip) {
        const bombs = player.smokeBombs ?? 0;
        this.el.smokeChip.textContent = `${i18n.t('smokeHud')} ×${bombs}`;
        this.el.smokeChip.classList.toggle('is-ready', bombs > 0);
        this.el.smokeChip.classList.toggle('is-empty', bombs <= 0);
      }

      if (this.el.crouchChip) {
        this.el.crouchChip.textContent = player.isCrouching
          ? i18n.t('crouchHud')
          : i18n.t('standHud');
        this.el.crouchChip.classList.toggle('is-active', Boolean(player.isCrouching));
      }

      if (this.el.btnHudSkill) {
        const btn = this.el.btnHudSkill;
        btn.classList.remove('is-ready', 'is-active', 'is-passive', 'is-cooldown');
        const actTimer = Math.max(player.skillActiveTimer || 0, player.cloakTimer || 0);
        const cdTimer = player.skillCooldownTimer || 0;
        if (actTimer > 0) {
          btn.textContent = i18n.t('skillHudActive', { sec: Math.ceil(actTimer) });
          btn.classList.add('is-active');
        } else if (player.skillMode === 'passive') {
          btn.classList.add('is-passive');
          if (player.skillId === 'alchemical_immunity') {
            const left = Math.max(1, Math.ceil(45 - (player.smokeCraftTimer || 0)));
            btn.textContent = i18n.t('skillHudImmune', { sec: left });
          } else if (cdTimer > 0) {
            btn.textContent = i18n.t('skillHudAuto', { sec: Math.ceil(cdTimer) });
            btn.classList.add('is-cooldown');
          } else {
            btn.textContent = i18n.t('skillHudAutoReady');
          }
        } else if (cdTimer > 0) {
          btn.textContent = i18n.t('skillHudCd', { sec: Math.ceil(cdTimer) });
          btn.classList.add('is-cooldown');
        } else {
          btn.textContent = i18n.t('skillHudReady');
          btn.classList.add('is-ready');
        }
      }

      if (world.isMultiplayer) {
        const target = world.mpTargetFinishers || world.mpPlayerCount;
        this.el.objectiveText.textContent = i18n.t('mpRaceObj', {
          finished: world.mpFinishers.length,
          target,
        });

        if (this.el.mpStandings) {
          this.el.mpStandings.innerHTML = '';
          const allRacers = [
            { id: world.selfId, slotIndex: world.selfSlot, name: world.selfName, finishedRank: player.finishedRank, alive: player.alive },
            ...world.remotePlayers,
          ].sort((a, b) => a.slotIndex - b.slotIndex);

          for (const r of allRacers) {
            const chip = document.createElement('div');
            chip.className = 'mp-standing-chip';
            const dot = MP_CONFIG.PLAYER_COLORS[r.slotIndex % MP_CONFIG.PLAYER_COLORS.length];
            const suffix = r.finishedRank ? ` #${r.finishedRank}` : !r.alive ? ' ✕' : '';
            chip.innerHTML = `<span class="mp-standing-dot" style="background:${dot}"></span><span>${escapeHtml(r.name)}${suffix}</span>`;
            this.el.mpStandings.appendChild(chip);
          }
        }
      } else {
        const totalKeys = maze.keys.length;
        const gotKeys = player.keysCollected.length;
        const allDoorsUnlocked = maze.doors.every((d) => d.unlocked);
        let objective = '';
        if (allDoorsUnlocked) {
          objective = i18n.t('exitOpenObj');
        } else {
          const nextKey = maze.keys.find((k) => !k.collected);
          const lockedDoorForCollected = maze.doors.find(
            (d) => !d.unlocked && player.keysCollected.includes(d.keyIndex)
          );
          if (lockedDoorForCollected) {
            const dName =
              i18n.getLanguage() === 'fa' ? lockedDoorForCollected.faName : lockedDoorForCollected.name;
            objective = i18n.t('unlockDoorObj', { door: dName, got: gotKeys, total: totalKeys });
          } else if (nextKey) {
            const kName = i18n.getLanguage() === 'fa' ? nextKey.faName : nextKey.name;
            objective = i18n.t('findKeyObj', { key: kName, got: gotKeys, total: totalKeys });
          }
        }
        this.el.objectiveText.textContent = objective;

        const slots = this.el.keysList.children;
        for (let i = 0; i < slots.length; i++) {
          const slot = slots[i];
          const idx = Number(slot.dataset.keyIndex);
          const hasKey = player.keysCollected.includes(idx);
          const door = maze.doors.find((d) => d.keyIndex === idx);
          const used = Boolean(door && door.unlocked);
          slot.classList.toggle('is-collected', hasKey);
          slot.classList.toggle('is-used', used);
        }
      }

      const activeEnemies =
        Array.isArray(world.enemies) && world.enemies.length > 0
          ? world.enemies
          : enemy
          ? [enemy]
          : [];
      const boss = activeEnemies.find((e) => e && e.isBoss);
      if (this.el.bossBar) {
        if (boss && !world.isMultiplayer) {
          this.el.bossBar.hidden = false;
          if (this.el.bossName) this.el.bossName.textContent = i18n.t('bossHudTitle');
          let bState = 'hunting';
          let bText = i18n.t('bossHudHunting');
          if ((boss.stunTimer || 0) > 0) {
            bState = 'stunned';
            bText = i18n.t('bossHudStunned', { sec: Math.ceil(boss.stunTimer) });
          } else if ((boss.telegraphTimer || 0) > 0) {
            bState = 'windup';
            bText = i18n.t('bossHudWindup');
          } else if ((boss.surgeTimer || 0) > 0) {
            bState = 'windup';
            bText = i18n.t('bossHudSurge');
          }
          this.el.bossBar.dataset.bossState = bState;
          if (this.el.bossStatus) this.el.bossStatus.textContent = bText;
        } else {
          this.el.bossBar.hidden = true;
        }
      }

      const anyChase = activeEnemies.some(
        (e) => e && e.state === ENEMY_STATE.CHASE && (e.stunTimer || 0) <= 0
      );
      const anySearch = activeEnemies.some(
        (e) =>
          e &&
          (e.stunTimer || 0) <= 0 &&
          (e.state === ENEMY_STATE.INVESTIGATE || e.state === ENEMY_STATE.SEARCH)
      );
      const inSmoke = Array.isArray(world.smokeClouds)
        ? world.smokeClouds.some((sc) => Math.hypot(player.x - sc.x, player.y - sc.y) <= sc.radius)
        : false;
      const inGas =
        !player.toxicImmune &&
        Array.isArray(world.gasClouds) &&
        world.gasClouds.some((gc) => Math.hypot(player.x - gc.x, player.y - gc.y) <= gc.radius);
      const outageActive = (world.powerOutageTimer || 0) > 0;

      if (world.isMultiplayer && player.finishedRank !== null && player.finishedRank > 0) {
        this.el.threatBanner.hidden = false;
        this.el.threatBanner.dataset.level = 'spectate';
        this.el.threatBanner.textContent = i18n.t('mpSpectatingFinished', {
          rank: player.finishedRank,
        });
      } else if (world.isMultiplayer && !player.alive) {
        this.el.threatBanner.hidden = false;
        this.el.threatBanner.dataset.level = 'spectate';
        this.el.threatBanner.textContent = i18n.t('mpSpectatingDead');
      } else if (outageActive) {
        this.el.threatBanner.hidden = false;
        this.el.threatBanner.dataset.level = 'outage';
        this.el.threatBanner.textContent = i18n.t('powerOutageBanner');
      } else if (inGas || (player.toxicSlowTimer || 0) > 0) {
        this.el.threatBanner.hidden = false;
        this.el.threatBanner.dataset.level = 'gas';
        this.el.threatBanner.textContent = i18n.t('toxicGasBanner');
      } else if (player.hidden) {
        this.el.threatBanner.hidden = false;
        this.el.threatBanner.dataset.level = 'hidden';
        this.el.threatBanner.textContent = i18n.t('concealedBanner');
      } else if ((player.cloakTimer || 0) > 0) {
        this.el.threatBanner.hidden = false;
        this.el.threatBanner.dataset.level = 'smoked';
        this.el.threatBanner.textContent = i18n.t('cloakedBanner');
      } else if (inSmoke) {
        this.el.threatBanner.hidden = false;
        this.el.threatBanner.dataset.level = 'smoked';
        this.el.threatBanner.textContent = i18n.t('smokedBanner');
      } else if (player.webSlowTimer > 0) {
        this.el.threatBanner.hidden = false;
        this.el.threatBanner.dataset.level = 'webbed';
        this.el.threatBanner.textContent = i18n.t('webbedBanner');
      } else if (anyChase) {
        this.el.threatBanner.hidden = false;
        this.el.threatBanner.dataset.level = 'chase';
        this.el.threatBanner.textContent = i18n.t('huntingBanner');
      } else if (anySearch) {
        this.el.threatBanner.hidden = false;
        this.el.threatBanner.dataset.level = 'search';
        this.el.threatBanner.textContent = i18n.t('searchBanner');
      } else if (player.isCrouching) {
        this.el.threatBanner.hidden = false;
        this.el.threatBanner.dataset.level = 'crouch';
        this.el.threatBanner.textContent = i18n.t('crouchingBanner');
      } else {
        this.el.threatBanner.hidden = true;
      }

      if (interactLabel) {
        this.el.interactPrompt.textContent = interactLabel;
        this.el.interactPrompt.hidden = false;
      } else {
        this.el.interactPrompt.hidden = true;
      }
    }

    showEndScreen(snapshot) {
      this.setState(GAME_STATE.GAMEOVER);
      const modalCard = this.el.gameoverModal.querySelector('.modal-card');
      const isMp = Boolean(snapshot.isMultiplayer);
      modalCard.dataset.outcome = snapshot.victory ? 'victory' : 'defeat';

      if (isMp) {
        this.el.goBadge.textContent = i18n.t('raceComplete');
        this.el.goTitle.textContent = i18n.t('mpFinishedTitle');
        this.el.goReason.textContent = snapshot.reason;
        this.el.btnPlayAgain.hidden = true;
        this.el.btnMpLobbyReturn.hidden = false;
      } else {
        this.el.btnPlayAgain.hidden = false;
        this.el.btnMpLobbyReturn.hidden = true;
        const stage = snapshot.stage || 1;
        const maxStages = snapshot.maxStages || cfg.MAX_STAGES || 4;
        if (snapshot.victory) {
          this.el.goBadge.textContent = i18n.t('escapedBadge');
          this.el.goTitle.textContent = i18n.t('youSurvived');
          if (stage < maxStages) {
            this.el.goReason.textContent = i18n.t('clearMsg', {
              diff: snapshot.difficultyLabel,
              stage,
              max: maxStages,
              time: formatTime(snapshot.timeRemaining),
            });
            this.el.btnPlayAgain.textContent = i18n.t('nextStage', {
              next: stage + 1,
              max: maxStages,
            });
            this.el.btnPlayAgain.dataset.action = 'next_stage';
          } else {
            this.el.goReason.textContent = i18n.t('campaignCleared', { max: maxStages });
            this.el.btnPlayAgain.textContent = i18n.t('playAgain');
            this.el.btnPlayAgain.dataset.action = 'restart_campaign';
          }
        } else {
          this.el.goBadge.textContent = i18n.t('signalLost');
          this.el.goTitle.textContent = i18n.t('youPerished');
          this.el.goReason.textContent = snapshot.reason;
          this.el.btnPlayAgain.textContent = i18n.t('tryAgain');
          this.el.btnPlayAgain.dataset.action = 'retry_stage';
        }
      }

      const rating = snapshot.rating;
      this.el.goGradeLetter.textContent = rating.grade;
      this.el.goStars.textContent =
        '★'.repeat(rating.stars) + '☆'.repeat(Math.max(0, 5 - rating.stars));

      this.el.goStatTime.textContent = formatTime(snapshot.elapsedTime);
      this.el.goStatKeys.textContent = isMp
        ? snapshot.mpRankLabel || '-'
        : `${snapshot.keysCollected}/${snapshot.totalKeys}`;
      this.el.goStatScore.textContent = String(rating.totalScore);
      this.el.goStatShards.textContent = `+${rating.shardsEarned}`;

      // Itemized Score Breakdown
      const bd = rating.breakdown;
      this.el.goBreakdown.innerHTML = `
        <div class="bd-row"><span>${i18n.t('bdCompletion')}</span><strong>+${bd.completionPts}</strong></div>
        <div class="bd-row"><span>${i18n.t('bdTime')}</span><strong>+${bd.timePts}</strong></div>
        <div class="bd-row"><span>${i18n.t('bdObjectives')}</span><strong>+${bd.objectivePts}</strong></div>
        <div class="bd-row"><span>${i18n.t('bdTraps')}</span><strong>+${bd.trapPts}</strong></div>
        <div class="bd-row"><span>${i18n.t('bdStealth')}</span><strong>+${bd.stealthPts}</strong></div>
        <div class="bd-row"><span>${i18n.t('bdMultiplier')}</span><strong>×${bd.totalMult}</strong></div>
      `;

      // Multiplayer Rankings
      if (isMp && Array.isArray(snapshot.mpRankings)) {
        this.el.goMpRankings.hidden = false;
        this.el.goMpRankings.innerHTML = '';
        for (const r of snapshot.mpRankings) {
          const row = document.createElement('div');
          row.className = 'bd-row';
          const rankStr =
            r.rank === 1
              ? i18n.t('mpRank1')
              : r.rank === 2
              ? i18n.t('mpRank2')
              : r.rank === 3
              ? i18n.t('mpRank3')
              : r.rank === 4
              ? i18n.t('mpRank4')
              : i18n.t('mpDnf');
          const timeStr = r.rank > 0 ? formatTime(r.elapsedTime) : '--:--';
          row.innerHTML = `<span>${escapeHtml(rankStr)} · ${escapeHtml(r.name)}</span><strong>${timeStr}</strong>`;
          this.el.goMpRankings.appendChild(row);
        }
      } else {
        this.el.goMpRankings.hidden = true;
      }

      if (!isMp && snapshot.victory && snapshot.isNewBest) {
        this.el.goBestNote.textContent = i18n.t('newBest');
        this.el.goBestNote.hidden = false;
      } else if (!isMp && snapshot.bestTimeSec !== null) {
        this.el.goBestNote.textContent = i18n.t('bestTimeLine', {
          diff: snapshot.difficultyLabel,
          time: formatTime(snapshot.bestTimeSec),
        });
        this.el.goBestNote.hidden = false;
      } else {
        this.el.goBestNote.hidden = true;
      }
    }
  }

  return { GameUI, formatTime };
});
