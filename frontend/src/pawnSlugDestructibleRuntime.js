import {
  pawnSlugClaimDestructibleReward,
  pawnSlugCreateDestructibleState,
  pawnSlugDamageDestructible,
} from './pawnSlugDestructibles.js';
import { createPawnSlugDestructibleModel, animatePawnSlugDestructibleModel } from './pawnSlugDestructibleArt.js';
import { pawnSlugDestructiblesAhead } from './pawnSlugDestructibleLayout.js';

function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export function pawnSlugSpawnDestructiblesAhead({
  rightEdge,
  active = [],
  destroyedIds = new Set(),
  resolveY = () => 0,
  addModel = () => {},
  coarse = false,
} = {}) {
  const activeIds = new Set(active.map((item) => item.id));
  const spawned = [];
  for (const entry of pawnSlugDestructiblesAhead(rightEdge, destroyedIds)) {
    if (activeIds.has(entry.id)) continue;
    const model = createPawnSlugDestructibleModel(entry.type);
    const hitbox = model.userData.hitbox;
    const y = Number(resolveY(entry.x, entry)) || 0;
    model.position.set(entry.x, y, 0.28);
    model.userData.coarse = Boolean(coarse);
    addModel(model);
    const core = pawnSlugCreateDestructibleState(entry.type, { id: entry.id });
    const item = {
      ...core,
      id: entry.id,
      x: entry.x,
      y,
      w: hitbox.width,
      h: hitbox.height,
      reward: entry.reward,
      secret: Boolean(entry.secret),
      model,
    };
    active.push(item);
    spawned.push(item);
    activeIds.add(entry.id);
  }
  return spawned;
}

export function pawnSlugFirstHitDestructibleIndex(active = [], left, top, width, height) {
  for (let index = 0; index < active.length; index += 1) {
    const item = active[index];
    if (!item || item.destroyed) continue;
    if (rectsOverlap(left, top, width, height, item.x - item.w / 2, item.y, item.w, item.h)) return index;
  }
  return -1;
}

export function pawnSlugDamageRuntimeDestructible(item, amount) {
  if (!item) return { destroyedNow: false, explosion: null, score: 0, reward: null };
  const result = pawnSlugDamageDestructible(item, amount);
  const reward = result.destroyedNow ? pawnSlugClaimDestructibleReward(item, item.reward) : null;
  return { ...result, reward };
}

export function pawnSlugApplyDestructibleReward(reward, state) {
  if (!reward || !state?.player) return false;
  state.credits = Math.max(0, Math.floor(state.credits || 0)) + Math.max(0, Math.floor(reward.credits || 0));
  state.player.grenades = Math.max(0, Math.floor(state.player.grenades || 0)) + Math.max(0, Math.floor(reward.grenades || 0));
  for (const [weaponId, rawAmount] of Object.entries(reward.ammo || {})) {
    const slot = state.player.arsenal?.[weaponId];
    if (!slot) continue;
    const amount = Math.max(0, Math.floor(Number(rawAmount) || 0));
    slot.unlocked = true;
    if (Number.isFinite(slot.ammo)) slot.ammo += amount;
    if (state.player.weapon === weaponId && Number.isFinite(state.player.ammo)) state.player.ammo = slot.ammo;
  }
  return true;
}

export function pawnSlugAnimateDestructibles(active = [], time = 0, { reducedMotion = false } = {}) {
  for (const item of active) {
    animatePawnSlugDestructibleModel(item.model, time, {
      hpRatio: item.hp / Math.max(1, item.maxHp || item.hp || 1),
      destroyed: item.destroyed,
      reducedMotion,
    });
  }
}

export function pawnSlugRetireDestroyedDestructibles(active = [], destroyedIds = new Set(), removeModel = () => {}) {
  for (let index = 0; index < active.length;) {
    const item = active[index];
    if (!item.destroyed) {
      index += 1;
      continue;
    }
    destroyedIds.add(item.id);
    removeModel(item.model);
    active.splice(index, 1);
  }
}

export const PAWN_SLUG_DESTRUCTIBLE_RUNTIME_META = Object.freeze({
  collision: 'scalar-aabb',
  reward: 'one-shot',
  destroyedPersistence: 'mission-restart-safe',
  barrelExplosion: 'bounded-single-detonation',
  hpRatio: 'state-max-hp',
});
