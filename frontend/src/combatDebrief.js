import { pieceRankForLevel } from './combatRanks.js';
import { unitRecordForKey, unitDecorations } from './combatUnitService.js';

function levelFor(roster, key) {
  const saved = roster?.pieces?.[key] || {};
  return 1 + Math.max(0, Number(saved.strengthPoints) || 0) + Math.max(0, Number(saved.speedPoints) || 0);
}

function aliveIdentityIds(roster) {
  const out = new Set();
  for (const [key, identity] of Object.entries(roster?.identities || {})) {
    if (roster?.pieces?.[key]?.alive === false) continue;
    if (identity?.identityId) out.add(identity.identityId);
  }
  return out;
}

export function combatVeteranHighlight(debrief) {
  const units = Array.isArray(debrief?.units) ? debrief.units : [];
  const candidates = units.filter((unit) => {
    const veteran = Number(unit?.beforeLevel) >= 3;
    return Boolean(unit?.promoted || Number(unit?.bossDamage) > 0 || Number(unit?.kills) >= 2 || (veteran && Number(unit?.kills) >= 1));
  });
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => {
    const score = (unit) => (unit.promoted ? 50 : 0) + (Number(unit.bossDamage) || 0) * 8 + (Number(unit.kills) || 0) * 10 + (Number(unit.beforeLevel) || 1);
    return score(b) - score(a);
  })[0];
}

export function buildCombatDebrief({
  outcome,
  beforeRoster,
  afterRoster,
  participants = [],
  survivorIdentityIds = [],
  killsByIdentity = {},
  bossDamageByIdentity = {},
  battleRecord = null,
  serviceResult = null,
  creditsGained = 0,
  creditBreakdown = null,
  contractsCompleted = [],
} = {}) {
  const survivors = new Set(survivorIdentityIds || []);
  const stillAlive = aliveIdentityIds(afterRoster);
  const units = participants.map((participant) => {
    const key = participant.slotKey;
    const identityId = participant.identityId;
    const beforeLevel = levelFor(beforeRoster, key);
    const afterLevel = levelFor(afterRoster, key);
    const beforeRank = pieceRankForLevel(beforeLevel);
    const afterRank = pieceRankForLevel(afterLevel);
    const record = unitRecordForKey(afterRoster, key);
    const medals = unitDecorations(record);
    const survived = survivors.has(identityId);
    const fallen = !survived;
    return {
      key,
      identityId,
      alias: participant.alias || afterRoster?.identities?.[key]?.alias || 'Sin alias',
      originType: String(key || '').split('-')[0] || 'p',
      survived,
      fallen,
      recoverable: fallen && stillAlive.has(identityId) === false && afterRoster?.pieces?.[key]?.alive === false,
      kills: Math.max(0, Number(killsByIdentity?.[identityId]) || 0),
      bossDamage: Math.max(0, Number(bossDamageByIdentity?.[identityId]) || 0),
      beforeLevel,
      afterLevel,
      levelGain: Math.max(0, afterLevel - beforeLevel),
      beforeRank: beforeRank.label,
      afterRank: afterRank.label,
      promoted: afterRank.minLevel > beforeRank.minLevel,
      medals: medals.map((medal) => ({ id: medal.id, label: medal.label, short: medal.short })),
    };
  });

  const topUnits = [...units]
    .sort((a, b) => (b.kills * 10 + b.bossDamage * 4 + (b.survived ? 1 : 0)) - (a.kills * 10 + a.bossDamage * 4 + (a.survived ? 1 : 0)))
    .slice(0, 3);

  return {
    outcome: outcome || battleRecord?.outcome || 'draw',
    battleId: battleRecord?.id || null,
    date: battleRecord?.date || new Date().toISOString(),
    survivorCount: units.filter((unit) => unit.survived).length,
    deployedCount: units.length,
    boardSurvivorCount: Number.isFinite(Number(battleRecord?.survivorCount)) ? Number(battleRecord.survivorCount) : units.filter((unit) => unit.survived).length,
    boardDeployedCount: battleRecord ? 16 : units.length,
    fallenCount: units.filter((unit) => unit.fallen).length,
    totalKills: units.reduce((sum, unit) => sum + unit.kills, 0),
    totalBossDamage: units.reduce((sum, unit) => sum + unit.bossDamage, 0),
    creditsGained: Math.max(0, Number(creditsGained) || 0),
    creditBreakdown,
    contractsCompleted: Array.isArray(contractsCompleted) ? contractsCompleted : [],
    meritGained: Math.max(0, Number(serviceResult?.meritGained) || 0),
    promoted: serviceResult?.promoted || false,
    currentRank: serviceResult?.currentRank || null,
    newDecorations: serviceResult?.newDecorations || [],
    units,
    topUnits,
    battleRecord,
  };
}
