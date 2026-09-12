import {
  PAWN_SLUG_POWS,
  pawnSlugCanRescuePow,
  pawnSlugPowMissionBonus,
  pawnSlugRescuePow,
} from './pawnSlugPows.js';
import { animatePawnSlugPowModel, createPawnSlugPowModel } from './pawnSlugPowArt.js';

const clampAmmo = (value) => Math.max(0, Number(value) || 0);

export function pawnSlugApplyPowReward(state, reward = {}) {
  if (!state?.player) return state;
  state.credits = Math.max(0, Math.floor(Number(state.credits) || 0)) + Math.max(0, Math.floor(Number(reward.credits) || 0));
  state.player.grenades = Math.max(0, Math.floor(Number(state.player.grenades) || 0)) + Math.max(0, Math.floor(Number(reward.grenades) || 0));

  for (const [weaponId, amount] of Object.entries(reward.ammo || {})) {
    const slot = state.player.arsenal?.[weaponId];
    if (!slot) continue;
    slot.unlocked = true;
    if (Number.isFinite(slot.ammo)) slot.ammo = clampAmmo(slot.ammo) + Math.max(0, Math.floor(Number(amount) || 0));
    if (state.player.weapon === weaponId && Number.isFinite(state.player.ammo)) state.player.ammo = slot.ammo;
  }
  return state;
}

export function pawnSlugSpawnPowsAhead(state, dynamic, rightEdge, {
  coarse = false,
  supportAtX = () => null,
} = {}) {
  if (!state || !dynamic) return [];
  state.pows ||= [];
  state.rescuedPows ||= new Set();
  const spawnedIds = new Set(state.pows.map((entry) => entry.id));
  const created = [];

  for (const pow of PAWN_SLUG_POWS) {
    if (pow.x > rightEdge || state.rescuedPows.has(pow.id) || spawnedIds.has(pow.id)) continue;
    const model = createPawnSlugPowModel(pow, { coarse });
    const support = supportAtX(pow.x);
    const y = support?.y || 0;
    model.position.set(pow.x, y, 0.46);
    dynamic.add(model);
    const entry = { id: pow.id, pow, x: pow.x, y, model, rescuedAt: null };
    state.pows.push(entry);
    created.push(entry);
  }
  return created;
}

export function pawnSlugUpdatePowRescues(state, time = 0, {
  reducedMotion = false,
  onRescue = null,
  onRemove = null,
} = {}) {
  if (!state?.player || !Array.isArray(state.pows)) return [];
  state.rescuedPows ||= new Set();
  const rescuedNow = [];

  for (let index = state.pows.length - 1; index >= 0; index -= 1) {
    const entry = state.pows[index];
    const alreadyRescued = state.rescuedPows.has(entry.id);
    animatePawnSlugPowModel(entry.model, time, { rescued: alreadyRescued, reducedMotion });

    if (alreadyRescued) {
      if (entry.rescuedAt != null && time - entry.rescuedAt >= 0.72) {
        onRemove?.(entry.model);
        state.pows.splice(index, 1);
      }
      continue;
    }

    const radius = entry.model?.userData?.rescueRadius || 0.82;
    const horizontal = Math.abs(state.player.x - entry.x) <= radius;
    const vertical = state.player.y < entry.y + 1.9 && state.player.y + 1.75 > entry.y;
    if (!horizontal || !vertical || !pawnSlugCanRescuePow(entry.pow, state.rescuedPows)) continue;

    const result = pawnSlugRescuePow(entry.pow, state.rescuedPows);
    if (!result.ok) continue;
    state.rescuedPows.add(result.rescuedId);
    entry.rescuedAt = time;
    pawnSlugApplyPowReward(state, result.reward);
    rescuedNow.push(result);
    onRescue?.(result, entry);
  }

  return rescuedNow;
}

export function pawnSlugPowRescueSummary(state) {
  const rescuedIds = state?.rescuedPows;
  const rescued = PAWN_SLUG_POWS.reduce(
    (count, pow) => count + (rescuedIds?.has?.(pow.id) ? 1 : 0),
    0,
  );
  return Object.freeze({
    rescued,
    total: PAWN_SLUG_POWS.length,
    scoreBonus: pawnSlugPowMissionBonus(rescued),
    complete: rescued >= PAWN_SLUG_POWS.length,
  });
}
