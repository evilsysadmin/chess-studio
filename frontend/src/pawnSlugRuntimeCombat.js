import {
  PAWN_SLUG_WEAPON_ORDER,
  pawnSlugDamageMultiplier,
  pawnSlugLevelForXp,
  pawnSlugMaxHpForLevel,
  pawnSlugPickupCopy,
  pawnSlugScoreForKill,
  pawnSlugWeaponShortLabel,
  pawnSlugWeaponUpgradeCrossed,
  pawnSlugXpForKill,
} from './pawnSlug.js';
import { pawnSlugCreditsForKill } from './pawnSlugEconomy.js';
import { disposePawnSlugObject } from './pawnSlugArt.js';
import { createExplosionParticle } from './pawnSlugExplosionArt.js';
import { animatePremiumMuzzleFlash, animatePremiumProjectile } from './pawnSlugPremiumFx.js';
import {
  pawnSlugAnimateDestructibles,
  pawnSlugApplyDestructibleReward,
  pawnSlugDamageRuntimeDestructible,
  pawnSlugFirstHitDestructibleIndex,
  pawnSlugFirstHitEnemyIndex,
  pawnSlugPowRescueSummary,
  pawnSlugRectsOverlap,
  pawnSlugRetireDestroyedDestructibles,
  pawnSlugUpdatePowRescues,
} from './pawnSlugRuntimeHotPath.js';
import { pawnSlugWantedCreditBonus } from './pawnSlugWantedOfficers.js';
import {
  PAWN_SLUG_GRAVITY,
  PAWN_SLUG_PLAYER_H,
  PAWN_SLUG_PLAYER_W,
  PAWN_SLUG_VIEW_W,
  PAWN_SLUG_WORLD_SCALE,
  pawnSlugClamp,
  pawnSlugNearestCheckpoint,
} from './pawnSlugRuntimeCore.js';

export function createPawnSlugCombatSystem(runtime) {
  const projectileAnimationOptions = { time: 0, explosive: false };

  function burst(x, y, strength = 1, fiery = true) {
    const count = runtime.reducedMotion ? 7 : Math.round(13 * strength);
    for (let index = 0; index < count; index += 1) {
      const color = fiery ? (index % 3 === 0 ? 0xffdb6e : index % 3 === 1 ? 0xff7b37 : 0x5f6368) : 0x8c9196;
      const model = createExplosionParticle(color, 0.055 + Math.random() * 0.09 * strength);
      const angle = Math.random() * Math.PI * 2;
      const speed = (1.6 + Math.random() * 4.8) * strength;
      const particle = { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed + 1.5, life: 0.35 + Math.random() * 0.55, maxLife: 0.9, model };
      model.position.set(x, y, 0.6 + Math.random() * 0.45);
      runtime.fxLayer.add(model);
      runtime.state.particles.push(particle);
    }
    runtime.state.shake = Math.max(runtime.state.shake, runtime.reducedMotion ? 0 : 0.14 * strength);
  }

  function destructibleRewardCopy(reward) {
    const parts = [];
    if (reward?.credits) parts.push(`${reward.credits} cr`);
    if (reward?.grenades) parts.push(`+${reward.grenades} granadas`);
    for (const [weaponId, amount] of Object.entries(reward?.ammo || {})) parts.push(`${pawnSlugWeaponShortLabel(weaponId)} +${amount}`);
    return parts.join(' · ') || 'sin suministros';
  }

  function damageDestructible(item, amount) {
    const result = pawnSlugDamageRuntimeDestructible(item, amount);
    if (!result.destroyedNow) return result;
    const state = runtime.state;
    state.score += result.score;
    if (result.reward) {
      pawnSlugApplyDestructibleReward(result.reward, state);
      runtime.setToast(`${item.secret ? 'CACHE SECRETA' : 'SUMINISTROS'} // ${destructibleRewardCopy(result.reward)}`, 1.85);
      runtime.sfx.play('pickup');
    }
    if (result.explosion) explode(item.x, item.y + item.h * 0.5, result.explosion.radius, result.explosion.damage);
    else {
      burst(item.x, item.y + item.h * 0.5, 0.65, false);
      runtime.sfx.play('hit');
    }
    state.shake = Math.max(state.shake, runtime.reducedMotion ? 0 : item.type === 'barrel' ? 0.24 : 0.1);
    runtime.emitHud(true);
    return result;
  }

  function explode(x, y, radius = 2.2, damage = 90, hurtsPlayer = false) {
    const state = runtime.state;
    burst(x, y, 1.55, true);
    runtime.sfx.play('grenade');
    for (const enemy of state.enemies) {
      if (enemy.dead) continue;
      const distance = Math.hypot(enemy.x - x, (enemy.y + enemy.h * 0.5) - y);
      if (distance <= radius) damageEnemy(enemy, damage * (1 - distance / (radius * 1.35)));
    }
    for (const item of state.destructibles) {
      if (item.destroyed) continue;
      const distance = Math.hypot(item.x - x, (item.y + item.h * 0.5) - y);
      if (distance <= radius) damageDestructible(item, damage * (1 - distance / (radius * 1.35)));
    }
    if (hurtsPlayer) {
      const distance = Math.hypot(state.player.x - x, (state.player.y + PAWN_SLUG_PLAYER_H * 0.5) - y);
      if (distance <= radius * 0.75) hurtPlayer(24);
    }
  }

  function grantXp(type) {
    const gained = pawnSlugXpForKill(type);
    if (!gained) return;
    const state = runtime.state;
    const player = state.player;
    const previousLevel = player.level;
    player.xp += gained;
    player.level = pawnSlugLevelForXp(player.xp);
    if (player.level <= previousLevel) return;

    const previousMaxHp = player.maxHp;
    player.maxHp = pawnSlugMaxHpForLevel(player.level);
    player.hp = Math.min(player.maxHp, player.hp + (player.maxHp - previousMaxHp) + 24);
    state.score += (player.level - previousLevel) * 250;
    state.hitStop = Math.max(state.hitStop, runtime.reducedMotion ? 0 : 0.08);
    state.shake = Math.max(state.shake, runtime.reducedMotion ? 0 : 0.1);
    runtime.sfx.play('levelUp');

    const promotions = PAWN_SLUG_WEAPON_ORDER
      .filter((id) => player.arsenal[id]?.unlocked)
      .map((id) => ({ id, upgrade: pawnSlugWeaponUpgradeCrossed(id, previousLevel, player.level) }))
      .filter(({ upgrade }) => Boolean(upgrade));
    const promotionCopy = promotions.map(({ id, upgrade }) => `${pawnSlugWeaponShortLabel(id)} ${upgrade.code}`).join(' · ');
    if (promotionCopy) runtime.setToast(`NIVEL ${player.level} // ${promotionCopy}. ${runtime.matthiasLine('weaponUp')}`, 3.1);
    else runtime.setToast(`NIVEL ${player.level} // ${runtime.matthiasLine('levelUp')}`, 2.6);
  }

  function damageEnemy(enemy, amount) {
    if (enemy.dead) return;
    const state = runtime.state;
    enemy.hp -= amount;
    enemy.hurt = 0.11;
    runtime.sfx.play('hit');
    if (enemy.hp > 0) return;
    enemy.dead = true;
    state.score += pawnSlugScoreForKill(enemy.type) * Math.max(1, state.combo || 1);
    state.combo = state.time <= state.comboUntil ? Math.min(9, state.combo + 1) : 1;
    state.comboUntil = state.time + 2.2;
    const wantedBonus = pawnSlugWantedCreditBonus(enemy.wantedOfficer);
    state.credits += pawnSlugCreditsForKill(enemy.type, { combo: state.combo }) + wantedBonus;
    if (wantedBonus > 0) runtime.setToast(`WANTED ABATIDO // +${wantedBonus} cr`, 1.55);
    grantXp(enemy.type);
    state.hitStop = Math.max(state.hitStop, runtime.reducedMotion ? 0 : enemy.type === 'boss' ? 0.22 : enemy.type === 'bishop' ? 0.11 : 0.035);
    burst(enemy.x, enemy.y + enemy.h * 0.5, enemy.type === 'boss' ? 2.4 : enemy.type === 'bishop' ? 1.45 : 0.9, true);
    enemy.model.visible = false;
    if (enemy.type === 'bishop') {
      state.score += 500;
      state.shake = Math.max(state.shake, runtime.reducedMotion ? 0 : 0.28);
    }
    if (enemy.type === 'boss') {
      state.bossDefeated = true;
      state.score += 2500;
      runtime.setToast(runtime.matthiasLine('bossDown'), 3);
      state.shake = runtime.reducedMotion ? 0 : 0.65;
    }
    runtime.emitHud(true);
  }

  function hurtPlayer(amount) {
    const state = runtime.state;
    const player = state.player;
    if (player.invuln > 0 || state.phase !== 'playing') return;
    player.hp -= amount;
    player.invuln = 0.85;
    player.flash = 0.18;
    state.shake = runtime.reducedMotion ? 0 : 0.22;
    state.hitStop = Math.max(state.hitStop, runtime.reducedMotion ? 0 : 0.05);
    runtime.sfx.play('hurt');
    runtime.setToast(runtime.matthiasLine('hurt'), 1.45);
    if (player.hp > 0) return;

    player.lives -= 1;
    if (player.lives <= 0) {
      state.phase = 'gameover';
      runtime.playerModel.visible = false;
      runtime.playerWeaponModel.visible = false;
      runtime.setAmbientDuck(false);
      runtime.setToast(runtime.matthiasLine('death'), Infinity);
      runtime.emitHud(true);
      return;
    }

    state.checkpoint = pawnSlugNearestCheckpoint(player.x);
    player.x = state.checkpoint;
    player.y = 0;
    player.vx = 0;
    player.vy = 0;
    player.hp = player.maxHp;
    player.invuln = 1.8;
    player.moving = false;
    player.stoppedAt = state.time;
    runtime.weapons.selectWeapon('pistol', { announce: false });
    runtime.view.placeCameraAfterRespawn(player.x);
    runtime.setToast(`Vida menos. Reagrupando en ${Math.round(player.x / PAWN_SLUG_WORLD_SCALE)} m. Pistola fuera.`, 2.2);
  }

  function updatePows() {
    const state = runtime.state;
    pawnSlugUpdatePowRescues(state, state.time, {
      reducedMotion: runtime.reducedMotion,
      onRescue: (result) => {
        state.score += 350;
        const rewards = [];
        if (result.reward?.credits) rewards.push(`${result.reward.credits} cr`);
        if (result.reward?.grenades) rewards.push(`+${result.reward.grenades} granadas`);
        for (const [weaponId, amount] of Object.entries(result.reward?.ammo || {})) rewards.push(`${pawnSlugWeaponShortLabel(weaponId)} +${amount}`);
        runtime.setToast(`POW RESCUED // ${rewards.join(' · ') || 'suministros recuperados'}`, 2.2);
        runtime.sfx.play('pickup');
        runtime.emitHud(true);
      },
      onRemove: (model) => {
        runtime.dynamic.remove(model);
        disposePawnSlugObject(model);
      },
    });
  }

  function updateBullets(dt) {
    const state = runtime.state;
    const playerLeft = state.player.x - PAWN_SLUG_PLAYER_W / 2;
    const playerTop = state.player.y;
    const playerHeight = state.player.crouch ? 1.05 : PAWN_SLUG_PLAYER_H;

    for (let index = 0; index < state.bullets.length;) {
      const bullet = state.bullets[index];
      bullet.life -= dt;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.model.position.set(bullet.x, bullet.y, 0.3);
      projectileAnimationOptions.time = state.time;
      projectileAnimationOptions.explosive = bullet.explosive;
      animatePremiumProjectile(bullet.model, projectileAnimationOptions);
      let remove = bullet.life <= 0 || bullet.y < -1 || bullet.x < state.cameraX - PAWN_SLUG_VIEW_W || bullet.x > state.cameraX + PAWN_SLUG_VIEW_W * 1.8;
      const bulletLeft = bullet.x - bullet.w / 2;
      const bulletTop = bullet.y - bullet.h / 2;
      if (!remove && bullet.enemy) {
        if (pawnSlugRectsOverlap(bulletLeft, bulletTop, bullet.w, bullet.h, playerLeft, playerTop, PAWN_SLUG_PLAYER_W, playerHeight)) {
          if (bullet.explosive) explode(bullet.x, bullet.y, 1.8, 0, true);
          else hurtPlayer(bullet.damage);
          remove = true;
        }
      } else if (!remove) {
        const destructibleIndex = pawnSlugFirstHitDestructibleIndex(state.destructibles, bulletLeft, bulletTop, bullet.w, bullet.h);
        if (destructibleIndex >= 0) {
          const item = state.destructibles[destructibleIndex];
          if (bullet.explosive) explode(bullet.x, bullet.y, 1.9, bullet.damage);
          else damageDestructible(item, bullet.damage);
          remove = true;
        } else {
          const enemyIndex = pawnSlugFirstHitEnemyIndex(state.enemies, bulletLeft, bulletTop, bullet.w, bullet.h);
          if (enemyIndex >= 0) {
            const enemy = state.enemies[enemyIndex];
            if (bullet.explosive) explode(bullet.x, bullet.y, 1.9, bullet.damage);
            else damageEnemy(enemy, bullet.damage);
            remove = true;
          }
        }
      }

      if (remove) {
        runtime.projectileLayer.remove(bullet.model);
        disposePawnSlugObject(bullet.model);
        state.bullets.splice(index, 1);
        continue;
      }
      index += 1;
    }
  }

  function updateGrenades(dt) {
    const state = runtime.state;
    for (let index = 0; index < state.grenades.length;) {
      const grenade = state.grenades[index];
      grenade.fuse -= dt;
      grenade.vy -= PAWN_SLUG_GRAVITY * 0.72 * dt;
      grenade.x += grenade.vx * dt;
      grenade.y += grenade.vy * dt;
      if (grenade.y <= 0.12) {
        grenade.y = 0.12;
        grenade.vy = Math.abs(grenade.vy) * 0.38;
        grenade.vx *= 0.72;
      }
      grenade.model.position.set(grenade.x, grenade.y, 0.4);
      grenade.model.rotation.z += dt * 8;
      if (grenade.fuse > 0) {
        index += 1;
        continue;
      }
      explode(grenade.x, grenade.y + 0.2, 2.65, 125 * pawnSlugDamageMultiplier(state.player.level));
      runtime.projectileLayer.remove(grenade.model);
      disposePawnSlugObject(grenade.model);
      state.grenades.splice(index, 1);
    }
  }

  function updateDestructibles() {
    const state = runtime.state;
    pawnSlugAnimateDestructibles(state.destructibles, state.time, { reducedMotion: runtime.reducedMotion });
    pawnSlugRetireDestroyedDestructibles(state.destructibles, state.destroyedDestructibles, (model) => {
      runtime.dynamic.remove(model);
      disposePawnSlugObject(model);
    });
  }

  function updatePickups(dt) {
    const state = runtime.state;
    const playerLeft = state.player.x - PAWN_SLUG_PLAYER_W / 2;
    const playerTop = state.player.y;
    for (let index = 0; index < state.pickups.length;) {
      const pickup = state.pickups[index];
      pickup.model.position.y = pickup.y + 0.12 + Math.sin(state.time * 3.1 + pickup.bob) * 0.08;
      pickup.model.rotation.y += dt * 0.55;
      if (!pawnSlugRectsOverlap(playerLeft, playerTop, PAWN_SLUG_PLAYER_W, PAWN_SLUG_PLAYER_H, pickup.x - pickup.w / 2, pickup.y, pickup.w, pickup.h)) {
        index += 1;
        continue;
      }
      state.takenPickups.add(pickup.id);
      if (pickup.type === 'grenade') state.player.grenades += 3;
      else if (pickup.type === 'medkit') state.player.hp = Math.min(state.player.maxHp, state.player.hp + 45);
      else runtime.weapons.grantWeapon(pickup.type);
      state.score += 150;
      runtime.setToast(pawnSlugPickupCopy(pickup.type), 2.1);
      runtime.sfx.play('pickup');
      runtime.dynamic.remove(pickup.model);
      disposePawnSlugObject(pickup.model);
      state.pickups.splice(index, 1);
      runtime.emitHud(true);
    }
  }

  function updateFx(dt) {
    const state = runtime.state;
    for (let index = 0; index < state.flashes.length;) {
      const flash = state.flashes[index];
      flash.life -= dt;
      animatePremiumMuzzleFlash(flash.model, flash.life / flash.maxLife);
      if (flash.life > 0) {
        index += 1;
        continue;
      }
      runtime.fxLayer.remove(flash.model);
      disposePawnSlugObject(flash.model);
      state.flashes.splice(index, 1);
    }
    for (let index = 0; index < state.particles.length;) {
      const particle = state.particles[index];
      particle.life -= dt;
      particle.vy -= PAWN_SLUG_GRAVITY * 0.42 * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.model.position.x = particle.x;
      particle.model.position.y = particle.y;
      const alpha = pawnSlugClamp(particle.life / particle.maxLife, 0, 1);
      if (particle.model.material) particle.model.material.opacity = alpha;
      if (particle.life > 0) {
        index += 1;
        continue;
      }
      runtime.fxLayer.remove(particle.model);
      disposePawnSlugObject(particle.model);
      state.particles.splice(index, 1);
    }
  }

  function checkVictory() {
    const state = runtime.state;
    if (!state.bossDefeated) return;
    if (state.player.x < runtime.worldX(runtime.world.extractionX - 50)) return;
    const powSummary = pawnSlugPowRescueSummary(state);
    state.phase = 'victory';
    state.score += Math.max(0, 12000 - Math.floor(state.missionTime * 35));
    state.score += powSummary.scoreBonus;
    runtime.setAmbientDuck(false);
    runtime.setToast(runtime.matthiasLine('win'), Infinity);
    burst(state.player.x + 1.5, 2.2, 1.3, true);
    runtime.emitHud(true);
  }

  return {
    burst,
    explode,
    damageEnemy,
    hurtPlayer,
    updatePows,
    updateBullets,
    updateGrenades,
    updateDestructibles,
    updatePickups,
    updateFx,
    checkVictory,
  };
}
