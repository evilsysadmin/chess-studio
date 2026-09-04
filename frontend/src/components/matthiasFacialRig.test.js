import { describe, expect, it } from 'vitest';
import {
  MATTHIAS_FACIAL_RIG_VERSION,
  matthiasFacialMotionSample,
  normalizeMatthiasFacialExpression,
  normalizeMatthiasFacialGesture,
} from './matthiasFacialRig.js';

describe('matthiasFacialRig', () => {
  it('mantiene face-v1 compartido y aísla los gestos específicos de War Room', () => {
    expect(MATTHIAS_FACIAL_RIG_VERSION).toBe('face-v1');
    expect(normalizeMatthiasFacialExpression('SMIRK')).toBe('smirk');
    expect(normalizeMatthiasFacialExpression('derretido')).toBe('stern');
    expect(normalizeMatthiasFacialGesture('head-right')).toBe('head-right');
    expect(normalizeMatthiasFacialGesture('WAR-GLARE')).toBe('war-glare');
    expect(normalizeMatthiasFacialGesture('war-lean-in')).toBe('war-lean-in');
    expect(normalizeMatthiasFacialGesture('war-smirk')).toBe('war-smirk');
    expect(normalizeMatthiasFacialGesture('glare')).toBe('idle');
    expect(normalizeMatthiasFacialGesture('nonsense')).toBe('idle');
  });

  it('mantiene estable el núcleo de la cara para no volver a deformar a Matthias', () => {
    const center = matthiasFacialMotionSample({ expression: 'grumble-hot', gesture: 'war-grumble', x: 0, y: .31, time: 1.4 });
    const outside = matthiasFacialMotionSample({ expression: 'grumble-hot', gesture: 'war-grumble', x: .72, y: -.5, time: 1.4 });

    expect(Math.abs(center.dx)).toBeLessThan(.0025);
    expect(Math.abs(center.dy)).toBeLessThan(.0025);
    expect(Math.abs(outside.dx)).toBeLessThan(.0005);
    expect(Math.abs(outside.dy)).toBeLessThan(.0005);
  });

  it('hace visible el smirk en una sola comisura sin convertirlo en sonrisa feliz', () => {
    const right = matthiasFacialMotionSample({ expression: 'smirk', gesture: 'war-smirk', x: .105, y: .175, time: 2.2, intensity: 1.2 });
    const left = matthiasFacialMotionSample({ expression: 'smirk', gesture: 'war-smirk', x: -.105, y: .175, time: 2.2, intensity: 1.2 });

    expect(right.dy).toBeGreaterThan(.004);
    expect(right.dx).toBeGreaterThan(.002);
    expect(right.dy).toBeGreaterThan(Math.abs(left.dy));
  });

  it('cierra ceño y mandíbula cuando gruñe y endurece el gesto en rabia alta', () => {
    const browWarm = matthiasFacialMotionSample({ expression: 'grumble', gesture: 'war-grumble', x: .105, y: .475, time: 1.1 });
    const browHot = matthiasFacialMotionSample({ expression: 'grumble-hot', gesture: 'war-grumble', x: .105, y: .475, time: 1.1 });
    const jawHot = matthiasFacialMotionSample({ expression: 'grumble-hot', gesture: 'war-grumble', x: 0, y: .095, time: 1.1 });

    expect(browWarm.dy).toBeLessThan(0);
    expect(browHot.dy).toBeLessThan(browWarm.dy);
    expect(jawHot.dy).toBeLessThan(-.002);
  });

  it('da al habla de War Room una cadencia menos periódica sin romper los límites', () => {
    const eyeA = matthiasFacialMotionSample({ expression: 'stern', gesture: 'war-idle', x: .105, y: .395, time: 1.2 });
    const eyeB = matthiasFacialMotionSample({ expression: 'stern', gesture: 'war-idle', x: .105, y: .395, time: 1.9 });
    const jawA = matthiasFacialMotionSample({ expression: 'stern', gesture: 'war-speaking', x: 0, y: .095, time: 1.23, speaking: true });
    const jawB = matthiasFacialMotionSample({ expression: 'stern', gesture: 'war-speaking', x: 0, y: .095, time: 1.57, speaking: true });

    expect(Math.abs(eyeA.dy)).toBeLessThanOrEqual(.019);
    expect(Math.abs(eyeB.dy)).toBeLessThanOrEqual(.019);
    expect(jawA.energy).toBeGreaterThan(.1);
    expect(jawB.energy).toBeGreaterThan(.1);
    expect(Math.abs(jawA.dy)).toBeLessThanOrEqual(.019);
    expect(Math.abs(jawB.dy)).toBeLessThanOrEqual(.019);
    expect(jawA.dy).not.toBe(jawB.dy);
  });

  it('hace que los ojos lideren los giros y que glare/lean-in tengan intención propia', () => {
    const rightEye = matthiasFacialMotionSample({ expression: 'alert', gesture: 'war-head-right', x: .105, y: .395, time: 1 });
    const rightCheek = matthiasFacialMotionSample({ expression: 'alert', gesture: 'war-head-right', x: .18, y: .245, time: 1 });
    const glareEye = matthiasFacialMotionSample({ expression: 'glare', gesture: 'war-glare', x: .105, y: .395, time: 1 });
    const glareIdleEye = matthiasFacialMotionSample({ expression: 'glare', gesture: 'war-idle', x: .105, y: .395, time: 1 });
    const leanEye = matthiasFacialMotionSample({ expression: 'focus', gesture: 'war-lean-in', x: .105, y: .395, time: 1 });
    const leanIdleEye = matthiasFacialMotionSample({ expression: 'focus', gesture: 'war-idle', x: .105, y: .395, time: 1 });

    expect(rightEye.dx).toBeGreaterThan(0);
    expect(Math.abs(rightEye.dx)).toBeGreaterThan(Math.abs(rightCheek.dx));
    expect(glareEye.dx).not.toBe(glareIdleEye.dx);
    expect(leanEye.dz).toBeGreaterThan(leanIdleEye.dz);
  });
});
