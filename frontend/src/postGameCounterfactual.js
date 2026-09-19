import { Chess } from 'chess.js';
import { buildPostGameIncidentEvidence } from './postGameIncidentEvidence.js';

function normalizeEngineMove(move) {
  if (!move?.from || !move?.to) return null;
  return {
    from: move.from,
    to: move.to,
    promotion: move.promotion || null,
    san: move.san || null,
  };
}

function normalizeEngineLine(line) {
  if (!Array.isArray(line)) return [];
  return line.map(normalizeEngineMove).filter(Boolean);
}

function sameMove(left, right) {
  if (!left || !right) return false;
  if (left.from && left.to && right.from && right.to) {
    return left.from === right.from
      && left.to === right.to
      && String(left.promotion || '') === String(right.promotion || '');
  }
  return Boolean(left.san && right.san && left.san === right.san);
}

function applyMove(board, move) {
  if (!move) return null;
  try {
    const played = move.from && move.to
      ? board.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' })
      : board.move(move.san);
    if (!played) return null;
    return {
      san: played.san,
      from: played.from,
      to: played.to,
      promotion: played.promotion || null,
    };
  } catch {
    return null;
  }
}

export function counterfactualInputFromReportMove(move) {
  const evidence = buildPostGameIncidentEvidence(move);
  if (!evidence?.fenBefore || !evidence?.suggested) return null;
  return {
    fen: evidence.fenBefore,
    suggested: evidence.suggested,
    suggestedReply: normalizeEngineMove(move?.suggestedReply),
    suggestedLine: normalizeEngineLine(move?.suggestedLine),
  };
}

export async function buildShortCounterfactual({
  fen,
  suggested,
  suggestedReply = null,
  suggestedLine = [],
  analyzeMove,
  level = 95,
  maxPlies = 3,
  signal,
} = {}) {
  if (!fen || !suggested || typeof analyzeMove !== 'function') return null;
  const safePlies = Math.max(1, Math.min(3, Math.floor(Number(maxPlies) || 3)));

  let board;
  try {
    board = new Chess(fen);
  } catch {
    return null;
  }

  const line = [];
  const first = applyMove(board, typeof suggested === 'string' ? { san: suggested } : suggested);
  if (!first) return null;
  line.push(first);

  const provenLine = normalizeEngineLine(suggestedLine);
  if (provenLine.length && sameMove(first, provenLine[0])) {
    for (const move of provenLine.slice(1)) {
      if (line.length >= safePlies || board.isGameOver()) break;
      const applied = applyMove(board, move);
      if (!applied) break;
      line.push(applied);
    }
  }

  if (line.length < safePlies && line.length < 2 && !board.isGameOver()) {
    const factualReply = applyMove(board, normalizeEngineMove(suggestedReply));
    if (factualReply) line.push(factualReply);
  }

  while (line.length < safePlies && !board.isGameOver()) {
    if (signal?.aborted) throw signal.reason || new DOMException('Aborted', 'AbortError');
    // `/api/analyze-move` uses the deterministic analyze_move path. Omitting a
    // played move asks only for the best continuation, without the randomness
    // and low-level noise intentionally allowed by `/api/analyze` for CPU play.
    // When the report already carries the factual root reply, the second ply is
    // reused above so this loop only needs to extend whatever remains.
    const analysis = await analyzeMove(board.fen(), level, { signal });
    const engineMove = normalizeEngineMove(analysis?.suggested);
    const applied = applyMove(board, engineMove);
    if (!applied) break;
    line.push(applied);
  }

  return {
    fen,
    line,
    complete: board.isGameOver(),
  };
}