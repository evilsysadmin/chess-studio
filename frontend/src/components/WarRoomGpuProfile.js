import { createHomeBlenderGpuTimer } from './HomeBlenderPerformanceDiagnostics.js';

// This flag is intentionally not a normal preference. A local benchmark can
// opt in using its init-script localStorage seed; a human can use a URL query.
// Ordinary game sessions must not issue GPU timer queries or update DOM stats.
export const WAR_ROOM_GPU_PROFILE_STORAGE_KEY = 'war-room-gpu-profile';
export const WAR_ROOM_GPU_PROFILE_QUERY_KEY = 'warRoomGpuProfile';

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
  if (!canvas?.dataset) return null;

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
  dataset.warRoomGpuProfileStatus = timer.status;
  dataset.warRoomGpuProfileSamples = '0';
  delete dataset.warRoomGpuProfileLastMs;
  let lastSamples = 0;
  let lastStatus = timer.status;
  return {
    begin: () => timer.begin(),
    end: () => timer.end(),
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
      } else if (!Number.isFinite(timer.lastMs)) {
        // A disjoint/error must never leave the prior elapsed result visible.
        delete dataset.warRoomGpuProfileLastMs;
      }
    },
    dispose() {
      timer.dispose();
      delete dataset.warRoomGpuProfileStatus;
      delete dataset.warRoomGpuProfileSamples;
      delete dataset.warRoomGpuProfileLastMs;
    },
  };
}
