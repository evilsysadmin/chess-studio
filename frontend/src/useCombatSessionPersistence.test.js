import { describe, expect, it, vi } from 'vitest';
import {
  combatSessionRecoveryState,
  loadCombatSessionBootstrap,
  shouldPersistCombatSession,
  shouldResumeCombatCpu,
} from './useCombatSessionPersistence.js';

describe('Combat session persistence', () => {
  it('bootstrap carga como máximo la sesión pedida y normaliza ausencia a null', () => {
    const loader = vi.fn(() => undefined);
    expect(loadCombatSessionBootstrap('campaign:3', loader)).toBeNull();
    expect(loader).toHaveBeenCalledWith('campaign:3');
  });

  it('distingue una batalla nunca iniciada de un snapshot esperado que desapareció', () => {
    expect(combatSessionRecoveryState('free', {
      loader: () => null,
      markerLoader: () => false,
    })).toEqual({ restoredSession: null, missingSession: false });
    expect(combatSessionRecoveryState('free', {
      loader: () => null,
      markerLoader: () => true,
    })).toEqual({ restoredSession: null, missingSession: true });
  });

  it('watchdog sólo repone snapshot en batalla viva cuando realmente falta', () => {
    expect(shouldPersistCombatSession({ phase: 'battle', hasSnapshot: false })).toBe(true);
    expect(shouldPersistCombatSession({ phase: 'battle', hasSnapshot: true })).toBe(false);
    expect(shouldPersistCombatSession({ phase: 'setup', hasSnapshot: false })).toBe(false);
  });

  it('reanuda CPU únicamente al restaurar una batalla donde no mueve el humano', () => {
    expect(shouldResumeCombatCpu({ restoredSession: { fen: 'x' }, phase: 'battle', turn: 'b', humanColor: 'w' })).toBe(true);
    expect(shouldResumeCombatCpu({ restoredSession: { fen: 'x' }, phase: 'battle', turn: 'w', humanColor: 'w' })).toBe(false);
  });

  it('una sesión no restaurada o ya terminada nunca programa turno CPU', () => {
    expect(shouldResumeCombatCpu({ restoredSession: null, phase: 'battle', turn: 'b', humanColor: 'w' })).toBe(false);
    expect(shouldResumeCombatCpu({ restoredSession: { fen: 'x' }, phase: 'over', turn: 'b', humanColor: 'w' })).toBe(false);
  });
});
