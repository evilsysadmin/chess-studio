import {
  HANS_FIREPLACE_START_DELAY_S,
  hansFireplaceFrame,
  installWarRoomHansFireplaceRoutine,
} from './WarRoomHansFireplace.js';
import {
  ensureWarRoomHansServiceDoor,
  setWarRoomHansServiceDoorOpen,
} from './WarRoomHansServiceDoor.js';

const QUICK_ITERATION_VERSION = 'always-quick-v6-mobile-proscenium';
const QUICK_ENTRY_SECONDS = 7;
const MOBILE_QUICK_ENTRY_HEADSTART_S = 4.8;
const QUICK_DOOR_X = 2.65;
const HEARTH_BASKET_X = -1.62;
const HEARTH_TOOLS_X = -2.28;
const HEARTH_BASKET_Z = 0.28;
const HEARTH_TOOLS_Z = 0.24;
const HEARTH_WORK_Z = 0.72;
const DOOR_PAST_ARMOR_OFFSET = 1.55;
const GRAPHITE_BASKET = 0x6f7479;
const GRAPHITE_BASKET_DARK = 0x41464b;
let quickIterationEnabled = false;
let quickIterationOwners = 0;

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function smoothstep01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
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
  quickIterationOwners = 0;
  quickIterationEnabled = enabled === true;
  return quickIterationEnabled;
}

export function acquireWarRoomHansQuickIteration() {
  quickIterationOwners += 1;
  quickIterationEnabled = true;
  return quickIterationOwners;
}

export function releaseWarRoomHansQuickIteration() {
  quickIterationOwners = Math.max(0, quickIterationOwners - 1);
  quickIterationEnabled = quickIterationOwners > 0;
  return quickIterationOwners;
}

export function isWarRoomHansQuickIterationEnabled() {
  return quickIterationEnabled;
}

function findVisibleArmor(root, side) {
  const names = side < 0
    ? ['war-room-teutonic-armor-left', 'war-room-armor-guard-left']
    : ['war-room-teutonic-armor-right', 'war-room-armor-guard-right'];
  let fallback = null;
  for (const name of names) {
    const armor = root?.getObjectByName?.(name);
    if (!armor) continue;
    fallback ||= armor;
    if (armor.visible !== false) return armor;
  }
  return fallback;
}

function placeServiceDoorPastArmor(root, fireplace, doorRefs, towardBoard) {
  if (!root || !fireplace || !doorRefs?.group) return null;
  const side = doorRefs.side || Math.sign(fireplace.position.x || -1) || -1;
  const armor = findVisibleArmor(root, side);
  const armorZ = Number(armor?.position?.z);
  const fallbackZ = Number(fireplace.position.z) + towardBoard * 7.55;
  const targetZ = Number.isFinite(armorZ)
    ? armorZ + towardBoard * DOOR_PAST_ARMOR_OFFSET
    : fallbackZ;
  const oldDoorZ = Number(doorRefs.doorZ || targetZ);
  doorRefs.group.position.z += targetZ - oldDoorZ;
  doorRefs.doorZ = targetZ;
  doorRefs.group.userData.warRoomHansDoorPlacement = 'past-armor-service-corridor-v1';
  doorRefs.group.userData.warRoomHansDoorWorldZ = targetZ;
  doorRefs.group.userData.warRoomHansDoorArmorName = armor?.name || 'fallback';
  doorRefs.group.userData.warRoomHansDoorPastArmorOffset = DOOR_PAST_ARMOR_OFFSET;
  return targetZ;
}

function recolorGraphiteBasket(basket) {
  if (!basket || basket.userData?.warRoomHansBasketFinish === 'graphite-grey-v1') return;
  let index = 0;
  basket.traverse?.((object) => {
    if (!object?.isMesh) return;
    const geometryType = object.geometry?.type;
    if (geometryType !== 'BoxGeometry' && geometryType !== 'TorusGeometry') return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material?.color?.setHex) continue;
      material.color.setHex(index % 3 === 0 ? GRAPHITE_BASKET_DARK : GRAPHITE_BASKET);
      material.roughness = Math.max(Number(material.roughness || 0), 0.72);
      material.metalness = Math.max(Number(material.metalness || 0), 0.08);
      material.needsUpdate = true;
      index += 1;
    }
  });
  basket.userData.warRoomHansBasketFinish = 'graphite-grey-v1';
}

function relocateHearthKit(fireplace, towardBoard) {
  if (!fireplace) return 0;
  const side = Math.sign(fireplace.position.x || -1) || -1;
  const basket = fireplace.getObjectByName?.('war-room-hearth-log-basket');
  const tools = fireplace.getObjectByName?.('war-room-hearth-tool-stand');
  let moved = 0;
  if (basket) {
    basket.position.x = -side * 1.62;
    basket.position.z = towardBoard * HEARTH_BASKET_Z;
    basket.rotation.y = -side * towardBoard * 0.05;
    basket.userData.warRoomHansHearthSide = 'opposite-service-door';
    basket.userData.warRoomHansHearthDepth = 'rear-wall-v1';
    recolorGraphiteBasket(basket);
    moved += 1;
  }
  if (tools) {
    tools.position.x = -side * 2.28;
    tools.position.z = towardBoard * HEARTH_TOOLS_Z;
    tools.userData.warRoomHansHearthSide = 'opposite-service-door';
    tools.userData.warRoomHansHearthDepth = 'rear-wall-v1';
    moved += 1;
  }
  const kit = fireplace.getObjectByName?.('war-room-hans-hearth-kit');
  if (kit) {
    kit.userData.warRoomHansServiceDoorClearance = 'opposite-side-v1';
    kit.userData.warRoomHansHearthDepth = 'rear-wall-v1';
  }
  return moved;
}

function remapWorkingFrame(frame, timelineT) {
  if (!frame?.hansVisible) return frame;
  const mapped = { ...frame, hansZ: HEARTH_WORK_Z };
  if (frame.phase === 'take-log') {
    mapped.hansX = HEARTH_BASKET_X;
  } else if (frame.phase === 'carry-log') {
    const p = clamp01((1.95 - frame.hansX) / (1.95 - 0.9));
    mapped.hansX = lerp(HEARTH_BASKET_X, 0.9, p);
  } else if (frame.phase === 'place-log') {
    mapped.hansX = 0.9;
  } else if (frame.phase === 'take-poker') {
    const p = clamp01((frame.hansX - 0.9) / (1.18 - 0.9));
    mapped.hansX = lerp(0.9, HEARTH_TOOLS_X, p);
  } else if (frame.phase === 'stoke-fire') {
    const local = Math.max(0, timelineT - 19);
    mapped.hansX = lerp(HEARTH_TOOLS_X, 0.92, smoothstep01(local / 1.2));
  } else if (frame.phase === 'return-poker') {
    const p = clamp01((frame.hansX - 0.92) / (1.18 - 0.92));
    mapped.hansX = lerp(0.92, HEARTH_TOOLS_X, p);
  } else if (frame.phase === 'satisfied') {
    mapped.hansX = HEARTH_TOOLS_X;
  } else if (frame.phase === 'leave') {
    const p = clamp01((frame.hansX - 1.18) / (4.15 - 1.18));
    mapped.hansX = lerp(HEARTH_TOOLS_X, QUICK_DOOR_X, p);
    mapped.route = 'leave';
    mapped.routeProgress = p;
    mapped.doorOpen = smoothstep01((p - 0.52) / 0.28);
    mapped.hansVisible = frame.hansVisible && p < 0.985;
  }
  return mapped;
}

// Visual-iteration mode makes Hans impossible to miss. The service door now
// lives beyond the visible armor, so the first seven seconds are a deliberate
// corridor walk along the side of the board while the hearth dims. Only after
// that does he cross to the basket on the opposite side of the fireplace.
export function hansQuickIterationFrame(elapsedSeconds) {
  const elapsed = Math.max(0, Number(elapsedSeconds) || 0);
  if (elapsed < QUICK_ENTRY_SECONDS) {
    const dimFrame = hansFireplaceFrame(
      Math.min(elapsed, 5) + HANS_FIREPLACE_START_DELAY_S,
    );
    const eased = smoothstep01(elapsed / QUICK_ENTRY_SECONDS);
    const closeDoor = smoothstep01(Math.max(0, (elapsed - 1.8) / 2.4));
    return {
      ...dimFrame,
      phase: 'fire-dimming',
      active: true,
      fireScale: dimFrame.fireScale,
      hansVisible: true,
      hansX: lerp(QUICK_DOOR_X, HEARTH_BASKET_X, eased),
      hansZ: HEARTH_WORK_Z,
      stride: Math.sin(elapsed * 4.4) * 0.24,
      route: 'entry',
      routeProgress: eased,
      doorOpen: 1 - closeDoor,
    };
  }

  const postEntryOffset = 10 - QUICK_ENTRY_SECONDS;
  const timelineT = elapsed + postEntryOffset;
  const frame = hansFireplaceFrame(
    elapsed + HANS_FIREPLACE_START_DELAY_S + postEntryOffset,
  );
  if (frame.complete) return { ...frame, doorOpen: 0 };
  return { ...remapWorkingFrame(frame, timelineT), doorOpen: frame.phase === 'leave' ? remapWorkingFrame(frame, timelineT).doorOpen : 0 };
}

function routeDepth(frame, doorDepth) {
  if (frame.route === 'entry') {
    return lerp(doorDepth, HEARTH_WORK_Z, clamp01(frame.routeProgress));
  }
  if (frame.route === 'leave') {
    return lerp(HEARTH_WORK_Z, doorDepth, clamp01(frame.routeProgress));
  }
  return Number.isFinite(frame.hansZ) ? frame.hansZ : HEARTH_WORK_Z;
}

function applyHansTransform(hans, frame, side, towardBoard, doorDepth) {
  hans.position.x = side * frame.hansX;
  hans.position.y = -0.34;
  hans.position.z = towardBoard * routeDepth(frame, doorDepth);
  if (frame.route === 'entry') {
    hans.rotation.y = Math.PI;
  } else if (frame.route === 'leave') {
    hans.rotation.y = 0;
  } else {
    hans.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
  }
}

function applyQuickIterationFrame(refs, frame, towardBoard) {
  const {
    fireplace, hans, fireCore, fireLight, fireCoreBaseScale,
    fireLightBaseIntensity, fireLightBaseDistance,
    basketTopLog, addedLog, standPoker, side, doorRefs, doorDepth,
  } = refs;

  if (basketTopLog) basketTopLog.visible = !frame.removeBasketLog;
  if (addedLog) addedLog.visible = frame.showAddedLog;
  setWarRoomHansServiceDoorOpen(doorRefs, frame.doorOpen ?? 0);

  hans.visible = frame.hansVisible;
  if (frame.hansVisible) {
    applyHansTransform(hans, frame, side, towardBoard, doorDepth);
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

function armQuickIteration(root, towardBoard, doorRefs, { coarsePointer = false } = {}) {
  const fireplace = root?.getObjectByName?.('war-room-fireplace');
  const hans = root?.getObjectByName?.('war-room-hans-butler');
  const driver = root?.getObjectByName?.('war-room-hans-fireplace-driver');
  const fireCore = fireplace?.getObjectByName?.('war-room-fire-core');
  const fireLight = fireplace?.getObjectByName?.('war-room-fire-light');
  if (!fireplace || !hans || !driver || !fireCore || !fireLight) return 0;

  const entryHeadstartSeconds = coarsePointer ? MOBILE_QUICK_ENTRY_HEADSTART_S : 0;
  const startedAt = nowMs() - entryHeadstartSeconds * 1000;
  const doorDepth = Math.abs(Number(doorRefs?.doorZ) - Number(fireplace.position.z));
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
    doorDepth,
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
  driver.userData.warRoomHansServiceCorridor = 'past-armor-to-hearth-v1';
  driver.userData.warRoomHansMobileEntryHeadstartSeconds = entryHeadstartSeconds;
  driver.userData.warRoomHansEntryPresentation = coarsePointer ? 'mobile-proscenium-v1' : 'full-service-corridor-v1';

  const initialFrame = hansQuickIterationFrame(entryHeadstartSeconds);
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

function remapProductionHans(hans, phase, side, towardBoard, doorDepth, phaseElapsed) {
  if (!hans?.visible) return { doorOpen: 0, hide: false };
  const rawX = Math.abs(Number(hans.position.x || 0));
  let x = rawX;
  let depth = HEARTH_WORK_Z;
  let doorOpen = 0;
  let hide = false;

  if (phase === 'walk-to-basket') {
    const p = clamp01((3.9 - rawX) / (3.9 - 1.95));
    x = lerp(QUICK_DOOR_X, HEARTH_BASKET_X, p);
    depth = lerp(doorDepth, HEARTH_WORK_Z, p);
    doorOpen = 1 - smoothstep01(p / 0.45);
    hans.rotation.y = Math.PI;
  } else if (phase === 'take-log') {
    x = HEARTH_BASKET_X;
  } else if (phase === 'carry-log') {
    const p = clamp01((1.95 - rawX) / (1.95 - 0.9));
    x = lerp(HEARTH_BASKET_X, 0.9, p);
  } else if (phase === 'place-log') {
    x = 0.9;
  } else if (phase === 'take-poker') {
    const p = clamp01((rawX - 0.9) / (1.18 - 0.9));
    x = lerp(0.9, HEARTH_TOOLS_X, p);
  } else if (phase === 'stoke-fire') {
    x = lerp(HEARTH_TOOLS_X, 0.92, smoothstep01(phaseElapsed / 1.2));
  } else if (phase === 'return-poker') {
    const p = clamp01((rawX - 0.92) / (1.18 - 0.92));
    x = lerp(0.92, HEARTH_TOOLS_X, p);
  } else if (phase === 'satisfied') {
    x = HEARTH_TOOLS_X;
  } else if (phase === 'leave') {
    const p = clamp01((rawX - 1.18) / (4.15 - 1.18));
    x = lerp(HEARTH_TOOLS_X, QUICK_DOOR_X, p);
    depth = lerp(HEARTH_WORK_Z, doorDepth, p);
    doorOpen = smoothstep01((p - 0.52) / 0.28);
    hide = p >= 0.985;
    hans.rotation.y = 0;
  }

  hans.position.x = side * x;
  hans.position.z = towardBoard * depth;
  if (phase !== 'walk-to-basket' && phase !== 'leave') {
    hans.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  return { doorOpen, hide };
}

function armProductionDoor(driver, hans, doorRefs, fireplace, towardBoard) {
  if (!driver?.userData?.warRoomHansSelected || typeof driver.onBeforeRender !== 'function') return;
  const original = driver.onBeforeRender;
  const side = doorRefs?.side || Math.sign(fireplace?.position?.x || -1) || -1;
  const doorDepth = Math.abs(Number(doorRefs?.doorZ) - Number(fireplace?.position?.z));
  let lastPhase = null;
  let phaseStartedAt = nowMs();
  driver.userData.warRoomHansUsesServiceDoor = true;
  driver.userData.warRoomHansServiceCorridor = 'past-armor-to-hearth-v1';
  driver.onBeforeRender = () => {
    original();
    const phase = driver.userData.warRoomHansPhase;
    if (phase !== lastPhase) {
      lastPhase = phase;
      phaseStartedAt = nowMs();
    }
    const phaseElapsed = Math.max(0, (nowMs() - phaseStartedAt) / 1000);
    const routed = remapProductionHans(hans, phase, side, towardBoard, doorDepth, phaseElapsed);
    setWarRoomHansServiceDoorOpen(doorRefs, routed.doorOpen);
    if (routed.hide && hans?.visible) hans.visible = false;
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
  // and judge the choreography. The ordinary mobile path remains simplified.
  const routineCoarsePointer = forceQuickIteration ? false : coarsePointer;
  const options = { towardBoard, coarsePointer: routineCoarsePointer, forceEvent: forceQuickIteration };
  if (Number.isFinite(randomValue)) options.randomValue = randomValue;

  const installed = installWarRoomHansFireplaceRoutine(root, options);
  const fireplace = root.getObjectByName?.('war-room-fireplace');
  relocateHearthKit(fireplace, towardBoard);
  const doorRefs = ensureWarRoomHansServiceDoor(root, { fireplace, towardBoard, coarsePointer });
  if (!doorRefs) return installed;
  placeServiceDoorPastArmor(root, fireplace, doorRefs, towardBoard);

  if (forceQuickIteration) {
    armQuickIteration(root, towardBoard, doorRefs, { coarsePointer });
    return installed;
  }

  const driver = root.getObjectByName?.('war-room-hans-fireplace-driver');
  const hans = root.getObjectByName?.('war-room-hans-butler');
  armProductionDoor(driver, hans, doorRefs, fireplace, towardBoard);
  return installed;
}
