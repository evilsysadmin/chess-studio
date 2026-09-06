export const WAR_ROOM_HANS_ELDER_CLOCK_VERSION = 'elder-cruise-clock-v1';
export const WAR_ROOM_HANS_ELDER_CRUISE_SPEED = 0.46;

const HANS_NAME = 'war-room-hans-butler';
const DRIVER_NAME = 'war-room-hans-fireplace-driver';
const STALL_CATCH_UP_SECONDS = 1;
const MIN_CLOCK_RATE = 0.06;
const CLOCK_RATE_RISE_PER_FRAME = 1.06;
const SPEED_EPSILON_SQ = 1e-8;

function quickRateCeiling(phase, route) {
  if (route === 'entry') return 0.43;
  if (route === 'leave-side') return 0.225;
  if (route === 'leave-bypass') return 0.32;
  if (route === 'leave-door') return 0.49;

  switch (phase) {
    case 'walk-to-basket': return 0.43;
    case 'carry-log': return 0.58;
    case 'take-poker': return 0.30;
    case 'stoke-fire': return 0.39;
    case 'return-poker': return 0.26;
    case 'leave': return 0.225;
    default: return 0.43;
  }
}

export function warRoomHansClockRateCeiling({ phase = '', route = '', quick = true } = {}) {
  const ceiling = quickRateCeiling(String(phase || ''), String(route || ''));
  // The forced quick choreography already runs its own 0.54x presentation clock.
  // The ambient/production routine does not, so give it the matching governor
  // multiplier instead of letting the same physical path run ~1.85x faster.
  return quick ? ceiling : ceiling * 0.54;
}

function hansIsWalking(hans, driver) {
  const motion = String(hans?.userData?.warRoomHansMotionState || '');
  if (motion) return motion.startsWith('walk');

  const route = String(hans?.userData?.warRoomHansRoute || '');
  if (route === 'entry' || route.startsWith('leave-')) return true;

  const phase = String(driver?.userData?.warRoomHansPhase || '');
  return phase === 'walk-to-basket'
    || phase === 'carry-log'
    || phase === 'take-poker'
    || phase === 'stoke-fire'
    || phase === 'return-poker'
    || phase === 'leave';
}

function clockCeiling(hans, driver) {
  return warRoomHansClockRateCeiling({
    phase: driver?.userData?.warRoomHansPhase,
    route: hans?.userData?.warRoomHansRoute,
    quick: Boolean(driver?.userData?.warRoomHansQuickIteration),
  });
}

function canScopePerformanceNow(performanceObject, syntheticNowFn) {
  if (!performanceObject || typeof performanceObject.now !== 'function') return false;
  const original = performanceObject.now;
  try {
    performanceObject.now = syntheticNowFn;
    return performanceObject.now === syntheticNowFn;
  } catch {
    return false;
  } finally {
    try { performanceObject.now = original; } catch { /* no-op fallback below */ }
  }
}

export function installWarRoomHansElderClock(root) {
  if (!root) return 0;
  const hans = root.getObjectByName?.(HANS_NAME);
  const driver = root.getObjectByName?.(DRIVER_NAME);
  if (!hans || !driver || typeof driver.onBeforeRender !== 'function') return 0;
  if (driver.userData?.warRoomHansElderClock === WAR_ROOM_HANS_ELDER_CLOCK_VERSION) return 0;

  const performanceObject = globalThis?.performance;
  if (!performanceObject || typeof performanceObject.now !== 'function') return 0;
  const realNow = performanceObject.now.bind(performanceObject);
  const original = driver.onBeforeRender;

  let syntheticNow = realNow();
  let previousRealNow = syntheticNow;
  let previousX = Number(hans.position?.x || 0);
  let previousZ = Number(hans.position?.z || 0);
  let clockRate = 1;
  const syntheticNowFn = () => syntheticNow;

  if (!canScopePerformanceNow(performanceObject, syntheticNowFn)) return 0;

  driver.userData.warRoomHansElderClock = WAR_ROOM_HANS_ELDER_CLOCK_VERSION;
  driver.userData.warRoomHansCruiseSpeed = WAR_ROOM_HANS_ELDER_CRUISE_SPEED;
  driver.userData.warRoomHansClockPolicy = 'single-elder-cruise-v1';
  driver.userData.warRoomHansClockPatch = 'scoped-performance-now-v1';
  driver.userData.warRoomHansClockStallPolicy = 'catch-up-without-speed-sample-v1';

  driver.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
    const realFrameNow = realNow();
    const realDeltaSeconds = Math.max(0, (realFrameNow - previousRealNow) / 1000);
    const stalled = realDeltaSeconds > STALL_CATCH_UP_SECONDS;
    previousRealNow = realFrameNow;

    const preWalking = hansIsWalking(hans, driver);
    if (preWalking) clockRate = Math.min(clockRate, clockCeiling(hans, driver));
    else clockRate = 1;

    // Normal rendered motion is governed. A long render gap is not a walking
    // sample at all: catch the choreography clock up by the elapsed wall time so
    // a suspended tab/test does not leave Hans frozen several phases behind.
    // The jump is deliberately excluded from the speed feedback below.
    syntheticNow += realDeltaSeconds * 1000 * (stalled ? 1 : clockRate);

    const savedNow = performanceObject.now;
    let patched = false;
    try {
      performanceObject.now = syntheticNowFn;
      patched = performanceObject.now === syntheticNowFn;
      original(renderer, scene, camera, geometry, material, group);
    } finally {
      if (patched) {
        try { performanceObject.now = savedNow; } catch { /* best-effort restoration */ }
      }
    }

    const x = Number(hans.position?.x || 0);
    const z = Number(hans.position?.z || 0);
    const dx = x - previousX;
    const dz = z - previousZ;
    const distanceSq = dx * dx + dz * dz;
    const postWalking = hansIsWalking(hans, driver);

    if (!stalled && postWalking && realDeltaSeconds > 1e-6 && distanceSq > SPEED_EPSILON_SQ) {
      const measuredSpeed = Math.sqrt(distanceSq) / realDeltaSeconds;
      const ceiling = clockCeiling(hans, driver);
      const desiredRate = Math.max(
        MIN_CLOCK_RATE,
        Math.min(ceiling, clockRate * (WAR_ROOM_HANS_ELDER_CRUISE_SPEED / measuredSpeed)),
      );

      // Slow down immediately if Hans gets lively. Speeding up is deliberately
      // gradual: an elderly butler may take a moment to settle into his cruise,
      // but never gets a mid-corridor turbo boost.
      if (measuredSpeed > WAR_ROOM_HANS_ELDER_CRUISE_SPEED) {
        clockRate = desiredRate * 0.995;
      } else {
        clockRate = Math.min(desiredRate, clockRate * CLOCK_RATE_RISE_PER_FRAME);
      }
    } else if (!postWalking) {
      clockRate = 1;
    }

    previousX = x;
    previousZ = z;
  };

  return 1;
}
