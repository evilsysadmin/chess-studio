import { describe, expect, it } from 'vitest';
import { ACTIVE_SESSION_EVENT, ACTIVE_SESSION_STATE, activeSessionTransition, assertActiveSessionInvariant } from './activeSessionMachine.js';
import { COMBAT_FLOW_EVENT, combatFlowTransition } from './combatFlowMachine.js';
import { campaignPhaseTransition } from './campaignStateMachine.js';
import { puzzleTransition } from './puzzleStateMachine.js';

function deterministicSequence(seed, count, values) {
  let x = seed >>> 0;
  return Array.from({ length: count }, () => {
    x = (1664525 * x + 1013904223) >>> 0;
    return values[x % values.length];
  });
}

describe('explicit state machines', () => {
  it('active-session restore has no silent impossible jump', () => {
    let state = ACTIVE_SESSION_STATE.IDLE;
    state = activeSessionTransition(state, ACTIVE_SESSION_EVENT.RESTORE).nextState;
    state = activeSessionTransition(state, ACTIVE_SESSION_EVENT.TRANSIENT_FAILURE).nextState;
    state = activeSessionTransition(state, ACTIVE_SESSION_EVENT.RESTORE).nextState;
    state = activeSessionTransition(state, ACTIVE_SESSION_EVENT.RESTORED).nextState;
    expect(state).toBe(ACTIVE_SESSION_STATE.ACTIVE);
    expect(() => assertActiveSessionInvariant({ state, gameId: 'g-1', route: 'game' })).not.toThrow();
  });

  it('a create abortado vuelve a idle y permite un reintento limpio', () => {
    let state = activeSessionTransition(ACTIVE_SESSION_STATE.IDLE, ACTIVE_SESSION_EVENT.CREATE).nextState;
    expect(state).toBe(ACTIVE_SESSION_STATE.CREATING);
    state = activeSessionTransition(state, ACTIVE_SESSION_EVENT.CANCEL_CREATE).nextState;
    expect(state).toBe(ACTIVE_SESSION_STATE.IDLE);
    expect(activeSessionTransition(state, ACTIVE_SESSION_EVENT.CREATE).ok).toBe(true);
  });

  it('combat cannot jump battle -> setup without explicit reset from over', () => {
    expect(combatFlowTransition('battle', COMBAT_FLOW_EVENT.RESET).ok).toBe(false);
    expect(combatFlowTransition('battle', COMBAT_FLOW_EVENT.FINISH).nextState).toBe('over');
    expect(combatFlowTransition('over', COMBAT_FLOW_EVENT.RESET).nextState).toBe('setup');
  });

  it('campaign declares the full happy path instead of implicit flags', () => {
    expect(campaignPhaseTransition('idle', 'start').nextState).toBe('map');
    expect(campaignPhaseTransition('map', 'select_battle').nextState).toBe('briefing');
    expect(campaignPhaseTransition('briefing', 'prepare').nextState).toBe('battle');
    expect(campaignPhaseTransition('battle', 'fight').nextState).toBe('fighting');
    expect(campaignPhaseTransition('fighting', 'win').nextState).toBe('reward');
    expect(campaignPhaseTransition('reward', 'reward').nextState).toBe('map');
  });

  it('puzzle opponent reply is an explicit state', () => {
    expect(puzzleTransition('loading', 'ready').nextState).toBe('solving');
    expect(puzzleTransition('solving', 'correct_continue').nextState).toBe('opponent_reply');
    expect(puzzleTransition('opponent_reply', 'replied').nextState).toBe('solving');
  });

  it('10k generated combat events never manufacture an unknown state', () => {
    let state = 'setup';
    const events = deterministicSequence(0xC0FFEE, 10_000, Object.values(COMBAT_FLOW_EVENT));
    for (const event of events) {
      const result = combatFlowTransition(state, event);
      if (result.ok) state = result.nextState;
      expect(['setup', 'battle', 'over']).toContain(state);
    }
  });
});
