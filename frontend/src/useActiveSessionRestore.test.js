import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildLegacySessionDescriptor,
  classifyRestoreFailure,
  discardActiveSessionStorage,
  hasRecoverableCombatState,
  resolveRestoredGameContext,
  selectBoundaryRecovery,
  shouldLeaveActiveRouteAfterRestoreFailure,
} from './useActiveSessionRestore.js';
import { STORAGE_KEY } from './api.js';
import { ACTIVE_GAME_SESSION_KEY } from './activeGameSession.js';
import { saveClockSnapshot } from './clockPersistence.js';

beforeEach(() => localStorage.clear());

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
    expect(selectBoundaryRecovery({ currentView: 'combat', combatRecoverable: true })).toEqual({ type: 'combat' });
    expect(selectBoundaryRecovery({ currentView: 'combat' })).toEqual({ type: 'none' });
    expect(selectBoundaryRecovery({ currentView: 'menu' })).toEqual({ type: 'none' });
  });

  it('sólo 403/404 invalidan definitivamente el save; red/5xx conservan reintento', () => {
    expect(classifyRestoreFailure({ status: 404 })).toBe('stale-session');
    expect(classifyRestoreFailure({ status: 403 })).toBe('stale-session');
    expect(classifyRestoreFailure({ status: 401 })).toBe('transient');
    expect(classifyRestoreFailure({ status: 503 })).toBe('transient');
    expect(classifyRestoreFailure({ status: 409 })).toBe('irrecoverable');
    expect(classifyRestoreFailure(new TypeError('Failed to fetch'))).toBe('transient');
  });

  it('sólo anuncia recuperación de Combat cuando existe estado real', () => {
    expect(hasRecoverableCombatState('combat', { campaign: {}, run: {}, freeSession: true })).toBe(true);
    expect(hasRecoverableCombatState('combat', { campaign: {}, run: {}, freeSession: false })).toBe(false);
    expect(hasRecoverableCombatState('roguelike', { campaign: { active: true }, run: {}, freeSession: false })).toBe(true);
    expect(hasRecoverableCombatState('roguelike', { campaign: {}, run: { inRun: true }, freeSession: false })).toBe(true);
    expect(hasRecoverableCombatState('menu', { campaign: { active: true }, run: { inRun: true }, freeSession: true })).toBe(false);
  });

  it('permite descartar un save irreparable sin registrar una derrota', () => {
    localStorage.setItem(ACTIVE_GAME_SESSION_KEY, JSON.stringify({ version: 1, route: 'game', gameId: 'rota-1' }));
    localStorage.setItem(STORAGE_KEY, 'rota-1');
    localStorage.setItem('chess-study-active-game-learning', '1');
    localStorage.setItem('chess-study-active-series', JSON.stringify({ currentGameId: 'rota-1' }));
    localStorage.setItem('chess-study-active-contract', JSON.stringify({ id: 'contract-1' }));
    localStorage.setItem('chess-study-special-run', JSON.stringify({ active: true, currentGameId: 'rota-1' }));
    saveClockSnapshot({ gameId: 'rota-1', timeControlId: '5+0', whiteTime: 10, blackTime: 10, activeColor: 'w' });

    discardActiveSessionStorage('rota-1');

    expect(localStorage.getItem(ACTIVE_GAME_SESSION_KEY)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem('chess-study-active-game-learning')).toBeNull();
    expect(localStorage.getItem('chess-study-active-series')).toBeNull();
    expect(localStorage.getItem('chess-study-active-contract')).toBeNull();
    expect(localStorage.getItem('chess-study-special-run')).toBeNull();
    expect(localStorage.getItem('chess-study-clock:rota-1')).toBeNull();
  });

  it('un fallo transitorio nunca expulsa una partida recuperable al menú', () => {
    expect(shouldLeaveActiveRouteAfterRestoreFailure({ status: 404 })).toBe(true);
    expect(shouldLeaveActiveRouteAfterRestoreFailure({ status: 403 })).toBe(true);
    expect(shouldLeaveActiveRouteAfterRestoreFailure({ status: 503 })).toBe(false);
    expect(shouldLeaveActiveRouteAfterRestoreFailure(new TypeError('Failed to fetch'))).toBe(false);
  });

});
