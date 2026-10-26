/* ============================================================
   Terra Frontier — DOM interface, HUD, inventory & menus
   ============================================================ */
(function () {
  'use strict';
  const TF = window.TF;
  const U = TF.util;

  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  const HEART_PATTERN = [
    '..##.##..',
    '.#######.',
    '#########',
    '#########',
    '.#######.',
    '..#####..',
    '...###...',
    '....#....',
  ];

  function drawHeart(canvas, fill, maxHp) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    const scale = 2;
    const ox = Math.floor((w - 9 * scale) / 2);
    const oy = Math.floor((h - 8 * scale) / 2);
    const drawShape = (cols) => {
      for (let y = 0; y < HEART_PATTERN.length; y++) {
        for (let x = 0; x < HEART_PATTERN[y].length; x++) {
          if (HEART_PATTERN[y][x] !== '#') continue;
          ctx.fillStyle = cols;
          ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
        }
      }
    };
    drawShape('#281516');
    // inner fill
    const inner = (color) => {
      for (let y = 0; y < HEART_PATTERN.length; y++) {
        for (let x = 0; x < HEART_PATTERN[y].length; x++) {
          if (HEART_PATTERN[y][x] !== '#') continue;
          if (x === 0 || y === 0 || x === 8 || y === 7) continue;
          ctx.fillStyle = color;
          ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
        }
      }
    };
    inner('#4b2022');
    if (fill > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, ox + 9 * scale * fill, h);
      ctx.clip();
      inner('#d94b54');
      // highlight
      ctx.fillStyle = '#ff8c94';
      ctx.fillRect(ox + 2 * scale, oy + 2 * scale, 2 * scale, 1 * scale);
      ctx.fillRect(ox + 2 * scale, oy + 3 * scale, 1 * scale, 1 * scale);
      if (fill >= 0.98) {
        ctx.fillStyle = '#a82e39';
        ctx.fillRect(ox + 6 * scale, oy + 5 * scale, 2 * scale, 1 * scale);
      }
      ctx.restore();
    }
    // border outline accent
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#000';
    ctx.fillRect(ox, oy + 8 * scale - 1, 9 * scale, 1);
    ctx.globalAlpha = 1;
  }

  class UI {
    constructor(game) {
      this.game = game;
      this.root = $('#app');
      this.uiOpen = false;
      this.activeTab = '生存';
      this.lastHp = -1;
      this.lastMaxHp = -1;
      this.heartEls = [];
      this.hotbarEls = [];
      this.invSlots = [];
      this.recipeEls = [];
      this.clockAccum = 0;
      this.labelAccum = 0;
      this.lastItemId = null;
      this.lastHint = '';
      this.helpReturn = null;
      this.pendingSeed = null;
      this.mouse = { x: innerWidth / 2, y: innerHeight / 2 };
      this.toastTimers = [];
      this._cacheDom();
      this._bind();
      this.buildHotbar();
      this._buildInventory();
      this._buildCraftTabs();
      this.syncAudio();
      this.refreshTitle();
      this.rendererPortrait();
    }

    _cacheDom() {
      this.el = {
        title: $('#title-screen'),
        hud: $('#hud'),
        hearts: $('#hearts'),
        clockCanvas: $('#clock-canvas'),
        dayLabel: $('#day-label'),
        timeLabel: $('#time-label'),
        phaseLabel: $('#phase-label'),
        shelter: $('#shelter-buff'),
        depth: $('#depth-chip'),
        itemName: $('#item-name'),
        hotbar: $('#hotbar'),
        toasts: $('#toast-stack'),
        interaction: $('#interaction-hint'),
        combo: $('#combo-toast'),
        inventory: $('#inventory-screen'),
        inventoryGrid: $('#inventory-grid'),
        invBagCount: $('#bag-count'),
        nearbyStations: $('#nearby-stations'),
        recipeList: $('#recipe-list'),
        tabs: $('#craft-tabs'),
        charPreview: $('#char-preview'),
        statHp: $('#stat-hp'),
        statPick: $('#stat-pick'),
        statKills: $('#stat-kills'),
        statDepth: $('#stat-depth'),
        charTip: $('#char-tip'),
        pause: $('#pause-screen'),
        pauseInfo: $('#pause-world-info'),
        pauseTime: $('#pause-playtime'),
        autosaveLabel: $('#autosave-label'),
        help: $('#help-screen'),
        death: $('#death-screen'),
        deathReason: $('#death-reason'),
        respawnTimer: $('#respawn-timer'),
        confirm: $('#confirm-screen'),
        loading: $('#loading-screen'),
        loadingTip: $('#loading-tip'),
        tooltip: $('#item-tooltip'),
        held: $('#held-item'),
        heldCanvas: $('#held-item canvas'),
        heldCount: $('#held-item span'),
        continueBtn: $('#btn-continue'),
        continueMeta: $('#continue-meta'),
        seedInput: $('#seed-input'),
        titleSound: $('#btn-title-sound'),
        soundBtn: $('#btn-sound'),
        fade: $('#fade-flash'),
      };
    }

    _bind() {
      const g = this.game;
      document.addEventListener('pointerdown', () => {
        g.audio.init();
        g.audio.startMusic(g.isNight ? 'night' : 'day');
      }, { once: true });
      document.addEventListener('contextmenu', e => e.preventDefault());
      this.el.seedInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          $('#btn-new').click();
        }
      });
      document.addEventListener('mousemove', e => {
        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;
        if (g.heldStack) this.moveHeld();
        if (!this.el.tooltip.classList.contains('hidden')) this.positionTooltip(e.clientX, e.clientY);
      });

      $('#btn-new').addEventListener('click', () => {
        g.audio.init();
        const seed = this.el.seedInput.value.trim();
        this.el.seedInput.value = '';
        this.pendingSeed = seed;
        if (this.hasSave()) {
          this.pendingSeed = seed;
          this.el.confirm.classList.remove('hidden');
          this.uiOpen = true;
          document.body.classList.add('ui-cursor');
          g.audio.click();
        } else {
          this.startWorld(seed);
        }
      });
      $('#btn-confirm-new').addEventListener('click', () => {
        this.el.confirm.classList.add('hidden');
        this.uiOpen = false;
        this.startWorld(this.pendingSeed || '');
      });
      $('#btn-confirm-cancel').addEventListener('click', () => {
        this.el.confirm.classList.add('hidden');
        this.uiOpen = false;
        document.body.classList.remove('ui-cursor');
        g.audio.click();
      });
      this.el.continueBtn.addEventListener('click', () => {
        g.audio.init();
        this.startContinue();
      });
      $('#btn-title-help').addEventListener('click', () => this.openHelp('title'));
      this.el.titleSound.addEventListener('click', () => this.toggleMute());
      this.el.soundBtn.addEventListener('click', () => this.toggleMute());
      $('#btn-help').addEventListener('click', () => {
        if (g.state === 'title') this.openHelp('title');
        else if (g.state === 'paused') this.openHelp('pause');
        else if (g.state === 'playing') { g.openPauseMenu(); this.openHelp('pause'); }
      });
      $('#btn-help-ok').addEventListener('click', () => this.closeHelp());
      $$('.close-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const target = btn.getAttribute('data-close');
          if (target === 'inventory') g.closeInventory();
          else if (target === 'help') this.closeHelp();
        });
      });
      $('#btn-resume').addEventListener('click', () => g.resumeGame());
      $('#btn-save').addEventListener('click', () => {
        g.saveGame(true);
        this.el.autosaveLabel.textContent = '已保存到本机 · ' + U.fmtTime(g.hours);
      });
      $('#btn-pause-help').addEventListener('click', () => {
        this.el.pause.classList.add('hidden');
        this.openHelp('pause');
      });
      $('#btn-quit').addEventListener('click', () => g.quitToTitle());
      $('#btn-respawn').addEventListener('click', () => g.respawnPlayer());
      this.el.soundBtn.title = '静音 (M)';

      window.addEventListener('resize', () => this.resize());
    }

    resize() {
      // nothing structural; renderer resizes itself. Reposition held item.
      if (this.game.heldStack) this.moveHeld();
    }

    hasSave() {
      return !!this.getSaveMeta();
    }

    getSaveMeta() {
      const data = U.storageGet(TF.SAVE_KEY, null);
      if (!data || !data.meta) return null;
      return data.meta;
    }

    refreshTitle() {
      const meta = this.getSaveMeta();
      if (meta) {
        this.el.continueBtn.disabled = false;
        this.el.continueMeta.textContent = `第 ${meta.day || 1} 天 · ${String(meta.seed || '').slice(0, 18)}`;
      } else {
        this.el.continueBtn.disabled = true;
        this.el.continueMeta.textContent = '尚未找到存档';
      }
      this.syncAudio();
    }

    startWorld(seed) {
      const g = this.game;
      this.el.confirm.classList.add('hidden');
      this.el.title.classList.add('fade-out');
      document.body.classList.add('ui-cursor');
      setTimeout(() => {
        this.el.title.classList.add('hidden');
        this.showLoading('正在让群山隆起，让洞穴呼吸……');
        // let the loading screen paint before the sync generation starts
        setTimeout(() => {
          g.startNew(seed);
        }, 80);
      }, 260);
    }

    startContinue() {
      const g = this.game;
      if (!this.hasSave()) return;
      this.el.title.classList.add('fade-out');
      document.body.classList.add('ui-cursor');
      setTimeout(() => {
        this.el.title.classList.add('hidden');
        this.showLoading('正在唤醒你的旧日营地……');
        setTimeout(() => g.continueGame(), 80);
      }, 260);
    }

    showLoading(tip) {
      this.el.loading.classList.remove('hidden');
      this.el.loadingTip.textContent = tip || '正在塑造世界';
    }
    hideLoading() {
      this.el.loading.classList.add('hidden');
    }

    enterGame() {
      document.body.classList.remove('title-mode');
      this.el.title.classList.add('hidden');
      this.el.title.classList.remove('fade-out');
      this.el.hud.classList.remove('hidden');
      document.body.classList.remove('ui-cursor');
      this.uiOpen = false;
      this.hideAllOverlays();
      this.hideLoading();
      this.el.help.classList.add('hidden');
      this.el.death.classList.add('hidden');
      this.el.confirm.classList.add('hidden');
      this.refreshInventory();
      this.lastHp = -1;
      this.lastMaxHp = -1;
      this.el.autosaveLabel.textContent = '自动存档已开启';
      this.updateHud(true);
      this.rendererPortrait();
    }

    returnToTitle() {
      document.body.classList.add('title-mode');
      document.body.classList.remove('ui-cursor');
      this.el.hud.classList.add('hidden');
      this.el.title.classList.remove('hidden', 'fade-out');
      this.hideAllOverlays();
      this.hideLoading();
      this.uiOpen = false;
      this.refreshTitle();
      this.clearToasts();
      this.hideHeld();
      this.game.heldStack = null;
    }

    hideAllOverlays() {
      ['inventory', 'pause', 'help', 'death', 'confirm'].forEach(k => this.el[k].classList.add('hidden'));
    }

    syncAudio() {
      const muted = this.game.audio.muted;
      this.el.soundBtn.classList.toggle('muted', muted);
      this.el.soundBtn.textContent = muted ? '×' : '♪';
      this.el.soundBtn.title = muted ? '恢复声音 (M)' : '静音 (M)';
      this.el.titleSound.textContent = muted ? '音效：关闭' : '音效：开启';
    }

    toggleMute() {
      this.game.audio.init();
      this.game.audio.toggleMute();
      this.syncAudio();
      if (!this.game.audio.muted) {
        this.game.audio.startMusic(this.game.isNight ? 'night' : 'day');
        this.game.audio.click();
      }
    }

    // ==========================================================
    // HUD
    // ==========================================================
    updateHud(force = false) {
      const g = this.game;
      if (g.state === 'title') return;
      const p = g.player;
      if (!p) return;
      if (p.maxHp !== this.lastMaxHp) {
        this.lastMaxHp = p.maxHp;
        this.buildHearts(p.maxHp);
      }
      if (p.hp !== this.lastHp || force) {
        this.lastHp = p.hp;
        this.updateHearts(p.hp, p.maxHp);
      }
      const hint = g.uiHint || '';
      if (hint !== this.lastHint) {
        this.lastHint = hint;
        if (hint) {
          this.el.interaction.textContent = hint;
          this.el.interaction.classList.remove('hidden');
        } else {
          this.el.interaction.classList.add('hidden');
        }
      }
      const selected = g.selectedItem ? g.selectedItem() : null;
      const selectedId = selected ? selected.id : null;
      if (selectedId !== this.lastItemId) {
        this.lastItemId = selectedId;
        this.el.itemName.textContent = selected ? selected.name : '空手';
        this.updateHotbarSelection();
      }
      if (force) {
        this.el.itemName.textContent = selected ? selected.name : '空手';
        this.updateHotbarSelection();
        this.updateClock(true);
        this.updateLabels(true);
      }
      this.el.shelter.classList.toggle('hidden', !p.safeHouse);
      // depth
      this.depthAccum = (this.depthAccum || 0) - 0.016;
      if (this.depthAccum <= 0) {
        this.depthAccum = 0.25;
        const depth = Math.max(0, Math.floor(p.depth));
        let label = '地表';
        if (depth > 150) label = `深岩层 · ${depth}m`;
        else if (depth > 55) label = `洞穴 · ${depth}m`;
        else if (depth > 4) label = `地下 · ${depth}m`;
        this.el.depth.textContent = label;
        this.el.depth.classList.toggle('underground', depth > 4);
      }
      this.clockAccum += 0.016;
      if (this.clockAccum > 0.1) {
        this.clockAccum = 0;
        this.updateClock();
      }
      this.labelAccum += 0.016;
      if (this.labelAccum > 0.2) {
        this.labelAccum = 0;
        this.updateLabels();
      }
    }

    buildHearts(maxHp) {
      const count = Math.max(1, Math.ceil(maxHp / 20));
      this.el.hearts.innerHTML = '';
      this.heartEls = [];
      for (let i = 0; i < count; i++) {
        const c = document.createElement('canvas');
        c.width = 22;
        c.height = 20;
        c.className = 'heart';
        c.title = `${i * 20 + 20} 生命`;
        this.el.hearts.appendChild(c);
        this.heartEls.push(c);
      }
      this.updateHearts(this.game.player.hp, maxHp);
    }

    updateHearts(hp, maxHp) {
      for (let i = 0; i < this.heartEls.length; i++) {
        const start = i * 20;
        const fill = U.clamp((hp - start) / 20, 0, 1);
        drawHeart(this.heartEls[i], fill, maxHp);
      }
    }

    updateLabels(force) {
      const g = this.game;
      const phase = g.hours >= 4.5 && g.hours < 6.8 ? '黎明' : g.hours >= 6.8 && g.hours < 17.2 ? '白昼' : g.hours >= 17.2 && g.hours < 19.5 ? '黄昏' : '夜晚';
      this.el.dayLabel.textContent = `第 ${g.day} 天`;
      this.el.timeLabel.textContent = U.fmtTime(g.hours);
      this.el.phaseLabel.textContent = phase;
      if (!this.el.pause.classList.contains('hidden')) {
        this.el.pauseInfo.textContent = `种子 ${g.world.seedString} · ${g.world.biomeName(Math.floor(g.player.centerX() / TF.TILE))}`;
        this.el.pauseTime.textContent = `游戏时间 ${U.fmtDuration(g.playTime)} · ${g.player.kills} 击杀`;
      }
    }

    updateClock(force = false) {
      const g = this.game;
      const c = this.el.clockCanvas;
      const ctx = c.getContext('2d');
      const w = c.width, h = c.height;
      const cx = w / 2, cy = h / 2, r = 58;
      ctx.clearRect(0, 0, w, h);
      // dial
      ctx.fillStyle = 'rgba(5,9,13,0.65)';
      ctx.beginPath();
      ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(160,154,120,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 7.5, 0, Math.PI * 2);
      ctx.stroke();
      // day arc
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(233,189,98,0.4)';
      ctx.beginPath();
      ctx.arc(cx, cy, r - 3, -Math.PI / 2 + (6 / 24) * Math.PI * 2, -Math.PI / 2 + (18 / 24) * Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(116,145,205,0.35)';
      ctx.beginPath();
      ctx.arc(cx, cy, r - 3, -Math.PI / 2 + (18 / 24) * Math.PI * 2, -Math.PI / 2 + Math.PI * 2 + (6 / 24) * Math.PI * 2);
      ctx.stroke();
      // ticks
      for (let i = 0; i < 24; i++) {
        const a = -Math.PI / 2 + (i / 24) * Math.PI * 2;
        const len = i % 6 === 0 ? 6 : 3;
        ctx.strokeStyle = i % 6 === 0 ? 'rgba(238,229,203,0.6)' : 'rgba(238,229,203,0.2)';
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * (r - len), cy + Math.sin(a) * (r - len));
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        ctx.stroke();
      }
      // sun/moon marker
      const a = -Math.PI / 2 + (g.hours / 24) * Math.PI * 2;
      const mx = cx + Math.cos(a) * (r - 3);
      const my = cy + Math.sin(a) * (r - 3);
      const night = g.isNight;
      if (night) {
        ctx.fillStyle = '#d6ddcf';
        ctx.beginPath(); ctx.arc(mx, my, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1a2230';
        ctx.beginPath(); ctx.arc(mx + 3, my - 2, 7, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = '#f6d570';
        ctx.beginPath(); ctx.arc(mx, my, 8, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,221,120,0.35)';
        ctx.beginPath(); ctx.arc(mx, my, 12, 0, Math.PI * 2); ctx.stroke();
      }
      // center ornament
      ctx.fillStyle = 'rgba(233,189,98,0.55)';
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(233,189,98,0.2)';
      ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.stroke();
      // cardinal glyphs
      ctx.fillStyle = 'rgba(233,227,207,0.42)';
      ctx.font = '9px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('6', cx, cy - r + 18);
      ctx.fillText('18', cx, cy + r - 18);
      ctx.font = '14px "Courier New", monospace';
      ctx.fillStyle = 'rgba(233,189,98,0.8)';
      ctx.fillText(U.fmtTime(g.hours).slice(0, 5), cx, cy + 27);
    }

    buildHotbar() {
      this.el.hotbar.innerHTML = '';
      this.hotbarEls = [];
      for (let i = 0; i < 10; i++) {
        const slot = document.createElement('div');
        slot.className = 'hotbar-slot';
        slot.dataset.index = i;
        const num = document.createElement('span');
        num.className = 'slot-num';
        num.textContent = i === 9 ? '0' : String(i + 1);
        const canvas = document.createElement('canvas');
        canvas.width = 48;
        canvas.height = 48;
        const count = document.createElement('span');
        count.className = 'slot-count';
        slot.append(num, canvas, count);
        slot.addEventListener('click', e => {
          e.stopPropagation();
          this.game.selectHotbar(i);
          this.updateHotbarSelection();
          this.el.itemName.textContent = this.game.selectedItem() ? this.game.selectedItem().name : '空手';
        });
        slot.addEventListener('mouseenter', () => {
          const stack = this.game.inventory.slots[i];
          if (stack) this.showItemTooltip(stack.id, this.mouse.x, this.mouse.y);
        });
        slot.addEventListener('mouseleave', () => this.hideTooltip());
        this.el.hotbar.appendChild(slot);
        this.hotbarEls.push({ slot, canvas, count });
      }
    }

    updateHotbar() {
      const inv = this.game.inventory;
      if (!inv) return;
      for (let i = 0; i < this.hotbarEls.length; i++) {
        const el = this.hotbarEls[i];
        const stack = inv.slots[i];
        const ctx = el.canvas.getContext('2d');
        ctx.clearRect(0, 0, 48, 48);
        ctx.imageSmoothingEnabled = false;
        if (stack) {
          const icon = this.game.renderer.getIcon(stack.id, 32);
          ctx.drawImage(icon, 8, 8);
          el.count.textContent = stack.count > 1 ? stack.count : '';
        } else {
          el.count.textContent = '';
        }
      }
      this.updateHotbarSelection();
    }

    updateHotbarSelection() {
      const selected = this.game.hotbarIndex || 0;
      for (let i = 0; i < this.hotbarEls.length; i++) {
        this.hotbarEls[i].slot.classList.toggle('selected', i === selected);
      }
    }

    // ==========================================================
    // TOASTS / COMBOS
    // ==========================================================
    toast(text, type = '', duration = 4300) {
      if (!text) return;
      const el = document.createElement('div');
      el.className = 'toast ' + type;
      el.textContent = text;
      this.el.toasts.appendChild(el);
      while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
      const timer = setTimeout(() => {
        el.classList.add('fade');
        setTimeout(() => el.remove(), 520);
      }, duration);
      this.toastTimers.push(timer);
    }

    clearToasts() {
      this.el.toasts.innerHTML = '';
      this.toastTimers.forEach(t => clearTimeout(t));
      this.toastTimers = [];
    }

    combo(text) {
      const el = this.el.combo;
      el.textContent = text;
      el.classList.remove('hidden');
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = '';
      clearTimeout(this._comboTimer);
      this._comboTimer = setTimeout(() => el.classList.add('hidden'), 1800);
    }

    // ==========================================================
    // INVENTORY / CRAFTING
    // ==========================================================
    rendererPortrait() {
      if (this.game.renderer && this.el.charPreview) this.game.renderer.drawPortrait(this.el.charPreview);
    }

    openInventory() {
      const g = this.game;
      if (g.state !== 'playing') return;
      g.state = 'inventory';
      g.cursorActive = false;
      this.uiOpen = true;
      this.el.inventory.classList.remove('hidden');
      this.el.pause.classList.add('hidden');
      this.el.help.classList.add('hidden');
      this.el.death.classList.add('hidden');
      document.body.classList.add('ui-cursor');
      this.refreshInventory();
      this.rendererPortrait();
      this.game.audio.click();
    }

    closeInventory() {
      const g = this.game;
      if (g.state !== 'inventory') return;
      if (g.heldStack) {
        const left = g.inventory.add(g.heldStack.id, g.heldStack.count);
        if (left > 0) {
          this.toast('背包已满，无法放下手中的物品', 'warn');
          g.heldStack = { id: g.heldStack.id, count: left };
          return;
        }
        g.heldStack = null;
      }
      this.el.inventory.classList.add('hidden');
      this.uiOpen = false;
      document.body.classList.remove('ui-cursor');
      g.state = 'playing';
      g.cursorActive = true;
      this.hideTooltip();
      this.hideHeld();
      this.updateHotbar();
      this.game.audio.click();
    }

    _buildInventory() {
      this.el.inventoryGrid.innerHTML = '';
      this.invSlots = [];
      for (let i = 0; i < 40; i++) {
        const slot = document.createElement('div');
        slot.className = 'inv-slot' + (i < 10 ? ' hotbar-row' : '');
        slot.dataset.index = i;
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const count = document.createElement('span');
        count.className = 'slot-count';
        slot.append(canvas, count);
        if (i < 10) {
          const num = document.createElement('span');
          num.className = 'slot-num';
          num.textContent = i === 9 ? '0' : String(i + 1);
          slot.appendChild(num);
        }
        slot.addEventListener('click', e => this.onInventoryClick(i, false));
        slot.addEventListener('contextmenu', e => {
          e.preventDefault();
          this.onInventoryClick(i, true);
        });
        slot.addEventListener('mouseenter', () => {
          const stack = this.game.inventory.slots[i];
          if (stack) this.showItemTooltip(stack.id, this.mouse.x, this.mouse.y);
        });
        slot.addEventListener('mouseleave', () => this.hideTooltip());
        this.el.inventoryGrid.appendChild(slot);
        this.invSlots.push({ slot, canvas, count });
      }
    }

    onInventoryClick(i, rightClick) {
      const g = this.game;
      if (g.state !== 'inventory') return;
      const inv = g.inventory;
      const stack = inv.slots[i];
      if (!g.heldStack) {
        if (!stack) return;
        if (rightClick && stack.count > 1) {
          const half = Math.ceil(stack.count / 2);
          g.heldStack = { id: stack.id, count: half };
          stack.count -= half;
        } else {
          g.heldStack = { id: stack.id, count: stack.count };
          inv.slots[i] = null;
        }
      } else {
        const held = g.heldStack;
        if (!stack) {
          if (rightClick) {
            inv.slots[i] = { id: held.id, count: 1 };
            held.count--;
            if (held.count <= 0) g.heldStack = null;
          } else {
            inv.slots[i] = { id: held.id, count: held.count };
            g.heldStack = null;
          }
        } else if (stack.id === held.id) {
          const max = TF.ITEMS[held.id].stack || 999;
          const room = max - stack.count;
          const amount = rightClick ? Math.min(1, room) : Math.min(room, held.count);
          if (amount > 0) {
            stack.count += amount;
            held.count -= amount;
            if (held.count <= 0) g.heldStack = null;
          }
        } else {
          // swap
          inv.slots[i] = { id: held.id, count: held.count };
          g.heldStack = { id: stack.id, count: stack.count };
        }
      }
      this.refreshInventory();
      this.game.audio.click();
    }

    refreshInventory() {
      const g = this.game;
      const inv = g.inventory;
      if (!inv) return;
      const slots = this.invSlots;
      for (let i = 0; i < slots.length; i++) {
        const item = inv.slots[i];
        const ctx = slots[i].canvas.getContext('2d');
        ctx.clearRect(0, 0, 64, 64);
        ctx.imageSmoothingEnabled = false;
        if (item) {
          ctx.drawImage(g.renderer.getIcon(item.id, 48), 8, 8);
          slots[i].count.textContent = item.count > 1 ? item.count : '';
        } else {
          slots[i].count.textContent = '';
        }
        slots[i].slot.classList.toggle('selected', i === g.hotbarIndex);
      }
      const used = inv.slots.filter(Boolean).length;
      this.el.invBagCount.textContent = `${used} / 40`;
      this.updateStats();
      this.renderRecipes();
      this.updateHotbar();
      this.refreshHeld();
    }

    updateStats() {
      const g = this.game;
      if (!g.player) return;
      const p = g.player;
      this.el.statHp.textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
      const sel = g.selectedItem ? g.selectedItem() : null;
      this.el.statPick.textContent = sel && sel.tool === 'pick' ? sel.power.toFixed(1) : '—';
      this.el.statKills.textContent = String(p.kills || 0);
      const depth = Math.max(0, Math.floor(p.depth));
      this.el.statDepth.textContent = depth > 4 ? `${depth} m` : '地表';
      let tip = '先砍树获得木材，再用 <b>E</b> 制作工作台。天黑前，记得给自己搭一间有门的小屋。';
      if (g.inventory.count('wood') >= 10 && !g.hasStation('workbench')) tip = '你有足够的木材。按 <b>E</b> 制作工作台，放在地面上，然后靠近它。';
      else if (g.hasStation('workbench') && !g.hasStation('furnace')) tip = '靠近工作台打开合成，用 20 个石块造一座熔炉，把矿石炼成锭。';
      else if (g.isNight) tip = '夜晚已经降临。关好门，握紧剑；或去地下躲避，并用火把照亮洞穴。';
      else if (g.player.maxHp < 200) tip = '深入地下寻找粉色的生命水晶，使用后可以永久提升生命上限。';
      this.el.charTip.innerHTML = tip;
    }

    _buildCraftTabs() {
      const cats = ['生存', '工具', '武器', '建筑', '家具', '熔炼'];
      this.el.tabs.innerHTML = '';
      for (const cat of cats) {
        const b = document.createElement('button');
        b.className = 'craft-tab' + (cat === this.activeTab ? ' active' : '');
        b.textContent = cat;
        b.addEventListener('click', () => {
          this.activeTab = cat;
          $$('.craft-tab').forEach(t => t.classList.toggle('active', t.textContent === cat));
          this.renderRecipes();
          this.game.audio.click();
        });
        this.el.tabs.appendChild(b);
      }
    }

    renderRecipes() {
      const g = this.game;
      if (!g || g.state !== 'inventory') return;
      const stations = g.getNearbyStations();
      const stationNames = [];
      if (stations.has('workbench')) stationNames.push('工作台');
      if (stations.has('furnace')) stationNames.push('熔炉');
      if (stations.has('anvil')) stationNames.push('铁砧');
      this.el.nearbyStations.textContent = stationNames.length ? '附近：' + stationNames.join(' · ') : '无制作站';
      this.el.nearbyStations.classList.toggle('active', stationNames.length > 0);

      this.el.recipeList.innerHTML = '';
      const recipes = TF.RECIPES.filter(r => r.cat === this.activeTab);
      for (const r of recipes) {
        const item = TF.ITEMS[r.out[0]];
        if (!item) continue;
        const stationOk = !r.station || stations.has(r.station);
        const costOk = r.cost.every(([id, n]) => g.inventory.count(id) >= n);
        const available = stationOk && costOk;
        const row = document.createElement('div');
        row.className = 'recipe' + (available ? '' : ' unavailable');
        const iconWrap = document.createElement('div');
        iconWrap.className = 'recipe-icon';
        const icon = document.createElement('canvas');
        icon.width = 48;
        icon.height = 48;
        TF.drawItemIcon(icon.getContext('2d'), r.out[0], 48);
        iconWrap.appendChild(icon);
        const copy = document.createElement('div');
        copy.className = 'recipe-copy';
        const nameLine = document.createElement('div');
        nameLine.className = 'recipe-name';
        nameLine.innerHTML = `${item.name}${r.out[1] > 1 ? ` <em>×${r.out[1]}</em>` : ''}`;
        copy.appendChild(nameLine);
        const ings = document.createElement('div');
        ings.className = 'recipe-ingredients';
        for (const [id, n] of r.cost) {
          const have = g.inventory.count(id);
          const span = document.createElement('span');
          span.className = have >= n ? '' : 'missing';
          span.textContent = `${TF.ITEMS[id].name} ${have}/${n}`;
          ings.appendChild(span);
        }
        copy.appendChild(ings);
        const st = document.createElement('div');
        st.className = 'recipe-station ' + (stationOk ? 'ready' : (r.station ? 'needed' : 'ready'));
        st.textContent = r.station ? (r.station === 'workbench' ? '工作台' : r.station === 'furnace' ? '熔炉' : '铁砧') : '随身';
        row.append(iconWrap, copy, st);
        row.addEventListener('mouseenter', () => this.showItemTooltip(r.out[0], this.mouse.x, this.mouse.y));
        row.addEventListener('mouseleave', () => this.hideTooltip());
        row.addEventListener('click', () => {
          if (g.heldStack) { this.toast('先放下手中的物品', 'warn'); return; }
          g.craft(r);
        });
        this.el.recipeList.appendChild(row);
      }
      if (!this.el.recipeList.children.length) {
        const d = document.createElement('div');
        d.className = 'empty-note';
        d.textContent = '这个分类里还没有可制作的东西。';
        this.el.recipeList.appendChild(d);
      }
    }

    refreshHeld() {
      const g = this.game;
      if (g.heldStack) {
        this.el.held.classList.remove('hidden');
        const ctx = this.el.heldCanvas.getContext('2d');
        ctx.clearRect(0, 0, 32, 32);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(g.renderer.getIcon(g.heldStack.id, 32), 0, 0);
        this.el.heldCount.textContent = g.heldStack.count > 1 ? g.heldStack.count : '';
        this.moveHeld();
        document.body.classList.add('ui-cursor');
      } else {
        this.hideHeld();
      }
    }

    moveHeld() {
      if (!this.game.heldStack) return;
      this.el.held.style.left = this.mouse.x + 'px';
      this.el.held.style.top = this.mouse.y + 'px';
    }

    hideHeld() {
      this.el.held.classList.add('hidden');
    }

    // ==========================================================
    // TOOLTIP
    // ==========================================================
    showItemTooltip(id, x, y) {
      const item = TF.ITEMS[id];
      if (!item) return;
      const rarity = TF.RARITY_COLORS[item.rarity || 0] || '#e9e3cf';
      let type = '材料';
      if (item.kind === 'tool') type = item.tool === 'pick' ? '镐 · 工具' : '斧 · 工具';
      else if (item.kind === 'weapon') type = '武器 · ' + (item.weapon === 'swing' ? '近战' : item.weapon === 'stab' ? '近战' : item.weapon === 'bow' ? '远程' : '魔法');
      else if (item.kind === 'block') type = '可放置方块';
      else if (item.kind === 'wall') type = '背景墙';
      else if (item.kind === 'placeable') type = '可放置 · 家具';
      else if (item.kind === 'consumable') type = '消耗品';
      else if (item.kind === 'ammo') type = '弹药';
      let stat = '';
      if (item.tool) {
        stat = `${item.tool === 'pick' ? '镐力' : '斧力'} ${item.power.toFixed(1)}　挖掘等级 ${item.tier}`;
      } else if (item.damage) {
        stat = `伤害 ${item.damage}` + (item.useTime ? `　攻速 ${(1 / item.useTime).toFixed(1)}/秒` : '');
      }
      if (item.kind === 'placeable' && item.place) stat = '放置后提供家具与制作站';
      if (item.kind === 'wall') stat = '右键拆除；左键放置';
      this.el.tooltip.innerHTML = `
        <div class="tt-name" style="color:${rarity}">${item.name}</div>
        <div class="tt-type">${type}</div>
        ${item.desc ? `<div class="tt-desc">${item.desc}</div>` : ''}
        ${stat ? `<div class="tt-stat">${stat}</div>` : ''}
      `;
      this.el.tooltip.classList.remove('hidden');
      this.positionTooltip(x, y);
    }

    positionTooltip(x, y) {
      const el = this.el.tooltip;
      if (el.classList.contains('hidden')) return;
      const pad = 14;
      const rect = el.getBoundingClientRect();
      let left = x + 16;
      let top = y + 16;
      if (left + rect.width > innerWidth - 8) left = x - rect.width - 12;
      if (top + rect.height > innerHeight - 8) top = y - rect.height - 12;
      el.style.left = Math.max(6, left) + 'px';
      el.style.top = Math.max(6, top) + 'px';
    }

    hideTooltip() {
      this.el.tooltip.classList.add('hidden');
    }

    // ==========================================================
    // PAUSE / HELP / DEATH
    // ==========================================================
    showPause() {
      this.el.pause.classList.remove('hidden');
      this.el.inventory.classList.add('hidden');
      this.el.help.classList.add('hidden');
      this.uiOpen = true;
      document.body.classList.add('ui-cursor');
      this.updateLabels();
    }

    hidePause() {
      this.el.pause.classList.add('hidden');
    }

    openHelp(source) {
      this.helpReturn = source;
      if (source === 'pause') this.el.pause.classList.add('hidden');
      this.el.help.classList.remove('hidden');
      this.uiOpen = true;
      document.body.classList.add('ui-cursor');
      this.game.audio.click();
    }

    closeHelp() {
      this.el.help.classList.add('hidden');
      this.game.audio.click();
      if (this.helpReturn === 'pause') {
        this.el.pause.classList.remove('hidden');
        this.uiOpen = true;
      } else {
        this.uiOpen = false;
        document.body.classList.remove('ui-cursor');
        this.game.cursorActive = this.game.state === 'playing';
      }
      this.helpReturn = null;
    }

    showDeath(reason) {
      this.el.deathReason.textContent = reason || '你倒在了黑暗之中。';
      this.el.death.classList.remove('hidden');
      this.el.hud.classList.add('paused-hud');
      this.uiOpen = true;
      document.body.classList.add('ui-cursor');
      this.game.audio.death();
    }

    hideDeath() {
      this.el.death.classList.add('hidden');
      this.el.hud.classList.remove('paused-hud');
      this.uiOpen = false;
      document.body.classList.remove('ui-cursor');
    }

    updateDeathTimer(t) {
      this.el.respawnTimer.textContent = t > 0 ? `${t.toFixed(1)} 秒后自动醒来` : '';
    }

    damageFlash() {
      const el = document.querySelector('#damage-flash');
      if (!el) return;
      el.style.transition = 'none';
      el.style.opacity = '0.9';
      void el.offsetWidth;
      el.style.transition = 'opacity 0.55s ease-out';
      el.style.opacity = '0';
    }

    flashScreen(color, opacity) {
      this.el.fade.style.background = color || '#000';
      this.el.fade.style.transition = 'opacity .15s';
      this.el.fade.style.opacity = String(opacity);
      requestAnimationFrame(() => {
        this.el.fade.style.transition = 'opacity 1.2s';
        this.el.fade.style.opacity = '0';
      });
    }
  }

  TF.UI = UI;
})();
