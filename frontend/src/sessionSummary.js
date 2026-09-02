const OUTCOME_SCORE = Object.freeze({ win: 1, draw: .5, loss: 0 });

function cleanContext(context = null) {
  const row = context && typeof context === 'object' ? context : {};
  return {
    games: Math.max(0, Number(row.games) || 0),
    wins: Math.max(0, Number(row.wins) || 0),
    draws: Math.max(0, Number(row.draws) || 0),
    losses: Math.max(0, Number(row.losses) || 0),
    puzzlesSolved: Math.max(0, Number(row.puzzlesSolved) || 0),
    recentOutcomes: Array.isArray(row.recentOutcomes)
      ? row.recentOutcomes.filter((value) => Object.prototype.hasOwnProperty.call(OUTCOME_SCORE, value)).slice(-8)
      : [],
  };
}

function outcomeLabel(outcome) {
  if (outcome === 'win') return 'victoria';
  if (outcome === 'draw') return 'tablas';
  if (outcome === 'loss') return 'derrota';
  return 'resultado';
}

function trendFact(outcomes = []) {
  if (outcomes.length < 2) return null;
  const first = outcomes[0];
  const last = outcomes.at(-1);
  if (outcomes.length >= 3 && OUTCOME_SCORE[last] > OUTCOME_SCORE[first]) {
    return {
      id: 'trend-up',
      label: 'Cierre',
      text: `Terminaste mejor que empezaste: de ${outcomeLabel(first)} a ${outcomeLabel(last)}.`,
      tone: 'positive',
    };
  }
  if (outcomes.length >= 3 && OUTCOME_SCORE[last] < OUTCOME_SCORE[first]) {
    return {
      id: 'trend-down',
      label: 'Cierre',
      text: `La sesión terminó peor que empezó: de ${outcomeLabel(first)} a ${outcomeLabel(last)}.`,
      tone: 'warning',
    };
  }
  if (last === outcomes.at(-2)) {
    return {
      id: `streak-${last}`,
      label: 'Cierre',
      text: `Cerraste con dos ${last === 'draw' ? 'tablas' : `${outcomeLabel(last)}s`} seguidas.`,
      tone: last === 'win' ? 'positive' : last === 'loss' ? 'warning' : 'neutral',
    };
  }
  return null;
}

function nextStep(context) {
  if (context.games >= 3 && context.losses > context.wins) {
    return 'Antes de otra partida, abre Así juegas y revisa qué se repitió de verdad.';
  }
  if (context.games >= 2 && context.puzzlesSolved === 0) {
    return 'Has jugado bastante. Dos o tres puzzles y vuelves al tablero con otro ritmo.';
  }
  if (context.puzzlesSolved >= 3 && context.games === 0) {
    return 'Buen bloque táctico. El siguiente paso útil es llevarlo a una partida de práctica.';
  }
  if (context.games + context.puzzlesSolved >= 4) {
    return 'Bloque suficiente por hoy. Si sigues, que sea con un objetivo claro y no por inercia.';
  }
  return 'Sigue si tienes un objetivo concreto; si no, esta sesión ya cuenta.';
}

export function buildSessionSummary(context = null) {
  const row = cleanContext(context);
  const activityCount = row.games + row.puzzlesSolved;
  if (activityCount < 2) return null;

  const facts = [];
  if (row.games > 0) {
    facts.push({
      id: 'games',
      label: 'Partidas',
      text: `${row.games} · ${row.wins}V · ${row.draws}T · ${row.losses}D`,
      tone: row.wins > row.losses ? 'positive' : row.losses > row.wins ? 'warning' : 'neutral',
    });
  }

  const trend = trendFact(row.recentOutcomes);
  if (trend) facts.push(trend);

  if (row.puzzlesSolved > 0) {
    facts.push({
      id: 'puzzles',
      label: 'Táctica',
      text: `${row.puzzlesSolved} puzzle${row.puzzlesSolved === 1 ? '' : 's'} resuelto${row.puzzlesSolved === 1 ? '' : 's'} en esta sesión.`,
      tone: 'positive',
    });
  }

  return {
    activityCount,
    headline: `Resumen de sesión · ${activityCount} actividad${activityCount === 1 ? '' : 'es'}`,
    facts: facts.slice(0, 3),
    nextStep: nextStep(row),
  };
}
