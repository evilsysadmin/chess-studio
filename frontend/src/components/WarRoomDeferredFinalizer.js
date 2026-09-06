import { installWarRoomHansMotionPolish } from './WarRoomHansMotionPolishV2.js';

export const WAR_ROOM_DEFERRED_FINALIZER_VERSION = 'deferred-finalizer-v1';
export const WAR_ROOM_ONE_SHOT_RETIREMENT_VERSION = 'one-shot-retirement-v1';

const BEFORE_FINALIZER_STATES = new WeakMap();
const AFTER_FINALIZER_STATES = new WeakMap();
const NOOP_RENDER_HOOK = () => {};
const HANS_FIREPLACE_FINALIZER_KEY = 'hans-fireplace-scene-install-v2';

function sceneRoot(object) {
  let current = object;
  while (current?.parent) current = current.parent;
  return current;
}

function finalizerDriver(group, key) {
  // Hans must be armed by an object that is guaranteed to render in the live
  // War Room. A painting canvas can legitimately be culled, replaced or have
  // its one-shot hook retired by later museum passes. The castle floor slab is
  // architectural and visible in every desktop War Room, so use it only for
  // this critical character bridge while keeping the established driver order
  // for every other deferred static pass.
  if (key === HANS_FIREPLACE_FINALIZER_KEY) {
    return group?.getObjectByName?.('war-room-castle-floor-slab')
      || group?.getObjectByName?.('war-room-castle-wall-left')
      || group?.getObjectByName?.('war-room-premium-painting-canvas')
      || null;
  }

  return group?.getObjectByName?.('war-room-premium-painting-canvas')
    || group?.getObjectByName?.('war-room-castle-wall-left')
    || group?.getObjectByName?.('war-room-castle-floor-slab')
    || null;
}

function markOwner(owner, state) {
  if (!owner?.userData) return;
  owner.userData.warRoomDeferredFinalizer = WAR_ROOM_DEFERRED_FINALIZER_VERSION;
  owner.userData.warRoomDeferredFinalizerTaskCount = state.tasks.size;
}

function attachFinalizerDriver(driver, owner, phase = 'before') {
  const after = phase === 'after';
  const stateMap = after ? AFTER_FINALIZER_STATES : BEFORE_FINALIZER_STATES;
  const hookName = after ? 'onAfterRender' : 'onBeforeRender';
  const previous = driver[hookName];
  const state = {
    owner,
    tasks: new Map(),
    completed: false,
    runCount: 0,
    phase,
  };
  stateMap.set(driver, state);

  driver.userData.warRoomDeferredFinalizer = WAR_ROOM_DEFERRED_FINALIZER_VERSION;
  driver.userData.warRoomDeferredFinalizerPhase = phase;
  driver[hookName] = (...args) => {
    previous?.(...args);

    const current = stateMap.get(driver);
    if (!current || current.completed) return;

    const root = sceneRoot(driver) || current.owner;
    const completedKeys = [];
    const results = {};

    for (const [key, task] of current.tasks) {
      results[key] = task(root);
      if (key === HANS_FIREPLACE_FINALIZER_KEY) installWarRoomHansMotionPolish(root);
      completedKeys.push(key);
    }

    current.completed = true;
    current.runCount += 1;

    if (root?.userData) {
      root.userData.warRoomDeferredFinalizer = WAR_ROOM_DEFERRED_FINALIZER_VERSION;
      root.userData.warRoomDeferredFinalizerRuns = current.runCount;
      root.userData.warRoomDeferredFinalizedTasks = completedKeys;
      root.userData.warRoomDeferredFinalizerResults = results;
    }
    driver.userData.warRoomDeferredFinalizerCompleted = true;
    driver.userData.warRoomDeferredFinalizerTaskCount = completedKeys.length;
  };

  return state;
}

export function registerWarRoomDeferredFinalizer(group, {
  key,
  run,
  coarsePointer = false,
  allowCoarse = false,
} = {}) {
  if (!group || (coarsePointer && !allowCoarse) || typeof key !== 'string' || !key || typeof run !== 'function') return 0;

  const driver = finalizerDriver(group, key);
  if (!driver) return 0;

  // The castle architecture owns floor.onBeforeRender and replaces it later in
  // construction. Hans therefore uses the otherwise-unowned onAfterRender hook
  // of that architectural slab. It still runs on the first rendered frame, but
  // cannot be silently disconnected by the castle scene driver.
  const phase = key === HANS_FIREPLACE_FINALIZER_KEY ? 'after' : 'before';
  const stateMap = phase === 'after' ? AFTER_FINALIZER_STATES : BEFORE_FINALIZER_STATES;
  const state = stateMap.get(driver) || attachFinalizerDriver(driver, group, phase);
  if (state.completed || state.tasks.has(key)) return 0;

  state.tasks.set(key, run);
  markOwner(group, state);
  driver.userData.warRoomDeferredFinalizerTaskCount = state.tasks.size;
  return 1;
}

export function armWarRoomOneShotHookRetirement(group, {
  anchorName,
  key,
  coarsePointer = false,
} = {}) {
  if (!group || coarsePointer || typeof anchorName !== 'string' || !anchorName || typeof key !== 'string' || !key) return 0;
  const driver = group.getObjectByName?.(anchorName);
  if (!driver || typeof driver.onBeforeRender !== 'function') return 0;

  const marker = driver.userData.warRoomOneShotRetirement;
  if (marker?.key === key) return 0;
  const previous = driver.onBeforeRender;
  let completed = false;
  driver.userData.warRoomOneShotRetirement = {
    version: WAR_ROOM_ONE_SHOT_RETIREMENT_VERSION,
    key,
  };

  driver[hookName = 'onBeforeRender'];
  driver.onBeforeRender = (...args) => {
    if (completed) return;
    previous?.(...args);
    completed = true;
    driver.userData.warRoomOneShotRetirementCompleted = key;
    // Assign through the live object, not through a saved hook reference. This
    // deliberately retires any static wrapper that may have been attached
    // around this one after registration but before the first frame.
    driver.onBeforeRender = NOOP_RENDER_HOOK;
  };

  if (!group.userData) group.userData = {};
  group.userData.warRoomOneShotRetirementVersion = WAR_ROOM_ONE_SHOT_RETIREMENT_VERSION;
  return 1;
}
