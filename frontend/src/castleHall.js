import { hallOfFameAndShame, loadAnalysisArchive } from './advancedCareer.js';
import { loadGameHistory } from './gameHistory.js';

export const CASTLE_HALL_VERSION = 1;
export const MAX_CASTLE_HALL_ENTRIES = 6;

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function sourceGameIdForRecord(record) {
  return record?.sourceGameId || record?.gameId || record?.id || null;
}

function sourceRecordForAnalysis(history, analysis) {
  const gameId = analysis?.gameId;
  if (!gameId) return null;
  const target = String(gameId);
  return (history || []).find((record) => {
    const sourceId = sourceGameIdForRecord(record);
    return sourceId != null && String(sourceId) === target;
  }) || null;
}

function plaque({ id, hall, label, detail, glyph, prestige, record, analysis = null, moveIndex = null, evidence }) {
  const sourceGameId = sourceGameIdForRecord(record);
  if (!sourceGameId) return null;
  return {
    version: CASTLE_HALL_VERSION,
    id,
    hall,
    label,
    detail,
    glyph,
    prestige,
    sourceGameId: String(sourceGameId),
    recordId: record?.id ? String(record.id) : null,
    date: record?.date || analysis?.date || analysis?.analyzedAt || null,
    moveIndex: Number.isInteger(moveIndex) && moveIndex >= 0 ? moveIndex : null,
    evidence,
  };
}

function pushUnique(target, entry) {
  if (!entry) return;
  const sameIncident = target.some((item) => (
    item.sourceGameId === entry.sourceGameId
    && item.moveIndex === entry.moveIndex
    && item.hall === entry.hall
  ));
  if (!sameIncident) target.push(entry);
}

export function buildCastleHallGallery(history = loadGameHistory(), archive = loadAnalysisArchive()) {
  const rows = Array.isArray(history) ? history : [];
  const hall = hallOfFameAndShame(rows, archive);
  const fame = [];
  const shame = [];

  const hardestDifficulty = asNumber(hall.hardestWin?.difficulty);
  if (hall.hardestWin && hardestDifficulty >= 60) {
    pushUnique(fame, plaque({
      id: `fame-hardest-${sourceGameIdForRecord(hall.hardestWin)}`,
      hall: 'fame',
      label: 'La victoria más difícil',
      detail: `Matthias cayó en dificultad ${hardestDifficulty}. No consta asistencia de la Cruz Roja.`,
      glyph: '♛',
      prestige: Math.min(100, 55 + Math.round(hardestDifficulty / 2)),
      record: hall.hardestWin,
      evidence: { type: 'hardest-win', difficulty: hardestDifficulty },
    }));
  }

  const fastestMoves = hall.fastestWin?.moves?.length || 0;
  if (hall.fastestWin && fastestMoves > 0 && fastestMoves <= 40) {
    pushUnique(fame, plaque({
      id: `fame-fastest-${sourceGameIdForRecord(hall.fastestWin)}`,
      hall: 'fame',
      label: 'Ejecución sumaria',
      detail: `Victoria cerrada en ${fastestMoves} medias jugadas registradas. Trámite administrativo breve.`,
      glyph: '⚔',
      prestige: Math.max(55, 88 - fastestMoves),
      record: hall.fastestWin,
      evidence: { type: 'fastest-win', moves: fastestMoves },
    }));
  }

  const bestAccuracyRecord = sourceRecordForAnalysis(rows, hall.bestAccuracy);
  if (bestAccuracyRecord && asNumber(hall.bestAccuracy?.accuracy) >= 90 && asNumber(hall.bestAccuracy?.analyzedCount) >= 8) {
    pushUnique(fame, plaque({
      id: `fame-accuracy-${hall.bestAccuracy.gameId}`,
      hall: 'fame',
      label: 'Partida de guante blanco',
      detail: `${Math.round(hall.bestAccuracy.accuracy)}% de precisión estimada en ${hall.bestAccuracy.analyzedCount} jugadas propias analizadas.`,
      glyph: '✦',
      prestige: Math.min(100, Math.round(hall.bestAccuracy.accuracy)),
      record: bestAccuracyRecord,
      analysis: hall.bestAccuracy,
      evidence: { type: 'best-accuracy', accuracy: hall.bestAccuracy.accuracy, analyzedCount: hall.bestAccuracy.analyzedCount },
    }));
  }

  const desperateRecord = sourceRecordForAnalysis(rows, hall.desperateSave);
  if (desperateRecord && asNumber(hall.desperateSave?.troughPerspectiveEval) <= -300) {
    pushUnique(fame, plaque({
      id: `fame-save-${hall.desperateSave.gameId}`,
      hall: 'fame',
      label: 'Cadáver que se negó a morir',
      detail: `La evaluación llegó a ${Math.round(hall.desperateSave.troughPerspectiveEval)} cp y aun así terminaste ${hall.desperateSave.outcome === 'win' ? 'ganando' : 'salvando tablas'}.`,
      glyph: '♜',
      prestige: Math.min(98, 72 + Math.round(Math.abs(hall.desperateSave.troughPerspectiveEval) / 100)),
      record: desperateRecord,
      analysis: hall.desperateSave,
      evidence: { type: 'desperate-save', troughPerspectiveEval: hall.desperateSave.troughPerspectiveEval, outcome: hall.desperateSave.outcome },
    }));
  }

  const worstRecord = sourceRecordForAnalysis(rows, hall.worst);
  if (worstRecord && asNumber(hall.worst?.worst?.loss) >= 250) {
    const move = hall.worst.worst;
    pushUnique(shame, plaque({
      id: `shame-worst-${hall.worst.gameId}-${move.index}`,
      hall: 'shame',
      label: move.loss >= 600 ? 'Crimen contra el tablero' : 'Traumatismo táctico severo',
      detail: `Jugada ${move.moveNumber || Math.floor(move.index / 2) + 1}: ${move.played || 'movimiento archivado'} cedió ~${Math.round(move.loss)} cp.`,
      glyph: '☠',
      prestige: Math.min(100, 50 + Math.round(move.loss / 12)),
      record: worstRecord,
      analysis: hall.worst,
      moveIndex: move.index,
      evidence: { type: 'worst-blunder', loss: move.loss, played: move.played || null, suggested: move.suggested || null },
    }));
  }

  const conversionRecord = sourceRecordForAnalysis(rows, hall.missedConversion);
  if (conversionRecord && asNumber(hall.missedConversion?.peakPerspectiveEval) >= 300) {
    pushUnique(shame, plaque({
      id: `shame-conversion-${hall.missedConversion.gameId}`,
      hall: 'shame',
      label: 'Victoria arrojada por la ventana',
      detail: `La posición llegó a +${Math.round(hall.missedConversion.peakPerspectiveEval)} cp y acabó en ${hall.missedConversion.outcome === 'draw' ? 'tablas' : 'derrota'}.`,
      glyph: '⌁',
      prestige: Math.min(98, 64 + Math.round(hall.missedConversion.peakPerspectiveEval / 100)),
      record: conversionRecord,
      analysis: hall.missedConversion,
      moveIndex: hall.missedConversion.pointOfNoReturn?.index ?? hall.missedConversion.worst?.index ?? null,
      evidence: { type: 'missed-conversion', peakPerspectiveEval: hall.missedConversion.peakPerspectiveEval, outcome: hall.missedConversion.outcome },
    }));
  }

  return {
    version: CASTLE_HALL_VERSION,
    fame: fame.sort((a, b) => b.prestige - a.prestige || String(b.date || '').localeCompare(String(a.date || ''))).slice(0, MAX_CASTLE_HALL_ENTRIES),
    shame: shame.sort((a, b) => b.prestige - a.prestige || String(b.date || '').localeCompare(String(a.date || ''))).slice(0, MAX_CASTLE_HALL_ENTRIES),
  };
}

export function castleHallSummary(gallery) {
  return {
    fame: Array.isArray(gallery?.fame) ? gallery.fame.length : 0,
    shame: Array.isArray(gallery?.shame) ? gallery.shame.length : 0,
  };
}
