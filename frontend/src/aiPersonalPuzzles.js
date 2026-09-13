import { Chess } from 'chess.js';
import { api } from './api.js';
import { getToken } from './auth.js';
import { bestMoveConstraintFor } from './factualBestMoveConstraint.js';
import { requestRemoteNarrative } from './narrativeRemote.js';
import { loadPersonalPuzzles, saveGeneratedPersonalPuzzles } from './personalPuzzles.js';
import { isObviouslyUnsoundSingleMovePuzzle } from './puzzleTacticalQuality.js';
import {
  PERSONAL_PUZZLE_MIN_ANALYSIS_DEPTH,
  PERSONAL_PUZZLE_MIN_ENGINE_LEVEL,
  PERSONAL_PUZZLE_QUALITY_VERSION,
} from './personalPuzzleQuality.js';

const MAX_SEEDS = 2;
const MAX_CANDIDATES = 4;
const ENGINE_LEVEL = PERSONAL_PUZZLE_MIN_ENGINE_LEVEL;

function cleanText(value, max = 100) {
  const text = String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

export function buildPersonalPuzzleBatchDossier(puzzles = loadPersonalPuzzles()) {
  const seeds = [...(Array.isArray(puzzles) ? puzzles : [])]
    .filter((puzzle) => puzzle?.source === 'autopsy' && puzzle?.fen && puzzle?.suggested)
    .sort((a, b) => Number(b.loss || 0) - Number(a.loss || 0))
    .slice(0, MAX_SEEDS)
    .map((puzzle) => ({
      fen: cleanText(puzzle.fen, 120),
      played: cleanText(puzzle.played, 24),
      better_move: cleanText(puzzle.suggested, 24),
      loss_cp: Number.isFinite(Number(puzzle.loss)) ? Number(puzzle.loss) : null,
      opening: cleanText(puzzle.opening, 100),
      incidents: (puzzle.incidentKeys || []).slice(0, 4).map((value) => cleanText(value, 48)).filter(Boolean),
    }));
  if (!seeds.length) return null;
  return {
    eventType: 'personal_puzzle_batch',
    requestKind: 'personal_puzzle_batch',
    tone: 'friendly_sarcastic',
    facts: { requested_candidates: MAX_CANDIDATES, seeds },
  };
}

export function parsePersonalPuzzleBatch(text) {
  if (!text || typeof text !== 'string') return [];
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed;
  try { parsed = JSON.parse(stripped); } catch { return []; }
  const candidates = Array.isArray(parsed) ? parsed : parsed?.candidates;
  if (!Array.isArray(candidates)) return [];
  return candidates.slice(0, MAX_CANDIDATES).filter((candidate) => candidate && typeof candidate === 'object');
}

function uciParts(value) {
  const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(String(value || '').trim().toLowerCase());
  return match ? { from: match[1], to: match[2], promotion: match[3] || undefined } : null;
}

function normalizeEngineMove(move) {
  const from = String(move?.from || '').trim().toLowerCase();
  const to = String(move?.to || '').trim().toLowerCase();
  if (!/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to)) return null;
  const rawPromotion = String(move?.promotion || '').trim().toLowerCase();
  const promotion = rawPromotion && /^[qrbn]$/.test(rawPromotion) ? rawPromotion : null;
  return {
    from,
    to,
    promotion,
    san: cleanText(move?.san, 24),
  };
}

function sameEngineMove(left, right) {
  return Boolean(left && right
    && left.from === right.from
    && left.to === right.to
    && (left.promotion || null) === (right.promotion || null));
}

function enginePuzzleProvenance(engine) {
  const analysisDepth = Number(engine?.analysisDepth);
  const candidateCount = Number(engine?.candidateCount);
  const rawGap = engine?.bestToSecondGap;
  const gap = rawGap == null ? null : Number(rawGap);
  const secondBest = candidateCount > 1 ? normalizeEngineMove(engine?.secondBest) : null;

  if (!Number.isInteger(analysisDepth) || analysisDepth < PERSONAL_PUZZLE_MIN_ANALYSIS_DEPTH) return null;
  if (!Number.isInteger(candidateCount) || candidateCount < 1) return null;
  const bestMoveConstraint = bestMoveConstraintFor({
    candidateCount,
    analysisDepth,
    secondBest,
    bestToSecondGap: gap,
  });
  if (!bestMoveConstraint) return null;

  return {
    engineAnalysisDepth: analysisDepth,
    engineCandidateCount: candidateCount,
    engineSecondBest: secondBest,
    engineBestToSecondGap: candidateCount === 1 ? null : gap,
  };
}

function enginePrincipalVariationProvenance(fen, boardAfterSolution, intended, engine) {
  if (!Array.isArray(engine?.suggestedLine) || !engine.suggestedLine.length) return null;
  const normalizedLine = engine.suggestedLine.map(normalizeEngineMove);
  if (normalizedLine.some((move) => !move)) return null;

  const root = {
    from: intended.from,
    to: intended.to,
    promotion: intended.promotion || null,
  };
  if (!sameEngineMove(normalizedLine[0], root)) return null;

  let probe;
  try { probe = new Chess(fen); } catch { return null; }
  const provenLine = [];
  for (const move of normalizedLine) {
    let played;
    try {
      played = probe.move({
        from: move.from,
        to: move.to,
        ...(move.promotion ? { promotion: move.promotion } : {}),
      });
    } catch {
      return null;
    }
    if (!played) return null;
    provenLine.push({
      ...move,
      promotion: move.promotion || null,
      san: played.san,
    });
  }

  if (boardAfterSolution.isGameOver()) {
    if (provenLine.length !== 1 || normalizeEngineMove(engine?.suggestedReply)) return null;
    return {
      tacticalBestDefenseChecked: true,
      enginePrincipalVariationChecked: true,
      enginePrincipalVariation: provenLine,
      engineTerminalAfterSolution: true,
      engineBestDefense: null,
    };
  }

  if (provenLine.length < 2) return null;
  const suggestedReply = normalizeEngineMove(engine?.suggestedReply);
  if (!suggestedReply || !sameEngineMove(provenLine[1], suggestedReply)) return null;

  return {
    tacticalBestDefenseChecked: true,
    enginePrincipalVariationChecked: true,
    enginePrincipalVariation: provenLine,
    engineTerminalAfterSolution: false,
    engineBestDefense: provenLine[1],
  };
}

export async function validateAiPersonalPuzzleCandidate(candidate, { analyzeMove = api.analyzeMove } = {}) {
  const fen = cleanText(candidate?.fen, 120);
  const intended = uciParts(candidate?.best_uci);
  if (!fen || !intended) return null;

  let board;
  let played;
  try {
    board = new Chess(fen);
    if (board.isGameOver()) return null;
    played = board.move(intended);
    if (!played) return null;
  } catch {
    return null;
  }

  let engine;
  try { engine = await analyzeMove(fen, intended.from, intended.to, intended.promotion, ENGINE_LEVEL); } catch { return null; }
  const suggested = engine?.suggested;
  if (!suggested || suggested.from !== intended.from || suggested.to !== intended.to) return null;
  if ((suggested.promotion || undefined) !== (intended.promotion || undefined)) return null;
  const provenance = enginePuzzleProvenance(engine);
  if (!provenance) return null;
  const defenseProvenance = enginePrincipalVariationProvenance(fen, board, intended, engine);
  if (!defenseProvenance) return null;

  const sourceIncidents = Array.isArray(candidate?.incident_keys)
    ? candidate.incident_keys.slice(0, 4).map((value) => cleanText(value, 48)).filter(Boolean)
    : [];
  const validated = {
    kind: 'personal',
    title: cleanText(candidate?.title, 70) || 'Variante de tu crimen',
    description: cleanText(candidate?.description, 180) || 'Escenario nuevo inspirado en uno de tus errores y validado por el motor local.',
    fen,
    solution: [played.san],
    suggested: played.san,
    humanColor: new Chess(fen).turn(),
    incidentKeys: sourceIncidents,
    source: 'workers-ai-validated',
    aiValidatedLevel: ENGINE_LEVEL,
    aiQualityVersion: PERSONAL_PUZZLE_QUALITY_VERSION,
    tacticalBestMoveChecked: true,
    tacticalRefutationChecked: true,
    ...provenance,
    ...defenseProvenance,
    generatedAt: new Date().toISOString(),
  };
  if (isObviouslyUnsoundSingleMovePuzzle(validated)) return null;
  return validated;
}

export function shouldOfferAiPersonalPuzzleGeneration(summary) {
  return Number(summary?.total || 0) > 0 && Number(summary?.active || 0) < 3;
}

export async function generateValidatedPersonalPuzzleBatch({ puzzles = loadPersonalPuzzles() } = {}) {
  const dossier = buildPersonalPuzzleBatchDossier(puzzles);
  const token = getToken();
  if (!dossier || !token) return { ok: false, reason: 'no-seeds', added: 0, rejected: 0, saved: [] };

  const text = await requestRemoteNarrative(dossier, { token, timeoutMs: 9000 });
  if (!text) return { ok: false, reason: 'remote-unavailable', added: 0, rejected: 0, saved: [] };
  const candidates = parsePersonalPuzzleBatch(text);
  if (!candidates.length) return { ok: false, reason: 'invalid-batch', added: 0, rejected: 0, saved: [] };

  const accepted = [];
  for (const candidate of candidates) {
    const validated = await validateAiPersonalPuzzleCandidate(candidate);
    if (validated) accepted.push(validated);
    if (accepted.length >= 3) break;
  }
  const result = saveGeneratedPersonalPuzzles(accepted);
  return {
    ok: result.added > 0,
    reason: result.added > 0 ? 'saved' : 'all-rejected-or-duplicate',
    added: result.added,
    rejected: Math.max(0, candidates.length - accepted.length),
    saved: result.saved,
  };
}