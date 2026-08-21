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
