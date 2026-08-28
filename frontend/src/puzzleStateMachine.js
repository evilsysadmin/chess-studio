import { strictInvariant, transition } from './stateTransition.js';

export const PUZZLE_STATE = Object.freeze({ LOADING: 'loading', SOLVING: 'solving', OPPONENT_REPLY: 'opponent_reply', SOLVED: 'solved', FAILED: 'failed' });
const T = Object.freeze({
  loading: { ready: 'solving', load_error: 'failed' },
  solving: { correct_continue: 'opponent_reply', correct_done: 'solved', wrong: 'solving', load_error: 'failed', reveal: 'failed', reset: 'solving', next: 'loading' },
  opponent_reply: { replied: 'solving', mate: 'solved', reply_error: 'failed' },
  solved: { next: 'loading', reset: 'solving' },
  failed: { retry: 'solving', next: 'loading' },
});
export function puzzleTransition(state, event) { return transition(T, state, event); }
export function assertPuzzleInvariant({ state, index = 0, solutionLength = 0 } = {}) {
  strictInvariant(Object.values(PUZZLE_STATE).includes(state), `unknown puzzle state ${state}`);
  strictInvariant(Number(index) >= 0, 'puzzle index cannot be negative');
  strictInvariant(Number(solutionLength) >= 0, 'solution length cannot be negative');
  if (state === PUZZLE_STATE.SOLVED) strictInvariant(index >= solutionLength || solutionLength === 0, 'solved puzzle cannot have pending solution plies');
  return true;
}
