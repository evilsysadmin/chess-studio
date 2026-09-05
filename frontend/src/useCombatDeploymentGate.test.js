import { describe, expect, it } from 'vitest';
import { deploymentStartDecision } from './useCombatDeploymentGate.js';

describe('Combat deployment gate', () => {
  it('bajas o confirmación pendiente mantienen al jugador en Mesa de Guerra', () => {
    expect(deploymentStartDecision({ deadCount: 1, requireConfirmation: true, confirmed: true, ready: true })).toBe('open');
    expect(deploymentStartDecision({ deadCount: 0, requireConfirmation: true, confirmed: false, ready: true })).toBe('confirm');
  });

  it('una confirmación vieja no permite arrancar una formación ya inválida', () => {
    expect(deploymentStartDecision({ deadCount: 0, requireConfirmation: true, confirmed: true, ready: false })).toBe('invalid');
    expect(deploymentStartDecision({ deadCount: 0, requireConfirmation: true, confirmed: true, ready: true })).toBe('start');
  });

  it('una formación distinta exige reconfirmar aunque siga cubriendo los 16 puestos', () => {
    expect(deploymentStartDecision({
      deadCount: 0,
      requireConfirmation: true,
      confirmed: true,
      ready: true,
      confirmationMatches: false,
    })).toBe('invalid');
  });
});
