import { beforeEach, describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { validateLabPosition } from './labPosition.js';
import { createSeries, recordSeriesGame } from './series.js';
import { restoreClockState, saveClockSnapshot } from './clockPersistence.js';

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function compactMove(move) {
  return {
    from: move.from,
    to: move.to,
    ...(move.promotion ? { promotion: move.promotion } : {}),
  };
}

const LEGAL_POSITION_FUZZ_TIMEOUT_MS = 20_000;

describe('property/fuzz de estado cliente', () => {
  beforeEach(() => localStorage.clear());

  it('toda posición alcanzada por partidas legales aleatorias pasa el gate del Laboratorio', () => {
    // Este property test recorre ~2.200 posiciones y valida cada FEN con el gate
    // estricto del Laboratorio. En runners compartidos de CI puede superar los
    // 5 s por defecto de Vitest sin que exista un fallo lógico, por eso tiene
    // un presupuesto propio. No relajamos el timeout global ni reducimos seeds.
    for (let seed = 1; seed <= 32; seed += 1) {
      const random = rng(seed);
      const chess = new Chess();
      for (let ply = 0; ply < 70 && !chess.isGameOver(); ply += 1) {
        const legal = chess.moves({ verbose: true });
        const move = legal[Math.floor(random() * legal.length)];
        chess.move(move);
        const fen = chess.fen();
        const checked = validateLabPosition(fen);
        if (!checked.valid) {
          throw new Error(`seed=${seed} ply=${ply} fen=${fen} errors=${checked.errors.join('; ')}`);
        }
      }
    }
  }, LEGAL_POSITION_FUZZ_TIMEOUT_MS);

  it('move/undo y round-trip FEN preservan exactamente posiciones legales aleatorias', () => {
    for (let seed = 101; seed <= 124; seed += 1) {
      const random = rng(seed * 31);
      const chess = new Chess();
      for (let ply = 0; ply < 60 && !chess.isGameOver(); ply += 1) {
        const before = chess.fen();
        const legal = chess.moves({ verbose: true });
        const picked = legal[Math.floor(random() * legal.length)];
        const played = chess.move(compactMove(picked));
        if (!played) throw new Error(`seed=${seed} ply=${ply} move rejected unexpectedly`);

        const after = chess.fen();
        expect(new Chess(after).fen(), `seed=${seed} ply=${ply} fen=${after}`).toBe(after);

        const undone = chess.undo();
        expect(undone, `seed=${seed} ply=${ply} fen=${after}`).not.toBeNull();
        expect(chess.fen(), `seed=${seed} ply=${ply} undo=${played.san}`).toBe(before);

        chess.move(compactMove(played));
        expect(chess.fen(), `seed=${seed} ply=${ply} replay=${played.san}`).toBe(after);
      }
    }
  }, LEGAL_POSITION_FUZZ_TIMEOUT_MS);

  it('reproducir una partida legal aleatoria desde sus jugadas reconstruye cada FEN', () => {
    for (let seed = 201; seed <= 216; seed += 1) {
      const random = rng(seed * 43);
      const source = new Chess();
      const moves = [];
      const fens = [source.fen()];

      for (let ply = 0; ply < 50 && !source.isGameOver(); ply += 1) {
        const legal = source.moves({ verbose: true });
        const picked = legal[Math.floor(random() * legal.length)];
        const played = source.move(compactMove(picked));
        moves.push(compactMove(played));
        fens.push(source.fen());
      }

      const replay = new Chess();
      expect(replay.fen()).toBe(fens[0]);
      moves.forEach((move, index) => {
        const played = replay.move(move);
        if (!played) throw new Error(`seed=${seed} replayPly=${index} move=${JSON.stringify(move)}`);
        expect(replay.fen(), `seed=${seed} replayPly=${index}`).toBe(fens[index + 1]);
      });
    }
  }, LEGAL_POSITION_FUZZ_TIMEOUT_MS);

  it('mantiene invariantes en enroque, en passant, promoción y triple repetición', () => {
    const castling = new Chess();
    ['Nf3', 'Nf6', 'g3', 'g6', 'Bg2', 'Bg7', 'O-O', 'O-O'].forEach((san) => castling.move(san));
    expect(castling.get('g1')).toMatchObject({ type: 'k', color: 'w' });
    expect(castling.get('f1')).toMatchObject({ type: 'r', color: 'w' });
    expect(castling.get('g8')).toMatchObject({ type: 'k', color: 'b' });
    expect(castling.get('f8')).toMatchObject({ type: 'r', color: 'b' });

    const enPassant = new Chess();
    ['e4', 'a6', 'e5', 'd5', 'exd6'].forEach((san) => enPassant.move(san));
    expect(enPassant.get('d5')).toBeUndefined();
    expect(enPassant.get('d6')).toMatchObject({ type: 'p', color: 'w' });

    const promotion = new Chess('8/P7/8/8/8/8/7p/4K2k w - - 0 1');
    promotion.move({ from: 'a7', to: 'a8', promotion: 'q' });
    expect(promotion.get('a8')).toMatchObject({ type: 'q', color: 'w' });

    const repetition = new Chess();
    ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8'].forEach((san) => repetition.move(san));
    expect(repetition.isThreefoldRepetition()).toBe(true);
  });

  it('series aleatorias nunca sobrepasan las victorias necesarias ni duplican gameId', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const random = rng(seed * 17);
      let series = createSeries({ bestOf: random() < 0.5 ? 3 : 5, difficulty: 50, firstColor: 'w' });
      for (let game = 0; game < 30 && !series.winner; game += 1) {
        const roll = random();
        const outcome = roll < 0.4 ? 'win' : roll < 0.8 ? 'loss' : 'draw';
        const id = `s${seed}-g${game}`;
        series = recordSeriesGame(series, outcome, { gameId: id, humanColor: game % 2 ? 'b' : 'w' });
        const once = series.games.length;
        series = recordSeriesGame(series, outcome, { gameId: id, humanColor: 'w' });
        expect(series.games.length).toBe(once);
        expect(series.humanWins).toBeLessThanOrEqual(series.winsNeeded);
        expect(series.cpuWins).toBeLessThanOrEqual(series.winsNeeded);
      }
      expect(series.winner === 'human' || series.winner === 'cpu').toBe(true);
    }
  });

  it('restaurar relojes aleatorios nunca crea tiempo ni valores negativos', () => {
    const tc = { id: '5+0', initial: 300, increment: 0 };
    for (let seed = 1; seed <= 80; seed += 1) {
      const random = rng(seed * 97);
      const white = 1 + random() * 299;
      const black = 1 + random() * 299;
      const active = random() < 0.5 ? 'w' : 'b';
      const elapsedMs = Math.floor(random() * 120_000);
      saveClockSnapshot({ gameId: `g${seed}`, timeControlId: tc.id, whiteTime: white, blackTime: black, activeColor: active, now: 1_000 });
      const restored = restoreClockState(`g${seed}`, tc, active, 1_000 + elapsedMs);
      expect(restored.whiteTime).toBeGreaterThanOrEqual(0);
      expect(restored.blackTime).toBeGreaterThanOrEqual(0);
      expect(restored.whiteTime).toBeLessThanOrEqual(white);
      expect(restored.blackTime).toBeLessThanOrEqual(black);
      if (active === 'w') expect(restored.blackTime).toBeCloseTo(black, 6);
      else expect(restored.whiteTime).toBeCloseTo(white, 6);
    }
  });
});