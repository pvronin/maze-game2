/**
 * audio.js
 * Zero-dependency Web Audio API procedural SFX & adaptive dual-mode music engine:
 *  - Distinct Main Menu atmospheric music vs Gameplay tension & chase music
 *  - Independent SFX and Music volume sliders + mute toggles
 *  - Procedural footsteps, spider chitter, web snare, relic chime, traps, and victory/defeat stingers
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HorrorMaze = root.HorrorMaze || {};
    Object.assign(root.HorrorMaze, factory());
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.sfxEnabled = true;
      this.musicEnabled = true;
      this.sfxVolume = 0.65;
      this.musicVolume = 0.55;
      this.musicMode = 'menu'; // 'menu' | 'gameplay'
      this.isChaseMusic = false;
      this.tension = 0;

      this.noiseBuffer = null;
      this.droneNodes = null;
      this.menuTimer = null;
      this.currentStepMs = 600;
      this.menuNoteIdx = 0;
      this.sfxGain = null;
      this.musicGain = null;
      this.musicCompressor = null;
    }

    init() {
      if (this.ctx) return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      try {
        this.ctx = new AudioCtx();
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = this.sfxEnabled ? this.sfxVolume : 0;
        this.sfxGain.connect(this.ctx.destination);

        this.musicCompressor = this.ctx.createDynamicsCompressor();
        this.musicCompressor.threshold.value = -16;
        this.musicCompressor.knee.value = 12;
        this.musicCompressor.ratio.value = 6;
        this.musicCompressor.attack.value = 0.005;
        this.musicCompressor.release.value = 0.18;

        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = this.musicEnabled ? this.musicVolume * 1.35 : 0;
        this.musicCompressor.connect(this.musicGain);
        this.musicGain.connect(this.ctx.destination);

        const sampleRate = this.ctx.sampleRate;
        const length = sampleRate;
        this.noiseBuffer = this.ctx.createBuffer(1, length, sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
          data[i] = Math.random() * 2 - 1;
        }
      } catch (_err) {
        this.ctx = null;
      }
    }

    unlock() {
      if (!this.ctx) this.init();
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      if (this.musicEnabled && !this.droneNodes) {
        this.startAmbience();
      }
    }

    setSfxEnabled(enabled) {
      this.sfxEnabled = Boolean(enabled);
      this.applyMix();
    }

    setMusicEnabled(enabled) {
      this.musicEnabled = Boolean(enabled);
      if (this.musicEnabled && this.ctx && !this.droneNodes) {
        this.startAmbience();
      }
      this.applyMix();
    }

    setSfxVolume(vol) {
      this.sfxVolume = Math.max(0, Math.min(1, Number(vol)));
      this.applyMix();
    }

    setMusicVolume(vol) {
      this.musicVolume = Math.max(0, Math.min(1, Number(vol)));
      this.applyMix();
    }

    setMusicMode(mode) {
      const next = mode === 'gameplay' ? 'gameplay' : 'menu';
      if (this.musicMode === next) return;
      this.musicMode = next;
      if (next === 'menu') {
        this.isChaseMusic = false;
      }
      this.stepIndex = 0;
      this.syncMusicTempo();
      this.applyMix();
    }

    setChaseState(chasing) {
      const next = Boolean(chasing) && this.musicMode === 'gameplay';
      if (this.isChaseMusic === next) return;
      this.isChaseMusic = next;
      this.syncMusicTempo();
      this.applyMix();
    }

    syncMusicTempo() {
      if (!this.droneNodes || !this._tickMusicFn) return;
      const desiredMs =
        this.musicMode === 'gameplay' && this.isChaseMusic
          ? 220
          : this.musicMode === 'gameplay'
          ? 560
          : 610;
      if (desiredMs !== this.currentStepMs) {
        this.currentStepMs = desiredMs;
        if (this.menuTimer) clearInterval(this.menuTimer);
        this.menuTimer = setInterval(this._tickMusicFn, desiredMs);
      }
    }

    applyMix() {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      if (this.sfxGain) {
        this.sfxGain.gain.setTargetAtTime(this.sfxEnabled ? this.sfxVolume : 0, now, 0.04);
      }
      if (this.musicGain) {
        const chaseBoost = this.isChaseMusic ? 0.32 : 0;
        const modeScale =
          this.musicMode === 'gameplay' ? 1.32 + this.tension * 0.25 + chaseBoost : 1.38;
        const target = this.musicEnabled ? this.musicVolume * modeScale : 0;
        this.musicGain.gain.setTargetAtTime(target, now, 0.12);
      }
    }

    ensureMusicBus() {
      if (this.musicBus || !this.ctx || !this.musicCompressor) return;
      const masterFilter = this.ctx.createBiquadFilter();
      masterFilter.type = 'lowpass';
      masterFilter.frequency.value = 3400;
      masterFilter.connect(this.musicCompressor);

      // Lush atmospheric echo/reverb network
      const delayA = this.ctx.createDelay(1.0);
      const delayB = this.ctx.createDelay(1.0);
      delayA.delayTime.value = 0.34;
      delayB.delayTime.value = 0.51;

      const fbFilter = this.ctx.createBiquadFilter();
      fbFilter.type = 'lowpass';
      fbFilter.frequency.value = 1400;

      const fbGain = this.ctx.createGain();
      fbGain.gain.value = 0.32;

      const wetGain = this.ctx.createGain();
      wetGain.gain.value = 0.34;

      delayA.connect(fbFilter);
      fbFilter.connect(delayB);
      delayB.connect(fbGain);
      fbGain.connect(delayA);

      delayA.connect(wetGain);
      delayB.connect(wetGain);
      wetGain.connect(masterFilter);

      this.musicBus = masterFilter;
      this.musicWet = delayA;
    }

    playPadChord(freqs, durationSec, peakGain) {
      if (!this.ctx || !this.musicBus || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;
      const chordFilter = this.ctx.createBiquadFilter();
      chordFilter.type = 'lowpass';
      chordFilter.frequency.setValueAtTime(340, now);
      chordFilter.frequency.linearRampToValueAtTime(760, now + durationSec * 0.45);
      chordFilter.frequency.linearRampToValueAtTime(310, now + durationSec);

      const chordGain = this.ctx.createGain();
      chordGain.gain.setValueAtTime(0.0001, now);
      chordGain.gain.linearRampToValueAtTime(peakGain, now + 0.65);
      chordGain.gain.setValueAtTime(peakGain * 0.85, now + durationSec * 0.55);
      chordGain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

      chordFilter.connect(chordGain);
      chordGain.connect(this.musicBus);
      if (this.musicWet) chordGain.connect(this.musicWet);

      for (let i = 0; i < freqs.length; i++) {
        const osc = this.ctx.createOscillator();
        osc.type = i === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freqs[i], now);
        osc.detune.setValueAtTime((i % 2 === 0 ? -1 : 1) * 6, now);
        osc.connect(chordFilter);
        osc.start(now);
        osc.stop(now + durationSec + 0.08);
      }
    }

    playPluckNote(freq, durationSec, peakGain, waveType, cutoffMult) {
      if (!this.ctx || !this.musicBus || this.ctx.state !== 'running' || !freq) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = waveType || 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.min(3600, freq * (cutoffMult || 4.8)), now);
      filter.frequency.exponentialRampToValueAtTime(Math.max(240, freq * 1.4), now + durationSec);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(peakGain, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicBus);
      if (this.musicWet) gain.connect(this.musicWet);

      osc.start(now);
      osc.stop(now + durationSec + 0.05);
    }

    playPercTick(isAccent) {
      if (!this.ctx || !this.musicBus || !this.noiseBuffer || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = isAccent ? 'bandpass' : 'highpass';
      filter.frequency.setValueAtTime(isAccent ? 1400 : 3800, now);
      filter.Q.value = isAccent ? 1.4 : 0.8;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(isAccent ? 0.16 : 0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (isAccent ? 0.1 : 0.045));

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicBus);
      src.start(now, Math.random() * 0.25, 0.11);
    }

    startAmbience() {
      if (!this.ctx || !this.musicGain || this.droneNodes) return;
      try {
        this.ensureMusicBus();
        this.droneNodes = { active: true };
        this.stepIndex = 0;

        // Expressive harmonic progressions
        const menuChords = [
          [73.42, 146.83, 220.0, 261.63, 329.63], // Dm9
          [58.27, 174.61, 220.0, 293.66, 349.23], // Bbmaj7
          [98.0, 146.83, 174.61, 233.08, 293.66], // Gm7
          [55.0, 164.81, 220.0, 293.66, 329.63],  // Asus4 -> A
        ];
        const menuArp = [
          293.66, 329.63, 349.23, 440.0, 329.63, 0, 261.63, 293.66,
          233.08, 293.66, 349.23, 440.0, 349.23, 0, 293.66, 220.0,
          196.0, 233.08, 293.66, 349.23, 293.66, 0, 233.08, 196.0,
          220.0, 277.18, 329.63, 440.0, 329.63, 293.66, 261.63, 0,
        ];

        const gameChords = [
          [55.0, 164.81, 220.0, 246.94, 261.63],  // Am9
          [87.31, 174.61, 220.0, 261.63, 329.63], // Fmaj7
          [73.42, 146.83, 174.61, 220.0, 329.63], // Dm9
          [82.41, 164.81, 196.0, 246.94, 293.66], // Em7
        ];
        const gameArpExplore = [
          220.0, 0, 261.63, 329.63, 0, 246.94, 220.0, 0,
          174.61, 0, 220.0, 261.63, 329.63, 0, 261.63, 0,
          146.83, 0, 220.0, 261.63, 0, 293.66, 220.0, 0,
          164.81, 0, 196.0, 246.94, 293.66, 0, 246.94, 196.0,
        ];
        const gameArpTense = [
          220.0, 329.63, 261.63, 329.63, 246.94, 329.63, 220.0, 261.63,
          174.61, 261.63, 220.0, 261.63, 329.63, 261.63, 220.0, 246.94,
          146.83, 220.0, 261.63, 293.66, 329.63, 293.66, 261.63, 220.0,
          164.81, 246.94, 293.66, 329.63, 246.94, 220.0, 196.0, 164.81,
        ];

        // Urgent high-energy horror chase pattern (Am / Bb Phrygian tension)
        const chaseBass = [
          110.0, 110.0, 220.0, 110.0, 116.54, 110.0, 164.81, 110.0,
          110.0, 110.0, 220.0, 110.0, 130.81, 116.54, 110.0, 98.0,
        ];
        const chaseLead = [
          440.0, 0, 466.16, 440.0, 659.25, 0, 466.16, 440.0,
          523.25, 0, 466.16, 440.0, 392.0, 440.0, 466.16, 0,
        ];

        const tickMusic = () => {
          if (!this.ctx || !this.musicEnabled || this.musicVolume <= 0.01) return;
          if (this.ctx.state !== 'running') return;

          if (this.musicMode === 'gameplay' && this.isChaseMusic) {
            const cStep = this.stepIndex % 16;
            const bass = chaseBass[cStep];
            const lead = chaseLead[cStep];
            this.playPluckNote(bass, 0.2, 0.2, 'sawtooth', 3.4);
            if (cStep % 4 === 0) {
              this.playPluckNote(bass * 0.5, 0.26, 0.16, 'sine', 2.2);
            }
            if (lead > 0) {
              this.playPluckNote(lead, 0.24, 0.14, 'square', 3.8);
            }
            this.playPercTick(cStep % 4 === 2);
            this.stepIndex = (this.stepIndex + 1) % 32;
            return;
          }

          const step = this.stepIndex % 32;
          const chordIdx = Math.floor(step / 8);

          if (this.musicMode === 'menu') {
            if (step % 8 === 0) {
              this.playPadChord(menuChords[chordIdx], 5.4, 0.15);
            }
            const note = menuArp[step];
            if (note > 0) {
              this.playPluckNote(note, 1.5, 0.16, 'sine');
              if (step % 4 === 0) {
                this.playPluckNote(note * 0.5, 1.8, 0.1, 'triangle');
              }
            }
          } else {
            if (step % 8 === 0) {
              this.playPadChord(gameChords[chordIdx], 4.6, 0.14);
            }
            const tense = this.tension > 0.38;
            const arp = tense ? gameArpTense : gameArpExplore;
            const note = arp[step];
            if (note > 0) {
              this.playPluckNote(note, tense ? 0.6 : 1.05, tense ? 0.15 : 0.125, 'triangle');
            }
            if (step % 4 === 0 || (tense && step % 2 === 0)) {
              const bassRoot = gameChords[chordIdx][0] * (tense ? 2 : 1);
              this.playPluckNote(bassRoot, 0.45, tense ? 0.14 : 0.095, 'sine');
            }
            if (tense && step % 2 === 1) {
              this.playPercTick(false);
            }
          }

          this.stepIndex = (this.stepIndex + 1) % 32;
        };

        this._tickMusicFn = tickMusic;
        this.currentStepMs = this.musicMode === 'gameplay' ? 560 : 610;
        if (this.menuTimer) clearInterval(this.menuTimer);
        tickMusic();
        this.menuTimer = setInterval(tickMusic, this.currentStepMs);
      } catch (_err) {
        this.droneNodes = null;
      }
    }

    setAmbienceTension(tension01) {
      this.tension = Math.max(0, Math.min(1, tension01));
      this.applyMix();
    }

    playSmokeDeploy() {
      if (!this.sfxEnabled || !this.ctx || !this.noiseBuffer) return;
      const now = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1600, now);
      filter.frequency.exponentialRampToValueAtTime(420, now + 0.65);
      filter.Q.value = 1.1;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.32, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);
      src.start(now, 0, 0.72);
    }

    playCrouchToggle(crouching) {
      if (!this.sfxEnabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(crouching ? 240 : 170, now);
      osc.frequency.exponentialRampToValueAtTime(crouching ? 150 : 250, now + 0.08);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.1);
    }

    playFootstep(sprinting, quiet) {
      if (!this.sfxEnabled || !this.ctx || !this.noiseBuffer) return;
      const now = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      const pitchJitter = 0.92 + Math.random() * 0.16;
      filter.frequency.setValueAtTime((sprinting ? 460 : quiet ? 240 : 340) * pitchJitter, now);
      filter.Q.value = 1.6;

      const gain = this.ctx.createGain();
      const vol = sprinting ? 0.18 : quiet ? 0.045 : 0.1;
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);
      src.start(now, Math.random() * 0.4, 0.09);
    }

    playEnemyStep(distance, archetype) {
      if (!this.sfxEnabled || !this.ctx) return;
      const maxHear = 11;
      if (distance > maxHear) return;
      const atten = Math.pow(1 - distance / maxHear, 1.5);
      if (atten < 0.03) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      if (archetype === 'spider') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(240 + Math.random() * 60, now);
        osc.frequency.exponentialRampToValueAtTime(90, now + 0.07);
        gain.gain.setValueAtTime(0.18 * atten, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.09);
      } else {
        osc.type = 'sine';
        const pitch = 74 * (0.94 + Math.random() * 0.12);
        osc.frequency.setValueAtTime(pitch, now);
        osc.frequency.exponentialRampToValueAtTime(32, now + 0.14);
        gain.gain.setValueAtTime(0.32 * atten, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.16);
      }
    }

    playEnemyDetected(archetype) {
      if (!this.sfxEnabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = 'sawtooth';
      osc2.type = 'square';
      if (archetype === 'spider') {
        osc1.frequency.setValueAtTime(420, now);
        osc1.frequency.exponentialRampToValueAtTime(980, now + 0.16);
        osc2.frequency.setValueAtTime(465, now);
        osc2.frequency.exponentialRampToValueAtTime(1040, now + 0.16);
      } else {
        osc1.frequency.setValueAtTime(190, now);
        osc1.frequency.exponentialRampToValueAtTime(520, now + 0.18);
        osc2.frequency.setValueAtTime(201, now);
        osc2.frequency.exponentialRampToValueAtTime(542, now + 0.18);
      }

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(750, now);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.46);
      osc2.stop(now + 0.46);
    }

    playHeartbeat(intensity) {
      if (!this.sfxEnabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      for (const offset of [0, 0.17]) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(offset === 0 ? 64 : 52, now + offset);
        osc.frequency.exponentialRampToValueAtTime(28, now + offset + 0.12);
        gain.gain.setValueAtTime(0.28 * intensity, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.13);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now + offset);
        osc.stop(now + offset + 0.14);
      }
    }

    playKeyPickup() {
      if (!this.sfxEnabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const freqs = [660, 990, 1320];
      freqs.forEach((f, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now + idx * 0.055);
        gain.gain.setValueAtTime(0.22, now + idx * 0.055);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.055 + 0.32);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now + idx * 0.055);
        osc.stop(now + idx * 0.055 + 0.34);
      });
    }

    playRelicPickup() {
      if (!this.sfxEnabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const freqs = [523.25, 659.25, 783.99, 1046.5];
      freqs.forEach((f, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now + idx * 0.05);
        gain.gain.setValueAtTime(0.2, now + idx * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.35);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now + idx * 0.05);
        osc.stop(now + idx * 0.05 + 0.36);
      });
    }

    playWebSnare() {
      if (!this.sfxEnabled || !this.ctx || !this.noiseBuffer) return;
      const now = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(1600, now);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);
      src.start(now, 0, 0.23);
    }

    playDoorUnlock() {
      if (!this.sfxEnabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.setValueAtTime(210, now + 0.07);
      osc.frequency.exponentialRampToValueAtTime(85, now + 0.25);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 600;

      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.27);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.28);
    }

    playFlashlightToggle() {
      if (!this.sfxEnabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.035);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.045);
    }

    playTrapTrigger(type) {
      if (!this.sfxEnabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      if (type === 'pit_fall') {
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(48, now + 0.45);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.5);
      } else {
        osc.frequency.setValueAtTime(480, now);
        osc.frequency.exponentialRampToValueAtTime(95, now + 0.2);
        gain.gain.setValueAtTime(0.36, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.23);
      }
    }

    playDisarm() {
      if (!this.sfxEnabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.setValueAtTime(760, now + 0.06);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.17);
    }

    playPickupItem() {
      if (!this.sfxEnabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.14);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.19);
    }

    playGameOver() {
      if (!this.sfxEnabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const notes = [146.83, 138.59, 110.0, 73.42];
      notes.forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now + i * 0.12);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 520;
        gain.gain.setValueAtTime(0.26, now + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.55);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now + i * 0.12);
        osc.stop(now + i * 0.12 + 0.58);
      });
    }

    playVictory() {
      if (!this.sfxEnabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const notes = [392.0, 493.88, 587.33, 783.99];
      notes.forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.09);
        gain.gain.setValueAtTime(0.24, now + i * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.65);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now + i * 0.09);
        osc.stop(now + i * 0.09 + 0.68);
      });
    }

    playSkillActivate(skillId) {
      if (!this.sfxEnabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      if (skillId === 'map_scan') {
        // Crystalline sonar sweep
        [587.33, 880, 1174.66].forEach((freq, i) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + i * 0.07);
          gain.gain.setValueAtTime(0.22, now + i * 0.07);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.45);
          osc.connect(gain);
          gain.connect(this.sfxGain);
          osc.start(now + i * 0.07);
          osc.stop(now + i * 0.07 + 0.47);
        });
      } else if (skillId === 'shock_stun') {
        // Concussive thunderous arc strike
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(240, now);
        osc.frequency.exponentialRampToValueAtTime(38, now + 0.36);
        gain.gain.setValueAtTime(0.36, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.4);
        if (this.noiseBuffer) {
          const n = this.ctx.createBufferSource();
          n.buffer = this.noiseBuffer;
          const bp = this.ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.setValueAtTime(1400, now);
          const ng = this.ctx.createGain();
          ng.gain.setValueAtTime(0.28, now);
          ng.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
          n.connect(bp);
          bp.connect(ng);
          ng.connect(this.sfxGain);
          n.start(now, 0, 0.26);
        }
      } else if (skillId === 'adrenaline_rush') {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(660, now + 0.28);
        gain.gain.setValueAtTime(0.26, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.34);
      } else if (skillId === 'auto_cloak') {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(480, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.32);
        gain.gain.setValueAtTime(0.24, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.36);
      } else {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.2);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.26);
      }
    }

    playPowerOutage() {
      if (!this.sfxEnabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(34, now + 0.65);
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(420, now);
      gain.gain.setValueAtTime(0.32, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.68);
      osc.connect(lp);
      lp.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.7);
    }

    playBossTelegraph() {
      if (!this.sfxEnabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(78, now);
      osc.frequency.exponentialRampToValueAtTime(210, now + 0.75);
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(520, now);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      osc.connect(lp);
      lp.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.82);
    }

    playBossShockwave() {
      if (!this.sfxEnabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(125, now);
      osc.frequency.exponentialRampToValueAtTime(28, now + 0.55);
      gain.gain.setValueAtTime(0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.58);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.6);

      if (this.noiseBuffer) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(480, now);
        const ng = this.ctx.createGain();
        ng.gain.setValueAtTime(0.32, now);
        ng.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
        src.connect(lp);
        lp.connect(ng);
        ng.connect(this.sfxGain);
        src.start(now, 0, 0.44);
      }
    }
  }

  return { SoundEngine };
});
