import {
  getWarRoomHansActor,
  getWarRoomHansNarrativePhase,
} from './WarRoomHansActor.js';
import { hansBoardPeekHoldsMovement } from './WarRoomHansFireCallContract.js';

export const WAR_ROOM_HANS_BOARD_PEEK_CLOCK_HOLD_VERSION = 'board-peek-clock-hold-v2-actor';

export function installWarRoomHansBoardPeekClockHold(root) {
  const actor = getWarRoomHansActor(root);
  const driver = actor?.driver;
  if (!driver || typeof driver.onBeforeRender !== 'function') return 0;
  if (driver.userData?.warRoomHansBoardPeekClockHold === WAR_ROOM_HANS_BOARD_PEEK_CLOCK_HOLD_VERSION) return 0;

  const original = driver.onBeforeRender;
  driver.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
    const narrativePhase = getWarRoomHansNarrativePhase(actor);
    const hold = hansBoardPeekHoldsMovement(narrativePhase);
    driver.userData.warRoomHansBoardPeekClockHeld = hold;
    driver.userData.warRoomHansBoardPeekNarrativePhase = narrativePhase;
    if (hold) return;
    original(renderer, scene, camera, geometry, material, group);
  };

  driver.userData.warRoomHansBoardPeekClockHold = WAR_ROOM_HANS_BOARD_PEEK_CLOCK_HOLD_VERSION;
  return 1;
}