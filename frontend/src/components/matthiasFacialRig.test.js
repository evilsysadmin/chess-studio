import { describe, expect, it } from 'vitest';
import {
  MATTHIAS_FACIAL_RIG_VERSION,
  matthiasFacialMotionSample,
  normalizeMatthiasFacialExpression,
} from './matthiasFacialRig.js';

describe('matthiasFacialRig', () => {
  it('expone un contrato versionado y cae a stern para expresiones desconocidas', () => {
    expect(MATTHIAS_FACIAL_RIG_VERSION).toBe('face-v1');
    expect(normalizeMatthiasFacialExpression('SMIRK')).toBe('smirk');
    expect(normalizeMatthiasFacialExpression('derretido')).toBe('stern');
  });

  it('mantiene estable el núcleo de la cara para no volver a deformar a Matthias', () => {
    const center = matthiasFacialMotionSample({ expression: 'grumble-hot', x: 0, y: .31, time: 1.4 });
    const outside = matthiasFacialMotionSample({ expression: 'grumble-hot', x: .72, y: -.5, time: 1.4 });

    expect(Math.abs(center.dx)).toBeLessThan(.0025);
    expect(Math.abs(center.dy)).toBeLessThan(.0025);
    expect(Math.abs(outside.dx)).toBeLessThan(.0005);
    expect(Math.abs(outside.dy)).toBeLessThan(.0005);
  });

  it('hace visible el smirk en una sola comisura sin convertirlo en una sonrisa feliz', () => {
    const right = matthiasFacialMotionSample({ expression: 'smirk', x: .105, y: .175, time: 2.2, intensity: 1.2 });
    const left = matthiasFacialMotionSample({ expression: 'smirk', x: -.105, y: .175, time: 2.2, intensity: 1.2 });

    expect(right.dy).toBeGreaterThan(.004);
    expect(right.dx).toBeGreaterThan(.002);
    expect(right.dy).toBeGreaterThan(Math.abs(left.dy));
  });

  it('cierra ceño y mandíbula cuando gruñe y endurece el gesto en rabia alta', () => {
    const browWarm = matthiasFacialMotionSample({ expression: 'grumble', x: .105, y: .475, time: 1.1 });
    const browHot = matthiasFacialMotionSample({ expression: 'grumble-hot', x: .105, y: .475, time: 1.1 });
    const jawHot = matthiasFacialMotionSample({ expression: 'grumble-hot', x: 0, y: .095, time: 1.1 });

    expect(browWarm.dy).toBeLessThan(0);
    expect(browHot.dy).toBeLessThan(browWarm.dy);
    expect(jawHot.dy).toBeLessThan(-.002);
  });

  it('añade parpadeo y movimiento mandibular al habla con amplitud acotada', () => {
    const eye = matthiasFacialMotionSample({ expression: 'stern', x: .105, y: .395, time: 4.56 });
    const jaw = matthiasFacialMotionSample({ expression: 'stern', x: 0, y: .095, time: 1.23, speaking: true });

    expect(Math.abs(eye.dy)).toBeLessThanOrEqual(.019);
    expect(jaw.energy).toBeGreaterThan(.1);
    expect(Math.abs(jaw.dy)).toBeLessThanOrEqual(.019);
  });

  it('insinúa mirada lateral moviendo sólo la banda ocular', () => {
    const eye = matthiasFacialMotionSample({ expression: 'alert', gesture: 'head-right', x: .105, y: .395, time: 1 });
    const cheek = matthiasFacialMotionSample({ expression: 'alert', gesture: 'head-right', x: .18, y: .245, time: 1 });

    expect(eye.dx).toBeGreaterThan(0);
    expect(Math.abs(eye.dx)).toBeGreaterThan(Math.abs(cheek.dx));
  });
});
