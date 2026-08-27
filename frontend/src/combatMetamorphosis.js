import { pieceRankAtLeast } from './combatRanks.js';
import { unitRecordForKey } from './combatUnitService.js';

// Metamorfosis = LOADOUT de batalla, no evolución irreversible. La identidad
// y la clase de origen nunca cambian. Se elige en la pantalla prebatalla y
// queda congelada durante esa batalla.
export const METAMORPHOSIS_LABELS = { p: 'Peón', n: 'Caballo', b: 'Alfil', r: 'Torre', q: 'Dama' };

// El rango abre la puerta, pero el servicio real decide si el veterano se ha
// ganado esa forma. Esto evita que una pieza farmeada únicamente con XP se
// convierta en una unidad mutante sin haber sobrevivido ni hecho nada digno.
const FORM_REQUIREMENTS = Object.freeze({
  n: {
    rankId: 'commander',
    rankLabel: 'Comandante',
    requirementLabel: '3 supervivencias',
    serviceTest: (stats) => (stats?.survivals || 0) >= 3,
    progressLabel: (stats) => `${Math.min(3, stats?.survivals || 0)}/3 supervivencias`,
  },
  b: {
    rankId: 'colonel',
    rankLabel: 'Coronel',
    requirementLabel: 'medallas Cinco bajas + Hierro viejo',
    serviceTest: (stats) => (stats?.kills || 0) >= 5 && (stats?.bestSurvivalStreak || 0) >= 5,
    progressLabel: (stats) => `${Math.min(5, stats?.kills || 0)}/5 bajas · ${Math.min(5, stats?.bestSurvivalStreak || 0)}/5 racha superviviente`,
  },
  r: {
    rankId: 'general',
    rankLabel: 'General',
    requirementLabel: 'Veterano de campaña + Cicatriz del Rey Viejo',
    serviceTest: (stats) => (stats?.battles || 0) >= 10 && (stats?.survivals || 0) >= 7 && (stats?.bossVictories || 0) >= 1,
    progressLabel: (stats) => `${Math.min(10, stats?.battles || 0)}/10 batallas · ${Math.min(7, stats?.survivals || 0)}/7 supervivencias · ${Math.min(1, stats?.bossVictories || 0)}/1 boss`,
  },
});

function levelFromSaved(piece) {
  return 1 + Math.max(0, Number(piece?.strengthPoints) || 0) + Math.max(0, Number(piece?.speedPoints) || 0);
}

export function deploymentUnlockStatus(key, saved, unitRecord = null) {
  const original = String(key || '').split('-')[0];
  const level = levelFromSaved(saved);
  const statuses = [{
    type: original,
    label: METAMORPHOSIS_LABELS[original] || original,
    unlocked: true,
    rankMet: true,
    serviceMet: true,
    requirementLabel: 'Clase de origen',
    progressLabel: 'Disponible',
  }];

  if (!saved || saved.alive === false || original !== 'p') return statuses;
  const stats = unitRecord?.stats || {};
  for (const type of ['n', 'b', 'r']) {
    const requirement = FORM_REQUIREMENTS[type];
    const rankMet = pieceRankAtLeast(level, requirement.rankId);
    const serviceMet = requirement.serviceTest(stats);
    statuses.push({
      type,
      label: METAMORPHOSIS_LABELS[type],
      unlocked: rankMet && serviceMet,
      rankMet,
      serviceMet,
      rankId: requirement.rankId,
      rankLabel: requirement.rankLabel,
      requirementLabel: requirement.requirementLabel,
      progressLabel: requirement.progressLabel(stats),
    });
  }
  return statuses;
}

export function unlockedDeploymentTypes(key, saved, unitRecord = null) {
  return deploymentUnlockStatus(key, saved, unitRecord).filter((status) => status.unlocked).map((status) => status.type);
}

export function canChooseDeploymentType(key, saved, targetType, unitRecord = null) {
  return unlockedDeploymentTypes(key, saved, unitRecord).includes(targetType);
}

export function setRosterDeploymentType(rosterState, key, targetType) {
  const saved = rosterState?.pieces?.[key];
  const original = String(key || '').split('-')[0];
  const unitRecord = unitRecordForKey(rosterState, key);
  if (!saved || !canChooseDeploymentType(key, saved, targetType, unitRecord)) return rosterState;
  const deploymentType = targetType === original ? null : targetType;
  return {
    ...rosterState,
    pieces: { ...rosterState.pieces, [key]: { ...saved, deploymentType, metamorphosis: undefined } },
  };
}
