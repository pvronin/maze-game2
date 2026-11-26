/**
 * net.js
 * Pure Vanilla JS WebSocket client for Host-based 2–4 player LAN/Web Multiplayer.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HorrorMaze = root.HorrorMaze || {};
    Object.assign(root.HorrorMaze, factory());
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function resolveWsUrl(customUrl) {
    const trimmed = (customUrl || '').trim();
    if (trimmed) {
      let normalized = trimmed;
      if (!/^[a-zA-Z]+:\/\//.test(normalized)) {
        normalized = 'ws://' + normalized;
      }
      try {
        const parsed = new URL(normalized);
        const wsProto =
          parsed.protocol === 'https:' || parsed.protocol === 'wss:' ? 'wss:' : 'ws:';
        const host = parsed.port
          ? parsed.host
          : wsProto === 'wss:'
          ? parsed.hostname
          : `${parsed.hostname}:3000`;
        return `${wsProto}//${host}`;
      } catch (_err) {
        if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) return trimmed;
        if (trimmed.startsWith('http://')) return 'ws://' + trimmed.slice(7);
        if (trimmed.startsWith('https://')) return 'wss://' + trimmed.slice(8);
        return 'ws://' + trimmed;
      }
    }
    if (typeof window !== 'undefined' && window.location && window.location.host) {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${window.location.host}`;
    }
    return 'ws://localhost:3000';
  }

  function resolveHttpBase(customUrl) {
    const trimmed = (customUrl || '').trim();
    if (trimmed) {
      const ws = resolveWsUrl(trimmed);
      return ws.replace(/^ws(s?):/, 'http$1:');
    }
    if (typeof window !== 'undefined' && window.location && window.location.origin.startsWith('http')) {
      return window.location.origin;
    }
    return '';
  }

  async function fetchOpenRooms(customUrl) {
    if (typeof fetch !== 'function') return [];
    const base = resolveHttpBase(customUrl);
    if (!base) return [];
    try {
      const res = await fetch(`${base}/api/rooms`, { cache: 'no-store' });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.rooms) ? data.rooms : [];
    } catch (_err) {
      return [];
    }
  }

  class MultiplayerClient {
    constructor(handlers) {
      this.handlers = handlers || {};
      this.ws = null;
      this.playerId = null;
      this.slotIndex = 0;
      this.room = null;
      this.connected = false;
      this.lastSyncSentAt = 0;
      this.lastEnemySyncAt = 0;
    }

    connect(customUrl) {
      this.disconnect();
      const wsUrl = resolveWsUrl(customUrl);
      return new Promise((resolve, reject) => {
        try {
          const ws = new WebSocket(wsUrl);
          this.ws = ws;
          let settled = false;

          ws.addEventListener('open', () => {
            this.connected = true;
            settled = true;
            if (this.handlers.onOpen) this.handlers.onOpen();
            resolve();
          });

          ws.addEventListener('message', (ev) => {
            try {
              const msg = JSON.parse(ev.data);
              this.handleMessage(msg);
            } catch (_err) {
              // ignore malformed
            }
          });

          ws.addEventListener('close', () => {
            const wasConnected = this.connected;
            this.connected = false;
            this.ws = null;
            if (wasConnected && this.handlers.onClose) {
              this.handlers.onClose();
            }
          });

          ws.addEventListener('error', () => {
            if (!settled) {
              settled = true;
              reject(new Error('WS_CONNECT_FAILED'));
            }
          });
        } catch (err) {
          reject(err);
        }
      });
    }

    disconnect() {
      if (this.ws) {
        try {
          this.ws.close();
        } catch (_err) {
          // ignore
        }
        this.ws = null;
      }
      this.connected = false;
      this.room = null;
      this.playerId = null;
    }

    send(payload) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(payload));
        return true;
      }
      return false;
    }

    handleMessage(msg) {
      switch (msg.type) {
        case 'room:created':
        case 'room:joined':
          this.playerId = msg.playerId;
          this.slotIndex = msg.slotIndex;
          this.room = msg.room;
          if (this.handlers.onRoomState) this.handlers.onRoomState(this.room);
          break;
        case 'room:state':
          this.room = msg.room;
          if (this.handlers.onRoomState) this.handlers.onRoomState(this.room);
          break;
        case 'match:started':
          if (this.handlers.onMatchStarted) this.handlers.onMatchStarted(msg);
          break;
        case 'player:sync':
          if (this.handlers.onPlayerSync) this.handlers.onPlayerSync(msg);
          break;
        case 'enemy:sync':
          if (this.handlers.onEnemySync) this.handlers.onEnemySync(msg);
          break;
        case 'player:finished':
          if (this.handlers.onPlayerFinished) this.handlers.onPlayerFinished(msg);
          break;
        case 'match:ended':
          if (this.handlers.onMatchEnded) this.handlers.onMatchEnded(msg);
          break;
        case 'error':
          if (this.handlers.onError) this.handlers.onError(msg.code);
          break;
        default:
          break;
      }
    }

    hostRoom(opts) {
      return this.send({ type: 'host:create', ...opts });
    }

    joinRoom(opts) {
      return this.send({ type: 'room:join', ...opts });
    }

    updateConfig(opts) {
      return this.send({ type: 'room:update_config', ...opts });
    }

    startMatch() {
      return this.send({ type: 'match:start' });
    }

    sendPlayerState(player, force) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (!force && now - this.lastSyncSentAt < 50) return; // ~20 Hz sync
      this.lastSyncSentAt = now;
      this.send({
        type: 'player:update',
        x: Number(player.x.toFixed(3)),
        y: Number(player.y.toFixed(3)),
        angle: Number(player.angle.toFixed(3)),
        flashlightOn: Boolean(player.flashlightOn),
        hp: Math.round(player.hp),
        hidden: Boolean(player.hidden),
        alive: Boolean(player.alive),
      });
    }

    sendEnemyState(enemy, droppedWeb) {
      if (!enemy) return;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (!droppedWeb && now - this.lastEnemySyncAt < 66) return; // ~15 Hz sync
      this.lastEnemySyncAt = now;
      this.send({
        type: 'enemy:sync',
        x: Number(enemy.x.toFixed(3)),
        y: Number(enemy.y.toFixed(3)),
        angle: Number(enemy.angle.toFixed(3)),
        state: enemy.state,
        animPhase: Number(enemy.animPhase.toFixed(2)),
        droppedWeb: droppedWeb || null,
      });
    }

    sendFinish(elapsedTime) {
      return this.send({ type: 'player:finish', elapsedTime });
    }

    sendTimeout() {
      return this.send({ type: 'match:timeout' });
    }

    returnToLobby() {
      return this.send({ type: 'room:return_lobby' });
    }
  }

  return { MultiplayerClient, resolveWsUrl, resolveHttpBase, fetchOpenRooms };
});
