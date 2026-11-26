# The Hollow Labyrinth — Horror Survival Maze

A bilingual (**English** & **Persian / فارسی RTL**) horror survival maze game built with pure **HTML5, CSS3, and Vanilla JavaScript** for the client, paired with a lightweight Express + WebSocket (`ws`) server for **2–4 Player Host-Based LAN & Web Multiplayer**.

## Platforms & Launching

### 1. Web / PWA (Desktop & Mobile Browsers)
```bash
npm install
npm run dev
```
Open `http://localhost:3000`. The app includes a Progressive Web App manifest (`public/manifest.json`) and offline Service Worker (`public/sw.js`) so mobile and desktop browsers can install it directly as an app.

For production hosting:
```bash
npm run build
npm start
```

### 2. Windows Quick Launcher & Desktop App
- **Instant LAN Host & Browser Mode:** Double-click `start-windows.bat` to install dependencies (if needed), start the server on port `3000`, and automatically open the game in your browser while exposing your local Wi-Fi IP for friends to join.
- **Standalone Windows Desktop App (`desktop/`):**
  ```bash
  npm run build
  cd desktop
  npm install
  npm start        # Run Electron desktop window
  npm run dist     # Package Windows installer (.exe) & portable build
  ```

### 3. Android Packaging (PWA or APK)
- **Fastest (PWA):** Open the hosted or LAN URL in Chrome on Android and tap **Install App** / **Add to Home Screen**.
- **Native Android APK (`capacitor.config.json`, `scripts/build-android.sh`):**
  ```bash
  bash scripts/build-android.sh
  ```

## Controls

| Input | Action |
| --- | --- |
| `W A S D` / `Arrow Keys` | Move through corridors |
| `Shift` | Sprint (consumes Stamina) |
| `Mouse Cursor` | Aim flashlight beam (auto-aims with movement if unused) |
| `F` | Toggle Flashlight (off recharges battery slowly) |
| `E` | Unlock Gate / Disarm Revealed Trap / Collect Relic / Hide in Alcove |
| `Tab` | Toggle explored tactical minimap |
| `P` / `Esc` | Pause / Resume |
| `M` | Toggle Sound Effects |
| `R` | Quick Restart (Single-Player) |

On touch devices, an on-screen D-pad and action buttons appear automatically during gameplay.

## Game Modes & Features

- **Single-Player Horror Survival:**
  - Procedural solvable mazes across **Easy** (`15×13`, 2 keys), **Normal** (`21×17`, 3 keys), and **Hard** (`27×21`, 4 keys).
  - Cumulative bridge-safety verification guarantees collapsing floors and hidden pits never block mandatory progression paths.
  - **5 Enemy Archetypes:** Abyssal Stalker, Cellar Spider, Widow Weaver (casts slowing silk webs), Crypt Wraith, and Broodmother (fast lunges + dense webs).
  - **5 Map Themes:** Stone Catacomb, Flooded Cistern, Ashen Crypt, Spider Hollow, and Sunken Facility.
  - **Random World Events:** Mid-run events such as *Power Surge* and *Distant Tremor* plus collectable Ancient Relics.
- **2–4 Player Host-Based LAN / Web Multiplayer:**
  - Host chooses **2, 3, or 4 players** (`25×25`, `29×29`, or `33×33` square labyrinth).
  - Players spawn in distinct corners and race toward the shared **Center Sanctuary** while dodging traps and the patrolling hunter.
  - Strict server-enforced room capacity, live WebSocket position/flashlight sync, finisher toast notifications, and automatic end-match podium rankings (`2P`: 1st/2nd, `3P`: 1st/2nd/3rd, `4P`: match ends as soon as top 3 escape).
- **Shop, Progression & Customization:**
  - Earn **Soul Shards** and **XP / Levels** from every run, plus **Missions** and **Achievements**.
  - Unlock and equip **Player Skins**, **Flashlights**, **Survival Gear**, **Map Themes**, and **Enemy Creatures**—each visualized with clear `0–100` attribute stat bars.
  - End-of-run **S–D Grade & Star Rating** with itemized score breakdown.
- **Audio Engine (`js/audio.js`):** Separate procedural **Menu** and **Gameplay** soundtracks plus synthesized horror SFX with independent **SFX** and **Music** volume sliders.

## Project Structure

```text
├── index.html               # Bilingual shell, HUD, Shop, Missions, MP Lobby, Results
├── server.ts                # Express + WebSocket (ws) server & /api/server-info
├── css/styles.css           # Horror UI, RTL/LTR layout, 0-100 stat bars, mobile controls
├── js/
│   ├── config.js            # Difficulties, tile/trap types, multiplayer & player constants
│   ├── i18n.js              # English (LTR) and Persian (RTL) dictionaries
│   ├── catalog.js           # Skins, flashlights, gear, maps, enemies, missions, grading
│   ├── storage.js           # localStorage persistence, shop unlock/equip, progression
│   ├── pathfinding.js       # A* pathfinding, BFS distances, raycasted line of sight
│   ├── traps.js             # Trap lifecycle, cumulative bridge safety checks, disarming
│   ├── maze.js              # SP progressive maze & MP square corner-to-center maze
│   ├── player.js            # Sub-tile collision, loadout modifiers, silk slow, hiding
│   ├── enemy.js             # Stalker, spider lunge, and silk-weaving AI behaviors
│   ├── net.js               # Pure JS WebSocket multiplayer client
│   ├── audio.js             # Procedural menu/gameplay music and horror SFX
│   ├── renderer.js          # Canvas2D map themes, skins, 8-legged spiders, fog-of-war
│   ├── ui.js                # HUD, Shop, Missions, Multiplayer Lobby, Results breakdown
│   ├── game.js              # Simulation loop, events, multiplayer sync, dev unlock
│   └── main.js              # Bootstrapper, PWA SW registration, responsive sizing
├── public/                  # PWA manifest, Service Worker, SVG & PNG app icons
├── desktop/                 # Windows Electron launcher
├── start-windows.bat        # One-click Windows LAN host launcher
├── capacitor.config.json    # Android Capacitor wrapper configuration
├── scripts/build-android.sh # Android packaging helper script
└── tests/game-logic.test.mjs# Unit & WebSocket integration tests
```

## Running Tests

```bash
npm test
```
