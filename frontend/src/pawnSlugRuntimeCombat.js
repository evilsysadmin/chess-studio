import {
  PAWN_SLUG_WEAPON_ORDER,
  pawnSlugLevelForXp,
  pawnSlugMaxHpForLevel,
  pawnSlugScoreForKill,
  pawnSlugWeaponShortLabel,
  pawnSlugWeaponUpgradeCrossed,
  pawnSlugXpForKill,
} from './pawnSlug.js';
import { pawnSlugCreditsForKill } from './pawnSlugEconomy.js';
import { disposePawnSlugObject } from './pawnSlugArt.js';
import { createExplosionParticle } from './pawnSlugExplosionArt.js';
import { animatePremiumMuzzleFlash } from './pawnSlugPremiumFx.js';
import { pawnSlugPowRescueSummary } from './pawnSlugRuntimeHotPath.js';
import { pawnSlugWantedCreditBonus } from './pawnSlugWantedOfficers.js';
import {
  PAWN_SLUG_GRAVITY,
  PAWN_SLUG_PLAYER_H,
  PAWN_SLUG_VIEW_W,
  PAWN_SLUG_WORLD_SCALE,
  pawnSlugClamp,
  pawnSlugNearestCheckpoint,
} from './pawnSlugRuntimeCore.js';
import { createPawnSlugProjectileSystem } from './pawnSlugRuntimeProjectiles.js';
import { createPawnSlugWorldInteractionSystem } from './pawnSlugRuntimeWorldInteractions.js';

export function createPawnSlugCombatSystem(runtime) {
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
      if (distance <= radius) worldInteractions.damageDestructible(item, damage * (1 - distance / (radius * 1.35)));
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
    runtime.camera.position.x = Math.max(PAWN_SLUG_VIEW_W / 2, player.x + PAWN_SLUG_VIEW_W * 0.14);
    runtime.camera.position.y = 5.1;
    runtime.setToast(`Vida menos. Reagrupando en ${Math.round(player.x / PAWN_SLUG_WORLD_SCALE)} m. Pistola fuera.`, 2.2);
  }

  const worldInteractions = createPawnSlugWorldInteractionSystem(runtime, { burst, explode });
  const projectiles = createPawnSlugProjectileSystem(runtime, {
    explode,
    hurtPlayer,
    damageDestructible: worldInteractions.damageDestructible,
    damageEnemy,
  });

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
    updatePows: worldInteractions.updatePows,
    updateBullets: projectiles.updateBullets,
    updateGrenades: projectiles.updateGrenades,
    updateDestructibles: worldInteractions.updateDestructibles,
    updatePickups: worldInteractions.updatePickups,
    updateFx,
    checkVictory,
  };
}
