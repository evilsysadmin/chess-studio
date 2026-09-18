import { describe, expect, it } from 'vitest';
import {
  chooseMoveTo,
  lastMoveFromHistory,
  mergeNewerMatch,
  opponentForMatch,
  opponentPresenceLabel,
  playerResult,
  projectPvpClock,
  selectableMoves,
  uniqueLegalTargets,
} from './pvpGameModel.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('PvP War Room model', () => {
  it('identifica rival, resultado y última jugada desde contrato backend', () => {
    const match = { youAre: 'w', black: 'bob', blackRating: 1234, status: 'finished', result: '1-0' };
    expect(opponentForMatch(match)).toEqual({ username: 'bob', rating: 1234, color: 'b' });
    expect(playerResult(match)).toBe('win');
    expect(lastMoveFromHistory([{ uci: 'e2e4' }])).toEqual({ from: 'e2', to: 'e4' });
  });

  it('sólo ofrece movimientos de una pieza propia cuando toca', () => {
    const moves = selectableMoves(START, 'e2', 'w');
    expect(moves.map((move) => move.to).sort()).toEqual(['e3', 'e4']);
    expect(selectableMoves(START, 'e7', 'w')).toEqual([]);
    expect(selectableMoves(START, 'e7', 'b')).toEqual([]);
  });

  it('deduplica destinos de promoción pero conserva la decisión de promover', () => {
    const fen = '7k/P7/8/8/8/8/8/7K w - - 0 1';
    const moves = selectableMoves(fen, 'a7', 'w');
    expect(moves.filter((move) => move.to === 'a8')).toHaveLength(4);
    expect(uniqueLegalTargets(moves).filter((move) => move.to === 'a8')).toHaveLength(1);
    expect(chooseMoveTo(moves, 'a8')).toEqual({ kind: 'promotion', from: 'a7', to: 'a8' });
  });

  it('proyecta localmente sólo el reloj que está corriendo', () => {
    expect(projectPvpClock({ whiteMs: 600000, blackMs: 590000, runningColor: 'w', id: '10+0' }, 1250)).toMatchObject({
      whiteMs: 598750,
      blackMs: 590000,
      runningColor: 'w',
      id: '10+0',
    });
  });

  it('expone presencia del rival sin inventar estados', () => {
    expect(opponentPresenceLabel('online')).toBe('EN LÍNEA');
    expect(opponentPresenceLabel('reconnecting')).toBe('RECONECTANDO');
    expect(opponentPresenceLabel('disconnected')).toBe('SIN CONEXIÓN');
    expect(opponentPresenceLabel(null)).toBe('SIN DATO');
  });

  it('no deja que una respuesta de polling antigua pise una revisión nueva', () => {
    const current = { id: 'm1', revision: 4, fen: 'new' };
    expect(mergeNewerMatch(current, { id: 'm1', revision: 3, fen: 'old' })).toBe(current);
    expect(mergeNewerMatch(current, { id: 'm1', revision: 5, fen: 'newer' }).fen).toBe('newer');
  });
});
