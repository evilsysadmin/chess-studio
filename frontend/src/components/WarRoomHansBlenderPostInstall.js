import { installWarRoomHansActorTelemetry } from './WarRoomHansActorTelemetry.js';
import { installWarRoomHansAnimator, installWarRoomHansGrounding } from './WarRoomHansAnimator.js';
import { installWarRoomHansArmorPolishGuard } from './WarRoomHansArmorPolishGuard.js';
import { installWarRoomHansBoardPeekClockHold } from './WarRoomHansBoardPeekClockHold.js';
import { installWarRoomHansCanonicalButler } from './WarRoomHansCanonicalButler.js';
import { installWarRoomHansElderClock } from './WarRoomHansElderClock.js';
import { installWarRoomHansFireNarrative } from './WarRoomHansFireNarrative.js';
import { installWarRoomHansTaskVisualGuard } from './WarRoomHansTaskVisualGuard.js';
import { installWarRoomHansVisibleGroundLock } from './WarRoomHansVisibleGroundLock.js';
import { installWarRoomMatthiasHansReaction } from './WarRoomMatthiasHansReaction.js';
import { installWarRoomMatthiasIdleGlances } from './WarRoomMatthiasIdleGlances.js';

// Blender War Rooms deliberately omit the v1-only plant/service/mop/ambient
// infrastructure. Keeping their installers out of this module means v2/v3/v4
// no longer pay to download/evaluate code that can never run in those rooms.
export function runWarRoomHansBlenderPostInstall(root) {
  installWarRoomHansCanonicalButler(root);
  installWarRoomHansBoardPeekClockHold(root);
  installWarRoomHansAnimator(root);
  installWarRoomHansActorTelemetry(root);
  installWarRoomHansElderClock(root);
  installWarRoomHansFireNarrative(root);
  installWarRoomMatthiasHansReaction(root);
  installWarRoomMatthiasIdleGlances(root);
  installWarRoomHansTaskVisualGuard(root);
  installWarRoomHansArmorPolishGuard(root);
  installWarRoomHansGrounding(root);
  installWarRoomHansVisibleGroundLock(root);
}
