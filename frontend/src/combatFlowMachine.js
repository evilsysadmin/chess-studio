import { transition } from './stateTransition.js';

export const COMBAT_FLOW_STATE = Object.freeze({ SETUP: 'setup', BATTLE: 'battle', OVER: 'over' });
export const COMBAT_FLOW_EVENT = Object.freeze({ START: 'start', FINISH: 'finish', RETIRE: 'retire', RESET: 'reset', RESTORE: 'restore' });

const T = Object.freeze({
  setup: { start: 'battle', restore: 'battle' },
  battle: { finish: 'over', retire: 'over', restore: 'battle' },
  over: { reset: 'setup', start: 'battle', restore: 'battle' },
});

export function combatFlowTransition(state, event) { return transition(T, state, event); }

