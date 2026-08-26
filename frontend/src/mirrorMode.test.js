import { describe, it, expect, beforeEach } from 'vitest';
import { computeMirrorProfile, deriveMirrorStyle, mirrorDifficulty } from './mirrorMode.js';
import { saveWorstMoveCache } from './worstMoveCache.js';
import { saveGameRecord } from './gameHistory.js';

beforeEach(() => localStorage.clear());

function record(id, humanColor, moves, mode = 'casual') {
  return { id, humanColor, moves, mode, outcome: 'draw', date: '2026-08-22T12:00:00.000Z' };
}

describe('mirrorDifficulty', () => {
  it('un jugador muy preciso da una CPU fantasma fuerte', () => {
    expect(mirrorDifficulty(10)).toBeGreaterThanOrEqual(90);
  });

  it('un jugador con blunders grandes da una CPU fantasma floja', () => {
    expect(mirrorDifficulty(500)).toBeLessThanOrEqual(10);
  });

  it('nunca baja de 5 ni sube de 95', () => {
    expect(mirrorDifficulty(0)).toBeLessThanOrEqual(95);
    expect(mirrorDifficulty(100000)).toBeGreaterThanOrEqual(5);
  });
});

describe('deriveMirrorStyle', () => {
  it('necesita al menos 3 partidas normales con muestra suficiente', () => {
    const result = deriveMirrorStyle([
      record('g1', 'w', [{piece:'p'},{piece:'p'},{piece:'n'},{piece:'n'},{piece:'b'},{piece:'b'},{piece:'q'}]),
      record('g2', 'b', [{piece:'p'},{piece:'p'},{piece:'n'},{piece:'n'},{piece:'b'},{piece:'b'},{piece:'q'},{piece:'q'}]),
    ]);
    expect(result.ready).toBe(false);
    expect(result.gamesSampled).toBe(2);
  });

  it('mide sólo los plies del jugador según su color', () => {
    const whiteGame = record('w', 'w', [
      { piece:'p', san:'e4' }, { piece:'q', san:'Qh4' },
      { piece:'p', san:'d4', captured:true }, { piece:'q', san:'Qxe4+' },
      { piece:'n', san:'Nf3' }, { piece:'q', san:'Qa5+' },
      { piece:'b', san:'Bc4+' }, { piece:'q', san:'Qxa2' },
    ]);
    const blackGame = record('b', 'b', [
      { piece:'q', san:'Qh5' }, { piece:'p', san:'e5' },
      { piece:'q', san:'Qxf7+' }, { piece:'p', san:'d5', captured:true },
      { piece:'q', san:'Qg7' }, { piece:'n', san:'Nf6' },
      { piece:'q', san:'Qa3' }, { piece:'b', san:'Be7' },
      { piece:'q', san:'Qb3' }, { piece:'k', san:'O-O' },
    ]);
    const third = record('c', 'w', [
      { piece:'p', san:'c4' }, { piece:'q', san:'Qh4' },
      { piece:'n', san:'Nc3' }, { piece:'q', san:'Qe4' },
      { piece:'p', san:'g3' }, { piece:'q', san:'Qa4' },
      { piece:'k', san:'O-O' }, { piece:'q', san:'Qb4' },
    ]);
    const result = deriveMirrorStyle([whiteGame, blackGame, third]);
    expect(result.ready).toBe(true);
    expect(result.gamesSampled).toBe(3);
    expect(result.movesSampled).toBe(13);
    expect(result.metrics.queens).toBe(0); // las damas de los ejemplos pertenecen al rival
    expect(result.metrics.castles).toBeGreaterThan(0);
  });

  it('excluye práctica y posiciones FEN del perfil competitivo', () => {
    const normal = Array.from({length: 3}, (_, i) => record(`n${i}`, 'w', [
      {piece:'p',san:'e4'},{piece:'p',san:'e5'},
      {piece:'n',san:'Nf3'},{piece:'n',san:'Nc6'},
      {piece:'b',san:'Bc4'},{piece:'b',san:'Bc5'},
      {piece:'k',san:'O-O'},{piece:'n',san:'Nf6'},
    ]));
    const practice = { ...record('p', 'w', normal[0].moves, 'practice') };
    const fen = { ...record('f', 'w', normal[0].moves), initialFen: '8/8/8/8/8/8/4K3/6k1 w - - 0 1' };
    const result = deriveMirrorStyle([...normal, practice, fen]);
    expect(result.gamesSampled).toBe(3);
  });
});

describe('computeMirrorProfile', () => {
  it('combina errores reales y estilo real, sin inventar si falta una fuente', () => {
    saveWorstMoveCache({
      g1: { worst: { loss: 100 } },
      g2: { worst: { loss: 200 } },
      g3: { worst: { loss: 300 } },
    });
    const moves = [
      {piece:'p',san:'e4'},{piece:'p',san:'e5'},
      {piece:'n',san:'Nf3'},{piece:'n',san:'Nc6'},
      {piece:'b',san:'Bc4'},{piece:'b',san:'Bc5'},
      {piece:'k',san:'O-O'},{piece:'n',san:'Nf6'},
    ];
    saveGameRecord(record('g1','w',moves));
    saveGameRecord(record('g2','w',moves));
    saveGameRecord(record('g3','w',moves));
    const profile = computeMirrorProfile();
    expect(profile.ready).toBe(true);
    expect(profile.avgLoss).toBe(200);
    expect(profile.difficulty).toBe(mirrorDifficulty(200));
    expect(profile.style).toBeTruthy();
  });
});
