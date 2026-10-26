/* ============================================================
   Terra Frontier — actors, lighting, cursor, title scene
   ============================================================ */
(function () {
  'use strict';
  const TF = window.TF;
  const U = TF.util;
  const T = TF.T;
  const W = TF.W;
  const TILE = TF.TILE;
  const TD = TF.TILE_DEFS;
  const SOLID = TF.SOLID;
  const R = TF.Renderer.prototype;

  function hashTile(x, y, salt) {
    return U.hash2i(x, y, 9241 + (salt || 0));
  }

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

  function mixToWhite(color, t) {
    const c = U.hexToRgb(color);
    return U.rgbStr([c[0] + (255 - c[0]) * t, c[1] + (255 - c[1]) * t, c[2] + (255 - c[2]) * t]);
  }

  // ==========================================================
  // DROPS
  // ==========================================================
  R._drawDrops = function (game, camX, camY) {
    const ctx = this.ctx;
    for (const d of game.drops) {
      if (d.dead) continue;
      const px = d.x - camX;
      const py = d.y - camY;
      if (px < -40 || px > this.w + 40 || py < -40 || py > this.h + 40) continue;
      const bob = Math.sin(d.bob) * 2;
      const item = TF.ITEMS[d.id];
      if (!item) continue;
      ctx.globalAlpha = d.life > 245 ? 0.4 + 0.6 * Math.sin(d.life * 8) : 1;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(Math.round(px - 5), Math.round(py + 4), 11, 3);
      if ((item.rarity || 0) >= 1) {
        const g = ctx.createRadialGradient(px, py + bob, 1, px, py + bob, 14);
        g.addColorStop(0, (item.rarity >= 2 ? 'rgba(188,120,255,0.23)' : 'rgba(120,190,255,0.15)'));
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(px - 15, py - 15 + bob, 30, 30);
      }
      ctx.drawImage(this.getIcon(d.id, 16), Math.round(px - 8), Math.round(py - 8 + bob));
      if (d.count > 1) {
        ctx.font = 'bold 8px "Courier New", monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = '#000';
        ctx.fillText(d.count, px + 9, py + 12 + bob);
        ctx.fillStyle = '#fff2d1';
        ctx.fillText(d.count, px + 8, py + 11 + bob);
      }
      ctx.globalAlpha = 1;
    }
  };

  // ==========================================================
  // ACTORS
  // ==========================================================
  R._drawActors = function (game, camX, camY) {
    const list = [];
    for (const e of game.enemies) {
      if (e.dead) continue;
      list.push({ y: e.y + e.h, kind: 'enemy', e });
    }
    if (game.guide) list.push({ y: game.guide.y + game.guide.h, kind: 'guide' });
    if (!game.player.dead) list.push({ y: game.player.y + game.player.h, kind: 'player' });
    list.sort((a, b) => a.y - b.y);
    for (const entry of list) {
      if (entry.kind === 'enemy') this._drawEnemy(entry.e, game, camX, camY);
      else if (entry.kind === 'guide') this._drawGuide(game.guide, game, camX, camY);
      else this._drawPlayer(game.player, game, camX, camY);
    }
  };

  R._drawPlayer = function (player, game, camX, camY) {
    const ctx = this.ctx;
    const item = game.selectedItem ? game.selectedItem() : null;
    const cx = player.centerX() - camX;
    const feetY = player.y + player.h - camY;
    const blink = player.invuln > 0 && Math.floor(player.invuln * 18) % 2 === 0;
    this._drawCharacter(ctx, cx, feetY, {
      facing: player.facing,
      walkPhase: player.walkPhase,
      onGround: player.onGround,
      aimAngle: player.aimAngle,
      swingT: player.swingT,
      swingDuration: player.swingDuration,
      swingKind: player.swingKind,
      hurtFlash: player.hurtFlash,
      itemId: item ? item.id : null,
      itemKind: item ? item.kind : null,
      alpha: blink ? 0.4 : 1,
      scale: 1,
      breath: player.breath,
    });
  };

  R._drawCharacter = function (ctx, cx, feetY, o) {
    const scale = o.scale || 1;
    const facing = o.facing || 1;
    const alpha = o.alpha != null ? o.alpha : 1;
    const flash = o.hurtFlash || 0;
    const skin = flash > 0.25 ? mixToWhite('#e6b586', 0.55) : '#e6b586';
    const skinShadow = flash > 0.25 ? mixToWhite('#bd8a60', 0.5) : '#bd8a60';
    const hair = flash > 0.25 ? mixToWhite('#5a3a22', 0.5) : '#5a3a22';
    const hairHi = flash > 0.25 ? mixToWhite('#7b5231', 0.45) : '#7b5231';
    const shirt = flash > 0.25 ? mixToWhite('#3f7397', 0.55) : '#3f7397';
    const shirtDark = flash > 0.25 ? mixToWhite('#2d546f', 0.5) : '#2d546f';
    const pants = flash > 0.25 ? mixToWhite('#363a4d', 0.5) : '#363a4d';
    const boot = flash > 0.25 ? mixToWhite('#5c3c24', 0.5) : '#5c3c24';

    ctx.save();
    ctx.translate(Math.round(cx), Math.round(feetY));
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;
    if (flash > 0.2 && ctx.filter !== undefined) {
      try { ctx.filter = 'brightness(1.45) saturate(0.7)'; } catch (e) { /* ignore */ }
    }

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-8, -1, 16, 2);
    ctx.fillRect(-5, 1, 10, 1);

    // sword trail behind the body
    const itemId = o.itemId;
    const item = itemId ? TF.ITEMS[itemId] : null;
    const isSwing = item && item.kind === 'weapon' && item.weapon === 'swing';
    if (isSwing && o.swingT > 0) {
      const p = 1 - o.swingT / (o.swingDuration || 0.4);
      const start = o.aimAngle - 1.75;
      const end = start + 2.9 * U.clamp(p * 1.3, 0, 1);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.24 * Math.sin(U.clamp(p, 0, 1) * Math.PI);
      ctx.strokeStyle = '#fff3cf';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, -21, 23, start, end);
      ctx.stroke();
      ctx.globalAlpha *= 0.7;
      ctx.strokeStyle = '#e7c071';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, -21, 27, start + 0.1, end);
      ctx.stroke();
      ctx.restore();
    }

    const walk = o.onGround ? Math.sin(o.walkPhase) : 0.45;
    const walk2 = o.onGround ? Math.sin(o.walkPhase + Math.PI) : -0.3;
    const bob = o.onGround ? Math.abs(Math.sin(o.walkPhase)) * 0.7 : 0;

    // back leg
    ctx.fillStyle = flash > 0.25 ? mixToWhite('#2b2d3c', 0.5) : '#2b2d3c';
    const leg1x = walk2 * 2.5;
    ctx.fillRect(-4 + leg1x, -11, 4, 7);
    ctx.fillRect(-5 + leg1x + (walk2 > 0 ? 1 : 0), -4, 5, 3);
    ctx.fillStyle = boot;
    ctx.fillRect(-5 + leg1x, -2, 6, 2);

    // back arm
    ctx.fillStyle = shirtDark;
    ctx.fillRect(-facing * 6 - 1, -24, 3, 8);
    ctx.fillStyle = skinShadow;
    ctx.fillRect(-facing * 6 - 1, -17, 3, 3);

    // torso
    ctx.fillStyle = '#20242a';
    ctx.fillRect(-6, -27, 12, 17);
    ctx.fillStyle = shirt;
    ctx.fillRect(-5, -26 - bob, 10, 15);
    ctx.fillStyle = shirtDark;
    ctx.fillRect(-5, -26 - bob, 2, 15);
    ctx.fillStyle = '#4d8fb2';
    ctx.fillRect(-2, -25 - bob, 1, 9);
    ctx.fillStyle = '#694a2e';
    ctx.fillRect(-5, -14 - bob, 10, 2);
    ctx.fillStyle = '#c9a55f';
    ctx.fillRect(-1, -14 - bob, 2, 2);

    // front leg
    const leg2x = walk * 2.5;
    ctx.fillStyle = pants;
    ctx.fillRect(1 + leg2x, -11, 4, 7);
    ctx.fillRect(0 + leg2x, -4, 5, 3);
    ctx.fillStyle = boot;
    ctx.fillRect(0 + leg2x, -2, 6, 2);

    // head outline + skin
    const headY = -39 - bob;
    ctx.fillStyle = '#1c1712';
    ctx.fillRect(-7, headY + 1, 14, 12);
    ctx.fillStyle = skin;
    ctx.fillRect(-6, headY + 2, 11, 10);
    ctx.fillStyle = skinShadow;
    ctx.fillRect(-6, headY + 8, 11, 3);
    ctx.fillRect(facing > 0 ? -6 : 4, headY + 2, 2, 10);

    // hair
    ctx.fillStyle = hair;
    ctx.fillRect(-7, headY, 14, 4);
    ctx.fillRect(-7, headY + 4, 3, 4);
    ctx.fillRect(4, headY + 4, 3, 3);
    ctx.fillRect(-6, headY - 1, 8, 2);
    ctx.fillStyle = hairHi;
    ctx.fillRect(-5, headY, 5, 1);
    if (facing > 0) ctx.fillRect(3, headY + 2, 2, 2);
    else ctx.fillRect(-6, headY + 2, 2, 2);

    // eyes / face
    ctx.fillStyle = '#201812';
    if (facing > 0) {
      ctx.fillRect(2, headY + 5, 2, 2);
      ctx.fillRect(-1, headY + 5, 1, 2);
      ctx.fillStyle = '#f3dfc0';
      ctx.fillRect(2, headY + 5, 1, 1);
      ctx.fillStyle = '#8f4d39';
      ctx.fillRect(1, headY + 9, 3, 1);
    } else {
      ctx.fillRect(-4, headY + 5, 2, 2);
      ctx.fillRect(1, headY + 5, 1, 2);
      ctx.fillStyle = '#f3dfc0';
      ctx.fillRect(-4, headY + 5, 1, 1);
      ctx.fillStyle = '#8f4d39';
      ctx.fillRect(-4, headY + 9, 3, 1);
    }

    // arm + held item
    const shoulderX = facing * 2;
    const shoulderY = -22 - bob;
    let armAngle = o.aimAngle != null ? o.aimAngle : 0.4;
    if (o.swingT > 0) {
      const p = 1 - o.swingT / (o.swingDuration || 0.3);
      if (o.swingKind === 'stab') armAngle = o.aimAngle;
      else armAngle = o.aimAngle - 1.5 + U.easeOutCubic(p) * 2.5;
    }
    const handX = shoulderX + Math.cos(armAngle) * 8;
    const handY = shoulderY + Math.sin(armAngle) * 8;
    // sleeve
    ctx.strokeStyle = shirtDark;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    ctx.lineTo(handX, handY);
    ctx.stroke();
    ctx.strokeStyle = skin;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(shoulderX + Math.cos(armAngle) * 3, shoulderY + Math.sin(armAngle) * 3);
    ctx.lineTo(handX, handY);
    ctx.stroke();
    ctx.fillStyle = skin;
    ctx.fillRect(Math.round(handX) - 1, Math.round(handY) - 1, 3, 3);

    if (itemId) {
      ctx.save();
      ctx.translate(Math.round(handX), Math.round(handY));
      let rot = armAngle + 0.55;
      if (item && item.kind === 'tool') rot = armAngle + 0.8;
      if (item && item.kind === 'weapon' && item.weapon === 'bow') rot = armAngle;
      if (item && item.kind === 'weapon' && item.weapon === 'magic') rot = armAngle + 0.35;
      ctx.rotate(rot);
      ctx.drawImage(this.getIcon(itemId, 16), -8, -8);
      ctx.restore();
      if (itemId === 'torch') {
        const flick = Math.sin(this.time * 12) * 1;
        ctx.fillStyle = 'rgba(255,174,75,0.25)';
        ctx.fillRect(handX - 4, handY - 7 + flick, 8, 7);
        ctx.fillStyle = '#ffd56b';
        ctx.fillRect(handX - 1, handY - 6 + flick, 2, 3);
      }
    }

    // stab trail
    if (item && item.kind === 'weapon' && item.weapon === 'stab' && o.swingT > 0) {
      const p = 1 - o.swingT / (o.swingDuration || 0.25);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.sin(p * Math.PI) * 0.5;
      ctx.fillStyle = '#fff3cc';
      const tx = Math.cos(armAngle), ty = Math.sin(armAngle);
      for (let i = 10; i < 28; i++) {
        ctx.fillRect(Math.round(tx * i - ty * 1), Math.round(shoulderY + ty * i + tx * 1), 2, 2);
      }
      ctx.restore();
    }

    if (ctx.filter !== undefined) {
      try { ctx.filter = 'none'; } catch (e) { /* ignore */ }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  };

  R._drawGuide = function (guide, game, camX, camY) {
    const ctx = this.ctx;
    const cx = guide.centerX() - camX;
    const feetY = guide.y + guide.h - camY;
    const facing = guide.facing || -1;
    const walk = guide.onGround ? Math.sin(guide.walkPhase) : 0.4;
    const bob = guide.onGround ? Math.abs(Math.sin(guide.walkPhase)) * 0.6 : 0;
    const flash = 0;
    ctx.save();
    ctx.translate(Math.round(cx), Math.round(feetY));
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-8, -1, 16, 2);
    // legs
    ctx.fillStyle = '#49341f';
    ctx.fillRect(-4 + walk * 2, -10, 4, 8);
    ctx.fillRect(1 - walk * 2, -10, 4, 8);
    ctx.fillStyle = '#2b2118';
    ctx.fillRect(-5 + walk * 2, -2, 5, 2);
    ctx.fillRect(1 - walk * 2, -2, 5, 2);
    // robe
    ctx.fillStyle = '#3b2a1b';
    ctx.fillRect(-6, -27 - bob, 12, 18);
    ctx.fillStyle = '#6e5032';
    ctx.fillRect(-5, -26 - bob, 10, 16);
    ctx.fillStyle = '#876640';
    ctx.fillRect(-4, -25 - bob, 3, 13);
    ctx.fillStyle = '#503923';
    ctx.fillRect(-5, -16 - bob, 10, 2);
    ctx.fillStyle = '#9b7b50';
    ctx.fillRect(-3, -27 - bob, 6, 1);
    // arms
    ctx.fillStyle = '#6e5032';
    ctx.fillRect(facing > 0 ? 3 : -7, -24 - bob, 4, 10);
    ctx.fillStyle = '#c59263';
    ctx.fillRect(facing > 0 ? 3 : -7, -15 - bob, 4, 3);
    // head
    const headY = -39 - bob;
    ctx.fillStyle = '#1c1712';
    ctx.fillRect(-6, headY + 1, 12, 12);
    ctx.fillStyle = '#c99567';
    ctx.fillRect(-5, headY + 2, 10, 10);
    ctx.fillStyle = '#d9a878';
    ctx.fillRect(-4, headY + 3, 7, 2);
    ctx.fillStyle = '#4a3420';
    ctx.fillRect(-6, headY, 12, 3);
    ctx.fillRect(-6, headY + 3, 2, 4);
    ctx.fillRect(4, headY + 3, 2, 3);
    ctx.fillStyle = '#5f452b';
    ctx.fillRect(-4, headY + 1, 5, 1);
    // beard & eyes
    ctx.fillStyle = '#5e432b';
    ctx.fillRect(-3, headY + 9, 7, 3);
    ctx.fillStyle = '#201812';
    ctx.fillRect(facing > 0 ? 1 : -3, headY + 6, 2, 1);
    // satchel
    ctx.fillStyle = '#49351f';
    ctx.fillRect(-7, -22 - bob, 3, 6);
    ctx.fillStyle = '#a88a56';
    ctx.fillRect(-6, -22 - bob, 1, 1);
    ctx.restore();

    if (guide.bubble > 0) {
      const bx = cx;
      const by = feetY - 54;
      const text = guide.bubbleText || '';
      ctx.font = '8px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tw = Math.min(180, ctx.measureText(text).width + 12);
      ctx.fillStyle = 'rgba(8,11,14,0.9)';
      ctx.fillRect(Math.round(bx - tw / 2), Math.round(by - 9), Math.round(tw), 16);
      ctx.strokeStyle = 'rgba(198,174,117,0.5)';
      ctx.strokeRect(Math.round(bx - tw / 2) + 0.5, Math.round(by - 9) + 0.5, Math.round(tw) - 1, 15);
      ctx.fillStyle = '#efe5c9';
      ctx.fillText(text, bx, by);
    } else if (Math.abs(game.player.centerX() - guide.centerX()) < 120) {
      ctx.font = '8px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(cx - 13, feetY - 49, 26, 11);
      ctx.fillStyle = 'rgba(218,206,170,0.8)';
      ctx.fillText(guide.name, cx, feetY - 41);
    }
  };

  R._drawEnemy = function (e, game, camX, camY) {
    const ctx = this.ctx;
    const px = e.x - camX;
    const py = e.y - camY;
    if (px < -80 || px > this.w + 80 || py < -100 || py > this.h + 80) return;
    ctx.save();
    ctx.globalAlpha = e.spawnAlpha;
    if (e.type === 'slime') this._drawSlime(ctx, e, px, py, game);
    else if (e.type === 'zombie') this._drawZombie(ctx, e, px, py, game);
    else if (e.type === 'demonEye') this._drawDemonEye(ctx, e, px, py, game);
    if (e.hpVisible > 0 && e.hp < e.maxHp) {
      const w = Math.max(20, e.w + 8);
      const hx = px + e.w / 2 - w / 2;
      const hy = py - 7;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(hx - 1, hy - 1, w + 2, 4);
      ctx.fillStyle = '#5e1f1c';
      ctx.fillRect(hx, hy, w, 2);
      ctx.fillStyle = e.type === 'zombie' ? '#a9c76b' : e.type === 'slime' ? '#71d388' : '#d87373';
      ctx.fillRect(hx, hy, w * U.clamp(e.hp / e.maxHp, 0, 1), 2);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  R._drawSlime = function (ctx, e, px, py, game) {
    const cx = px + e.w / 2;
    const base = py + e.h;
    const squash = U.clamp(e.squash || 0, 0, 1);
    const rx = (e.w / 2) * (1 + squash * 0.14);
    const ry = (e.h / 2) * (1 - squash * 0.18);
    const flash = e.flash > 0.1;
    const body = flash ? '#dcffe0' : '#63b96d';
    const dark = flash ? '#8ed49a' : '#397d4b';
    const light = flash ? '#f4fff2' : '#a2e6a8';
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(cx - rx * 0.8, base - 1, rx * 1.6, 2);
    this._pixelEllipse(ctx, cx, base - ry, rx + 1, ry + 1, dark);
    this._pixelEllipse(ctx, cx, base - ry - 1, rx, ry, body);
    this._pixelEllipse(ctx, cx - rx * 0.2, base - ry - 1, rx * 0.62, ry * 0.62, light);
    ctx.globalAlpha *= 0.55;
    ctx.fillStyle = '#d8ffe0';
    ctx.fillRect(cx - rx * 0.34, base - ry * 1.5, 3, 1);
    ctx.globalAlpha = e.spawnAlpha;
    // eyes face player
    const dir = game.player.centerX() > cx ? 1 : -1;
    const eyeY = base - ry * 1.25;
    ctx.fillStyle = '#17220f';
    ctx.fillRect(cx - 5 + dir * 1, eyeY, 3, 3);
    ctx.fillRect(cx + 3 + dir * 1, eyeY, 3, 3);
    ctx.fillStyle = '#eaffd9';
    ctx.fillRect(cx - 4 + dir * 1, eyeY, 1, 1);
    ctx.fillRect(cx + 4 + dir * 1, eyeY, 1, 1);
    ctx.fillStyle = '#2a4e2a';
    ctx.fillRect(cx - 2, eyeY + 5, 4, 1);
    // little crown-like glints
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(cx - rx * 0.46, base - ry * 1.35, 2, 1);
  };

  R._pixelEllipse = function (ctx, cx, cy, rx, ry, color) {
    ctx.fillStyle = color;
    const y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
    for (let y = y0; y <= y1; y++) {
      const p = 1 - ((y - cy) * (y - cy)) / (ry * ry);
      if (p < 0) continue;
      const half = Math.round(Math.sqrt(p) * rx);
      ctx.fillRect(Math.round(cx - half), y, half * 2 + 1, 1);
    }
  };

  R._drawZombie = function (ctx, e, px, py, game) {
    const cx = px + e.w / 2;
    const base = py + e.h;
    const dir = game.player.centerX() > cx ? 1 : -1;
    const walk = Math.sin(e.walkPhase);
    const flash = e.flash > 0.1;
    const skin = flash ? '#e8ffd2' : '#8ca666';
    const skinDark = flash ? '#b6d19b' : '#607b45';
    const shirt = flash ? '#d4d4c4' : '#4d5147';
    const shirtDark = flash ? '#a7b19f' : '#363b34';
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(cx - 8, base - 1, 16, 2);
    // legs
    ctx.fillStyle = shirtDark;
    ctx.fillRect(cx - 5 + walk * 2, base - 15, 4, 11);
    ctx.fillRect(cx + 1 - walk * 2, base - 15, 4, 11);
    ctx.fillStyle = skinDark;
    ctx.fillRect(cx - 6 + walk * 2, base - 5, 6, 4);
    ctx.fillRect(cx + 1 - walk * 2, base - 5, 6, 4);
    // tattered shirt torso
    ctx.fillStyle = '#252822';
    ctx.fillRect(cx - 7, base - 29, 14, 16);
    ctx.fillStyle = shirt;
    ctx.fillRect(cx - 6, base - 28, 12, 14);
    ctx.fillStyle = shirtDark;
    ctx.fillRect(cx - 6, base - 16, 12, 3);
    // tears
    ctx.fillStyle = '#252822';
    ctx.fillRect(cx - 6, base - 21, 1, 3);
    ctx.fillRect(cx + 4, base - 25, 1, 4);
    ctx.fillRect(cx - 2, base - 15, 2, 1);
    ctx.fillStyle = '#7d2925';
    ctx.fillRect(cx + 2, base - 24, 2, 1);
    // exposed belly
    ctx.fillStyle = skinDark;
    ctx.fillRect(cx - 3, base - 17, 4, 2);
    // arms reaching
    const armY = base - 25;
    ctx.fillStyle = skinDark;
    ctx.fillRect(cx + dir * 3, armY, dir * 11, 4);
    ctx.fillRect(cx + dir * 13, armY - 1, dir * 4, 4);
    ctx.fillStyle = skin;
    ctx.fillRect(cx + dir * 5, armY, dir * 7, 2);
    ctx.fillRect(cx + dir * 15, armY, dir * 3, 2);
    ctx.fillStyle = '#2f352b';
    ctx.fillRect(cx + dir * 17, armY + 1, 1, 1);
    // other arm
    ctx.fillStyle = skinDark;
    ctx.fillRect(cx - dir * 8, armY + 4, dir * 4, 9);
    ctx.fillStyle = skin;
    ctx.fillRect(cx - dir * 7, armY + 5, dir * 2, 6);
    // head
    const hy = base - 41;
    ctx.fillStyle = '#262a20';
    ctx.fillRect(cx - 6, hy, 12, 12);
    ctx.fillStyle = skin;
    ctx.fillRect(cx - 5, hy + 1, 10, 10);
    ctx.fillStyle = skinDark;
    ctx.fillRect(cx - 5, hy + 8, 10, 3);
    // hair patch
    ctx.fillStyle = '#2f2c24';
    ctx.fillRect(cx - 6, hy - 1, 12, 3);
    ctx.fillRect(cx - 6, hy + 2, 2, 2);
    // eyes
    ctx.fillStyle = flash ? '#5c1f1f' : '#d5e8b1';
    ctx.fillRect(cx + dir * 1, hy + 5, 2, 2);
    ctx.fillRect(cx - dir * 3, hy + 5, 2, 2);
    ctx.fillStyle = '#1d1a13';
    ctx.fillRect(cx + dir * 2, hy + 5, 1, 2);
    // mouth
    ctx.fillStyle = '#3b2b24';
    ctx.fillRect(cx - 2, hy + 9, 5, 1);
    ctx.fillStyle = '#e8d7b0';
    ctx.fillRect(cx, hy + 9, 1, 1);
    // burn fire
    if (e.def.night && !game.isNight && e.life > 3) {
      const f = Math.sin(this.time * 18 + e.noiseSeed);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,157,66,0.7)';
      ctx.fillRect(cx - 4, hy - 3 + f, 2, 4);
      ctx.fillRect(cx + 2, hy - 5 - f, 2, 5);
      ctx.fillStyle = 'rgba(255,231,140,0.8)';
      ctx.fillRect(cx - 1, hy - 2, 1, 2);
      ctx.globalCompositeOperation = 'source-over';
    }
  };

  R._drawDemonEye = function (ctx, e, px, py, game) {
    const cx = px + e.w / 2;
    const cy = py + e.h / 2;
    const flash = e.flash > 0.1;
    const wing = Math.sin(e.wingPhase) * 5;
    // wings
    ctx.fillStyle = flash ? '#f2d6d6' : '#74313c';
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy - 1);
    ctx.lineTo(cx - 21, cy - 8 - wing);
    ctx.lineTo(cx - 17, cy + 2);
    ctx.lineTo(cx - 23, cy + 8 + wing);
    ctx.lineTo(cx - 6, cy + 5);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 4, cy - 1);
    ctx.lineTo(cx + 21, cy - 8 + wing);
    ctx.lineTo(cx + 17, cy + 2);
    ctx.lineTo(cx + 23, cy + 8 - wing);
    ctx.lineTo(cx + 6, cy + 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = flash ? '#fff0f0' : '#4a1e27';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 5, cy);
    ctx.lineTo(cx - 19, cy - 6 - wing);
    ctx.moveTo(cx + 5, cy);
    ctx.lineTo(cx + 19, cy - 6 + wing);
    ctx.stroke();
    // eye shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 2, 12, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    // eyeball
    this._pixelEllipse(ctx, cx, cy, 10, 8, flash ? '#fff8ec' : '#d8cfb1');
    this._pixelEllipse(ctx, cx, cy - 1, 9, 6.5, flash ? '#fffdf4' : '#eee4c7');
    // veins
    ctx.strokeStyle = flash ? '#ffc0c0' : '#a34a51';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy - 3); ctx.lineTo(cx - 4, cy - 1); ctx.lineTo(cx - 1, cy - 3);
    ctx.moveTo(cx + 7, cy + 3); ctx.lineTo(cx + 4, cy + 1);
    ctx.stroke();
    // iris follows player
    const dx = game.player.centerX() - (e.x + e.w / 2);
    const dy = game.player.centerY() - (e.y + e.h / 2);
    const ang = Math.atan2(dy, dx);
    const ix = cx + Math.cos(ang) * 2.5;
    const iy = cy + Math.sin(ang) * 2.5;
    this._pixelEllipse(ctx, ix, iy, 4.5, 4.5, flash ? '#ffb0a8' : '#974b4b');
    this._pixelEllipse(ctx, ix, iy, 2.4, 2.6, '#281518');
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(Math.round(ix - 2), Math.round(iy - 2), 1, 1);
    // little lashes
    ctx.fillStyle = flash ? '#fff' : '#bcae8b';
    ctx.fillRect(cx - 7, cy + 7, 2, 1);
    ctx.fillRect(cx + 5, cy + 7, 2, 1);
  };

  // ==========================================================
  // PROJECTILES
  // ==========================================================
  R._drawProjectiles = function (game, camX, camY) {
    const ctx = this.ctx;
    for (const p of game.projectiles) {
      if (p.dead) continue;
      const px = p.x - camX, py = p.y - camY;
      if (px < -30 || px > this.w + 30 || py < -30 || py > this.h + 30) continue;
      if (p.type === 'arrow') {
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(p.angle);
        ctx.fillStyle = '#5a4025';
        ctx.fillRect(-7, -1, 13, 2);
        ctx.fillStyle = '#d5c9a9';
        ctx.fillRect(5, -1, 4, 2);
        ctx.fillStyle = '#f1ead7';
        ctx.fillRect(8, 0, 1, 1);
        ctx.fillStyle = '#b28d59';
        ctx.fillRect(-8, -2, 3, 1);
        ctx.fillRect(-8, 1, 3, 1);
        ctx.restore();
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = '#fff0c0';
        ctx.fillRect(px - 8, py, 8, 1);
        ctx.globalAlpha = 1;
      } else if (p.type === 'magic') {
        const pulse = 0.7 + 0.3 * Math.sin(this.time * 18);
        const g = ctx.createRadialGradient(px, py, 1, px, py, 22);
        g.addColorStop(0, 'rgba(214,155,255,0.5)');
        g.addColorStop(0.5, 'rgba(155,85,224,0.18)');
        g.addColorStop(1, 'rgba(100,50,170,0)');
        ctx.fillStyle = g;
        ctx.fillRect(px - 22, py - 22, 44, 44);
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = '#7e44b5';
        ctx.fillRect(px - 4 * pulse, py - 4 * pulse, 8 * pulse, 8 * pulse);
        ctx.fillStyle = '#d7a8ff';
        ctx.fillRect(px - 3, py - 3, 6, 6);
        ctx.fillStyle = '#fbf1ff';
        ctx.fillRect(px - 1, py - 1, 2, 2);
        ctx.globalAlpha = 1;
      }
    }
  };

  // ==========================================================
  // LIGHTING
  // ==========================================================
  R._drawLighting = function (game, camX, camY) {
    const ctx = this.ctx;
    const world = game.world;
    const pad = 3;
    const minTX = Math.floor(camX / TILE) - pad;
    const minTY = Math.floor(camY / TILE) - pad;
    const cols = Math.ceil(this.w / TILE) + pad * 2 + 2;
    const rows = Math.ceil(this.h / TILE) + pad * 2 + 2;
    const levels = new Float32Array(cols * rows);
    const queue = [];
    const sky = game.skyLight;
    const localIndex = (x, y) => {
      const lx = x - minTX, ly = y - minTY;
      if (lx < 0 || ly < 0 || lx >= cols || ly >= rows) return -1;
      return ly * cols + lx;
    };
    const setLight = (x, y, level) => {
      const i = localIndex(x, y);
      if (i < 0) return;
      if (level > levels[i] + 0.02) {
        levels[i] = level;
        queue.push(i);
      }
    };
    // sky seeding
    for (let ly = 0; ly < rows; ly++) {
      const wy = minTY + ly;
      if (wy < 0) continue;
      for (let lx = 0; lx < cols; lx++) {
        const wx = minTX + lx;
        if (wx < 0 || wx >= world.w) continue;
        if (wy < world.surface[wx]) {
          const i = ly * cols + lx;
          levels[i] = sky;
          queue.push(i);
        }
      }
    }
    // player light
    const playerLight = 3.2 + game.nightFactor * 1.8;
    setLight(Math.floor(game.player.centerX() / TILE), Math.floor(game.player.centerY() / TILE), playerLight);
    // held torch
    const selected = game.selectedItem ? game.selectedItem() : null;
    if (selected && (selected.id === 'torch' || selected.id === 'campfire')) {
      setLight(Math.floor(game.player.centerX() / TILE), Math.floor(game.player.centerY() / TILE), 8);
    }
    // world objects & decor
    const sources = world.collectLightSources(minTX - 1, minTY - 1, minTX + cols + 1, minTY + rows + 1);
    for (const s of sources) {
      const flicker = s.flicker ? 1 + Math.sin(this.time * 9 + s.seed) * 0.06 * s.flicker : 1;
      setLight(Math.floor(s.x), Math.floor(s.y), s.level * flicker);
    }
    // magic projectiles
    for (const p of game.projectiles) {
      if (!p.dead && p.type === 'magic') setLight(Math.floor(p.x / TILE), Math.floor(p.y / TILE), 7);
    }
    // BFS
    let head = 0;
    while (head < queue.length) {
      const i = queue[head++];
      const lx = i % cols;
      const ly = (i / cols) | 0;
      const wx = minTX + lx;
      const wy = minTY + ly;
      if (wx < 0 || wy < 0 || wx >= world.w || wy >= world.h) continue;
      const level = levels[i];
      if (level <= 0.6) continue;
      for (let d = 0; d < 4; d++) {
        const nx = wx + (d === 0 ? 1 : d === 1 ? -1 : 0);
        const ny = wy + (d === 2 ? 1 : d === 3 ? -1 : 0);
        const ni = localIndex(nx, ny);
        if (ni < 0) continue;
        let atten = 1.0;
        const tile = world.getTile(nx, ny);
        if (SOLID[tile]) atten = 2.65;
        else if (world.getWall(nx, ny) !== W.NONE) atten = 1.14;
        if (world.isObjectSolidAt(nx, ny)) atten = 2.3;
        const nl = level - atten;
        if (nl > levels[ni] + 0.02) {
          levels[ni] = nl;
          queue.push(ni);
        }
      }
    }
    // render smoothed darkness map
    if (!this.lightCanvas || this.lightCanvas.width !== cols || this.lightCanvas.height !== rows) {
      this.lightCanvas = U.makeCanvas(cols, rows);
      this.lightCtx = this.lightCanvas.getContext('2d');
    }
    const img = this.lightCtx.createImageData(cols, rows);
    const data = img.data;
    for (let ly = 0; ly < rows; ly++) {
      const wy = minTY + ly;
      for (let lx = 0; lx < cols; lx++) {
        const wx = minTX + lx;
        const idx = ly * cols + lx;
        const j = idx * 4;
        let alpha;
        if (wx < 0 || wx >= world.w || wy < 0) {
          alpha = 0;
        } else if (wy < world.surface[wx]) {
          // open sky is never cave-dark, but night still washes the whole scene
          alpha = game.nightFactor * 0.30;
        } else {
          const ratio = U.clamp(levels[idx] / 15, 0, 1);
          alpha = 1 - Math.pow(ratio, 0.63);
          alpha = U.clamp(alpha * 0.965, 0, 0.955);
          // soften the very first row beneath the surface
          if (wy === world.surface[wx]) alpha *= 0.72;
        }
        data[j] = 4;
        data[j + 1] = 8;
        data[j + 2] = 19;
        data[j + 3] = (alpha * 255) | 0;
      }
    }
    this.lightCtx.putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.lightCanvas, minTX * TILE - camX, minTY * TILE - camY, cols * TILE, rows * TILE);
    ctx.restore();
    ctx.imageSmoothingEnabled = false;
  };

  R._drawGlows = function (game, camX, camY) {
    const ctx = this.ctx;
    const world = game.world;
    const sources = world.collectLightSources(
      Math.floor(camX / TILE) - 2, Math.floor(camY / TILE) - 2,
      Math.ceil((camX + this.w) / TILE) + 2, Math.ceil((camY + this.h) / TILE) + 2
    );
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of sources) {
      const px = s.x * TILE - camX;
      const py = s.y * TILE - camY;
      if (px < -100 || px > this.w + 100 || py < -100 || py > this.h + 100) continue;
      const flick = s.flicker ? 1 + Math.sin(this.time * 10 + s.seed) * 0.08 * s.flicker : 1;
      const radius = s.level * TILE * 0.85 * flick;
      const g = ctx.createRadialGradient(px, py, 2, px, py, radius);
      const c = U.hexToRgb(s.color || '#ffc06b');
      g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},0.24)`);
      g.addColorStop(0.4, `rgba(${c[0]},${c[1]},${c[2]},0.08)`);
      g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(px - radius, py - radius, radius * 2, radius * 2);
    }
    const p = game.player;
    const held = game.selectedItem ? game.selectedItem() : null;
    if (held && held.id === 'torch') {
      const px = p.centerX() - camX;
      const py = p.centerY() - 2 - camY;
      const g = ctx.createRadialGradient(px, py, 2, px, py, 115);
      g.addColorStop(0, 'rgba(255,196,104,0.2)');
      g.addColorStop(0.5, 'rgba(255,150,56,0.07)');
      g.addColorStop(1, 'rgba(255,140,50,0)');
      ctx.fillStyle = g;
      ctx.fillRect(px - 115, py - 115, 230, 230);
    }
    for (const proj of game.projectiles) {
      if (proj.dead || proj.type !== 'magic') continue;
      const px = proj.x - camX, py = proj.y - camY;
      const g = ctx.createRadialGradient(px, py, 1, px, py, 46);
      g.addColorStop(0, 'rgba(190,120,255,0.25)');
      g.addColorStop(1, 'rgba(130,60,200,0)');
      ctx.fillStyle = g;
      ctx.fillRect(px - 46, py - 46, 92, 92);
    }
    ctx.restore();
  };

  // ==========================================================
  // WEATHER
  // ==========================================================
  R._initRain = function () {
    const rng = new TF.RNG('rain-' + this.w + 'x' + this.h);
    this.rainDrops = [];
    for (let i = 0; i < 310; i++) {
      this.rainDrops.push({
        x: rng.range(-30, this.w + 30),
        y: rng.range(0, this.h),
        len: rng.range(5, 13),
        speed: rng.range(480, 800),
        a: rng.range(0.1, 0.45),
        d: rng.range(-1, 1),
      });
    }
    this.rainInit = true;
  };

  R._drawWeather = function (game, dt) {
    if (!game.weather || game.weather.rain <= 0.01) return;
    if (!game.player) return;
    const playerTx = U.clamp(Math.floor(game.player.centerX() / TILE), 0, game.world.w - 1);
    const playerAbove = game.player.centerY() < (game.world.surface[playerTx] + 1) * TILE;
    if (!playerAbove) return;
    if (!this.rainInit) this._initRain();
    const ctx = this.ctx;
    const rain = game.weather.rain;
    const wind = game.weather.wind || 0;
    ctx.save();
    ctx.strokeStyle = `rgba(188,216,228,${0.24 * rain})`;
    ctx.lineWidth = 1;
    for (const d of this.rainDrops) {
      d.y += d.speed * dt;
      d.x += (wind * 28 + d.d) * dt * 30;
      if (d.y > this.h + 20) {
        d.y = -20 - Math.random() * 40;
        d.x = Math.random() * (this.w + 60) - 30;
      }
      if (d.x < -30) d.x = this.w + 20;
      if (d.x > this.w + 30) d.x = -20;
      const alpha = d.a * rain;
      ctx.strokeStyle = `rgba(190,218,230,${alpha})`;
      ctx.beginPath();
      ctx.moveTo(Math.round(d.x), Math.round(d.y));
      ctx.lineTo(Math.round(d.x - wind * 4 - d.d * 2), Math.round(d.y + d.len));
      ctx.stroke();
    }
    // mist near the ground
    const grad = ctx.createLinearGradient(0, this.h * 0.62, 0, this.h);
    grad.addColorStop(0, 'rgba(110,135,145,0)');
    grad.addColorStop(1, `rgba(110,135,145,${0.12 * rain})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, this.h * 0.62, this.w, this.h * 0.38);
    if (game.weather.flash > 0) {
      ctx.fillStyle = `rgba(220,235,245,${game.weather.flash * 0.32})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    ctx.restore();
  };

  // ==========================================================
  // CURSOR & BUILD PREVIEW
  // ==========================================================
  R._drawCursor = function (game, camX, camY) {
    if (!game.cursorActive) return;
    const ctx = this.ctx;
    const mouse = game.mouseScreen;
    const prev = game.placePreview;
    if (prev) {
      if (prev.kind === 'block') {
        const variants = this.tileAtlas[prev.tileId];
        if (variants) {
          ctx.save();
          ctx.globalAlpha = 0.62;
          ctx.drawImage(variants[(hashTile(prev.x, prev.y, 8) * 4 | 0) % 4], prev.x * TILE - camX, prev.y * TILE - camY);
          ctx.restore();
        }
        ctx.strokeStyle = prev.valid ? 'rgba(158,235,131,0.9)' : 'rgba(236,103,87,0.9)';
        ctx.lineWidth = 1;
        ctx.strokeRect(prev.x * TILE - camX + 0.5, prev.y * TILE - camY + 0.5, TILE - 1, TILE - 1);
      } else if (prev.kind === 'wall') {
        const variants = this.wallAtlas[prev.wallId];
        if (variants) {
          ctx.save();
          ctx.globalAlpha = 0.62;
          ctx.drawImage(variants[(hashTile(prev.x, prev.y, 3) * 4 | 0) % 4], prev.x * TILE - camX, prev.y * TILE - camY);
          ctx.restore();
        }
        ctx.strokeStyle = prev.valid ? 'rgba(158,235,131,0.9)' : 'rgba(236,103,87,0.9)';
        ctx.lineWidth = 1;
        ctx.strokeRect(prev.x * TILE - camX + 0.5, prev.y * TILE - camY + 0.5, TILE - 1, TILE - 1);
      } else if (prev.kind === 'object') {
        const def = TF.OBJECT_DEFS[prev.objectType];
        if (def) {
          const fake = { type: prev.objectType, open: false, animSeed: 1.2, def };
          this.drawObject(fake, prev.x * TILE - camX, prev.y * TILE - camY, 0.6, prev.valid ? '#a7df88' : '#e56f5d');
          ctx.strokeStyle = prev.valid ? 'rgba(158,235,131,0.75)' : 'rgba(236,103,87,0.8)';
          ctx.lineWidth = 1;
          for (let yy = prev.y; yy < prev.y + def.h; yy++) {
            for (let xx = prev.x; xx < prev.x + def.w; xx++) {
              ctx.strokeRect(xx * TILE - camX + 0.5, yy * TILE - camY + 0.5, TILE - 1, TILE - 1);
            }
          }
        }
      }
    }
    // target highlight for current mining target
    if (game.mining && game.mining.progress > 0.01 && game.mining.tx != null) {
      const t = game.mining;
      ctx.strokeStyle = 'rgba(255,240,188,0.55)';
      ctx.lineWidth = 1;
      ctx.strokeRect(t.tx * TILE - camX + 0.5, t.ty * TILE - camY + 0.5, TILE - 1, TILE - 1);
    }
    const x = Math.round(mouse.x);
    const y = Math.round(mouse.y);
    const active = game.cursorTone || '#f5e6b5';
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#1b140c';
    ctx.fillRect(x - 7, y - 1, 4, 2);
    ctx.fillRect(x + 4, y - 1, 4, 2);
    ctx.fillRect(x - 1, y - 7, 2, 4);
    ctx.fillRect(x - 1, y + 4, 2, 4);
    ctx.fillStyle = active;
    ctx.fillRect(x - 6, y - 1, 3, 1);
    ctx.fillRect(x + 4, y - 1, 3, 1);
    ctx.fillRect(x - 1, y - 6, 1, 3);
    ctx.fillRect(x - 1, y + 4, 1, 3);
    ctx.fillRect(x - 1, y - 1, 2, 2);
    ctx.restore();
  };

  // ==========================================================
  // CHARACTER PORTRAIT
  // ==========================================================
  R.drawPortrait = function (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    // backdrop arc
    const g = ctx.createRadialGradient(canvas.width / 2, canvas.height * 0.7, 5, canvas.width / 2, canvas.height * 0.7, canvas.width * 0.7);
    g.addColorStop(0, 'rgba(112,138,84,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this._drawCharacter(ctx, canvas.width / 2, canvas.height - 12, {
      facing: 1, walkPhase: 0, onGround: true, aimAngle: 0.65,
      swingT: 0, swingDuration: 0.3, swingKind: 'swing', hurtFlash: 0,
      itemId: 'copperPick', itemKind: 'tool', alpha: 1, scale: 3.3, breath: 0,
    });
  };

  // ==========================================================
  // TITLE SCENE
  // ==========================================================
  R.drawTitle = function (elapsed) {
    this.time = elapsed;
    const ctx = this.ctx;
    const w = this.w, h = this.h;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);

    // dusk gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#080d1e');
    grad.addColorStop(0.33, '#222852');
    grad.addColorStop(0.55, '#6e4b66');
    grad.addColorStop(0.72, '#c4795c');
    grad.addColorStop(0.82, '#d19a6d');
    grad.addColorStop(1, '#1b2c27');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // stars
    for (const s of titleStars) {
      const tw = 0.45 + 0.55 * Math.sin(elapsed * 1.3 + s.p);
      ctx.globalAlpha = s.b * tw * (1 - s.y);
      ctx.fillStyle = s.s > 1 ? '#fff4cc' : '#c9d9f3';
      const x = ((s.x * w - elapsed * 1.5) % w + w) % w;
      ctx.fillRect(Math.floor(x), Math.floor(s.y * h), s.s, s.s);
    }
    ctx.globalAlpha = 1;

    // moon
    const mx = w * 0.73, my = h * 0.24;
    const mg = ctx.createRadialGradient(mx, my, 4, mx, my, 170);
    mg.addColorStop(0, 'rgba(255,238,192,0.4)');
    mg.addColorStop(0.25, 'rgba(255,215,157,0.12)');
    mg.addColorStop(1, 'rgba(255,200,140,0)');
    ctx.fillStyle = mg;
    ctx.fillRect(mx - 170, my - 170, 340, 340);
    if (!this._titleMoon) {
      const c = U.makeCanvas(84, 84);
      const cc = c.getContext('2d');
      for (let yy = -22; yy <= 22; yy++) {
        const p = 1 - (yy * yy) / (22 * 22);
        if (p < 0) continue;
        const half = Math.round(Math.sqrt(p) * 22);
        cc.fillStyle = '#f2e5bd';
        cc.fillRect(42 - half, 42 + yy, half * 2, 1);
      }
      cc.fillStyle = 'rgba(179,165,128,0.42)';
      cc.fillRect(36, 36, 4, 4);
      cc.fillRect(46, 47, 5, 3);
      cc.fillRect(33, 51, 3, 2);
      this._titleMoon = c;
    }
    ctx.globalAlpha = 0.95;
    ctx.drawImage(this._titleMoon, mx - 42, my - 42);
    ctx.globalAlpha = 1;

    // clouds
    for (const c of titleClouds) {
      const x = ((c.x * w + elapsed * c.sp) % (w + 200)) - 100;
      const y = c.y * h;
      ctx.globalAlpha = c.a * 1.4;
      ctx.fillStyle = '#4a405b';
      for (const p of c.parts) {
        ctx.fillRect(Math.round(x + p.x - p.w / 2), Math.round(y + p.y - p.h / 2), p.w, p.h);
      }
      ctx.globalAlpha = c.a;
      ctx.fillStyle = '#836a7b';
      for (const p of c.parts) {
        ctx.fillRect(Math.round(x + p.x - p.w / 2), Math.round(y + p.y - p.h / 2), p.w, 1);
      }
    }
    ctx.globalAlpha = 1;

    // distant mountains
    const layers = [
      { base: h * 0.63, amp: 30, col: '#252c43', freq: 0.0055, speed: 0.6, alpha: 0.75 },
      { base: h * 0.72, amp: 38, col: '#19282f', freq: 0.009, speed: 1.0, alpha: 0.85 },
      { base: h * 0.82, amp: 26, col: '#10211e', freq: 0.015, speed: 1.5, alpha: 0.95 },
    ];
    for (let i = 0; i < layers.length; i++) {
      const L = layers[i];
      ctx.globalAlpha = L.alpha;
      ctx.fillStyle = L.col;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w + 14; x += 14) {
        const n = U.fbm1((x + elapsed * L.speed) * L.freq, 400 + i * 77, 4);
        ctx.lineTo(x, L.base - n * L.amp - Math.max(0, U.fbm1((x + elapsed * L.speed) * L.freq * 3, 91 + i, 2) - 0.55) * 30);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // foreground ground
    const groundY = h * 0.81;
    ctx.fillStyle = '#0c1715';
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w + 10; x += 10) {
      const yy = groundY + Math.sin(x * 0.013 + 1.2) * 7 + Math.sin(x * 0.037) * 2;
      ctx.lineTo(x, yy);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#24372b';
    for (let x = 0; x < w; x += 4) {
      const yy = groundY + Math.sin(x * 0.013 + 1.2) * 7 + Math.sin(x * 0.037) * 2;
      if (Math.sin(x * 0.7) > 0.2) ctx.fillRect(x, yy, 1, 1 + ((x * 7) % 4));
    }

    // pines around the scene
    this._titlePine(ctx, w * 0.12, groundY + 16, 0.95, 0.8);
    this._titlePine(ctx, w * 0.22, groundY + 21, 0.6, 0.9);
    this._titlePine(ctx, w * 0.86, groundY + 10, 1.2, 1);
    this._titlePine(ctx, w * 0.94, groundY + 24, 0.8, 0.85);
    this._titlePine(ctx, w * 0.56, groundY + 3, 0.55, 0.92);

    // little cabin
    this._titleCabin(ctx, w * 0.73, groundY - 7, elapsed);

    // traveler silhouette with lantern
    const tx = w * 0.58, ty = groundY + Math.sin(w * 0.013 + 1.2) * 0 - 2;
    this._titleTraveler(ctx, tx, ty + 12, elapsed);

    // fireflies
    for (const f of titleFlies) {
      const x = f.x * w + Math.sin(elapsed * 0.5 + f.p) * 14;
      const y = f.y * h + Math.cos(elapsed * 0.7 + f.p) * 8;
      const a = 0.25 + 0.6 * (0.5 + 0.5 * Math.sin(elapsed * 2.1 + f.p));
      ctx.globalAlpha = a;
      ctx.fillStyle = '#e9f59b';
      ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
      ctx.globalAlpha = a * 0.18;
      ctx.fillStyle = '#d9ff9a';
      ctx.fillRect(Math.round(x) - 3, Math.round(y) - 3, 8, 8);
    }
    ctx.globalAlpha = 1;

    // drifting leaves
    for (let i = 0; i < 12; i++) {
      const x = ((i * 137 + elapsed * (8 + i * 1.5)) % (w + 40)) - 20;
      const y = h * 0.55 + Math.sin(elapsed * 0.8 + i * 1.7) * 26 + i * 9;
      ctx.globalAlpha = 0.2 + 0.3 * Math.sin(elapsed + i);
      ctx.fillStyle = i % 3 === 0 ? '#d6975d' : '#a96b4b';
      ctx.fillRect(Math.round(x), Math.round(y), 2, 1);
    }
    ctx.globalAlpha = 1;

    // gentle bottom shade
    const btm = ctx.createLinearGradient(0, h * 0.72, 0, h);
    btm.addColorStop(0, 'rgba(2,5,6,0)');
    btm.addColorStop(1, 'rgba(2,5,6,0.6)');
    ctx.fillStyle = btm;
    ctx.fillRect(0, h * 0.72, w, h * 0.28);
  };

  R._titlePine = function (ctx, x, y, scale, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#091210';
    ctx.fillRect(-2, -35, 4, 35);
    for (let i = 0; i < 4; i++) {
      const yy = -12 - i * 14;
      const w = 26 - i * 4;
      ctx.beginPath();
      ctx.moveTo(0, yy - 22);
      ctx.lineTo(-w, yy + 11);
      ctx.lineTo(w, yy + 11);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(48,72,55,0.6)';
    ctx.fillRect(-2, -36, 1, 22);
    ctx.restore();
  };

  R._titleCabin = function (ctx, x, y, elapsed) {
    ctx.save();
    ctx.translate(x, y);
    // foundation
    ctx.fillStyle = '#152019';
    ctx.fillRect(-60, 18, 120, 8);
    ctx.fillStyle = '#332a21';
    ctx.fillRect(-50, -12, 100, 38);
    // walls
    ctx.fillStyle = '#263029';
    ctx.fillRect(-49, -11, 98, 34);
    for (let yy = -9; yy < 22; yy += 6) {
      ctx.fillStyle = '#1b241f';
      ctx.fillRect(-49, yy, 98, 1);
    }
    // roof
    ctx.fillStyle = '#0c1512';
    ctx.beginPath();
    ctx.moveTo(-64, -8);
    ctx.lineTo(0, -50);
    ctx.lineTo(64, -8);
    ctx.lineTo(48, -2);
    ctx.lineTo(0, -39);
    ctx.lineTo(-48, -2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1d2a24';
    ctx.fillRect(-60, -9, 120, 4);
    // door
    ctx.fillStyle = '#0a0e0c';
    ctx.fillRect(14, 1, 17, 22);
    ctx.fillStyle = '#4e3a26';
    ctx.fillRect(15, 2, 15, 21);
    ctx.fillStyle = '#7b5a36';
    ctx.fillRect(16, 3, 13, 1);
    ctx.fillStyle = '#d8b36a';
    ctx.fillRect(27, 13, 1, 1);
    // warm windows
    const glow = 0.75 + 0.25 * Math.sin(elapsed * 3.3);
    ctx.fillStyle = `rgba(255,175,76,${0.18 * glow})`;
    ctx.fillRect(-22, 1, 24, 18);
    ctx.fillStyle = '#f5ae4e';
    ctx.fillRect(-20, 2, 20, 15);
    ctx.fillStyle = '#ffe09a';
    ctx.fillRect(-18, 4, 7, 5);
    ctx.fillRect(-9, 4, 6, 5);
    ctx.fillStyle = '#332316';
    ctx.fillRect(-11, 2, 1, 15);
    ctx.fillRect(-20, 9, 20, 1);
    // chimney
    ctx.fillStyle = '#1a221e';
    ctx.fillRect(30, -38, 9, 25);
    ctx.fillStyle = 'rgba(200,200,190,0.12)';
    const smoke = (elapsed * 14) % 40;
    ctx.fillRect(32 + Math.sin(elapsed) * 3, -42 - smoke, 5, 6);
    ctx.fillRect(35 + Math.sin(elapsed * 1.3) * 4, -50 - smoke, 7, 7);
    // fence
    ctx.fillStyle = '#19231d';
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(-100 + i * 18, 14, 2, 10);
      ctx.fillRect(-100 + i * 18, 17, 17, 2);
      ctx.fillRect(-100 + i * 18, 21, 17, 1);
    }
    ctx.restore();
  };

  R._titleTraveler = function (ctx, x, y, elapsed) {
    ctx.save();
    ctx.translate(x, y);
    const sway = Math.sin(elapsed * 1.2) * 0.3;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-9, 1, 18, 2);
    // legs
    ctx.fillStyle = '#0b1210';
    ctx.fillRect(-4, -13, 3, 13);
    ctx.fillRect(1, -13, 3, 13);
    // cloak
    ctx.fillStyle = '#0a1210';
    ctx.fillRect(-7, -33, 14, 21);
    ctx.fillStyle = '#14211b';
    ctx.fillRect(-6, -32, 12, 19);
    ctx.fillStyle = '#1d3026';
    ctx.fillRect(-5, -30, 2, 15);
    // head
    ctx.fillStyle = '#0b1210';
    ctx.fillRect(-6, -42, 12, 11);
    ctx.fillStyle = '#223027';
    ctx.fillRect(-5, -41, 10, 9);
    // lantern
    const flick = 0.8 + 0.2 * Math.sin(elapsed * 4);
    ctx.fillStyle = 'rgba(255,192,96,0.15)';
    ctx.fillRect(9, -25, 18, 15);
    ctx.fillStyle = `rgba(255,180,80,${0.7 * flick})`;
    ctx.fillRect(14, -23, 4, 6);
    ctx.fillStyle = '#f9e2a4';
    ctx.fillRect(15, -22, 2, 2);
    ctx.fillStyle = '#2c2418';
    ctx.fillRect(15, -29, 1, 6);
    ctx.fillRect(12, -28, 8, 1);
    // pickaxe silhouette
    ctx.strokeStyle = '#0a1210';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-6, -24);
    ctx.lineTo(-16, -37);
    ctx.stroke();
    ctx.strokeStyle = '#14211b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-20, -37);
    ctx.quadraticCurveTo(-16, -42, -11, -39);
    ctx.stroke();
    ctx.restore();
  };
})();
