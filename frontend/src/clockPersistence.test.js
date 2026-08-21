import { beforeEach, describe, expect, it } from 'vitest';
import { clearAllClockSnapshots, clearClockSnapshot, loadClockSnapshot, restoreClockState, saveClockSnapshot } from './clockPersistence.js';

const tc = { id: '3+2', initial: 180, increment: 2 };

describe('persistencia del reloj', () => {
  beforeEach(() => localStorage.clear());

  it('resta el tiempo real transcurrido al mismo bando tras refresh', () => {
    saveClockSnapshot({ gameId: 'g1', timeControlId: '3+2', whiteTime: 120, blackTime: 160, activeColor: 'w', now: 1_000 });
    const restored = restoreClockState('g1', tc, 'w', 11_000);
    expect(restored.whiteTime).toBeCloseTo(110, 3);
    expect(restored.blackTime).toBe(160);
  });

  it('no cobra tiempo fuera si el turno ya cambió en el servidor', () => {
    saveClockSnapshot({ gameId: 'g1', timeControlId: '3+2', whiteTime: 120, blackTime: 160, activeColor: 'b', now: 1_000 });
    const restored = restoreClockState('g1', tc, 'w', 51_000);
    expect(restored.whiteTime).toBe(120);
    expect(restored.blackTime).toBe(160);
  });

  it('detecta bandera durante el refresh', () => {
    saveClockSnapshot({ gameId: 'g1', timeControlId: '3+2', whiteTime: 3, blackTime: 160, activeColor: 'w', now: 1_000 });
    expect(restoreClockState('g1', tc, 'w', 6_000).flagFallen).toBe('w');
  });

  it('ignora snapshots de otro control y se puede limpiar', () => {
    saveClockSnapshot({ gameId: 'g1', timeControlId: '5+0', whiteTime: 100, blackTime: 100, activeColor: 'w', now: 1_000 });
    expect(restoreClockState('g1', tc, 'w', 2_000).restored).toBe(false);
    clearClockSnapshot('g1');
    expect(loadClockSnapshot('g1')).toBeNull();
  });

  it('limpia todos los snapshots dinámicos al cambiar de identidad', () => {
    saveClockSnapshot({ gameId: 'alice-1', timeControlId: '3+2', whiteTime: 120, blackTime: 160, activeColor: 'w', now: 1_000 });
    saveClockSnapshot({ gameId: 'alice-2', timeControlId: '3+2', whiteTime: 80, blackTime: 90, activeColor: 'b', now: 1_000 });
    localStorage.setItem('otra-clave', 'se conserva');
    expect(clearAllClockSnapshots()).toBe(2);
    expect(loadClockSnapshot('alice-1')).toBeNull();
    expect(loadClockSnapshot('alice-2')).toBeNull();
    expect(localStorage.getItem('otra-clave')).toBe('se conserva');
  });

});
