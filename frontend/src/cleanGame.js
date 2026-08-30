import { detectNoteworthyMove } from './cpuCommentary.js';

export const CLEAN_GAME_MIN_ANALYZED_MOVES = 8;
const SERIOUS_LOSS_CP = 60;
const VALUABLE_PIECES = new Set(['n', 'b', 'r', 'q']);
const MATE_ERROR_TYPES = new Set(['MISSED_MATE', 'ALLOWED_MATE']);

function noteworthyIncident(moveReport) {
  const fen = moveReport?.context?.fenBefore;
  const from = moveReport?.playedFrom || moveReport?.context?.played?.from;
  const to = moveReport?.playedTo || moveReport?.context?.played?.to;
  if (!fen || !from || !to) return null;
  return detectNoteworthyMove(fen, {
    from,
    to,
    promotion: moveReport?.playedPromotion || undefined,
  });
}

function isMaterialGiveaway(moveReport) {
  if (Number(moveReport?.loss) < SERIOUS_LOSS_CP) return false;
  const playedPiece = moveReport?.playedPiece || moveReport?.context?.played?.piece;
  if (!VALUABLE_PIECES.has(playedPiece)) return false;
  return Boolean(moveReport?.context?.reply?.capturedPlayedPiece);
}

export function assessCleanGame(report, { minAnalyzedMoves = CLEAN_GAME_MIN_ANALYZED_MOVES } = {}) {
  const moves = Array.isArray(report?.moveReports) ? report.moveReports : [];
  const ratedMoves = moves.filter((move) => Number.isFinite(move?.loss));
  const analyzedCount = Number.isFinite(report?.analyzedCount) ? report.analyzedCount : ratedMoves.length;
  const sampleEnough = analyzedCount >= minAnalyzedMoves;

  const seriousErrors = ratedMoves.filter((move) => Number(move.loss) >= SERIOUS_LOSS_CP);
  const mateErrors = moves
    .map((move) => ({ move, incident: noteworthyIncident(move) }))
    .filter(({ incident }) => MATE_ERROR_TYPES.has(incident?.type));
  const materialGiveaways = moves.filter(isMaterialGiveaway);
  const clean = sampleEnough && seriousErrors.length === 0 && mateErrors.length === 0 && materialGiveaways.length === 0;

  return {
    eligible: sampleEnough,
    clean,
    analyzedCount,
    minAnalyzedMoves,
    seriousErrorCount: seriousErrors.length,
    mateErrorCount: mateErrors.length,
    materialGiveawayCount: materialGiveaways.length,
    reasons: [
      seriousErrors.length ? `${seriousErrors.length} error${seriousErrors.length === 1 ? '' : 'es'} serio${seriousErrors.length === 1 ? '' : 's'}` : null,
      mateErrors.length ? `${mateErrors.length} fallo${mateErrors.length === 1 ? '' : 's'} de mate` : null,
      materialGiveaways.length ? `${materialGiveaways.length} entrega${materialGiveaways.length === 1 ? '' : 's'} de material` : null,
    ].filter(Boolean),
  };
}
