/* ============================================================
   Terra Frontier — scene rendering (sky, terrain, lighting, actors)
   ============================================================ */
(function () {
  'use strict';
  const TF = window.TF;
  const U = TF.util;
  const T = TF.T;
  const W = TF.W;
  const TILE = TF.TILE;
  const TD = TF.TILE_DEFS;
  const WD = TF.WALL_DEFS;
  const SOLID = TF.SOLID;
  const R = TF.Renderer.prototype;

  function hashTile(x, y, salt) {
    return U.hash2i(x, y, 9241 + (salt || 0));
  }

  const SKY_KEYS = [
    { h: 0.0, top: '#03050d', mid: '#080f22', low: '#111a34', horizon: '#1a2542' },
    { h: 4.2, top: '#080d1f', mid: '#182040', low: '#3a3151', horizon: '#6f4d5b' },
    { h: 5.7, top: '#26375f', mid: '#60628c', low: '#bb7b77', horizon: '#f7b27d' },
    { h: 7.4, top: '#347ec0', mid: '#69b0da', low: '#b5ddec', horizon: '#e7f4ef' },
    { h: 12.0, top: '#2b7fc6', mid: '#62addb', low: '#abd8eb', horizon: '#dcf2f5' },
    { h: 16.6, top: '#347fbf', mid: '#70b3d8', low: '#c1dde4', horizon: '#f0e5cd' },
    { h: 18.4, top: '#3c4d7f', mid: '#8e6f8c', low: '#df8c68', horizon: '#ffc077' },
    { h: 19.7, top: '#1d2547', mid: '#433052', low: '#8d4d51', horizon: '#c06b4d' },
    { h: 21.2, top: '#080d20', mid: '#111a35', low: '#1d2542', horizon: '#2d3049' },
    { h: 24.0, top: '#03050d', mid: '#080f22', low: '#111a34', horizon: '#1a2542' },
  ];

  const titleStars = (() => {
    const rng = new TF.RNG('tf-title-stars');
    const arr = [];
    for (let i = 0; i < 130; i++) arr.push({ x: rng.next(), y: rng.next() * 0.66, s: rng.chance(0.16) ? 2 : 1, p: rng.range(0, 9), b: rng.range(0.35, 1) });
    return arr;
  })();

  const titleFlies = (() => {
    const rng = new TF.RNG('tf-title-flies');
    const arr = [];
    for (let i = 0; i < 30; i++) arr.push({ x: rng.range(0.3, 1.05), y: rng.range(0.54, 0.93), p: rng.range(0, 9), s: rng.range(0.4, 1.2) });
    return arr;
  })();

  const titleClouds = (() => {
    const rng = new TF.RNG('tf-title-clouds');
    const arr = [];
    for (let i = 0; i < 5; i++) {
      const parts = [];
      const n = rng.int(4, 7);
      for (let k = 0; k < n; k++) parts.push({ x: rng.range(-28, 28), y: rng.range(-5, 4), w: rng.range(10, 26), h: rng.range(5, 10) });
      arr.push({ x: rng.range(0, 1), y: rng.range(0.1, 0.4), sp: rng.range(1.5, 4), a: rng.range(0.12, 0.3), parts });
    }
    return arr;
  })();

  const ambientClouds = (() => {
    const rng = new TF.RNG('tf-clouds');
    const arr = [];
    for (let i = 0; i < 8; i++) {
      const parts = [];
      const n = rng.int(4, 7);
      for (let k = 0; k < n; k++) parts.push({ x: rng.range(-30, 30), y: rng.range(-4, 4), w: rng.range(8, 24), h: rng.range(4, 9) });
      arr.push({ x: rng.range(0, 1), y: rng.range(0.05, 0.42), sp: rng.range(2, 6), scale: rng.range(0.7, 1.35), a: rng.range(0.22, 0.5), parts });
    }
    return arr;
  })();

  function skyColors(hours) {
    let a = SKY_KEYS[0], b = SKY_KEYS[SKY_KEYS.length - 1];
    for (let i = 0; i < SKY_KEYS.length - 1; i++) {
      if (hours >= SKY_KEYS[i].h && hours <= SKY_KEYS[i + 1].h) {
        a = SKY_KEYS[i]; b = SKY_KEYS[i + 1];
        break;
      }
    }
    const t = U.clamp((hours - a.h) / Math.max(0.001, b.h - a.h), 0, 1);
    return {
      top: U.mixColor(a.top, b.top, t),
      mid: U.mixColor(a.mid, b.mid, t),
      low: U.mixColor(a.low, b.low, t),
      horizon: U.mixColor(a.horizon, b.horizon, t),
    };
  }

  function pixelEllipse(ctx, cx, cy, rx, ry, color) {
    ctx.fillStyle = color;
    for (let y = -Math.floor(ry); y <= Math.floor(ry); y++) {
      const p = 1 - (y * y) / (ry * ry);
      if (p < 0) continue;
      const half = Math.round(Math.sqrt(p) * rx);
      ctx.fillRect(Math.round(cx - half), Math.round(cy + y), half * 2 + 1, 1);
    }
  }

  function pixelLine(ctx, x0, y0, x1, y1, size, color) {
    ctx.fillStyle = color;
    const dx = x1 - x0, dy = y1 - y0;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(x0 + (dx * i) / steps);
      const y = Math.round(y0 + (dy * i) / steps);
      ctx.fillRect(x, y, size, size);
    }
  }

  R.draw = function (game, dt) {
    this.time += dt;
    const ctx = this.ctx;
    const cam = game.camera;
    const camX = Math.round(cam.x + (game.camera.shakeX || 0));
    const camY = Math.round(cam.y + (game.camera.shakeY || 0));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, this.w, this.h);

    this._drawSky(game, camX, camY);
    this._drawParallax(game, camX, camY);
    this._drawWalls(game, camX, camY);
    this._drawTiles(game, camX, camY);
    this._drawDecor(game, camX, camY);
    this._drawTrees(game, camX, camY);
    this._drawObjects(game, camX, camY);
    this._drawDrops(game, camX, camY);
    this._drawActors(game, camX, camY);
    this._drawProjectiles(game, camX, camY);
    game.particles.draw(ctx, false);

    // blue night wash across everything before dynamic light is applied
    if (game.nightFactor > 0.01) {
      ctx.fillStyle = `rgba(18,30,66,${0.16 * game.nightFactor})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    if (game.weather && game.weather.rain > 0.02) {
      ctx.fillStyle = `rgba(26,40,54,${game.weather.rain * 0.12})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }

    this._drawLighting(game, camX, camY);
    this._drawGlows(game, camX, camY);
    if (game.ambient) game.ambient.draw(ctx, game);
    game.particles.draw(ctx, true);
    game.floatingTexts.draw(ctx);
    this._drawWeather(game, dt);
    this._drawCursor(game, camX, camY);
  };

  // ==========================================================
  // SKY
  // ==========================================================
  R._drawSky = function (game, camX, camY) {
    const ctx = this.ctx;
    const w = this.w, h = this.h;
    const cols = skyColors(game.hours);
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, U.rgbStr(cols.top));
    grad.addColorStop(0.48, U.rgbStr(cols.mid));
    grad.addColorStop(0.77, U.rgbStr(cols.low));
    grad.addColorStop(1, U.rgbStr(cols.horizon));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const night = game.nightFactor;

    // stars
    if (night > 0.03) {
      const starCanvas = this._stars || (this._stars = (() => {
        const rng = new TF.RNG('stars-main');
        const arr = [];
        for (let i = 0; i < 190; i++) arr.push({ x: rng.next(), y: rng.next() * 0.72, s: rng.chance(0.12) ? 2 : 1, p: rng.range(0, 10), b: rng.range(0.3, 1) });
        return arr;
      })());
      for (const s of starCanvas) {
        const tw = 0.5 + 0.5 * Math.sin(this.time * 1.7 + s.p);
        if (tw < 0.25) continue;
        let x = (s.x * w - camX * 0.025) % w;
        if (x < 0) x += w;
        const y = s.y * h * 0.8;
        ctx.globalAlpha = night * s.b * (0.35 + tw * 0.65);
        ctx.fillStyle = s.s === 2 ? '#fff8d8' : '#cfe3ff';
        ctx.fillRect(Math.floor(x), Math.floor(y), s.s, s.s);
        if (s.s === 2) {
          ctx.globalAlpha *= 0.35;
          ctx.fillRect(Math.floor(x) - 1, Math.floor(y) + 1, 1, 1);
          ctx.fillRect(Math.floor(x) + 2, Math.floor(y) + 1, 1, 1);
        }
      }
      ctx.globalAlpha = 1;
    }

    // celestial body
    const sunT = (game.hours - 5.4) / 13.2;
    if (sunT > -0.02 && sunT < 1.02) {
      const t = U.clamp(sunT, 0, 1);
      const x = w * (0.12 + 0.76 * t);
      const y = h * 0.59 - Math.sin(t * Math.PI) * h * 0.42;
      this._drawSun(x, y, 13 + Math.sin(t * Math.PI) * 2, game);
    }
    const moonT = U.wrap((game.hours - 18.0) / 12, 24) / 24;
    const moonVisible = game.hours >= 18.4 || game.hours <= 5.6;
    if (moonVisible) {
      const t = U.clamp((game.hours >= 18.4 ? (game.hours - 18.4) / 11.2 : (game.hours + 5.6) / 11.6), 0, 1);
      const x = w * (0.14 + 0.72 * t);
      const y = h * 0.54 - Math.sin(t * Math.PI) * h * 0.38;
      this._drawMoon(x, y, 11, game.day, game);
    }

    // clouds
    const cloudTint = U.mixColor(cols.mid, cols.horizon, 0.65);
    const rain = game.weather ? game.weather.rain : 0;
    const cloudColor = U.mixColor(cloudTint, '#5a6470', 0.25 + rain * 0.55);
    for (const c of ambientClouds) {
      const x = ((c.x * w + this.time * c.sp - camX * 0.055) % (w + 180)) - 90;
      const y = c.y * h * 0.9 - camY * 0.01;
      if (y > h * 0.66) continue;
      const cloudAlpha = (0.20 + c.a * 0.75) * (1 - rain * 0.15) * (game.isNight ? 0.32 : 1);
      // soft dark base, then rounded puffs, then top highlight
      ctx.globalAlpha = cloudAlpha * 0.55;
      ctx.fillStyle = U.rgbStr(U.mixColor(cloudColor, '#303b48', 0.35));
      for (const p of c.parts) {
        const px = x + p.x * c.scale;
        const py = y + p.y * c.scale;
        this._pixelEllipse(ctx, px, py + 2, (p.w * c.scale) / 2, (p.h * c.scale) / 2.4, U.rgbStr(U.mixColor(cloudColor, '#303b48', 0.35)));
      }
      ctx.globalAlpha = cloudAlpha;
      ctx.fillStyle = U.rgbStr(cloudColor);
      for (const p of c.parts) {
        const px = x + p.x * c.scale;
        const py = y + p.y * c.scale;
        this._pixelEllipse(ctx, px, py, (p.w * c.scale) / 2, (p.h * c.scale) / 2, U.rgbStr(cloudColor));
      }
      ctx.globalAlpha = cloudAlpha * 0.6;
      const hi = U.rgbStr(U.mixColor(cloudColor, '#ffffff', 0.55));
      ctx.fillStyle = hi;
      for (const p of c.parts) {
        const px = x + p.x * c.scale;
        const py = y + p.y * c.scale;
        this._pixelEllipse(ctx, px - (p.w * c.scale) * 0.08, py - (p.h * c.scale) * 0.25, (p.w * c.scale) * 0.38, (p.h * c.scale) * 0.24, hi);
      }
    }
    ctx.globalAlpha = 1;

    // overcast veil during rain
    if (rain > 0.02) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = `rgba(53,68,81,${rain * 0.38})`;
      ctx.fillRect(0, 0, w, h);
      const veil = ctx.createLinearGradient(0, 0, 0, h * 0.8);
      veil.addColorStop(0, `rgba(24,35,44,${rain * 0.22})`);
      veil.addColorStop(1, 'rgba(24,35,44,0)');
      ctx.fillStyle = veil;
      ctx.fillRect(0, 0, w, h * 0.8);
    }

    // very subtle sun rays / dusk glow
    if (sunT > -0.02 && sunT < 1.02) {
      const t = U.clamp(sunT, 0, 1);
      const x = w * (0.12 + 0.76 * t);
      const y = h * 0.59 - Math.sin(t * Math.PI) * h * 0.42;
      const g = ctx.createRadialGradient(x, y, 4, x, y, 220);
      const warm = (1 - Math.abs(t - 0.5) * 2) * (1 - rain * 0.75);
      g.addColorStop(0, `rgba(255,219,143,${0.11 * warm})`);
      g.addColorStop(1, 'rgba(255,210,120,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  };

  R._drawSun = function (x, y, r, game) {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(x, y, 2, x, y, r * 6.5);
    g.addColorStop(0, 'rgba(255,236,173,0.52)');
    g.addColorStop(0.35, 'rgba(255,200,107,0.15)');
    g.addColorStop(1, 'rgba(255,180,80,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r * 7, y - r * 7, r * 14, r * 14);
    // pixel sun
    for (let yy = -r; yy <= r; yy++) {
      const p = 1 - (yy * yy) / (r * r);
      if (p < 0) continue;
      const half = Math.round(Math.sqrt(p) * r);
      ctx.fillStyle = yy < -r * 0.2 ? '#fff6ca' : '#ffe28a';
      ctx.fillRect(Math.round(x - half), Math.round(y + yy), half * 2, 1);
    }
    ctx.fillStyle = 'rgba(255,255,240,0.7)';
    ctx.fillRect(Math.round(x - r * 0.4), Math.round(y - r * 0.45), Math.round(r * 0.55), 2);
  };

  R._drawMoon = function (x, y, r, day, game) {
    const ctx = this.ctx;
    const phase = day % 8;
    const g = ctx.createRadialGradient(x, y, 2, x, y, r * 7);
    g.addColorStop(0, 'rgba(195,220,255,0.28)');
    g.addColorStop(0.4, 'rgba(140,180,240,0.07)');
    g.addColorStop(1, 'rgba(100,150,230,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r * 7, y - r * 7, r * 14, r * 14);

    if (!this._moonCache) this._moonCache = {};
    if (!this._moonCache[phase]) {
      const c = U.makeCanvas(r * 2 + 8, r * 2 + 8);
      const cc = c.getContext('2d');
      cc.imageSmoothingEnabled = false;
      const cx = c.width / 2, cy = c.height / 2;
      for (let yy = -r; yy <= r; yy++) {
        const p = 1 - (yy * yy) / (r * r);
        if (p < 0) continue;
        const half = Math.round(Math.sqrt(p) * r);
        cc.fillStyle = '#e8e4c8';
        cc.fillRect(Math.round(cx - half), Math.round(cy + yy), half * 2, 1);
      }
      cc.fillStyle = 'rgba(172,169,145,0.65)';
      cc.fillRect(cx - 3, cy - 4, 2, 2);
      cc.fillRect(cx + 2, cy + 3, 3, 1);
      cc.fillRect(cx - 4, cy + 4, 1, 1);
      cc.fillRect(cx + 1, cy - 2, 1, 1);
      if (phase !== 0) {
        const off = (phase <= 4 ? phase : phase - 8) * (r / 3.2);
        cc.globalCompositeOperation = 'destination-out';
        cc.beginPath();
        cc.arc(cx + off, cy - 1, r * 1.04, 0, Math.PI * 2);
        cc.fill();
      }
      cc.globalCompositeOperation = 'source-over';
      this._moonCache[phase] = c;
    }
    ctx.globalAlpha = 0.9;
    ctx.drawImage(this._moonCache[phase], Math.round(x - (r + 4)), Math.round(y - (r + 4)));
    ctx.globalAlpha = 1;
  };

  R._makeClouds = function () {
    return [];
  };

  R._drawParallax = function (game, camX, camY) {
    const ctx = this.ctx;
    const w = this.w, h = this.h;
    const cols = skyColors(game.hours);
    const sx = game.world.startSurfaceY ? game.world.startSurfaceY * TILE : 100 * TILE;
    const base = h * 0.59 + (sx - camY - h * 0.5) * 0.055;
    const layers = [
      { p: 0.035, amp: 62, base: base - 18, color: U.mixColor(cols.low, '#3b5d63', 0.62), step: 12, freq: 0.006, alpha: 0.42 },
      { p: 0.07, amp: 42, base: base + 26, color: U.mixColor(cols.low, '#294d43', 0.7), step: 9, freq: 0.011, alpha: 0.55 },
      { p: 0.12, amp: 26, base: base + 66, color: U.mixColor(cols.low, '#1d3c34', 0.72), step: 7, freq: 0.018, alpha: 0.7 },
    ];
    for (let li = 0; li < layers.length; li++) {
      const L = layers[li];
      ctx.globalAlpha = L.alpha;
      ctx.fillStyle = U.rgbStr(L.color);
      ctx.beginPath();
      ctx.moveTo(0, h);
      const off = camX * L.p + li * 200;
      for (let x = 0; x <= w + L.step; x += L.step) {
        const n = U.fbm1((x + off) * L.freq, game.world.seedNum + 700 + li * 19, 3);
        const n2 = U.fbm1((x + off) * L.freq * 2.6, game.world.seedNum + 701 + li * 31, 2);
        const yy = L.base - n * L.amp - n2 * 12;
        ctx.lineTo(x, yy);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  // ==========================================================
  // TERRAIN
  // ==========================================================
  R._drawWalls = function (game, camX, camY) {
    const ctx = this.ctx;
    const world = game.world;
    const minTX = Math.floor(camX / TILE) - 1;
    const maxTX = Math.ceil((camX + this.w) / TILE) + 1;
    const minTY = Math.floor(camY / TILE) - 1;
    const maxTY = Math.ceil((camY + this.h) / TILE) + 1;
    for (let y = minTY; y <= maxTY; y++) {
      if (y < 0 || y >= world.h) continue;
      for (let x = minTX; x <= maxTX; x++) {
        if (x < 0 || x >= world.w) continue;
        const wall = world.getWall(x, y);
        if (!wall) continue;
        const tile = world.getTile(x, y);
        if (SOLID[tile]) continue;
        const variants = this.wallAtlas[wall];
        if (!variants || !variants.length) continue;
        const v = ((hashTile(x, y, 3) * 4) | 0) % 4;
        const px = x * TILE - camX;
        const py = y * TILE - camY;
        ctx.drawImage(variants[v], px, py);
        // subtle edge darkening where wall meets open air
        if (!world.getWall(x, y - 1)) {
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          ctx.fillRect(px, py, TILE, 1);
        }
      }
    }
  };

  R._drawTiles = function (game, camX, camY) {
    const ctx = this.ctx;
    const world = game.world;
    const minTX = Math.floor(camX / TILE) - 1;
    const maxTX = Math.ceil((camX + this.w) / TILE) + 1;
    const minTY = Math.floor(camY / TILE) - 1;
    const maxTY = Math.ceil((camY + this.h) / TILE) + 1;
    const mining = game.mining;
    for (let y = minTY; y <= maxTY; y++) {
      if (y < 0 || y >= world.h) continue;
      for (let x = minTX; x <= maxTX; x++) {
        if (x < 0 || x >= world.w) continue;
        const tile = world.getTile(x, y);
        if (tile === T.AIR) continue;
        const def = TD[tile];
        const pal = def.palette;
        const variants = this.tileAtlas[tile];
        if (!variants || !variants.length) continue;
        const px = x * TILE - camX;
        const py = y * TILE - camY;
        const v = ((hashTile(x, y, 8) * 4) | 0) % 4;
        ctx.drawImage(variants[v], px, py);

        const above = world.getTile(x, y - 1);
        const below = world.getTile(x, y + 1);
        const left = world.getTile(x - 1, y);
        const right = world.getTile(x + 1, y);

        if (!SOLID[above]) {
          if (tile === T.GRASS) {
            this._drawGrassBlades(x, y, px, py, camX, camY);
          } else if (tile === T.SNOW) {
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.fillRect(px, py, TILE, 1);
          } else if (tile !== T.PLATFORM) {
            ctx.fillStyle = pal.light;
            ctx.globalAlpha = 0.18;
            ctx.fillRect(px, py, TILE, 1);
            ctx.globalAlpha = 1;
          }
        }
        if (!SOLID[below] && tile !== T.PLATFORM) {
          ctx.fillStyle = pal.dark;
          ctx.globalAlpha = 0.35;
          ctx.fillRect(px, py + TILE - 1, TILE, 1);
          ctx.globalAlpha = 1;
        }
        if (!SOLID[left] && tile !== T.PLATFORM) {
          ctx.fillStyle = pal.light;
          ctx.globalAlpha = 0.11;
          ctx.fillRect(px, py, 1, TILE);
          ctx.globalAlpha = 1;
        }
        if (!SOLID[right] && tile !== T.PLATFORM) {
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          ctx.fillRect(px + TILE - 1, py, 1, TILE);
        }
        // glints on ores
        if ((tile === T.COPPER || tile === T.IRON || tile === T.GOLD || tile === T.GEM || tile === T.HEART) && hashTile(x, y, 15) > 0.78) {
          const tw = 0.4 + 0.6 * Math.sin(this.time * 2.2 + hashTile(x, y, 18) * 8);
          if (tw > 0.55) {
            ctx.globalAlpha = (tw - 0.55) * 0.8;
            ctx.fillStyle = tile === T.GOLD || tile === T.HEART ? '#fff8ce' : '#ffffff';
            ctx.fillRect(px + 4 + ((hashTile(x, y, 22) * 8) | 0), py + 3 + ((hashTile(x, y, 23) * 8) | 0), 1, 1);
            ctx.globalAlpha = 1;
          }
        }
        if (mining && mining.tx === x && mining.ty === y && mining.progress > 0.01) {
          this._drawCracks(px, py, mining.progress, x, y);
        }
      }
    }
  };

  R._drawGrassBlades = function (x, y, px, py) {
    const ctx = this.ctx;
    const h1 = hashTile(x, y, 31);
    const count = 2 + Math.floor(h1 * 4);
    const pal = TD[T.GRASS].palette;
    for (let i = 0; i < count; i++) {
      const hh = hashTile(x, y, 41 + i);
      const bx = 2 + Math.floor(hashTile(x, y, 51 + i) * 12);
      const height = 1 + Math.floor(hh * 3);
      ctx.fillStyle = hh > 0.55 ? pal.topLight : pal.top;
      ctx.globalAlpha = 0.75;
      ctx.fillRect(px + bx, py - height, 1, height + 1);
      if (hh > 0.76) ctx.fillRect(px + bx + 1, py - height + 1, 1, height);
      ctx.globalAlpha = 1;
    }
  };

  R._drawCracks = function (px, py, progress, x, y) {
    const ctx = this.ctx;
    const stages = progress > 0.22 ? 1 : 0;
    const tree = progress > 0.48;
    const heavy = progress > 0.72;
    ctx.globalAlpha = 0.35 + progress * 0.5;
    ctx.fillStyle = 'rgba(16,12,9,0.95)';
    if (stages) {
      const a = hashTile(x, y, 71), b = hashTile(x, y, 72);
      const sx = 2 + Math.floor(a * 10), sy = 2 + Math.floor(b * 8);
      ctx.fillRect(px + sx, py + sy, 1, 3);
      ctx.fillRect(px + sx + 1, py + sy + 2, 1, 2);
    }
    if (tree) {
      const sx = 5 + Math.floor(hashTile(x, y, 73) * 7);
      const sy = 1 + Math.floor(hashTile(x, y, 74) * 5);
      ctx.fillRect(px + sx, py + sy, 1, 5);
      ctx.fillRect(px + sx - 1, py + sy + 3, 3, 1);
      ctx.fillRect(px + sx - 2, py + sy + 1, 2, 1);
    }
    if (heavy) {
      const sx = 2 + Math.floor(hashTile(x, y, 75) * 11);
      const sy = 7 + Math.floor(hashTile(x, y, 76) * 5);
      ctx.fillRect(px + sx, py + sy, 2, 1);
      ctx.fillRect(px + sx + 2, py + sy + 1, 1, 2);
      ctx.fillRect(px + sx - 3, py + sy - 2, 2, 1);
    }
    ctx.globalAlpha = 1;
  };

  R._drawDecor = function (game, camX, camY) {
    const ctx = this.ctx;
    const world = game.world;
    const minTX = Math.floor(camX / TILE) - 1;
    const maxTX = Math.ceil((camX + this.w) / TILE) + 1;
    const minTY = Math.floor(camY / TILE) - 1;
    const maxTY = Math.ceil((camY + this.h) / TILE) + 1;
    for (const d of world.decor) {
      if (d.x < minTX || d.x > maxTX || d.y < minTY || d.y > maxTY) continue;
      const px = d.x * TILE - camX;
      const py = d.y * TILE - camY;
      const type = d.type;
      if (type === 'vine') {
        if (!SOLID[world.getTile(d.x, d.y - 1)]) continue;
        this._drawVine(px + 8, py, d, game);
        continue;
      }
      if (!SOLID[world.getTile(d.x, d.y + 1)]) continue;
      if (SOLID[world.getTile(d.x, d.y)]) continue;
      const sway = Math.sin(this.time * 1.7 + d.phase) * (type === 'grass' || type === 'flower' ? 0.8 : 0.35);
      ctx.save();
      ctx.translate(Math.round(px + 8 + sway), py + TILE);
      if (type === 'grass') {
        const sp = this.decoAtlas.grass[d.variant % 4];
        ctx.drawImage(sp, -8, -16);
      } else if (type === 'flower') {
        const sp = this.decoAtlas.flower[d.variant % 5];
        ctx.drawImage(sp, -8, -16);
        ctx.globalAlpha = 0.28 + 0.12 * Math.sin(this.time * 2 + d.phase);
        ctx.fillStyle = '#fff1a8';
        ctx.fillRect(-1, -14, 1, 1);
        ctx.globalAlpha = 1;
      } else if (type === 'mushroom') {
        const sp = this.decoAtlas.mushroom[d.variant % 3];
        ctx.drawImage(sp, -8, -16);
      } else if (type === 'glowshroom') {
        const sp = this.decoAtlas.glowshroom[d.variant % 2];
        ctx.globalAlpha = 0.7 + 0.3 * Math.sin(this.time * 2 + d.phase);
        ctx.drawImage(sp, -8, -16);
        ctx.globalAlpha = 1;
      } else if (type === 'cavegrass') {
        ctx.drawImage(this.decoAtlas.cavegrass[d.variant % 4], -8, -16);
      } else if (type === 'crystal') {
        const sp = this.decoAtlas.crystal[d.variant % 3];
        ctx.globalAlpha = 0.7 + 0.3 * Math.sin(this.time * 1.8 + d.phase);
        ctx.drawImage(sp, -8, -16);
        ctx.globalAlpha = 1;
      } else if (type === 'rock' || type === 'pebble') {
        ctx.drawImage(this.decoAtlas.rock[d.variant % 3], -8, -16);
      }
      ctx.restore();
    }
  };

  R._drawVine = function (x, y, d, game) {
    const ctx = this.ctx;
    const len = (d.len || 4) * TILE;
    const sway = Math.sin(this.time * 0.9 + d.phase) * 2;
    ctx.strokeStyle = d.variant === 0 ? '#3e5b3c' : d.variant === 1 ? '#415d48' : '#4d6642';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + sway, y + len * 0.5, x + sway * 1.6, y + len);
    ctx.stroke();
    ctx.fillStyle = '#6d944f';
    for (let i = 1; i <= Math.floor(len / 12); i++) {
      const yy = y + i * 12;
      const xx = x + Math.sin((i * 0.8) + d.phase) * 2 + sway * (i / Math.max(1, len / 12));
      ctx.fillRect(Math.round(xx + (i % 2 ? 1 : -2)), Math.round(yy), 2, 1);
    }
  };

  // ==========================================================
  // TREES
  // ==========================================================
  R._prepareTree = function (tree) {
    if (tree._render) return tree._render;
    const rng = new TF.RNG('tree-' + tree.seed + '-' + tree.id);
    const data = { clusters: [], branches: [], pineLayers: [] };
    if (tree.type === 'pine') {
      const n = tree.h;
      for (let i = 0; i < n - 1; i++) {
        data.pineLayers.push({
          y: -16 * (i + 1) - 4,
          w: (16 + i * 7) * U.lerp(0.72, 1.05, rng.next()),
          snow: rng.chance(0.45),
        });
      }
    } else if (tree.type === 'cactus') {
      data.arms = [];
      for (let i = 0; i < 2; i++) {
        if (rng.chance(0.65)) {
          data.arms.push({
            y: -rng.range(0.2, 0.7) * tree.h * 16,
            dir: rng.chance(0.5) ? 1 : -1,
            len: rng.range(8, 17),
          });
        }
      }
    } else {
      const n = 7 + Math.floor(rng.next() * 4);
      for (let i = 0; i < n; i++) {
        const ang = rng.range(-Math.PI, 0);
        const rr = rng.range(9, 27);
        data.clusters.push({
          x: Math.cos(ang) * rr * 1.15,
          y: -tree.h * 16 * 0.82 + Math.sin(ang) * rr * 0.55 + rng.range(-9, 9),
          r: rng.range(8, 17),
          c: rng.int(0, 2),
        });
      }
      data.clusters.push({ x: 0, y: -tree.h * 16 - 4, r: 16, c: 0 });
      for (let i = 0; i < 3; i++) {
        data.branches.push({
          y: -tree.h * 16 * rng.range(0.45, 0.82),
          dir: rng.chance(0.5) ? 1 : -1,
          len: rng.range(8, 20),
          up: rng.range(4, 12),
        });
      }
    }
    tree._render = data;
    return data;
  };

  R._drawTrees = function (game, camX, camY) {
    const ctx = this.ctx;
    const world = game.world;
    for (const tree of world.trees) {
      const baseX = tree.x * TILE + TILE / 2 - camX;
      const baseY = tree.y * TILE - camY + TILE;
      if (baseX < -90 || baseX > this.w + 90 || baseY < -40 || baseY > this.h + 120) continue;
      this._drawTree(tree, baseX, baseY, game);
    }
    if (game.mining && game.mining.tree) {
      const t = game.mining.tree;
      const bx = t.x * TILE + TILE / 2 - camX;
      const by = t.y * TILE - camY - t.h * TILE;
      if (game.mining.progress > 0.03) {
        ctx.fillStyle = 'rgba(8,10,8,0.72)';
        ctx.fillRect(bx - 14, by - 9, 28, 3);
        ctx.fillStyle = '#b6d074';
        ctx.fillRect(bx - 13, by - 8, 26 * U.clamp(game.mining.progress, 0, 1), 1);
      }
    }
  };

  R._drawTree = function (tree, baseX, baseY, game) {
    const ctx = this.ctx;
    const data = this._prepareTree(tree);
    const shake = tree.hitFlash > 0 ? Math.sin(tree.hitFlash * 42) * tree.hitFlash * 2.5 : 0;
    const sway = Math.sin(this.time * 0.7 + tree.seed) * 1.2;
    ctx.save();
    ctx.translate(baseX + shake, baseY);
    if (tree.falling) {
      const t = U.clamp(tree.fallT / 1.55, 0, 1);
      const angle = tree.fallDir * U.easeOutCubic(t) * Math.PI * 0.48;
      ctx.rotate(angle);
      ctx.globalAlpha = 1 - U.smoothstep(1.3, 1.8, tree.fallT);
    }
    // shadow
    if (!tree.falling) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(-13, 0, 26, 2);
      ctx.fillRect(-8, 2, 16, 1);
    }
    if (tree.type === 'pine') {
      const trunkW = 6;
      ctx.fillStyle = '#4e331d';
      ctx.fillRect(-trunkW / 2 - 1, -tree.h * 16 - 6, trunkW + 2, tree.h * 16 + 8);
      ctx.fillStyle = '#75502d';
      for (let y = 4; y < tree.h * 16; y += 9) {
        ctx.fillRect(-2, -y, 1, 5);
      }
      for (let i = 0; i < data.pineLayers.length; i++) {
        const l = data.pineLayers[i];
        const off = sway * (1 - i / data.pineLayers.length) * 1.2;
        const w = l.w;
        const yy = l.y;
        ctx.fillStyle = i < 3 ? '#2e523e' : '#224334';
        for (let row = 0; row < 14; row++) {
          const half = (w / 2) * (row / 14);
          ctx.fillRect(Math.round(off - half), Math.round(yy + row), Math.round(half * 2), 1);
        }
        ctx.fillStyle = '#3d6c4f';
        for (let row = 2; row < 11; row++) {
          const half = (w / 2) * (row / 14) * 0.8;
          ctx.fillRect(Math.round(off - half), Math.round(yy + row), Math.round(half * 2), 1);
        }
        if (l.snow) {
          ctx.fillStyle = 'rgba(236,248,250,0.86)';
          const half = (w / 2) * 0.45;
          ctx.fillRect(Math.round(off - half), Math.round(yy + 1), Math.round(half * 2), 1);
        }
      }
    } else if (tree.type === 'cactus') {
      ctx.fillStyle = '#2d5b37';
      const w = 10;
      ctx.fillRect(-w / 2, -tree.h * 16, w, tree.h * 16 + 2);
      ctx.fillStyle = '#4a7b42';
      ctx.fillRect(-w / 2 + 2, -tree.h * 16 + 2, 3, tree.h * 16 - 2);
      ctx.fillStyle = '#78a05a';
      ctx.fillRect(-w / 2 + 2, -tree.h * 16 + 2, 1, tree.h * 16 - 4);
      for (const arm of data.arms || []) {
        const ax = arm.dir * 7;
        const ay = arm.y;
        ctx.fillStyle = '#2d5b37';
        ctx.fillRect(Math.min(ax, ax + arm.dir * arm.len), ay, Math.abs(arm.len) + 6, 4);
        ctx.fillRect(ax + arm.dir * arm.len, ay - 10, 4, 14);
        ctx.fillStyle = '#527f47';
        ctx.fillRect(Math.min(ax, ax + arm.dir * arm.len) + 1, ay + 1, Math.abs(arm.len) + 2, 1);
      }
      ctx.fillStyle = '#d7d6a4';
      for (let i = 0; i < tree.h * 2; i++) {
        const yy = -((i * 13 + 7) % (tree.h * 16 - 4)) - 3;
        ctx.fillRect(-7, yy, 1, 1);
        ctx.fillRect(6, yy + 4, 1, 1);
      }
    } else {
      const trunkW = tree.type === 'birch' ? 7 : 8;
      const trunkColor = tree.type === 'birch' ? '#c8c2ad' : '#6a4324';
      const trunkLight = tree.type === 'birch' ? '#e0dac6' : '#865b32';
      const trunkDark = tree.type === 'birch' ? '#a39e8c' : '#4b2d18';
      // branches behind
      ctx.strokeStyle = trunkDark;
      ctx.lineWidth = 3;
      for (const b of data.branches) {
        ctx.beginPath();
        ctx.moveTo(0, b.y + 20);
        ctx.lineTo(b.dir * b.len, b.y - b.up);
        ctx.stroke();
      }
      ctx.fillStyle = trunkDark;
      ctx.fillRect(-trunkW / 2 - 1, -tree.h * 16 - 2, trunkW + 2, tree.h * 16 + 5);
      ctx.fillStyle = trunkColor;
      ctx.fillRect(-trunkW / 2, -tree.h * 16 - 1, trunkW, tree.h * 16 + 4);
      ctx.fillStyle = trunkLight;
      ctx.fillRect(-trunkW / 2 + 1, -tree.h * 16, 2, tree.h * 16 + 2);
      // bark details
      ctx.fillStyle = trunkDark;
      for (let y = 8; y < tree.h * 16 - 2; y += 11) {
        const xx = ((hashTile(tree.x, y, 2) * 6) | 0) - 3;
        ctx.fillRect(xx, -y, 1, 4);
      }
      if (tree.type === 'birch') {
        for (let y = 14; y < tree.h * 16; y += 17) {
          ctx.fillStyle = '#5b574c';
          ctx.fillRect(-2, -y, 3, 1);
          ctx.fillRect(1, -y + 2, 2, 1);
        }
      }
      // roots
      ctx.fillStyle = trunkDark;
      ctx.fillRect(-trunkW / 2 - 4, -2, 5, 3);
      ctx.fillRect(trunkW / 2 - 1, -2, 5, 3);
      // leaves
      const colors = tree.type === 'birch'
        ? ['#3c6b38', '#548a45', '#78a951']
        : ['#2f5e2d', '#437a35', '#67a046', '#8ec15b'];
      for (const c of data.clusters) {
        const cx = c.x + sway * (1 + Math.abs(c.y) / (tree.h * 16));
        const cy = c.y;
        pixelEllipse(ctx, cx + 1, cy + 2, c.r + 1, c.r * 0.72 + 1, 'rgba(16,36,19,0.38)');
        pixelEllipse(ctx, cx, cy, c.r, c.r * 0.72, colors[c.c % 2 === 0 ? 0 : 1]);
        pixelEllipse(ctx, cx - 1, cy - 2, c.r * 0.78, c.r * 0.54, colors[1]);
        pixelEllipse(ctx, cx - c.r * 0.22, cy - c.r * 0.27, c.r * 0.46, c.r * 0.32, colors[2]);
        if (colors[3] && c.r > 11) pixelEllipse(ctx, cx - c.r * 0.32, cy - c.r * 0.34, c.r * 0.24, c.r * 0.18, colors[3]);
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  R._drawObjects = function (game, camX, camY) {
    const cam = { x: camX, y: camY };
    for (const obj of game.world.objects) {
      const b = game.world.objectBounds(obj);
      if (b.x + b.w < camX - 40 || b.x > camX + this.w + 40 || b.y + b.h < camY - 60 || b.y > camY + this.h + 40) continue;
      this.drawObject(obj, obj.x * TILE - camX, obj.y * TILE - camY, 1);
    }
  };

  R.drawObject = function (obj, px, py, alpha = 1, ghost = null) {
    const ctx = this.ctx;
    const type = obj.type;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(Math.round(px), Math.round(py));
    if (ghost) {
      ctx.globalAlpha = alpha * 0.55;
    }
    const time = this.time;
    if (type === 'torch') {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(4, 14, 8, 2);
      ctx.fillStyle = '#5c3d21';
      ctx.fillRect(7, 5, 2, 10);
      ctx.fillStyle = '#8f6539';
      ctx.fillRect(7, 5, 1, 9);
      const flick = Math.sin(time * 13 + obj.animSeed) * 0.6;
      const fy = 2 + flick;
      ctx.fillStyle = 'rgba(255,157,63,0.3)';
      ctx.fillRect(4, fy + 1, 8, 5);
      ctx.fillStyle = '#e86e2c';
      ctx.fillRect(5, fy + 1, 6, 4);
      ctx.fillStyle = '#ffd05a';
      ctx.fillRect(6, fy - 1, 4, 4);
      ctx.fillStyle = '#fff5bb';
      ctx.fillRect(7, fy, 2, 2);
    } else if (type === 'furnace') {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(3, 30, 28, 3);
      // stone body
      ctx.fillStyle = '#39373d';
      ctx.fillRect(1, 5, 30, 27);
      ctx.fillStyle = '#6a6870';
      ctx.fillRect(2, 6, 28, 25);
      ctx.fillStyle = '#817f87';
      ctx.fillRect(3, 7, 26, 2);
      ctx.fillStyle = '#4d4b53';
      ctx.fillRect(2, 26, 28, 5);
      // bricks
      ctx.fillStyle = '#58565e';
      ctx.fillRect(2, 13, 28, 1);
      ctx.fillRect(2, 20, 28, 1);
      ctx.fillRect(9, 7, 1, 6);
      ctx.fillRect(21, 14, 1, 6);
      // fire mouth
      ctx.fillStyle = '#211512';
      ctx.fillRect(7, 15, 18, 13);
      const flick = 0.6 + 0.4 * Math.sin(time * 12 + obj.animSeed);
      ctx.fillStyle = '#8e2e1d';
      ctx.fillRect(9, 20, 14, 8);
      ctx.fillStyle = '#e45c23';
      ctx.fillRect(10, 19 + (1 - flick) * 2, 12, 7);
      ctx.fillStyle = '#ff9d32';
      ctx.fillRect(12, 20, 8, 5);
      ctx.fillStyle = '#ffe27a';
      ctx.fillRect(13, 22, 5, 3);
      // chimney
      ctx.fillStyle = '#4f4d55';
      ctx.fillRect(22, 0, 6, 8);
      ctx.fillStyle = '#78767e';
      ctx.fillRect(22, 0, 6, 2);
      ctx.fillStyle = 'rgba(200,200,200,0.12)';
      ctx.fillRect(24, -6 + Math.sin(time) * 2, 4, 5);
    } else if (type === 'workbench') {
      ctx.fillStyle = 'rgba(0,0,0,0.24)';
      ctx.fillRect(2, 14, 28, 2);
      ctx.fillStyle = '#6b4525';
      ctx.fillRect(2, 6, 28, 4);
      ctx.fillStyle = '#b57f45';
      ctx.fillRect(1, 5, 30, 3);
      ctx.fillStyle = '#d19a58';
      ctx.fillRect(2, 5, 28, 1);
      ctx.fillStyle = '#75502d';
      ctx.fillRect(4, 9, 3, 6);
      ctx.fillRect(25, 9, 3, 6);
      ctx.fillStyle = '#a56f39';
      ctx.fillRect(9, 3, 7, 2);
      ctx.fillStyle = '#d8d2c4';
      ctx.fillRect(20, 3, 7, 1);
      ctx.fillRect(24, 1, 2, 4);
      ctx.fillStyle = '#7b512b';
      ctx.fillRect(16, 1, 1, 4);
    } else if (type === 'anvil') {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(3, 14, 26, 2);
      ctx.fillStyle = '#3f3d45';
      ctx.fillRect(2, 5, 28, 5);
      ctx.fillStyle = '#66646e';
      ctx.fillRect(2, 4, 9, 4);
      ctx.fillRect(20, 4, 9, 3);
      ctx.fillStyle = '#8b8994';
      ctx.fillRect(3, 4, 7, 1);
      ctx.fillRect(21, 4, 6, 1);
      ctx.fillStyle = '#4b4952';
      ctx.fillRect(12, 9, 7, 4);
      ctx.fillRect(8, 12, 16, 3);
      ctx.fillStyle = '#33323a';
      ctx.fillRect(8, 15, 16, 1);
    } else if (type === 'table') {
      ctx.fillStyle = 'rgba(0,0,0,0.24)';
      ctx.fillRect(2, 14, 28, 2);
      ctx.fillStyle = '#6b4525';
      ctx.fillRect(3, 6, 4, 9);
      ctx.fillRect(25, 6, 4, 9);
      ctx.fillStyle = '#b57f45';
      ctx.fillRect(1, 4, 30, 3);
      ctx.fillStyle = '#d19a58';
      ctx.fillRect(2, 4, 28, 1);
      ctx.fillStyle = '#8a5b2f';
      ctx.fillRect(9, 7, 2, 5);
      ctx.fillStyle = '#d8d0b8';
      ctx.fillRect(17, 3, 4, 2);
      ctx.fillStyle = '#8a5b2f';
      ctx.fillRect(18, 2, 2, 1);
    } else if (type === 'chair') {
      ctx.fillStyle = 'rgba(0,0,0,0.24)';
      ctx.fillRect(2, 30, 12, 2);
      ctx.fillStyle = '#6b4525';
      ctx.fillRect(4, 5, 3, 22);
      ctx.fillRect(2, 5, 6, 3);
      ctx.fillStyle = '#a5733d';
      ctx.fillRect(4, 14, 9, 4);
      ctx.fillStyle = '#c08a50';
      ctx.fillRect(5, 14, 8, 1);
      ctx.fillStyle = '#6b4525';
      ctx.fillRect(9, 18, 3, 9);
      ctx.fillRect(4, 18, 2, 9);
      ctx.fillStyle = '#8b5b2f';
      ctx.fillRect(6, 8, 1, 6);
    } else if (type === 'door') {
      const open = obj.open;
      ctx.fillStyle = '#3a2616';
      ctx.fillRect(0, 0, 16, 48);
      if (open) {
        ctx.fillStyle = '#20160f';
        ctx.fillRect(2, 2, 12, 44);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(4, 4, 8, 40);
        // swung door slab
        ctx.fillStyle = '#6b4525';
        ctx.fillRect(0, 2, 4, 44);
        ctx.fillStyle = '#a8753f';
        ctx.fillRect(0, 3, 2, 42);
        ctx.fillStyle = '#d3b56a';
        ctx.fillRect(1, 23, 1, 1);
      } else {
        ctx.fillStyle = '#5b3a1f';
        ctx.fillRect(1, 1, 14, 46);
        ctx.fillStyle = '#976a3b';
        ctx.fillRect(2, 2, 12, 44);
        ctx.fillStyle = '#b9874c';
        ctx.fillRect(3, 3, 10, 2);
        ctx.fillStyle = '#79502b';
        ctx.fillRect(2, 13, 12, 1);
        ctx.fillRect(2, 25, 12, 1);
        ctx.fillRect(2, 37, 12, 1);
        ctx.fillRect(7, 4, 1, 9);
        ctx.fillRect(9, 15, 1, 9);
        ctx.fillStyle = '#d1a751';
        ctx.fillRect(11, 24, 2, 2);
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.fillRect(3, 3, 1, 41);
      }
    } else if (type === 'campfire') {
      ctx.fillStyle = 'rgba(0,0,0,0.24)';
      ctx.fillRect(2, 14, 28, 2);
      ctx.fillStyle = '#4f3927';
      ctx.fillRect(3, 11, 26, 3);
      ctx.fillStyle = '#72513a';
      ctx.fillRect(5, 9, 22, 3);
      ctx.fillStyle = '#54402e';
      ctx.fillRect(9, 12, 12, 2);
      const f = Math.sin(time * 11 + obj.animSeed) * 0.6;
      ctx.fillStyle = '#8a3a1d';
      ctx.fillRect(11, 5 + f, 8, 6);
      ctx.fillStyle = '#e56e24';
      ctx.fillRect(12, 3 + f, 6, 7);
      ctx.fillStyle = '#ffb03c';
      ctx.fillRect(13, 2 + f, 4, 5);
      ctx.fillStyle = '#fff0a1';
      ctx.fillRect(14, 3 + f, 2, 3);
      ctx.fillStyle = 'rgba(120,120,120,0.15)';
      ctx.fillRect(15, -7 - f * 2, 4, 8);
    }
    if (ghost) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = ghost;
      ctx.globalAlpha = alpha * 0.35;
      ctx.fillRect(-2, -32, 40, 80);
    }
    ctx.restore();
  };
})();
