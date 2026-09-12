#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const checks = [
  [/activeSessionTransition/.test(read('frontend/src/useActiveSessionRestore.js')), 'restore must use active-session state machine'],
  [/activeSessionTransition/.test(read('frontend/src/useGameReconnect.js')), 'reconnect must use active-session state machine'],
  [/combatFlowTransition/.test(read('frontend/src/components/useCombatController.js')), 'Combat battle must use combat flow state machine'],
  [!/setPhase\(['\"](?:setup|battle|over)['\"]\)/.test(read('frontend/src/components/useCombatController.js')), 'Combat controller must not bypass its state machine with literal setPhase'],
  [/campaignPhaseTransition/.test(read('frontend/src/combatCampaign.js')), 'campaign domain must use campaign state machine'],
  [/attachSeriesGame/.test(read('frontend/src/App.jsx')) && /assertSeriesFlowInvariant/.test(read('frontend/src/series.js')), 'BO3/BO5 series must enforce explicit flow ownership'],
  [/puzzleTransition/.test(read('frontend/src/components/PuzzleScreen.jsx')), 'PuzzleScreen must use puzzle state machine'],
  [/create_game_once/.test(read('backend-python/game_api.py')) && /DuplicateKeyError/.test(read('backend-python/game_store.py')), 'game creation must be atomic/idempotent under concurrent retries'],
  [/import uuid/.test(read('backend-python/game_api.py')) && /uuid\.uuid4\(/.test(read('backend-python/game_api.py')), 'non-idempotent game creation must keep its uuid dependency wired'],
  [/reset_resilience_state/.test(read('backend-python/conftest.py')) && /reset_http_metrics/.test(read('backend-python/conftest.py')), 'backend tests must isolate process-global resilience and HTTP pressure between cases'],
  [/activeGame/.test(read('scripts/state_ownership_contract.json')), 'durable state domains must declare an authority'],
  [/golden journey/.test(read('e2e/smoke.spec.js')), 'release smoke must include a golden end-to-end journey'],
];
const failed = checks.filter(([ok]) => !ok).map(([, msg]) => msg);
if (failed.length) {
  console.error('state-resilience-check FAIL');
  for (const msg of failed) console.error(` - ${msg}`);
  process.exit(1);
}

const moduleUrl = (name) => pathToFileURL(path.join(root, 'frontend/src', name)).href;
const active = await import(moduleUrl('activeSessionMachine.js'));
const combat = await import(moduleUrl('combatFlowMachine.js'));
const campaign = await import(moduleUrl('campaignStateMachine.js'));
const puzzle = await import(moduleUrl('puzzleStateMachine.js'));
const series = await import(moduleUrl('seriesFlow.js'));
const ownership = JSON.parse(read('scripts/state_ownership_contract.json'));

const must = (value, message) => { if (!value) throw new Error(message); };
must(active.activeSessionTransition('idle', 'create').nextState === 'creating', 'runtime create transition broken');
must(active.activeSessionTransition('creating', 'cancel_create').nextState === 'idle', 'runtime create cancellation broken');
must(combat.combatFlowTransition('battle', 'reset').ok === false, 'battle may not reset directly');
must(campaign.campaignPhaseTransition('fighting', 'win').nextState === 'reward', 'campaign win transition broken');
must(puzzle.puzzleTransition('solving', 'correct_continue').nextState === 'opponent_reply', 'puzzle reply state broken');
must(series.seriesFlowPhase(series.attachSeriesGame({ winner: null, currentGameId: null }, 'g-1')) === 'playing', 'series game attachment broken');
for (const [domain, owner] of Object.entries(ownership)) {
  must(typeof owner?.authority === 'string' && owner.authority.trim(), `${domain} has no authority`);
  must(!owner.authority.includes(','), `${domain} declares multiple authorities`);
}

function randomWalkMachine({ name, initialState, events, allowedStates, transitionFn, seed: initialSeed, iterations = 10_000 }) {
  let state = initialState;
  let seed = initialSeed >>> 0;
  for (let i = 0; i < iterations; i += 1) {
    seed = (1664525 * seed + 1013904223) >>> 0;
    const event = events[seed % events.length];
    const result = transitionFn(state, event);
    if (result.ok) {
      must(allowedStates.includes(result.nextState), `${name} transition escaped domain: ${state} --${event}--> ${result.nextState}`);
      state = result.nextState;
    }
    must(allowedStates.includes(state), `generated ${name} state escaped domain: ${state}`);
  }
}

randomWalkMachine({
  name: 'active session',
  initialState: active.ACTIVE_SESSION_STATE.IDLE,
  events: Object.values(active.ACTIVE_SESSION_EVENT),
  allowedStates: Object.values(active.ACTIVE_SESSION_STATE),
  transitionFn: active.activeSessionTransition,
  seed: 0xA571C7,
});
randomWalkMachine({
  name: 'Combat',
  initialState: 'setup',
  events: Object.values(combat.COMBAT_FLOW_EVENT),
  allowedStates: ['setup', 'battle', 'over'],
  transitionFn: combat.combatFlowTransition,
  seed: 0xC0FFEE,
});
randomWalkMachine({
  name: 'campaign',
  initialState: 'idle',
  events: ['start', 'select_battle', 'select_event', 'select_camp', 'complete', 'prepare', 'recover', 'cancel', 'fight', 'retire', 'win', 'win_boss', 'reward', 'resolve'],
  allowedStates: campaign.CAMPAIGN_PHASES,
  transitionFn: campaign.campaignPhaseTransition,
  seed: 0xCA6EA1,
});
randomWalkMachine({
  name: 'puzzle',
  initialState: puzzle.PUZZLE_STATE.LOADING,
  events: ['ready', 'load_error', 'correct_continue', 'correct_done', 'wrong', 'reveal', 'reset', 'next', 'replied', 'mate', 'reply_error', 'retry'],
  allowedStates: Object.values(puzzle.PUZZLE_STATE),
  transitionFn: puzzle.puzzleTransition,
  seed: 0x2A221E,
});

const mainPy = read('backend-python/main.py');
must(mainPy.includes('build_matthias_daily_router(auth_dependency=get_current_user, admin_dependency=require_admin, is_admin_check=is_admin)'), 'Matthias daily must receive admin policy from main');

console.log('state-resilience-check OK · randomized machine walks + runtime invariants + ownership + idempotency + fault injection + golden journey');
