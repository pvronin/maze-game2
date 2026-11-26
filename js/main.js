/**
 * main.js
 * Application entry point: sets up responsive canvas ResizeObserver, instantiates
 * HorrorMazeGame, registers PWA service worker & install prompt, and honors ?autostart=1.
 */
(function () {
  window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('game-canvas');
    const stage = document.getElementById('game-stage');
    if (!canvas || !stage) return;

    const game = new window.HorrorMaze.HorrorMazeGame(canvas);

    const syncSize = () => {
      const rect = stage.getBoundingClientRect();
      game.renderer.resize(rect.width, rect.height);
    };
    syncSize();

    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(syncSize);
      ro.observe(stage);
    } else {
      window.addEventListener('resize', syncSize);
    }

    window.__HORROR_MAZE_GAME__ = game;

    // Register Service Worker for offline & installable PWA support (HTTP/HTTPS only)
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    // In-app Install App button handling
    let deferredInstallPrompt = null;
    const installBtn = document.getElementById('btn-install-app');
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      if (installBtn) installBtn.hidden = false;
    });
    if (installBtn) {
      installBtn.addEventListener('click', async () => {
        if (deferredInstallPrompt) {
          deferredInstallPrompt.prompt();
          await deferredInstallPrompt.userChoice;
          deferredInstallPrompt = null;
          installBtn.hidden = true;
        }
      });
    }
    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      if (installBtn) installBtn.hidden = true;
    });

    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get('join');
    if (joinCode) {
      game.autoJoinFromUrl(joinCode, params.get('server'));
    } else if (params.get('autostart') === '1') {
      game.startNewGame();
    }

    game.startLoop();
  });
})();
