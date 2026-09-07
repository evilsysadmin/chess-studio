import { STORAGE_LOCAL, STORAGE_SESSION, readJsonStorage } from './safeStorage.js';

// Recovery UI only needs to know whether a recoverable Combat-shaped state is
// present. Do not import the full campaign/run/session domains here: those
// modules pull battle generation, chess.js, bosses, perks and other runtime
// code into the application bootstrap merely to answer three booleans.
const CAMPAIGN_KEY = 'chess-study-combat-campaign-v1';
const ROGUELIKE_RUN_KEY = 'chess-study-roguelike-run';
const COMBAT_MARKER_KEY = 'chess-study-active-combat-markers-v1';
const COMBAT_MARKER_VERSION = 1;

function readCampaignMarker() {
  return readJsonStorage(STORAGE_LOCAL, CAMPAIGN_KEY, { fallback: null });
}

function readRunMarker() {
  return readJsonStorage(STORAGE_LOCAL, ROGUELIKE_RUN_KEY, { fallback: null });
}

function readFreeCombatMarker() {
  const marker = readJsonStorage(STORAGE_SESSION, COMBAT_MARKER_KEY, {
    fallback: null,
    removeMalformed: true,
  });
  return !!(
    marker?.version === COMBAT_MARKER_VERSION
    && Array.isArray(marker.sessionIds)
    && marker.sessionIds.includes('free')
  );
}

function resolveRecoveryMarkers(overrides = {}) {
  const hasCampaign = Object.prototype.hasOwnProperty.call(overrides, 'campaign');
  const hasRun = Object.prototype.hasOwnProperty.call(overrides, 'run');
  const hasFreeSession = Object.prototype.hasOwnProperty.call(overrides, 'freeSession');
  const campaign = hasCampaign ? overrides.campaign : readCampaignMarker();
  const run = hasRun ? overrides.run : readRunMarker();
  const freeSession = hasFreeSession ? overrides.freeSession : readFreeCombatMarker();
  return {
    campaignActive: campaign?.active === true,
    runActive: run?.inRun === true,
    freeSession: freeSession === true,
  };
}

export function hasRecoverableCombatState(currentView, overrides = {}) {
  const { campaignActive, runActive, freeSession } = resolveRecoveryMarkers(overrides);
  if (currentView === 'roguelike') return campaignActive || runActive;
  if (currentView === 'combat') return freeSession;
  return false;
}

export function hasAnyRecoverableCombatState(overrides = {}) {
  const { campaignActive, runActive, freeSession } = resolveRecoveryMarkers(overrides);
  return campaignActive || runActive || freeSession;
}
