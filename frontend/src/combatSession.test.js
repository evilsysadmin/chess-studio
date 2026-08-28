import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Chess } from 'chess.js';
import { clearStorageMemoryFallback } from './safeStorage.js';
import { clearCombatSession, hasCombatSession, hasCombatSessionMarker, loadCombatSession, saveCombatSession } from './combatSession.js';
import { createInitialRegistry } from './combat.js';

const VALID_FEN = '8/8/8/8/8/8/8/K6k w - - 0 1';
const validSnapshot = (overrides = {}) => ({
  phase: 'battle',
  fen: VALID_FEN,
  registry: createInitialRegistry(new Chess(VALID_FEN)),
  humanColor: 'w',
  ...overrides,
});

describe('Combat Chess active session snapshot', () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearStorageMemoryFallback();
    clearCombatSession();
  });

  it('restaura sólo la batalla cuyo id coincide', () => {
    expect(saveCombatSession('campaign:abc:n1', validSnapshot())).toBe(true);
    expect(hasCombatSession('campaign:abc:n1')).toBe(true);
    expect(loadCombatSession('campaign:abc:n1')?.humanColor).toBe('w');
    expect(loadCombatSession('campaign:abc:n2')).toBeNull();
  });

  it('informa si sessionStorage no pudo hacer durable el snapshot', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const setItem = vi.spyOn(sessionStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });

    expect(saveCombatSession('free', validSnapshot())).toBe(false);
    expect(loadCombatSession('free')?.fen).toBe(VALID_FEN);
    expect(consoleError).toHaveBeenCalledWith('[CombatSession] No se pudo persistir el snapshot; se mantiene respaldo en memoria.');

    setItem.mockRestore();
    consoleError.mockRestore();
  });


  it('migra perezosamente el snapshot unitario legacy anterior al bucket v2', () => {
    const legacy = { version: 1, sessionId: 'legacy-campaign', savedAt: '2026-08-28T09:00:00.000Z', ...validSnapshot() };
    sessionStorage.setItem('chess-study-active-combat-session-v1', JSON.stringify(legacy));
    expect(loadCombatSession('legacy-campaign')).toMatchObject({ sessionId: 'legacy-campaign', phase: 'battle', fen: VALID_FEN });
    expect(saveCombatSession('legacy-campaign', validSnapshot())).toBe(true);
    const durable = JSON.parse(sessionStorage.getItem('chess-study-active-combat-session-v1'));
    expect(durable.version).toBe(2);
    expect(durable.sessions['legacy-campaign']).toBeTruthy();
  });

  it('se elimina al cerrar la batalla', () => {
    saveCombatSession('free', validSnapshot());
    expect(hasCombatSessionMarker('free')).toBe(true);
    clearCombatSession('free');
    expect(loadCombatSession('free')).toBeNull();
    expect(hasCombatSessionMarker('free')).toBe(false);
  });
  it('recupera desde memoria si sessionStorage queda ilegible durante un remount', () => {
    saveCombatSession('campaign:abc:n1', validSnapshot());
    sessionStorage.setItem('chess-study-active-combat-session-v1', '{corrupto');

    expect(loadCombatSession('campaign:abc:n1')?.humanColor).toBe('w');
    expect(sessionStorage.getItem('chess-study-active-combat-session-v1')).toBeNull();
  });

  it('clear elimina también el respaldo en memoria', () => {
    saveCombatSession('campaign:abc:n1', validSnapshot());
    sessionStorage.setItem('chess-study-active-combat-session-v1', '{corrupto');
    clearCombatSession('campaign:abc:n1');
    expect(loadCombatSession('campaign:abc:n1')).toBeNull();
  });

  it('rechaza FEN corrupto antes de sustituir una batalla recuperable', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(saveCombatSession('campaign:abc:n1', validSnapshot())).toBe(true);
    expect(saveCombatSession('campaign:abc:n1', validSnapshot({ fen: 'fen-corrupto' }))).toBe(false);
    expect(loadCombatSession('campaign:abc:n1')?.fen).toBe(VALID_FEN);
    expect(consoleError).toHaveBeenCalledWith('[CombatSession] Snapshot inválido descartado antes de persistir.');
    consoleError.mockRestore();
  });

  it('rechaza un registro que no representa exactamente las piezas del FEN', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(saveCombatSession('campaign:abc:n1', validSnapshot({ registry: { a1: { type: 'k', color: 'w', square: 'a1' } } }))).toBe(false);
    expect(loadCombatSession('campaign:abc:n1')).toBeNull();
    consoleError.mockRestore();
  });

});
