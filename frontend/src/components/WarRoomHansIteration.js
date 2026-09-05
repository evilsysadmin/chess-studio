import {
  HANS_FIREPLACE_START_DELAY_S,
  hansFireplaceFrame,
  installWarRoomHansFireplaceRoutine,
} from './WarRoomHansFireplace.js';

const QUICK_ITERATION_VERSION = 'always-quick-v2';
let quickIterationEnabled = false;

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function resolveLightBaseIntensity(light, fallback = 1) {
  const declared = Number(light?.userData?.baseWarRoomIntensity);
  if (Number.isFinite(declared) && declared > 0) return declared;
  const current = Number(light?.intensity);
  if (Number.isFinite(current) && current > 0) return current;
  return fallback;
}

function resolveBounceBaseIntensity(bounce) {
  const cached = Number(bounce?.userData?.hansBaseIntensity);
  if (Number.isFinite(cached) && cached > 0) return cached;
  const base = resolveLightBaseIntensity(bounce, 1.15);
  if (bounce?.userData) bounce.userData.hansBaseIntensity = base;
  return base;
}

export function shouldForceHansQuickIteration({ hintMode = 'off', memoryContext = {} } = {}) {
  if (hintMode !== 'off') return false;
  if (memoryContext?.suddenDeath) return false;
  if (memoryContext?.rescue) return false;
  if (memoryContext?.lab) return false;
  if (memoryContext?.runMode) return false;
  if (memoryContext?.ghost) return false;
  if (memoryContext?.nemesis) return false;
  return true;
}

export function setWarRoomHansQuickIterationEnabled(enabled) {
  quickIterationEnabled = enabled === true;
  return quickIterationEnabled;
}

export function isWarRoomHansQuickIterationEnabled() {
  return quickIterationEnabled;
}

// The production Hans choreography already has a 12s calm lead-in. During
// visual iteration we deliberately skip only that lead-in, so the existing
// five-second progressive fade starts immediately and the rest of the routine
// stays byte-for-byte equivalent in timing/poses.
export function hansQuickIterationFrame(elapsedSeconds) {
  return hansFireplaceFrame((Number(elapsedSeconds) || 0) + HANS_FIREPLACE_START_DELAY_S);
}

function applyQuickIterationFrame(refs, frame, towardBoard) {
  const {
    fireplace, hans, fireCore, fireLight, fireCoreBaseScale,
    fireLightBaseIntensity, fireLightBaseDistance,
    basketTopLog, addedLog, standPoker, side,
  } = refs;

  if (basketTopLog) basketTopLog.visible = !frame.removeBasketLog;
  if (addedLog) addedLog.visible = frame.showAddedLog;

  hans.visible = frame.hansVisible;
  if (frame.hansVisible) {
    hans.position.x = side * frame.hansX;
    hans.position.y = -0.34;
    hans.position.z = towardBoard * 1.16;
    hans.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    const body = hans.userData.refs;
    body.leftLeg.rotation.x = frame.stride;
    body.rightLeg.rotation.x = -frame.stride;
    body.leftArm.rotation.x = frame.leftArm - frame.stride * 0.55;
    body.rightArm.rotation.x = frame.rightArm + frame.stride * 0.35;
    body.torso.rotation.x = towardBoard * frame.lean * 0.35;
    body.head.rotation.x = towardBoard * (frame.headNod - frame.lean * 0.12);
    body.carriedLog.visible = frame.carryLog;
    body.carriedPoker.visible = frame.carryPoker;
    body.carriedPoker.rotation.z = frame.stoke * 0.22;
  }
  if (standPoker) standPoker.visible = !frame.carryPoker;

  if (frame.active) {
    const widthScale = 0.74 + frame.fireScale * 0.26;
    fireCore.scale.set(
      fireCoreBaseScale.x * widthScale,
      fireCoreBaseScale.y * frame.fireScale,
      fireCoreBaseScale.z * widthScale,
    );
    const lightScale = 0.22 + frame.fireScale * 0.78;
    fireLight.intensity = fireLightBaseIntensity * lightScale;
    fireLight.distance = fireLightBaseDistance * (0.6 + frame.fireScale * 0.4);

    const bounce = fireplace.getObjectByName?.('war-room-fire-bounce-light');
    if (bounce) {
      const bounceBaseIntensity = resolveBounceBaseIntensity(bounce);
      bounce.intensity = bounceBaseIntensity * (0.18 + frame.fireScale * 0.82);
    }
  }

  if (frame.complete) {
    fireCore.scale.copy(fireCoreBaseScale);
    fireLight.intensity = fireLightBaseIntensity;
    fireLight.distance = fireLightBaseDistance;
    const bounce = fireplace.getObjectByName?.('war-room-fire-bounce-light');
    if (bounce) bounce.intensity = resolveBounceBaseIntensity(bounce);
    fireplace.userData.warRoomHansHearthRestored = true;
  }
}

function armQuickIteration(root, towardBoard) {
  const fireplace = root?.getObjectByName?.('war-room-fireplace');
  const hans = root?.getObjectByName?.('war-room-hans-butler');
  const driver = root?.getObjectByName?.('war-room-hans-fireplace-driver');
  const fireCore = fireplace?.getObjectByName?.('war-room-fire-core');
  const fireLight = fireplace?.getObjectByName?.('war-room-fire-light');
  if (!fireplace || !hans || !driver || !fireCore || !fireLight) return 0;

  const startedAt = nowMs();
  const refs = {
    fireplace,
    hans,
    fireCore,
    fireLight,
    fireCoreBaseScale: fireCore.scale.clone(),
    fireLightBaseIntensity: resolveLightBaseIntensity(fireLight, 1),
    fireLightBaseDistance: Number(fireLight.distance || 8.8),
    basketTopLog: fireplace.getObjectByName?.('war-room-hearth-basket-top-log'),
    addedLog: fireplace.getObjectByName?.('war-room-hans-hearth-added-log'),
    standPoker: fireplace.getObjectByName?.('war-room-hearth-poker'),
    side: Math.sign(fireplace.position.x || -1) || -1,
  };

  fireplace.userData.warRoomHansEventSelected = true;
  fireplace.userData.warRoomHansQuickIteration = QUICK_ITERATION_VERSION;
  fireplace.userData.warRoomHansHearthRestored = false;
  driver.userData.warRoomHansSelected = true;
  driver.userData.warRoomHansQuickIteration = QUICK_ITERATION_VERSION;
  driver.userData.warRoomHansStartDelaySeconds = 0;
  driver.userData.warRoomHansPhase = 'fire-dimming';
  driver.userData.warRoomHansHearthRestored = false;

  driver.onBeforeRender = () => {
    const frame = hansQuickIterationFrame((nowMs() - startedAt) / 1000);
    applyQuickIterationFrame(refs, frame, towardBoard);
    driver.userData.warRoomHansPhase = frame.phase;
    if (frame.complete) {
      hans.visible = false;
      driver.userData.warRoomHansCompleted = true;
      driver.userData.warRoomHansHearthRestored = true;
      driver.onBeforeRender = () => {};
    }
  };
  return 1;
}

export function installWarRoomHansSceneRoutine(root, {
  towardBoard,
  coarsePointer = false,
  randomValue,
} = {}) {
  if (!root || !Number.isFinite(towardBoard)) return 0;
  const forceQuickIteration = quickIterationEnabled && !coarsePointer;
  const options = { towardBoard, coarsePointer, forceEvent: forceQuickIteration };
  if (Number.isFinite(randomValue)) options.randomValue = randomValue;

  const installed = installWarRoomHansFireplaceRoutine(root, options);
  if (!forceQuickIteration) return installed;

  armQuickIteration(root, towardBoard);
  return installed;
}
