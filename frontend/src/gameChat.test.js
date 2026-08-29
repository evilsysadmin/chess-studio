import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appendActiveGameChat, clearActiveGameChat, loadActiveGameChat } from './gameChat.js';

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('gameChat', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T21:00:00.000Z'));
  });

  it('persiste los comentarios de la CPU por gameId', () => {
    appendActiveGameChat('g-1', { text: 'Eso era una dama. Era.' }, { event: 'QUEEN_EN_PRISE_TO_PAWN', actor: 'human', ply: 17 });
    const messages = loadActiveGameChat('g-1');
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      by: 'cpu',
      text: 'Eso era una dama. Era.',
      event: 'QUEEN_EN_PRISE_TO_PAWN',
      actor: 'human',
      ply: 17,
    });
  });

  it('no mezcla transcripts entre partidas', () => {
    appendActiveGameChat('g-1', 'Primera partida');
    expect(loadActiveGameChat('g-2')).toEqual([]);
    appendActiveGameChat('g-2', 'Segunda partida');
    expect(loadActiveGameChat('g-1')).toEqual([]);
    expect(loadActiveGameChat('g-2')[0].text).toBe('Segunda partida');
  });

  it('puede limpiar únicamente el transcript activo', () => {
    appendActiveGameChat('g-1', 'Comentario');
    clearActiveGameChat('g-1');
    expect(loadActiveGameChat('g-1')).toEqual([]);
  });
});
