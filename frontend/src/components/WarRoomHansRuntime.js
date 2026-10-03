export const WAR_ROOM_HANS_RUNTIME_VERSION = 'war-room-hans-runtime-v2-bounded-setup-retry';
export const WAR_ROOM_HANS_SETUP_RETRY_DELAY_MS = 1800;
export const WAR_ROOM_HANS_SETUP_MAX_ATTEMPTS = 3;

const RUNTIMES = new WeakMap();

function normalizeTask(task, defaults = {}) {
  const descriptor = typeof task === 'string' ? { id: task } : (task || {});
  const id = String(descriptor.id || '').trim();
  if (!id) return null;
  return {
    id,
    kind: String(descriptor.kind || defaults.kind || 'task'),
    source: String(descriptor.source || defaults.source || 'runtime'),
    payload: descriptor.payload ?? null,
  };
}

function markRuntime(runtime) {
  const { actor } = runtime;
  // `warRoomHansRuntime` is an existing public visibility diagnostic
  // (visible/hidden/missing). Keep the task runtime on its own namespace.
  if (actor?.root?.userData) actor.root.userData.warRoomHansTaskRuntime = WAR_ROOM_HANS_RUNTIME_VERSION;
  if (actor?.hans?.userData) actor.hans.userData.warRoomHansTaskRuntime = WAR_ROOM_HANS_RUNTIME_VERSION;
  if (actor?.driver?.userData) actor.driver.userData.warRoomHansTaskRuntime = WAR_ROOM_HANS_RUNTIME_VERSION;
}

function markTask(runtime) {
  const taskId = runtime.task?.id || '';
  const taskKind = runtime.task?.kind || '';
  const { actor } = runtime;
  for (const target of [actor?.hans, actor?.driver]) {
    if (!target?.userData) continue;
    target.userData.warRoomHansActiveTask = taskId;
    target.userData.warRoomHansActiveTaskKind = taskKind;
    // Transitional diagnostic alias while legacy routine clients migrate.
    target.userData.warRoomHansActiveRoutine = taskId;
  }
}

export function getWarRoomHansRuntime(actor) {
  if (!actor?.root || !actor?.hans || !actor?.driver) return null;
  const cached = RUNTIMES.get(actor.root);
  if (cached?.actor === actor) return cached;

  const runtime = {
    version: WAR_ROOM_HANS_RUNTIME_VERSION,
    actor,
    task: null,
    phase: 'idle',
  };
  RUNTIMES.set(actor.root, runtime);
  markRuntime(runtime);
  markTask(runtime);
  return runtime;
}

export function assignWarRoomHansTask(runtime, task, defaults = {}) {
  if (!runtime) return false;
  const descriptor = normalizeTask(task, defaults);
  if (!descriptor) return false;
  if (runtime.task && runtime.task.id !== descriptor.id) return false;
  if (!runtime.task) runtime.task = descriptor;
  markTask(runtime);
  return true;
}

export function releaseWarRoomHansTask(runtime, task) {
  if (!runtime?.task) return false;
  const descriptor = normalizeTask(task);
  if (!descriptor || descriptor.id !== runtime.task.id) return false;
  runtime.task = null;
  runtime.phase = 'idle';
  markTask(runtime);
  return true;
}

export function warRoomHansTaskAvailable(runtime, task = '') {
  if (!runtime) return false;
  const requested = typeof task === 'string' ? task.trim() : String(task?.id || '').trim();
  return !runtime.task || !requested || runtime.task.id === requested;
}

export function getWarRoomHansActiveTask(runtime) {
  return runtime?.task || null;
}

export function setWarRoomHansTaskPhase(runtime, phase) {
  if (!runtime) return false;
  runtime.phase = String(phase || 'idle');
  const { actor } = runtime;
  if (actor?.hans?.userData) actor.hans.userData.warRoomHansTaskPhase = runtime.phase;
  if (actor?.driver?.userData) actor.driver.userData.warRoomHansTaskPhase = runtime.phase;
  return true;
}

export function setWarRoomHansTaskPresentation(runtime, {
  visible,
  motionState,
  route,
} = {}) {
  const hans = runtime?.actor?.hans;
  if (!hans) return false;

  if (typeof visible === 'boolean') hans.visible = visible;
  if (motionState !== undefined && hans.userData) {
    hans.userData.warRoomHansMotionState = String(motionState || 'idle');
  }
  if (route !== undefined && hans.userData) {
    hans.userData.warRoomHansRoute = String(route || '');
  }
  return true;
}


export function createWarRoomHansSetupRetryState() {
  return { attempts: 0, notBefore: 0 };
}

export function resetWarRoomHansSetupRetry(state) {
  if (!state) return false;
  state.attempts = 0;
  state.notBefore = 0;
  return true;
}

export function warRoomHansSetupRetryReady(state, now) {
  if (!state) return true;
  return Number(now) >= Number(state.notBefore || 0);
}

export function deferWarRoomHansSetupRetry(state, now) {
  if (!state) return false;
  state.attempts = Math.max(0, Number(state.attempts) || 0) + 1;
  if (state.attempts >= WAR_ROOM_HANS_SETUP_MAX_ATTEMPTS) {
    state.notBefore = Number.POSITIVE_INFINITY;
    return false;
  }
  state.notBefore = Number(now || 0) + WAR_ROOM_HANS_SETUP_RETRY_DELAY_MS * state.attempts;
  return true;
}
