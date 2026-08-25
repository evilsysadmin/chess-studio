const INCIDENT_LABELS = Object.freeze({
  'human:MISSED_MATE': 'Mates ignorados',
  'human:ALLOWED_MATE': 'Mates permitidos',
  'human:QUEEN_EN_PRISE_TO_PAWN': 'Damas expuestas a peón',
  'human:STALEMATE_BLUNDER': 'Ahogados regalados',
  'cpu:PAWN_TAKES_QUEEN': 'Damas perdidas ante peón',
  'cpu:KNIGHT_FORK': 'Horquillas de caballo sufridas',
  'cpu:PAWN_FORK': 'Horquillas de peón sufridas',
});

function scorePct(row) {
  const games = Number(row?.games || 0);
  if (!games) return null;
  return Math.round(((Number(row?.wins || 0) + Number(row?.draws || 0) * 0.5) / games) * 100);
}

function openingRows(record) {
  return Object.entries(record?.byOpening || {})
    .map(([opening, row]) => ({ opening, ...row, scorePct: scorePct(row) }))
    .filter((row) => Number(row.games || 0) >= 3 && Number.isFinite(row.scorePct));
}

function recentForm(record) {
  const rows = Array.isArray(record?.recentGames) ? record.recentGames.slice(0, 5) : [];
  return rows.map((row) => row?.outcome === 'win' ? 'V' : row?.outcome === 'loss' ? 'D' : 'T').join(' · ');
}

function streak(record) {
  const current = Number(record?.currentStreak || 0);
  if (current > 0) return { owner: 'human', value: current, label: `${current} victoria${current === 1 ? '' : 's'} tuya${current === 1 ? '' : 's'} seguidas` };
  if (current < 0) {
    const value = Math.abs(current);
    return { owner: 'cpu', value, label: `${value} victoria${value === 1 ? '' : 's'} seguidas de la CPU` };
  }
  return { owner: 'none', value: 0, label: 'Sin racha activa' };
}

function leader(record) {
  const wins = Number(record?.wins || 0);
  const losses = Number(record?.losses || 0);
  if (wins > losses) return { owner: 'human', margin: wins - losses, label: `Tú +${wins - losses}` };
  if (losses > wins) return { owner: 'cpu', margin: losses - wins, label: `CPU +${losses - wins}` };
  return { owner: 'even', margin: 0, label: 'Empate' };
}

function topIncident(record) {
  const entries = Object.entries(record?.incidents || {})
    .map(([key, count]) => ({ key, count: Number(count || 0), label: INCIDENT_LABELS[key] || key }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return entries[0] || null;
}

export function buildRivalryDossier(rivalry = {}) {
  const record = rivalry?.record || {};
  const openings = openingRows(record);
  const strongestOpening = [...openings].sort((a, b) => b.scorePct - a.scorePct || b.games - a.games)[0] || null;
  const toughestOpening = [...openings].sort((a, b) => a.scorePct - b.scorePct || b.games - a.games)[0] || null;
  const milestones = record?.milestones || {};
  const memories = (Array.isArray(record?.memories) ? record.memories.slice(0, 6) : []).map((memory) => {
    if (memory?.type === 'incident' && memory?.key) {
      const label = INCIDENT_LABELS[memory.key] || memory.key;
      return { ...memory, text: `${label} · ${Number(memory.count || 0)}× registrado` };
    }
    return memory;
  });

  return {
    games: Number(record?.games || 0),
    wins: Number(record?.wins || 0),
    draws: Number(record?.draws || 0),
    losses: Number(record?.losses || 0),
    leader: leader(record),
    streak: streak(record),
    recentForm: recentForm(record),
    strongestOpening,
    toughestOpening,
    topIncident: topIncident(record),
    bestHumanStreak: Number(record?.bestHumanStreak || 0),
    bestCpuStreak: Number(record?.bestCpuStreak || 0),
    highestDifficultyWin: Number.isFinite(Number(milestones?.highestDifficultyWin)) ? Number(milestones.highestDifficultyWin) : null,
    fastestWinMoves: Number(milestones?.fastestWinMoves || 0) > 0 ? Math.ceil(Number(milestones.fastestWinMoves) / 2) : null,
    memories,
  };
}
