import { describe, expect, it } from 'vitest';
import { SAVE_STATUS } from './saveStatus.js';
import {
  activeSessionPersistenceDescriptor,
  persistenceStateAfterSnapshot,
} from './useActiveGameSessionPersistence.js';

describe('persistencia de sesión activa · política de guardado', () => {
  it('una partida normal conserva contexto, modo aprendizaje y reloj', () => {
    const game = { id: 'g-1', fen: 'fen' };
    expect(activeSessionPersistenceDescriptor({
      view: 'game',
      game,
      learningMode: true,
      gameContext: { ghost: true },
      timeControlId: '10+5',
    })).toEqual({
      route: 'game',
      game,
      learningMode: true,
      gameContext: { ghost: true },
      timeControlId: '10+5',
    });
  });

  it('una partida de torneo no se confunde con una normal aunque ambas existan en memoria', () => {
    const tournamentGame = { id: 't-1' };
    expect(activeSessionPersistenceDescriptor({
      view: 'tournamentGame',
      game: { id: 'g-vieja' },
      tournamentGame,
      learningMode: true,
      gameContext: { lab: true },
      timeControlId: '5+0',
    })).toEqual({ route: 'tournamentGame', game: tournamentGame });
  });

  it('menú y objetos sin id nunca fabrican un snapshot activo', () => {
    expect(activeSessionPersistenceDescriptor({ view: 'menu', game: { id: 'g-1' } })).toBeNull();
    expect(activeSessionPersistenceDescriptor({ view: 'game', game: {} })).toBeNull();
    expect(activeSessionPersistenceDescriptor({ view: 'tournamentGame', tournamentGame: null })).toBeNull();
  });

  it('sólo anuncia Guardado cuando el snapshot local durable confirmó la escritura', () => {
    const descriptor = { route: 'game', game: { id: 'g-1' } };
    expect(persistenceStateAfterSnapshot({ descriptor, persisted: true })).toBe(SAVE_STATUS.SAVED);
    expect(persistenceStateAfterSnapshot({ descriptor, persisted: false })).toBe(SAVE_STATUS.ERROR);
    expect(persistenceStateAfterSnapshot({ descriptor: null, persisted: false })).toBeNull();
  });
});
