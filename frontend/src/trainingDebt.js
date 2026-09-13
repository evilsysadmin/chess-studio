import { isPersonalPuzzleCurrentlyClean } from './spacedReview.js';

const INCIDENT_LABELS = Object.freeze({
  'human:MISSED_MATE': 'Mates en una ignorados',
  'human:ALLOWED_MATE': 'Mates permitidos',
  'human:QUEEN_EN_PRISE_TO_PAWN': 'Damas expuestas a peones',
  'human:STALEMATE_BLUNDER': 'Ahogados criminales',
  'cpu:PAWN_TAKES_QUEEN': 'Damas devoradas por peones',
  'cpu:KNIGHT_FORK': 'Horquillas de caballo sufridas',
  'cpu:PAWN_FORK': 'Horquillas de peón sufridas',
});

function debtLabel(key) {
  return INCIDENT_LABELS[key] || String(key || '').replace(/^(human|cpu):/, '').replaceAll('_', ' ').toLowerCase();
}

function realAutopsyCases(puzzles = []) {
  return (Array.isArray(puzzles) ? puzzles : []).filter((puzzle) => (
    puzzle?.id
    && puzzle?.source === 'autopsy'
    && Array.isArray(puzzle?.incidentKeys)
    && puzzle.incidentKeys.length > 0
  ));
}

function recentCases(cases, target) {
  return cases
    .map((puzzle, index) => ({
      puzzle,
      index,
      createdAt: Date.parse(puzzle?.createdAt || ''),
    }))
    .sort((a, b) => {
      const aDated = Number.isFinite(a.createdAt);
      const bDated = Number.isFinite(b.createdAt);
      if (aDated && bDated && a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
      if (aDated !== bDated) return aDated ? -1 : 1;
      // Persisted personal puzzles are already newest-first. Preserve that order
      // for legacy records without createdAt instead of inventing chronology.
      return a.index - b.index;
    })
    .slice(0, target)
    .map((entry) => entry.puzzle);
}

export function personalTrainingDebts(puzzles = []) {
  const groups = new Map();
  for (const puzzle of realAutopsyCases(puzzles)) {
    for (const key of new Set(puzzle.incidentKeys)) {
      if (!key) continue;
      const cases = groups.get(key) || [];
      cases.push(puzzle);
      groups.set(key, cases);
    }
  }

  return [...groups.entries()]
    .map(([key, cases]) => {
      const uniqueCases = [...new Map(cases.map((puzzle) => [puzzle.id, puzzle])).values()];
      if (uniqueCases.length < 2) return null;
      const target = 2;
      const evidenceCases = recentCases(uniqueCases, target);
      const cleanEvidenceCases = evidenceCases.filter(isPersonalPuzzleCurrentlyClean);
      const historicalCleanCases = uniqueCases.filter(isPersonalPuzzleCurrentlyClean).length;
      const progress = cleanEvidenceCases.length;
      const paid = progress >= target;
      return {
        id: `incident:${key}`,
        incidentKey: key,
        label: debtLabel(key),
        cases: uniqueCases.length,
        distinctGames: new Set(uniqueCases.map((puzzle) => puzzle.sourceGameId || puzzle.id)).size,
        cleanCases: cleanEvidenceCases.length,
        historicalCleanCases,
        progress,
        target,
        paid,
        active: !paid,
        recentPuzzleIds: evidenceCases.map((puzzle) => puzzle.id),
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
