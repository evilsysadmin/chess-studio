import { setProfileStorageItem } from './profileKeys.js';

export const META_KEY = 'chess-study-meta-progress';

function base() {
  return {
    version: 1,
    season: { id: seasonId(), startedAt: new Date().toISOString(), games: 0, wins: 0, draws: 0, losses: 0, ratingStart: null, ratingEnd: null },
    records: { fastestWin: null, longestGame: null, highestDifficultyWin: 0, bestWinStreak: 0, bestBossStage: 0, bestStreakRun: 0 },
    currentWinStreak: 0,
    contracts: { offered: 0, completed: 0, failed: 0 },
    milestones: [],
    runHistory: [],
  };
}

function seasonId(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }

export function loadMetaProgress() {
  try {
    return { ...base(), ...(JSON.parse(localStorage.getItem(META_KEY) || '{}')) };
  } catch { return base(); }
}

export function saveMetaProgress(state) {
  setProfileStorageItem(META_KEY, JSON.stringify(state));
  return state;
}

function addMilestone(state, type, text, meta = {}) {
  const item = { id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type, text, date: new Date().toISOString(), ...meta };
  return { ...state, milestones: [item, ...(state.milestones || [])].slice(0, 80) };
}

export function recordMetaGame(record, ratingNow = null, contractResult = null) {
  let state = loadMetaProgress();
  const sid = seasonId();
  if (state.season?.id !== sid) {
    state = addMilestone(state, 'season', `Cerraste la temporada ${state.season?.id || 'anterior'} con ${state.season?.wins || 0} victorias y ${state.season?.losses || 0} derrotas.`);
    state.season = { id: sid, startedAt: new Date().toISOString(), games: 0, wins: 0, draws: 0, losses: 0, ratingStart: ratingNow, ratingEnd: ratingNow };
  }
  const s = { ...state.season };
  s.games += 1;
  if (record.outcome === 'win') s.wins += 1;
  else if (record.outcome === 'loss') s.losses += 1;
  else s.draws += 1;
  if (s.ratingStart == null && ratingNow != null) s.ratingStart = ratingNow;
  if (ratingNow != null) s.ratingEnd = ratingNow;
  state.season = s;

  state.currentWinStreak = record.outcome === 'win' ? (state.currentWinStreak || 0) + 1 : 0;
  const rec = { ...state.records };
  rec.bestWinStreak = Math.max(rec.bestWinStreak || 0, state.currentWinStreak || 0);
  const plies = record.moves?.length || 0;
  if (record.outcome === 'win' && (!rec.fastestWin || plies < rec.fastestWin.plies)) {
    rec.fastestWin = { plies, date: record.date, difficulty: record.difficulty };
    state = addMilestone(state, 'record', `Nueva victoria más rápida: ${Math.ceil(plies / 2)} movimientos.`);
  }
  if (!rec.longestGame || plies > rec.longestGame.plies) rec.longestGame = { plies, date: record.date, outcome: record.outcome };
  if (record.outcome === 'win' && Number(record.difficulty || 0) > Number(rec.highestDifficultyWin || 0)) {
    rec.highestDifficultyWin = Number(record.difficulty || 0);
    state = addMilestone(state, 'record', `Nueva dificultad máxima vencida: nivel ${record.difficulty}.`);
  }
  state.records = rec;

  if (contractResult) {
    state.contracts = { ...state.contracts, offered: (state.contracts?.offered || 0) + 1 };
    if (contractResult.success) state.contracts.completed += 1;
    else state.contracts.failed += 1;
  }
  return saveMetaProgress(state);
}

export function recordRunResult(run) {
  let state = loadMetaProgress();
  const records = { ...state.records };
  if (run.mode === 'boss') records.bestBossStage = Math.max(records.bestBossStage || 0, run.completedStages || 0);
  if (run.mode === 'streak') records.bestStreakRun = Math.max(records.bestStreakRun || 0, run.wins || 0);
  state.records = records;
  state.runHistory = [{ ...run, endedAt: new Date().toISOString() }, ...(state.runHistory || [])].slice(0, 30);
  return saveMetaProgress(state);
}

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
