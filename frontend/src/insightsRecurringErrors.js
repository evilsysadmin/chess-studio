import { personalTrainingDebts } from './trainingDebt.js';

const INCIDENT_LABELS = Object.freeze({
  'human:MISSED_MATE': 'Mates que dejaste escapar',
  'human:ALLOWED_MATE': 'Mates que regalaste',
  'human:QUEEN_EN_PRISE_TO_PAWN': 'Damas expuestas a un peón',
  'human:STALEMATE_BLUNDER': 'Ahogados que regalaste',
  'cpu:PAWN_TAKES_QUEEN': 'Damas devoradas por un peón',
  'cpu:KNIGHT_FORK': 'Horquillas de caballo sufridas',
  'cpu:PAWN_FORK': 'Horquillas de peón sufridas',
});

function mastered(puzzle) {
  return Boolean(puzzle?.masteredAt) || Number(puzzle?.solves || 0) > 0;
}

function incidentLabel(key) {
  if (INCIDENT_LABELS[key]) return INCIDENT_LABELS[key];
  const raw = String(key || '').split(':').pop() || 'ERROR_TACTICO';
  return `Patrón táctico: ${raw.toLowerCase().replaceAll('_', ' ')}`;
}

export function buildRecurringErrorPatterns(puzzles = []) {
  const source = Array.isArray(puzzles) ? puzzles : [];
  const groups = new Map();
  const debtByIncident = new Map(personalTrainingDebts(source).map((debt) => [debt.incidentKey, debt]));

  for (const puzzle of source) {
    const keys = [...new Set(Array.isArray(puzzle?.incidentKeys) ? puzzle.incidentKeys.filter(Boolean) : [])];
    for (const key of keys) {
      const current = groups.get(key) || {
        incidentKey: key,
        positions: 0,
        pending: 0,
        sourceGames: new Set(),
        attempts: 0,
        cleanSolves: 0,
        maxLoss: 0,
        newestAt: 0,
      };
      current.positions += 1;
      if (!mastered(puzzle)) current.pending += 1;
      if (puzzle?.sourceGameId) current.sourceGames.add(puzzle.sourceGameId);
      current.attempts += Math.max(0, Number(puzzle?.attempts || 0));
      current.cleanSolves += Math.max(0, Number(puzzle?.cleanSolves || 0));
      current.maxLoss = Math.max(current.maxLoss, Math.max(0, Number(puzzle?.loss || 0)));
      const createdAt = Date.parse(puzzle?.createdAt || '');
      if (Number.isFinite(createdAt)) current.newestAt = Math.max(current.newestAt, createdAt);
      groups.set(key, current);
    }
  }

  return [...groups.values()]
    .filter((group) => group.positions >= 2)
    .map((group) => {
      const debt = debtByIncident.get(group.incidentKey) || null;
      return {
        incidentKey: group.incidentKey,
        label: incidentLabel(group.incidentKey),
        positions: group.positions,
        pending: group.pending,
        sourceGames: group.sourceGames.size,
        friction: Math.max(0, group.attempts - group.cleanSolves),
        maxLoss: group.maxLoss,
        newestAt: group.newestAt,
        debt: debt ? {
          progress: debt.progress,
          target: debt.target,
          paid: debt.paid,
          active: debt.active,
          realCases: debt.cases,
          distinctGames: debt.distinctGames,
        } : null,
        filter: { incidentKey: group.incidentKey },
      };
    })
    .sort((a, b) => (
      Number(a.debt?.paid) - Number(b.debt?.paid)
      || b.positions - a.positions
      || b.pending - a.pending
      || b.friction - a.friction
      || b.maxLoss - a.maxLoss
      || b.newestAt - a.newestAt
      || a.incidentKey.localeCompare(b.incidentKey)
    ))
    .slice(0, 5);
}

export { INCIDENT_LABELS };
