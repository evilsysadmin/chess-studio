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
  [/Idempotency-Key/.test(read('frontend/src/api.js')), 'frontend game mutations must support Idempotency-Key'],
  [/Idempotency-Key/.test(read('backend-python/main.py')), 'backend CORS must allow the frontend Idempotency-Key header'],
  [/operationLedger/.test(read('backend-python/operation_idempotency_core.py')), 'backend move/undo must persist bounded operation ledger'],
  [/operation_idempotency_core/.test(read('scripts/idempotency_smoke.py')) && !/from operation_idempotency import/.test(read('scripts/idempotency_smoke.py')), 'idempotency smoke must remain dependency-free and import the core policy directly'],
  [/create_game_once/.test(read('backend-python/game_api.py')) && /DuplicateKeyError/.test(read('backend-python/game_store.py')), 'game creation must be atomic/idempotent under concurrent retries'],
  [/import uuid/.test(read('backend-python/game_api.py')) && /uuid\.uuid4\(/.test(read('backend-python/game_api.py')), 'non-idempotent game creation must keep its uuid dependency wired'],
  [/reset_resilience_state/.test(read('backend-python/conftest.py')) && /reset_http_metrics/.test(read('backend-python/conftest.py')), 'backend tests must isolate process-global resilience and HTTP pressure between cases'],
  [!/^def test_.*idempot.*\(client\):/m.test(read('backend-python/test_main.py')), 'backend idempotency integration tests must use the suite client instead of a missing fixture'],
  [/activeGame/.test(read('scripts/state_ownership_contract.json')), 'durable state domains must declare an authority'],
  [/golden journey/.test(read('e2e/smoke.spec.js')), 'release smoke must include a golden end-to-end journey'],
  [/gameCreateCommitThenFailures/.test(read('e2e/helpers.js')) && /moveCommitThenFailures/.test(read('e2e/helpers.js')), 'E2E must inject response-loss-after-commit failures for create and move'],
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

let state = 'setup';
const events = Object.values(combat.COMBAT_FLOW_EVENT);
let seed = 0xC0FFEE;
for (let i = 0; i < 10_000; i += 1) {
  seed = (1664525 * seed + 1013904223) >>> 0;
  const result = combat.combatFlowTransition(state, events[seed % events.length]);
  if (result.ok) state = result.nextState;
  must(['setup', 'battle', 'over'].includes(state), `generated Combat state escaped domain: ${state}`);
}


const mainPy = read('backend-python/main.py');
const matthiasDailyApi = read('backend-python/matthias_daily_api.py');
must(mainPy.includes('build_matthias_daily_router(auth_dependency=get_current_user, admin_dependency=require_admin, is_admin_check=is_admin)'), 'Matthias daily must receive admin policy from main');
must(matthiasDailyApi.includes('admin_unlimited = _is_admin(username)'), 'Matthias daily admin bypass must remain explicit and server-side');

console.log('state-resilience-check OK · machines + runtime invariants + ownership + idempotency + fault injection + golden journey');
