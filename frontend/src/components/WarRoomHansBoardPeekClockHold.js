import { hansBoardPeekHoldsMovement } from './WarRoomHansFireCallContract.js';

export const WAR_ROOM_HANS_BOARD_PEEK_CLOCK_HOLD_VERSION = 'board-peek-clock-hold-v1';

const DRIVER_NAME = 'war-room-hans-fireplace-driver';

export function installWarRoomHansBoardPeekClockHold(root) {
  if (!root) return 0;
  const driver = root.getObjectByName?.(DRIVER_NAME);
  if (!driver || typeof driver.onBeforeRender !== 'function') return 0;
  if (driver.userData?.warRoomHansBoardPeekClockHold === WAR_ROOM_HANS_BOARD_PEEK_CLOCK_HOLD_VERSION) return 0;

  const original = driver.onBeforeRender;
  let canvas = null;

  driver.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
    canvas ||= globalThis.document?.querySelector?.('.game-board-stack-3d .board3d-main-canvas') || null;
    const narrativePhase = canvas?.dataset?.warRoomHansNarrativePhase || '';
    const hold = hansBoardPeekHoldsMovement(narrativePhase);
    driver.userData.warRoomHansBoardPeekClockHeld = hold;
    driver.userData.warRoomHansBoardPeekNarrativePhase = narrativePhase;
    if (hold) return;
    original(renderer, scene, camera, geometry, material, group);
  };

  driver.userData.warRoomHansBoardPeekClockHold = WAR_ROOM_HANS_BOARD_PEEK_CLOCK_HOLD_VERSION;
  return 1;
}
