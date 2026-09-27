import {
  exitWarRoomBrowserFullscreen,
  requestWarRoomLandscapeFullscreen,
  shouldAutoRotateWarRoomOnEntry,
  unlockWarRoomOrientation,
} from './components/useWarRoomImmersive.js';

export async function runUserInitiatedWarRoomEntry(start, {
  boardRenderer = '3d',
  shouldAutoRotate = shouldAutoRotateWarRoomOnEntry,
  requestLandscape = requestWarRoomLandscapeFullscreen,
  exitFullscreen = exitWarRoomBrowserFullscreen,
  unlockOrientation = unlockWarRoomOrientation,
} = {}) {
  const autoRotate = boardRenderer === '3d' && shouldAutoRotate();
  if (autoRotate) await requestLandscape();

  const started = await start();
  if (!started && autoRotate) {
    void exitFullscreen();
    unlockOrientation();
  }
  return started;
}
