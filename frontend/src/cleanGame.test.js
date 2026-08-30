import { describe, expect, it } from 'vitest';
import { assessCleanGame, CLEAN_GAME_MIN_ANALYZED_MOVES } from './cleanGame.js';

function ratedMove(loss = 10, overrides = {}) {
  return {
    loss,
    playedFrom: 'g1',
    playedTo: 'f3',
    playedPiece: 'n',
    context: {},
    ...overrides,
  };
}

function report(moves) {
  return { analyzedCount: moves.filter((move) => Number.isFinite(move.loss)).length, moveReports: moves };
}

describe('Partida limpia', () => {
  it('no concede la marca con una muestra demasiado pequeña', () => {
    const result = assessCleanGame(report(Array.from({ length: CLEAN_GAME_MIN_ANALYZED_MOVES - 1 }, () => ratedMove(0))));
    expect(result).toMatchObject({ eligible: false, clean: false });
  });

  it('exige una muestra suficiente sin errores serios', () => {
    const result = assessCleanGame(report(Array.from({ length: CLEAN_GAME_MIN_ANALYZED_MOVES }, () => ratedMove(18))));
    expect(result).toMatchObject({ eligible: true, clean: true, seriousErrorCount: 0, mateErrorCount: 0, materialGiveawayCount: 0 });
  });

  it('un error de 60 cp o más ensucia la partida', () => {
    const moves = Array.from({ length: CLEAN_GAME_MIN_ANALYZED_MOVES }, () => ratedMove(8));
    moves[3] = ratedMove(60);
    expect(assessCleanGame(report(moves))).toMatchObject({ eligible: true, clean: false, seriousErrorCount: 1 });
  });

  it('detecta un mate en una omitido aunque la pérdida numérica no lo delate', () => {
    const moves = Array.from({ length: CLEAN_GAME_MIN_ANALYZED_MOVES }, () => ratedMove(5));
    moves[0] = ratedMove(0, {
      playedFrom: 'g6',
      playedTo: 'h6',
      playedPiece: 'q',
      context: { fenBefore: '7k/8/5KQ1/8/8/8/8/8 w - - 0 1' },
    });
    expect(assessCleanGame(report(moves))).toMatchObject({ eligible: true, clean: false, mateErrorCount: 1 });
  });

  it('marca una pieza valiosa regalada sólo si la autopsia confirma una pérdida seria', () => {
    const bad = Array.from({ length: CLEAN_GAME_MIN_ANALYZED_MOVES }, () => ratedMove(5));
    bad[2] = ratedMove(120, {
      playedPiece: 'r',
      context: { reply: { capturedPlayedPiece: true } },
    });
    expect(assessCleanGame(report(bad))).toMatchObject({ clean: false, materialGiveawayCount: 1 });

    const soundSacrifice = Array.from({ length: CLEAN_GAME_MIN_ANALYZED_MOVES }, () => ratedMove(5));
    soundSacrifice[2] = ratedMove(20, {
      playedPiece: 'r',
      context: { reply: { capturedPlayedPiece: true } },
    });
    expect(assessCleanGame(report(soundSacrifice))).toMatchObject({ clean: true, materialGiveawayCount: 0 });
  });
});
