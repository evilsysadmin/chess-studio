import { describe, expect, it } from 'vitest';
import {
  createMatthiasWarRoomMachine,
  MATTHIAS_WAR_ROOM_STATES,
  MATTHIAS_WAR_ROOM_STATE_VERSION,
  matthiasWarRoomIdleDelay,
  matthiasWarRoomStateDescriptor,
  matthiasWarRoomStateDuration,
  nextMatthiasAmbientState,
  normalizeWarRoomAnger,
  transitionMatthiasWarRoom,
} from './matthiasWarRoomStateMachine.js';

describe('matthiasWarRoomStateMachine', () => {
  it('da prioridad a hablar y a reacciones reales sobre los gestos ambientales', () => {
    let state = createMatthiasWarRoomMachine();
    state = transitionMatthiasWarRoom(state, { type: 'AMBIENT_START', mode: MATTHIAS_WAR_ROOM_STATES.COFFEE });
    expect(state.mode).toBe('coffee');

    state = transitionMatthiasWarRoom(state, { type: 'SPEECH_START' });
    expect(state.mode).toBe('speaking');
    expect(state.speaking).toBe(true);

    state = transitionMatthiasWarRoom(state, { type: 'REACTION_START', reaction: 'disapprove' });
    expect(state.mode).toBe('grumble');
    expect(state.speaking).toBe(true);

    state = transitionMatthiasWarRoom(state, { type: 'REACTION_END', reaction: 'disapprove' });
    expect(state.mode).toBe('speaking');

    state = transitionMatthiasWarRoom(state, { type: 'SPEECH_END' });
    expect(state.mode).toBe('idle');
    expect(state.speaking).toBe(false);
  });

  it('hace smirk al capturar Matthias y no deja que un gesto ambiental lo pise', () => {
    let state = transitionMatthiasWarRoom(createMatthiasWarRoomMachine(), {
      type: 'REACTION_START',
      reaction: 'smirk',
    });

    state = transitionMatthiasWarRoom(state, { type: 'AMBIENT_START', mode: 'glare' });
    expect(state.mode).toBe('smirk');

    state = transitionMatthiasWarRoom(state, { type: 'REACTION_END', reaction: 'smirk' });
    expect(state.mode).toBe('idle');
  });

  it('evita repetir el mismo tic ambiental dos veces seguidas', () => {
    expect(nextMatthiasAmbientState({ random: () => 0.04, lastAmbient: 'coffee' })).toBe('survey');
    expect(nextMatthiasAmbientState({ random: () => 0.46, lastAmbient: 'head-left' })).toBe('head-right');
  });

  it('sube vigilancia con la rabia y reduce el café sin eliminarlo', () => {
    expect(nextMatthiasAmbientState({ random: () => 0.04, angerLevel: 0 })).toBe('coffee');
    expect(nextMatthiasAmbientState({ random: () => 0.04, angerLevel: 4 })).toBe('lean-in');
    expect(nextMatthiasAmbientState({ random: () => 0.01, angerLevel: 4 })).toBe('coffee');
    expect(matthiasWarRoomIdleDelay(() => 0, 4)).toBeLessThan(matthiasWarRoomIdleDelay(() => 0, 0));
  });

  it('da intención visual y corporal a café, smirk, gruñido y rabia', () => {
    expect(MATTHIAS_WAR_ROOM_STATE_VERSION).toBe('fsm-v1');
    expect(matthiasWarRoomStateDescriptor('coffee', 0)).toMatchObject({ expression: 'coffee', activity: 'Café de campaña' });
    expect(matthiasWarRoomStateDescriptor('smirk', 0).expression).toBe('smirk');
    expect(matthiasWarRoomStateDescriptor('grumble', 4).expression).toBe('grumble-hot');
    expect(matthiasWarRoomStateDescriptor('idle', 4).expression).toBe('simmer');
    expect(matthiasWarRoomStateDuration('grumble', 4)).toBeGreaterThan(matthiasWarRoomStateDuration('grumble', 0));
    expect(normalizeWarRoomAnger(99)).toBe(4);
  });
});
