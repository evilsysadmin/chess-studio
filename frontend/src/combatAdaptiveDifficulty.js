// Adaptación PRE-batalla para Combat Chess.
//
// Campaña/Torre ya tienen su propia curva ascendente y el ejército veterano
// añade amenaza por separado. Esta capa sólo evita que una mala racha se
// convierta en una pared: nunca cambia la CPU a mitad de batalla y nunca sube
// el reto por una racha buena.

export const COMBAT_ADAPTIVE_RECENT_BATTLES = 6;
export const COMBAT_ADAPTIVE_MAX_RELIEF = 18;

// Combat necesita conservar más dientes que Partida rápida, pero comparte el
// mismo problema técnico: el motor cambia de profundidad en 70 y 90. Esta
// curva mantiene intacto el tramo <=60 y reserva esos cambios de marcha para
// hitos más altos de Campaña/Torre. Siempre es monótona y nunca hace al motor
// más fuerte que la dificultad estratégica solicitada.
export const COMBAT_ENGINE_CURVE = Object.freeze([
  [5, 5],
  [60, 60],
  [69, 68],
  [73, 69],
  [74, 70],
  [84, 82],
  [89, 87],
  [92, 89],
  [93, 90],
  [95, 94],
]);

export function calibrateCombatEngineDifficulty(rawDifficulty) {
  const raw = Math.max(5, Math.min(95, Number(rawDifficulty) || 0));
  for (let index = 1; index < COMBAT_ENGINE_CURVE.length; index += 1) {
    const [rightRaw, rightEngine] = COMBAT_ENGINE_CURVE[index];
    const [leftRaw, leftEngine] = COMBAT_ENGINE_CURVE[index - 1];
    if (raw <= rightRaw) {
      const span = rightRaw - leftRaw || 1;
      const t = (raw - leftRaw) / span;
      return Math.round(leftEngine + (rightEngine - leftEngine) * t);
    }
  }
  return COMBAT_ENGINE_CURVE[COMBAT_ENGINE_CURVE.length - 1][1];
}

function outcomeScore(outcome) {
  if (outcome === 'win') return 1;
  if (outcome === 'draw') return 0.5;
  if (outcome === 'retired') return 0.2;
  return 0;
}

function validRecentBattles(history) {
  return (Array.isArray(history) ? history : [])
    .filter((battle) => ['win', 'draw', 'loss', 'retired'].includes(battle?.outcome))
    .slice(0, COMBAT_ADAPTIVE_RECENT_BATTLES);
}

export function combatAdaptiveRelief(history = []) {
  const recent = validRecentBattles(history);
  if (!recent.length) return 0;

  // Dos victorias consecutivas son evidencia suficiente de que el alivio ya
  // no hace falta. La propia campaña seguirá escalando por sector/piso.
  if (recent[0]?.outcome === 'win' && recent[1]?.outcome === 'win') return 0;

  if (recent.length === 1) {
    if (recent[0].outcome === 'loss') return -5;
    if (recent[0].outcome === 'retired') return -3;
    return 0;
  }

  if (recent.length === 2) {
    const outcomes = recent.map((battle) => battle.outcome);
    const losses = outcomes.filter((outcome) => outcome === 'loss').length;
    const retirements = outcomes.filter((outcome) => outcome === 'retired').length;
    if (losses === 2) return -9;
    if (losses === 1 && retirements === 1) return -7;
    if (retirements === 2) return -5;
    return outcomes[0] === 'loss' ? -5 : outcomes[0] === 'retired' ? -3 : 0;
  }

  let weightedScore = 0;
  let weightTotal = 0;
  recent.forEach((battle, index) => {
    const weight = Math.max(1, recent.length - index);
    weightedScore += outcomeScore(battle.outcome) * weight;
    weightTotal += weight;
  });
  const performance = weightTotal ? weightedScore / weightTotal : 0.5;

  let relief = 0;
  if (performance <= 0.2) relief = -15;
  else if (performance <= 0.35) relief = -11;
  else if (performance <= 0.45) relief = -7;

  let hardLossStreak = 0;
  for (const battle of recent) {
    if (battle.outcome !== 'loss') break;
    hardLossStreak += 1;
  }
  if (hardLossStreak >= 4) relief -= 5;
  else if (hardLossStreak >= 3) relief -= 3;

  return Math.max(-COMBAT_ADAPTIVE_MAX_RELIEF, Math.min(0, relief));
}

export function adaptiveCombatDifficulty(baseDifficulty, history = []) {
  const base = Math.max(5, Math.min(95, Math.round(Number(baseDifficulty) || 0)));
  const requestedRelief = combatAdaptiveRelief(history);
  const strategicAdjusted = Math.max(5, Math.min(95, base + requestedRelief));
  const adjusted = calibrateCombatEngineDifficulty(strategicAdjusted);
  return {
    base,
    adjusted,
    strategicAdjusted,
    relief: strategicAdjusted - base,
    requestedRelief,
    engineAdjustment: adjusted - strategicAdjusted,
    recentBattles: validRecentBattles(history).length,
  };
}
