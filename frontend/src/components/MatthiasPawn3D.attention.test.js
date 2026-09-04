import { describe, expect, it } from 'vitest';
import { matthiasPawnPoseSample } from './MatthiasPawn3D.js';
import { MATTHIAS_HOME_STATES } from './matthiasHomePresenceStateMachine.js';

describe('Matthias Home attention contract', () => {
  it('permanece girado hacia sus rutinas en lugar de mirar al jugador', () => {
    for (const profile of ['read', 'dossier', 'write', 'think', 'sip', 'bite']) {
      const pose = matthiasPawnPoseSample({
        profile,
        presenceState: MATTHIAS_HOME_STATES.IDLE,
        time: 2.3,
      });
      expect(Math.abs(pose.headYaw), profile).toBeGreaterThan(.18);
      expect(Math.abs(pose.bodyYaw), profile).toBeGreaterThan(.05);
    }
  });

  it('un gesto ambiental no le arranca de la tarea para mirar de frente', () => {
    const glance = matthiasPawnPoseSample({
      profile: 'read',
      presenceState: MATTHIAS_HOME_STATES.GLANCE_LEFT,
      time: 2.3,
      stateElapsed: .625,
      stateDurationMs: 1250,
    });
    const survey = matthiasPawnPoseSample({
      profile: 'write',
      presenceState: MATTHIAS_HOME_STATES.SURVEY,
      time: 2.3,
      stateElapsed: .95,
      stateDurationMs: 1900,
    });

    expect(Math.abs(glance.headYaw)).toBeGreaterThan(.18);
    expect(Math.abs(survey.headYaw)).toBeGreaterThan(.18);
  });

  it('reserva la frontalidad para ATTEND o habla deliberada', () => {
    const speech = matthiasPawnPoseSample({
      profile: 'speak',
      presenceState: MATTHIAS_HOME_STATES.ATTEND,
      time: 2.3,
      speaking: true,
    });

    expect(Math.abs(speech.headYaw)).toBeLessThan(.03);
    expect(Math.abs(speech.bodyYaw)).toBeLessThan(.02);
    expect(speech.mouthOpen).toBeGreaterThan(.2);
  });
});
