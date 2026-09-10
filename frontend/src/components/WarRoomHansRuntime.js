export const WAR_ROOM_HANS_RUNTIME_VERSION = 'war-room-hans-runtime-v1-single-task-owner';

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
