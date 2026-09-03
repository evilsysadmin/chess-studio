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
    expect(nextMatthiasAmbientState({ random: () => 0.02, lastAmbient: 'coffee' })).toBe('glance');
    expect(nextMatthiasAmbientState({ random: () => 0.38, lastAmbient: 'head-left' })).toBe('head-right');
  });

  it('hace la presencia más escasa en calma y más vigilante con rabia', () => {
    expect(nextMatthiasAmbientState({ random: () => 0.02, angerLevel: 0 })).toBe('coffee');
    expect(nextMatthiasAmbientState({ random: () => 0.02, angerLevel: 4 })).toBe('glance');
    expect(nextMatthiasAmbientState({ random: () => 0.005, angerLevel: 4 })).toBe('coffee');
    expect(nextMatthiasAmbientState({ random: () => 0.90, angerLevel: 4 })).toBe('glare');
    expect(matthiasWarRoomIdleDelay(() => 0, 0)).toBeGreaterThanOrEqual(4000);
    expect(matthiasWarRoomIdleDelay(() => 0, 4)).toBeLessThan(matthiasWarRoomIdleDelay(() => 0, 0));
  });

  it('expone intención facial real para cada estado importante', () => {
    expect(MATTHIAS_WAR_ROOM_STATE_VERSION).toBe('fsm-v2');
    expect(matthiasWarRoomStateDescriptor('coffee', 0)).toMatchObject({ expression: 'coffee', gesture: 'coffee' });
    expect(matthiasWarRoomStateDescriptor('glare', 0).gesture).toBe('glare');
    expect(matthiasWarRoomStateDescriptor('lean-in', 0).gesture).toBe('lean-in');
    expect(matthiasWarRoomStateDescriptor('smirk', 0)).toMatchObject({ expression: 'smirk', gesture: 'smirk' });
    expect(matthiasWarRoomStateDescriptor('grumble', 4)).toMatchObject({ expression: 'grumble-hot', gesture: 'grumble' });
    expect(matthiasWarRoomStateDescriptor('speaking', 0).gesture).toBe('speaking');
    expect(matthiasWarRoomStateDescriptor('idle', 4).expression).toBe('simmer');
    expect(matthiasWarRoomStateDuration('grumble', 4)).toBeGreaterThan(matthiasWarRoomStateDuration('grumble', 0));
    expect(normalizeWarRoomAnger(99)).toBe(4);
  });
});
