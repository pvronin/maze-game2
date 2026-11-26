/**
 * renderer.js
 * HTML5 Canvas2D renderer featuring:
 *  - Map-themed procedural stonework & environmental floor details (puddles, embers, webs, grating)
 *  - Custom Player Skins, Flashlight beam profiles, Ancient Relics, and Spider Silk Webs
 *  - Multiple articulated Creature visuals (8-legged Spiders, Wraith, Broodmother, Stalker)
 *  - Multiplayer remote racers with color rings, flashlights, overhead nameplates & rank badges
 *  - Raycasted 2D Fog of War + dual-layer volumetric flashlight cone + tactical minimap
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./config.js'),
      require('./pathfinding.js'),
      require('./catalog.js')
    );
  } else {
    root.HorrorMaze = root.HorrorMaze || {};
    Object.assign(
      root.HorrorMaze,
      factory(root.HorrorMaze, root.HorrorMaze, root.HorrorMaze)
    );
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (cfg, pf, catalog) {
  const { TILE, TRAP_TYPE, ENEMY_STATE, RENDER_CFG, PALETTE, MP_CONFIG } = cfg;
  const { castRay } = pf;

  class MazeRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.lightCanvas = document.createElement('canvas');
      this.lightCtx = this.lightCanvas.getContext('2d');
      this.lightScale = 0.5;
      this.titleScrimCanvas = document.createElement('canvas');
      this.titleScrimCtx = this.titleScrimCanvas.getContext('2d');
      this.width = 1280;
      this.height = 720;
      this.dpr = 1;

      this.camX = 0;
      this.camY = 0;
      this.trauma = 0;
      this.hitFlash = 0;
      this.jumpscareFlash = 0;

      this.poolSize = RENDER_CFG.PARTICLE_POOL_SIZE;
      this.particles = Array.from({ length: this.poolSize }, () => ({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        size: 2,
        color: '#ffffff',
      }));
      this.particleCursor = 0;

      this.dustMotes = Array.from({ length: 32 }, (_, i) => ({
        x: (i * 197) % 1000,
        y: (i * 313) % 1000,
        r: 0.8 + (i % 3) * 0.65,
        speed: 8 + (i % 5) * 4,
        alpha: 0.14 + (i % 4) * 0.08,
      }));
    }

    resize(cssWidth, cssHeight) {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      this.dpr = dpr;
      this.width = Math.max(320, cssWidth);
      this.height = Math.max(240, cssHeight);
      this.canvas.width = Math.floor(this.width * dpr);
      this.canvas.height = Math.floor(this.height * dpr);
      this.lightCanvas.width = Math.max(160, Math.floor(this.width * this.lightScale));
      this.lightCanvas.height = Math.max(120, Math.floor(this.height * this.lightScale));

      this.titleScrimCanvas.width = Math.floor(this.width);
      this.titleScrimCanvas.height = Math.floor(this.height);
      const sctx = this.titleScrimCtx;
      const focalX = this.width * 0.68;
      const focalY = this.height * 0.52;
      const vig = sctx.createRadialGradient(
        focalX,
        focalY,
        40,
        focalX,
        focalY,
        Math.max(this.width, this.height) * 0.72
      );
      vig.addColorStop(0, 'rgba(5, 7, 11, 0.18)');
      vig.addColorStop(0.55, 'rgba(5, 7, 11, 0.72)');
      vig.addColorStop(1, 'rgba(4, 6, 10, 0.97)');
      sctx.fillStyle = vig;
      sctx.fillRect(0, 0, this.width, this.height);

      const leftScrim = sctx.createLinearGradient(0, 0, this.width * 0.55, 0);
      leftScrim.addColorStop(0, 'rgba(4, 6, 10, 0.94)');
      leftScrim.addColorStop(0.7, 'rgba(4, 6, 10, 0.72)');
      leftScrim.addColorStop(1, 'rgba(4, 6, 10, 0)');
      sctx.fillStyle = leftScrim;
      sctx.fillRect(0, 0, this.width * 0.55, this.height);
    }

    addTrauma(amount) {
      this.trauma = Math.min(1, this.trauma + amount);
    }

    triggerHitFlash(alpha) {
      this.hitFlash = Math.max(this.hitFlash, alpha);
    }

    triggerJumpscare() {
      this.jumpscareFlash = 1.0;
      this.addTrauma(0.95);
    }

    spawnBurst(wx, wy, count, color, speedMin, speedMax, life) {
      for (let i = 0; i < count; i++) {
        const p = this.particles[this.particleCursor];
        this.particleCursor = (this.particleCursor + 1) % this.poolSize;
        const ang = Math.random() * Math.PI * 2;
        const spd = speedMin + Math.random() * (speedMax - speedMin);
        p.active = true;
        p.x = wx;
        p.y = wy;
        p.vx = Math.cos(ang) * spd;
        p.vy = Math.sin(ang) * spd;
        p.life = life * (0.65 + Math.random() * 0.5);
        p.maxLife = p.life;
        p.size = 1.8 + Math.random() * 2.6;
        p.color = color;
      }
    }

    updateEffects(dt) {
      if (this.trauma > 0) this.trauma = Math.max(0, this.trauma - dt * 1.9);
      if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt * 2.4);
      if (this.jumpscareFlash > 0) this.jumpscareFlash = Math.max(0, this.jumpscareFlash - dt * 1.4);

      for (let i = 0; i < this.poolSize; i++) {
        const p = this.particles[i];
        if (!p.active) continue;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.94;
        p.vy *= 0.94;
        p.life -= dt;
        if (p.life <= 0) p.active = false;
      }
    }

    screenToWorld(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      const ts = RENDER_CFG.TILE_SIZE;
      return {
        x: (sx - this.width * 0.5) / ts + this.camX,
        y: (sy - this.height * 0.5) / ts + this.camY,
      };
    }

    renderTitleBackdrop(timeSec, mapId) {
      const ctx = this.ctx;
      const theme = catalog ? catalog.getById(catalog.MAP_THEMES, mapId || 'crypt') : null;
      const pal = theme ? theme.palette : null;

      ctx.save();
      ctx.scale(this.dpr, this.dpr);

      ctx.fillStyle = pal ? pal.bg : PALETTE.BG;
      ctx.fillRect(0, 0, this.width, this.height);

      const ts = 64;
      const panX = Math.sin(timeSec * 0.16) * 140 + timeSec * 12;
      const panY = Math.cos(timeSec * 0.13) * 80 + timeSec * 7;

      const startCol = Math.floor(panX / ts) - 1;
      const endCol = startCol + Math.ceil(this.width / ts) + 3;
      const startRow = Math.floor(panY / ts) - 1;
      const endRow = startRow + Math.ceil(this.height / ts) + 3;

      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          const sx = c * ts - panX;
          const sy = r * ts - panY;
          const hash = Math.abs((c * 73856093) ^ (r * 19349663)) % 11;
          if (hash < 3) {
            ctx.fillStyle = pal ? pal.wallFace : '#131924';
            ctx.fillRect(sx, sy, ts - 1, ts - 1);
            ctx.strokeStyle = pal ? pal.wallTop : '#1e2736';
            ctx.lineWidth = 1;
            ctx.strokeRect(sx + 1, sy + 1, ts - 3, ts - 3);
          } else if ((c + r) % 2 === 0) {
            ctx.fillStyle = pal ? pal.floorB : '#0b0e14';
            ctx.fillRect(sx, sy, ts, ts);
          }
        }
      }

      const focalX = this.width * 0.68;
      const focalY = this.height * 0.52;
      const beamAngle = Math.sin(timeSec * 0.45) * 0.45 - 0.15;

      ctx.save();
      ctx.translate(focalX, focalY);
      ctx.rotate(beamAngle);
      const beamGrad = ctx.createRadialGradient(0, 0, 12, 0, 0, 420);
      beamGrad.addColorStop(0, 'rgba(245, 196, 108, 0.22)');
      beamGrad.addColorStop(0.55, 'rgba(217, 119, 6, 0.08)');
      beamGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = beamGrad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 420, -0.34, 0.34);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      const eyePulse = Math.max(0, Math.sin(timeSec * 0.85));
      if (eyePulse > 0.08) {
        const ex = focalX + Math.sin(timeSec * 0.3) * 38 + 60;
        const ey = focalY + Math.cos(timeSec * 0.4) * 28 - 20;
        ctx.fillStyle = `rgba(239, 68, 68, ${eyePulse * 0.78})`;
        ctx.beginPath();
        ctx.arc(ex - 6, ey, 3.2, 0, Math.PI * 2);
        ctx.arc(ex + 6, ey, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.drawImage(this.titleScrimCanvas, 0, 0);

      ctx.fillStyle = pal ? pal.particleColor : 'rgba(226, 232, 240, 0.35)';
      for (let i = 0; i < this.dustMotes.length; i++) {
        const m = this.dustMotes[i];
        const mx = ((m.x + timeSec * m.speed) % 1000) * 0.001 * this.width;
        const my = ((m.y - timeSec * m.speed * 0.4 + 1000) % 1000) * 0.001 * this.height;
        ctx.globalAlpha = m.alpha;
        ctx.beginPath();
        ctx.arc(mx, my, m.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    markExplored(world, px, py, radius) {
      const tx = Math.floor(px);
      const ty = Math.floor(py);
      const r = Math.ceil(radius);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = tx + dx;
          const ny = ty + dy;
          if (ny < 0 || nx < 0 || ny >= world.rows || nx >= world.cols) continue;
          if (dx * dx + dy * dy <= radius * radius) {
            world.explored[ny][nx] = 1;
          }
        }
      }
    }

    renderGame(world, timeSec, dt) {
      const ctx = this.ctx;
      const ts = RENDER_CFG.TILE_SIZE;
      const {
        player,
        enemy,
        enemies,
        maze,
        explored,
        showMinimap,
        webs = [],
        smokeClouds = [],
        gasClouds = [],
        shockwaveRings = [],
        sonarPulses = [],
        remotePlayers = [],
      } = world;
      const fullScan = (world.fullMapRevealTimer || 0) > 0;
      const activeEnemies = Array.isArray(enemies) && enemies.length > 0 ? enemies : enemy ? [enemy] : [];
      const mapTheme = catalog ? catalog.getById(catalog.MAP_THEMES, maze.mapId || 'crypt') : null;
      const pal = mapTheme ? mapTheme.palette : {
        bg: PALETTE.BG,
        floorA: PALETTE.FLOOR_A,
        floorB: PALETTE.FLOOR_B,
        wallTop: PALETTE.WALL_TOP,
        wallFace: PALETTE.WALL_FACE,
        wallEdge: PALETTE.WALL_EDGE,
        decor: 'stone',
      };

      const lerp = 1 - Math.exp(-10 * (dt || 0.016));
      this.camX += (player.x - this.camX) * lerp;
      this.camY += (player.y - this.camY) * lerp;

      const shakeMag = this.trauma * this.trauma * 14;
      const shakeX = shakeMag > 0.1 ? (Math.random() * 2 - 1) * shakeMag : 0;
      const shakeY = shakeMag > 0.1 ? (Math.random() * 2 - 1) * shakeMag : 0;

      const offsetX = this.width * 0.5 - this.camX * ts + shakeX;
      const offsetY = this.height * 0.5 - this.camY * ts + shakeY;

      ctx.save();
      ctx.scale(this.dpr, this.dpr);
      ctx.fillStyle = pal.bg;
      ctx.fillRect(0, 0, this.width, this.height);

      const minC = Math.max(0, Math.floor((this.camX * ts - this.width * 0.5) / ts) - 1);
      const maxC = Math.min(maze.cols - 1, Math.ceil((this.camX * ts + this.width * 0.5) / ts) + 1);
      const minR = Math.max(0, Math.floor((this.camY * ts - this.height * 0.5) / ts) - 1);
      const maxR = Math.min(maze.rows - 1, Math.ceil((this.camY * ts + this.height * 0.5) / ts) + 1);

      const visMult = player.mods ? player.mods.visionMult || 1 : 1;
      const visBonus = player.mods ? player.mods.ambientVisionBonus || 0 : 0;
      this.markExplored(world, player.x, player.y, Math.max(2.5, 2.5 * visMult + visBonus));

      ctx.save();
      ctx.translate(offsetX, offsetY);

      // 1. Floor, Distinct Architectural Walls, Theme Decor, Alcoves, Exit
      for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
          const tile = maze.grid[r][c];
          const x = c * ts;
          const y = r * ts;
          const cellHash = Math.abs((c * 73856093) ^ (r * 19349663)) % 23;

          if (tile === TILE.WALL) {
            ctx.fillStyle = pal.wallTop;
            ctx.fillRect(x, y, ts, ts);
            ctx.fillStyle = pal.wallFace;
            ctx.fillRect(x + 2, y + ts - 10, ts - 4, 10);

            if (pal.decor === 'stone') {
              // Crypt: Ashlar brick mortar seams + occasional warm torch sconce
              ctx.strokeStyle = 'rgba(15, 23, 42, 0.55)';
              ctx.lineWidth = 1.2;
              ctx.beginPath();
              ctx.moveTo(x, y + ts * 0.45);
              ctx.lineTo(x + ts, y + ts * 0.45);
              ctx.moveTo(x + ts * 0.5, y);
              ctx.lineTo(x + ts * 0.5, y + ts * 0.45);
              ctx.moveTo(x + ts * 0.25, y + ts * 0.45);
              ctx.lineTo(x + ts * 0.25, y + ts - 10);
              ctx.stroke();
              if (cellHash === 2) {
                const flick = 0.7 + Math.sin(timeSec * 8 + c) * 0.25;
                ctx.fillStyle = `rgba(245, 158, 11, ${0.55 * flick})`;
                ctx.beginPath();
                ctx.arc(x + ts * 0.5, y + ts * 0.75, 4.5, 0, Math.PI * 2);
                ctx.fill();
              }
            } else if (pal.decor === 'puddles') {
              // Sewers: Damp mossy bricks + green slime streaks
              ctx.fillStyle = 'rgba(16, 185, 129, 0.16)';
              ctx.fillRect(x + 4, y + ts - 14, ts - 8, 5);
              if (cellHash % 4 === 0) {
                ctx.fillStyle = 'rgba(5, 150, 105, 0.28)';
                ctx.beginPath();
                ctx.arc(x + 12, y + 14, 7, 0, Math.PI * 2);
                ctx.fill();
              }
            } else if (pal.decor === 'embers') {
              // Catacombs: Jagged obsidian fissures with glowing magma veins
              ctx.strokeStyle = 'rgba(249, 115, 22, 0.48)';
              ctx.lineWidth = 1.4;
              ctx.beginPath();
              ctx.moveTo(x + 6, y + 8);
              ctx.lineTo(x + ts * 0.48, y + ts * 0.42);
              ctx.lineTo(x + ts - 7, y + ts * 0.28);
              if (cellHash % 3 === 0) {
                ctx.moveTo(x + ts * 0.48, y + ts * 0.42);
                ctx.lineTo(x + ts * 0.62, y + ts - 12);
              }
              ctx.stroke();
            } else if (pal.decor === 'webs') {
              // Spider Nest: Organic chitin ribs + cocooned wall clusters
              ctx.strokeStyle = 'rgba(168, 85, 247, 0.28)';
              ctx.lineWidth = 1.5;
              for (let k = 10; k < ts; k += 14) {
                ctx.beginPath();
                ctx.arc(x + ts * 0.5, y + k, 12, 0.2, Math.PI - 0.2);
                ctx.stroke();
              }
              if (cellHash === 4) {
                ctx.fillStyle = 'rgba(216, 180, 254, 0.34)';
                ctx.beginPath();
                ctx.ellipse(x + ts * 0.5, y + ts * 0.5, 8, 12, 0.3, 0, Math.PI * 2);
                ctx.fill();
              }
            } else if (pal.decor === 'grating') {
              // Bio Lab: Riveted metal bulkhead + yellow/black hazard stripe on bottom lip
              ctx.fillStyle = '#eab308';
              ctx.fillRect(x + 2, y + ts - 9, ts - 4, 7);
              ctx.fillStyle = '#090d14';
              for (let s = 4; s < ts - 6; s += 10) {
                ctx.beginPath();
                ctx.moveTo(x + s, y + ts - 9);
                ctx.lineTo(x + s + 5, y + ts - 9);
                ctx.lineTo(x + s + 2, y + ts - 2);
                ctx.lineTo(x + s - 3, y + ts - 2);
                ctx.closePath();
                ctx.fill();
              }
              ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
              ctx.fillRect(x + 5, y + 5, 3, 3);
              ctx.fillRect(x + ts - 8, y + 5, 3, 3);
              if (cellHash === 1) {
                const blink = Math.sin(timeSec * 5 + c) > 0 ? 0.9 : 0.25;
                ctx.fillStyle = `rgba(56, 189, 248, ${blink})`;
                ctx.fillRect(x + ts * 0.5 - 5, y + 10, 10, 4);
              }
            }

            ctx.strokeStyle = pal.wallEdge;
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 0.5, y + 0.5, ts - 1, ts - 1);
            continue;
          }

          ctx.fillStyle = (c + r) % 2 === 0 ? pal.floorA : pal.floorB;
          ctx.fillRect(x, y, ts, ts);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, ts, ts);

          // Distinct floor & environmental features per theme
          if (pal.decor === 'stone') {
            if (cellHash % 5 === 0) {
              ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
              ctx.beginPath();
              ctx.moveTo(x + 10, y + 14);
              ctx.lineTo(x + 24, y + 26);
              ctx.lineTo(x + 19, y + 39);
              ctx.stroke();
            }
          } else if (pal.decor === 'puddles') {
            if (cellHash <= 4) {
              const ripple = (timeSec * 1.4 + c + r) % 1;
              ctx.fillStyle = 'rgba(16, 185, 129, 0.18)';
              ctx.beginPath();
              ctx.ellipse(x + ts * 0.5, y + ts * 0.54, ts * 0.34, ts * 0.21, 0.25, 0, Math.PI * 2);
              ctx.fill();
              ctx.strokeStyle = `rgba(110, 231, 183, ${(1 - ripple) * 0.32})`;
              ctx.beginPath();
              ctx.ellipse(
                x + ts * 0.5,
                y + ts * 0.54,
                ts * (0.1 + ripple * 0.22),
                ts * (0.06 + ripple * 0.13),
                0.25,
                0,
                Math.PI * 2
              );
              ctx.stroke();
            } else if (cellHash === 9) {
              ctx.strokeStyle = 'rgba(100, 116, 139, 0.28)';
              ctx.strokeRect(x + 12, y + 12, ts - 24, ts - 24);
              for (let g = 16; g < ts - 14; g += 6) {
                ctx.beginPath();
                ctx.moveTo(x + g, y + 12);
                ctx.lineTo(x + g, y + ts - 12);
                ctx.stroke();
              }
            }
          } else if (pal.decor === 'embers') {
            if (cellHash <= 3) {
              const glow = 0.25 + 0.15 * Math.sin(timeSec * 4 + cellHash);
              ctx.strokeStyle = `rgba(249, 115, 22, ${glow})`;
              ctx.lineWidth = 1.6;
              ctx.beginPath();
              ctx.moveTo(x + 6, y + ts * 0.72);
              ctx.lineTo(x + ts * 0.45, y + ts * 0.46);
              ctx.lineTo(x + ts - 8, y + ts * 0.22);
              ctx.stroke();
            }
            if (cellHash % 4 === 1) {
              const rise = (timeSec * 14 + c * 9) % 24;
              ctx.fillStyle = 'rgba(251, 146, 60, 0.42)';
              ctx.beginPath();
              ctx.arc(x + ts * 0.32, y + ts * 0.78 - rise, 2.0, 0, Math.PI * 2);
              ctx.arc(x + ts * 0.7, y + ts * 0.65 - rise * 0.7, 1.6, 0, Math.PI * 2);
              ctx.fill();
            }
          } else if (pal.decor === 'webs') {
            if (cellHash <= 4) {
              ctx.strokeStyle = 'rgba(226, 232, 240, 0.18)';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(x, y);
              ctx.lineTo(x + 26, y + 18);
              ctx.moveTo(x, y + 18);
              ctx.lineTo(x + 22, y);
              ctx.arc(x, y, 16, 0, Math.PI * 0.5);
              ctx.stroke();
            }
            if (cellHash === 7) {
              const eggPulse = 0.7 + Math.sin(timeSec * 3.2 + c) * 0.25;
              ctx.fillStyle = `rgba(192, 132, 252, ${0.26 * eggPulse})`;
              ctx.beginPath();
              ctx.arc(x + ts * 0.78, y + ts * 0.78, 6, 0, Math.PI * 2);
              ctx.fill();
            }
          } else if (pal.decor === 'grating') {
            // Metallic deck grid & cyan coolant conduit
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
            for (let g = 10; g < ts; g += 12) {
              ctx.beginPath();
              ctx.moveTo(x + g, y + 4);
              ctx.lineTo(x + g, y + ts - 4);
              ctx.stroke();
            }
            if (c % 2 === 0 || r % 2 === 0) {
              ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(x, y + ts * 0.5);
              ctx.lineTo(x + ts, y + ts * 0.5);
              ctx.stroke();
            }
          }

          if (tile === TILE.ALCOVE) {
            ctx.fillStyle = PALETTE.ALCOVE_BG;
            ctx.fillRect(x + 4, y + 4, ts - 8, ts - 8);
            ctx.strokeStyle = PALETTE.ALCOVE_BORDER;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 3]);
            ctx.strokeRect(x + 6, y + 6, ts - 12, ts - 12);
            ctx.setLineDash([]);
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
            ctx.beginPath();
            ctx.moveTo(x + ts * 0.32, y + ts * 0.56);
            ctx.lineTo(x + ts * 0.5, y + ts * 0.36);
            ctx.lineTo(x + ts * 0.68, y + ts * 0.56);
            ctx.stroke();
          } else if (tile === TILE.EXIT) {
            const allUnlocked = maze.doors.length === 0 || maze.doors.every((d) => d.unlocked);
            const pulse = 0.65 + Math.sin(timeSec * 4) * 0.25;
            ctx.fillStyle = allUnlocked
              ? `rgba(16, 185, 129, ${0.26 * pulse})`
              : 'rgba(100, 116, 139, 0.15)';
            ctx.fillRect(x + 3, y + 3, ts - 6, ts - 6);

            ctx.strokeStyle = allUnlocked ? PALETTE.EXIT_GLOW : PALETTE.EXIT_LOCKED;
            ctx.lineWidth = 2.5;
            ctx.strokeRect(x + 7, y + 7, ts - 14, ts - 14);

            if (maze.isMultiplayer) {
              ctx.beginPath();
              ctx.arc(x + ts * 0.5, y + ts * 0.5, ts * 0.34, 0, Math.PI * 2);
              ctx.stroke();
            }

            ctx.fillStyle = allUnlocked ? '#34d399' : '#94a3b8';
            ctx.font = 'bold 11px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(maze.isMultiplayer ? 'GOAL' : 'EXIT', x + ts * 0.5, y + ts * 0.5);
          }
        }
      }

      // 2. False Path chalk marks
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < maze.falsePaths.length; i++) {
        const fp = maze.falsePaths[i];
        if (fp.x < minC || fp.x > maxC || fp.y < minR || fp.y > maxR) continue;
        const cx = (fp.x + 0.5) * ts;
        const cy = (fp.y + 0.5) * ts;
        ctx.beginPath();
        ctx.moveTo(cx - 5, cy - 5);
        ctx.lineTo(cx + 5, cy + 5);
        ctx.moveTo(cx + 5, cy - 5);
        ctx.lineTo(cx - 5, cy + 5);
        ctx.stroke();
      }

      // 3. Spider Silk Webs
      for (let i = 0; i < webs.length; i++) {
        const w = webs[i];
        const wx = w.x * ts;
        const wy = w.y * ts;
        ctx.save();
        ctx.strokeStyle = 'rgba(226, 232, 240, 0.45)';
        ctx.lineWidth = 1.2;
        for (let r = 6; r <= 18; r += 6) {
          ctx.beginPath();
          ctx.arc(wx, wy, r, 0, Math.PI * 2);
          ctx.stroke();
        }
        for (let a = 0; a < 6; a++) {
          const ang = (a / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(wx, wy);
          ctx.lineTo(wx + Math.cos(ang) * 20, wy + Math.sin(ang) * 20);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 4. Traps
      this.drawTraps(ctx, maze.traps, player, ts, timeSec, minC, maxC, minR, maxR);

      // 5. Doors
      for (let i = 0; i < maze.doors.length; i++) {
        const door = maze.doors[i];
        if (door.x < minC || door.x > maxC || door.y < minR || door.y > maxR) continue;
        const dx = door.x * ts;
        const dy = door.y * ts;
        if (!door.unlocked) {
          ctx.fillStyle = '#090d14';
          ctx.fillRect(dx + 2, dy + 2, ts - 4, ts - 4);
          ctx.strokeStyle = '#475569';
          ctx.lineWidth = 3;
          for (let b = 10; b <= ts - 10; b += 10) {
            ctx.beginPath();
            ctx.moveTo(dx + b, dy + 4);
            ctx.lineTo(dx + b, dy + ts - 4);
            ctx.stroke();
          }
          ctx.fillStyle = door.color;
          ctx.beginPath();
          ctx.arc(dx + ts * 0.5, dy + ts * 0.5, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#020617';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          ctx.fillStyle = 'rgba(148, 163, 184, 0.25)';
          ctx.fillRect(dx + 2, dy + 2, 6, ts - 4);
          ctx.fillRect(dx + ts - 8, dy + 2, 6, ts - 4);
        }
      }

      // 6. Pickups, Keys & Ancient Relics
      this.drawItems(ctx, maze, ts, timeSec);

      // 7. Remote Multiplayer Players (under fog, plus badge overlay)
      for (let i = 0; i < remotePlayers.length; i++) {
        const rp = remotePlayers[i];
        if (!rp.alive) continue;
        const color = MP_CONFIG.PLAYER_COLORS[rp.slotIndex % MP_CONFIG.PLAYER_COLORS.length];
        this.drawPlayer(ctx, rp, ts, timeSec, color);
      }

      // 8. Local Player
      this.drawPlayer(ctx, player, ts, timeSec, null);

      // 9. Particles
      for (let i = 0; i < this.poolSize; i++) {
        const p = this.particles[i];
        if (!p.active) continue;
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x * ts, p.y * ts, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // 10. Enemies (SP single or Stage 4 Boss + patrol, or MP creature)
      for (let i = 0; i < activeEnemies.length; i++) {
        this.drawEnemy(ctx, activeEnemies[i], ts, timeSec, false);
      }

      // 10b. Smoke Bomb Clouds & Toxic Gas Clouds
      this.drawSmokeClouds(ctx, smokeClouds, ts, timeSec);
      this.drawGasClouds(ctx, gasClouds, ts, timeSec);

      // 10c. Boss Shockwave Telegraphs & Expanding Rings
      this.drawBossEffects(ctx, activeEnemies, shockwaveRings, ts, timeSec);

      ctx.restore(); // end world transform

      // 11. Raycasted Fog of War + Custom Flashlight Cone + Expanded Circular Vision
      this.renderLightingOverlay(world, offsetX, offsetY, ts);

      // 11b. Redraw subtle smoke/gas rings, Boss warning rings, Sonar Pulses, and Full-Map Scan beacons above darkness
      const anyTelegraph = activeEnemies.some((e) => (e.telegraphTimer || 0) > 0);
      if (
        smokeClouds.length > 0 ||
        gasClouds.length > 0 ||
        shockwaveRings.length > 0 ||
        sonarPulses.length > 0 ||
        anyTelegraph ||
        fullScan
      ) {
        ctx.save();
        ctx.translate(offsetX, offsetY);
        for (let i = 0; i < smokeClouds.length; i++) {
          const sc = smokeClouds[i];
          const fade = Math.min(1, sc.ttl / 1.0);
          ctx.strokeStyle = `rgba(148, 163, 184, ${0.42 * fade})`;
          ctx.lineWidth = 1.6;
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.arc(sc.x * ts, sc.y * ts, sc.radius * ts, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        for (let i = 0; i < gasClouds.length; i++) {
          const gc = gasClouds[i];
          const fade = Math.min(1, gc.ttl / 1.0);
          ctx.strokeStyle = `rgba(16, 185, 129, ${0.48 * fade})`;
          ctx.lineWidth = 1.8;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.arc(gc.x * ts, gc.y * ts, gc.radius * ts, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        this.drawBossEffects(ctx, activeEnemies, shockwaveRings, ts, timeSec);
        for (let i = 0; i < sonarPulses.length; i++) {
          const sp = sonarPulses[i];
          const progress = 1 - sp.ttl / sp.maxTtl;
          const rad = (0.25 + progress * 1.1) * ts;
          ctx.strokeStyle = sp.color || `rgba(56, 189, 248, ${(1 - progress) * 0.72})`;
          ctx.globalAlpha = Math.max(0, (1 - progress) * 0.75);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(sp.x * ts, sp.y * ts, rad, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (fullScan) {
          this.drawMapScanBeacons(ctx, world, activeEnemies, ts, timeSec);
        }
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      // 12. Remote Player Nameplates (above fog if within 9 tiles & LOS, or faint arrow)
      if (remotePlayers.length > 0) {
        ctx.save();
        ctx.translate(offsetX, offsetY);
        for (const rp of remotePlayers) {
          if (!rp.alive) continue;
          const dist = Math.hypot(rp.x - player.x, rp.y - player.y);
          if (dist < 10) {
            const color = MP_CONFIG.PLAYER_COLORS[rp.slotIndex % MP_CONFIG.PLAYER_COLORS.length];
            ctx.font = 'bold 11px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = color;
            ctx.fillText(rp.name, rp.x * ts, rp.y * ts - 22);
          }
        }
        ctx.restore();
      }

      // 13. Creature glowing eye-glints piercing dark
      let distToEnemy = 999;
      let anyChase = false;
      for (let i = 0; i < activeEnemies.length; i++) {
        const en = activeEnemies[i];
        if (en.state === ENEMY_STATE.CHASE) anyChase = true;
        const d = Math.hypot(en.x - player.x, en.y - player.y);
        if (d < distToEnemy) distToEnemy = d;
        if (
          d < 8.5 &&
          pf.hasLineOfSight(maze.grid, player.x, player.y, en.x, en.y, maze.doorsByCoord)
        ) {
          ctx.save();
          ctx.translate(offsetX, offsetY);
          this.drawEnemy(ctx, en, ts, timeSec, true);
          ctx.restore();
        }
      }

      // 14. Peripheral Threat / Damage Vignettes
      this.renderThreatVignettes(ctx, world, distToEnemy, timeSec, anyChase);

      // 15. Explored Tactical Minimap (always visible during Explorer Full-Map Scan)
      if (showMinimap || fullScan) {
        this.renderMinimap(ctx, world, explored);
      }

      ctx.restore();
    }

    drawSmokeClouds(ctx, smokeClouds, ts, timeSec) {
      if (!smokeClouds || smokeClouds.length === 0) return;
      for (let i = 0; i < smokeClouds.length; i++) {
        const sc = smokeClouds[i];
        const fade = Math.min(1, sc.ttl / 1.2);
        const cx = sc.x * ts;
        const cy = sc.y * ts;
        const rPx = sc.radius * ts;

        const baseGrad = ctx.createRadialGradient(cx, cy, rPx * 0.12, cx, cy, rPx);
        baseGrad.addColorStop(0, `rgba(203, 213, 225, ${0.46 * fade})`);
        baseGrad.addColorStop(0.6, `rgba(148, 163, 184, ${0.34 * fade})`);
        baseGrad.addColorStop(1, 'rgba(71, 85, 105, 0)');
        ctx.fillStyle = baseGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
        ctx.fill();

        for (let p = 0; p < 7; p++) {
          const ang = timeSec * (p % 2 === 0 ? 0.6 : -0.45) + (p * Math.PI * 2) / 7;
          const dist = rPx * (0.28 + (p % 3) * 0.16);
          const px = cx + Math.cos(ang) * dist;
          const py = cy + Math.sin(ang) * dist;
          const puffR = rPx * (0.3 + (p % 2) * 0.1);
          ctx.fillStyle = `rgba(226, 232, 240, ${0.18 * fade})`;
          ctx.beginPath();
          ctx.arc(px, py, puffR, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    drawGasClouds(ctx, gasClouds, ts, timeSec) {
      if (!gasClouds || gasClouds.length === 0) return;
      for (let i = 0; i < gasClouds.length; i++) {
        const gc = gasClouds[i];
        const fade = Math.min(1, gc.ttl / 1.2);
        const cx = gc.x * ts;
        const cy = gc.y * ts;
        const rPx = gc.radius * ts;

        const grad = ctx.createRadialGradient(cx, cy, rPx * 0.1, cx, cy, rPx);
        grad.addColorStop(0, `rgba(16, 185, 129, ${0.42 * fade})`);
        grad.addColorStop(0.6, `rgba(5, 150, 105, ${0.26 * fade})`);
        grad.addColorStop(1, 'rgba(6, 78, 59, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
        ctx.fill();

        for (let b = 0; b < 5; b++) {
          const ang = timeSec * (b % 2 === 0 ? 0.9 : -0.7) + (b * Math.PI * 2) / 5;
          const px = cx + Math.cos(ang) * rPx * 0.45;
          const py = cy + Math.sin(ang) * rPx * 0.45;
          ctx.fillStyle = `rgba(110, 231, 183, ${0.22 * fade})`;
          ctx.beginPath();
          ctx.arc(px, py, rPx * 0.22, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    drawBossEffects(ctx, enemies, shockwaveRings, ts, timeSec) {
      const shockRad = (cfg.BOSS_CFG && cfg.BOSS_CFG.SHOCKWAVE_RADIUS) || 3.35;
      const windupTotal = (cfg.BOSS_CFG && cfg.BOSS_CFG.TELEGRAPH_SEC) || 1.25;
      for (let i = 0; i < enemies.length; i++) {
        const en = enemies[i];
        if (!en || (en.telegraphTimer || 0) <= 0) continue;
        const progress = Math.max(0, Math.min(1, 1 - en.telegraphTimer / windupTotal));
        const cx = en.x * ts;
        const cy = en.y * ts;
        const maxR = shockRad * ts;
        const innerR = Math.max(6, maxR * progress);

        ctx.save();
        ctx.fillStyle = `rgba(225, 29, 72, ${0.14 + progress * 0.14})`;
        ctx.beginPath();
        ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(251, 191, 36, 0.9)';
        ctx.lineWidth = 2.4;
        ctx.setLineDash([7, 4]);
        ctx.beginPath();
        ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = `rgba(248, 113, 113, ${0.7 + Math.sin(timeSec * 24) * 0.25})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      for (let i = 0; i < shockwaveRings.length; i++) {
        const ring = shockwaveRings[i];
        const prog = 1 - ring.ttl / ring.maxTtl;
        const rad = ring.radius * prog * ts;
        ctx.save();
        ctx.strokeStyle = `rgba(251, 113, 133, ${(1 - prog) * 0.9})`;
        ctx.lineWidth = 4.5 * (1 - prog * 0.5);
        ctx.beginPath();
        ctx.arc(ring.x * ts, ring.y * ts, rad, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    drawMapScanBeacons(ctx, world, enemies, ts, timeSec) {
      const { player, maze } = world;
      const pulse = 0.65 + 0.35 * Math.sin(timeSec * 6);
      const drawArrow = (tx, ty, color, label) => {
        const dx = tx - player.x;
        const dy = ty - player.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 1.2) return;
        const ang = Math.atan2(dy, dx);
        const orbitR = Math.min(dist * ts, ts * 2.1);
        const bx = player.x * ts + Math.cos(ang) * orbitR;
        const by = player.y * ts + Math.sin(ang) * orbitR;
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(ang);
        ctx.fillStyle = color;
        ctx.globalAlpha = pulse;
        ctx.beginPath();
        ctx.moveTo(9, 0);
        ctx.lineTo(-5, -5);
        ctx.lineTo(-2, 0);
        ctx.lineTo(-5, 5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        if (label) {
          ctx.save();
          ctx.font = 'bold 10px system-ui, sans-serif';
          ctx.fillStyle = color;
          ctx.textAlign = 'center';
          ctx.fillText(label, tx * ts, ty * ts - 16);
          ctx.restore();
        }
      };

      drawArrow(maze.exit.x + 0.5, maze.exit.y + 0.5, '#34d399', 'EXIT');
      for (const k of maze.keys) {
        if (!k.collected) {
          drawArrow(k.x + 0.5, k.y + 0.5, k.color || '#fbbf24', 'KEY');
        }
      }
      for (const en of enemies) {
        drawArrow(en.x, en.y, '#ef4444', en.isBoss ? 'BOSS' : '!');
      }
    }

    drawTraps(ctx, traps, player, ts, timeSec, minC, maxC, minR, maxR) {
      const revealMult = player.mods ? player.mods.trapRevealMult : 1;
      const flRange = player.mods ? player.mods.lightRange : RENDER_CFG.FLASHLIGHT_RANGE;
      const flSpread = player.mods ? player.mods.lightSpreadRad : RENDER_CFG.FLASHLIGHT_SPREAD_RAD;

      for (let i = 0; i < traps.length; i++) {
        const t = traps[i];
        if (t.x < minC || t.x > maxC || t.y < minR || t.y > maxR) continue;
        const x = t.x * ts;
        const y = t.y * ts;
        const cx = x + ts * 0.5;
        const cy = y + ts * 0.5;

        const dx = t.x + 0.5 - player.x;
        const dy = t.y + 0.5 - player.y;
        const dist = Math.hypot(dx, dy);
        if (t.hidden && !t.revealed && player.flashlightOn && dist < flRange * 0.8 * revealMult) {
          const ang = Math.atan2(dy, dx);
          let diff = ang - player.angle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          if (Math.abs(diff) <= flSpread * 0.58) {
            t.revealed = true;
          }
        }

        if (t.disarmed) {
          ctx.strokeStyle = 'rgba(100, 116, 139, 0.35)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 12, y + 12, ts - 24, ts - 24);
          ctx.beginPath();
          ctx.moveTo(cx - 6, cy);
          ctx.lineTo(cx + 6, cy);
          ctx.stroke();
          continue;
        }

        if (t.type === TRAP_TYPE.HIDDEN_PIT) {
          if (t.triggered) {
            ctx.fillStyle = '#020305';
            ctx.beginPath();
            ctx.arc(cx, cy, ts * 0.36, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#7f1d1d';
            ctx.lineWidth = 2;
            ctx.stroke();
          } else if (t.revealed || dist < 1.55) {
            ctx.strokeStyle = t.revealed ? 'rgba(245, 158, 11, 0.62)' : 'rgba(148, 163, 184, 0.32)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(cx - 12, cy - 8);
            ctx.lineTo(cx - 2, cy + 2);
            ctx.lineTo(cx + 10, cy - 5);
            ctx.moveTo(cx - 2, cy + 2);
            ctx.lineTo(cx + 6, cy + 12);
            ctx.stroke();
          }
        } else if (t.type === TRAP_TYPE.SPIKE_TRAP) {
          ctx.fillStyle = '#181e29';
          ctx.fillRect(x + 9, y + 9, ts - 18, ts - 18);
          ctx.strokeStyle = t.spikesExtended ? '#ef4444' : '#475569';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 9, y + 9, ts - 18, ts - 18);

          const offsets = [-8, 8];
          for (const ox of offsets) {
            for (const oy of offsets) {
              if (t.spikesExtended) {
                ctx.fillStyle = '#e2e8f0';
                ctx.beginPath();
                ctx.moveTo(cx + ox, cy + oy - 7);
                ctx.lineTo(cx + ox - 4, cy + oy + 4);
                ctx.lineTo(cx + ox + 4, cy + oy + 4);
                ctx.closePath();
                ctx.fill();
              } else {
                ctx.fillStyle = '#090d14';
                ctx.beginPath();
                ctx.arc(cx + ox, cy + oy, 3, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          }
        } else if (t.type === TRAP_TYPE.PRESSURE_PLATE) {
          if (t.revealed || dist < 1.65) {
            ctx.fillStyle = t.flashTimer > 0 ? '#ef4444' : '#262e3d';
            ctx.fillRect(x + 11, y + 11, ts - 22, ts - 22);
            ctx.strokeStyle = t.revealed ? '#d97706' : 'rgba(217, 119, 6, 0.35)';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x + 11, y + 11, ts - 22, ts - 22);
          }
        } else if (t.type === TRAP_TYPE.COLLAPSING_FLOOR) {
          if (t.collapsed) {
            ctx.fillStyle = '#010204';
            ctx.fillRect(x + 3, y + 3, ts - 6, ts - 6);
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x + 4, y + 4, ts - 8, ts - 8);
          } else {
            const jitter = t.collapsing ? Math.sin(timeSec * 65) * 2.5 : 0;
            ctx.save();
            ctx.translate(jitter, 0);
            ctx.strokeStyle = t.collapsing ? '#f59e0b' : 'rgba(148, 163, 184, 0.45)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x + 8, y + 10);
            ctx.lineTo(cx, cy - 3);
            ctx.lineTo(x + ts - 9, y + 14);
            ctx.moveTo(x + 10, y + ts - 10);
            ctx.lineTo(cx, cy - 3);
            ctx.lineTo(x + ts - 11, y + ts - 9);
            ctx.stroke();
            ctx.restore();
          }
        }
      }
    }

    drawItems(ctx, maze, ts, timeSec) {
      const bob = Math.sin(timeSec * 3.4) * 3;
      for (let i = 0; i < maze.keys.length; i++) {
        const k = maze.keys[i];
        if (k.collected) continue;
        const cx = (k.x + 0.5) * ts;
        const cy = (k.y + 0.5) * ts + bob;

        const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 20);
        g.addColorStop(0, k.glow);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, 20, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = k.color;
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.arc(cx - 5, cy, 5, 0, Math.PI * 2);
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + 11, cy);
        ctx.lineTo(cx + 11, cy + 4);
        ctx.moveTo(cx + 7, cy);
        ctx.lineTo(cx + 7, cy + 4);
        ctx.stroke();
      }

      // Ancient Relics
      const relics = maze.relics || [];
      for (let i = 0; i < relics.length; i++) {
        const rel = relics[i];
        if (rel.collected) continue;
        const cx = (rel.x + 0.5) * ts;
        const cy = (rel.y + 0.5) * ts + bob;
        const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 18);
        g.addColorStop(0, 'rgba(168, 85, 247, 0.55)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, 18, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(timeSec * 1.4);
        ctx.fillStyle = '#c084fc';
        ctx.strokeStyle = '#f3e8ff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(7, 0);
        ctx.lineTo(0, 8);
        ctx.lineTo(-7, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      for (let i = 0; i < maze.pickups.length; i++) {
        const p = maze.pickups[i];
        if (p.collected) continue;
        const cx = (p.x + 0.5) * ts;
        const cy = (p.y + 0.5) * ts + bob * 0.7;

        if (p.type === 'battery') {
          ctx.fillStyle = '#0f172a';
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.8;
          ctx.fillRect(cx - 6, cy - 8, 12, 16);
          ctx.strokeRect(cx - 6, cy - 8, 12, 16);
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(cx - 3, cy - 11, 6, 3);
          ctx.fillRect(cx - 3, cy - 2, 6, 6);
        } else if (p.type === 'smoke') {
          ctx.fillStyle = '#1e293b';
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.roundRect ? ctx.roundRect(cx - 6, cy - 8, 12, 16, 4) : ctx.rect(cx - 6, cy - 8, 12, 16);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#94a3b8';
          ctx.fillRect(cx - 6, cy - 2, 12, 4);
          ctx.fillStyle = '#e2e8f0';
          ctx.fillRect(cx - 2.5, cy - 11, 5, 3);
        } else {
          ctx.fillStyle = '#1f2937';
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 1.8;
          ctx.fillRect(cx - 8, cy - 7, 16, 14);
          ctx.strokeRect(cx - 8, cy - 7, 16, 14);
          ctx.fillStyle = '#10b981';
          ctx.fillRect(cx - 2, cy - 4, 4, 8);
          ctx.fillRect(cx - 4, cy - 2, 8, 4);
        }
      }
    }

    drawPlayer(ctx, player, ts, timeSec, mpRingColor) {
      const skin = catalog ? catalog.getById(catalog.PLAYER_SKINS, player.skinId || 'explorer') : null;
      const fl = catalog ? catalog.getById(catalog.FLASHLIGHTS, player.flashlightId || 'standard') : null;
      const coatColor = skin ? skin.color : '#334155';
      const trimColor = skin ? skin.trim : '#94a3b8';
      const hoodColor = skin ? skin.hood : '#cbd5e1';
      const bulbColor = fl ? fl.bulbColor : '#fbbf24';

      const px = player.x * ts;
      const py = player.y * ts;
      const walkBob = player.isMoving
        ? Math.sin(timeSec * (player.isSprinting ? 16 : player.isCrouching ? 6 : 10)) *
          (player.isCrouching ? 0.9 : 1.8)
        : 0;

      ctx.save();
      ctx.translate(px, py + walkBob);

      if (mpRingColor) {
        ctx.strokeStyle = mpRingColor;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(0, 0, ts * 0.34, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (player.skillId === 'adrenaline_rush' && (player.skillActiveTimer || 0) > 0) {
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.78)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(0, 0, ts * 0.36 + Math.sin(timeSec * 14) * 2, 0, Math.PI * 2);
        ctx.stroke();
      }

      if ((player.cloakTimer || 0) > 0) {
        ctx.strokeStyle = 'rgba(192, 132, 252, 0.85)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(0, 0, ts * 0.34, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (player.isCrouching) {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.52)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(0, 0, ts * 0.28, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.scale(0.84, 0.84);
      }

      ctx.rotate(player.angle || 0);
      if (player.hidden || (player.cloakTimer || 0) > 0) ctx.globalAlpha = 0.42;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.beginPath();
      ctx.arc(0, 2, ts * 0.27, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle =
        player.hurtTimer > 0 && Math.floor(timeSec * 16) % 2 === 0 ? '#ef4444' : coatColor;
      ctx.beginPath();
      ctx.ellipse(0, 0, ts * 0.21, ts * 0.27, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = trimColor;
      ctx.lineWidth = 1.6;
      ctx.stroke();

      ctx.fillStyle = player.flashlightOn ? bulbColor : '#475569';
      ctx.fillRect(ts * 0.14, 4, 10, 4);

      ctx.fillStyle = hoodColor;
      ctx.beginPath();
      ctx.arc(2, 0, ts * 0.14, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    drawEnemy(ctx, enemy, ts, timeSec, eyesOnly) {
      const isBoss = Boolean(enemy.isBoss || enemy.typeId === 'abyssal_warden');
      const def = isBoss
        ? catalog && catalog.BOSS_DEF
        : catalog
        ? catalog.getById(catalog.ENEMY_TYPES, enemy.typeId || 'stalker')
        : null;
      const ex = enemy.x * ts;
      const ey = enemy.y * ts;
      const isChase = enemy.state === ENEMY_STATE.CHASE;
      const isStunned = (enemy.stunTimer || 0) > 0;
      const twitch = Math.sin(enemy.animPhase) * (isChase ? 3.8 : 1.6);
      const bodyCol = isChase ? (def ? def.chaseColor : '#2b090c') : (def ? def.bodyColor : '#14111d');
      const accentCol = isChase ? '#ef4444' : (def ? def.accentColor : '#4c1d95');
      const eyeCol = isStunned ? '#38bdf8' : def ? def.eyeColor : '#ef4444';

      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(enemy.angle);

      if (isBoss) {
        const sc = (def && def.scale) || 1.28;
        ctx.scale(sc, sc);
        if (!eyesOnly) {
          if ((enemy.surgeTimer || 0) > 0) {
            ctx.fillStyle = 'rgba(225, 29, 72, 0.25)';
            ctx.beginPath();
            ctx.arc(0, 0, ts * 0.44, 0, Math.PI * 2);
            ctx.fill();
          }
          // Heavy obsidian horns
          ctx.strokeStyle = '#78350f';
          ctx.lineWidth = 3.2;
          for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(2, side * 9);
            ctx.quadraticCurveTo(13, side * 19, 19, side * 11);
            ctx.stroke();
          }
          // Armored torso
          ctx.fillStyle = bodyCol;
          ctx.beginPath();
          ctx.ellipse(0, 0, ts * 0.27, ts * 0.31, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = accentCol;
          ctx.lineWidth = 2.2;
          ctx.stroke();

          // Magma chest core
          const corePulse = 0.7 + 0.3 * Math.sin(timeSec * 8);
          ctx.fillStyle = `rgba(251, 146, 60, ${corePulse})`;
          ctx.beginPath();
          ctx.arc(2, 0, ts * 0.1, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = eyeCol;
        ctx.beginPath();
        ctx.arc(9, -4.5, 2.7, 0, Math.PI * 2);
        ctx.arc(9, 4.5, 2.7, 0, Math.PI * 2);
        ctx.fill();
      } else if (def && def.archetype === 'spider') {
        const sc = def.scale || 1.0;
        ctx.scale(sc, sc);
        if (!eyesOnly) {
          // 8 articulated arachnid legs (4 per side)
          ctx.strokeStyle = isChase ? '#b91c1c' : '#27272a';
          ctx.lineWidth = 2.4;
          const legOffsets = [-6, -2, 2, 6];
          for (let i = 0; i < legOffsets.length; i++) {
            const ox = legOffsets[i];
            const wave = Math.sin(enemy.animPhase + i * 1.35) * (isChase ? 4.2 : 2.2);
            for (const side of [-1, 1]) {
              ctx.beginPath();
              ctx.moveTo(ox, side * 4);
              ctx.lineTo(ox + wave * 0.4, side * 14);
              ctx.lineTo(ox - 4 + wave, side * 21);
              ctx.stroke();
            }
          }
          // Abdomen + Cephalothorax
          ctx.fillStyle = bodyCol;
          ctx.beginPath();
          ctx.ellipse(-7, 0, ts * 0.18, ts * 0.15, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = accentCol;
          ctx.lineWidth = 1.4;
          ctx.stroke();

          ctx.fillStyle = bodyCol;
          ctx.beginPath();
          ctx.arc(6, 0, ts * 0.13, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        // Cluster of glowing arachnid eyes
        ctx.fillStyle = eyeCol;
        for (const eyOff of [-4, -1.5, 1.5, 4]) {
          ctx.beginPath();
          ctx.arc(10, eyOff, isChase ? 2.1 : 1.7, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (def && def.archetype === 'wraith') {
        if (!eyesOnly) {
          ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
          ctx.beginPath();
          ctx.arc(0, 0, ts * 0.36 + Math.sin(timeSec * 5) * 2, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = bodyCol;
          ctx.beginPath();
          ctx.moveTo(13, 0);
          ctx.quadraticCurveTo(0, -16, -16, -8 + twitch * 0.6);
          ctx.lineTo(-12, 0);
          ctx.lineTo(-16, 8 - twitch * 0.6);
          ctx.quadraticCurveTo(0, 16, 13, 0);
          ctx.fill();
          ctx.strokeStyle = accentCol;
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }
        ctx.fillStyle = eyeCol;
        ctx.beginPath();
        ctx.arc(6, -3.5, isChase ? 2.8 : 2.2, 0, Math.PI * 2);
        ctx.arc(6, 3.5, isChase ? 2.8 : 2.2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Bone-masked Stalker
        if (!eyesOnly) {
          ctx.strokeStyle = isChase ? '#7f1d1d' : '#1e1b2e';
          ctx.lineWidth = 3;
          for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(0, side * 7);
            ctx.quadraticCurveTo(10, side * (16 + twitch), 17, side * (10 - twitch * 0.5));
            ctx.stroke();
          }

          ctx.fillStyle = bodyCol;
          ctx.beginPath();
          ctx.ellipse(0, 0, ts * 0.25, ts * 0.29, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = accentCol;
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.fillStyle = '#d6d3d1';
          ctx.beginPath();
          ctx.ellipse(4, 0, ts * 0.13, ts * 0.15, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = isStunned ? '#38bdf8' : isChase ? '#ff2a2a' : eyeCol;
        ctx.beginPath();
        ctx.arc(8, -4, isChase ? 2.8 : 2.1, 0, Math.PI * 2);
        ctx.arc(8, 4, isChase ? 2.8 : 2.1, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      if (isStunned && !eyesOnly) {
        ctx.save();
        ctx.translate(ex, ey);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(0, 0, ts * 0.38, timeSec * 4, timeSec * 4 + Math.PI * 1.5);
        ctx.stroke();
        ctx.setLineDash([]);
        for (let s = 0; s < 3; s++) {
          const ang = timeSec * 5 + (s * Math.PI * 2) / 3;
          ctx.fillStyle = '#fde047';
          ctx.beginPath();
          ctx.arc(Math.cos(ang) * ts * 0.3, Math.sin(ang) * ts * 0.18 - ts * 0.34, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    renderLightingOverlay(world, offsetX, offsetY, ts) {
      const lctx = this.lightCtx;
      const s = this.lightScale;
      const lw = this.lightCanvas.width;
      const lh = this.lightCanvas.height;
      const { player, maze } = world;
      const px = (player.x * ts + offsetX) * s;
      const py = (player.y * ts + offsetY) * s;

      const rangeTiles = player.mods ? player.mods.lightRange : RENDER_CFG.FLASHLIGHT_RANGE;
      const spreadRad = player.mods ? player.mods.lightSpreadRad : RENDER_CFG.FLASHLIGHT_SPREAD_RAD;
      const flDef = catalog ? catalog.getById(catalog.FLASHLIGHTS, player.flashlightId || 'standard') : null;
      const beamWash = flDef ? flDef.beamColor : 'rgba(251, 191, 36, 0.16)';

      lctx.globalCompositeOperation = 'source-over';
      lctx.clearRect(0, 0, lw, lh);
      lctx.fillStyle = 'rgba(2, 4, 8, 0.992)';
      lctx.fillRect(0, 0, lw, lh);

      lctx.globalCompositeOperation = 'destination-out';
      const outageActive = (world.powerOutageTimer || 0) > 0;
      const baseAmb =
        !outageActive && player.flashlightOn
          ? RENDER_CFG.AMBIENT_RADIUS_ON
          : RENDER_CFG.AMBIENT_RADIUS_OFF;
      const visMult = player.mods ? player.mods.visionMult || 1 : 1;
      const visBonus = player.mods ? player.mods.ambientVisionBonus || 0 : 0;
      const ambRadiusTiles = (baseAmb * visMult + visBonus) * (outageActive ? 0.78 : 1);
      const ambPx = ambRadiusTiles * ts * s;

      lctx.save();
      lctx.beginPath();
      const ambRays = RENDER_CFG.RAY_COUNT_AMBIENT;
      for (let i = 0; i <= ambRays; i++) {
        const a = (i / ambRays) * Math.PI * 2;
        const hit = castRay(maze.grid, player.x, player.y, a, ambRadiusTiles, maze.doorsByCoord);
        const hx = (hit.x * ts + offsetX) * s;
        const hy = (hit.y * ts + offsetY) * s;
        if (i === 0) lctx.moveTo(hx, hy);
        else lctx.lineTo(hx, hy);
      }
      lctx.closePath();

      const ambGrad = lctx.createRadialGradient(px, py, ts * 0.3 * s, px, py, ambPx);
      ambGrad.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
      ambGrad.addColorStop(0.58, 'rgba(255, 255, 255, 0.68)');
      ambGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      lctx.fillStyle = ambGrad;
      lctx.fill();
      lctx.restore();

      let conePolygon = null;
      if (!outageActive && player.flashlightOn && player.battery > 0) {
        const rangePx = rangeTiles * ts * s;
        const halfSpread = spreadRad * 0.5;
        const coneRays = RENDER_CFG.RAY_COUNT_CONE;

        const flicker =
          (player.battery < 18 || (world.surgeTimer && world.surgeTimer > 0)) &&
          Math.sin(performance.now() * 0.05) > 0.45
            ? 0.38
            : 1.0;

        conePolygon = [];
        lctx.save();
        lctx.beginPath();
        lctx.moveTo(px, py);
        for (let i = 0; i <= coneRays; i++) {
          const a = player.angle - halfSpread + (i / coneRays) * spreadRad;
          const hit = castRay(maze.grid, player.x, player.y, a, rangeTiles, maze.doorsByCoord);
          if (i % 4 === 0) {
            const mx = Math.floor(hit.x);
            const my = Math.floor(hit.y);
            if (world.explored[my] && world.explored[my][mx] !== undefined) {
              world.explored[my][mx] = 1;
            }
          }
          const hx = hit.x * ts + offsetX;
          const hy = hit.y * ts + offsetY;
          conePolygon.push({ x: hx, y: hy });
          lctx.lineTo(hx * s, hy * s);
        }
        lctx.closePath();

        const coneGrad = lctx.createRadialGradient(px, py, ts * 0.4 * s, px, py, rangePx);
        coneGrad.addColorStop(0, `rgba(255, 255, 255, ${1.0 * flicker})`);
        coneGrad.addColorStop(0.65, `rgba(255, 255, 255, ${0.84 * flicker})`);
        coneGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        lctx.fillStyle = coneGrad;
        lctx.fill();
        lctx.restore();
      }

      this.ctx.drawImage(this.lightCanvas, 0, 0, this.width, this.height);

      if (outageActive) {
        const alarm = 0.08 + 0.09 * Math.max(0, Math.sin(performance.now() * 0.008));
        this.ctx.fillStyle = `rgba(153, 27, 27, ${alarm})`;
        this.ctx.fillRect(0, 0, this.width, this.height);
      }

      if (conePolygon && conePolygon.length > 0) {
        const wpx = player.x * ts + offsetX;
        const wpy = player.y * ts + offsetY;
        const warmGrad = this.ctx.createRadialGradient(wpx, wpy, ts * 0.25, wpx, wpy, rangeTiles * ts);
        warmGrad.addColorStop(0, beamWash);
        warmGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.moveTo(wpx, wpy);
        for (let i = 0; i < conePolygon.length; i++) {
          this.ctx.lineTo(conePolygon[i].x, conePolygon[i].y);
        }
        this.ctx.closePath();
        this.ctx.fillStyle = warmGrad;
        this.ctx.fill();
        this.ctx.restore();
      }
    }

    renderThreatVignettes(ctx, world, distToEnemy, timeSec, anyChase) {
      const { enemy, player } = world;
      const isChase = Boolean(anyChase || (enemy && enemy.state === ENEMY_STATE.CHASE));
      const dangerDist = 8.0;
      const proximity = Math.max(0, Math.min(1, 1 - distToEnemy / dangerDist));

      if (proximity > 0.05 || isChase || player.hp <= player.maxHp * 0.35) {
        const pulse = 0.5 + 0.5 * Math.sin(timeSec * (isChase ? 9.5 : 4.5));
        const lowHpBoost = player.hp <= player.maxHp * 0.35 ? 0.25 : 0;
        const alpha =
          Math.min(0.62, proximity * 0.42 + (isChase ? 0.16 : 0) + lowHpBoost) *
          (0.65 + pulse * 0.35);

        const vig = ctx.createRadialGradient(
          this.width * 0.5,
          this.height * 0.5,
          Math.min(this.width, this.height) * 0.28,
          this.width * 0.5,
          this.height * 0.5,
          Math.max(this.width, this.height) * 0.7
        );
        vig.addColorStop(0, 'rgba(185, 28, 28, 0)');
        vig.addColorStop(1, `rgba(153, 27, 27, ${alpha})`);
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, this.width, this.height);
      }

      if (this.hitFlash > 0) {
        ctx.fillStyle = `rgba(220, 38, 38, ${this.hitFlash * 0.45})`;
        ctx.fillRect(0, 0, this.width, this.height);
      }

      if (this.jumpscareFlash > 0) {
        ctx.fillStyle = `rgba(127, 29, 29, ${this.jumpscareFlash * 0.55})`;
        ctx.fillRect(0, 0, this.width, this.height);
      }
    }

    renderMinimap(ctx, world, explored) {
      const { maze, player, enemy, enemies, remotePlayers = [] } = world;
      const fullScan = (world.fullMapRevealTimer || 0) > 0;
      if (this.width < 680 && !fullScan) return;

      const maxBox = fullScan ? 196 : 148;
      const cellPx = Math.max(3, Math.min(fullScan ? 7 : 6, Math.floor(maxBox / Math.max(maze.cols, maze.rows))));
      const mapW = maze.cols * cellPx;
      const mapH = maze.rows * cellPx;
      const pad = 16;
      const x0 = pad;
      const y0 = this.height - mapH - pad;

      ctx.save();
      ctx.fillStyle = fullScan ? 'rgba(6, 15, 28, 0.92)' : 'rgba(7, 10, 16, 0.84)';
      ctx.strokeStyle = fullScan ? 'rgba(56, 189, 248, 0.82)' : 'rgba(148, 163, 184, 0.22)';
      ctx.lineWidth = fullScan ? 2 : 1;
      ctx.fillRect(x0 - 6, y0 - 6, mapW + 12, mapH + 12);
      ctx.strokeRect(x0 - 6, y0 - 6, mapW + 12, mapH + 12);

      for (let r = 0; r < maze.rows; r++) {
        for (let c = 0; c < maze.cols; c++) {
          if (
            !fullScan &&
            !explored[r][c] &&
            !(maze.isMultiplayer && c === maze.exit.x && r === maze.exit.y)
          ) {
            continue;
          }
          const t = maze.grid[r][c];
          if (t === TILE.WALL) {
            ctx.fillStyle = fullScan ? '#475569' : '#334155';
          } else if (t === TILE.EXIT) {
            ctx.fillStyle = '#10b981';
          } else if (t === TILE.DOOR) {
            const d = maze.doorsByCoord.get(c + ',' + r);
            ctx.fillStyle = d && !d.unlocked ? d.color : '#1e293b';
          } else if (t === TILE.ALCOVE) {
            ctx.fillStyle = '#475569';
          } else {
            ctx.fillStyle = '#0f172a';
          }
          ctx.fillRect(x0 + c * cellPx, y0 + r * cellPx, cellPx, cellPx);
        }
      }

      for (const k of maze.keys) {
        if (!k.collected && (fullScan || (explored[k.y] && explored[k.y][k.x]))) {
          ctx.fillStyle = k.color;
          ctx.fillRect(
            x0 + k.x * cellPx + 0.5,
            y0 + k.y * cellPx + 0.5,
            Math.max(2.5, cellPx - 1),
            Math.max(2.5, cellPx - 1)
          );
        }
      }

      if (fullScan) {
        const activeEnemies = Array.isArray(enemies) && enemies.length > 0 ? enemies : enemy ? [enemy] : [];
        for (const en of activeEnemies) {
          ctx.fillStyle = en.isBoss ? '#fbbf24' : '#ef4444';
          ctx.beginPath();
          ctx.arc(
            x0 + en.x * cellPx,
            y0 + en.y * cellPx,
            Math.max(2.8, cellPx * (en.isBoss ? 0.56 : 0.45)),
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
      }

      for (const rp of remotePlayers) {
        if (!rp.alive) continue;
        ctx.fillStyle = MP_CONFIG.PLAYER_COLORS[rp.slotIndex % MP_CONFIG.PLAYER_COLORS.length];
        ctx.beginPath();
        ctx.arc(x0 + rp.x * cellPx, y0 + rp.y * cellPx, Math.max(2, cellPx * 0.36), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.arc(
        x0 + player.x * cellPx,
        y0 + player.y * cellPx,
        Math.max(2.2, cellPx * 0.42),
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.restore();
    }
  }

  /**
   * Renders an authentic, real-time Canvas2D preview of any Shop item
   * (Skins, Flashlights, Gear, Map Themes, or Creatures/Spiders).
   */
  function renderShopPreview(canvas, category, item, timeSec) {
    if (!canvas || !item) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width || 132;
    const h = canvas.height || 96;
    const t = timeSec || 0;

    ctx.clearRect(0, 0, w, h);

    // Subterranean dark backdrop
    const bg = ctx.createRadialGradient(w * 0.5, h * 0.5, 4, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
    bg.addColorStop(0, '#141c2b');
    bg.addColorStop(1, '#06090f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Subtle tile grid lines
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
    ctx.lineWidth = 1;
    const step = Math.max(16, Math.round(Math.min(w, h) / 3));
    for (let x = step; x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = step; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const cx = w * 0.5;
    const cy = h * 0.5;
    const scale = Math.min(w, h) / 56;

    if (category === 'skins') {
      const coat = item.color || '#334155';
      const trim = item.trim || '#94a3b8';
      const hood = item.hood || '#cbd5e1';
      const aim = Math.sin(t * 1.4) * 0.25 - 0.15;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.rotate(aim);

      // Soft warm torch cone
      const beam = ctx.createRadialGradient(12, 5, 2, 12, 5, 34);
      beam.addColorStop(0, 'rgba(251, 191, 36, 0.36)');
      beam.addColorStop(1, 'rgba(251, 191, 36, 0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(10, 5);
      ctx.arc(10, 5, 34, -0.45, 0.45);
      ctx.closePath();
      ctx.fill();

      // Drop shadow
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.arc(0, 2.5, 15.5, 0, Math.PI * 2);
      ctx.fill();

      // Shoulder pads & coat
      ctx.fillStyle = coat;
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 15.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = trim;
      ctx.lineWidth = 2.2;
      ctx.stroke();

      // Specialty details per skin
      if (item.id === 'warden') {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(0, -10, 5, Math.PI * 0.8, Math.PI * 2.2);
        ctx.arc(0, 10, 5, -Math.PI * 0.2, Math.PI * 1.2);
        ctx.stroke();
      } else if (item.id === 'phantom') {
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(-2, 0, 16.5, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Held flashlight
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(8, 3.5, 9, 4);

      // Hood / Head
      ctx.fillStyle = hood;
      ctx.beginPath();
      ctx.arc(2, 0, 8.2, 0, Math.PI * 2);
      ctx.fill();

      // Plague mask beak or visor glint
      if (item.id === 'doctor') {
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.moveTo(7, -3);
        ctx.lineTo(15, 0);
        ctx.lineTo(7, 3);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.arc(6, -2.5, 1.5, 0, Math.PI * 2);
        ctx.arc(6, 2.5, 1.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = trim;
        ctx.beginPath();
        ctx.arc(5, -2.5, 1.4, 0, Math.PI * 2);
        ctx.arc(5, 2.5, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return;
    }

    if (category === 'flashlights') {
      const bulb = item.bulbColor || '#fbbf24';
      const beamColor = item.beamColor || 'rgba(251, 191, 36, 0.2)';
      const spreadDeg = item.mods ? item.mods.spreadDeg : 58;
      const range = item.mods ? item.mods.range : 8.8;
      const halfAngle = Math.min(0.92, ((spreadDeg * Math.PI) / 180) * 0.45);
      const beamLen = Math.min(w * 0.78, range * scale * 3.6);
      const sway = Math.sin(t * 1.8) * 0.08;

      ctx.save();
      ctx.translate(w * 0.24, cy);
      ctx.scale(scale, scale);
      ctx.rotate(sway);

      // Volumetric beam cone
      const coneGrad = ctx.createRadialGradient(6, 0, 2, 6, 0, beamLen / scale);
      coneGrad.addColorStop(0, bulb);
      coneGrad.addColorStop(0.25, beamColor.replace(/[\d.]+\)$/, '0.45)'));
      coneGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = coneGrad;
      ctx.beginPath();
      ctx.moveTo(4, 0);
      ctx.arc(4, 0, beamLen / scale, -halfAngle, halfAngle);
      ctx.closePath();
      ctx.fill();

      // Faint revealed trap inside UV / beam cone
      ctx.strokeStyle = item.id === 'uv_relic' ? 'rgba(192, 132, 252, 0.85)' : 'rgba(248, 250, 252, 0.3)';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(20, -6, 12, 12);

      // Flashlight / Lantern housing
      if (item.id === 'lantern') {
        ctx.fillStyle = '#78350f';
        ctx.strokeStyle = '#fb923c';
        ctx.lineWidth = 1.6;
        ctx.fillRect(-10, -8, 16, 16);
        ctx.strokeRect(-10, -8, 16, 16);
        ctx.fillStyle = bulb;
        ctx.beginPath();
        ctx.arc(-2, 0, 4.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1.4;
        ctx.fillRect(-13, -4.5, 15, 9);
        ctx.strokeRect(-13, -4.5, 15, 9);
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.moveTo(2, -5.5);
        ctx.lineTo(8, -8);
        ctx.lineTo(8, 8);
        ctx.lineTo(2, 5.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = bulb;
        ctx.fillRect(6, -6, 3, 12);
      }
      ctx.restore();
      return;
    }

    if (category === 'gear') {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);

      if (item.id === 'keen_senses') {
        const wave = (t * 0.9) % 1;
        ctx.strokeStyle = `rgba(56, 189, 248, ${(1 - wave) * 0.7})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(0, 0, 12 + wave * 11, -0.9, 0.9);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
        ctx.beginPath();
        ctx.arc(0, 0, 15, Math.PI - 0.9, Math.PI + 0.9);
        ctx.stroke();

        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (item.id === 'padded_boots') {
        // Sound-damping ripples
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(0, 6, 19, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        // Pair of dark muffled boots
        for (const ox of [-7, 7]) {
          ctx.fillStyle = '#1e293b';
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.roundRect ? ctx.roundRect(ox - 5, -12, 9, 18, 3) : ctx.rect(ox - 5, -12, 9, 18);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#0ea5e9';
          ctx.fillRect(ox - 5, 4, 11, 4);
        }
      } else if (item.id === 'battery_belt') {
        ctx.fillStyle = '#334155';
        ctx.fillRect(-18, -5, 36, 10);
        for (const ox of [-11, 0, 11]) {
          ctx.fillStyle = '#0f172a';
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.6;
          ctx.fillRect(ox - 4, -9, 8, 18);
          ctx.strokeRect(ox - 4, -9, 8, 18);
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(ox - 2.5, -2, 5, 8);
        }
      } else if (item.id === 'disarm_kit') {
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        // Crossed sapper pliers & wrench
        ctx.beginPath();
        ctx.moveTo(-12, 12);
        ctx.lineTo(10, -10);
        ctx.stroke();
        ctx.strokeStyle = '#cbd5e1';
        ctx.beginPath();
        ctx.moveTo(-10, -10);
        ctx.lineTo(12, 12);
        ctx.stroke();
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (item.id === 'adrenaline_vial') {
        ctx.rotate(-0.4);
        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 1.8;
        ctx.fillRect(-10, -5, 20, 10);
        ctx.strokeRect(-10, -5, 20, 10);
        ctx.fillStyle = '#10b981';
        ctx.fillRect(-7, -3.5, 13, 7);
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(20, 0);
        ctx.moveTo(-16, 0);
        ctx.lineTo(-10, 0);
        ctx.moveTo(-16, -4);
        ctx.lineTo(-16, 4);
        ctx.stroke();
      } else {
        // Basic field pouch
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1.8;
        ctx.fillRect(-12, -10, 24, 20);
        ctx.strokeRect(-12, -10, 24, 20);
        ctx.beginPath();
        ctx.moveTo(-12, -2);
        ctx.lineTo(0, 4);
        ctx.lineTo(12, -2);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    if (category === 'maps') {
      const pal = item.palette || PALETTE;
      const cell = Math.min(w, h) * 0.42;
      const ox = (w - cell * 2) * 0.5;
      const oy = (h - cell * 2) * 0.5;

      // 2x2 mini-dungeon diorama
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 2; c++) {
          const x = ox + c * cell;
          const y = oy + r * cell;
          if (r === 0 && c === 0) {
            ctx.fillStyle = pal.wallTop;
            ctx.fillRect(x, y, cell, cell);
            ctx.fillStyle = pal.wallFace;
            ctx.fillRect(x + 2, y + cell - 6, cell - 4, 6);
            if (pal.decor === 'grating') {
              ctx.fillStyle = '#eab308';
              ctx.fillRect(x + 2, y + cell - 5, cell - 4, 4);
            } else if (pal.decor === 'stone') {
              ctx.strokeStyle = 'rgba(15, 23, 42, 0.5)';
              ctx.beginPath();
              ctx.moveTo(x, y + cell * 0.5);
              ctx.lineTo(x + cell, y + cell * 0.5);
              ctx.stroke();
            } else if (pal.decor === 'embers') {
              ctx.strokeStyle = 'rgba(249, 115, 22, 0.7)';
              ctx.beginPath();
              ctx.moveTo(x + 4, y + 4);
              ctx.lineTo(x + cell - 4, y + cell - 8);
              ctx.stroke();
            }
            ctx.strokeStyle = pal.wallEdge;
            ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
          } else {
            ctx.fillStyle = (r + c) % 2 === 0 ? pal.floorA : pal.floorB;
            ctx.fillRect(x, y, cell, cell);
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.strokeRect(x, y, cell, cell);
          }
        }
      }
      // Signature map decor
      if (pal.decor === 'puddles') {
        ctx.fillStyle = 'rgba(16, 185, 129, 0.42)';
        ctx.beginPath();
        ctx.ellipse(ox + cell * 1.45, oy + cell * 1.5, cell * 0.34, cell * 0.2, 0.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (pal.decor === 'embers') {
        ctx.fillStyle = 'rgba(249, 115, 22, 0.9)';
        ctx.beginPath();
        ctx.arc(ox + cell * 1.4, oy + cell * 0.55, 2.5, 0, Math.PI * 2);
        ctx.arc(ox + cell * 0.6, oy + cell * 1.5, 2.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (pal.decor === 'webs') {
        ctx.strokeStyle = 'rgba(226, 232, 240, 0.55)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(ox + cell, oy);
        ctx.lineTo(ox + cell * 1.7, oy + cell * 0.5);
        ctx.moveTo(ox + cell, oy + cell * 0.5);
        ctx.lineTo(ox + cell * 1.6, oy);
        ctx.stroke();
      } else if (pal.decor === 'grating') {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ox + cell + 3, oy + cell * 1.5);
        ctx.lineTo(ox + cell * 2 - 3, oy + cell * 1.5);
        ctx.stroke();
      } else if (pal.decor === 'stone') {
        ctx.fillStyle = 'rgba(245, 158, 11, 0.85)';
        ctx.beginPath();
        ctx.arc(ox + cell * 0.5, oy + cell * 0.72, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      // Glowing accent gem on floor
      ctx.fillStyle = pal.accent || '#d97706';
      ctx.beginPath();
      ctx.arc(ox + cell * 1.5, oy + cell * 1.5, 4, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    if (category === 'enemies') {
      const ts = 48;
      const bodyCol = item.bodyColor || '#14111d';
      const accentCol = item.accentColor || '#4c1d95';
      const eyeCol = item.eyeColor || '#ef4444';
      const anim = t * 5.2;
      const twitch = Math.sin(anim) * 1.8;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale * 1.05, scale * 1.05);
      ctx.rotate(-0.22 + Math.sin(t * 1.1) * 0.14);

      if (item.archetype === 'spider') {
        const sc = item.scale || 1.0;
        ctx.scale(sc, sc);
        if (item.mods && item.mods.dropsWeb) {
          ctx.strokeStyle = 'rgba(226, 232, 240, 0.25)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(-8, 0, 18, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.strokeStyle = item.id === 'widow_weaver' ? '#dc2626' : '#52525b';
        ctx.lineWidth = 2.4;
        const legOffsets = [-6, -2, 2, 6];
        for (let i = 0; i < legOffsets.length; i++) {
          const ox = legOffsets[i];
          const wave = Math.sin(anim + i * 1.35) * 2.5;
          for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(ox, side * 4);
            ctx.lineTo(ox + wave * 0.4, side * 14);
            ctx.lineTo(ox - 4 + wave, side * 20);
            ctx.stroke();
          }
        }
        ctx.fillStyle = bodyCol;
        ctx.beginPath();
        ctx.ellipse(-7, 0, ts * 0.18, ts * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = accentCol;
        ctx.lineWidth = 1.6;
        ctx.stroke();

        ctx.fillStyle = bodyCol;
        ctx.beginPath();
        ctx.arc(6, 0, ts * 0.13, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = eyeCol;
        for (const eyOff of [-4, -1.5, 1.5, 4]) {
          ctx.beginPath();
          ctx.arc(10, eyOff, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (item.archetype === 'wraith') {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
        ctx.beginPath();
        ctx.arc(0, 0, 21 + Math.sin(t * 4) * 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = bodyCol;
        ctx.beginPath();
        ctx.moveTo(14, 0);
        ctx.quadraticCurveTo(0, -16, -16, -8 + twitch * 0.6);
        ctx.lineTo(-12, 0);
        ctx.lineTo(-16, 8 - twitch * 0.6);
        ctx.quadraticCurveTo(0, 16, 14, 0);
        ctx.fill();
        ctx.strokeStyle = accentCol;
        ctx.lineWidth = 1.8;
        ctx.stroke();

        ctx.fillStyle = eyeCol;
        ctx.beginPath();
        ctx.arc(6, -3.5, 2.4, 0, Math.PI * 2);
        ctx.arc(6, 3.5, 2.4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = '#312e81';
        ctx.lineWidth = 2.8;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(0, side * 7);
          ctx.quadraticCurveTo(10, side * (16 + twitch), 17, side * (10 - twitch * 0.5));
          ctx.stroke();
        }
        ctx.fillStyle = bodyCol;
        ctx.beginPath();
        ctx.ellipse(0, 0, ts * 0.25, ts * 0.29, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = accentCol;
        ctx.lineWidth = 1.6;
        ctx.stroke();

        ctx.fillStyle = '#d6d3d1';
        ctx.beginPath();
        ctx.ellipse(4, 0, ts * 0.13, ts * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = eyeCol;
        ctx.beginPath();
        ctx.arc(8, -4, 2.4, 0, Math.PI * 2);
        ctx.arc(8, 4, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  return { MazeRenderer, renderShopPreview };
});
