export const WAR_ROOM_DEFERRED_FINALIZER_VERSION = 'deferred-finalizer-v1';

const FINALIZER_STATES = new WeakMap();

function sceneRoot(object) {
  let current = object;
  while (current?.parent) current = current.parent;
  return current;
}

function finalizerDriver(group) {
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

function attachFinalizerDriver(driver, owner) {
  const previous = driver.onBeforeRender;
  const state = {
    owner,
    tasks: new Map(),
    completed: false,
    runCount: 0,
  };
  FINALIZER_STATES.set(driver, state);

  driver.userData.warRoomDeferredFinalizer = WAR_ROOM_DEFERRED_FINALIZER_VERSION;
  driver.onBeforeRender = (...args) => {
    previous?.(...args);

    const current = FINALIZER_STATES.get(driver);
    if (!current || current.completed) return;

    const root = sceneRoot(driver) || current.owner;
    const completedKeys = [];
    const results = {};

    for (const [key, task] of current.tasks) {
      results[key] = task(root);
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
} = {}) {
  if (!group || coarsePointer || typeof key !== 'string' || !key || typeof run !== 'function') return 0;

  const driver = finalizerDriver(group);
  if (!driver) return 0;

  const state = FINALIZER_STATES.get(driver) || attachFinalizerDriver(driver, group);
  if (state.completed || state.tasks.has(key)) return 0;

  state.tasks.set(key, run);
  markOwner(group, state);
  driver.userData.warRoomDeferredFinalizerTaskCount = state.tasks.size;
  return 1;
}
