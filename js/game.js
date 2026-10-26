/* ============================================================
   Terra Frontier — simulation, input, progression
   ============================================================ */
(function () {
  'use strict';
  const TF = window.TF;
  const U = TF.util;
  const T = TF.T;
  const W = TF.W;
  const TILE = TF.TILE;
  const ITEMS = TF.ITEMS;
  const SOLID = TF.SOLID;

  // ==========================================================
  // INVENTORY
  // ==========================================================
  class Inventory {
    constructor(source) {
      this.slots = new Array(40).fill(null);
      if (Array.isArray(source)) {
        for (let i = 0; i < Math.min(40, source.length); i++) {
          const s = source[i];
          if (s && ITEMS[s.id] && s.count > 0) this.slots[i] = { id: s.id, count: Math.min(s.count, ITEMS[s.id].stack || 999) };
        }
      }
    }

    add(id, count = 1) {
      const item = ITEMS[id];
      if (!item) return count;
      const max = item.stack || 999;
      let remaining = count;
      for (let i = 0; i < this.slots.length && remaining > 0; i++) {
        const s = this.slots[i];
        if (s && s.id === id && s.count < max) {
          const take = Math.min(remaining, max - s.count);
          s.count += take;
          remaining -= take;
        }
      }
      for (let i = 0; i < this.slots.length && remaining > 0; i++) {
        if (!this.slots[i]) {
          const take = Math.min(remaining, max);
          this.slots[i] = { id, count: take };
          remaining -= take;
        }
      }
      return remaining;
    }

    count(id) {
      let total = 0;
      for (const s of this.slots) if (s && s.id === id) total += s.count;
      return total;
    }

    consume(id, count) {
      if (this.count(id) < count) return false;
      let remaining = count;
      for (let i = this.slots.length - 1; i >= 0 && remaining > 0; i--) {
        const s = this.slots[i];
        if (!s || s.id !== id) continue;
        const take = Math.min(remaining, s.count);
        s.count -= take;
        remaining -= take;
        if (s.count <= 0) this.slots[i] = null;
      }
      return true;
    }

    consumeFrom(index, count) {
      const s = this.slots[index];
      if (!s) return false;
      if (s.count < count) return false;
      s.count -= count;
      if (s.count <= 0) this.slots[index] = null;
      return true;
    }

    serialize() {
      return this.slots.map(s => (s ? { id: s.id, count: s.count } : null));
    }

    firstEmpty() {
      return this.slots.findIndex(s => !s);
    }
  }

  // ==========================================================
  // GAME
  // ==========================================================
  class Game {
    constructor() {
      this.canvas = document.getElementById('game-canvas');
      this.renderer = new TF.Renderer(this.canvas);
      this.audio = TF.audio;
      this.state = 'title';
      this.elapsed = 0;
      this.playTime = 0;
      this.day = 1;
      this.hours = 8;
      this.dayFactor = 1;
      this.nightFactor = 0;
      this.isNight = false;
      this.skyLight = 15;

      this.world = null;
      this.player = null;
      this.guide = null;
      this.enemies = [];
      this.drops = [];
      this.projectiles = [];
      this.inventory = new Inventory();
      this.hotbarIndex = 0;
      this.heldStack = null;
      this.discovered = new Set();

      this.particles = new TF.ParticleSystem(800);
      this.floatingTexts = new TF.FloatingTexts();
      this.ambient = new TF.Ambient();

      this.camera = { x: 0, y: 0, shakeX: 0, shakeY: 0, shakeMag: 0, shakeTime: 0, shakeDur: 0.2 };
      this.mouseScreen = { x: this.renderer.w / 2, y: this.renderer.h / 2 };
      this.mouseWorld = { x: 0, y: 0 };
      this.clientMouse = { x: innerWidth / 2, y: innerHeight / 2 };
      this.target = null;
      this.placePreview = null;
      this.mining = null;
      this.cursorActive = false;
      this.cursorTone = '#f5e6b5';
      this.uiHint = '';
      this.placeCooldown = 0;
      this.messageCooldown = 0;
      this.enemyTimer = 4;
      this.autoSaveTimer = 0;
      this.deathTimer = 0;
      this.shelterTimer = 0;
      this.weather = { rain: 0, target: 0, wind: 0, flash: 0, nextLightning: 12 };
      this._rainAnnounced = false;
      this._musicMode = 'day';
      this._phaseInit = false;
      this.lastIsNight = false;
      this.tutorial = {};
      this.tutorialTimer = 1.2;
      this.groanTimer = 6;
      this.rainSfxTimer = 0;
      this._saveFailed = false;
      this.timeParams = null;

      this.input = {
        keys: new Set(),
        justPressed: new Set(),
        left: false,
        right: false,
        leftPressed: false,
        rightPressed: false,
      };

      this.ui = new TF.UI(this);
      this.bindEvents();
      this.renderer.drawTitle(0);
      this.lastFrame = performance.now();
      this._loop = this._loop.bind(this);
      requestAnimationFrame(this._loop);

      window.__terraGame = this;
      TF.game = this;

      this._maybeAutoStart();
    }

    // ==========================================================
    // BOOT / SAVE
    // ==========================================================
    _maybeAutoStart() {
      const params = new URLSearchParams(location.search);
      if (params.get('autostart') === '1') {
        const seed = params.get('seed') || '晨雾-2048';
        const time = parseFloat(params.get('time') || '');
        this.timeParams = Number.isFinite(time) ? time : null;
        this.ui.el.title.classList.add('hidden');
        this.ui.showLoading('正在塑造世界');
        setTimeout(() => this.startNew(seed), 90);
      }
    }

    randomSeed() {
      const words = ['苔原', '晨雾', '琥珀', '月影', '青石', '暮色', '松林', '赤铜', '星落', '荒野', '石桥', '晚风'];
      const a = words[Math.floor(Math.random() * words.length)];
      const b = words[Math.floor(Math.random() * words.length)];
      const n = 100 + Math.floor(Math.random() * 900);
      return `${a}${b}-${n}`;
    }

    startNew(seed) {
      seed = (seed || '').trim() || this.randomSeed();
      try {
        this.ui.showLoading('正在让群山隆起，让洞穴呼吸……');
        this.world = new TF.World(seed);
        this.world.generate();
        this.spawnRng = new TF.RNG(this.world.seedString + '::spawn::' + Date.now());
        this.inventory = new Inventory(TF.STARTING_INVENTORY);
        this.hotbarIndex = 0;
        this.heldStack = null;
        this.discovered = new Set(this.inventory.slots.filter(Boolean).map(s => s.id));
        this.day = 1;
        this.hours = this.timeParams != null ? this.timeParams : 8;
        this.playTime = 0;
        this.deathTimer = 0;
        this.state = 'playing';
        this.cursorActive = true;
        this.particles = new TF.ParticleSystem(800);
        this.floatingTexts = new TF.FloatingTexts();
        this.ambient = new TF.Ambient();
        this.enemies = [];
        this.drops = [];
        this.projectiles = [];
        this.mining = null;
        this.placePreview = null;
        this.target = null;
        this.heldStack = null;
        this.weather = { rain: 0, target: 0, wind: 0, flash: 0, nextLightning: 14 };
        this._rainAnnounced = false;
        this.enemyTimer = 4;
        this.autoSaveTimer = 0;
        this.placeCooldown = 0;
        this.messageCooldown = 0;
        this.tutorial = {};
        this.tutorialTimer = 4.0;
        this.groanTimer = 6;
        this._saveFailed = false;
        this._lastSafe = false;

        this.player = new TF.Player(this.world, this.world.spawn.x, this.world.spawn.y);
        this.player.spawnX = this.world.spawn.x;
        this.player.spawnY = this.world.spawn.y;
        this.player.maxHp = 100;
        this.player.hp = 100;
        this.player.kills = 0;
        this.player.x = this.world.spawn.x - this.player.w / 2;
        this.player.y = this.world.spawn.y - this.player.h;
        this.player.invuln = 1.5;
        this._setupGuide(true);

        this.recomputeTime();
        this.lastIsNight = this.isNight;
        this._phaseInit = true;
        this._rollWeather(true);
        this.snapCamera();
        this.ui.enterGame();
        this.ui.hideLoading();
        this.ui.updateHud(true);
        this.audio.init();
        this.audio.startMusic(this.isNight ? 'night' : 'day');
        this._musicMode = this.isNight ? 'night' : 'day';
        this.saveGame(false);
        setTimeout(() => {
          if (this.state === 'playing') this.ui.combo('第 1 天');
        }, 450);
        this.ui.toast('世界种子：' + this.world.seedString + '　·　世界会自动保存在本机', 'good', 3400);
        this.ui.flashScreen('#000', 0.55);
      } catch (err) {
        console.error('World generation failed', err);
        this.state = 'title';
        this.ui.hideLoading();
        this.ui.el.title.classList.remove('hidden', 'fade-out');
        document.body.classList.add('title-mode');
        this.ui.toast('世界生成失败：' + err.message, 'warn', 8000);
      }
    }

    continueGame() {
      const save = U.storageGet(TF.SAVE_KEY, null);
      if (!save || !save.world || !save.world.seed) {
        this.startNew();
        return;
      }
      try {
        this.ui.showLoading('正在唤醒你的旧日营地……');
        this.world = new TF.World(save.world.seed);
        this.world.generate();
        this.world.applySave(save.world);
        this.spawnRng = new TF.RNG(this.world.seedString + '::spawn::' + Date.now());
        this.inventory = new Inventory(save.inventory);
        this.hotbarIndex = U.clamp(save.hotbarIndex || 0, 0, 9);
        this.heldStack = null;
        this.discovered = new Set(this.inventory.slots.filter(Boolean).map(s => s.id));
        this.day = Math.max(1, save.day || 1);
        this.hours = Number.isFinite(save.hours) ? save.hours : 8;
        this.playTime = Math.max(0, save.playTime || 0);
        this.weather = Object.assign({ rain: 0, target: 0, wind: 0, flash: 0, nextLightning: 14 }, save.weather || {});
        this._rainAnnounced = this.weather.rain > 0.12;
        this.state = 'playing';
        this.cursorActive = true;
        this.particles = new TF.ParticleSystem(800);
        this.floatingTexts = new TF.FloatingTexts();
        this.ambient = new TF.Ambient();
        this.enemies = [];
        this.drops = [];
        this.projectiles = [];
        this.mining = null;
        this.placePreview = null;
        this.target = null;
        this.enemyTimer = 4;
        this.autoSaveTimer = 0;
        this.placeCooldown = 0;
        this.messageCooldown = 0;
        this.deathTimer = 0;
        this.tutorial = save.tutorial || { initial: true, wood: true, bench: true, night: true };
        this.tutorialTimer = 999;
        this.groanTimer = 6;
        this._saveFailed = false;
        this._lastSafe = false;

        const p = save.player || {};
        const px = Number.isFinite(p.x) ? p.x : this.world.spawn.x;
        const py = Number.isFinite(p.y) ? p.y : this.world.spawn.y;
        this.player = new TF.Player(this.world, px, py);
        this.player.spawnX = this.world.spawn.x;
        this.player.spawnY = this.world.spawn.y;
        this.player.maxHp = U.clamp(p.maxHp || 100, 100, 200);
        this.player.hp = U.clamp(p.hp || this.player.maxHp, 1, this.player.maxHp);
        this.player.kills = p.kills || 0;
        this.player.x = px - this.player.w / 2;
        this.player.y = py - this.player.h;
        this.player.invuln = 1.5;
        // make sure we did not reload inside solid rock
        if (!this.world.canStandAtPixel(this.player.centerX(), this.player.y, this.player.w, this.player.h)) {
          const ground = this.world.findGroundBelow(this.world.spawn.x, 0);
          this.player.x = this.world.spawn.x - this.player.w / 2;
          this.player.y = ground - this.player.h;
        }
        this._setupGuide(false);
        this.recomputeTime();
        this.lastIsNight = this.isNight;
        this._phaseInit = true;
        this.snapCamera();
        this.state = 'playing';
        this.ui.enterGame();
        this.ui.hideLoading();
        this.ui.updateHud(true);
        this.audio.init();
        this.audio.startMusic(this.isNight ? 'night' : 'day');
        this._musicMode = this.isNight ? 'night' : 'day';
        this.ui.toast('欢迎回来，旅人。', 'good', 4500);
        this.ui.flashScreen('#000', 0.4);
      } catch (err) {
        console.error('Load failed', err);
        this.ui.hideLoading();
        this.ui.toast('存档读取失败，正在创建新世界。', 'warn', 5000);
        this.startNew();
      }
    }

    _setupGuide(nearPlayer) {
      let gx;
      if (nearPlayer) gx = this.world.spawn.x + 76;
      else gx = Math.abs(this.player.centerX() - this.world.spawn.x) < 100 * TILE ? this.player.centerX() + 64 : this.world.spawn.x + 76;
      gx = U.clamp(gx, 40, this.world.w * TILE - 40);
      const gy = this.world.findGroundBelow(gx, 0);
      const gxp = gx - 7;
      const gyp = gy - 38;
      this.guide = new TF.Guide(this.world, gxp, gyp);
      this.guide.homeX = gx;
      // guarantee the guide starts on solid ground
      if (!this.world.canStandAtPixel(gx, gyp, 14, 38)) {
        const fallback = this.world.spawn.x + 48;
        const fy = this.world.findGroundBelow(fallback, 0);
        this.guide.x = fallback - 7;
        this.guide.y = fy - 38;
        this.guide.homeX = fallback;
      }
    }

    saveGame(manual = false) {
      if (!this.world || !this.player) return false;
      try {
        const data = {
          version: 1,
          meta: {
            seed: this.world.seedString,
            day: this.day,
            hours: this.hours,
            playTime: this.playTime,
            savedAt: Date.now(),
          },
          world: this.world.serialize(),
          player: {
            x: this.player.centerX(),
            y: this.player.y + this.player.h,
            hp: this.player.hp,
            maxHp: this.player.maxHp,
            kills: this.player.kills,
          },
          inventory: this.inventory.serialize(),
          hotbarIndex: this.hotbarIndex,
          day: this.day,
          hours: this.hours,
          playTime: this.playTime,
          weather: this.weather,
          tutorial: this.tutorial,
        };
        const ok = U.storageSet(TF.SAVE_KEY, data);
        if (!ok) {
          if (!this._saveFailed) {
            this._saveFailed = true;
            this.ui.toast('无法写入存档（浏览器存储空间不足）。', 'warn', 6000);
          }
          return false;
        }
        this._saveFailed = false;
        if (manual) this.audio.save();
        return true;
      } catch (err) {
        console.error('Save failed', err);
        if (!this._saveFailed) {
          this._saveFailed = true;
          this.ui.toast('存档失败：' + err.message, 'warn', 6000);
        }
        return false;
      }
    }

    quitToTitle() {
      this.saveGame(false);
      this.state = 'title';
      this.cursorActive = false;
      this.audio.stopMusic();
      this.ui.returnToTitle();
      this.renderer.drawTitle(this.elapsed);
    }

    // ==========================================================
    // INPUT
    // ==========================================================
    bindEvents() {
      const canvas = this.canvas;
      window.addEventListener('keydown', e => {
        const tag = (e.target && e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
        if (!e.repeat) this.input.justPressed.add(e.code);
        this.input.keys.add(e.code);
        this.handleHotkeys(e);
      });
      window.addEventListener('keyup', e => {
        this.input.keys.delete(e.code);
      });
      canvas.addEventListener('pointerdown', e => {
        if (this.state !== 'playing') return;
        this.audio.init();
        this.updateClientMouse(e);
        if (e.button === 0) {
          this.input.left = true;
          this.input.leftPressed = true;
        } else if (e.button === 2) {
          this.input.right = true;
          this.input.rightPressed = true;
        }
      });
      window.addEventListener('pointerup', e => {
        if (e.button === 0) this.input.left = false;
        if (e.button === 2) this.input.right = false;
      });
      window.addEventListener('pointermove', e => {
        this.updateClientMouse(e);
      });
      canvas.addEventListener('wheel', e => {
        if (this.state !== 'playing') return;
        e.preventDefault();
        const dir = e.deltaY > 0 ? 1 : -1;
        this.selectHotbar((this.hotbarIndex + dir + 10) % 10);
      }, { passive: false });
      window.addEventListener('contextmenu', e => e.preventDefault());
      window.addEventListener('resize', () => {
        this.renderer.resize();
        if (this.player) this.snapCamera();
        this.ui.resize();
      });
      window.addEventListener('blur', () => {
        this.input.left = false;
        this.input.right = false;
        this.input.keys.clear();
        if (this.state === 'playing') this.openPauseMenu();
      });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.state === 'playing') this.openPauseMenu();
      });
      window.addEventListener('beforeunload', () => {
        if (this.world && this.player && this.state !== 'title') this.saveGame(false);
      });
    }

    updateClientMouse(e) {
      this.clientMouse.x = e.clientX;
      this.clientMouse.y = e.clientY;
      this._updateMouseFromClient();
    }

    _updateMouseFromClient() {
      const rect = this.canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const nx = (this.clientMouse.x - rect.left) / rect.width;
      const ny = (this.clientMouse.y - rect.top) / rect.height;
      this.mouseScreen.x = U.clamp(nx * this.renderer.w, 0, this.renderer.w);
      this.mouseScreen.y = U.clamp(ny * this.renderer.h, 0, this.renderer.h);
      this.mouseWorld.x = this.mouseScreen.x + this.camera.x + this.camera.shakeX;
      this.mouseWorld.y = this.mouseScreen.y + this.camera.y + this.camera.shakeY;
    }

    handleHotkeys(e) {
      const code = e.code;
      if (code === 'KeyM') {
        this.ui.toggleMute();
        return;
      }
      if (code === 'Escape') {
        if (!this.ui.el.help.classList.contains('hidden')) { this.ui.closeHelp(); return; }
        if (!this.ui.el.confirm.classList.contains('hidden')) {
          this.ui.el.confirm.classList.add('hidden');
          this.ui.uiOpen = false;
          document.body.classList.remove('ui-cursor');
          return;
        }
        if (this.state === 'inventory') { this.ui.closeInventory(); return; }
        if (this.state === 'paused') { this.resumeGame(); return; }
        if (this.state === 'playing') { this.openPauseMenu(); return; }
        return;
      }
      if (!this.ui.el.help.classList.contains('hidden')) return;
      if (this.state === 'inventory') {
        if (code === 'KeyE' || code === 'KeyI') this.ui.closeInventory();
        return;
      }
      if (this.state === 'paused') {
        if (code === 'KeyH' || code === 'F1') this.ui.openHelp('pause');
        return;
      }
      if (this.state === 'playing') {
        if (code === 'KeyE' || code === 'KeyI') { this.ui.openInventory(); return; }
        if (code === 'KeyH' || code === 'F1') {
          this.openPauseMenu();
          this.ui.openHelp('pause');
          return;
        }
        if (/^Digit[0-9]$/.test(code)) {
          const n = Number(code.slice(5));
          this.selectHotbar(n === 0 ? 9 : n - 1);
        }
      }
      if (this.state === 'dead') {
        if ((code === 'Space' || code === 'Enter') && this.deathTimer < 1.0) this.respawnPlayer();
      }
    }

    selectHotbar(index) {
      if (!this.inventory) return;
      index = U.clamp(index | 0, 0, 9);
      if (this.hotbarIndex === index) return;
      this.hotbarIndex = index;
      this.mining = null;
      this.placeCooldown = 0;
      this.ui.updateHotbarSelection();
      const item = this.selectedItem();
      this.ui.el.itemName.textContent = item ? item.name : '空手';
      this.audio.click();
    }

    selectedItem() {
      if (!this.inventory) return null;
      const stack = this.inventory.slots[this.hotbarIndex];
      return stack ? ITEMS[stack.id] : null;
    }

    openPauseMenu() {
      if (this.state !== 'playing') return;
      this.state = 'paused';
      this.cursorActive = false;
      this.input.left = false;
      this.input.right = false;
      this.ui.showPause();
      this.audio.click();
    }

    resumeGame() {
      if (this.state !== 'paused') return;
      this.ui.el.pause.classList.add('hidden');
      this.ui.el.help.classList.add('hidden');
      this.ui.uiOpen = false;
      document.body.classList.remove('ui-cursor');
      this.state = 'playing';
      this.cursorActive = true;
      this.audio.click();
    }

    // ==========================================================
    // LOOP
    // ==========================================================
    _loop(now) {
      const dt = Math.min(0.033, Math.max(0, (now - this.lastFrame) / 1000));
      this.lastFrame = now;
      this.elapsed += dt;
      if (this.state === 'playing') {
        this.update(dt);
      } else if (this.state === 'dead') {
        this.updateDead(dt);
      }
      this.render(dt);
      this.input.justPressed.clear();
      this.input.leftPressed = false;
      this.input.rightPressed = false;
      requestAnimationFrame(this._loop);
    }

    render(dt) {
      if (this.state === 'title' || !this.world) {
        this.renderer.drawTitle(this.elapsed);
      } else {
        this.renderer.draw(this, dt);
      }
    }

    updateDead(dt) {
      this.deathTimer = Math.max(0, this.deathTimer - dt);
      this.ui.updateDeathTimer(this.deathTimer);
      this.particles.update(dt);
      this.floatingTexts.update(dt);
      this.ambient.update(dt, this);
      if (this.deathTimer <= 0) this.respawnPlayer();
    }

    // ==========================================================
    // UPDATE
    // ==========================================================
    update(dt) {
      if (!this.player || !this.world) return;
      this.playTime += dt;
      this.autoSaveTimer += dt;
      this.placeCooldown = Math.max(0, this.placeCooldown - dt);
      this.messageCooldown = Math.max(0, this.messageCooldown - dt);

      this.updateTime(dt);
      this.updateWeather(dt);

      const input = this.input.keys;
      const jumpPressed = this.input.justPressed.has('Space') || this.input.justPressed.has('KeyW') || this.input.justPressed.has('ArrowUp');
      const moveInput = {
        left: input.has('KeyA') || input.has('ArrowLeft'),
        right: input.has('KeyD') || input.has('ArrowRight'),
        down: input.has('KeyS') || input.has('ArrowDown'),
        jump: input.has('Space') || input.has('KeyW') || input.has('ArrowUp'),
        jumpPressed,
      };
      this.player.update(dt, moveInput, this);
      if (this.player.dead) return;
      if (this.player.safeHouse !== this._lastSafe) {
        this._lastSafe = this.player.safeHouse;
        if (this.player.safeHouse) {
          this.ui.toast('你感受到了一阵安心：封闭的房间形成了庇护所。', 'good', 4200);
        }
      }

      this.world.updateTrees(dt);
      this.updateEnemies(dt);
      if (this.player.dead) return;
      this.updateGuide(dt);
      this.updateDrops(dt);
      this.updateProjectiles(dt);
      this.particles.update(dt);
      this.floatingTexts.update(dt);
      this.ambient.update(dt, this);
      this.updateCamera(dt);
      this._updateMouseFromClient();
      this.updateTargetAndAim();
      this.processRightClick();
      if (this.state === 'playing') this.processPrimary(dt);
      this.updateSpawning(dt);
      this.updateTutorials(dt);
      this.updateCameraShake(dt);
      this.updateUi();
      this.rainSfxTimer += dt;
      if (this.rainSfxTimer > 1) { this.rainSfxTimer = 0; this.audio.setRain(this.weather.rain); }
      this.updateMusicMode();
      if (this.autoSaveTimer > 45) {
        this.autoSaveTimer = 0;
        this.saveGame(false);
      }
      if (jumpPressed) this.input.justPressed.delete('Space');
    }

    updateUi() {
      this.ui.updateHud();
    }

    // ==========================================================
    // TIME
    // ==========================================================
    updateTime(dt) {
      const prev = this.hours;
      let nh = this.hours + dt * TF.HOURS_PER_SECOND;
      if (nh >= 24) nh -= 24;
      this.hours = nh;
      if (prev < 4.5 && nh >= 4.5) {
        this.day++;
        this.onNewDay();
      }
      this.recomputeTime();
      if (this._phaseInit && this.isNight !== this.lastIsNight) {
        this.lastIsNight = this.isNight;
        if (this.isNight) this.onNightfall();
        else this.onDawn();
      }
    }

    recomputeTime() {
      this.dayFactor = U.clamp(
        U.smoothstep(4.4, 7.1, this.hours) * (1 - U.smoothstep(17.4, 19.8, this.hours)),
        0, 1
      );
      this.nightFactor = 1 - this.dayFactor;
      this.isNight = this.hours >= 19.5 || this.hours < 4.5;
      const rainDim = this.weather ? this.weather.rain * 2.2 : 0;
      this.skyLight = U.clamp(3.5 + 11.5 * this.dayFactor - rainDim, 1.6, 15);
    }

    onNewDay() {
      this.rollWeather();
      this.saveGame(false);
    }

    onNightfall() {
      this.ui.combo('夜幕降临');
      this.ui.toast('僵尸开始在地表游荡。关好门，或用剑守住你的营地。', 'warn', 6500);
      this.audio.setMusicMode('night');
      this._musicMode = 'night';
      this.tutorial.night = true;
      this.enemyTimer = 3;
      this.groanTimer = 2;
    }

    onDawn() {
      this.ui.combo('黎明');
      this.audio.setMusicMode('day');
      this._musicMode = 'day';
      this.ui.toast(`第 ${this.day} 天。晨光驱散了怪物，你活过了这个夜晚。`, 'good', 5200);
    }

    updateMusicMode() {
      const mode = this.isNight ? 'night' : 'day';
      if (mode !== this._musicMode) {
        this._musicMode = mode;
        this.audio.setMusicMode(mode);
      }
    }

    // ==========================================================
    // WEATHER
    // ==========================================================
    _rollWeather(initial = false) {
      if (initial) {
        this.weather.target = 0;
        this.weather.wind = 0;
        return;
      }
      const r = U.hash2i(this.day, 7231, this.world.seedNum);
      let target = 0;
      if (this.day > 1 && r > 0.70) target = 0.45 + U.hash2i(this.day, 811, this.world.seedNum) * 0.45;
      this.weather.target = target;
      this.weather.wind = (U.hash2i(this.day, 117, this.world.seedNum) - 0.5) * 1.4;
      this.weather.nextLightning = U.lerp(9, 24, Math.random());
      if (target > 0.2) this.ui.toast('远处传来潮湿的雷声，今天可能会下雨。', '', 4500);
    }

    updateWeather(dt) {
      const w = this.weather;
      w.rain = U.approach(w.rain, w.target, dt * 0.055);
      if (w.rain > 0.16 && !this._rainAnnounced) {
        this._rainAnnounced = true;
        this.ui.toast('下雨了。雨声会盖住一些夜晚的危险。', '', 4200);
      }
      if (w.rain < 0.04 && this._rainAnnounced) {
        this._rainAnnounced = false;
        this.ui.toast('雨停了。', '', 3000);
      }
      if (w.flash > 0) w.flash = Math.max(0, w.flash - dt * 2.6);
      if (w.rain > 0.45) {
        w.nextLightning -= dt;
        if (w.nextLightning <= 0) {
          w.nextLightning = U.lerp(8, 22, Math.random());
          w.flash = 0.9;
          this.audio.noise({ dur: 1.6, vol: 0.16, freq: 240, type: 'lowpass', endFreq: 70 });
          this.audio.tone({ freq: 52, endFreq: 30, dur: 1.8, type: 'sine', vol: 0.11 });
        }
      }
      this.recomputeTime();
    }

    // ==========================================================
    // CAMERA / INPUT AIM
    // ==========================================================
    snapCamera() {
      if (!this.player) return;
      const w = this.renderer.w, h = this.renderer.h;
      const worldPxW = this.world.w * TILE, worldPxH = this.world.h * TILE;
      this.camera.x = U.clamp(this.player.centerX() - w / 2, 0, Math.max(0, worldPxW - w));
      this.camera.y = U.clamp(this.player.centerY() - h * 0.54, 0, Math.max(0, worldPxH - h));
      this.camera.shakeX = 0;
      this.camera.shakeY = 0;
      this._updateMouseFromClient();
    }

    updateCamera(dt) {
      const w = this.renderer.w, h = this.renderer.h;
      const worldPxW = this.world.w * TILE, worldPxH = this.world.h * TILE;
      const tx = U.clamp(this.player.centerX() - w / 2, 0, Math.max(0, worldPxW - w));
      const ty = U.clamp(this.player.centerY() - h * 0.54, 0, Math.max(0, worldPxH - h));
      const k = 1 - Math.exp(-dt * 8);
      this.camera.x += (tx - this.camera.x) * k;
      this.camera.y += (ty - this.camera.y) * k;
    }

    shake(mag, dur = 0.2) {
      if (mag > this.camera.shakeMag || this.camera.shakeTime <= 0) {
        this.camera.shakeMag = mag;
        this.camera.shakeDur = Math.max(0.05, dur);
      }
      this.camera.shakeTime = Math.max(this.camera.shakeTime, dur);
    }

    updateCameraShake(dt) {
      const c = this.camera;
      if (c.shakeTime > 0) {
        c.shakeTime = Math.max(0, c.shakeTime - dt);
        const f = c.shakeDur > 0 ? clamp01(c.shakeTime / c.shakeDur) : 0;
        c.shakeX = Math.sin(this.playTime * 127) * c.shakeMag * f;
        c.shakeY = Math.cos(this.playTime * 191) * c.shakeMag * 0.7 * f;
      } else {
        c.shakeX = 0;
        c.shakeY = 0;
        c.shakeMag = 0;
      }
    }

    // ==========================================================
    // TARGETING / PREVIEW
    // ==========================================================
    updateTargetAndAim() {
      this._updateMouseFromClient();
      this.player.setAim(this.mouseWorld.x, this.mouseWorld.y);
      this.target = this._buildTarget();
      const item = this.selectedItem();
      this.placePreview = item ? this._buildPlacePreview(item) : null;
      this.uiHint = this._buildHint(item);
      this.cursorTone = this.placePreview
        ? (this.placePreview.valid ? '#9bea80' : '#ef7a67')
        : (this.target && this.target.object ? '#f4d47b' : '#f5e6b5');
    }

    _buildTarget() {
      const wx = this.mouseWorld.x, wy = this.mouseWorld.y;
      const tx = Math.floor(wx / TILE);
      const ty = Math.floor(wy / TILE);
      const object = this.world.objectAtPixel(wx, wy);
      const tree = object ? null : this.world.treeAtPixel(wx, wy);
      let guideNear = false;
      let guideDist = 9999;
      if (this.guide) {
        const b = { x: this.guide.x - 10, y: this.guide.y - 8, w: this.guide.w + 20, h: this.guide.h + 10 };
        guideNear = wx >= b.x && wx <= b.x + b.w && wy >= b.y && wy <= b.y + b.h;
        guideDist = U.dist(this.player.centerX(), this.player.centerY(), this.guide.centerX(), this.guide.centerY());
      }
      const tile = this.world.inBounds(tx, ty) ? this.world.getTile(tx, ty) : T.AIR;
      const wall = this.world.inBounds(tx, ty) ? this.world.getWall(tx, ty) : W.NONE;
      let reachDist = U.dist(this.player.centerX(), this.player.centerY(), (tx + 0.5) * TILE, (ty + 0.5) * TILE);
      if (object) {
        const b = this.world.objectBounds(object);
        const nx = U.clamp(this.player.centerX(), b.x, b.x + b.w);
        const ny = U.clamp(this.player.centerY(), b.y, b.y + b.h);
        reachDist = U.dist(this.player.centerX(), this.player.centerY(), nx, ny);
      } else if (tree) {
        reachDist = U.dist(this.player.centerX(), this.player.centerY(), tree.x * TILE + 8, tree.y * TILE - tree.h * TILE * 0.45);
      }
      return {
        wx, wy, tx, ty, tile, wall, object, tree, guideNear, guideDist,
        reachDist, inReach: reachDist <= 7.4 * TILE,
        tileSolid: !!SOLID[tile],
        tileCenterX: (tx + 0.5) * TILE,
        tileCenterY: (ty + 0.5) * TILE,
      };
    }

    _buildPlacePreview(item) {
      if (!item) return null;
      if (item.kind === 'block') {
        const tx = this.target.tx, ty = this.target.ty;
        if (!this.world.inBounds(tx, ty)) return null;
        const valid = this.target.inReach && this.canPlaceBlock(tx, ty);
        return { kind: 'block', x: tx, y: ty, tileId: item.block, valid };
      }
      if (item.kind === 'wall') {
        const tx = this.target.tx, ty = this.target.ty;
        if (!this.world.inBounds(tx, ty)) return null;
        const valid = this.target.inReach && this.canPlaceWall(tx, ty);
        return { kind: 'wall', x: tx, y: ty, wallId: item.wall, valid };
      }
      if (item.kind === 'placeable' && item.place) {
        const def = TF.OBJECT_DEFS[item.place];
        if (!def) return null;
        let tx = this.target.tx, ty = this.target.ty;
        if (item.place !== 'torch') {
          if (SOLID[this.world.getTile(tx, ty)] || this.world.objectAtCell(tx, ty)) ty -= 1;
          const bottom = ty;
          tx = tx - Math.floor((def.w - 1) / 2);
          ty = bottom - def.h + 1;
        } else {
          if (SOLID[this.world.getTile(tx, ty)]) ty -= 1;
        }
        if (!this.world.inBounds(tx, ty) || tx + def.w > this.world.w || ty + def.h > this.world.h) return null;
        let valid = this.target.inReach && this.world.canPlaceObject(item.place, tx, ty);
        if (valid && def.door) {
          const pb = { x: this.player.x, y: this.player.y, w: this.player.w, h: this.player.h };
          const ob = { x: tx * TILE, y: ty * TILE, w: def.w * TILE, h: def.h * TILE };
          if (U.pointInRect(pb.x, pb.y, ob.x, ob.y, ob.w, ob.h) ||
            pb.x < ob.x + ob.w && pb.x + pb.w > ob.x && pb.y < ob.y + ob.h && pb.y + pb.h > ob.y) valid = false;
        }
        if (valid) {
          // never place furniture through the player's body
          const ob = { x: tx * TILE, y: ty * TILE, w: def.w * TILE, h: def.h * TILE };
          if (this.player.x < ob.x + ob.w && this.player.x + this.player.w > ob.x &&
            this.player.y < ob.y + ob.h && this.player.y + this.player.h > ob.y) {
            if (def.door) valid = false;
          }
          // no tree trunk inside the footprint
          for (let yy = ty; yy < ty + def.h && valid; yy++) {
            for (let xx = tx; xx < tx + def.w && valid; xx++) {
              if (this.world.treeAtPixel((xx + 0.5) * TILE, (yy + 0.5) * TILE)) valid = false;
            }
          }
        }
        return { kind: 'object', x: tx, y: ty, objectType: item.place, valid };
      }
      return null;
    }

    canPlaceBlock(tx, ty) {
      if (!this.world.inBounds(tx, ty)) return false;
      if (this.world.getTile(tx, ty) !== T.AIR) return false;
      if (this.world.objectAtCell(tx, ty)) return false;
      if (this.world.treeAtPixel((tx + 0.5) * TILE, (ty + 0.5) * TILE)) return false;
      // don't entomb the player
      const px = tx * TILE, py = ty * TILE;
      if (this.player.x < px + TILE && this.player.x + this.player.w > px && this.player.y < py + TILE && this.player.y + this.player.h > py) return false;
      // must touch something
      const neighbors = [
        [tx - 1, ty], [tx + 1, ty], [tx, ty - 1], [tx, ty + 1],
      ];
      for (const [x, y] of neighbors) {
        if (!this.world.inBounds(x, y)) continue;
        if (SOLID[this.world.getTile(x, y)] || TF.PLATFORM[this.world.getTile(x, y)]) return true;
        if (this.world.getWall(x, y) !== W.NONE) return true;
        if (this.world.objectAtCell(x, y)) return true;
      }
      if (this.world.getWall(tx, ty) !== W.NONE) return true;
      return false;
    }

    canPlaceWall(tx, ty) {
      if (!this.world.inBounds(tx, ty)) return false;
      if (SOLID[this.world.getTile(tx, ty)]) return false;
      if (this.world.getWall(tx, ty) !== W.NONE) return false;
      const near = [
        [tx - 1, ty], [tx + 1, ty], [tx, ty - 1], [tx, ty + 1],
      ];
      for (const [x, y] of near) {
        if (!this.world.inBounds(x, y)) continue;
        if (this.world.getWall(x, y) !== W.NONE) return true;
        if (SOLID[this.world.getTile(x, y)]) return true;
        if (this.world.objectAtCell(x, y)) return true;
      }
      return false;
    }

    _buildHint(item) {
      const t = this.target;
      if (!t) return '';
      const hints = [];
      const right = [];
      if (t.guideNear && t.guideDist < 6 * TILE) right.push('与向导交谈');
      if (t.object) {
        if (t.object.def.door && t.inReach) right.push(t.object.open ? '关门' : '开门');
        else if (t.object.def.station && t.inReach) right.push('使用' + t.object.def.name);
      }
      if (t.wall !== W.NONE && !t.tileSolid && t.inReach) right.push('拆除背景墙');
      if (item) {
        if (item.kind === 'block') {
          hints.push(this.placePreview ? (this.placePreview.valid ? '放置 ' + item.name : '无法放在这里') : '距离太远');
        } else if (item.kind === 'wall') {
          hints.push(this.placePreview ? (this.placePreview.valid ? '铺设 ' + item.name : '无法铺在这里') : '距离太远');
        } else if (item.kind === 'placeable') {
          hints.push(this.placePreview ? (this.placePreview.valid ? '放置 ' + item.name : '这里放不下') : '距离太远');
        } else if (item.kind === 'tool') {
          const tileName = t.tileSolid && TF.TILE_DEFS[t.tile] ? TF.TILE_DEFS[t.tile].name : '方块';
          if (t.object && t.inReach) hints.push('拆除 ' + t.object.def.name);
          else if (t.tree && t.inReach) hints.push(item.tool === 'axe' ? '砍伐树木' : '需要斧头');
          else if (t.tileSolid && t.inReach) hints.push(item.tool === 'pick' ? '挖掘' + tileName : '需要镐子');
          else if (!t.inReach) hints.push('目标太远');
        } else if (item.kind === 'weapon') {
          hints.push(item.weapon === 'bow' ? '左键 · 射击' : item.weapon === 'magic' ? '左键 · 施法' : '左键 · 挥砍');
        } else if (item.kind === 'consumable') {
          hints.push('左键 · 使用 ' + item.name);
        } else if (item.kind === 'ammo') {
          hints.push('需要一把弓');
        }
      } else {
        hints.push('空手');
      }
      if (right.length) {
        if (hints.length) return hints[0] + '　|　右键 · ' + right[0];
        return '右键 · ' + right[0];
      }
      return hints[0] || '';
    }

    // ==========================================================
    // PRIMARY / MINING / PLACING
    // ==========================================================
    processPrimary(dt) {
      if (!this.input.left && !this.input.leftPressed) { this.mining = null; return; }
      const item = this.selectedItem();
      if (!item) return;
      if (item.kind === 'tool') {
        this.mineWithTool(dt, item);
      } else if (item.kind === 'weapon') {
        if (this.player.attackCooldown <= 0) this.attack(item);
      } else if (item.kind === 'block' || item.kind === 'wall' || item.kind === 'placeable') {
        if (this.placeCooldown <= 0 && this.placePreview) {
          if (this.placePreview.valid) this.placeSelected(item);
          else if (this.input.leftPressed) this.warn(this.placePreview.kind === 'object' ? '这里没有足够的空间或地面。' : '必须挨着已有的方块或背景墙放置。');
        }
      } else if (item.kind === 'consumable') {
        if (this.input.leftPressed) {
          this.useConsumable(item);
        }
      }
    }

    mineWithTool(dt, item) {
      const t = this.target;
      if (!t) { this.mining = null; return; }
      if (!t.inReach) {
        this.mining = null;
        return;
      }
      if (t.object) {
        this.mineObject(dt, item, t);
        return;
      }
      if (t.tree) {
        this.mineTree(dt, item, t);
        return;
      }
      if (t.tileSolid && t.tile !== T.AIR) {
        this.mineTile(dt, item, t);
        return;
      }
      this.mining = null;
    }

    _ensureMining(kind, key, extra = {}) {
      if (!this.mining || this.mining.kind !== kind || this.mining.key !== key) {
        this.mining = Object.assign({
          kind, key, progress: 0, tx: this.target.tx, ty: this.target.ty,
          soundTimer: 0, particleTimer: 0,
        }, extra);
      }
      return this.mining;
    }

    mineTile(dt, item, t) {
      if (item.tool !== 'pick') {
        this.mining = null;
        if (this.input.leftPressed) this.warn('需要镐子才能挖开石块。');
        return;
      }
      const def = TF.TILE_DEFS[t.tile];
      if (!def || !def.solid && !def.platform) { this.mining = null; return; }
      if (item.tier < (def.tier || 1)) {
        this.mining = null;
        if (this.messageCooldown <= 0) this.warn('这块矿石太硬了，需要更好的镐子。');
        return;
      }
      if (this._lineBlocked(this.player.centerX(), this.player.centerY(), t.tileCenterX, t.tileCenterY, t.tx, t.ty)) {
        this.mining = null;
        return;
      }
      const m = this._ensureMining('tile', t.tx + ',' + t.ty);
      m.tx = t.tx; m.ty = t.ty;
      const duration = Math.max(0.08, (def.hardness || 0.3) * 1.22 / item.power);
      m.progress += dt / duration;
      this._miningFx(dt, m, t.tile, t.tileCenterX, t.tileCenterY);
      if (m.progress >= 1) {
        this.breakTile(t.tx, t.ty);
        this.mining = null;
      }
    }

    mineObject(dt, item, t) {
      if (!item || (item.tool !== 'pick' && item.tool !== 'axe')) {
        this.mining = null;
        return;
      }
      const obj = t.object;
      const m = this._ensureMining('object', obj.id, { objectId: obj.id });
      const duration = (obj.def.door ? 0.5 : obj.def.furnace ? 0.7 : 0.34) / item.power;
      m.progress += dt / duration;
      m.tx = obj.x; m.ty = obj.y;
      this._miningFx(dt, m, T.PLANK, (obj.x + obj.w / 2) * TILE, (obj.y + obj.h / 2) * TILE);
      if (m.progress >= 1) {
        const drop = this.world.removeObject(obj);
        this.particles.burst((obj.x + obj.w / 2) * TILE, (obj.y + obj.h / 2) * TILE, 12, ['#9b6b3d', '#d2b06d', '#573a20'], {
          speed: 100, life: 0.55, size: 2, gravity: 520,
        });
        if (drop) this.spawnDrop(drop, 1, (obj.x + obj.w / 2) * TILE, (obj.y + obj.h / 2) * TILE);
        this.audio.breakBlock('wood');
        this.mining = null;
        this.ui.updateHotbar();
      }
    }

    mineTree(dt, item, t) {
      if (item.tool !== 'axe') {
        this.mining = null;
        if (this.input.leftPressed) this.warn('树木需要斧头才能砍倒。');
        return;
      }
      const tree = t.tree;
      const m = this._ensureMining('tree', tree.id, { treeId: tree.id, tree });
      const duration = Math.max(0.6, (0.55 + tree.h * 0.075) / item.power);
      m.progress += dt / duration;
      m.tx = tree.x; m.ty = tree.y - 1;
      this._miningFx(dt, m, T.PLANK, tree.x * TILE + 8, tree.y * TILE - tree.h * TILE * 0.4, true);
      if (m.progress >= 1) {
        this.fellTree(tree);
        this.mining = null;
      }
    }

    _miningFx(dt, m, tile, x, y, tree = false) {
      m.soundTimer -= dt;
      m.particleTimer -= dt;
      if (this.player.swingT <= 0.01) {
        this.player.swingT = 0.25;
        this.player.swingDuration = 0.25;
        this.player.swingKind = 'swing';
        this.player.useFlash = 1;
      }
      if (m.soundTimer <= 0) {
        m.soundTimer = 0.20;
        const mat = tree ? 'wood' : (tile === T.STONE || tile === T.DEEPSTONE || tile === T.MOSSSTONE ? 'stone' : (tile === T.COPPER || tile === T.IRON || tile === T.GOLD || tile === T.GEM ? 'ore' : (tile === T.PLANK ? 'wood' : 'dirt')));
        this.audio.dig(mat);
      }
      if (m.particleTimer <= 0) {
        m.particleTimer = 0.13;
        if (tree) {
          this.particles.burst(x + U.lerp(-4, 4, Math.random()), y, 2, ['#4f7a35', '#6e9b47', '#9a6b35'], {
            speed: 38, life: 0.72, size: 1.5, gravity: 120, glow: false,
          });
        } else {
          this.particles.blockBurst(tile, x + U.lerp(-5, 5, Math.random()), y + U.lerp(-4, 4, Math.random()));
        }
      }
    }

    breakTile(tx, ty) {
      const tile = this.world.getTile(tx, ty);
      if (tile === T.AIR) return;
      const def = TF.TILE_DEFS[tile];
      const drop = TF.tileDrop(tile);
      const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
      if (this.world.treeAtPixel(cx, cy)) return;
      this.world.setTile(tx, ty, T.AIR);
      this.removeDecorAt(tx, ty);
      this.particles.blockBurst(tile, cx, cy);
      this.audio.breakBlock(tile === T.STONE || tile === T.DEEPSTONE ? 'stone' : (tile === T.COPPER || tile === T.IRON || tile === T.GOLD || tile === T.GEM ? 'ore' : (tile === T.PLANK || tile === T.PLATFORM ? 'wood' : 'dirt')));
      if (drop) this.spawnDrop(drop.id, drop.count, cx, cy, { vx: U.lerp(-25, 25, Math.random()), vy: -85 });
      this.shake(1.3, 0.08);
      this.ui.updateHotbar();
    }

    fellTree(tree) {
      const cx = tree.x * TILE + 8;
      const baseY = tree.y * TILE;
      this.audio.breakBlock('wood');
      this.shake(3, 0.22);
      for (let i = 0; i < 26; i++) {
        this.particles.spawn({
          x: cx + U.lerp(-30, 30, Math.random()),
          y: baseY - U.lerp(20, tree.h * TILE, Math.random()),
          vx: U.lerp(-65, 65, Math.random()),
          vy: U.lerp(-100, -15, Math.random()),
          life: U.lerp(0.5, 1.3, Math.random()),
          size: U.lerp(1, 2.4, Math.random()),
          color: Math.random() < 0.6 ? '#54853d' : '#75a54c',
          gravity: 260, drag: 0.5,
        });
      }
      const amount = tree.type === 'cactus' ? 2 + Math.floor(Math.random() * 2) : tree.h + (tree.type === 'oak' ? 1 : 0);
      let remaining = amount;
      let parts = 0;
      while (remaining > 0 && parts < 3) {
        const take = parts === 2 ? remaining : Math.ceil(remaining / (3 - parts));
        this.spawnDrop('wood', take, cx + U.lerp(-8, 8, Math.random()), baseY - 12, { vx: U.lerp(-50, 50, Math.random()), vy: -130 });
        remaining -= take;
        parts++;
      }
      this.world.damageTree(tree, tree.hp + 1);
      this.ui.toast(`获得木材 ×${amount}`, 'good', 2600);
    }

    attack(item) {
      const p = this.player;
      p.attackCooldown = item.useTime || 0.4;
      p.useFlash = 1;
      if (item.weapon === 'swing' || item.weapon === 'stab') {
        p.swingDuration = item.useTime || 0.4;
        p.swingT = p.swingDuration;
        p.swingKind = item.weapon;
        this.audio[item.weapon === 'stab' ? 'stab' : 'swing']();
        let hits = 0;
        const ox = p.centerX(), oy = p.y + 17;
        for (const e of this.enemies) {
          if (e.dead) continue;
          const ex = e.x + e.w / 2, ey = e.y + e.h / 2;
          const d = U.dist(ox, oy, ex, ey);
          if (d > item.reach + Math.max(e.w, e.h) * 0.3) continue;
          const ang = Math.atan2(ey - oy, ex - ox);
          let diff = Math.abs(U.angleDiff(p.aimAngle, ang));
          if (item.weapon === 'swing' && diff > 1.55) continue;
          if (item.weapon === 'stab' && diff > 0.72) continue;
          if (this._lineBlocked(ox, oy, ex, ey, -1, -1, false)) continue;
          const crit = Math.random() < 0.11;
          const dmg = item.damage * (crit ? 1.6 : 1);
          e.hurt(dmg, ex >= ox ? 1 : -1, this, crit);
          hits++;
        }
        if (hits) {
          this.shake(2.5, 0.12);
        }
        this.particles.burst(ox + Math.cos(p.aimAngle) * (item.reach * 0.55), oy + Math.sin(p.aimAngle) * (item.reach * 0.55), 2, ['#fff0c2', '#d9c684'], {
          speed: 45, life: 0.2, size: 1.2, gravity: 100,
        });
      } else if (item.weapon === 'bow') {
        if (this.inventory.count('arrow') < 1) {
          this.warn('没有箭了。用木材和石块在工作台旁制作木箭。');
          p.attackCooldown = 0.55;
          return;
        }
        this.inventory.consume('arrow', 1);
        const a = p.aimAngle;
        const sx = p.centerX() + Math.cos(a) * 10;
        const sy = p.y + 17 + Math.sin(a) * 10;
        const speed = 665;
        this.projectiles.push(new TF.Projectile('arrow', sx, sy, Math.cos(a) * speed, Math.sin(a) * speed, item.damage + (ITEMS.arrow.damage || 0), {
          gravity: 360, life: 3.2, radius: 3, pierce: 0,
        }));
        this.audio.bow();
        p.swingDuration = 0.3; p.swingT = 0.3; p.swingKind = 'swing';
        this.ui.updateHotbar();
      } else if (item.weapon === 'magic') {
        const a = p.aimAngle;
        const sx = p.centerX() + Math.cos(a) * 10;
        const sy = p.y + 17 + Math.sin(a) * 10;
        this.projectiles.push(new TF.Projectile('magic', sx, sy, Math.cos(a) * 350, Math.sin(a) * 350, item.damage, {
          gravity: 0, life: 1.8, radius: 6, pierce: 2, color: '#d59cff',
        }));
        this.audio.magic();
        this.particles.burst(sx, sy, 5, ['#b56be4', '#e9bdff', '#7e4db4'], {
          speed: 55, life: 0.35, size: 1.5, gravity: -30, glow: true,
        });
        p.swingDuration = 0.3; p.swingT = 0.3; p.swingKind = 'swing';
      }
    }

    useConsumable(item) {
      if (item.use === 'heal') {
        if (this.player.hp >= this.player.maxHp) {
          this.warn('生命值已满。');
          return;
        }
        if (this.inventory.consume(item.id, 1)) {
          this.player.heal(item.heal || 20, this);
          this.ui.updateHotbar();
        }
      } else if (item.use === 'heart') {
        if (this.player.maxHp >= 200) {
          this.warn('你的生命上限已经达到了极限。');
          return;
        }
        if (this.inventory.consume(item.id, 1)) {
          this.player.maxHp = Math.min(200, this.player.maxHp + 20);
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + 20);
          this.audio.levelUp();
          this.particles.burst(this.player.centerX(), this.player.centerY(), 18, ['#ff9caf', '#ffd3dc', '#d95f78'], {
            speed: 85, life: 0.9, size: 2, gravity: -50, glow: true,
          });
          this.ui.toast(`生命上限提升至 ${this.player.maxHp}！`, 'good', 4500);
          this.ui.updateHud(true);
          this.ui.updateHotbar();
        }
      }
    }

    placeSelected(item) {
      const prev = this.placePreview;
      if (!prev || !prev.valid) return;
      if (item.kind === 'block') {
        if (!this.inventory.consumeFrom(this.hotbarIndex, 1)) return;
        this.world.setTile(prev.x, prev.y, item.block);
        this.removeDecorAt(prev.x, prev.y);
        this.particles.burst((prev.x + 0.5) * TILE, (prev.y + 0.5) * TILE, 5, TF.TILE_DEFS[item.block].palette ? [TF.TILE_DEFS[item.block].palette.base, TF.TILE_DEFS[item.block].palette.light] : ['#fff'], {
          speed: 35, life: 0.3, size: 1.3, gravity: 230,
        });
        this.audio.place();
        this.placeCooldown = 0.11;
        this.ui.updateHotbar();
      } else if (item.kind === 'wall') {
        if (!this.inventory.consumeFrom(this.hotbarIndex, 1)) return;
        this.world.setWall(prev.x, prev.y, item.wall);
        this.particles.burst((prev.x + 0.5) * TILE, (prev.y + 0.5) * TILE, 3, ['#7d5a3c', '#4e3729'], {
          speed: 25, life: 0.28, size: 1.2, gravity: 150,
        });
        this.audio.place();
        this.placeCooldown = 0.09;
        this.ui.updateHotbar();
      } else if (item.kind === 'placeable') {
        const def = TF.OBJECT_DEFS[item.place];
        if (!def) return;
        if (!this.inventory.consumeFrom(this.hotbarIndex, 1)) return;
        const obj = this.world.addObject(item.place, prev.x, prev.y);
        this.particles.burst((prev.x + def.w / 2) * TILE, (prev.y + def.h / 2) * TILE, 5, ['#8f6c43', '#c09d60'], {
          speed: 40, life: 0.35, size: 1.4, gravity: 220,
        });
        this.audio.place();
        this.placeCooldown = 0.2;
        this.ui.updateHotbar();
        if (item.place === 'workbench' && !this.tutorial.bench) {
          this.tutorial.bench = true;
          this.ui.toast('工作台已放下。靠近它，按 E 打开合成。', 'tutorial', 6000);
        }
      }
    }

    processRightClick() {
      if (!this.input.rightPressed) return;
      const t = this.target;
      if (!t) return;
      if (t.guideNear && t.guideDist < 6 * TILE) {
        this.talkToGuide();
        return;
      }
      if (t.object && t.inReach) {
        if (t.object.def.door) {
          this.toggleDoor(t.object);
          return;
        }
        if (t.object.def.station) {
          this.ui.openInventory();
          return;
        }
      }
      if (t.wall !== W.NONE && !t.tileSolid && t.inReach) {
        this.removeWall(t.tx, t.ty);
      }
    }

    toggleDoor(obj) {
      if (!obj.def.door || !obj) return;
      if (obj.open) {
        const b = this.world.objectBounds(obj);
        if (this.player.x < b.x + b.w && this.player.x + this.player.w > b.x &&
          this.player.y < b.y + b.h && this.player.y + this.player.h > b.y) {
          this.warn('你正站在门口，先把脚挪开。');
          return;
        }
        obj.open = false;
        this.audio.door(false);
      } else {
        obj.open = true;
        this.audio.door(true);
      }
      obj.openAnim = obj.open ? 1 : 0;
      this.uiHint = '';
    }

    removeWall(tx, ty) {
      if (!this.world.inBounds(tx, ty)) return;
      const wall = this.world.getWall(tx, ty);
      if (!wall) return;
      if (SOLID[this.world.getTile(tx, ty)]) return;
      const def = TF.WALL_DEFS[wall];
      this.world.setWall(tx, ty, W.NONE);
      this.particles.burst((tx + 0.5) * TILE, (ty + 0.5) * TILE, 7, def.palette ? [def.palette.base, def.palette.light, def.palette.dark] : ['#888'], {
        speed: 55, life: 0.42, size: 1.6, gravity: 300,
      });
      if (def.item) this.spawnDrop(def.item, 1, (tx + 0.5) * TILE, (ty + 0.5) * TILE);
      this.audio.breakBlock('stone');
      this.ui.updateHotbar();
    }

    removeDecorAt(tx, ty) {
      const decor = this.world.decor;
      for (let i = decor.length - 1; i >= 0; i--) {
        if (decor[i].x === tx && decor[i].y === ty) decor.splice(i, 1);
      }
    }

    talkToGuide() {
      const lines = [];
      if (this.isNight) {
        lines.push('天黑之后，僵尸会撞门。木门能挡住它们——但别开着门睡觉。');
        lines.push('如果屋子又黑又小，先在门边放一支火把。光会让你安心。');
      }
      if (!this.inventory.count('wood')) {
        lines.push('先用斧头砍树。木材是这片土地给你的第一份礼物。');
      } else if (!this.hasStation('workbench')) {
        lines.push('十块木材能做一张工作台。按 E 打开背包，把材料凑齐吧。');
      }
      if (this.player.depth > 20) {
        lines.push('地下越深，矿石越好，也越容易迷路。沿着自己挖的路回来。');
      }
      lines.push('世界种子是「' + this.world.seedString + '」。每片大地都不一样。');
      lines.push('生命水晶可以永久提升生命上限。它们通常藏在很深的地方。');
      lines.push('把火把插在墙上、门前和矿道拐角；黑暗里总有些东西在动。');
      const line = lines[Math.floor(Math.random() * lines.length)];
      this.guide.say(line);
      this.audio.talk();
      this.ui.toast('向导：' + line, 'tutorial', 6200);
    }

    // ==========================================================
    // DROPS / ENEMIES / PROJECTILES
    // ==========================================================
    spawnDrop(id, count, x, y, opts = {}) {
      if (!ITEMS[id] || count <= 0) return;
      const d = new TF.ItemDrop(id, count, x, y, opts);
      this.drops.push(d);
    }

    updateDrops(dt) {
      for (const d of this.drops) if (!d.dead) d.update(dt, this);
      this.drops = this.drops.filter(d => !d.dead);
    }

    onItemCollected(id, count) {
      this.audio.pickup();
      if (!this.discovered.has(id)) {
        this.discovered.add(id);
        const item = ITEMS[id];
        this.ui.toast('发现新物品：' + item.name, 'good', 3600);
      }
      this.floatingTexts.add(this.player.centerX(), this.player.y - 2, '+' + count + ' ' + ITEMS[id].name, TF.RARITY_COLORS[ITEMS[id].rarity || 0], 8);
      this.ui.updateHotbar();
    }

    updateEnemies(dt) {
      for (const e of this.enemies) {
        if (!e.dead) e.update(dt, this);
      }
      this.enemies = this.enemies.filter(e => !e.dead);
    }

    onEnemyKilled(enemy, burned) {
      const cx = enemy.centerX(), cy = enemy.centerY();
      this.audio.enemyDie();
      this.particles.burst(cx, cy, 18, enemy.type === 'slime' ? ['#63b96d', '#9ee5a7', '#3b794a'] : ['#8f3030', '#b9493e', '#5b1d1d'], {
        speed: 140, life: 0.7, size: 2.2, gravity: 520,
      });
      this.player.kills++;
      const loot = enemy.def.loot || [];
      const mul = burned ? 0.5 : 1;
      for (const [id, chance, min, max] of loot) {
        if (Math.random() > chance * mul) continue;
        const count = min + Math.floor(Math.random() * (max - min + 1));
        if (count > 0) this.spawnDrop(id, count, cx, cy - 4, {
          vx: U.lerp(-80, 80, Math.random()), vy: U.lerp(-180, -60, Math.random()),
        });
      }
      if (Math.random() < 0.08) this.spawnDrop('heart', 1, cx, cy, { vx: 0, vy: -130 });
      this.ui.updateHotbar();
    }

    updateProjectiles(dt) {
      for (const p of this.projectiles) if (!p.dead) p.update(dt, this);
      this.projectiles = this.projectiles.filter(p => !p.dead);
    }

    updateGuide(dt) {
      if (!this.guide) return;
      this.guide.update(dt, this);
    }

    // ==========================================================
    // ENEMY SPAWNING
    // ==========================================================
    updateSpawning(dt) {
      const aboveGround = this.player.y + this.player.h < (this.world.surface[U.clamp(Math.floor(this.player.centerX() / TILE), 0, this.world.w - 1)] + 8) * TILE;
      if (!aboveGround && this.isNight) return;
      if (!this.isNight && !aboveGround) return;
      this.enemyTimer -= dt;
      if (this.enemyTimer > 0) return;
      this.enemyTimer = this.isNight ? U.lerp(3.2, 5.6, Math.random()) : U.lerp(10, 18, Math.random());
      const cap = this.isNight ? Math.min(8, 3 + Math.floor(this.day * 0.8)) : 2;
      if (this.enemies.length >= cap) return;
      const wasNight = this.isNight;
      let type;
      if (wasNight) {
        const r = Math.random();
        type = r < (this.day >= 2 ? 0.72 : 0.9) ? 'zombie' : 'demonEye';
        if (this.day < 2) type = 'zombie';
      } else {
        type = 'slime';
      }
      const spot = this.world.findSpawnColumnNear(this.player.centerX(), 21, 34, this.spawnRng || new TF.RNG(Date.now() + ''), true);
      if (!spot) return;
      const e = new TF.Enemy(type, spot.x, spot.y, this);
      e.setWorld(this.world);
      this.enemies.push(e);
      this.particles.burst(spot.x, spot.y - 20, 7, type === 'zombie' ? ['#3b4b2f', '#20251b'] : type === 'slime' ? ['#4d8d57', '#2e5e35'] : ['#5b2832', '#2f151a'], {
        speed: 35, life: 0.6, size: 2, gravity: -30,
      });
      if (this.isNight && this.enemies.length === 1) this.audio.groan();
    }

    // ==========================================================
    // SHELTER
    // ==========================================================
    checkShelter(player) {
      if (!player || player.dead) return false;
      const world = this.world;
      const startX = Math.floor(player.centerX() / TILE);
      const startY = Math.floor((player.y + player.h - 2) / TILE);
      if (world.isSolidCell(startX, startY)) return false;
      const visited = new Set();
      const queue = [[startX, startY]];
      let count = 0;
      while (queue.length) {
        const [x, y] = queue.pop();
        if (x < 2 || y < 1 || x >= world.w - 2 || y >= world.h - 2) return false;
        const key = y * world.w + x;
        if (visited.has(key)) continue;
        visited.add(key);
        if (world.isSolidCell(x, y)) continue;
        if (y < world.surface[x]) return false; // reached open sky
        count++;
        if (count > 420) return false;
        queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
      return count >= 8;
    }

    // ==========================================================
    // STATIONS / CRAFTING
    // ==========================================================
    getNearbyStations() {
      const stations = new Set();
      if (!this.player) return stations;
      const px = this.player.centerX(), py = this.player.centerY();
      for (const o of this.world.objects) {
        if (!o.def.station) continue;
        const b = this.world.objectBounds(o);
        const nx = U.clamp(px, b.x, b.x + b.w);
        const ny = U.clamp(py, b.y, b.y + b.h);
        if (U.dist(px, py, nx, ny) <= 6.5 * TILE) stations.add(o.def.station);
      }
      return stations;
    }

    hasStation(type) {
      return this.getNearbyStations().has(type);
    }

    craft(recipe) {
      if (!recipe) return false;
      const stations = this.getNearbyStations();
      if (recipe.station && !stations.has(recipe.station)) {
        const name = recipe.station === 'workbench' ? '工作台' : recipe.station === 'furnace' ? '熔炉' : '铁砧';
        this.ui.toast(`需要靠近${name}才能制作这个。`, 'warn', 3600);
        this.audio.error();
        return false;
      }
      if (this.heldStack) {
        this.ui.toast('先放下手中的物品。', 'warn', 3000);
        return false;
      }
      for (const [id, n] of recipe.cost) {
        if (this.inventory.count(id) < n) {
          this.ui.toast(`材料不足：${ITEMS[id].name} ×${n}`, 'warn', 3600);
          this.audio.error();
          return false;
        }
      }
      for (const [id, n] of recipe.cost) this.inventory.consume(id, n);
      const outId = recipe.out[0], outCount = recipe.out[1];
      let left = this.inventory.add(outId, outCount);
      if (left > 0) {
        this.spawnDrop(outId, left, this.player.centerX(), this.player.y + 10);
        this.ui.toast('背包已满，成品掉在了脚边。', 'warn', 4000);
      }
      this.audio.craft();
      this.ui.toast(`制作了 ${ITEMS[outId].name}${outCount > 1 ? ' ×' + outCount : ''}`, 'good', 3000);
      this.ui.refreshInventory();
      this.ui.refreshHeld();
      if (recipe.out[0] === 'workbench' && !this.tutorial.bench) {
        this.tutorial.bench = true;
        this.ui.toast('把工作台放到地面，然后靠近它打开合成。', 'tutorial', 6000);
      }
      return true;
    }

    // ==========================================================
    // DEATH / RESPAWN
    // ==========================================================
    onPlayerDeath(player) {
      if (this.state === 'dead') return;
      this.state = 'dead';
      this.cursorActive = false;
      this.input.left = false;
      this.input.right = false;
      this.mining = null;
      this.placePreview = null;
      this.uiHint = '';
      this.audio.death();
      this.shake(9, 0.5);
      this.particles.burst(this.player.centerX(), this.player.centerY(), 24, ['#9b3232', '#d14d45', '#5b1f20'], {
        speed: 160, life: 0.9, size: 2.5, gravity: 550,
      });
      this.deathTimer = 3.4;
      this.ui.showDeath(player.deathReason || '你倒在了黑暗之中。');
      this.ui.updateDeathTimer(this.deathTimer);
    }

    respawnPlayer() {
      if (this.state !== 'dead') return;
      this.player.respawn();
      this.state = 'playing';
      this.deathTimer = 0;
      this.cursorActive = true;
      this.ui.hideDeath();
      this.snapCamera();
      this.ui.updateHud(true);
      this.audio.heal();
      this.particles.burst(this.player.centerX(), this.player.centerY(), 15, ['#9fe5a7', '#e0ffdc'], {
        speed: 70, life: 0.8, size: 2, gravity: -30, glow: true,
      });
      this.ui.toast('你在营地醒来了。物品完好无损。', 'good', 4000);
    }

    // ==========================================================
    // TUTORIAL / UTILS
    // ==========================================================
    updateTutorials(dt) {
      this.tutorialTimer -= dt;
      if (!this.tutorial.initial && this.tutorialTimer <= 0) {
        this.tutorial.initial = true;
        this.ui.toast('用斧头砍树、用镐子挖土。按 E 打开背包与合成。', 'tutorial', 7000);
      }
      if (!this.tutorial.wood && this.inventory.count('wood') >= 1) {
        this.tutorial.wood = true;
        this.ui.toast('获得木材。10 个木材可以制作工作台，按 E 看看配方。', 'tutorial', 6500);
      }
      if (!this.tutorial.bench && this.world.objects.some(o => o.type === 'workbench')) {
        this.tutorial.bench = true;
        this.ui.toast('靠近工作台可以解锁更多配方。右键工作台也能直接打开合成。', 'tutorial', 6500);
      }
      if (!this.tutorial.night && this.isNight && this.day === 1) {
        this.tutorial.night = true;
      }
      this.groanTimer -= dt;
      if (this.isNight && this.groanTimer <= 0) {
        this.groanTimer = U.lerp(9, 20, Math.random());
        if (this.enemies.length) this.audio.groan();
      }
    }

    warn(msg) {
      if (this.messageCooldown > 0) return;
      this.messageCooldown = 1.1;
      this.ui.toast(msg, 'warn', 3200);
      this.audio.error();
    }

    _lineBlocked(x0, y0, x1, y1, ignoreX, ignoreY, includeTarget = true) {
      const d = Math.hypot(x1 - x0, y1 - y0);
      const steps = Math.max(2, Math.ceil(d / 7));
      for (let i = 1; i < steps; i++) {
        const x = x0 + (x1 - x0) * (i / steps);
        const y = y0 + (y1 - y0) * (i / steps);
        const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
        if (tx === ignoreX && ty === ignoreY) continue;
        if (this.world.isSolidCell(tx, ty)) return true;
      }
      if (includeTarget) {
        const tx = Math.floor(x1 / TILE), ty = Math.floor(y1 / TILE);
        if (!(tx === ignoreX && ty === ignoreY) && this.world.isObjectSolidAt(tx, ty)) return true;
      }
      return false;
    }
  }

  function clamp01(v) { return U.clamp(v, 0, 1); }

  TF.Inventory = Inventory;
  TF.Game = Game;

  window.addEventListener('DOMContentLoaded', () => {
    if (!TF.game) new TF.Game();
  });
  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    if (!TF.game) new TF.Game();
  }
})();
