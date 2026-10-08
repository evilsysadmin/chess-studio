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

function timingNowMs() {
  try {
    const now = globalThis?.performance?.now?.();
    if (Number.isFinite(now)) return now;
  } catch {
    // Diagnostics must never affect scene construction.
  }
  return Date.now();
}

function elapsedMs(startedAt) {
  return Math.max(0, timingNowMs() - startedAt);
}

function measureInstall(durations, key, install) {
  const startedAt = timingNowMs();
  try {
    return install();
  } finally {
    durations[key] = elapsedMs(startedAt);
  }
}

// Blender War Rooms deliberately do not host v1-only service infrastructure:
// plant, mop/service routes, ambient chores or canonical plant locking. Keeping
// this installer separate prevents those modules (and the v1 deferred finalizer
// itself) from riding along whenever v2/v3/v4 stage Hans.
export const WAR_ROOM_HANS_BLENDER_POST_INSTALL_STEPS = Object.freeze([
  'hans:canonical-butler',
  'hans:board-peek-clock-hold',
  'hans:animator',
  'hans:actor-telemetry',
  'hans:elder-clock',
  'hans:fire-narrative',
  'hans:matthias-reaction',
  'hans:matthias-idle-glances',
  'hans:task-visual-guard',
  'hans:armor-polish-guard',
  'hans:grounding',
  'hans:visible-ground-lock',
]);

export function runWarRoomHansBlenderPostInstall(root, { durations = {} } = {}) {
  const step = (key, install) => measureInstall(durations, key, install);
  step('hans:canonical-butler', () => installWarRoomHansCanonicalButler(root));
  step('hans:board-peek-clock-hold', () => installWarRoomHansBoardPeekClockHold(root));
  step('hans:animator', () => installWarRoomHansAnimator(root));
  step('hans:actor-telemetry', () => installWarRoomHansActorTelemetry(root));
  step('hans:elder-clock', () => installWarRoomHansElderClock(root));
  step('hans:fire-narrative', () => installWarRoomHansFireNarrative(root));
  step('hans:matthias-reaction', () => installWarRoomMatthiasHansReaction(root));
  step('hans:matthias-idle-glances', () => installWarRoomMatthiasIdleGlances(root));
  step('hans:task-visual-guard', () => installWarRoomHansTaskVisualGuard(root));
  step('hans:armor-polish-guard', () => installWarRoomHansArmorPolishGuard(root));
  step('hans:grounding', () => installWarRoomHansGrounding(root));
  step('hans:visible-ground-lock', () => installWarRoomHansVisibleGroundLock(root));
  return durations;
}
