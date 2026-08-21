import { Chess } from 'chess.js';
import { isCompetitiveHistoryRecord } from './gameHistory.js';

const INCIDENT_LABELS = {
  'human:MISSED_MATE': 'mates en una ignorados',
  'human:ALLOWED_MATE': 'mates en una permitidos',
  'human:QUEEN_EN_PRISE_TO_PAWN': 'damas expuestas a peones',
  'human:STALEMATE_BLUNDER': 'ahogados criminales',
  'cpu:PAWN_TAKES_QUEEN': 'damas devoradas por peones',
  'cpu:KNIGHT_FORK': 'horquillas de caballo sufridas',
  'cpu:PAWN_FORK': 'horquillas de peón sufridas',
};

function normalizedColor(color) {
  return color === 'b' ? 'b' : 'w';
}

function scorePct(rows) {
  if (!rows.length) return 0;
  const wins = rows.filter((r) => r.outcome === 'win').length;
  const draws = rows.filter((r) => r.outcome === 'draw').length;
  return Math.round(((wins + draws * 0.5) / rows.length) * 100);
}

function confidenceForGames(games) {
  if (games >= 10) return { key: 'high', label: 'alta' };
  if (games >= 6) return { key: 'medium', label: 'media' };
  return { key: 'initial', label: 'inicial' };
}

export function openingNemeses(history = [], { minGames = 4, maxScorePct = 45 } = {}) {
  const groups = new Map();
  for (const record of history) {
    if (!isCompetitiveHistoryRecord(record)) continue;
    const opening = String(record?.opening || '').trim();
    if (!opening) continue;
    const color = normalizedColor(record?.humanColor);
    const key = `${opening}|${color}`;
    const rows = groups.get(key) || [];
    rows.push(record);
    groups.set(key, rows);
  }

  const candidates = [];
  for (const rows of groups.values()) {
    if (rows.length < minGames) continue;
    const wins = rows.filter((r) => r.outcome === 'win').length;
    const draws = rows.filter((r) => r.outcome === 'draw').length;
    const losses = rows.filter((r) => r.outcome === 'loss').length;
    const pct = scorePct(rows);
    if (losses < 2 || pct > maxScorePct) continue;
    const opening = rows[0].opening;
    const humanColor = normalizedColor(rows[0].humanColor);
    const avgDifficulty = Math.round(rows.reduce((s, r) => s + Number(r.difficulty || 0), 0) / rows.length);
    const recent = [...rows]
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
      .slice(0, 5);
    const latestLoss = recent.find((r) => r.outcome === 'loss') || [...rows]
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
      .find((r) => r.outcome === 'loss') || null;
    const urgency = (50 - pct) * 2 + Math.min(24, rows.length * 2) + losses * 3;
    candidates.push({
      opening,
      humanColor,
      games: rows.length,
      wins,
      draws,
      losses,
      scorePct: pct,
      recentScorePct: scorePct(recent),
      avgDifficulty,
      urgency,
      confidence: confidenceForGames(rows.length),
      latestLoss,
    });
  }

  return candidates.sort((a, b) => b.urgency - a.urgency || a.scorePct - b.scorePct || b.games - a.games);
}

export function tacticalNemesis(rivalry = {}, minCount = 2) {
  const source = rivalry?.incidents || rivalry?.record?.incidents || {};
  const rows = Object.entries(source)
    .filter(([key, count]) => INCIDENT_LABELS[key] && Number(count || 0) >= minCount)
    .map(([key, count]) => ({ key, count: Number(count), label: INCIDENT_LABELS[key] }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return rows[0] || null;
}

// Devuelve una posición real de una derrota contra la apertura némesis,
// aproximadamente al salir de la apertura y siempre con el humano al turno.
// No inventa una FEN ni evalúa con motor: reproduce el historial guardado.
export function nemesisTrainingPosition(record, preferredPlies = 10) {
  if (!record || !Array.isArray(record.moves) || record.moves.length < 4) return null;
  const humanColor = normalizedColor(record.humanColor);
  const maxTarget = Math.min(Math.max(4, preferredPlies), record.moves.length - 1);

  for (let target = maxTarget; target >= 2; target -= 1) {
    const chess = new Chess(record.initialFen || undefined);
    try {
      for (let i = 0; i < target; i += 1) {
        const m = record.moves[i];
        chess.move(m?.san || { from: m?.from, to: m?.to, promotion: m?.promotion || 'q' });
      }
    } catch {
      continue;
    }
    if (chess.turn() !== humanColor) continue;
    return {
      fen: chess.fen(),
      ply: target,
      moveNumber: Math.floor(target / 2) + 1,
      humanColor,
      difficulty: Number(record.difficulty || 50),
      sourceRecord: record,
    };
  }
  return null;
}

export function buildNemesisDossier(history = [], rivalry = {}) {
  const opening = openingNemeses(history)[0] || null;
  const tactic = tacticalNemesis(rivalry);
  const training = opening?.latestLoss ? nemesisTrainingPosition(opening.latestLoss) : null;
  return { opening, tactic, training };
}
