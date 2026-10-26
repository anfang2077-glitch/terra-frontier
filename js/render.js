/* ============================================================
   Terra Frontier — pixel renderer
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

  const TITLE_STARS = (() => {
    const rng = new TF.RNG('title-stars');
    const arr = [];
    for (let i = 0; i < 120; i++) {
      arr.push({ x: rng.next(), y: rng.next() * 0.66, s: rng.chance(0.16) ? 2 : 1, p: rng.range(0, 8), b: rng.range(0.4, 1) });
    }
    return arr;
  })();

  const TITLE_FIREFLIES = (() => {
    const rng = new TF.RNG('title-flies');
    const arr = [];
    for (let i = 0; i < 28; i++) arr.push({ x: rng.range(0.32, 1.05), y: rng.range(0.55, 0.94), p: rng.range(0, 9), s: rng.range(0.4, 1.2) });
    return arr;
  })();

  function hashTile(x, y, salt) {
    return U.hash2i(x, y, 9241 + (salt || 0));
  }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.ctx.imageSmoothingEnabled = false;
      this.w = canvas.width;
      this.h = canvas.height;
      this.icons = new Map();
      this.tileAtlas = [];
      this.wallAtlas = [];
      this.decoAtlas = {};
      this.lightCanvas = null;
      this.lightCtx = null;
      this.lightLevels = null;
      this.rainDrops = [];
      this.rainInit = false;
      this.time = 0;
      this._buildAtlases();
      this.resize();
    }

    resize() {
      const vw = window.innerWidth || 1280;
      const vh = window.innerHeight || 720;
      const aspect = vw / vh;
      let ih = 540;
      let iw = Math.round(ih * aspect);
      if (iw > 1280) { iw = 1280; ih = Math.round(iw / aspect); }
      if (iw < 760) { iw = 760; ih = Math.round(iw / aspect); }
      this.w = this.canvas.width = iw;
      this.h = this.canvas.height = ih;
      this.ctx = this.canvas.getContext('2d');
      this.ctx.imageSmoothingEnabled = false;
      this._initRain();
    }

    viewBounds(camera) {
      return { x: camera.x, y: camera.y, w: this.w, h: this.h };
    }

    getIcon(id, size = 16) {
      const key = id + '_' + size;
      let c = this.icons.get(key);
      if (!c) {
        c = U.makeCanvas(size, size);
        TF.drawItemIcon(U.ctx2d(c), id, size);
        this.icons.set(key, c);
      }
      return c;
    }

    // ==========================================================
    // ATLAS GENERATION
    // ==========================================================
    _buildAtlases() {
      for (const idStr in TD) {
        const id = Number(idStr);
        if (id === T.AIR) { this.tileAtlas[id] = []; continue; }
        const pal = TD[id].palette;
        if (!pal) { this.tileAtlas[id] = []; continue; }
        const variants = [];
        for (let v = 0; v < 4; v++) variants.push(this._makeTileTexture(id, v, pal));
        this.tileAtlas[id] = variants;
      }
      for (const idStr in WD) {
        const id = Number(idStr);
        if (id === W.NONE) { this.wallAtlas[id] = []; continue; }
        const variants = [];
        for (let v = 0; v < 4; v++) variants.push(this._makeWallTexture(id, v, WD[id].palette));
        this.wallAtlas[id] = variants;
      }
      this.decoAtlas.grass = [0, 1, 2, 3].map(v => this._makeGrassDeco(v));
      this.decoAtlas.flower = [0, 1, 2, 3, 4].map(v => this._makeFlowerDeco(v));
      this.decoAtlas.mushroom = [0, 1, 2].map(v => this._makeMushroomDeco(v, false));
      this.decoAtlas.glowshroom = [0, 1].map(v => this._makeMushroomDeco(v, true));
      this.decoAtlas.cavegrass = [0, 1, 2, 3].map(v => this._makeCaveGrassDeco(v));
      this.decoAtlas.crystal = [0, 1, 2].map(v => this._makeCrystalDeco(v));
      this.decoAtlas.rock = [0, 1, 2].map(v => this._makeRockDeco(v));
    }

    _textureBase(ctx, pal, rng, count = 15) {
      ctx.fillStyle = pal.base;
      ctx.fillRect(0, 0, TILE, TILE);
      for (let i = 0; i < count; i++) {
        const x = (rng.next() * TILE) | 0;
        const y = (rng.next() * TILE) | 0;
        const w = rng.chance(0.22) ? 2 : 1;
        const h = rng.chance(0.22) ? 2 : 1;
        ctx.fillStyle = rng.chance(0.55) ? pal.dark : rng.chance(0.5) ? pal.light : pal.detail;
        ctx.globalAlpha = rng.range(0.4, 0.95);
        ctx.fillRect(x, y, w, h);
      }
      ctx.globalAlpha = 1;
    }

    _oreTexture(ctx, pal, rng, strong = 1) {
      this._textureBase(ctx, pal, rng, 12);
      const clusters = 2 + ((rng.next() * 2) | 0);
      for (let c = 0; c < clusters; c++) {
        const cx = 3 + (rng.next() * 10 | 0);
        const cy = 3 + (rng.next() * 9 | 0);
        const size = 1 + (rng.next() * 2.2 | 0);
        for (let dy = -size; dy <= size; dy++) {
          for (let dx = -size; dx <= size; dx++) {
            if (dx * dx + dy * dy > size * size + 1) continue;
            if (rng.chance(0.2)) continue;
            ctx.fillStyle = rng.chance(0.3) ? pal.accent2 : pal.accent;
            ctx.fillRect(cx + dx, cy + dy, 1, 1);
          }
        }
        ctx.fillStyle = pal.dark;
        ctx.globalAlpha = 0.4;
        ctx.fillRect(cx - size, cy + size, size * 2, 1);
        ctx.globalAlpha = 1;
      }
      if (strong && rng.chance(0.65)) {
        ctx.fillStyle = pal.accent2 || pal.light;
        const sx = 3 + (rng.next() * 10 | 0), sy = 3 + (rng.next() * 9 | 0);
        ctx.fillRect(sx, sy, 1, 1);
      }
    }

    _makeTileTexture(id, variant, pal) {
      const c = U.makeCanvas(TILE, TILE);
      const ctx = c.getContext('2d');
      const rng = new TF.RNG('tex-' + id + '-' + variant + '-' + 1729);

      if (id === T.GRASS) {
        this._textureBase(ctx, TD[T.DIRT].palette, rng, 18);
        ctx.fillStyle = pal.topDark;
        ctx.fillRect(0, 0, TILE, 5);
        ctx.fillStyle = pal.top;
        ctx.fillRect(0, 1, TILE, 3);
        ctx.fillStyle = pal.topLight;
        for (let x = 0; x < TILE; x += 2) {
          if (rng.chance(0.55)) ctx.fillRect(x, 1 + (rng.chance(0.4) ? 1 : 0), 1, 2);
        }
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = rng.chance(0.5) ? pal.top : pal.topLight;
          ctx.fillRect((rng.next() * 15) | 0, 4 + (rng.next() * 3 | 0), 1, 1);
        }
        ctx.fillStyle = 'rgba(15,26,12,0.35)';
        ctx.fillRect(0, 5, TILE, 1);
        return c;
      }
      if (id === T.STONE) {
        this._textureBase(ctx, pal, rng, 17);
        for (let i = 0; i < 2; i++) {
          let x = (rng.next() * 12 + 2) | 0;
          let y = (rng.next() * 12 + 2) | 0;
          ctx.fillStyle = pal.dark;
          for (let s = 0; s < 4; s++) {
            ctx.fillRect(x, y, 2, 1);
            x += rng.int(-1, 2);
            y += rng.chance(0.5) ? 1 : 0;
          }
        }
        ctx.fillStyle = pal.light;
        ctx.globalAlpha = 0.8;
        ctx.fillRect(3, 3, 2, 1);
        ctx.fillRect(11, 9, 1, 2);
        ctx.globalAlpha = 1;
        return c;
      }
      if (id === T.DEEPSTONE) {
        this._textureBase(ctx, pal, rng, 20);
        ctx.fillStyle = pal.dark;
        for (let i = 0; i < 3; i++) {
          const x = (rng.next() * 13 + 1) | 0;
          const y = (rng.next() * 13 + 1) | 0;
          ctx.fillRect(x, y, 1, 2);
          ctx.fillRect(x + 1, y + 2, 2, 1);
        }
        ctx.fillStyle = pal.light;
        ctx.globalAlpha = 0.4;
        ctx.fillRect(4, 2, 3, 1);
        ctx.globalAlpha = 1;
        return c;
      }
      if (id === T.MOSSSTONE) {
        this._textureBase(ctx, pal, rng, 16);
        ctx.fillStyle = pal.accent;
        for (let i = 0; i < 7; i++) {
          const x = (rng.next() * 14) | 0, y = (rng.next() * 9) | 0;
          ctx.globalAlpha = rng.range(0.35, 0.8);
          ctx.fillRect(x, y, rng.chance(0.5) ? 2 : 1, 1);
        }
        ctx.globalAlpha = 1;
        return c;
      }
      if (id === T.DIRT) {
        this._textureBase(ctx, pal, rng, 20);
        ctx.fillStyle = pal.detail;
        ctx.globalAlpha = 0.45;
        ctx.fillRect(4, 11, 3, 1);
        ctx.fillStyle = pal.light;
        ctx.fillRect(11, 4, 1, 1);
        ctx.globalAlpha = 1;
        return c;
      }
      if (id === T.SAND) {
        this._textureBase(ctx, pal, rng, 22);
        ctx.fillStyle = pal.light;
        ctx.globalAlpha = 0.55;
        for (let y = 3; y < 14; y += 4) {
          const off = (y * 3 + variant) % 5;
          ctx.fillRect(2 + off, y, 5, 1);
          ctx.fillRect(10 - off, y + 2, 3, 1);
        }
        ctx.globalAlpha = 1;
        return c;
      }
      if (id === T.SANDSTONE) {
        this._textureBase(ctx, pal, rng, 14);
        ctx.fillStyle = pal.dark;
        ctx.globalAlpha = 0.55;
        for (let y = 4; y < 16; y += 6) ctx.fillRect(0, y + (variant % 2), TILE, 1);
        ctx.fillStyle = pal.light;
        ctx.fillRect(2, 2, 8, 1);
        ctx.fillRect(4, 10, 5, 1);
        ctx.globalAlpha = 1;
        return c;
      }
      if (id === T.SNOW) {
        this._textureBase(ctx, pal, rng, 15);
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.8;
        ctx.fillRect(1, 1, 6, 1);
        ctx.fillRect(9, 4, 4, 1);
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = pal.dark;
        ctx.fillRect(4, 9, 4, 1);
        ctx.fillRect(12, 12, 2, 1);
        ctx.globalAlpha = 1;
        return c;
      }
      if (id === T.ICE) {
        this._textureBase(ctx, pal, rng, 8);
        ctx.fillStyle = '#dff8ff';
        ctx.globalAlpha = 0.7;
        for (let i = 0; i < 3; i++) {
          const x = 2 + (rng.next() * 10 | 0), y = 2 + (rng.next() * 10 | 0);
          ctx.fillRect(x, y, 4, 1);
          ctx.fillRect(x + 1, y + 1, 2, 1);
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.42)';
        ctx.beginPath();
        ctx.moveTo(2, 12); ctx.lineTo(7, 5); ctx.lineTo(12, 9);
        ctx.stroke();
        ctx.globalAlpha = 1;
        return c;
      }
      if (id === T.COPPER) { this._oreTexture(ctx, pal, rng); return c; }
      if (id === T.IRON) { this._oreTexture(ctx, pal, rng); return c; }
      if (id === T.GOLD) { this._oreTexture(ctx, pal, rng); return c; }
      if (id === T.GEM) {
        this._textureBase(ctx, pal, rng, 12);
        for (let i = 0; i < 2; i++) {
          const cx = 4 + (rng.next() * 8 | 0), cy = 4 + (rng.next() * 7 | 0);
          ctx.fillStyle = pal.accent;
          ctx.fillRect(cx, cy, 2, 4);
          ctx.fillRect(cx - 1, cy + 2, 4, 2);
          ctx.fillStyle = pal.accent2;
          ctx.fillRect(cx, cy + 1, 1, 2);
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.fillRect(cx + 1, cy, 1, 1);
        }
        return c;
      }
      if (id === T.HEART) {
        this._textureBase(ctx, pal, rng, 11);
        ctx.fillStyle = pal.accent;
        ctx.fillRect(5, 4, 3, 3);
        ctx.fillRect(4, 6, 6, 5);
        ctx.fillRect(6, 11, 3, 2);
        ctx.fillStyle = pal.accent2;
        ctx.fillRect(6, 5, 1, 2);
        ctx.fillRect(8, 7, 1, 1);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillRect(6, 4, 1, 1);
        ctx.fillStyle = pal.dark;
        ctx.globalAlpha = 0.5;
        ctx.fillRect(4, 12, 7, 1);
        ctx.globalAlpha = 1;
        return c;
      }
      if (id === T.PLANK) {
        ctx.fillStyle = pal.base; ctx.fillRect(0, 0, 16, 16);
        for (let row = 0; row < 4; row++) {
          const y = row * 4;
          ctx.fillStyle = row % 2 ? pal.dark : pal.light;
          ctx.globalAlpha = 0.3;
          ctx.fillRect(0, y, 16, 1);
          ctx.globalAlpha = 0.55;
          ctx.fillStyle = pal.detail;
          ctx.fillRect(0, y + 3, 16, 1);
          ctx.globalAlpha = 1;
          const seam = (row * 6 + variant * 3 + 2) % 15;
          ctx.fillStyle = pal.dark;
          ctx.fillRect(seam, y, 1, 3);
          if (rng.chance(0.5)) {
            ctx.fillStyle = pal.light;
            ctx.globalAlpha = 0.4;
            ctx.fillRect((rng.next() * 13 | 0), y + 1, 3, 1);
            ctx.globalAlpha = 1;
          }
        }
        return c;
      }
      if (id === T.STONEBRICK) {
        ctx.fillStyle = pal.base; ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = pal.dark;
        ctx.fillRect(0, 0, 16, 1);
        ctx.fillRect(0, 5, 16, 1);
        ctx.fillRect(0, 10, 16, 1);
        ctx.fillRect(0, 15, 16, 1);
        ctx.fillRect(7, 1, 1, 4);
        ctx.fillRect(3, 6, 1, 4);
        ctx.fillRect(11, 6, 1, 4);
        ctx.fillRect(7, 11, 1, 4);
        ctx.fillStyle = pal.light;
        ctx.globalAlpha = 0.48;
        ctx.fillRect(1, 1, 6, 1);
        ctx.fillRect(8, 6, 3, 1);
        ctx.fillRect(4, 11, 3, 1);
        ctx.globalAlpha = 1;
        return c;
      }
      if (id === T.PLATFORM) {
        ctx.clearRect(0, 0, 16, 16);
        ctx.fillStyle = pal.dark; ctx.fillRect(0, 0, 16, 6);
        ctx.fillStyle = pal.base; ctx.fillRect(0, 0, 16, 5);
        ctx.fillStyle = pal.light; ctx.fillRect(0, 0, 16, 2);
        ctx.fillStyle = pal.detail; ctx.fillRect(0, 4, 16, 1);
        ctx.fillStyle = pal.dark;
        ctx.fillRect(3, 5, 2, 4);
        ctx.fillRect(11, 5, 2, 4);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 6, 16, 1);
        return c;
      }
      this._textureBase(ctx, pal, rng, 16);
      return c;
    }

    _makeWallTexture(id, variant, pal) {
      const c = U.makeCanvas(TILE, TILE);
      const ctx = c.getContext('2d');
      const rng = new TF.RNG('wall-' + id + '-' + variant + '-733');
      ctx.fillStyle = pal.base;
      ctx.fillRect(0, 0, 16, 16);
      if (id === W.WOOD) {
        for (let y = 0; y < 16; y += 4) {
          ctx.fillStyle = pal.dark;
          ctx.fillRect(0, y + 3, 16, 1);
          ctx.fillStyle = pal.light;
          ctx.globalAlpha = 0.22;
          ctx.fillRect(4 + (y % 3), y + 1, 8, 1);
          ctx.globalAlpha = 1;
        }
        ctx.fillStyle = pal.dark;
        ctx.fillRect(7 + variant * 2, 0, 1, 16);
      } else if (id === W.STONE || id === W.STONEWALL || id === W.BRICKWALL) {
        ctx.fillStyle = pal.dark;
        for (let y = 4; y < 16; y += 5) ctx.fillRect(0, y, 16, 1);
        for (let y = 0; y < 16; y += 5) {
          const off = (y / 5) % 2 ? 4 : 10;
          ctx.fillRect((off + variant) % 16, y, 1, 5);
        }
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = rng.chance(0.5) ? pal.light : pal.dark;
          ctx.globalAlpha = 0.35;
          ctx.fillRect((rng.next() * 15) | 0, (rng.next() * 15) | 0, 1, 1);
          ctx.globalAlpha = 1;
        }
      } else {
        for (let i = 0; i < 18; i++) {
          ctx.fillStyle = rng.chance(0.5) ? pal.dark : pal.light;
          ctx.globalAlpha = rng.range(0.15, 0.5);
          ctx.fillRect((rng.next() * 15) | 0, (rng.next() * 15) | 0, rng.chance(0.3) ? 2 : 1, 1);
          ctx.globalAlpha = 1;
        }
        ctx.fillStyle = pal.dark;
        ctx.globalAlpha = 0.4;
        ctx.fillRect(3, 3, 4, 1);
        ctx.fillRect(10, 9, 3, 1);
        ctx.globalAlpha = 1;
      }
      // fine grid / mortar shading
      ctx.fillStyle = 'rgba(0,0,0,0.13)';
      ctx.fillRect(0, 0, 16, 1);
      ctx.fillRect(0, 0, 1, 16);
      return c;
    }

    _makeGrassDeco(variant) {
      const c = U.makeCanvas(16, 16);
      const ctx = c.getContext('2d');
      const rng = new TF.RNG('grassdeco-' + variant);
      const color = variant % 2 ? '#5c9e3d' : '#4d8b35';
      const light = '#7abd50';
      const count = 5 + variant;
      for (let i = 0; i < count; i++) {
        const x = 2 + (rng.next() * 12) | 0;
        const h = 4 + (rng.next() * 8) | 0;
        ctx.fillStyle = rng.chance(0.32) ? light : color;
        ctx.fillRect(x, 15 - h, 1, h);
        if (h > 4 && rng.chance(0.65)) {
          ctx.fillRect(x + 1, 15 - h + 1, 1, h - 3);
          if (h > 7) ctx.fillRect(x + 2, 15 - h + 3, 1, h - 5);
        }
        if (h > 6 && rng.chance(0.35)) {
          ctx.fillStyle = '#3f702d';
          ctx.fillRect(x - 1, 15 - h + 2, 1, 3);
        }
      }
      return c;
    }

    _makeFlowerDeco(variant) {
      const c = U.makeCanvas(16, 16);
      const ctx = c.getContext('2d');
      const colors = ['#e5c74f', '#d96b7f', '#8b7fe0', '#e8e2ca', '#e98b4d'];
      const col = colors[variant % colors.length];
      const rng = new TF.RNG('flower-' + variant);
      for (let i = 0; i < 3; i++) {
        const x = 3 + (rng.next() * 10) | 0;
        const h = 6 + (rng.next() * 6) | 0;
        ctx.fillStyle = '#4f8a38';
        ctx.fillRect(x, 15 - h, 1, h);
        ctx.fillStyle = '#679b47';
        ctx.fillRect(x + 1, 15 - h + 2, 1, h - 4);
        ctx.fillStyle = col;
        const fy = 15 - h;
        ctx.fillRect(x - 1, fy, 3, 2);
        ctx.fillRect(x, fy - 1, 1, 4);
        ctx.fillRect(x - 1, fy + 1, 1, 1);
        ctx.fillRect(x + 1, fy + 1, 1, 1);
        ctx.fillStyle = '#f6e7a9';
        ctx.fillRect(x, fy, 1, 1);
      }
      return c;
    }

    _makeMushroomDeco(variant, glow) {
      const c = U.makeCanvas(16, 16);
      const ctx = c.getContext('2d');
      const rng = new TF.RNG('mush-' + variant + glow);
      const stem = glow ? '#875fa6' : '#d7cfb2';
      const cap = glow ? '#62d4ba' : (variant === 0 ? '#bd4b46' : variant === 1 ? '#bf8445' : '#907e62');
      for (let i = 0; i < 2; i++) {
        const x = 4 + (rng.next() * 8) | 0;
        const h = 3 + (rng.next() * 4) | 0;
        ctx.fillStyle = stem;
        ctx.fillRect(x, 15 - h, 2, h);
        ctx.fillStyle = cap;
        ctx.fillRect(x - 2, 15 - h - 2, 6, 2);
        ctx.fillRect(x - 1, 15 - h - 3, 4, 1);
        if (glow) {
          ctx.fillStyle = '#b9ffe9';
          ctx.fillRect(x, 15 - h - 3, 1, 1);
          ctx.fillStyle = 'rgba(118,255,220,0.25)';
          ctx.fillRect(x - 3, 15 - h - 4, 8, 5);
        } else {
          ctx.fillStyle = '#f3ead2';
          ctx.fillRect(x + 1, 15 - h - 2, 1, 1);
        }
      }
      return c;
    }

    _makeCaveGrassDeco(variant) {
      const c = U.makeCanvas(16, 16);
      const ctx = c.getContext('2d');
      const rng = new TF.RNG('cavegrass-' + variant);
      const colors = ['#4d7352', '#5b8060', '#3f624a'];
      for (let i = 0; i < 4 + variant; i++) {
        const x = 2 + (rng.next() * 12) | 0;
        const h = 2 + (rng.next() * 5) | 0;
        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(x, 15 - h, 1, h);
      }
      return c;
    }

    _makeCrystalDeco(variant) {
      const c = U.makeCanvas(16, 16);
      const ctx = c.getContext('2d');
      const rng = new TF.RNG('crystal-' + variant);
      const colors = ['#9d6ee8', '#6fc5e6', '#d579e5'];
      const col = colors[variant % colors.length];
      for (let i = 0; i < 2; i++) {
        const x = 4 + (rng.next() * 8) | 0;
        const h = 4 + (rng.next() * 6) | 0;
        ctx.fillStyle = col;
        ctx.fillRect(x, 16 - h, 2, h);
        ctx.fillRect(x - 1, 16 - h + 2, 4, 2);
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillRect(x, 16 - h, 1, Math.min(3, h));
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(x + 1, 16 - h + 3, 1, 2);
      }
      return c;
    }

    _makeRockDeco(variant) {
      const c = U.makeCanvas(16, 16);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#585760';
      ctx.fillRect(3, 12, 9, 3);
      ctx.fillStyle = '#73717b';
      ctx.fillRect(4, 11, 7, 2);
      ctx.fillStyle = '#8d8a94';
      ctx.fillRect(5, 11, 3, 1);
      ctx.fillStyle = '#46454d';
      ctx.fillRect(3, 14, 9, 1);
      if (variant === 1) { ctx.fillStyle = '#74633f'; ctx.fillRect(2, 13, 2, 2); }
      return c;
    }
  }

  TF.Renderer = Renderer;
})();
