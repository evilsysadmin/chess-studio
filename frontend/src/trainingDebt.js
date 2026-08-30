const INCIDENT_LABELS = Object.freeze({
  'human:MISSED_MATE': 'Mates ignorados',
  'human:ALLOWED_MATE': 'Mates concedidos',
  'human:QUEEN_EN_PRISE_TO_PAWN': 'Damas expuestas a peón',
  'human:STALEMATE_BLUNDER': 'Ahogados evitables',
  'cpu:PAWN_TAKES_QUEEN': 'Damas capturadas por peón',
  'cpu:KNIGHT_FORK': 'Horquillas de caballo sufridas',
  'cpu:PAWN_FORK': 'Horquillas de peón sufridas',
});

export function trainingIncidentLabel(key) {
  return INCIDENT_LABELS[key]
    || String(key || '').replace(/^(human|cpu):/, '').replaceAll('_', ' ').toLowerCase();
}

function realAutopsyCases(puzzles = []) {
  return (Array.isArray(puzzles) ? puzzles : []).filter((puzzle) => (
    puzzle?.id
    && puzzle?.source === 'autopsy'
    && Array.isArray(puzzle?.incidentKeys)
    && puzzle.incidentKeys.some(Boolean)
  ));
}

export function personalTrainingDebts(puzzles = []) {
  const groups = new Map();
  for (const puzzle of realAutopsyCases(puzzles)) {
    for (const key of new Set(puzzle.incidentKeys.filter(Boolean))) {
      const cases = groups.get(key) || [];
      cases.push(puzzle);
      groups.set(key, cases);
    }
  }

  return [...groups.entries()]
    .map(([key, cases]) => {
      const uniqueCases = [...new Map(cases.map((puzzle) => [puzzle.id, puzzle])).values()];
      if (uniqueCases.length < 2) return null;
      const cleanCases = uniqueCases.filter((puzzle) => Number(puzzle.cleanSolves || 0) > 0);
      const target = 2;
      const progress = Math.min(target, cleanCases.length);
      const paid = progress >= target;
      return {
        id: `incident:${key}`,
        incidentKey: key,
        label: trainingIncidentLabel(key),
        cases: uniqueCases.length,
        distinctGames: new Set(uniqueCases.map((puzzle) => puzzle.sourceGameId || puzzle.id)).size,
        cleanCases: cleanCases.length,
        progress,
        target,
        paid,
        active: !paid,
        puzzleIds: uniqueCases.map((puzzle) => puzzle.id),
      };
    })
    .filter(Boolean)
    .sort((a, b) => Number(a.paid) - Number(b.paid) || b.cases - a.cases || a.label.localeCompare(b.label));
}

export function personalTrainingDebtSummary(puzzles = []) {
  const debts = personalTrainingDebts(puzzles);
  const active = debts.filter((debt) => debt.active);
  return {
    debts,
    active,
    paid: debts.filter((debt) => debt.paid),
    activeCount: active.length,
    paidCount: debts.length - active.length,
    top: active[0] || null,
  };
}

export function trainingDebtFilter(debt) {
  if (!debt?.incidentKey) return null;
  return { incidentKey: debt.incidentKey, label: debt.label || trainingIncidentLabel(debt.incidentKey) };
}
