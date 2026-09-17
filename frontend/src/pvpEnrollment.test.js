import { beforeEach, describe, expect, it } from 'vitest';
import { clearPvpEnrollment, loadPvpEnrollment, savePvpEnrollment } from './pvpEnrollment.js';

beforeEach(() => {
  sessionStorage.clear();
});

describe('PvP enrollment session', () => {
  it('persiste el enrolamiento sólo para la identidad que lo activó', () => {
    expect(loadPvpEnrollment('alice')).toBe(false);
    expect(savePvpEnrollment('alice', true)).toBe(true);
    expect(loadPvpEnrollment('alice')).toBe(true);
    expect(loadPvpEnrollment('bob')).toBe(false);
  });

  it('se puede limpiar explícitamente al salir de sesión', () => {
    savePvpEnrollment('alice', true);
    clearPvpEnrollment();
    expect(loadPvpEnrollment('alice')).toBe(false);
  });
});
