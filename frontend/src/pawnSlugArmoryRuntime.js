import { createPawnSlugGame } from './pawnSlugThree.js';
import { setPawnSlugRuntimeRpgEnabled } from './pawnSlug.js';
import { pawnSlugLiveWeaponLabel, pawnSlugLiveWeaponModel } from './pawnSlugLiveWeaponModels.js';
import { destroyPawnSlugPremiumSfx } from './pawnSlugSfx.js';
import {
  pawnSlugBuyOrEquipWeaponModel,
  pawnSlugWeaponModelOffers,
  refreshPawnSlugWeaponModelArmory,
} from './pawnSlugWeaponModelArmory.js';

export const PAWN_SLUG_HUD_FORWARD_INTERVAL_MS = 80;

function decorateHud(hud, spentCredits = 0, expertMode = false) {
  if (!hud) return hud;
  return {
    ...hud,
    credits: expertMode ? Math.max(0, Math.floor(Number(hud.credits) || 0) - spentCredits) : 0,
    weaponLabel: pawnSlugLiveWeaponLabel(hud.weapon),
    weaponModelId: pawnSlugLiveWeaponModel(hud.weapon)?.id || null,
    weapons: (hud.weapons || []).map((weapon) => ({
      ...weapon,
      label: pawnSlugLiveWeaponLabel(weapon.id),
      modelId: pawnSlugLiveWeaponModel(weapon.id)?.id || null,
    })),
    weaponModels: expertMode ? pawnSlugWeaponModelOffers() : [],
  };
}

function hudCriticalKey(hud) {
  if (!hud) return '';
  return [
    hud.phase,
    hud.hp,
    hud.maxHp,
    hud.lives,
    hud.level,
    hud.weapon,
    hud.grenades,
    hud.toast,
  ].join('|');
}

export function createPawnSlugHudForwarder(onHud, decorate, {
  intervalMs = PAWN_SLUG_HUD_FORWARD_INTERVAL_MS,
  now = () => Date.now(),
  schedule = (task, delay) => setTimeout(task, delay),
  cancel = (handle) => clearTimeout(handle),
} = {}) {
  let lastSentAt = Number.NEGATIVE_INFINITY;
  let lastCriticalKey = null;
  let pendingHud = null;
  let pendingTimer = null;
  let stopped = false;

  function send(hud) {
    if (stopped || !hud) return;
    pendingHud = null;
    if (pendingTimer != null) {
      cancel(pendingTimer);
      pendingTimer = null;
    }
    lastSentAt = now();
    lastCriticalKey = hudCriticalKey(hud);
    onHud?.(decorate(hud));
  }

  function flush() {
    pendingTimer = null;
    if (pendingHud) send(pendingHud);
  }

  function forward(hud) {
    if (stopped || !hud) return;
    const stamp = now();
    const criticalKey = hudCriticalKey(hud);
    const criticalChanged = lastCriticalKey == null || criticalKey !== lastCriticalKey;
    const elapsed = stamp - lastSentAt;
    if (criticalChanged || elapsed >= intervalMs) {
      send(hud);
      return;
    }

    pendingHud = hud;
    if (pendingTimer != null) return;
    pendingTimer = schedule(flush, Math.max(0, intervalMs - elapsed));
  }

  function stop() {
    stopped = true;
    pendingHud = null;
    if (pendingTimer != null) cancel(pendingTimer);
    pendingTimer = null;
  }

  return Object.freeze({ forward, flush, stop });
}

export function createPawnSlugArmoryGame(host, { onReady, onHud, expertMode = false } = {}) {
  const expert = expertMode === true;
  refreshPawnSlugWeaponModelArmory();
  setPawnSlugRuntimeRpgEnabled(expert);
  let latestHud = null;
  let spentCredits = 0;
  let engine;
  if (host?.dataset) host.dataset.pawnSlugPaused = 'false';
  const hudForwarder = createPawnSlugHudForwarder(
    onHud,
    (hud) => decorateHud(hud, spentCredits, expert),
  );

  function forwardHud(nextHud) {
    latestHud = nextHud;
    if (host?.dataset && nextHud?.phase) host.dataset.pawnSlugPhase = String(nextHud.phase);
    hudForwarder.forward(nextHud);
  }

  try {
    engine = createPawnSlugGame(host, { onReady, onHud: forwardHud });
  } catch (error) {
    hudForwarder.stop();
    if (host?.dataset) {
      delete host.dataset.pawnSlugPaused;
      delete host.dataset.pawnSlugPhase;
    }
    setPawnSlugRuntimeRpgEnabled(true);
    throw error;
  }

  return {
    ...engine,
    setPaused(value) {
      const paused = Boolean(value);
      if (host?.dataset) host.dataset.pawnSlugPaused = paused ? 'true' : 'false';
      engine.setPaused?.(paused);
    },
    destroy() {
      hudForwarder.stop();
      try {
        engine.destroy?.();
      } finally {
        if (host?.dataset) {
          delete host.dataset.pawnSlugPaused;
          delete host.dataset.pawnSlugPhase;
        }
        setPawnSlugRuntimeRpgEnabled(true);
        destroyPawnSlugPremiumSfx();
      }
    },
    buyOrEquipWeaponModel(weaponId, modelId) {
      if (!expert) return Object.freeze({ ok: false, reason: 'expert-mode-disabled' });
      if (!latestHud || latestHud.phase === 'playing') return Object.freeze({ ok: false, reason: 'mission-in-progress' });
      const available = Math.max(0, Math.floor(Number(latestHud.credits) || 0) - spentCredits);
      const result = pawnSlugBuyOrEquipWeaponModel({ weaponId, modelId, credits: available });
      if (!result.ok) return result;
      spentCredits += result.cost;
      onHud?.(decorateHud(latestHud, spentCredits, expert));
      return result;
    },
  };
}

export const PAWN_SLUG_ARMORY_RUNTIME_META = Object.freeze({
  purchaseWindow: 'overlay-only',
  combatDelegation: 'pawnSlugThree',
  creditLedger: 'current-runtime-session',
  expertModeOwnsEconomyAndRpg: true,
  premiumSfxLifecycle: 'destroy-with-runtime',
  hudForwarding: `coalesced-${PAWN_SLUG_HUD_FORWARD_INTERVAL_MS}ms-critical-immediate`,
  renderStateDataset: 'phase-plus-paused',
});