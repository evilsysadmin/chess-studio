import { describe, expect, it } from 'vitest';
import {
  buildLegacySessionDescriptor,
  classifyRestoreFailure,
  resolveRestoredGameContext,
  selectBoundaryRecovery,
} from './useActiveSessionRestore.js';

describe('active session restore helpers', () => {
  it('prioriza el contexto persistido y cae a run/ghost sólo cuando falta', () => {
    const found = { id: 'g-1', ghostStyle: 'solid' };
    expect(resolveRestoredGameContext({ gameContext: { lab: true } }, found, { active: true, currentGameId: 'g-1', mode: 'cup' }))
      .toEqual({ lab: true });
    expect(resolveRestoredGameContext({ gameContext: {} }, found, { active: true, currentGameId: 'g-1', mode: 'cup' }))
      .toEqual({ runMode: 'cup' });
    expect(resolveRestoredGameContext({ gameContext: {} }, found, null))
      .toEqual({ ghost: true, ghostStyle: 'solid' });
  });

  it('construye un descriptor mínimo para saves anteriores a dm6', () => {
    expect(buildLegacySessionDescriptor({ gameId: 'old-1', learningMode: true, timeControlId: '10+5' })).toEqual({
      route: 'game',
      gameId: 'old-1',
      learningMode: true,
      gameContext: {},
      timeControlId: '10+5',
    });
    expect(buildLegacySessionDescriptor({})).toBeNull();
  });

  it('el ErrorBoundary prioriza snapshot, luego ids vivos y por último Combat', () => {
    const saved = { route: 'game', gameId: 'saved-1' };
    expect(selectBoundaryRecovery({ saved, game: { id: 'live-1' }, currentView: 'game' }))
      .toEqual({ type: 'session', session: saved });
    expect(selectBoundaryRecovery({ tournamentGame: { id: 'tour-1' }, currentView: 'tournamentGame' }))
      .toEqual({ type: 'session', session: { route: 'tournamentGame', gameId: 'tour-1' } });
    expect(selectBoundaryRecovery({ game: { id: 'live-1' }, learningMode: true, gameContext: { lab: true }, timeControlId: '5+0', currentView: 'game' }))
      .toEqual({ type: 'session', session: { route: 'game', gameId: 'live-1', learningMode: true, gameContext: { lab: true }, timeControlId: '5+0' } });
    expect(selectBoundaryRecovery({ currentView: 'combat' })).toEqual({ type: 'combat' });
    expect(selectBoundaryRecovery({ currentView: 'menu' })).toEqual({ type: 'none' });
  });

  it('sólo 403/404 invalidan definitivamente el save; red/5xx conservan reintento', () => {
    expect(classifyRestoreFailure({ status: 404 })).toBe('stale-session');
    expect(classifyRestoreFailure({ status: 403 })).toBe('stale-session');
    expect(classifyRestoreFailure({ status: 401 })).toBe('transient');
    expect(classifyRestoreFailure({ status: 503 })).toBe('transient');
    expect(classifyRestoreFailure(new TypeError('Failed to fetch'))).toBe('transient');
  });

});
