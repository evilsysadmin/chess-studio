// Métricas derivadas de historial real. El antiguo estado persistente de temporadas/runs
// fue sustituido por career.js; la clave legacy se conserva sólo en profileKeys para limpieza.

export const CONTRACTS = [
  { id: 'win', label: 'Haz el trabajo', text: 'Gana la partida.', test: ({ outcome }) => outcome === 'win' },
  { id: 'no-hints', label: 'Sin ruedines', text: 'Termina sin usar pistas.', test: ({ hintsUsed }) => Number(hintsUsed || 0) === 0 },
  { id: 'survive-20', label: 'Mantén el pulso', text: 'Llega al movimiento 20.', test: ({ plies }) => Number(plies || 0) >= 39 },
  { id: 'fast-win', label: 'Ejecución sumaria', text: 'Gana antes del movimiento 30.', test: ({ outcome, plies }) => outcome === 'win' && Number(plies || 0) <= 59 },
  { id: 'black-win', label: 'Con negras, además', text: 'Gana jugando con negras.', test: ({ outcome, humanColor }) => outcome === 'win' && humanColor === 'b' },
];

export function contractForToday(date = new Date()) {
  const seed = Number(`${date.getFullYear()}${date.getMonth() + 1}${date.getDate()}`);
  return CONTRACTS[seed % CONTRACTS.length];
}

export function evaluateContract(contract, ctx) {
  if (!contract) return null;
  return { id: contract.id, label: contract.label, success: !!contract.test(ctx) };
}

export function buildCemetery(history = []) {
  return history.filter((r) => r.outcome === 'loss').map((r) => ({
    ...r,
    gravity: Number(r.difficulty || 0) + Math.min(50, (r.moves?.length || 0) / 2),
  })).sort((a, b) => b.gravity - a.gravity);
}

export function buildOpeningTree(history = [], maxPlies = 10) {
  const root = { count: 0, wins: 0, children: {} };
  for (const record of history) {
    let node = root; node.count += 1; if (record.outcome === 'win') node.wins += 1;
    for (const m of (record.moves || []).slice(0, maxPlies)) {
      const san = m.san || `${m.from}-${m.to}`;
      node.children[san] ||= { move: san, count: 0, wins: 0, children: {} };
      node = node.children[san]; node.count += 1; if (record.outcome === 'win') node.wins += 1;
    }
  }
  return root;
}

export function deriveChessProfile(history = []) {
  if (!history.length) return [];
  let captures = 0, queens = 0, castles = 0, earlyQueen = 0, totalPlies = 0;
  for (const r of history) {
    const moves = r.moves || []; totalPlies += moves.length;
    moves.forEach((m, i) => {
      if (m.captured || m.capturedPiece) captures += 1;
      if (m.piece === 'q') { queens += 1; if (i < 12) earlyQueen += 1; }
      if ((m.san || '').startsWith('O-O')) castles += 1;
    });
  }
  const games = history.length;
  const out = [];
  if (captures / games >= 5) out.push('Tendencia táctica: tus partidas producen bastante intercambio de material.');
  else out.push('Tendencia posicional: intercambias menos material que la media de tu propio historial reciente.');
  if (castles / games >= 0.55) out.push('Enrocas con bastante regularidad. Al menos el rey suele recibir supervisión adulta.');
  else out.push('Enrocas poco. A veces el rey parece vivir de alquiler en el centro.');
  if (queens && earlyQueen / queens > 0.35) out.push('La dama sale pronto con frecuencia; útil si sabes por qué, caro si sale de turismo.');
  out.push(`Duración media aproximada: ${Math.round(totalPlies / games / 2)} movimientos.`);
  return out;
}

export function evolutionBuckets(history = [], size = 10) {
  const sorted = [...history].sort((a,b) => new Date(a.date) - new Date(b.date));
  const buckets = [];
  for (let i=0;i<sorted.length;i+=size) {
    const slice = sorted.slice(i,i+size); const wins = slice.filter(r=>r.outcome==='win').length;
    buckets.push({ label: `${i+1}-${i+slice.length}`, games: slice.length, winPct: Math.round(wins/slice.length*100), avgDifficulty: Math.round(slice.reduce((s,r)=>s+Number(r.difficulty||0),0)/slice.length) });
  }
  return buckets;
}
