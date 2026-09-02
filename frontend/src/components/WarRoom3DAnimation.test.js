import { describe, expect, it } from 'vitest';
import { warRoomAmbientFramePlan } from './WarRoom3DAnimation.js';

describe('War Room ambient render cadence', () => {
  it('mantiene fuego autónomo a ~12 FPS en desktop sin inspección ni input', () => {
    expect(warRoomAmbientFramePlan({ elapsedMs: 82, inspectMode: false }).shouldRender).toBe(false);
    const plan = warRoomAmbientFramePlan({ elapsedMs: 83, inspectMode: false });
    expect(plan.active).toBe(true);
    expect(plan.intervalMs).toBe(83);
    expect(plan.shouldRender).toBe(true);
    expect(plan.updateCamera).toBe(false);
  });

  it('sube a ~60 FPS sólo para mover la cámara en inspección', () => {
    const plan = warRoomAmbientFramePlan({ elapsedMs: 16, inspectMode: true });
    expect(plan.intervalMs).toBe(16);
    expect(plan.shouldRender).toBe(true);
    expect(plan.updateCamera).toBe(true);
  });

  it('no fuerza repaint ambiental en móvil, pestaña oculta o reduced motion', () => {
    for (const options of [
      { elapsedMs: 1000, coarsePointer: true },
      { elapsedMs: 1000, documentHidden: true },
      { elapsedMs: 1000, reducedMotion: true },
    ]) {
      expect(warRoomAmbientFramePlan(options).shouldRender).toBe(false);
    }
  });
});
