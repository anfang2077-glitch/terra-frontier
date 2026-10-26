/* ============================================================
   Terra Frontier — player, enemies, drops, projectiles, effects
   ============================================================ */
(function () {
  'use strict';
  const TF = window.TF;
  const U = TF.util;
  const T = TF.T;
  const TILE = TF.TILE;
  const DEFS = TF.ENEMY_DEFS;
  const ITEMS = TF.ITEMS;

  const GRAVITY = 1850;
  const MAX_FALL = 820;

  function overlaps(x, y, w, h, ox, oy, ow, oh) {
    return x < ox + ow && x + w > ox && y < oy + oh && y + h > oy;
  }

  function rectHitsSolid(world, x, y, w, h) {
    const x0 = Math.floor(x / TILE);
    const x1 = Math.floor((x + w - 0.01) / TILE);
    const y0 = Math.floor(y / TILE);
    const y1 = Math.floor((y + h - 0.01) / TILE);
    for (let yy = y0; yy <= y1; yy++) {
      for (let xx = x0; xx <= x1; xx++) {
        if (world.isSolidCell(xx, yy)) return true;
      }
    }
    return false;
  }

  function rectHitsPlatformBelow(world, x, y, w, h) {
    const x0 = Math.floor((x + 1) / TILE);
    const x1 = Math.floor((x + w - 1.01) / TILE);
    const row = Math.floor((y + h + 1) / TILE);
    for (let xx = x0; xx <= x1; xx++) {
      if (world.isPlatformCell(xx, row)) return row * TILE;
    }
    return null;
  }

  // ======================================================================
  // PLAYER
  // ======================================================================
  class Player {
    constructor(world, x, y) {
      this.world = world;
      this.w = 14;
      this.h = 38;
      this.x = x - this.w / 2;
      this.y = y - this.h;
      this.vx = 0;
      this.vy = 0;
      this.onGround = false;
      this.standingPlatform = false;
      this.facing = 1;
      this.aimX = this.x + 40;
      this.aimY = this.y;
      this.aimAngle = 0;
      this.walkPhase = 0;
      this.walkTime = 0;
      this.hp = 100;
      this.maxHp = 100;
      this.invuln = 0;
      this.hurtFlash = 0;
      this.regenDelay = 0;
      this.dead = false;
      this.deathReason = '';
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.jumpHeld = false;
      this.dropThrough = 0;
      this.fallPeak = this.y;
      this.lastLandVy = 0;
      this.swingT = 0;
      this.swingDuration = 0.25;
      this.swingKind = 'swing';
      this.attackCooldown = 0;
      this.useFlash = 0;
      this.stepTimer = 0;
      this.breath = 0;
      this.kills = 0;
      this.spawnX = x;
      this.spawnY = y;
      this.safeHouse = false;
      this.houseCheckTimer = 0;
      this.depth = 0;
      this.armAngle = 0;
    }

    centerX() { return this.x + this.w / 2; }
    centerY() { return this.y + this.h / 2; }
    feetY() { return this.y + this.h; }

    setAim(wx, wy) {
      this.aimX = wx;
      this.aimY = wy;
      const dx = wx - this.centerX();
      const dy = wy - (this.y + 14);
      this.aimAngle = Math.atan2(dy, dx);
      if (Math.abs(dx) > 2) this.facing = dx >= 0 ? 1 : -1;
    }

    update(dt, input, game) {
      if (this.dead) return;
      this.invuln = Math.max(0, this.invuln - dt);
      this.hurtFlash = Math.max(0, this.hurtFlash - dt * 4);
      this.swingT = Math.max(0, this.swingT - dt);
      this.attackCooldown = Math.max(0, this.attackCooldown - dt);
      this.useFlash = Math.max(0, this.useFlash - dt);
      this.dropThrough = Math.max(0, this.dropThrough - dt);
      this.houseCheckTimer -= dt;

      // health regeneration after staying unhurt for a while
      this.regenDelay = Math.max(0, this.regenDelay - dt);
      if (this.hp > 0 && this.hp < this.maxHp) {
        if (this.regenDelay <= 0) {
          const rate = this.safeHouse ? 3.2 : 1.15;
          this.hp = Math.min(this.maxHp, this.hp + rate * dt);
        }
      }

      const left = input.left, right = input.right;
      const jump = input.jump, jumpPressed = input.jumpPressed;
      const move = (right ? 1 : 0) - (left ? 1 : 0);
      const maxSpeed = 208;
      const accel = this.onGround ? 2100 : 1350;
      const friction = this.onGround ? 2450 : 260;

      if (move !== 0) {
        this.vx = U.approach(this.vx, move * maxSpeed, accel * dt);
        if (!this.swingT) this.facing = move;
      } else {
        this.vx = U.approach(this.vx, 0, friction * dt);
      }

      if (jumpPressed) this.jumpBuffer = 0.13;
      else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

      if (this.onGround) this.coyote = 0.10;
      else this.coyote = Math.max(0, this.coyote - dt);

      // drop through a platform
      if (this.onGround && this.standingPlatform && jumpPressed && input.down) {
        this.dropThrough = 0.22;
        this.onGround = false;
        this.y += 3;
        this.vy = 60;
        this.jumpBuffer = 0;
        this.standingPlatform = false;
      } else if (this.jumpBuffer > 0 && (this.onGround || this.coyote > 0)) {
        this.vy = -430;
        this.onGround = false;
        this.standingPlatform = false;
        this.jumpBuffer = 0;
        this.coyote = 0;
        this.fallPeak = this.y;
        game.audio.jump();
      }
      if (!jump && this.vy < -145) this.vy += 1500 * dt;
      this.jumpHeld = jump;

      this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);

      const wasGround = this.onGround;
      const oldBottom = this.y + this.h;
      const startVy = this.vy;
      this._moveX(this.vx * dt);
      this.onGround = false;
      this.standingPlatform = false;
      this._moveY(this.vy * dt, oldBottom);
      if (!this.onGround) {
        const platTop = rectHitsPlatformBelow(this.world, this.x, this.y, this.w, this.h);
        if (platTop != null && this.vy >= 0 && this.dropThrough <= 0) {
          this.y = platTop - this.h;
          this.vy = 0;
          this.onGround = true;
          this.standingPlatform = true;
        }
      }

      if (this.onGround) {
        if (!wasGround && startVy > 360) {
          const fallTiles = Math.max(0, (this.y - this.fallPeak) / TILE);
          if (fallTiles > 11.5) {
            const dmg = Math.round((fallTiles - 11.5) * 8.5);
            if (dmg > 0) {
              this.damage(dmg, this.centerX(), game, '摔落伤害');
              game.shake(4, 0.2);
              game.audio.land();
            }
          }
          if (startVy > 170) {
            game.particles.burst(this.centerX(), this.y + this.h, 4, ['#8b6b43', '#a08055'], {
              speed: 35, life: 0.3, size: 1.5, gravity: 380,
            });
            game.audio.land();
          }
        }
        this.fallPeak = this.y;
        this.lastLandVy = startVy;
        this.coyote = 0.10;
      } else {
        this.fallPeak = Math.min(this.fallPeak, this.y);
      }

      // walking dust & steps
      if (this.onGround && Math.abs(this.vx) > 35) {
        this.walkTime += dt;
        this.walkPhase += Math.abs(this.vx) * dt * 0.10;
        this.stepTimer -= dt;
        if (this.stepTimer <= 0) {
          this.stepTimer = 0.19;
          game.particles.burst(this.centerX() - this.facing * 5, this.y + this.h - 1, 1, ['#70583b', '#8a704c'], {
            speed: 18, life: 0.28, size: 1.3, gravity: 120, spread: 0.7,
          });
          if (Math.random() < 0.3) game.audio.land();
        }
      } else {
        this.walkTime += dt * 0.45;
      }
      this.breath += dt;

      // keep inside world horizontally
      const worldW = this.world.w * TILE;
      this.x = U.clamp(this.x, 8, worldW - this.w - 8);
      if (this.y > this.world.h * TILE + 80) {
        this.damage(999, this.centerX(), game, '坠入虚空');
      }

      // house / shelter check
      if (this.houseCheckTimer <= 0) {
        this.houseCheckTimer = 1.0;
        this.safeHouse = game.checkShelter(this);
        this.depth = Math.max(0, Math.floor((this.y - (this.world.startSurfaceY || 100) * TILE) / TILE));
        if (this.safeHouse) this.regenDelay = Math.min(this.regenDelay, 1.5);
      }
    }

    _moveX(dx) {
      if (!dx) return;
      const steps = Math.max(1, Math.ceil(Math.abs(dx) / 2));
      const step = dx / steps;
      for (let i = 0; i < steps; i++) {
        const nx = this.x + step;
        if (rectHitsSolid(this.world, nx, this.y, this.w, this.h)) {
          this.vx = 0;
          break;
        }
        this.x = nx;
      }
    }

    _moveY(dy, oldBottom) {
      if (!dy) return;
      const steps = Math.max(1, Math.ceil(Math.abs(dy) / 2));
      const step = dy / steps;
      for (let i = 0; i < steps; i++) {
        const ny = this.y + step;
        if (rectHitsSolid(this.world, this.x, ny, this.w, this.h)) {
          if (dy > 0) {
            this.onGround = true;
            this.y = Math.floor((ny + this.h) / TILE) * TILE - this.h - 0.01;
          } else {
            this.y = Math.floor(ny / TILE) * TILE + TILE + 0.01;
          }
          this.vy = 0;
          return;
        }
        this.y = ny;
      }
    }

    damage(amount, sourceX, game, reason) {
      if (this.dead || this.invuln > 0) return false;
      amount = Math.max(1, Math.round(amount));
      this.hp -= amount;
      this.invuln = 0.72;
      this.hurtFlash = 1;
      this.regenDelay = 6;
      const dir = this.centerX() < sourceX ? -1 : 1;
      this.vx = dir * 150;
      this.vy = Math.min(this.vy, -210);
      this.onGround = false;
      game.floatingTexts.add(this.centerX(), this.y + 8, '-' + amount, '#ff786b', 11);
      game.particles.burst(this.centerX(), this.centerY(), 8, ['#b83838', '#e2574c', '#7d2222'], {
        speed: 115, life: 0.5, size: 2, gravity: 550, dir: dir > 0 ? Math.PI : 0, spread: 1.8,
      });
      game.shake(6, 0.28);
      if (game.ui && game.ui.damageFlash) game.ui.damageFlash();
      game.audio.hurt();
      if (this.hp <= 0) {
        this.hp = 0;
        this.dead = true;
        this.deathReason = reason || '你倒在了黑暗之中。';
        game.onPlayerDeath(this);
      }
      return true;
    }

    heal(amount, game) {
      const before = this.hp;
      this.hp = Math.min(this.maxHp, this.hp + amount);
      if (this.hp > before) {
        game.floatingTexts.add(this.centerX(), this.y, '+' + Math.round(this.hp - before), '#84e59a', 10);
        game.particles.burst(this.centerX(), this.centerY(), 8, ['#82e09b', '#c7ffd5'], {
          speed: 65, life: 0.6, size: 1.5, gravity: -40, glow: true,
        });
        game.audio.heal();
      }
    }

    respawn() {
      this.dead = false;
      this.hp = this.maxHp;
      this.invuln = 1.5;
      this.x = this.spawnX - this.w / 2;
      const ground = this.world.findGroundBelow(this.spawnX, 0);
      this.y = (this.world.spawn.y || ground) - this.h;
      this.vx = 0;
      this.vy = 0;
      this.regenDelay = 0;
      this.fallPeak = this.y;
      this.hurtFlash = 0;
    }
  }

  // ======================================================================
  // ENEMIES
  // ======================================================================
  class Enemy {
    constructor(type, x, y, game) {
      this.type = type;
      this.def = DEFS[type];
      this.x = x - this.def.width / 2;
      this.y = y - this.def.height;
      this.w = this.def.width;
      this.h = this.def.height;
      this.vx = 0;
      this.vy = 0;
      this.hp = this.def.hp;
      this.maxHp = this.def.hp;
      this.onGround = false;
      this.dir = 1;
      this.hurtTimer = 0;
      this.flash = 0;
      this.dead = false;
      this.life = 0;
      this.walkPhase = Math.random() * 10;
      this.hopTimer = U.lerp(0.3, 1.3, Math.random());
      this.squash = 0;
      this.agro = false;
      this.stuck = 0;
      this.stuckJump = 0;
      this.active = true;
      this.burnTimer = 0;
      this.spawnAlpha = 0;
      this.baseVariant = Math.random();
      this.noiseSeed = Math.random() * 100;
      this.hpVisible = 0;
      if (type === 'demonEye') {
        this.flyPhase = Math.random() * Math.PI * 2;
        this.wingPhase = 0;
      }
    }

    centerX() { return this.x + this.w / 2; }
    centerY() { return this.y + this.h / 2; }

    update(dt, game) {
      if (this.dead) return;
      const player = game.player;
      this.worldRef = game.world;
      this.life += dt;
      this.spawnAlpha = Math.min(1, this.spawnAlpha + dt * 2.2);
      this.hurtTimer = Math.max(0, this.hurtTimer - dt);
      this.flash = Math.max(0, this.flash - dt * 4);
      this.hpVisible = Math.max(0, this.hpVisible - dt);
      if (this.type === 'demonEye') this.wingPhase += dt * 18;

      const dxp = player.centerX() - this.centerX();
      const dyp = player.centerY() - this.centerY();
      const distToPlayer = Math.hypot(dxp, dyp);
      this.agro = distToPlayer < 45 * TILE;
      const dayFactor = game.dayFactor;
      if (this.def.night && !game.isNight && this.life > 3) {
        this.burnTimer += dt;
        if (this.burnTimer > 0.22) {
          this.burnTimer = 0;
          this.hp -= 2.2;
          this.flash = 0.8;
          game.particles.burst(this.centerX(), this.centerY() - 4, 1, ['#ffb24b', '#ff7836', '#5a4a43'], {
            speed: 28, life: 0.4, size: 1.6, gravity: -80, glow: true,
          });
          if (this.hp <= 0) { this.die(game, true); return; }
        }
      }

      if (this.type === 'demonEye') this._updateFly(dt, game, dxp, dyp, distToPlayer);
      else this._updateGround(dt, game, dxp, distToPlayer);

      // contact damage
      if (!player.dead && overlaps(this.x + 2, this.y + 2, this.w - 4, this.h - 3, player.x, player.y, player.w, player.h)) {
        if (player.invuln <= 0) {
          player.damage(this.def.damage, this.centerX(), game, `你被${this.def.name}杀死了。`);
          this.vx -= Math.sign(dxp) * 40;
        }
      }

      // despawn far from player
      if (distToPlayer > 80 * TILE || this.life > 120) this.dead = true;
      // linger a little after sunrise, then crumble to ash
      if (this.def.night && !game.isNight && this.life > 3 && this.hp < this.maxHp * 0.4) this.dead = true;
    }

    _updateGround(dt, game, dxp, distToPlayer) {
      const world = game.world;
      this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);
      const speed = this.def.speed;
      let desired = 0;
      if (this.agro) desired = Math.sign(dxp) * speed;
      if (desired !== 0) this.dir = Math.sign(desired);

      if (this.type === 'slime') {
        this.hopTimer -= dt;
        if (this.onGround) {
          this.vx = U.approach(this.vx, 0, 700 * dt);
          if (this.hopTimer <= 0) {
            this.hopTimer = U.lerp(0.55, 1.35, Math.random()) * (this.agro ? 0.8 : 1.3);
            this.vy = -230 - Math.random() * 80;
            this.vx = this.dir * (55 + Math.random() * 50);
            this.onGround = false;
            this.squash = 0;
          }
        } else {
          this.squash = U.lerp(this.squash, 1, dt * 6);
        }
      } else {
        // zombie
        if (this.agro) {
          this.vx = U.approach(this.vx, desired, 750 * dt);
        } else {
          this.vx = U.approach(this.vx, 0, 500 * dt);
        }
        // jump when blocked or when player is above
        const aheadX = this.centerX() + this.dir * (this.w / 2 + 3);
        const feetCell = Math.floor((this.y + this.h - 4) / TILE);
        const aheadCell = Math.floor(aheadX / TILE);
        const blocked = world.isSolidCell(aheadCell, feetCell) || world.isSolidCell(aheadCell, feetCell - 1);
        const playerAbove = playerGapAbove(game.player, this);
        if (this.onGround && (blocked || playerAbove) && this.stuckJump <= 0) {
          this.vy = -360;
          this.onGround = false;
          this.stuckJump = 0.45;
        }
        this.stuckJump = Math.max(0, this.stuckJump - dt);
        if (Math.abs(this.vx) < 8) this.stuck += dt; else this.stuck = 0;
        if (this.stuck > 2.4) { this.stuck = 0; this.vx = this.dir * 110; }
      }

      const oldY = this.y;
      this._moveX(this.vx * dt);
      this._moveY(this.vy * dt);
      this.walkPhase += Math.abs(this.vx) * dt * 0.12;
    }

    _updateFly(dt, game, dxp, dyp, distToPlayer) {
      const speed = this.def.speed;
      this.flyPhase += dt * 2.3;
      let tx = dxp, ty = dyp - 18;
      const d = Math.hypot(tx, ty) || 1;
      tx /= d; ty /= d;
      const wobble = Math.sin(this.flyPhase) * 0.45;
      this.vx = U.approach(this.vx, tx * speed + wobble * 26, 290 * dt);
      this.vy = U.approach(this.vy, ty * speed + Math.cos(this.flyPhase * 1.3) * 20, 290 * dt);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.dir = this.vx >= 0 ? 1 : -1;
      this.x = U.clamp(this.x, 4, game.world.w * TILE - this.w - 4);
      this.y = U.clamp(this.y, 4, game.world.h * TILE - this.h - 4);
    }

    _moveX(dx) {
      const steps = Math.max(1, Math.ceil(Math.abs(dx) / 2));
      const step = dx / steps;
      for (let i = 0; i < steps; i++) {
        if (rectHitsSolid(this.worldRef || TF._currentWorld, this.x + step, this.y, this.w, this.h)) {
          this.vx = 0;
          return;
        }
        this.x += step;
      }
    }

    _moveY(dy) {
      const world = this.worldRef || TF._currentWorld;
      const steps = Math.max(1, Math.ceil(Math.abs(dy) / 2));
      const step = dy / steps;
      for (let i = 0; i < steps; i++) {
        if (rectHitsSolid(world, this.x, this.y + step, this.w, this.h)) {
          if (dy > 0) {
            this.y = Math.floor((this.y + step + this.h) / TILE) * TILE - this.h - 0.01;
            this.onGround = true;
          } else {
            this.y = Math.floor((this.y + step) / TILE) * TILE + TILE + 0.01;
          }
          this.vy = 0;
          return;
        }
        this.y += step;
        this.onGround = false;
      }
      // ground probe
      if (!this.onGround && dy > 0) {
        if (rectHitsSolid(world, this.x, this.y + this.h + 1, this.w, 2)) this.onGround = true;
      }
    }

    hurt(amount, dir, game, isCrit) {
      if (this.dead) return;
      amount = Math.max(1, Math.round(amount * (1 - (this.def.knockbackResist || 0) * 0.15)));
      this.hp -= amount;
      this.flash = 1;
      this.hpVisible = 2.4;
      this.vx = dir * (90 + (this.def.fly ? 45 : 20)) * (1 - (this.def.knockbackResist || 0) * 0.4);
      if (!this.def.fly) this.vy = Math.min(this.vy, -170);
      game.floatingTexts.add(this.centerX(), this.y - 2, String(amount), isCrit ? '#ffd36b' : '#fff3d2', isCrit ? 12 : 9);
      game.particles.burst(this.centerX(), this.centerY(), 5, this.type === 'slime' ? ['#63b96d', '#a2e6a8', '#3e7c49'] : ['#9a3434', '#c24c42', '#5f2020'], {
        speed: 95, life: 0.42, size: 1.8, gravity: 500, dir: dir > 0 ? 0 : Math.PI, spread: 1.4,
      });
      game.audio.hit();
      game.shake(3, 0.12);
      if (this.hp <= 0) this.die(game, false);
    }

    die(game, burned) {
      if (this.dead) return;
      this.dead = true;
      game.onEnemyKilled(this, burned);
    }

    setWorld(world) { this.worldRef = world; }
  }

  function playerGapAbove(player, enemy) {
    return player.y + player.h < enemy.y + 4 && Math.abs(player.centerX() - enemy.centerX()) < 80;
  }

  // ======================================================================
  // ITEM DROPS
  // ======================================================================
  class ItemDrop {
    constructor(id, count, x, y, opts = {}) {
      this.id = id;
      this.count = Math.max(1, count | 0);
      this.x = x;
      this.y = y;
      this.w = 10;
      this.h = 10;
      this.vx = opts.vx != null ? opts.vx : U.lerp(-70, 70, Math.random());
      this.vy = opts.vy != null ? opts.vy : U.lerp(-210, -90, Math.random());
      this.onGround = false;
      this.life = 0;
      this.pickupDelay = 0.42;
      this.bob = Math.random() * Math.PI * 2;
      this.magnet = false;
      this.dead = false;
      this.dropTime = 0;
      this.spawnX = x;
      this.spawnY = y;
    }

    update(dt, game) {
      this.life += dt;
      this.bob += dt * 3.4;
      this.pickupDelay = Math.max(0, this.pickupDelay - dt);
      const player = game.player;
      const px = player.centerX();
      const py = player.centerY();
      const d = Math.hypot(px - this.x, py - this.y);
      if (!player.dead && this.pickupDelay <= 0 && d < 64) this.magnet = true;
      if (this.magnet && !player.dead) {
        const ang = Math.atan2(py - this.y, px - this.x);
        const sp = 180 + (64 - Math.min(64, d)) * 7;
        this.vx = U.approach(this.vx, Math.cos(ang) * sp, 900 * dt);
        this.vy = U.approach(this.vy, Math.sin(ang) * sp, 900 * dt);
        this.x += this.vx * dt;
        this.y += this.vy * dt;
      } else {
        this.vy = Math.min(600, this.vy + 1400 * dt);
        this.vx = U.approach(this.vx, 0, (this.onGround ? 900 : 90) * dt);
        const oldBottom = this.y + this.h / 2;
        this._move(game.world, dt);
        if (this.onGround) this.vy = 0;
      }
      if (!player.dead && this.pickupDelay <= 0 && d < 20) {
        const left = game.inventory.add(this.id, this.count);
        if (left <= 0) {
          this.dead = true;
          game.onItemCollected(this.id, this.count);
        } else if (left < this.count) {
          game.onItemCollected(this.id, this.count - left);
          this.count = left;
        }
      }
      if (this.life > 260) this.dead = true;
      // fall out of world
      if (this.y > game.world.h * TILE + 50) this.dead = true;
    }

    _move(world, dt) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      const tx = Math.floor(this.x / TILE);
      const ty = Math.floor(this.y / TILE);
      if (world.isSolidCell(tx, ty)) {
        this.y = ty * TILE - this.h / 2 - 1;
        if (this.vy > 0) { this.onGround = true; this.vy = 0; }
        this.x -= this.vx * dt;
        this.vx *= -0.2;
      } else {
        this.onGround = false;
      }
    }

    addVx(v) { this.vx += v; }
  }

  // ======================================================================
  // PROJECTILES
  // ======================================================================
  class Projectile {
    constructor(type, x, y, vx, vy, damage, opts = {}) {
      this.type = type;
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.damage = damage;
      this.life = opts.life != null ? opts.life : 3;
      this.maxLife = this.life;
      this.dead = false;
      this.gravity = opts.gravity || 0;
      this.radius = opts.radius || 4;
      this.pierce = opts.pierce || 0;
      this.hit = new Set();
      this.angle = Math.atan2(vy, vx);
      this.trailTimer = 0;
      this.stuck = false;
      this.stuckTime = 0;
      this.color = opts.color || '#ffd98a';
      this.isMagic = type === 'magic';
    }

    update(dt, game) {
      if (this.dead) return;
      this.life -= dt;
      if (this.life <= 0) { this.dead = true; return; }
      if (this.stuck) {
        this.stuckTime -= dt;
        if (this.stuckTime <= 0) this.dead = true;
        return;
      }
      this.vy += this.gravity * dt;
      const steps = Math.max(1, Math.ceil((Math.hypot(this.vx, this.vy) * dt) / 7));
      const sdt = dt / steps;
      for (let s = 0; s < steps; s++) {
        this.x += this.vx * sdt;
        this.y += this.vy * sdt;
        this.angle = Math.atan2(this.vy, this.vx);
        if (this._checkWorld(game)) return;
        if (this._checkEnemies(game)) { if (this.dead) return; }
      }
      this.trailTimer -= dt;
      if (this.trailTimer <= 0) {
        this.trailTimer = this.isMagic ? 0.035 : 0.06;
        if (this.isMagic) {
          game.particles.spawn({
            x: this.x, y: this.y, vx: U.lerp(-18, 18, Math.random()), vy: U.lerp(-18, 18, Math.random()),
            life: 0.32, size: U.lerp(1, 2.6, Math.random()), color: Math.random() < 0.5 ? '#b968f0' : '#e7b8ff',
            gravity: -20, glow: true, drag: 2,
          });
        }
      }
    }

    _checkWorld(game) {
      const tx = Math.floor(this.x / TILE);
      const ty = Math.floor(this.y / TILE);
      if (!game.world.inBounds(tx, ty)) return false;
      if (game.world.isSolidCell(tx, ty)) {
        if (this.isMagic) {
          const enemyHits = this.hit.size;
          if (enemyHits < 2) {
            // magic still fizzles on stone after a moment
          }
        }
        game.particles.burst(this.x, this.y, 5, this.isMagic ? ['#c17bf0', '#f1d2ff', '#7a4e9f'] : ['#b9a27a', '#e2d2a7', '#76684b'], {
          speed: 60, life: 0.3, size: 1.4, gravity: 240, glow: this.isMagic,
        });
        this.dead = true;
        return true;
      }
      return false;
    }

    _checkEnemies(game) {
      for (const e of game.enemies) {
        if (e.dead || this.hit.has(e)) continue;
        if (overlaps(this.x - 2, this.y - 2, 4, 4, e.x, e.y, e.w, e.h)) {
          const dir = this.vx >= 0 ? 1 : -1;
          const crit = Math.random() < 0.12;
          e.hurt(this.damage * (crit ? 1.55 : 1), dir, game, crit);
          this.hit.add(e);
          game.particles.burst(this.x, this.y, 4, ['#fff2c7', '#ffb45c', '#c47335'], {
            speed: 85, life: 0.28, size: 1.4, gravity: 280, glow: true,
          });
          if (this.hit.size > this.pierce) { this.dead = true; return true; }
        }
      }
      return false;
    }
  }

  // ======================================================================
  // GUIDE NPC
  // ======================================================================
  class Guide {
    constructor(world, x, y) {
      this.world = world;
      this.x = x;
      this.y = y;
      this.w = 14;
      this.h = 38;
      this.vx = 0;
      this.vy = 0;
      this.onGround = false;
      this.facing = -1;
      this.walkPhase = 0;
      this.wanderTimer = 0;
      this.targetDir = 0;
      this.name = '向导';
      this.bubble = 0;
      this.bubbleText = '';
      this.anim = Math.random() * 5;
      this.homeX = x;
    }

    centerX() { return this.x + this.w / 2; }
    centerY() { return this.y + this.h / 2; }

    update(dt, game) {
      this.anim += dt;
      const player = game.player;
      const dpx = player.centerX() - this.centerX();
      const nearPlayer = Math.abs(dpx) < 10 * TILE && Math.abs(player.centerY() - this.centerY()) < 8 * TILE;
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = U.lerp(1.8, 4.5, Math.random());
        if (nearPlayer || Math.abs(this.centerX() - this.homeX) > 18 * TILE) {
          this.targetDir = Math.abs(this.homeX - this.centerX()) > 4 * TILE ? Math.sign(this.homeX - this.centerX()) : 0;
          if (Math.random() < 0.45) this.targetDir = Math.sign(dpx) * -1;
        } else {
          this.targetDir = Math.random() < 0.58 ? (Math.random() < 0.5 ? -1 : 1) : 0;
        }
      }
      // don't wander into danger at night
      if (game.isNight && Math.abs(this.centerX() - this.homeX) > 12 * TILE) {
        this.targetDir = Math.sign(this.homeX - this.centerX());
      }
      const speed = 55;
      this.vx = U.approach(this.vx, this.targetDir * speed, 500 * dt);
      if (this.targetDir) this.facing = this.targetDir;
      this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);
      this._move(this.vx * dt, this.vy * dt, game.world);
      if (this.onGround && Math.abs(this.vx) > 2) this.walkPhase += Math.abs(this.vx) * dt * 0.1;
      if (this.onGround && this.targetDir && this._wallAhead(game.world)) {
        this.vy = -340;
        this.onGround = false;
      }
      if (this.y > game.world.h * TILE) {
        this.x = this.homeX;
        const gy = game.world.findGroundBelow(this.homeX, 0);
        this.y = gy - this.h;
      }
      this.bubble = Math.max(0, this.bubble - dt);
    }

    _wallAhead(world) {
      const ax = this.facing > 0 ? this.x + this.w + 3 : this.x - 3;
      const fy = this.y + this.h - 8;
      return world.isSolidPixel(ax, fy) && !world.isSolidPixel(ax, fy - TILE * 2);
    }

    _move(dx, dy, world) {
      const stepsX = Math.max(1, Math.ceil(Math.abs(dx) / 2));
      const sx = dx / stepsX;
      for (let i = 0; i < stepsX; i++) {
        if (rectHitsSolid(world, this.x + sx, this.y, this.w, this.h)) { this.vx = 0; break; }
        this.x += sx;
      }
      this.onGround = false;
      const stepsY = Math.max(1, Math.ceil(Math.abs(dy) / 2));
      const sy = dy / stepsY;
      for (let i = 0; i < stepsY; i++) {
        if (rectHitsSolid(world, this.x, this.y + sy, this.w, this.h)) {
          if (dy > 0) {
            this.onGround = true;
            this.y = Math.floor((this.y + sy + this.h) / TILE) * TILE - this.h - 0.01;
          } else {
            this.y = Math.floor((this.y + sy) / TILE) * TILE + TILE + 0.01;
          }
          this.vy = 0;
          return;
        }
        this.y += sy;
      }
      if (rectHitsSolid(world, this.x, this.y + this.h + 1, this.w, 2)) this.onGround = true;
    }

    say(text) {
      this.bubble = 4.5;
      this.bubbleText = text;
    }
  }

  // ======================================================================
  // PARTICLES
  // ======================================================================
  class ParticleSystem {
    constructor(max = 700) {
      this.items = [];
      this.max = max;
    }

    spawn(p) {
      if (this.items.length >= this.max) this.items.shift();
      this.items.push({
        x: p.x, y: p.y,
        vx: p.vx || 0, vy: p.vy || 0,
        life: p.life || 0.5, maxLife: p.life || 0.5,
        size: p.size || 2, color: p.color || '#fff',
        gravity: p.gravity || 0, drag: p.drag || 0,
        glow: !!p.glow, shape: p.shape || 'square',
        rot: p.rot || 0, vr: p.vr || 0,
        alpha: p.alpha != null ? p.alpha : 1,
      });
    }

    burst(x, y, count, colors, opts = {}) {
      for (let i = 0; i < count; i++) {
        const dir = opts.dir != null ? opts.dir + U.lerp(-(opts.spread || Math.PI), opts.spread || Math.PI, Math.random()) : U.lerp(0, Math.PI * 2, Math.random());
        const sp = (opts.speed || 80) * U.lerp(0.35, 1, Math.random());
        this.spawn({
          x, y,
          vx: Math.cos(dir) * sp + (opts.vx || 0),
          vy: Math.sin(dir) * sp + (opts.vy || 0),
          life: (opts.life || 0.5) * U.lerp(0.5, 1.2, Math.random()),
          size: (opts.size || 2) * U.lerp(0.6, 1.4, Math.random()),
          color: colors[(Math.random() * colors.length) | 0],
          gravity: opts.gravity || 0,
          drag: opts.drag || 0,
          glow: opts.glow, shape: opts.shape || 'square',
          rot: Math.random() * Math.PI, vr: U.lerp(-8, 8, Math.random()),
        });
      }
    }

    dust(x, y, color = '#8a704c') {
      this.spawn({
        x, y, vx: U.lerp(-18, 18, Math.random()), vy: U.lerp(-28, -6, Math.random()),
        life: 0.4, size: 1.5, color, gravity: 80, drag: 1,
      });
    }

    blockBurst(tileId, px, py) {
      const d = TF.TILE_DEFS[tileId] || TF.TILE_DEFS[T.DIRT];
      const pal = d.palette || TF.TILE_DEFS[T.DIRT].palette;
      const colors = [pal.base, pal.dark, pal.light, pal.detail].filter(Boolean);
      if (pal.accent) colors.push(pal.accent);
      this.burst(px, py, 9, colors, { speed: 105, life: 0.52, size: 2.2, gravity: 500, spread: Math.PI });
    }

    spark(x, y, color = '#ffd06a') {
      this.burst(x, y, 3, [color, '#fff2c2', '#ff9b4a'], {
        speed: 115, life: 0.25, size: 1.3, gravity: 350, glow: true,
      });
    }

    update(dt) {
      for (let i = this.items.length - 1; i >= 0; i--) {
        const p = this.items[i];
        p.life -= dt;
        if (p.life <= 0) { this.items.splice(i, 1); continue; }
        p.vy += p.gravity * dt;
        if (p.drag) {
          p.vx *= Math.max(0, 1 - p.drag * dt);
          p.vy *= Math.max(0, 1 - p.drag * dt);
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
      }
    }

    draw(ctx, glowPass) {
      for (const p of this.items) {
        if (!!p.glow !== glowPass) continue;
        const t = U.clamp(p.life / p.maxLife, 0, 1);
        ctx.globalAlpha = p.alpha * (glowPass ? Math.min(1, t * 1.8) : Math.min(1, t * 2));
        ctx.fillStyle = p.color;
        const s = Math.max(1, p.size * (0.6 + t * 0.6));
        if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), Math.ceil(s), Math.ceil(s));
        }
      }
      ctx.globalAlpha = 1;
    }

    clear() { this.items.length = 0; }
  }

  // ======================================================================
  // FLOATING TEXT
  // ======================================================================
  class FloatingTexts {
    constructor() { this.items = []; }
    add(x, y, text, color = '#fff', size = 9) {
      this.items.push({ x, y, text, color, size, life: 0.85, maxLife: 0.85, vy: -32, vx: U.lerp(-8, 8, Math.random()) });
      if (this.items.length > 80) this.items.shift();
    }
    update(dt) {
      for (let i = this.items.length - 1; i >= 0; i--) {
        const t = this.items[i];
        t.life -= dt;
        if (t.life <= 0) { this.items.splice(i, 1); continue; }
        t.y += t.vy * dt;
        t.x += t.vx * dt;
        t.vy *= 0.96;
      }
    }
    draw(ctx) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const t of this.items) {
        const a = U.clamp(t.life / t.maxLife * 1.6, 0, 1);
        ctx.globalAlpha = a;
        ctx.font = `bold ${t.size}px "Courier New", monospace`;
        ctx.fillStyle = '#160e08';
        ctx.fillText(t.text, t.x + 1, t.y + 1);
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, t.x, t.y);
      }
      ctx.restore();
    }
    clear() { this.items.length = 0; }
  }

  // ======================================================================
  // AMBIENT LIFE & WEATHER FLIES
  // ======================================================================
  class Ambient {
    constructor() {
      this.motes = [];
      this.birds = [];
      this.timer = 0;
      this.birdTimer = 2;
    }

    update(dt, game) {
      this.timer -= dt;
      const player = game.player;
      const view = game.renderer ? game.renderer.viewBounds(game.camera) : null;
      if (!view) return;
      if (this.timer <= 0) {
        this.timer = U.lerp(0.25, 0.9, Math.random());
        if (game.isNight && this.motes.length < 30) {
          const x = player.centerX() + U.lerp(-view.w * 0.55, view.w * 0.55, Math.random());
          const tx = Math.floor(x / TILE);
          const sy = game.world.surface[U.clamp(tx, 0, game.world.w - 1)];
          const y = sy * TILE - U.lerp(12, 110, Math.random());
          if (Math.abs(y - player.centerY()) < view.h * 0.7) {
            this.motes.push({
              x, y, vx: U.lerp(-7, 7, Math.random()), vy: U.lerp(-5, 5, Math.random()),
              phase: Math.random() * 6, life: U.lerp(4, 10, Math.random()), color: '#d7ff9a',
            });
          }
        } else if (!game.isNight && this.motes.length < 12 && Math.random() < 0.45) {
          const x = player.centerX() + U.lerp(-view.w * 0.5, view.w * 0.5, Math.random());
          const y = player.centerY() + U.lerp(-view.h * 0.3, view.h * 0.25, Math.random());
          this.motes.push({
            x, y, vx: U.lerp(-12, 12, Math.random()), vy: U.lerp(-8, 8, Math.random()),
            phase: Math.random() * 6, life: U.lerp(4, 8, Math.random()), color: Math.random() < 0.5 ? '#ffd879' : '#e8f0ff', butterfly: true,
          });
        }
      }
      for (let i = this.motes.length - 1; i >= 0; i--) {
        const m = this.motes[i];
        m.life -= dt;
        m.phase += dt * (m.butterfly ? 5 : 1.4);
        m.vx += Math.sin(m.phase * 0.8) * 4 * dt;
        m.vy += Math.cos(m.phase) * 3 * dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        if (m.life <= 0) this.motes.splice(i, 1);
      }

      this.birdTimer -= dt;
      if (this.birdTimer <= 0 && !game.isNight && this.birds.length < 3) {
        this.birdTimer = U.lerp(8, 18, Math.random());
        const dir = Math.random() < 0.5 ? 1 : -1;
        this.birds.push({
          x: player.centerX() + dir * -view.w * 0.6,
          y: player.centerY() - U.lerp(80, 170, Math.random()),
          vx: dir * U.lerp(35, 65, Math.random()), phase: 0, life: 15,
        });
      }
      for (let i = this.birds.length - 1; i >= 0; i--) {
        const b = this.birds[i];
        b.x += b.vx * dt;
        b.phase += dt * 9;
        b.life -= dt;
        if (b.life <= 0) this.birds.splice(i, 1);
      }
    }

    draw(ctx, game) {
      for (const m of this.motes) {
        const flick = 0.55 + 0.45 * Math.sin(m.phase * 2.2);
        ctx.globalAlpha = flick * (m.butterfly ? 0.85 : 0.55);
        ctx.fillStyle = m.color;
        if (m.butterfly) {
          const wing = Math.sin(m.phase * 3) * 2;
          ctx.fillRect(Math.round(m.x - 2 - wing), Math.round(m.y), 2, 2);
          ctx.fillRect(Math.round(m.x + 1 + wing), Math.round(m.y), 2, 2);
        } else {
          ctx.fillRect(Math.round(m.x), Math.round(m.y), 2, 2);
        }
      }
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#182228';
      ctx.lineWidth = 1;
      for (const b of this.birds) {
        const flap = Math.sin(b.phase) * 3;
        ctx.beginPath();
        ctx.moveTo(b.x - 4, b.y + flap);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(b.x + 4, b.y + flap);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  TF.Player = Player;
  TF.Enemy = Enemy;
  TF.ItemDrop = ItemDrop;
  TF.Projectile = Projectile;
  TF.Guide = Guide;
  TF.ParticleSystem = ParticleSystem;
  TF.FloatingTexts = FloatingTexts;
  TF.Ambient = Ambient;
  TF.entityUtil = { overlaps, rectHitsSolid, rectHitsPlatformBelow };
})();
