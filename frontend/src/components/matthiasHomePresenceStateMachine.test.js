import { describe, expect, it } from 'vitest';
import {
  createMatthiasHomePresenceMachine,
  MATTHIAS_HOME_STATES,
  MATTHIAS_HOME_PRESENCE_VERSION,
  matthiasHomeIdleDelay,
  matthiasHomeStateDescriptor,
  matthiasHomeStateDuration,
  nextMatthiasHomeAmbientState,
  transitionMatthiasHomePresence,
} from './matthiasHomePresenceStateMachine.js';

describe('matthiasHomePresenceStateMachine', () => {
  it('mantiene un contrato versionado y arranca quieto', () => {
    expect(MATTHIAS_HOME_PRESENCE_VERSION).toBe('home-presence-v1');
    expect(createMatthiasHomePresenceMachine()).toEqual({
      mode: MATTHIAS_HOME_STATES.IDLE,
      speaking: false,
      lastAmbient: null,
    });
  });

  it('no repite el mismo tic ambiental consecutivamente', () => {
    const previous = MATTHIAS_HOME_STATES.GLANCE_LEFT;
    const next = nextMatthiasHomeAmbientState({ random: () => 0, lastAmbient: previous });
    expect(next).not.toBe(previous);
  });

  it('sesga lectura a inspección/asentimiento y sueño a cabeceo', () => {
    expect(nextMatthiasHomeAmbientState({ random: () => .31, profile: 'read' })).toBe(MATTHIAS_HOME_STATES.SURVEY);
    expect(nextMatthiasHomeAmbientState({ random: () => .52, profile: 'sleep' })).toBe(MATTHIAS_HOME_STATES.NOD);
  });

  it('hablar interrumpe el ambiente y bloquea tics hasta terminar', () => {
    let state = createMatthiasHomePresenceMachine();
    state = transitionMatthiasHomePresence(state, {
      type: 'AMBIENT_START',
      mode: MATTHIAS_HOME_STATES.SKEPTICAL,
    });
    expect(state.mode).toBe(MATTHIAS_HOME_STATES.SKEPTICAL);

    state = transitionMatthiasHomePresence(state, { type: 'SPEECH_START' });
    expect(state.mode).toBe(MATTHIAS_HOME_STATES.ATTEND);
    expect(state.speaking).toBe(true);

    const ignored = transitionMatthiasHomePresence(state, {
      type: 'AMBIENT_START',
      mode: MATTHIAS_HOME_STATES.GLANCE_RIGHT,
    });
    expect(ignored).toBe(state);

    state = transitionMatthiasHomePresence(state, { type: 'SPEECH_END' });
    expect(state.mode).toBe(MATTHIAS_HOME_STATES.IDLE);
    expect(state.speaking).toBe(false);
  });

  it('usa pausas largas e irregulares y gestos breves', () => {
    expect(matthiasHomeIdleDelay(() => 0, 'idle')).toBe(4000);
    expect(matthiasHomeIdleDelay(() => 1, 'idle')).toBe(9000);
    expect(matthiasHomeIdleDelay(() => 0, 'sleep')).toBeGreaterThan(6000);
    expect(matthiasHomeStateDuration(MATTHIAS_HOME_STATES.SURVEY)).toBeGreaterThan(1000);
    expect(matthiasHomeStateDuration(MATTHIAS_HOME_STATES.GLANCE_LEFT)).toBeLessThan(1000);
  });

  it('describe estados como gestos de presencia, no como morphs faciales', () => {
    expect(matthiasHomeStateDescriptor(MATTHIAS_HOME_STATES.LEAN_IN)).toEqual({
      gesture: 'lean-in',
      label: 'Prestando atención',
    });
    expect(matthiasHomeStateDescriptor('wat')).toEqual({ gesture: 'idle', label: 'Vigilando' });
  });
});
