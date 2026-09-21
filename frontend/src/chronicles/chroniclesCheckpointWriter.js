import { chroniclesCheckpointState } from './chroniclesRunClient.js';
import { chroniclesCheckpointSignature } from './chroniclesRunCheckpoint.js';

export function createChroniclesCheckpointWriter({
  runId,
  worldVersion,
  initialState,
  checkpointState = chroniclesCheckpointState,
  onConflict = null,
  onError = null,
} = {}) {
  if (typeof runId !== 'string' || !runId) throw new Error('Chronicles checkpoint writer requires runId');
  if (!Number.isInteger(worldVersion) || worldVersion < 0) throw new Error('Chronicles checkpoint writer requires worldVersion');

  let version = worldVersion;
  let lastAcknowledgedSignature = chroniclesCheckpointSignature(initialState);
  let pendingState = null;
  let running = false;
  let disposed = false;
  let controller = null;

  async function flush() {
    if (disposed || running || !pendingState) return;

    const candidate = pendingState;
    pendingState = null;
    const signature = chroniclesCheckpointSignature(candidate);
    if (signature === lastAcknowledgedSignature) {
      if (pendingState) void flush();
      return;
    }

    running = true;
    controller = new AbortController();
    let continueQueue = true;
    try {
      const saved = await checkpointState(runId, candidate, version, { signal: controller.signal });
      if (disposed) return;
      if (!Number.isInteger(saved?.worldVersion) || saved.worldVersion <= version) {
        throw new Error('Chronicles checkpoint returned a non-monotonic worldVersion');
      }
      version = saved.worldVersion;
      lastAcknowledgedSignature = signature;
    } catch (error) {
      if (disposed || error?.name === 'AbortError') return;
      continueQueue = false;
      if (error?.status === 409) {
        pendingState = null;
        onConflict?.(error);
      } else {
        pendingState = pendingState || candidate;
        onError?.(error);
      }
    } finally {
      running = false;
      controller = null;
      if (!disposed && continueQueue && pendingState) void flush();
    }
  }

  return Object.freeze({
    offer(state) {
      if (disposed) return false;
      const signature = chroniclesCheckpointSignature(state);
      if (signature === lastAcknowledgedSignature && !pendingState) return false;
      pendingState = state;
      if (!running) void flush();
      return true;
    },
    dispose() {
      disposed = true;
      pendingState = null;
      controller?.abort();
      controller = null;
    },
    worldVersion() {
      return version;
    },
  });
}
