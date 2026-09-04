import { describe, expect, it } from 'vitest';
import {
  createMatthiasPawn3D,
  disposeMatthiasPawn3D,
  MATTHIAS_PAWN_EMBLEM,
  MATTHIAS_PAWN_FACE_RIG_VERSION,
  MATTHIAS_PAWN_MODEL_VERSION,
  matthiasPawnPoseSample,
} from './MatthiasPawn3D.js';
import { MATTHIAS_HOME_STATES } from './matthiasHomePresenceStateMachine.js';

describe('MatthiasPawn3D', () => {
  it('construye al Matthias peón canónico con emblema de peón, no cruz', () => {
    const rig = createMatthiasPawn3D();
    const names = [];
    rig.root.traverse((node) => names.push(node.name));

    expect(MATTHIAS_PAWN_MODEL_VERSION).toBe('matthias-pawn-v1');
    expect(MATTHIAS_PAWN_FACE_RIG_VERSION).toBe('pawn-face-rig-v1');
    expect(MATTHIAS_PAWN_EMBLEM).toBe('premium-pawn');
    expect(names).toContain('pawn-face');
    expect(names).toContain('officer-cap');
    expect(names).toContain('premium-pawn-emblem');
    expect(names).toContain('pawn-emblem-head');
    expect(names.some((name) => /cross|iron/i.test(name))).toBe(false);

    disposeMatthiasPawn3D(rig);
  });

  it('la FSM produce movimientos visibles de cabeza, mirada, blink y habla', () => {
    const glance = matthiasPawnPoseSample({
      profile: 'idle',
      presenceState: MATTHIAS_HOME_STATES.GLANCE_LEFT,
      time: 1.1,
      stateElapsed: .6,
      stateDurationMs: 1250,
      motionIntensity: 1.12,
    });
    const skeptical = matthiasPawnPoseSample({
      profile: 'think',
      presenceState: MATTHIAS_HOME_STATES.SKEPTICAL,
      time: 1.1,
      stateElapsed: .8,
      stateDurationMs: 1850,
      motionIntensity: 1.12,
    });
    const speech = matthiasPawnPoseSample({
      profile: 'speak',
      presenceState: MATTHIAS_HOME_STATES.ATTEND,
      time: 1.1,
      speaking: true,
      motionIntensity: 1.12,
    });

    expect(Math.abs(glance.headYaw)).toBeGreaterThan(.12);
    expect(Math.abs(glance.gazeX)).toBeGreaterThan(.01);
    expect(skeptical.smirk).toBeGreaterThan(.2);
    expect(Math.abs(skeptical.headRoll)).toBeGreaterThan(.02);
    expect(speech.mouthOpen).toBeGreaterThan(.2);
    expect(speech.energy).toBeGreaterThan(.5);
  });

  it('mantiene actividad ambiente aun fuera de un gesto de FSM', () => {
    const read = matthiasPawnPoseSample({ profile: 'read', time: 2.3 });
    const sip = matthiasPawnPoseSample({ profile: 'sip', time: 2.3 });
    expect(read.energy).toBeGreaterThan(.1);
    expect(Math.abs(read.headYaw)).toBeGreaterThan(.01);
    expect(sip.reach).toBeGreaterThan(.1);
  });
});
