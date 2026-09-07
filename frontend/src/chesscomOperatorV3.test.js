import { describe, expect, it } from 'vitest';
import { CHESSCOM_OPERATOR_V3, chesscomOperatorV3Profile } from './chesscomOperatorV3.js';

describe('Chesscom operator v3 visual contract', () => {
  it('retires the mech identity for Matthias', () => {
    const profile = chesscomOperatorV3Profile('matthias', true);
    expect(profile.identity).toBe('matthias-field-operative-v3');
    expect(profile.identity).not.toContain('exosuit');
  });

  it('gives Dieter and Sven distinct mercenary silhouettes', () => {
    const dieter = chesscomOperatorV3Profile('dieter', true);
    const sven = chesscomOperatorV3Profile('sven', true);
    expect(dieter.identity).toBe('rifleman-operator-v3');
    expect(sven.identity).toBe('scout-operator-v3');
    expect(dieter.accent).not.toBe(sven.accent);
    expect(dieter.compact).toBe(false);
    expect(sven.compact).toBe(true);
  });

  it('uses a more top-down tactical camera to keep the deployment readable', () => {
    expect(CHESSCOM_OPERATOR_V3.cameraBeta).toBeLessThan(1.03);
    expect(CHESSCOM_OPERATOR_V3.cameraTargetZ).toBeGreaterThan(0);
  });
});
