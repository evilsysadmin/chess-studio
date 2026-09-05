import {
  HANS_FIREPLACE_START_DELAY_S,
  hansFireplaceFrame,
  installWarRoomHansFireplaceRoutine,
} from './WarRoomHansFireplace.js';
import {
  ensureWarRoomHansServiceDoor,
  setWarRoomHansServiceDoorOpen,
} from './WarRoomHansServiceDoor.js';

const QUICK_ITERATION_VERSION = 'always-quick-v4-door';
const QUICK_ENTRY_SECONDS = 5;
const QUICK_VISIBLE_START_X = 2.65;
const QUICK_BASKET_X = 1.95;
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

function smoothstep01(value) {
  const t = Math.max(0, Math.min(1, Number(value) || 0));
  return t * t * (3 - 2 * t);
}

// Visual-iteration mode intentionally makes Hans impossible to miss: he is
// already visible at his service-door threshold on the first useful scene
// frame and walks toward the basket while the fireplace performs its five-
// second dim. The door closes behind him, then reopens for his exit.
export function hansQuickIterationFrame(elapsedSeconds) {
  const elapsed = Math.max(0, Number(elapsedSeconds) || 0);
  if (elapsed < QUICK_ENTRY_SECONDS) {
    const dimFrame = hansFireplaceFrame(elapsed + HANS_FIREPLACE_START_DELAY_S);
    const walkFrame = hansFireplaceFrame(
      elapsed + HANS_FIREPLACE_START_DELAY_S + QUICK_ENTRY_SECONDS,
    );
    const eased = smoothstep01(elapsed / QUICK_ENTRY_SECONDS);
    const closeDoor = smoothstep01(Math.max(0, (elapsed - 2.4) / 2.6));
    return {
      ...walkFrame,
      phase: 'fire-dimming',
      fireScale: dimFrame.fireScale,
      hansVisible: true,
      hansX: QUICK_VISIBLE_START_X + (QUICK_BASKET_X - QUICK_VISIBLE_START_X) * eased,
      stride: Math.sin(elapsed * 5.8) * 0.3,
      doorOpen: 1 - closeDoor,
    };
  }

  const frame = hansFireplaceFrame(
    elapsed + HANS_FIREPLACE_START_DELAY_S + QUICK_ENTRY_SECONDS,
  );
  if (frame.complete) return { ...frame, doorOpen: 0 };
  if (frame.phase === 'leave') {
    const doorOpen = smoothstep01((frame.hansX - 1.85) / (QUICK_VISIBLE_START_X - 1.85));
    return {
      ...frame,
      doorOpen,
      // Once his centre crosses the inner threshold, let the dark doorway sell
      // the rest of the exit instead of rendering Hans through solid masonry.
      hansVisible: frame.hansVisible && frame.hansX < QUICK_VISIBLE_START_X + 0.02,
    };
  }
  return { ...frame, doorOpen: 0 };
}

function applyQuickIterationFrame(refs, frame, towardBoard) {
  const {
    fireplace, hans, fireCore, fireLight, fireCoreBaseScale,
    fireLightBaseIntensity, fireLightBaseDistance,
    basketTopLog, addedLog, standPoker, side, doorRefs,
  } = refs;

  if (basketTopLog) basketTopLog.visible = !frame.removeBasketLog;
  if (addedLog) addedLog.visible = frame.showAddedLog;
  setWarRoomHansServiceDoorOpen(doorRefs, frame.doorOpen ?? 0);

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
    setWarRoomHansServiceDoorOpen(doorRefs, 0);
  }
}

function armQuickIteration(root, towardBoard, doorRefs) {
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
    doorRefs,
  };

  fireplace.userData.warRoomHansEventSelected = true;
  fireplace.userData.warRoomHansQuickIteration = QUICK_ITERATION_VERSION;
  fireplace.userData.warRoomHansHearthRestored = false;
  driver.userData.warRoomHansSelected = true;
  driver.userData.warRoomHansQuickIteration = QUICK_ITERATION_VERSION;
  driver.userData.warRoomHansStartDelaySeconds = 0;
  driver.userData.warRoomHansPhase = 'fire-dimming';
  driver.userData.warRoomHansHearthRestored = false;
  driver.userData.warRoomHansUsesServiceDoor = true;

  const initialFrame = hansQuickIterationFrame(0);
  applyQuickIterationFrame(refs, initialFrame, towardBoard);
  driver.userData.warRoomHansVisibleAtStart = hans.visible === true;

  driver.onBeforeRender = () => {
    const frame = hansQuickIterationFrame((nowMs() - startedAt) / 1000);
    applyQuickIterationFrame(refs, frame, towardBoard);
    driver.userData.warRoomHansPhase = frame.phase;
    if (frame.complete) {
      hans.visible = false;
      driver.userData.warRoomHansCompleted = true;
      driver.userData.warRoomHansHearthRestored = true;
      setWarRoomHansServiceDoorOpen(doorRefs, 0);
      driver.onBeforeRender = () => {};
    }
  };
  return 1;
}

function armProductionDoor(driver, hans, doorRefs) {
  if (!driver?.userData?.warRoomHansSelected || typeof driver.onBeforeRender !== 'function') return;
  const original = driver.onBeforeRender;
  driver.userData.warRoomHansUsesServiceDoor = true;
  driver.onBeforeRender = () => {
    original();
    const phase = driver.userData.warRoomHansPhase;
    const opening = phase === 'walk-to-basket' || phase === 'leave';
    setWarRoomHansServiceDoorOpen(doorRefs, opening ? 1 : 0);
    if (phase === 'leave' && hans?.visible && Math.abs(hans.position.x) >= QUICK_VISIBLE_START_X) {
      hans.visible = false;
    }
    if (driver.userData.warRoomHansCompleted || phase === 'complete') {
      setWarRoomHansServiceDoorOpen(doorRefs, 0);
    }
  };
}

export function installWarRoomHansSceneRoutine(root, {
  towardBoard,
  coarsePointer = false,
  randomValue,
} = {}) {
  if (!root || !Number.isFinite(towardBoard)) return 0;
  const forceQuickIteration = quickIterationEnabled;
  // During this explicit visual-iteration window we deliberately build the
  // desktop Hans rig even on touch/coarse-pointer devices so the user can see
  // and judge the choreography. The ordinary mobile path remains simplified
  // because it still passes its real coarsePointer value when not forced.
  const routineCoarsePointer = forceQuickIteration ? false : coarsePointer;
  const options = { towardBoard, coarsePointer: routineCoarsePointer, forceEvent: forceQuickIteration };
  if (Number.isFinite(randomValue)) options.randomValue = randomValue;

  const installed = installWarRoomHansFireplaceRoutine(root, options);
  const fireplace = root.getObjectByName?.('war-room-fireplace');
  const doorRefs = ensureWarRoomHansServiceDoor(root, { fireplace, towardBoard, coarsePointer });
  if (!doorRefs) return installed;

  if (forceQuickIteration) {
    armQuickIteration(root, towardBoard, doorRefs);
    return installed;
  }

  const driver = root.getObjectByName?.('war-room-hans-fireplace-driver');
  const hans = root.getObjectByName?.('war-room-hans-butler');
  armProductionDoor(driver, hans, doorRefs);
  return installed;
}
