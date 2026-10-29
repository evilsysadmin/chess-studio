import { createHomeBlenderGpuTimer } from './HomeBlenderPerformanceDiagnostics.js';
import { createWarRoomRenderCostJournal } from './WarRoomRenderCostJournal.js';
import { installWarRoomShadowPassProbe } from './WarRoomShadowPassProbe.js';

// This flag is intentionally not a normal preference. A local benchmark can
// opt in using its init-script localStorage seed; a human can use a URL query.
// Ordinary game sessions must not issue GPU timer queries or update DOM stats.
export const WAR_ROOM_GPU_PROFILE_STORAGE_KEY = 'war-room-gpu-profile';
export const WAR_ROOM_GPU_PROFILE_QUERY_KEY = 'warRoomGpuProfile';

// Only one opt-in profiler may own a Three renderer at a time. Double
// installation would stack shadow wrappers and overwrite the canvas journal.
const activeGpuProfiles = new WeakSet();

export function warRoomGpuProfileRequested({
  search = '',
  storageFlag = '',
} = {}) {
  return new URLSearchParams(search).get(WAR_ROOM_GPU_PROFILE_QUERY_KEY) === '1'
    || storageFlag === '1';
}

// All GPU timestamps refer to the *actual existing* Three.js WebGL2 context.
// No hidden canvas, gl.finish(), synchronous readback, periodic background
// polling, or GPU query in normal play. Values are updated only after a
// completed asynchronous timer query, and a disjoint invalidates lastMs.
export function createWarRoomGpuProfile(renderer, {
  search = globalThis.location?.search || '',
  storageFlag = null,
  softwareRenderer = false,
  sampleEvery = 8,
} = {}) {
  let optInStorageFlag = storageFlag;
  if (optInStorageFlag === null && !new URLSearchParams(search).has(WAR_ROOM_GPU_PROFILE_QUERY_KEY)) {
    try {
      optInStorageFlag = globalThis.localStorage?.getItem(WAR_ROOM_GPU_PROFILE_STORAGE_KEY);
    } catch {
      // StorageSecurityError must never prevent normal 3D play.
    }
  }
  if (!warRoomGpuProfileRequested({ search, storageFlag: optInStorageFlag })) return null;
  const canvas = renderer?.domElement;
  if (!canvas?.dataset || activeGpuProfiles.has(renderer)) return null;

  let gl = null;
  try {
    if (renderer?.capabilities?.isWebGL2) gl = renderer.getContext?.();
  } catch {
    // Unsupported/lost WebGL2 is a diagnostic, not a gameplay failure.
  }
  const timer = createHomeBlenderGpuTimer(gl, {
    enabled: true,
    software: softwareRenderer,
    sampleEvery,
  });
  const dataset = canvas.dataset;
  const renderCosts = createWarRoomRenderCostJournal();
  const shadowPass = installWarRoomShadowPassProbe(renderer);
  // Local-only, read by the real browser benchmark. No per-frame DOM writes.
  canvas.__warRoomRenderCostJournal = renderCosts;
  dataset.warRoomGpuProfileStatus = timer.status;
  dataset.warRoomGpuProfileSamples = '0';
  delete dataset.warRoomGpuProfileLastMs;
  delete dataset.warRoomGpuProfileLastQueryStartedAtMs;
  let lastSamples = 0;
  let lastStatus = timer.status;
  let disposed = false;
  activeGpuProfiles.add(renderer);
  return {
    // Tag the query at its actual GPU begin, not the later asynchronous
    // publication. This prevents bootstrap/idle renders leaking into move.
    begin: () => {
      shadowPass?.begin();
      timer.begin(globalThis.performance?.now?.() ?? null);
    },
    end: () => timer.end(),
    recordRender(info, startedAtMs, endedAtMs) {
      // Only in benchmark mode: split the completed Three draw census by
      // shadow-depth submissions versus the main render pass.
      const split = shadowPass?.sample(info?.calls);
      renderCosts.record(split ? { ...info, ...split } : info, startedAtMs, endedAtMs);
    },
    poll() {
      // Polling is non-blocking and occurs only after a genuine room render.
      timer.poll();
      if (timer.status !== lastStatus) {
        lastStatus = timer.status;
        dataset.warRoomGpuProfileStatus = lastStatus;
      }
      if (timer.completedSamples !== lastSamples) {
        lastSamples = timer.completedSamples;
        dataset.warRoomGpuProfileSamples = String(lastSamples);
        if (Number.isFinite(timer.lastMs)) {
          dataset.warRoomGpuProfileLastMs = String(Number(timer.lastMs.toFixed(4)));
        }
        if (Number.isFinite(timer.lastCompletedTag)) {
          dataset.warRoomGpuProfileLastQueryStartedAtMs = String(timer.lastCompletedTag);
        } else {
          delete dataset.warRoomGpuProfileLastQueryStartedAtMs;
        }
      } else if (!Number.isFinite(timer.lastMs)) {
        // A disjoint/error must never leave the prior elapsed result visible.
        delete dataset.warRoomGpuProfileLastMs;
        delete dataset.warRoomGpuProfileLastQueryStartedAtMs;
      }
    },
    dispose() {
      // A late second cleanup must not wipe a replacement profiler's
      // journal, status or shadow wrapper after this one has been released.
      if (disposed) return;
      disposed = true;
      shadowPass?.dispose();
      timer.dispose();
      activeGpuProfiles.delete(renderer);
      delete canvas.__warRoomRenderCostJournal;
      delete dataset.warRoomGpuProfileStatus;
      delete dataset.warRoomGpuProfileSamples;
      delete dataset.warRoomGpuProfileLastMs;
      delete dataset.warRoomGpuProfileLastQueryStartedAtMs;
    },
  };
}
