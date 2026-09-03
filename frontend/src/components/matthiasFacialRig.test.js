import { describe, expect, it } from 'vitest';
import {
  MATTHIAS_FACIAL_RIG_VERSION,
  matthiasFacialMotionSample,
  normalizeMatthiasFacialExpression,
  normalizeMatthiasFacialGesture,
} from './matthiasFacialRig.js';

describe('matthiasFacialRig', () => {
  it('expone un contrato v2 y cae a stern/idle para valores desconocidos', () => {
    expect(MATTHIAS_FACIAL_RIG_VERSION).toBe('face-v2');
    expect(normalizeMatthiasFacialExpression('SMIRK')).toBe('smirk');
    expect(normalizeMatthiasFacialExpression('derretido')).toBe('stern');
    expect(normalizeMatthiasFacialGesture('GLARE')).toBe('glare');
    expect(normalizeMatthiasFacialGesture('lean-in')).toBe('lean-in');
    expect(normalizeMatthiasFacialGesture('smirk')).toBe('smirk');
    expect(normalizeMatthiasFacialGesture('nonsense')).toBe('idle');
  });

  it('mantiene estable el núcleo de la cara para no volver a deformar a Matthias', () => {
    const center = matthiasFacialMotionSample({ expression: 'grumble-hot', gesture: 'grumble', x: 0, y: .31, time: 1.4 });
    const outside = matthiasFacialMotionSample({ expression: 'grumble-hot', gesture: 'grumble', x: .72, y: -.5, time: 1.4 });

    expect(Math.abs(center.dx)).toBeLessThan(.0025);
    expect(Math.abs(center.dy)).toBeLessThan(.0025);
    expect(Math.abs(outside.dx)).toBeLessThan(.0005);
    expect(Math.abs(outside.dy)).toBeLessThan(.0005);
  });

  it('hace visible el smirk en una sola comisura sin convertirlo en sonrisa feliz', () => {
    const right = matthiasFacialMotionSample({ expression: 'smirk', gesture: 'smirk', x: .105, y: .175, time: 2.2, intensity: 1.2 });
    const left = matthiasFacialMotionSample({ expression: 'smirk', gesture: 'smirk', x: -.105, y: .175, time: 2.2, intensity: 1.2 });

    expect(right.dy).toBeGreaterThan(.004);
    expect(right.dx).toBeGreaterThan(.002);
    expect(right.dy).toBeGreaterThan(Math.abs(left.dy));
  });

  it('cierra ceño y mandíbula cuando gruñe y endurece el gesto en rabia alta', () => {
    const browWarm = matthiasFacialMotionSample({ expression: 'grumble', gesture: 'grumble', x: .105, y: .475, time: 1.1 });
    const browHot = matthiasFacialMotionSample({ expression: 'grumble-hot', gesture: 'grumble', x: .105, y: .475, time: 1.1 });
    const jawHot = matthiasFacialMotionSample({ expression: 'grumble-hot', gesture: 'grumble', x: 0, y: .095, time: 1.1 });

    expect(browWarm.dy).toBeLessThan(0);
    expect(browHot.dy).toBeLessThan(browWarm.dy);
    expect(jawHot.dy).toBeLessThan(-.002);
  });

  it('mantiene parpadeo y habla irregulares dentro del límite anti-melt', () => {
    const eyeA = matthiasFacialMotionSample({ expression: 'stern', x: .105, y: .395, time: 1.2 });
    const eyeB = matthiasFacialMotionSample({ expression: 'stern', x: .105, y: .395, time: 1.9 });
    const jawA = matthiasFacialMotionSample({ expression: 'stern', gesture: 'speaking', x: 0, y: .095, time: 1.23, speaking: true });
    const jawB = matthiasFacialMotionSample({ expression: 'stern', gesture: 'speaking', x: 0, y: .095, time: 1.57, speaking: true });

    expect(Math.abs(eyeA.dy)).toBeLessThanOrEqual(.019);
    expect(Math.abs(eyeB.dy)).toBeLessThanOrEqual(.019);
    expect(jawA.energy).toBeGreaterThan(.1);
    expect(jawB.energy).toBeGreaterThan(.1);
    expect(Math.abs(jawA.dy)).toBeLessThanOrEqual(.019);
    expect(Math.abs(jawB.dy)).toBeLessThanOrEqual(.019);
    expect(jawA.dy).not.toBe(jawB.dy);
  });

  it('hace que los ojos lideren los giros y que glare/lean-in no se degraden a idle', () => {
    const rightEye = matthiasFacialMotionSample({ expression: 'alert', gesture: 'head-right', x: .105, y: .395, time: 1 });
    const rightCheek = matthiasFacialMotionSample({ expression: 'alert', gesture: 'head-right', x: .18, y: .245, time: 1 });
    const glareEye = matthiasFacialMotionSample({ expression: 'glare', gesture: 'glare', x: .105, y: .395, time: 1 });
    const glareIdleEye = matthiasFacialMotionSample({ expression: 'glare', gesture: 'idle', x: .105, y: .395, time: 1 });
    const leanEye = matthiasFacialMotionSample({ expression: 'focus', gesture: 'lean-in', x: .105, y: .395, time: 1 });
    const leanIdleEye = matthiasFacialMotionSample({ expression: 'focus', gesture: 'idle', x: .105, y: .395, time: 1 });

    expect(rightEye.dx).toBeGreaterThan(0);
    expect(Math.abs(rightEye.dx)).toBeGreaterThan(Math.abs(rightCheek.dx));
    expect(glareEye.dx).not.toBe(glareIdleEye.dx);
    expect(leanEye.dz).toBeGreaterThan(leanIdleEye.dz);
  });
});
