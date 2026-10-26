/* ============================================================
   Terra Frontier — utilities, RNG, noise, colour, canvas helpers
   ============================================================ */
(function () {
  'use strict';
  const TF = (window.TF = window.TF || {});

  TF.TILE = 16;
  TF.DAY_SECONDS = 225;     // daylight in real seconds
  TF.NIGHT_SECONDS = 135;   // night in real seconds
  TF.CYCLE_SECONDS = TF.DAY_SECONDS + TF.NIGHT_SECONDS;
  TF.HOURS_PER_SECOND = 24 / TF.CYCLE_SECONDS;
  TF.DAY_START = 6.0;       // sunrise
  TF.NIGHT_START = 19.5;
  TF.NIGHT_END = 4.5;
  TF.SAVE_KEY = 'terra_frontier_save_v1';

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
  const smoothstep = (a, b, v) => {
    const t = clamp(invLerp(a, b, v), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const easeOutCubic = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
  const dist2 = (x1, y1, x2, y2) => (x2 - x1) ** 2 + (y2 - y1) ** 2;
  const sign = v => (v < 0 ? -1 : v > 0 ? 1 : 0);
  const approach = (v, target, amount) => {
    if (v < target) return Math.min(v + amount, target);
    if (v > target) return Math.max(v - amount, target);
    return target;
  };
  const wrap = (v, max) => ((v % max) + max) % max;
  const angleDiff = (a, b) => {
    let d = wrap(b - a + Math.PI, Math.PI * 2) - Math.PI;
    return d;
  };
  const angleLerp = (a, b, t) => a + angleDiff(a, b) * t;

  // ---- deterministic RNG ------------------------------------------------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class RNG {
    constructor(seed) {
      this.seed = hashString(String(seed));
      this._r = mulberry32(this.seed);
    }
    next() { return this._r(); }
    range(a, b) { return a + (b - a) * this._r(); }
    int(a, b) { return Math.floor(this.range(a, b + 1)); }
    chance(p) { return this._r() < p; }
    pick(arr) { return arr[Math.floor(this._r() * arr.length)]; }
    sign() { return this._r() < 0.5 ? -1 : 1; }
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(this._r() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }
    fork(salt) { return new RNG(this.seed ^ hashString(String(salt))); }
  }

  function hashString(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function hash2i(x, y, seed) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function hash1(x, seed) { return hash2i(x, 0x9e3779b9, seed); }

  function smooth01(t) { return t * t * (3 - 2 * t); }

  function valueNoise1(x, seed) {
    const i = Math.floor(x);
    const f = x - i;
    const a = hash1(i, seed);
    const b = hash1(i + 1, seed);
    return lerp(a, b, smooth01(f));
  }

  function valueNoise2(x, y, seed) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = smooth01(x - ix), fy = smooth01(y - iy);
    const a = hash2i(ix, iy, seed);
    const b = hash2i(ix + 1, iy, seed);
    const c = hash2i(ix, iy + 1, seed);
    const d = hash2i(ix + 1, iy + 1, seed);
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
  }

  function fbm1(x, seed, octaves = 4, lacunarity = 2, gain = 0.5) {
    let sum = 0, amp = 0.5, freq = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += valueNoise1(x * freq, seed + i * 1013) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  function fbm2(x, y, seed, octaves = 4, lacunarity = 2, gain = 0.5) {
    let sum = 0, amp = 0.5, freq = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += valueNoise2(x * freq, y * freq, seed + i * 7919) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  function ridged2(x, y, seed, octaves = 3) {
    let sum = 0, amp = 0.5, freq = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      const n = valueNoise2(x * freq, y * freq, seed + i * 3571);
      sum += (1 - Math.abs(n * 2 - 1)) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }

  // ---- colours ----------------------------------------------------------
  const colorCache = new Map();
  function hexToRgb(hex) {
    if (Array.isArray(hex)) return hex;
    let c = colorCache.get(hex);
    if (c) return c;
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
    c = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    colorCache.set(hex, c);
    return c;
  }
  function rgbStr(c, a) {
    if (a === undefined) return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
    return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  }
  function mixColor(a, b, t) {
    const ca = hexToRgb(a), cb = hexToRgb(b);
    return [lerp(ca[0], cb[0], t), lerp(ca[1], cb[1], t), lerp(ca[2], cb[2], t)];
  }
  function mixHex(a, b, t) {
    const c = mixColor(a, b, t);
    return rgbStr(c);
  }
  function shade(hex, amount) {
    const c = hexToRgb(hex);
    return [
      clamp(c[0] + amount, 0, 255),
      clamp(c[1] + amount, 0, 255),
      clamp(c[2] + amount, 0, 255),
    ];
  }
  function rgba(hex, alpha) { return rgbStr(hexToRgb(hex), alpha); }

  // ---- canvas -----------------------------------------------------------
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, w | 0);
    c.height = Math.max(1, h | 0);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    return c;
  }
  function ctx2d(canvas) {
    const c = canvas.getContext('2d');
    c.imageSmoothingEnabled = false;
    return c;
  }
  function pixelText(ctx, text, x, y, size, color, align = 'center') {
    ctx.save();
    ctx.font = `bold ${size}px "Courier New", monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000';
    ctx.fillText(text, x + 1, y + 1);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // draws an integer-pixel ellipse-ish blob (no anti-aliasing)
  function pixelCircle(ctx, cx, cy, r, color) {
    const r2 = r * r;
    ctx.fillStyle = color;
    for (let y = -r; y <= r; y++) {
      const span = Math.floor(Math.sqrt(Math.max(0, r2 - y * y)));
      ctx.fillRect(Math.round(cx - span), Math.round(cy + y), span * 2 + 1, 1);
    }
  }

  function hashPos(x, y, seed = 1) { return hash2i(x, y, seed); }

  function fmtTime(hours) {
    const h = Math.floor(hours) % 24;
    const m = Math.floor((hours - Math.floor(hours)) * 60);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  function fmtDuration(seconds) {
    seconds = Math.max(0, Math.floor(seconds));
    const m = Math.floor(seconds / 60), s = seconds % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function roman(n) {
    const map = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let out = '';
    for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
    return out || 'I';
  }

  function storageGet(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  }
  function storageSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) { return false; }
  }
  function storageRemove(key) {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  function pointInRect(px, py, x, y, w, h) {
    return px >= x && py >= y && px < x + w && py < y + h;
  }

  function circleRect(cx, cy, r, x, y, w, h) {
    const nx = clamp(cx, x, x + w);
    const ny = clamp(cy, y, y + h);
    return (cx - nx) ** 2 + (cy - ny) ** 2 <= r * r;
  }

  function seededShuffle(arr, seed) { return new RNG(seed).shuffle(arr.slice()); }

  TF.util = {
    clamp, lerp, invLerp, smoothstep, easeOutCubic, easeInOut,
    dist, dist2, sign, approach, wrap, angleDiff, angleLerp,
    hashString, hash2i, hash1, valueNoise1, valueNoise2, fbm1, fbm2, ridged2,
    hexToRgb, rgbStr, mixColor, mixHex, shade, rgba,
    makeCanvas, ctx2d, pixelText, pixelCircle, hashPos,
    fmtTime, fmtDuration, roman, storageGet, storageSet, storageRemove,
    pointInRect, circleRect, seededShuffle,
  };
  TF.RNG = RNG;
  TF.clamp = clamp;
  TF.lerp = lerp;
  TF.smoothstep = smoothstep;
  TF.easeOutCubic = easeOutCubic;
})();
