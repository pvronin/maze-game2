/**
 * qr.js
 * Pure Vanilla JS QR Code Encoder (ISO/IEC 18004, Versions 1–8, ECC Level L, Byte Mode)
 * for scannable LAN/Web multiplayer invite links without external dependencies.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HorrorMaze = root.HorrorMaze || {};
    Object.assign(root.HorrorMaze, factory());
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // GF(256) with primitive polynomial 0x11D
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  (function initGalois() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) {
      EXP[i] = EXP[i - 255];
    }
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  function rsGeneratorPoly(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const next = new Array(poly.length + 1).fill(0);
      const factor = EXP[i];
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMul(poly[j], factor);
      }
      poly = next;
    }
    return poly;
  }

  function rsEncode(data, eccCount) {
    const gen = rsGeneratorPoly(eccCount);
    const res = new Uint8Array(data.length + eccCount);
    res.set(data, 0);
    for (let i = 0; i < data.length; i++) {
      const coef = res[i];
      if (coef !== 0) {
        for (let j = 0; j < gen.length; j++) {
          res[i + j] ^= gfMul(gen[j], coef);
        }
      }
    }
    return res.slice(data.length);
  }

  // [dataCodewords, blocks, eccPerBlock, alignmentCenters]
  const VERSION_TABLE = {
    1: { dataCap: 19, blocks: 1, eccPerBlock: 7, align: [] },
    2: { dataCap: 34, blocks: 1, eccPerBlock: 10, align: [6, 18] },
    3: { dataCap: 55, blocks: 1, eccPerBlock: 15, align: [6, 22] },
    4: { dataCap: 80, blocks: 1, eccPerBlock: 20, align: [6, 26] },
    5: { dataCap: 108, blocks: 1, eccPerBlock: 26, align: [6, 30] },
    6: { dataCap: 136, blocks: 2, eccPerBlock: 18, align: [6, 34] },
    7: { dataCap: 156, blocks: 2, eccPerBlock: 20, align: [6, 22, 38] },
    8: { dataCap: 194, blocks: 2, eccPerBlock: 24, align: [6, 24, 42] },
  };

  function encodeUtf8Bytes(str) {
    if (typeof TextEncoder !== 'undefined') {
      return Array.from(new TextEncoder().encode(str));
    }
    const out = [];
    for (let i = 0; i < str.length; i++) {
      out.push(str.charCodeAt(i) & 0xff);
    }
    return out;
  }

  function encodeQrMatrix(text) {
    const bytes = encodeUtf8Bytes(String(text || ''));
    let version = 1;
    // Byte mode header is 4 bits mode + 8 bits length = 12 bits -> +2 bytes overhead
    for (let v = 1; v <= 8; v++) {
      if (bytes.length + 2 <= VERSION_TABLE[v].dataCap) {
        version = v;
        break;
      }
      if (v === 8) version = 8;
    }

    const spec = VERSION_TABLE[version];
    const maxDataBytes = Math.min(bytes.length, spec.dataCap - 2);
    const bits = [];
    const pushBits = (val, len) => {
      for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
    };

    pushBits(0b0100, 4); // Byte mode
    pushBits(maxDataBytes, 8);
    for (let i = 0; i < maxDataBytes; i++) pushBits(bytes[i], 8);
    const totalDataBits = spec.dataCap * 8;
    pushBits(0, Math.min(4, totalDataBits - bits.length));
    while (bits.length % 8 !== 0) bits.push(0);

    const dataBytes = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      dataBytes.push(b);
    }
    const pads = [0xec, 0x11];
    let padIdx = 0;
    while (dataBytes.length < spec.dataCap) {
      dataBytes.push(pads[padIdx % 2]);
      padIdx++;
    }

    // Split into blocks, compute ECC, interleave
    const blockLen = spec.dataCap / spec.blocks;
    const dataBlocks = [];
    const eccBlocks = [];
    for (let b = 0; b < spec.blocks; b++) {
      const slice = new Uint8Array(dataBytes.slice(b * blockLen, (b + 1) * blockLen));
      dataBlocks.push(slice);
      eccBlocks.push(rsEncode(slice, spec.eccPerBlock));
    }

    const finalBytes = [];
    for (let i = 0; i < blockLen; i++) {
      for (let b = 0; b < spec.blocks; b++) finalBytes.push(dataBlocks[b][i]);
    }
    for (let i = 0; i < spec.eccPerBlock; i++) {
      for (let b = 0; b < spec.blocks; b++) finalBytes.push(eccBlocks[b][i]);
    }

    const size = 17 + version * 4;
    const modules = Array.from({ length: size }, () => new Int8Array(size).fill(-1));
    const isFunc = Array.from({ length: size }, () => new Uint8Array(size));

    const setMod = (r, c, val, func) => {
      if (r < 0 || c < 0 || r >= size || c >= size) return;
      modules[r][c] = val ? 1 : 0;
      if (func) isFunc[r][c] = 1;
    };

    const drawFinder = (tr, tc) => {
      for (let dr = -1; dr <= 7; dr++) {
        for (let dc = -1; dc <= 7; dc++) {
          const r = tr + dr;
          const c = tc + dc;
          if (r < 0 || c < 0 || r >= size || c >= size) continue;
          const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
          const onBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6;
          const inInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
          setMod(r, c, inOuter && (onBorder || inInner), true);
        }
      }
    };

    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
      setMod(6, i, i % 2 === 0, true);
      setMod(i, 6, i % 2 === 0, true);
    }

    // Dark module
    setMod(4 * version + 9, 8, 1, true);

    // Alignment patterns
    const align = spec.align;
    for (let i = 0; i < align.length; i++) {
      for (let j = 0; j < align.length; j++) {
        const cr = align[i];
        const cc = align[j];
        if (isFunc[cr][cc]) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const onEdge = Math.max(Math.abs(dr), Math.abs(dc)) === 2;
            const center = dr === 0 && dc === 0;
            setMod(cr + dr, cc + dc, onEdge || center, true);
          }
        }
      }
    }

    // Reserve format strips
    for (let i = 0; i <= 8; i++) {
      if (i !== 6) {
        isFunc[8][i] = 1;
        isFunc[i][8] = 1;
      }
    }
    for (let i = 0; i < 8; i++) {
      isFunc[8][size - 1 - i] = 1;
    }
    for (let i = 0; i < 7; i++) {
      isFunc[size - 1 - i][8] = 1;
    }

    // Version info for V7+
    if (version >= 7) {
      let rem = version;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const verBits = (version << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const bit = (verBits >>> i) & 1;
        const a = size - 11 + (i % 3);
        const b = Math.floor(i / 3);
        setMod(b, a, bit, true);
        setMod(a, b, bit, true);
      }
    }

    // Place data bits in zig-zag
    let bitIdx = 0;
    const totalBits = finalBytes.length * 8;
    let upward = true;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let step = 0; step < size; step++) {
        const r = upward ? size - 1 - step : step;
        for (let k = 0; k < 2; k++) {
          const c = right - k;
          if (isFunc[r][c]) continue;
          let bit = 0;
          if (bitIdx < totalBits) {
            bit = (finalBytes[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1;
            bitIdx++;
          }
          modules[r][c] = bit;
        }
      }
      upward = !upward;
    }

    // Evaluate masks 0..7
    const maskCond = (m, r, c) => {
      switch (m) {
        case 0: return (r + c) % 2 === 0;
        case 1: return r % 2 === 0;
        case 2: return c % 3 === 0;
        case 3: return (r + c) % 3 === 0;
        case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
        case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
        case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
        default: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
      }
    };

    const writeFormat = (mat, maskId) => {
      // ECC Level L (01) + 3-bit maskId -> 15-bit BCH ^ 0x5412
      const data = (0b01 << 3) | maskId;
      let rem = data;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const fmt = ((data << 10) | rem) ^ 0x5412;

      for (let i = 0; i <= 5; i++) mat[8][i] = (fmt >>> (14 - i)) & 1;
      mat[8][7] = (fmt >>> 8) & 1;
      mat[8][8] = (fmt >>> 7) & 1;
      mat[7][8] = (fmt >>> 6) & 1;
      for (let i = 0; i <= 5; i++) mat[i][8] = (fmt >>> i) & 1;

      for (let i = 0; i < 8; i++) mat[8][size - 1 - i] = (fmt >>> i) & 1;
      for (let i = 0; i < 7; i++) mat[size - 1 - i][8] = (fmt >>> (14 - i)) & 1;
    };

    let bestMask = 0;
    let bestScore = Infinity;
    let bestMatrix = null;

    for (let m = 0; m < 8; m++) {
      const mat = modules.map((row, r) => {
        const copy = new Int8Array(row);
        for (let c = 0; c < size; c++) {
          if (!isFunc[r][c] && maskCond(m, r, c)) {
            copy[c] ^= 1;
          }
        }
        return copy;
      });
      writeFormat(mat, m);

      // Penalty heuristic (runs + 2x2 blocks + balance)
      let score = 0;
      let darkCount = 0;
      for (let r = 0; r < size; r++) {
        let run = 1;
        for (let c = 0; c < size; c++) {
          if (mat[r][c]) darkCount++;
          if (c > 0) {
            if (mat[r][c] === mat[r][c - 1]) run++;
            else {
              if (run >= 5) score += 3 + (run - 5);
              run = 1;
            }
          }
          if (r > 0 && c > 0) {
            const v = mat[r][c];
            if (v === mat[r - 1][c] && v === mat[r][c - 1] && v === mat[r - 1][c - 1]) score += 3;
          }
        }
        if (run >= 5) score += 3 + (run - 5);
      }
      for (let c = 0; c < size; c++) {
        let run = 1;
        for (let r = 1; r < size; r++) {
          if (mat[r][c] === mat[r - 1][c]) run++;
          else {
            if (run >= 5) score += 3 + (run - 5);
            run = 1;
          }
        }
        if (run >= 5) score += 3 + (run - 5);
      }
      const ratio = Math.abs((darkCount * 100) / (size * size) - 50);
      score += Math.floor(ratio / 5) * 10;

      if (score < bestScore) {
        bestScore = score;
        bestMask = m;
        bestMatrix = mat;
      }
    }

    return { size, version, mask: bestMask, matrix: bestMatrix };
  }

  function renderQrCanvas(canvas, text) {
    if (!canvas) return null;
    const qr = encodeQrMatrix(text);
    const quiet = 3;
    const total = qr.size + quiet * 2;
    const targetPx = Math.max(120, canvas.width || 140);
    const scale = Math.max(2, Math.floor(targetPx / total));
    const dim = total * scale;
    canvas.width = dim;
    canvas.height = dim;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, dim, dim);
    ctx.fillStyle = '#05070b';
    for (let r = 0; r < qr.size; r++) {
      for (let c = 0; c < qr.size; c++) {
        if (qr.matrix[r][c]) {
          ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
        }
      }
    }
    return qr;
  }

  return { encodeQrMatrix, renderQrCanvas };
});
