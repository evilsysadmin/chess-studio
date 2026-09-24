import { STORAGE_LOCAL, readJsonStorage } from './safeStorage.js';

// Same key as combatCampaign.js. Home only needs the `active` flag, and importing that module
// would pull the whole campaign engine into the entry bundle (which has a hard size budget).
export const COMBAT_CAMPAIGN_STORAGE_KEY = 'chess-study-combat-campaign-v1';

export function loadPendingCampaignFlag() {
  const stored = readJsonStorage(STORAGE_LOCAL, COMBAT_CAMPAIGN_STORAGE_KEY, { fallback: null });
  return { active: stored?.active === true };
}

// "A medias": other game modes the player already started and has not finished. They surface
// in the JUGAR menu only while they exist, so the menu never grows on a normal day. A saved
// chess game is not listed here: it already is the big CONTINUAR button.

const RUN_LABELS = Object.freeze({ streak: 'Racha', boss: 'Jefe', cup: 'Copa' });

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

function specialRunDetail(run) {
  const wins = Math.max(0, Number(run?.wins) || 0);
  if (run?.mode === 'cup') {
    const total = Math.max(1, Number(run?.totalGames) || 8);
    const played = Math.max(0, Number(run?.completedStages) || 0);
    return `Partida ${Math.min(total, played + 1)} de ${total}`;
  }
  if (run?.mode === 'boss') return wins > 0 ? 'Jefe a tiro' : 'Frente al jefe';
  return wins > 0 ? plural(wins, 'victoria seguida', 'victorias seguidas') : 'Sin victorias todavía';
}

export function buildPendingModes({ campaign = null, specialRun = null, onContinueCampaign = null, onContinueRun = null } = {}) {
  const items = [];
  if (campaign?.active && onContinueCampaign) {
    items.push({
      key: 'campaign',
      title: 'Campaña de Combat',
      detail: 'Sigue donde la dejaste',
      action: onContinueCampaign,
    });
  }
  if (specialRun?.active && onContinueRun) {
    items.push({
      key: 'run',
      title: `Modo especial · ${RUN_LABELS[specialRun.mode] || 'en curso'}`,
      detail: specialRunDetail(specialRun),
      action: onContinueRun,
    });
  }
  return items;
}
