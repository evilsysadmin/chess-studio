import {
  exitWarRoomBrowserFullscreen,
  requestWarRoomLandscapeFullscreen,
  shouldAutoRotateWarRoomOnEntry,
  unlockWarRoomOrientation,
} from './components/useWarRoomImmersive.js';

export async function runUserInitiatedWarRoomEntry(start, { boardRenderer = '3d' } = {}) {
  const autoRotate = boardRenderer === '3d' && shouldAutoRotateWarRoomOnEntry();
  if (autoRotate) await requestWarRoomLandscapeFullscreen();

  const started = await start();
  if (!started && autoRotate) {
    void exitWarRoomBrowserFullscreen();
    unlockWarRoomOrientation();
  }
  return started;
}
