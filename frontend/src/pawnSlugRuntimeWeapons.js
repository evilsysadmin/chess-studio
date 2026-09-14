import {
  PAWN_SLUG_WEAPON_ORDER,
  PAWN_SLUG_WEAPONS,
  pawnSlugAmmoForPickup,
  pawnSlugWeaponStatsForLevel,
} from './pawnSlug.js';
import {
  pawnSlugApplyLiveWeaponModel,
  pawnSlugLiveWeaponLabel,
  pawnSlugLiveWeaponModel,
} from './pawnSlugLiveWeaponModels.js';
import { createGrenadeModel } from './pawnSlugArt.js';
import { createPremiumBulletModel, createPremiumMuzzleFlash } from './pawnSlugPremiumFx.js';
import {
  pawnSlugEnemyCanFire,
  pawnSlugEnemyFireCooldown,
  pawnSlugEnemyPrefireStep,
  pawnSlugEnemyShotPlan,
  pawnSlugEnemyWeaponFor,
} from './pawnSlugRuntimeHotPath.js';
import { pawnSlugSturmBishopSuppressionLane } from './pawnSlugMidBoss.js';
import {
  PAWN_SLUG_WEAPON_VISUAL_FRAME,
  PAWN_SLUG_WORLD_SCALE,
  pawnSlugClamp,
} from './pawnSlugRuntimeCore.js';

export function createPawnSlugWeaponSystem(runtime) {
  function syncPlayerWeaponVisual(id = runtime.state.player.weapon) {
    const frameIndex = PAWN_SLUG_WEAPON_VISUAL_FRAME[id] ?? 0;
    const liveModel = pawnSlugLiveWeaponModel(id);
    runtime.playerWeaponModel.userData.setFrame?.(frameIndex);
    runtime.playerWeaponModel.userData.weaponId = id;
    runtime.playerWeaponModel.userData.modelId = liveModel?.id || null;
    runtime.playerWeaponModel.userData.modelLabel = liveModel?.label || null;
    const large = id === 'panzerfaust';
    runtime.playerWeaponModel.scale.set(large ? 1.55 : 1.35, large ? 0.78 : 0.68, 1);
  }

  function weaponAvailable(player, id) {
    const slot = player.arsenal[id];
    return Boolean(slot?.unlocked && (id === 'pistol' || slot.ammo > 0));
  }

  function syncCurrentWeaponAmmo(player) {
    const slot = player.arsenal[player.weapon];
    if (slot) slot.ammo = player.ammo;
  }

  function selectWeapon(id, { announce = true } = {}) {
    const player = runtime.state.player;
    if (!PAWN_SLUG_WEAPONS[id] || !weaponAvailable(player, id)) return false;
    if (player.weapon !== id) syncCurrentWeaponAmmo(player);
    player.weapon = id;
    player.ammo = player.arsenal[id].ammo;
    runtime.playerModel.userData.setWeapon?.(id);
    syncPlayerWeaponVisual(id);
    if (announce) {
      const upgrade = pawnSlugWeaponStatsForLevel(id, player.level);
      runtime.setToast(`ARMA // ${pawnSlugLiveWeaponLabel(id)} · ${upgrade.upgradeCode}`, 1.15);
    }
    runtime.emitHud(true);
    return true;
  }

  function cycleWeapon(direction) {
    const player = runtime.state.player;
    const available = PAWN_SLUG_WEAPON_ORDER.filter((id) => weaponAvailable(player, id));
    if (available.length < 2) return false;
    const current = Math.max(0, available.indexOf(player.weapon));
    const next = available[(current + direction + available.length) % available.length];
    return selectWeapon(next);
  }

  function grantWeapon(id) {
    const weapon = PAWN_SLUG_WEAPONS[id];
    const slot = runtime.state.player.arsenal[id];
    if (!weapon || !slot) return false;
    slot.unlocked = true;
    const pickupAmmo = pawnSlugAmmoForPickup(id, runtime.state.player.level);
    if (Number.isFinite(pickupAmmo)) slot.ammo += pickupAmmo;
    else slot.ammo = Infinity;
    selectWeapon(id, { announce: false });
    return true;
  }

  function addFlash(x, y, dir = 1, weapon = 'pistol', enemy = false) {
    const model = createPremiumMuzzleFlash({ enemy, weapon });
    model.position.set(x, y, 0.35);
    model.scale.x *= dir;
    runtime.fxLayer.add(model);
    const life = model.userData.life || 0.07;
    runtime.state.flashes.push({ model, life, maxLife: life });
  }

  function addBullet({ x, y, vx, vy = 0, damage, enemy = false, explosive = false, life = 2.8, weapon = 'pistol' }) {
    const model = createPremiumBulletModel({ enemy, explosive, weapon });
    model.position.set(x, y, 0.3);
    if (vx < 0) model.scale.x = -1;
    runtime.projectileLayer.add(model);
    runtime.state.bullets.push({ x, y, vx, vy, damage, enemy, explosive, life, weapon, w: explosive ? 0.45 : 0.15, h: explosive ? 0.22 : 0.12, model });
  }

  function firePlayerWeapon() {
    const state = runtime.state;
    const player = state.player;
    if (player.fireCooldown > 0 || state.phase !== 'playing') return false;
    const weaponId = player.weapon;
    const weapon = pawnSlugApplyLiveWeaponModel(pawnSlugWeaponStatsForLevel(weaponId, player.level), weaponId);
    if (Number.isFinite(player.ammo) && player.ammo <= 0) {
      selectWeapon('pistol', { announce: false });
      runtime.setToast('Munición agotada. Vuelta al hierro reglamentario.', 1.7);
      return false;
    }

    player.fireCooldown = weapon.cadence / 1000;
    player.recoil = weaponId === 'panzerfaust' ? 0.12 : weaponId === 'shotgun' ? 0.085 : weaponId === 'machinegun' ? 0.04 : 0.055;
    if (Number.isFinite(player.ammo)) {
      player.ammo -= 1;
      player.arsenal[weaponId].ammo = player.ammo;
    }
    const dir = player.dir;
    const muzzleX = player.x + dir * 1.05;
    const muzzleY = player.y + (player.crouch ? 0.72 : 1.12);
    const baseSpeed = weapon.speed * PAWN_SLUG_WORLD_SCALE;
    for (let pellet = 0; pellet < weapon.pellets; pellet += 1) {
      const spread = (Math.random() * 2 - 1) * weapon.spread;
      addBullet({
        x: muzzleX,
        y: muzzleY,
        vx: dir * baseSpeed * Math.cos(spread),
        vy: baseSpeed * Math.sin(spread),
        damage: weapon.damage,
        explosive: Boolean(weapon.explosive),
        weapon: weaponId,
      });
    }
    addFlash(muzzleX, muzzleY, dir, weaponId, false);
    runtime.sfx.play(weaponId);

    if (Number.isFinite(player.ammo) && player.ammo <= 0) {
      selectWeapon('pistol', { announce: false });
      runtime.setToast(`${weapon.modelLabel || pawnSlugLiveWeaponLabel(weaponId)}: seco. Pistola.`, 1.35);
    }
    runtime.emitHud(true);
    return true;
  }

  function throwGrenade() {
    const state = runtime.state;
    const player = state.player;
    if (player.grenades <= 0 || state.phase !== 'playing') return;
    player.grenades -= 1;
    const model = createGrenadeModel();
    const grenade = {
      x: player.x + player.dir * 0.65,
      y: player.y + 1.12,
      vx: player.dir * 6.8,
      vy: 7.5,
      fuse: 1.35,
      model,
    };
    model.position.set(grenade.x, grenade.y, 0.35);
    runtime.projectileLayer.add(model);
    state.grenades.push(grenade);
    runtime.setToast(runtime.matthiasLine('grenade'), 1.35);
  }

  function fireEnemy(enemy, explosive = false) {
    const state = runtime.state;
    const dir = enemy.x >= state.player.x ? -1 : 1;
    const y = enemy.y + (enemy.type === 'boss' ? 1.9 : enemy.type === 'bishop' ? 1.55 : enemy.type === 'rook' ? 1.15 : 0.88);
    const weaponId = explosive ? 'panzerfaust' : (enemy.weapon || pawnSlugEnemyWeaponFor(enemy.type, 0));
    const plan = pawnSlugEnemyShotPlan(weaponId);
    const targetDy = (state.player.y + 0.8) - y;
    const distance = Math.max(1, Math.abs(state.player.x - enemy.x));
    const aimedVy = pawnSlugClamp(targetDy / distance * plan.speed, -2.4, 2.4);
    const muzzleOffset = enemy.type === 'boss' ? 2 : enemy.type === 'bishop' ? 1.05 : 0.7;
    for (let pellet = 0; pellet < plan.pellets; pellet += 1) {
      const spread = (Math.random() * 2 - 1) * plan.spread;
      addBullet({
        x: enemy.x + dir * muzzleOffset,
        y,
        vx: dir * plan.speed * Math.cos(spread),
        vy: aimedVy + plan.speed * Math.sin(spread),
        damage: plan.damage,
        enemy: true,
        explosive: plan.explosive,
        life: explosive ? 4 : Math.min(4, plan.range / Math.max(0.001, plan.speed) + 0.18),
        weapon: weaponId,
      });
    }
    addFlash(enemy.x + dir * muzzleOffset, y, dir, weaponId, true);
    runtime.sfx.play(weaponId, { enemy: true });
  }

  function updateEnemyRegularFire(enemy, distance, roleRange, cadence, dt) {
    const ready = enemy.fireCooldown <= 0 && pawnSlugEnemyCanFire(enemy.weapon, distance, roleRange);
    const prefire = pawnSlugEnemyPrefireStep(enemy.weapon, {
      remaining: enemy.fireTelegraph,
      ready,
      dt,
    });
    enemy.fireTelegraph = prefire.remaining;
    enemy.fireTelegraphProgress = prefire.phase === 'telegraph' ? prefire.progress : 0;
    if (prefire.phase !== 'fire') return false;
    fireEnemy(enemy, false);
    enemy.fireCooldown = pawnSlugEnemyFireCooldown(enemy.weapon, Math.random()) * cadence;
    return true;
  }

  function fireBishopSuppression(enemy, shotIndex) {
    const lane = pawnSlugSturmBishopSuppressionLane(shotIndex);
    const dir = enemy.x >= runtime.state.player.x ? -1 : 1;
    const x = enemy.x + dir * 1.05;
    const y = enemy.y + lane.height;
    addBullet({
      x,
      y,
      vx: dir * lane.speed,
      damage: lane.damage,
      enemy: true,
      weapon: 'machinegun',
      life: 3.2,
    });
    addFlash(x, y, dir, 'machinegun', true);
    runtime.sfx.play('machinegun', { enemy: true });
  }

  return {
    syncPlayerWeaponVisual,
    selectWeapon,
    cycleWeapon,
    grantWeapon,
    addBullet,
    addFlash,
    firePlayerWeapon,
    throwGrenade,
    fireEnemy,
    updateEnemyRegularFire,
    fireBishopSuppression,
  };
}
