/* ============================================================
   Terra Frontier — procedural world generation & terrain access
   ============================================================ */
(function () {
  'use strict';
  const TF = window.TF;
  const U = TF.util;
  const T = TF.T;
  const W = TF.W;
  const TILE_DEFS = TF.TILE_DEFS;
  const WALL_DEFS = TF.WALL_DEFS;
  const OBJECT_DEFS = TF.OBJECT_DEFS;
  const SOLID = TF.SOLID;

  const WORLD_W = 1200;
  const WORLD_H = 360;
  const TILE = TF.TILE;

  const BIOME = { FOREST: 0, DESERT: 1, SNOW: 2 };

  class World {
    constructor(seed) {
      this.seedString = String(seed == null ? '' : seed).trim() || String(Date.now());
      this.seedNum = U.hashString(this.seedString);
      this.w = WORLD_W;
      this.h = WORLD_H;
      this.tiles = new Uint8Array(this.w * this.h);
      this.walls = new Uint8Array(this.w * this.h);
      this.surface = new Int16Array(this.w);
      this.biomes = new Uint8Array(this.w);
      this.tileChanges = new Map();
      this.wallChanges = new Map();
      this.objects = [];
      this.objectGrid = new Map();
      this.trees = [];
      this.removedTrees = new Set();
      this.decor = [];
      this._nextObjectId = 1;
      this.spawn = { x: (this.w * 0.5) * TILE, y: 90 * TILE };
      this.guideSpawn = null;
      this.treeVersion = 0;
    }

    idx(x, y) { return y * this.w + x; }
    inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }

    getTile(x, y) {
      if (x < 0 || x >= this.w) return T.STONE;
      if (y < 0) return T.AIR;
      if (y >= this.h) return T.DEEPSTONE;
      return this.tiles[y * this.w + x];
    }
    getTileIndex(i) { return this.tiles[i]; }
    getWall(x, y) {
      if (x < 0 || x >= this.w || y < 0) return W.NONE;
      if (y >= this.h) return W.STONE;
      return this.walls[y * this.w + x];
    }

    setTile(x, y, id, opts = {}) {
      if (!this.inBounds(x, y)) return false;
      const i = y * this.w + x;
      if (this.tiles[i] === id) return false;
      this.tiles[i] = id;
      if (opts.record !== false) this.tileChanges.set(i, id);
      if (opts.surface !== false) this.recomputeSurface(x);
      return true;
    }

    setWall(x, y, id, opts = {}) {
      if (!this.inBounds(x, y)) return false;
      const i = y * this.w + x;
      if (this.walls[i] === id) return false;
      this.walls[i] = id;
      if (opts.record !== false) this.wallChanges.set(i, id);
      return true;
    }

    recomputeSurface(x) {
      if (x < 0 || x >= this.w) return;
      let sy = this.h;
      for (let y = 0; y < this.h; y++) {
        const t = this.tiles[y * this.w + x];
        if (SOLID[t] && !TF.PLATFORM[t]) { sy = y; break; }
      }
      this.surface[x] = sy;
    }

    recomputeAllSurfaces() {
      for (let x = 0; x < this.w; x++) this.recomputeSurface(x);
    }

    isSkyExposed(x, y) { return y < this.surface[x]; }

    biomeAt(x) {
      if (x < 0) x = 0;
      if (x >= this.w) x = this.w - 1;
      return this.biomes[x];
    }
    biomeName(x) { return TF.BIOME_NAMES[this.biomeAt(x)]; }

    // ==========================================================
    // GENERATION
    // ==========================================================
    generate() {
      const rng = new TF.RNG(this.seedString + '::gen');
      const seed = this.seedNum;
      const w = this.w, h = this.h;
      const cx = Math.floor(w * 0.5);

      // --- broad biomes + height ---
      const rawBiome = new Uint8Array(w);
      for (let x = 0; x < w; x++) {
        const jitter = (U.fbm1(x * 0.012, seed + 811, 2) - 0.5) * 0.028;
        const u = x / w + jitter;
        let b;
        if (u < 0.10) b = BIOME.SNOW;
        else if (u < 0.30) b = BIOME.FOREST;
        else if (u < 0.395) b = BIOME.DESERT;
        else if (u < 0.61) b = BIOME.FOREST;
        else if (u < 0.70) b = BIOME.DESERT;
        else if (u < 0.91) b = BIOME.FOREST;
        else b = BIOME.SNOW;
        rawBiome[x] = b;
        this.biomes[x] = b;
      }

      // smooth biome offsets so transitions become gentle slopes
      const offsets = new Float32Array(w);
      for (let x = 0; x < w; x++) {
        offsets[x] = rawBiome[x] === BIOME.DESERT ? -5 : rawBiome[x] === BIOME.SNOW ? 9 : 0;
      }
      const smoothed = new Float32Array(w);
      const radius = 12;
      for (let x = 0; x < w; x++) {
        let sum = 0, n = 0;
        for (let k = -radius; k <= radius; k++) {
          const xx = x + k;
          if (xx >= 0 && xx < w) { sum += offsets[xx]; n++; }
        }
        smoothed[x] = sum / n;
      }

      const baseHeights = new Int16Array(w);
      for (let x = 0; x < w; x++) {
        const big = U.fbm1(x * 0.0042, seed + 13, 5);
        const mid = U.fbm1(x * 0.017, seed + 29, 3);
        const detail = U.fbm1(x * 0.06, seed + 47, 2);
        let hgt = 102 + (big - 0.5) * 40 + (mid - 0.5) * 11 + (detail - 0.5) * 2.5;
        hgt += smoothed[x];
        const b = rawBiome[x];
        if (b === BIOME.DESERT) hgt += (U.fbm1(x * 0.035, seed + 121, 2) - 0.5) * 6;
        if (b === BIOME.SNOW) hgt += (U.valueNoise1(x * 0.026, seed + 211) - 0.5) * 20;
        baseHeights[x] = Math.round(U.clamp(hgt, 66, 152));
      }

      // slight smoothing pass to remove one-tile spikes
      for (let pass = 0; pass < 2; pass++) {
        for (let x = 1; x < w - 1; x++) {
          baseHeights[x] = Math.round((baseHeights[x - 1] + baseHeights[x] * 2 + baseHeights[x + 1]) / 4);
        }
      }

      // --- fill columns ---
      for (let x = 0; x < w; x++) {
        const sy = baseHeights[x];
        this.surface[x] = sy;
        const biome = rawBiome[x];
        const dirtDepth = 5 + Math.floor(U.hash1(x * 3, seed + 311) * 7) +
          (biome === BIOME.DESERT ? 8 : 0) + (biome === BIOME.SNOW ? 2 : 0);
        const topTile = biome === BIOME.DESERT ? T.SAND : biome === BIOME.SNOW ? T.SNOW : T.GRASS;
        for (let y = 0; y < h; y++) {
          const i = y * w + x;
          if (y < sy) {
            this.tiles[i] = T.AIR;
            this.walls[i] = W.NONE;
            continue;
          }
          const depth = y - sy;
          // walls first
          if (depth <= 20 + (biome === BIOME.SNOW ? -5 : 0)) {
            this.walls[i] = W.DIRT;
          } else {
            const wallNoise = U.fbm2(x * 0.03, y * 0.045, seed + 419, 3);
            this.walls[i] = wallNoise > 0.64 ? W.CAVE : W.STONE;
          }
          if (depth > 3 && depth < 20 && U.valueNoise2(x * 0.08, y * 0.11, seed + 541) > 0.70) {
            this.walls[i] = W.CAVE;
          }

          let tile;
          if (depth === 0) {
            tile = topTile;
          } else if (depth <= dirtDepth) {
            if (biome === BIOME.DESERT) tile = depth <= 2 ? T.SAND : T.SANDSTONE;
            else if (biome === BIOME.SNOW) tile = depth <= 1 ? T.SNOW : depth <= dirtDepth ? (U.hash2i(x, y, seed + 2) > 0.80 ? T.ICE : T.DIRT) : T.STONE;
            else tile = T.DIRT;
          } else {
            // patchwork of dirt / moss / deep stone
            const patch = U.fbm2(x * 0.055, y * 0.07, seed + 733, 3);
            const deep = y > 205 + (U.fbm1(x * 0.02, seed + 19, 2) - 0.5) * 48;
            if (deep) tile = T.DEEPSTONE;
            else if (patch > 0.69 && y > 128) tile = T.MOSSSTONE;
            else tile = T.STONE;
            if (biome === BIOME.DESERT && y < sy + 38) tile = y < sy + 25 ? T.SANDSTONE : T.STONE;
            if (biome === BIOME.SNOW && y < sy + 16) tile = y < sy + 8 ? T.SNOW : T.STONE;
            if (!deep && patch < 0.31) tile = T.DIRT;
          }
          this.tiles[i] = tile;
          // bedrock bottom + edges
          if (y >= h - 4) this.tiles[i] = T.DEEPSTONE;
        }
        // seal world edges
        if (x < 3 || x > w - 4) {
          for (let y = sy; y < h; y++) this.tiles[y * w + x] = T.STONE;
        }
      }

      // --- carve caves ---
      for (let x = 4; x < w - 4; x++) {
        const sy = this.surface[x];
        for (let y = sy + 5; y < h - 4; y++) {
          const depth = y - sy;
          if (Math.abs(x - cx) < 10 && depth < 18) continue;
          const i = y * w + x;
          const tile = this.tiles[i];
          if (tile === T.AIR) continue;
          const n = U.fbm2(x * 0.032, y * 0.047, seed + 997, 4);
          const ridge = U.ridged2(x * 0.014, y * 0.026, seed + 1201, 3);
          const deepBias = U.smoothstep(30, 210, depth) * 0.075;
          const t2 = U.fbm2(x * 0.075, y * 0.095, seed + 1327, 2);
          let carve = false;
          if (depth > 8 && n > 0.594 - deepBias) carve = true;
          if (depth > 17 && ridge > 0.836 - deepBias * 0.55 && n > 0.43) carve = true;
          if (depth > 55 && t2 > 0.745) carve = true;
          if (carve) this.tiles[i] = T.AIR;
        }
      }

      // shallow surface pockets occasionally break through for interesting skylines
      for (let k = 0; k < 30; k++) {
        const x = rng.int(20, w - 21);
        if (Math.abs(x - cx) < 26) continue;
        const sy = this.surface[x];
        const radius = rng.int(2, 4);
        for (let dy = 0; dy < radius + 3; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            if (dx * dx + dy * dy <= radius * radius) {
              const xx = x + dx, yy = sy + dy;
              if (yy < h - 5 && yy > sy + 1) this.tiles[yy * w + xx] = T.AIR;
            }
          }
        }
      }

      // --- ores ---
      this._generateOres(rng, seed, rawBiome, cx);
      // --- trees & surface decoration ---
      this._generateFlora(rng, seed, rawBiome, cx);
      // --- cave decoration ---
      this._generateCaveDecor(rng, seed);
      // --- starter glade ---
      this._makeStartGlade(rng, cx, rawBiome[cx]);
      this.recomputeAllSurfaces();
      this.treeVersion++;
      return this;
    }

    _generateOres(rng, seed, rawBiome, cx) {
      const w = this.w, h = this.h;
      const stoneLike = new Set([T.STONE, T.DEEPSTONE, T.MOSSSTONE, T.SANDSTONE, T.SNOW, T.ICE, T.DIRT]);

      const vein = (tileId, x, y, count, radius) => {
        let px = x, py = y;
        for (let i = 0; i < count; i++) {
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              if (dx * dx + dy * dy > radius * radius + 0.5) continue;
              const xx = px + dx, yy = py + dy;
              if (xx < 3 || xx >= w - 3 || yy < 4 || yy >= h - 5) continue;
              const idx = yy * w + xx;
              if (stoneLike.has(this.tiles[idx]) && this.walls[idx] !== W.NONE) {
                this.tiles[idx] = tileId;
              }
            }
          }
          const ang = rng.range(0, Math.PI * 2);
          const len = rng.int(1, 2);
          px = U.clamp(px + Math.round(Math.cos(ang) * len), 4, w - 5);
          py = U.clamp(py + Math.round(Math.sin(ang) * len), 5, h - 6);
          if (this.getTile(px, py) === T.AIR) break;
        }
      };

      const scatter = (tileId, count, minDepth, maxDepth, minCount, maxCount, radius) => {
        for (let i = 0; i < count; i++) {
          for (let tries = 0; tries < 12; tries++) {
            const x = rng.int(6, w - 7);
            const sy = this.surface[x];
            const depth = rng.int(minDepth, maxDepth);
            const y = sy + depth;
            if (y >= h - 8) continue;
            const tile = this.getTile(x, y);
            if (tile === T.AIR) continue;
            if (!stoneLike.has(tile)) continue;
            vein(tileId, x, y, rng.int(minCount, maxCount), radius);
            break;
          }
        }
      };

      // guaranteed starter copper & iron close to spawn
      for (let i = 0; i < 7; i++) {
        const x = cx + rng.int(-45, 45);
        const y = this.surface[x] + rng.int(4, 22);
        vein(T.COPPER, x, y, rng.int(5, 9), rng.int(1, 2));
      }
      for (let i = 0; i < 4; i++) {
        const x = cx + rng.int(-60, 60);
        const y = this.surface[x] + rng.int(14, 42);
        vein(T.IRON, x, y, rng.int(5, 8), rng.int(1, 2));
      }

      scatter(T.COPPER, 210, 4, 82, 3, 8, 2);
      scatter(T.IRON, 155, 16, 145, 3, 7, 2);
      scatter(T.GOLD, 88, 65, 240, 2, 5, 2);
      scatter(T.GEM, 48, 110, 285, 2, 4, 1);
      scatter(T.HEART, 13, 70, 250, 1, 2, 1);

      // a few visible surface ore outcrops
      for (let i = 0; i < 18; i++) {
        const x = rng.int(15, w - 16);
        if (Math.abs(x - cx) < 22) continue;
        const sy = this.surface[x];
        for (let dy = 0; dy < 3; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = sy + dy;
            if (xx < 1 || xx >= w - 1 || yy >= h - 1) continue;
            if (this.tiles[yy * w + xx] !== T.AIR) {
              this.tiles[yy * w + xx] = dy === 0 && rng.chance(0.7) ? T.COPPER : (rng.chance(0.3) ? T.IRON : T.STONE);
            }
          }
        }
      }
    }

    _generateFlora(rng, seed, rawBiome, cx) {
      const w = this.w;
      let treeId = 0;
      this.trees = [];
      for (let x = 7; x < w - 8; x++) {
        const sy = this.surface[x];
        if (sy <= 4 || sy >= this.h - 5) continue;
        const biome = rawBiome[x];
        const top = this.getTile(x, sy);
        const above = this.getTile(x, sy - 1);
        if (above !== T.AIR) continue;
        const nearSpawn = Math.abs(x - cx) < 11;
        const density = biome === BIOME.FOREST ? 0.105 : biome === BIOME.SNOW ? 0.075 : 0.028;
        if (top === T.GRASS && !nearSpawn && rng.next() < density) {
          const height = rng.int(6, 13);
          let clear = true;
          for (let dy = 1; dy <= height + 2; dy++) {
            if (this.getTile(x, sy - dy) !== T.AIR) { clear = false; break; }
          }
          if (clear) {
            this.trees.push({
              id: treeId++, x, y: sy, h: height,
              type: rng.chance(0.28) ? 'birch' : 'oak',
              seed: rng.int(1, 999999),
              hp: height * 21, maxHp: height * 21,
              falling: false, fallT: 0, fallDir: rng.chance(0.5) ? 1 : -1,
              hitFlash: 0,
            });
          }
        } else if (top === T.SAND && !nearSpawn && rng.next() < 0.055) {
          const height = rng.int(2, 5);
          let clear = true;
          for (let dy = 1; dy <= height + 1; dy++) {
            if (this.getTile(x, sy - dy) !== T.AIR) { clear = false; break; }
          }
          if (clear) {
            this.trees.push({
              id: treeId++, x, y: sy, h: height, type: 'cactus', seed: rng.int(1, 999999),
              hp: height * 16, maxHp: height * 16, falling: false, fallT: 0,
              fallDir: rng.chance(0.5) ? 1 : -1, hitFlash: 0,
            });
          }
        } else if (top === T.SNOW && !nearSpawn && rng.next() < 0.070) {
          const height = rng.int(5, 10);
          let clear = true;
          for (let dy = 1; dy <= height + 1; dy++) {
            if (this.getTile(x, sy - dy) !== T.AIR) { clear = false; break; }
          }
          if (clear) {
            this.trees.push({
              id: treeId++, x, y: sy, h: height, type: 'pine', seed: rng.int(1, 999999),
              hp: height * 19, maxHp: height * 19, falling: false, fallT: 0,
              fallDir: rng.chance(0.5) ? 1 : -1, hitFlash: 0,
            });
          }
        }
      }

      // ground plants
      for (let x = 5; x < w - 5; x++) {
        const sy = this.surface[x];
        const top = this.getTile(x, sy);
        if (top !== T.GRASS) continue;
        if (this.getTile(x, sy - 1) !== T.AIR) continue;
        const r = rng.next();
        if (r < 0.44) {
          this.decor.push({ type: 'grass', x, y: sy - 1, variant: rng.int(0, 3), phase: rng.range(0, 7) });
        } else if (r < 0.49) {
          this.decor.push({ type: 'flower', x, y: sy - 1, variant: rng.int(0, 4), phase: rng.range(0, 7) });
        } else if (r < 0.505) {
          this.decor.push({ type: 'rock', x, y: sy - 1, variant: rng.int(0, 2), phase: rng.range(0, 7) });
        }
      }
    }

    _generateCaveDecor(rng, seed) {
      const w = this.w, h = this.h;
      let placed = 0;
      for (let attempt = 0; attempt < 1800 && placed < 420; attempt++) {
        const x = rng.int(8, w - 9);
        const y = rng.int(this.surface[x] + 8, h - 8);
        if (this.getTile(x, y) !== T.AIR) continue;
        const below = this.getTile(x, y + 1);
        const above = this.getTile(x, y - 1);
        if (SOLID[below] && !SOLID[above]) {
          const depth = y - this.surface[x];
          const r = rng.next();
          if (r < 0.52) {
            this.decor.push({ type: 'mushroom', x, y, variant: rng.int(0, 2), phase: rng.range(0, 7) });
          } else if (r < 0.65 && depth > 45) {
            this.decor.push({ type: 'glowshroom', x, y, variant: rng.int(0, 1), phase: rng.range(0, 7) });
          } else if (r < 0.80) {
            this.decor.push({ type: 'cavegrass', x, y, variant: rng.int(0, 3), phase: rng.range(0, 7) });
          } else if (r < 0.92 && depth > 60) {
            this.decor.push({ type: 'crystal', x, y, variant: rng.int(0, 2), phase: rng.range(0, 7) });
          } else {
            this.decor.push({ type: 'pebble', x, y, variant: rng.int(0, 2), phase: rng.range(0, 7) });
          }
          placed++;
        } else if (SOLID[above] && !SOLID[below] && rng.chance(0.55)) {
          this.decor.push({ type: 'vine', x, y, variant: rng.int(0, 2), phase: rng.range(0, 7), len: rng.int(2, 7) });
          placed++;
        }
      }
    }

    _makeStartGlade(rng, cx, biome) {
      // flatten a small meadow for the initial camp, then let its edges ebb back into the wild
      const y0 = this.surface[cx];
      const oldSurfaces = this.surface.slice();
      const topTile = biome === BIOME.DESERT ? T.SAND : T.GRASS;
      const radius = 15;
      for (let x = cx - radius; x <= cx + radius; x++) {
        if (x < 3 || x >= this.w - 4) continue;
        const dist = Math.abs(x - cx);
        let targetY = y0;
        if (dist > 8) {
          const t = U.smoothstep(8, radius, dist);
          targetY = Math.round(U.lerp(y0, oldSurfaces[x], t));
        }
        for (let y = 0; y < targetY; y++) this.tiles[y * this.w + x] = T.AIR;
        for (let y = targetY; y < this.h; y++) {
          if (y === targetY) this.tiles[y * this.w + x] = topTile;
          else if (y <= targetY + 4) this.tiles[y * this.w + x] = biome === BIOME.DESERT ? T.SANDSTONE : T.DIRT;
          else if (this.tiles[y * this.w + x] === T.AIR) this.tiles[y * this.w + x] = T.STONE;
        }
        // keep some natural wall only beneath ground
        for (let y = targetY + 1; y < this.h; y++) {
          if (this.walls[y * this.w + x] === W.NONE) this.walls[y * this.w + x] = W.DIRT;
        }
        this.surface[x] = targetY;
      }
      // clear trees and plants from the glade
      this.trees = this.trees.filter(t => Math.abs(t.x - cx) > 14);
      this.decor = this.decor.filter(d => Math.abs(d.x - cx) > 13 || d.y < y0 - 2);
      // a couple of decorative flowers at the edge
      this.decor.push({ type: 'flower', x: cx - 7, y: y0 - 1, variant: 1, phase: rng.range(0, 7) });
      this.decor.push({ type: 'grass', x: cx + 6, y: y0 - 1, variant: 2, phase: rng.range(0, 7) });
      this.spawn = { x: (cx + 0.5) * TILE, y: y0 * TILE };
      this.guideSpawn = { x: (cx + 4.5) * TILE, y: y0 * TILE };
      this.startSurfaceY = y0;
    }

    // ==========================================================
    // OBJECTS
    // ==========================================================
    addObject(type, x, y, opts = {}) {
      const def = OBJECT_DEFS[type];
      if (!def) return null;
      const obj = {
        id: this._nextObjectId++, type, x, y, w: def.w, h: def.h,
        open: !!opts.open, openAnim: opts.open ? 1 : 0,
        hitFlash: 0, animSeed: Math.random() * 100, def,
      };
      this.objects.push(obj);
      for (let yy = y; yy < y + def.h; yy++) {
        for (let xx = x; xx < x + def.w; xx++) {
          this.objectGrid.set(this.idx(xx, yy), obj);
        }
      }
      return obj;
    }

    objectAtCell(x, y) {
      if (!this.inBounds(x, y)) return null;
      return this.objectGrid.get(this.idx(x, y)) || null;
    }

    objectAtPixel(px, py) {
      const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
      const obj = this.objectAtCell(tx, ty);
      if (!obj) return null;
      const bounds = this.objectBounds(obj);
      return U.pointInRect(px, py, bounds.x, bounds.y, bounds.w, bounds.h) ? obj : null;
    }

    objectBounds(obj) {
      return { x: obj.x * TILE, y: obj.y * TILE, w: obj.w * TILE, h: obj.h * TILE };
    }

    removeObject(obj) {
      if (!obj) return null;
      const idx = this.objects.indexOf(obj);
      if (idx >= 0) this.objects.splice(idx, 1);
      for (let yy = obj.y; yy < obj.y + obj.h; yy++) {
        for (let xx = obj.x; xx < obj.x + obj.w; xx++) {
          if (this.objectGrid.get(this.idx(xx, yy)) === obj) this.objectGrid.delete(this.idx(xx, yy));
        }
      }
      return obj.def.drop || null;
    }

    isObjectSolidAt(x, y) {
      const o = this.objectAtCell(x, y);
      if (!o) return false;
      if (o.def.door && o.open) return false;
      return !!o.def.solid;
    }

    canPlaceObject(type, x, y) {
      const def = OBJECT_DEFS[type];
      if (!def) return false;
      if (x < 1 || y < 1 || x + def.w > this.w - 1 || y + def.h > this.h - 1) return false;
      for (let yy = y; yy < y + def.h; yy++) {
        for (let xx = x; xx < x + def.w; xx++) {
          if (SOLID[this.getTile(xx, yy)]) return false;
          if (this.objectAtCell(xx, yy)) return false;
        }
      }
      if (type === 'torch') {
        const adj = SOLID[this.getTile(x - 1, y)] || SOLID[this.getTile(x + 1, y)] ||
          SOLID[this.getTile(x, y - 1)] || SOLID[this.getTile(x, y + 1)] || this.getWall(x, y) !== W.NONE;
        return !!adj;
      }
      if (type === 'door') {
        const floor = SOLID[this.getTile(x, y + def.h)];
        return !!floor;
      }
      // all other furniture needs a solid floor under every occupied column
      for (let xx = x; xx < x + def.w; xx++) {
        if (!SOLID[this.getTile(xx, y + def.h)]) return false;
      }
      return true;
    }

    toggleDoor(obj) {
      if (!obj || !obj.def.door) return false;
      obj.open = !obj.open;
      return obj.open;
    }

    // ==========================================================
    // TREES
    // ==========================================================
    treeTrunkRect(tree) {
      const baseY = tree.y * TILE;
      const topY = baseY - tree.h * TILE;
      const cx = tree.x * TILE + TILE * 0.5;
      const width = tree.type === 'cactus' ? 10 : (tree.type === 'pine' ? 11 : 9);
      return { x: cx - width / 2, y: topY, w: width, h: baseY - topY + TILE * 0.5 };
    }

    treeAtPixel(px, py) {
      for (let i = this.trees.length - 1; i >= 0; i--) {
        const t = this.trees[i];
        if (t.falling) continue;
        const r = this.treeTrunkRect(t);
        if (px >= r.x - 4 && px <= r.x + r.w + 4 && py >= r.y && py <= r.y + r.h) return t;
      }
      return null;
    }

    damageTree(tree, amount) {
      if (!tree || tree.falling) return false;
      tree.hp -= amount;
      tree.hitFlash = 1;
      if (tree.hp <= 0) {
        tree.falling = true;
        tree.fallT = 0;
        this.removedTrees.add(tree.id);
        return true;
      }
      return false;
    }

    updateTrees(dt) {
      for (let i = this.trees.length - 1; i >= 0; i--) {
        const t = this.trees[i];
        if (t.hitFlash > 0) t.hitFlash = Math.max(0, t.hitFlash - dt * 5);
        if (t.falling) {
          t.fallT += dt;
          if (t.fallT > 1.8) this.trees.splice(i, 1);
        }
      }
    }

    // ==========================================================
    // COLLISION / HELPERS
    // ==========================================================
    isSolidCell(x, y) {
      if (x < 0 || x >= this.w) return true;
      if (y < 0) return false;
      if (y >= this.h) return true;
      const t = this.tiles[y * this.w + x];
      if (SOLID[t] && !TF.PLATFORM[t]) return true;
      return this.isObjectSolidAt(x, y);
    }

    isPlatformCell(x, y) {
      if (x < 0 || x >= this.w || y < 0 || y >= this.h) return false;
      return !!TF.PLATFORM[this.tiles[y * this.w + x]];
    }

    isSolidPixel(px, py) {
      return this.isSolidCell(Math.floor(px / TILE), Math.floor(py / TILE));
    }

    /** Find a safe surface camp near a column. */
    surfaceTop(x) {
      if (x < 0) x = 0;
      if (x >= this.w) x = this.w - 1;
      return this.surface[x];
    }

    findSpawnColumnNear(playerX, minDist, maxDist, rng, requireOpenSky = true) {
      const px = Math.floor(playerX / TILE);
      for (let tries = 0; tries < 40; tries++) {
        const dir = rng && rng.chance(0.5) ? -1 : 1;
        const d = (rng ? rng.int(minDist, maxDist) : minDist) * dir;
        const x = px + d;
        if (x < 8 || x >= this.w - 8) continue;
        const sy = this.surface[x];
        if (sy < 4 || sy >= this.h - 4) continue;
        const ground = this.getTile(x, sy);
        if (!SOLID[ground]) continue;
        if (this.getTile(x, sy - 1) !== T.AIR || this.getTile(x, sy - 2) !== T.AIR) continue;
        if (this.objectAtCell(x, sy - 1) || this.objectAtCell(x, sy - 2)) continue;
        return { x: x * TILE + TILE / 2, y: sy * TILE };
      }
      return null;
    }

    findGroundBelow(x, fromY) {
      const tx = U.clamp(Math.floor(x / TILE), 0, this.w - 1);
      let ty = U.clamp(Math.floor(fromY / TILE), 0, this.h - 1);
      for (; ty < this.h; ty++) {
        if (SOLID[this.getTile(tx, ty)]) return ty * TILE;
      }
      return this.h * TILE;
    }

    canStandAtPixel(px, py, width, height) {
      const x0 = Math.floor((px - width / 2) / TILE);
      const x1 = Math.floor((px + width / 2 - 0.01) / TILE);
      const y0 = Math.floor(py / TILE);
      const y1 = Math.floor((py + height - 0.01) / TILE);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (this.isSolidCell(x, y)) return false;
        }
      }
      return true;
    }

    /** returns light-emitting objects/decor near the viewport */
    collectLightSources(minX, minY, maxX, maxY) {
      const out = [];
      for (const o of this.objects) {
        if (!o.def.light) continue;
        if (o.x + o.w < minX || o.x > maxX || o.y + o.h < minY || o.y > maxY) continue;
        out.push({
          x: o.x + o.w * 0.5, y: o.y + o.h * 0.4,
          level: o.def.light, color: o.type === 'furnace' ? '#ff9b52' : '#ffc06b',
          flicker: o.type === 'furnace' || o.type === 'campfire' ? 1 : 0.45,
          seed: o.animSeed,
        });
      }
      for (const d of this.decor) {
        if (d.x < minX || d.x > maxX || d.y < minY || d.y > maxY) continue;
        if (d.type === 'glowshroom') {
          out.push({ x: d.x + 0.5, y: d.y + 0.4, level: 5.5, color: '#7ee2c0', flicker: 0.2, seed: d.phase });
        } else if (d.type === 'crystal') {
          out.push({ x: d.x + 0.5, y: d.y + 0.45, level: 4.2, color: '#b48bff', flicker: 0.25, seed: d.phase });
        }
      }
      return out;
    }

    // ==========================================================
    // SAVE / LOAD
    // ==========================================================
    serialize() {
      const objs = this.objects.map(o => ({ type: o.type, x: o.x, y: o.y, open: !!o.open }));
      return {
        seed: this.seedString,
        tiles: Array.from(this.tileChanges.entries()),
        walls: Array.from(this.wallChanges.entries()),
        objects: objs,
        treesRemoved: Array.from(this.removedTrees),
      };
    }

    applySave(data) {
      if (!data) return;
      // tiles
      if (Array.isArray(data.tiles)) {
        for (const [i, id] of data.tiles) {
          if (i >= 0 && i < this.tiles.length) {
            this.tiles[i] = id;
            this.tileChanges.set(i, id);
          }
        }
      }
      if (Array.isArray(data.walls)) {
        for (const [i, id] of data.walls) {
          if (i >= 0 && i < this.walls.length) {
            this.walls[i] = id;
            this.wallChanges.set(i, id);
          }
        }
      }
      if (Array.isArray(data.treesRemoved)) {
        const set = new Set(data.treesRemoved);
        this.removedTrees = set;
        this.trees = this.trees.filter(t => !set.has(t.id));
      }
      this.recomputeAllSurfaces();
      if (Array.isArray(data.objects)) {
        this.objects = [];
        this.objectGrid.clear();
        for (const o of data.objects) {
          if (!OBJECT_DEFS[o.type]) continue;
          this.addObject(o.type, o.x, o.y, { open: !!o.open });
        }
      }
      this.treeVersion++;
    }
  }

  World.WORLD_W = WORLD_W;
  World.WORLD_H = WORLD_H;
  World.BIOME = BIOME;
  TF.World = World;
  TF.WORLD_W = WORLD_W;
  TF.WORLD_H = WORLD_H;
})();
