import { STORAGE_LOCAL, getStorageItem } from './safeStorage.js';
import { setProfileStorageItem } from './profileKeys.js';

const ANALYSIS_KEY = 'chess-study-analysis-archive';
const MAX_ANALYSES = 160;
const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function safeParse(raw, fallback) {
  try { const v = JSON.parse(raw); return v && typeof v === 'object' ? v : fallback; } catch { return fallback; }
}

export function loadAnalysisArchive() {
  const parsed = safeParse(getStorageItem(STORAGE_LOCAL, ANALYSIS_KEY) || '{}', {});
  return parsed && typeof parsed === 'object' ? parsed : {};
}

function saveAnalysisArchive(archive) {
  const rows = Object.entries(archive || {})
    .sort((a, b) => new Date(b[1]?.analyzedAt || 0) - new Date(a[1]?.analyzedAt || 0))
    .slice(0, MAX_ANALYSES);
  const pruned = Object.fromEntries(rows);
  setProfileStorageItem(ANALYSIS_KEY, JSON.stringify(pruned));
  return pruned;
}

export function accuracyScore(report) {
  if (!report?.analyzedCount) return null;
  // Intencionadamente no se llama "accuracy oficial": es una escala propia y estable.
  return Math.max(1, Math.min(100, Math.round(100 * Math.exp(-Number(report.averageLoss || 0) / 170))));
}

export function bestMoveOfReport(report) {
  const rows = (report?.moveReports || []).filter((m) => Number.isFinite(m.loss));
  if (!rows.length) return null;
  return [...rows].sort((a, b) => a.loss - b.loss || b.index - a.index)[0];
}

export function pointOfNoReturn(report) {
  const rows = (report?.moveReports || []).filter((m) => Number.isFinite(m.loss));
  if (!rows.length) return null;
  for (let i = 0; i < rows.length; i += 1) {
    const m = rows[i];
    if (m.loss < 120) continue;
    const target = Number.isFinite(m.suggestedPerspectiveEval) ? m.suggestedPerspectiveEval : null;
    if (target === null) continue;
    const laterBest = rows.slice(i).reduce((best, row) => Number.isFinite(row.playedPerspectiveEval) ? Math.max(best, row.playedPerspectiveEval) : best, -Infinity);
    if (laterBest < target - 80) return m;
  }
  return report?.worst?.loss >= 180 ? report.worst : null;
}

const PIECE_LABEL = Object.freeze({ p: 'Peón', n: 'Caballo', b: 'Alfil', r: 'Torre', q: 'Dama', k: 'Rey' });

function pieceLabel(symbol) {
  return PIECE_LABEL[String(symbol || '').toLowerCase()] || 'Pieza';
}

function moveRoute(detail) {
  if (!detail) return '';
  return `${pieceLabel(detail.piece)} ${detail.from || '?'} → ${detail.to || '?'}`;
}

export function moveContextLines(move) {
  const context = move?.context;
  if (!context?.played) return [];
  const lines = [];
  const played = context.played;
  const playedCapture = played.captured ? `, capturando ${pieceLabel(played.captured)}` : '';
  const playedStatus = played.checkmate ? ' y dando mate' : played.givesCheck ? ' y dando jaque' : '';
  lines.push(`Tu jugada: ${moveRoute(played)}${playedCapture}${playedStatus}.`);

  if (context.reply?.capturedPlayedPiece) {
    lines.push(`Respuesta real: ${moveRoute(context.reply)} capturó ese ${pieceLabel(played.piece)} en ${played.to}.`);
  } else if (context.punisher) {
    lines.push(`Consecuencia inmediata: el ${pieceLabel(played.piece)} en ${played.to} quedó capturable por ${moveRoute(context.punisher)}.`);
  } else if (context.reply) {
    const replyCapture = context.reply.captured ? `, capturando ${pieceLabel(context.reply.captured)}` : '';
    lines.push(`Respuesta real: ${moveRoute(context.reply)}${replyCapture}.`);
  }

  if (context.suggested) {
    const best = context.suggested;
    const bestCapture = best.captured ? `, capturando ${pieceLabel(best.captured)}` : '';
    const bestStatus = best.checkmate ? ' y dando mate' : best.givesCheck ? ' y dando jaque' : '';
    lines.push(`Alternativa del motor: ${moveRoute(best)}${bestCapture}${bestStatus}.`);
  }
  return lines;
}

export function explainMoveReport(move) {
  if (!move) return '';
  const san = String(move.suggested || '');
  if (san.includes('#')) return 'La alternativa del motor terminaba la partida con mate inmediato.';
  if (san.includes('+')) return 'La alternativa mantenía la iniciativa dando jaque y obligando a responder.';
  if (san.includes('x')) return 'La alternativa aprovechaba una captura concreta y evitaba dejar material sobre la mesa.';
  if (san.includes('=')) return 'La alternativa resolvía una promoción y cambiaba por completo el balance de material.';
  if (move.loss >= 300) return 'La jugada elegida cedió una cantidad enorme de evaluación; aquí había que frenar y revisar amenazas antes de mover.';
  if (move.loss >= 150) return 'La alternativa conservaba bastante más valor de la posición. Un chequeo de piezas colgadas y amenazas habría ayudado.';
  if (move.loss >= 60) return 'No es un incendio, pero la alternativa mantenía mejor la posición y reducía concesiones.';
  return 'Fue una decisión muy cercana a la primera elección del motor.';
}

export function archiveAnalysis(key, report, meta = {}) {
  if (!key || !report) return null;
  const best = bestMoveOfReport(report);
  const noReturn = pointOfNoReturn(report);
  const rows = report.moveReports || [];
  const evals = rows.map((r) => r.playedPerspectiveEval).filter(Number.isFinite);
  const peak = evals.length ? Math.max(...evals) : null;
  const trough = evals.length ? Math.min(...evals) : null;
  const entry = {
    analyzedAt: new Date().toISOString(),
    gameId: String(key),
    date: meta.date || new Date().toISOString(),
    outcome: meta.outcome || null,
    difficulty: Number(meta.difficulty || 0),
    opening: meta.opening || null,
    timeControlId: meta.timeControlId || 'none',
    accuracy: accuracyScore(report),
    averageLoss: Number(report.averageLoss || 0),
    analyzedCount: Number(report.analyzedCount || 0),
    worst: report.worst || null,
    best: best || null,
    pointOfNoReturn: noReturn || null,
    peakPerspectiveEval: peak,
    troughPerspectiveEval: trough,
    pressureMoves: Number(meta.pressureMoves || 0),
    pressureIncidents: Number(meta.pressureIncidents || 0),
  };
  const archive = loadAnalysisArchive();
  archive[String(key)] = entry;
  saveAnalysisArchive(archive);
  return entry;
}

export function materialDonated(history = []) {
  let points = 0; let queens = 0; let pieces = 0;
  for (const record of history) {
    const human = record.humanColor || 'w';
    for (let i = 0; i < (record.moves || []).length; i += 1) {
      const mover = i % 2 === 0 ? 'w' : 'b';
      const m = record.moves[i];
      if (mover === human || !m?.captured) continue;
      points += PIECE_VALUE[m.captured] || 0;
      pieces += 1;
      if (m.captured === 'q') queens += 1;
    }
  }
  return { points, queens, pieces };
}

export function recurrenceIndex(rivalry) {
  const games = Math.max(1, Number(rivalry?.record?.games || rivalry?.totalGames || 0));
  const incidents = Object.entries(rivalry?.incidents || {}).filter(([k]) => k.startsWith('human:') || k.startsWith('cpu:'));
  const total = incidents.reduce((s, [, n]) => s + Number(n || 0), 0);
  const repeated = incidents.reduce((s, [, n]) => s + Math.max(0, Number(n || 0) - 1), 0);
  const score = Math.min(100, Math.round((repeated * 7 + total * 2) / games * 10));
  return { score, total, repeated };
}

export function cpuConfidence(record = {}) {
  const games = Math.max(1, Number(record.games || 0));
  const balance = (Number(record.losses || 0) - Number(record.wins || 0)) / games;
  const streak = Number(record.currentStreak || 0); // positivo = humano, negativo = CPU
  const raw = 50 + balance * 35 - streak * 5;
  const value = Math.max(5, Math.min(95, Math.round(raw)));
  const label = value >= 75 ? 'insufriblemente confiada' : value >= 58 ? 'sobrada' : value <= 25 ? 'molestamente prudente' : value <= 42 ? 'con respeto estadístico' : 'vigilante';
  return { value, label };
}

export function preGamePrediction(rivalry, { difficulty = null, timeControlId = null } = {}) {
  const recent = Array.isArray(rivalry?.record?.recentGames) ? rivalry.record.recentGames : [];
  let sample = recent;
  if (difficulty !== null) {
    const close = sample.filter((g) => Math.abs(Number(g.difficulty || 0) - Number(difficulty)) <= 8);
    if (close.length >= 4) sample = close;
  }
  if (timeControlId && timeControlId !== 'none') {
    const timed = sample.filter((g) => g.timeControlId === timeControlId);
    if (timed.length >= 4) sample = timed;
  }
  sample = sample.slice(0, 20);
  if (sample.length < 4) return null;
  const wins = sample.filter((g) => g.outcome === 'win').length;
  const draws = sample.filter((g) => g.outcome === 'draw').length;
  const expected = Math.round(((wins + draws * .5) / sample.length) * 100);
  return {
    expected,
    sample: sample.length,
    text: expected >= 65
      ? `Pronóstico: ${expected}% de puntuación esperada según ${sample.length} precedentes comparables. La estadística, irritantemente, te favorece.`
      : expected <= 35
        ? `Pronóstico: ${expected}% de puntuación esperada según ${sample.length} precedentes. El optimismo no está respaldado por auditoría.`
        : `Pronóstico: ${expected}% de puntuación esperada en ${sample.length} precedentes comparables. Territorio oficialmente discutible.`,
  };
}

export function openingRivalry(history = []) {
  const map = new Map();
  for (const r of history) {
    const name = r.opening || 'Sin identificar';
    const row = map.get(name) || { opening: name, games: 0, wins: 0, draws: 0, losses: 0, avgDifficulty: 0, difficultySum: 0 };
    row.games += 1; row.difficultySum += Number(r.difficulty || 0);
    if (r.outcome === 'win') row.wins += 1; else if (r.outcome === 'loss') row.losses += 1; else row.draws += 1;
    map.set(name, row);
  }
  return [...map.values()].map((r) => ({ ...r, avgDifficulty: r.games ? Math.round(r.difficultySum / r.games) : 0, scorePct: r.games ? Math.round((r.wins + .5 * r.draws) / r.games * 100) : 0 })).sort((a,b) => b.games - a.games);
}

export function openingClinic(history = []) {
  return openingRivalry(history)
    .filter((r) => r.games >= 3)
    .map((r) => ({ ...r, urgency: (50 - r.scorePct) + Math.min(25, r.games * 2) }))
    .filter((r) => r.scorePct < 50)
    .sort((a,b) => b.urgency - a.urgency)
    .slice(0, 5);
}

export function weeklyReport(history = [], archive = loadAnalysisArchive(), now = new Date()) {
  const end = now.getTime(); const week = 7 * 86400000;
  const current = history.filter((r) => end - new Date(r.date).getTime() >= 0 && end - new Date(r.date).getTime() < week);
  const previous = history.filter((r) => end - new Date(r.date).getTime() >= week && end - new Date(r.date).getTime() < 2 * week);
  function summarise(rows) {
    const keys = new Set(rows.flatMap((r) => [String(r.sourceGameId || r.gameId || r.id || '')]));
    const analyses = Object.values(archive).filter((a) => keys.has(String(a.gameId)) || rows.some((r) => String(r.id || '').startsWith(String(a.gameId))));
    const wins = rows.filter((r) => r.outcome === 'win').length;
    const acc = analyses.map((a) => a.accuracy).filter(Number.isFinite);
    return { games: rows.length, wins, winPct: rows.length ? Math.round(wins / rows.length * 100) : 0, accuracy: acc.length ? Math.round(acc.reduce((s,n)=>s+n,0)/acc.length) : null };
  }
  const a = summarise(current), b = summarise(previous);
  return { current: a, previous: b, winDelta: a.games && b.games ? a.winPct - b.winPct : null, accuracyDelta: a.accuracy !== null && b.accuracy !== null ? a.accuracy - b.accuracy : null };
}

export function hallOfFameAndShame(history = [], archive = loadAnalysisArchive()) {
  const rows = [...history];
  const hardestWin = rows.filter((r)=>r.outcome==='win').sort((a,b)=>Number(b.difficulty||0)-Number(a.difficulty||0))[0] || null;
  const fastestWin = rows.filter((r)=>r.outcome==='win').sort((a,b)=>(a.moves?.length||9999)-(b.moves?.length||9999))[0] || null;
  const longest = rows.sort((a,b)=>(b.moves?.length||0)-(a.moves?.length||0))[0] || null;
  const analyses = Object.values(archive);
  const worst = analyses.filter((a)=>a.worst).sort((a,b)=>Number(b.worst?.loss||0)-Number(a.worst?.loss||0))[0] || null;
  const bestAccuracy = analyses.filter((a)=>Number.isFinite(a.accuracy)).sort((a,b)=>b.accuracy-a.accuracy)[0] || null;
  const missedConversion = analyses.filter((a)=>Number(a.peakPerspectiveEval)>=300 && a.outcome && a.outcome!=='win').sort((a,b)=>Number(b.peakPerspectiveEval)-Number(a.peakPerspectiveEval))[0] || null;
  const desperateSave = analyses.filter((a)=>Number(a.troughPerspectiveEval)<=-300 && ['win','draw'].includes(a.outcome)).sort((a,b)=>Number(a.troughPerspectiveEval)-Number(b.troughPerspectiveEval))[0] || null;
  return { hardestWin, fastestWin, longest, worst, bestAccuracy, missedConversion, desperateSave };
}

export function conversionStats(archive = loadAnalysisArchive()) {
  const rows = Object.values(archive);
  const winning = rows.filter((a) => Number(a.peakPerspectiveEval) >= 300 && a.outcome);
  const converted = winning.filter((a) => a.outcome === 'win').length;
  const defensive = rows.filter((a) => Number(a.troughPerspectiveEval) <= -300 && a.outcome);
  const saved = defensive.filter((a) => a.outcome === 'draw' || a.outcome === 'win').length;
  return {
    winningChances: winning.length,
    converted,
    conversionPct: winning.length ? Math.round(converted / winning.length * 100) : null,
    desperatePositions: defensive.length,
    saved,
    defensePct: defensive.length ? Math.round(saved / defensive.length * 100) : null,
  };
}

