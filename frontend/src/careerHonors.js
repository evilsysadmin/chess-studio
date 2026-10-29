// The archive stores evaluations separately from game-history records.
// An exact, unambiguous identifier match is mandatory before enabling replay.
export function historicalCareerRecord(entry, history = []) {
  const key = entry?.gameId || entry?.sourceGameId || entry?.id;
  if (key === null || key === undefined || String(key).trim() === '' || !Array.isArray(history)) return null;
  const matches = history.filter((record) => (
    record && (
      String(record.id || '') === String(key) ||
      String(record.sourceGameId || '') === String(key)
    )
  ));
  return matches.length === 1 ? matches[0] : null;
}

export function careerHonors(hall = {}, history = []) {
  const entries = [
    {
      id: 'hardest',
      symbol: '♛',
      title: 'La victoria más difícil',
      value: hall.hardestWin ? 'CPU nivel ' + Number(hall.hardestWin.difficulty || 0) : null,
      proof: 'Victoria registrada frente al rival de mayor nivel derrotado.',
      source: hall.hardestWin,
    },
    {
      id: 'fastest',
      symbol: '♞',
      title: 'La victoria más rápida',
      value: hall.fastestWin && Array.isArray(hall.fastestWin.moves)
        ? Math.ceil(hall.fastestWin.moves.length / 2) + ' movimientos'
        : null,
      proof: 'Duración calculada a partir de los movimientos guardados.',
      source: hall.fastestWin,
    },
    {
      id: 'accuracy',
      symbol: '♜',
      title: 'Mayor precisión analizada',
      value: Number.isFinite(hall.bestAccuracy?.accuracy)
        ? hall.bestAccuracy.accuracy + '%'
        : null,
      proof: 'Escala propia del análisis archivado; no es precisión oficial.',
      source: hall.bestAccuracy,
    },
    {
      id: 'saved',
      symbol: '♚',
      title: 'Una defensa memorable',
      value: Number.isFinite(hall.desperateSave?.troughPerspectiveEval)
        ? 'Desde ' + (hall.desperateSave.troughPerspectiveEval / 100).toFixed(1)
        : null,
      proof: 'Posición evaluada en desventaja que terminó en tablas o victoria.',
      source: hall.desperateSave,
    },
  ];
  return entries.filter((entry) => entry.value !== null).map((entry) => ({
    ...entry, record: historicalCareerRecord(entry.source, history),
  }));
}
