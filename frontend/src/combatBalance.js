import { canChooseDeploymentType } from './combatMetamorphosis.js';
import { unitRecordForKey } from './combatUnitService.js';

// Compensación de dificultad por potencia PERMANENTE del ejército humano.
// Combate permite romper reglas; esta tasa de amenaza impide que un roster
// veterano convierta la campaña en un paseo. No cuenta perks temporales del
// intento (la curva por piso ya está diseñada alrededor de ellos).
const FORM_THREAT = Object.freeze({ n: 2, b: 3, r: 5, q: 7 });
const MAX_STAT_BONUS = 7;
const MAX_TECHNIQUE_BONUS = 4;
const MAX_TOTAL_BONUS = 20;

function finitePoints(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}


export function combatUnitThreat(rosterState, key) {
  const saved = rosterState?.pieces?.[key];
  if (!saved || saved.alive === false || String(key).startsWith('k-')) {
    return { bonus: 0, statBonus: 0, metamorphosisThreat: 0, techniqueBonus: 0, points: 0 };
  }
  const points = finitePoints(saved.strengthPoints) + finitePoints(saved.speedPoints);
  const statBonus = Math.min(MAX_STAT_BONUS, Math.floor(points / 12));
  const targetType = saved.deploymentType;
  const unitRecord = unitRecordForKey(rosterState, key);
  const metamorphosisThreat = targetType && canChooseDeploymentType(key, saved, targetType, unitRecord)
    ? (FORM_THREAT[targetType] || 0)
    : 0;
  const techniqueBonus = saved.equippedTechnique ? 1 : 0;
  return {
    bonus: statBonus + metamorphosisThreat + techniqueBonus,
    statBonus,
    metamorphosisThreat,
    techniqueBonus,
    points,
  };
}

export function combatArmyThreat(rosterState) {
  const pieces = rosterState?.pieces && typeof rosterState.pieces === 'object' ? rosterState.pieces : {};
  let totalStatPoints = 0;
  let metamorphosisThreat = 0;
  let equippedTechniques = 0;
  let activeVeterans = 0;
  let activeMetamorphoses = 0;

  const deployed = rosterState?.deployment && typeof rosterState.deployment === 'object'
    ? new Set(Object.values(rosterState.deployment).filter(Boolean))
    : null;

  for (const [key, saved] of Object.entries(pieces)) {
    if (!saved || saved.alive === false || key.startsWith('k-')) continue;
    if (deployed && !deployed.has(key)) continue; // reservas no pagan impuesto de amenaza
    const points = finitePoints(saved.strengthPoints) + finitePoints(saved.speedPoints);
    totalStatPoints += points;
    if (points > 0) activeVeterans += 1;

    const targetType = saved.deploymentType;
    const unitRecord = unitRecordForKey(rosterState, key);
    if (targetType && canChooseDeploymentType(key, saved, targetType, unitRecord)) {
      metamorphosisThreat += FORM_THREAT[targetType] || 0;
      activeMetamorphoses += 1;
    }
    if (saved.equippedTechnique) equippedTechniques += 1;
  }

  // Doce puntos permanentes repartidos por el ejército ≈ +1 dificultad.
  // Las formas mutantes pesan mucho más porque alteran movilidad/material de
  // salida. Las técnicas suman poco y tienen tope porque son de un solo uso.
  const statBonus = Math.min(MAX_STAT_BONUS, Math.floor(totalStatPoints / 12));
  const techniqueBonus = Math.min(MAX_TECHNIQUE_BONUS, equippedTechniques);
  const rawBonus = statBonus + metamorphosisThreat + techniqueBonus;
  const bonus = Math.min(MAX_TOTAL_BONUS, rawBonus);
  const tier = bonus >= 14 ? 'Severa' : bonus >= 8 ? 'Alta' : bonus >= 4 ? 'Moderada' : bonus > 0 ? 'Ligera' : 'Ninguna';

  return {
    bonus,
    rawBonus,
    tier,
    statBonus,
    metamorphosisThreat,
    techniqueBonus,
    totalStatPoints,
    activeVeterans,
    activeMetamorphoses,
    equippedTechniques,
  };
}

export function balancedCombatDifficulty(baseDifficulty, rosterState) {
  const base = Math.max(0, Math.min(100, Math.round(Number(baseDifficulty) || 0)));
  const threat = combatArmyThreat(rosterState);
  const adjusted = Math.min(100, base + threat.bonus);
  return {
    base,
    adjusted,
    appliedBonus: adjusted - base,
    threat,
  };
}
