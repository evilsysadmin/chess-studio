import { pawnSlugPickupCopy, pawnSlugWeaponShortLabel } from './pawnSlug.js';
import { disposePawnSlugObject } from './pawnSlugArt.js';
import {
  pawnSlugAnimateDestructibles,
  pawnSlugApplyDestructibleReward,
  pawnSlugDamageRuntimeDestructible,
  pawnSlugRectsOverlap,
  pawnSlugRetireDestroyedDestructibles,
  pawnSlugUpdatePowRescues,
} from './pawnSlugRuntimeHotPath.js';
import { PAWN_SLUG_PLAYER_H, PAWN_SLUG_PLAYER_W } from './pawnSlugRuntimeCore.js';

export function createPawnSlugWorldInteractionSystem(runtime, {
  burst,
  explode,
} = {}) {
  function destructibleRewardCopy(reward) {
    const parts = [];
    if (reward?.credits) parts.push(`${reward.credits} cr`);
    if (reward?.grenades) parts.push(`+${reward.grenades} granadas`);
    for (const [weaponId, amount] of Object.entries(reward?.ammo || {})) {
      parts.push(`${pawnSlugWeaponShortLabel(weaponId)} +${amount}`);
    }
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
    if (result.explosion) {
      explode?.(item.x, item.y + item.h * 0.5, result.explosion.radius, result.explosion.damage);
    } else {
      burst?.(item.x, item.y + item.h * 0.5, 0.65, false);
      runtime.sfx.play('hit');
    }
    state.shake = Math.max(state.shake, runtime.reducedMotion ? 0 : item.type === 'barrel' ? 0.24 : 0.1);
    runtime.emitHud(true);
    return result;
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
        for (const [weaponId, amount] of Object.entries(result.reward?.ammo || {})) {
          rewards.push(`${pawnSlugWeaponShortLabel(weaponId)} +${amount}`);
        }
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
      if (!pawnSlugRectsOverlap(
        playerLeft,
        playerTop,
        PAWN_SLUG_PLAYER_W,
        PAWN_SLUG_PLAYER_H,
        pickup.x - pickup.w / 2,
        pickup.y,
        pickup.w,
        pickup.h,
      )) {
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

  return {
    damageDestructible,
    updatePows,
    updateDestructibles,
    updatePickups,
  };
}
