import {
  HANS_FIREPLACE_START_DELAY_S,
  hansFireplaceFrame,
  installWarRoomHansFireplaceRoutine,
  writeHansFireplaceFrame,
} from './WarRoomHansFireplace.js';
import {
  ensureWarRoomHansServiceDoor,
  setWarRoomHansServiceDoorOpen,
} from './WarRoomHansServiceDoor.js';

const QUICK_ITERATION_VERSION = 'always-quick-v10-slow-obstacle-safe';
const QUICK_ENTRY_SECONDS = 7;
const HANS_PRESENTATION_TIME_SCALE = 0.54;
const MOBILE_QUICK_ENTRY_VISIBLE_PROGRESS = 0.766;
const QUICK_DOOR_X = 2.65;
const HEARTH_BASKET_X = -1.62;
const HEARTH_TOOLS_X = -2.28;
const HEARTH_BASKET_Z = 0.28;
const HEARTH_TOOLS_Z = 0.24;
const HEARTH_WORK_Z = 0.72;
const HEARTH_FIRE_TARGET_Z = 0.14;
const DOOR_PAST_ARMOR_OFFSET = 1.55;
const ARMOR_BYPASS_X = 1.42;
const ARMOR_CLEARANCE_AFTER = 0.72;
const CARRY_LOG_TURN_SECONDS = 0.38;
const POKER_OUTBOUND_TURN_SECONDS = 0.28;
const POKER_RETURN_TO_FIRE_SECONDS = 2.25;
const LEAVE_SIDE_FRACTION = 0.28;
const LEAVE_BYPASS_FRACTION = 0.78;
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

function armorBypassDepth(doorDepth) {
  return Math.max(
    HEARTH_WORK_Z,
    Number(doorDepth || 0) - DOOR_PAST_ARMOR_OFFSET + ARMOR_CLEARANCE_AFTER,
  );
}

function headingTo(fromX, fromZ, toX, toZ, fallback = 0, localForwardZ = 1) {
  const dx = Number(toX) - Number(fromX);
  const dz = Number(toZ) - Number(fromZ);
  if (!Number.isFinite(dx) || !Number.isFinite(dz) || (dx * dx + dz * dz) < 1e-8) return fallback;
  const targetYaw = Math.atan2(dx, dz);
  return targetYaw + (Number(localForwardZ) < 0 ? Math.PI : 0);
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
  doorRefs.group.userData.warRoomHansDoorPlacement = 'past-armor-service-corridor-v2';
  doorRefs.group.userData.warRoomHansDoorWorldZ = targetZ;
  doorRefs.group.userData.warRoomHansDoorArmorName = armor?.name || 'fallback';
  doorRefs.group.userData.warRoomHansDoorPastArmorOffset = DOOR_PAST_ARMOR_OFFSET;
  doorRefs.group.userData.warRoomHansArmorBypassX = ARMOR_BYPASS_X;
  doorRefs.group.userData.warRoomHansArmorClearanceAfter = ARMOR_CLEARANCE_AFTER;
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

function resetQuickFrameExtras(frame) {
  frame.hansZ = HEARTH_WORK_Z;
  frame.crouch = 0;
  frame.facingTarget = null;
  frame.orientationTarget = null;
  frame.choreography = null;
  frame.route = null;
  frame.routeProgress = 0;
  frame.doorOpen = 0;
  return frame;
}

function remapWorkingFrameInPlace(frame, timelineT) {
  if (!frame?.hansVisible) return frame;
  frame.hansZ = HEARTH_WORK_Z;
  frame.choreography = frame.phase;
  if (frame.phase === 'take-log') {
    const p = clamp01((timelineT - 10) / 2);
    frame.hansX = HEARTH_BASKET_X;
    frame.crouch = Math.sin(p * Math.PI) * 0.16;
    frame.leftArm = -Math.sin(p * Math.PI) * 0.58;
    frame.rightArm = -Math.sin(p * Math.PI) * 1.02;
    frame.facingTarget = 'basket';
  } else if (frame.phase === 'carry-log') {
    const local = Math.max(0, timelineT - 12);
    const walkP = smoothstep01((local - CARRY_LOG_TURN_SECONDS) / (3 - CARRY_LOG_TURN_SECONDS));
    frame.hansX = lerp(HEARTH_BASKET_X, 0.9, walkP);
    frame.stride = local < CARRY_LOG_TURN_SECONDS
      ? 0
      : Math.sin((local - CARRY_LOG_TURN_SECONDS) * 3.2) * 0.13;
    frame.leftArm = -0.46;
    frame.rightArm = -0.5;
    frame.facingTarget = 'hearth';
    frame.orientationTarget = 'fire';
  } else if (frame.phase === 'place-log') {
    const p = clamp01((timelineT - 15) / 2);
    frame.hansX = 0.9;
    frame.crouch = Math.sin(p * Math.PI) * 0.12;
    frame.leftArm = -0.66 - p * 0.26;
    frame.rightArm = -0.72 - p * 0.44;
    frame.facingTarget = 'fire';
  } else if (frame.phase === 'take-poker') {
    const local = Math.max(0, timelineT - 17);
    const walkP = smoothstep01((local - POKER_OUTBOUND_TURN_SECONDS) / (2 - POKER_OUTBOUND_TURN_SECONDS));
    frame.hansX = lerp(0.9, HEARTH_TOOLS_X, walkP);
    frame.stride = local < POKER_OUTBOUND_TURN_SECONDS
      ? 0
      : Math.sin((local - POKER_OUTBOUND_TURN_SECONDS) * 3.05) * 0.12;
    frame.carryPoker = local > 1.62;
    const reachP = clamp01((local - 1.42) / 0.58);
    frame.rightArm = local < 1.42 ? -0.08 : -Math.sin(reachP * Math.PI) * 0.92;
    frame.leftArm = local < 1.42 ? 0 : -0.1;
    frame.facingTarget = 'tools';
  } else if (frame.phase === 'stoke-fire') {
    const local = Math.max(0, timelineT - 19);
    const walkP = smoothstep01(local / POKER_RETURN_TO_FIRE_SECONDS);
    frame.hansX = lerp(HEARTH_TOOLS_X, 0.92, walkP);
    frame.stride = local < POKER_RETURN_TO_FIRE_SECONDS ? Math.sin(local * 3.05) * 0.12 : 0;
    frame.stoke = local < POKER_RETURN_TO_FIRE_SECONDS ? 0 : frame.stoke;
    frame.rightArm = local < POKER_RETURN_TO_FIRE_SECONDS ? -0.42 : frame.rightArm;
    frame.leftArm = local < POKER_RETURN_TO_FIRE_SECONDS ? -0.12 : frame.leftArm;
    frame.facingTarget = 'fire';
  } else if (frame.phase === 'return-poker') {
    const local = Math.max(0, timelineT - 24);
    const walkP = smoothstep01(local / 1.5);
    frame.hansX = lerp(0.92, HEARTH_TOOLS_X, walkP);
    frame.stride = local < 1.42 ? Math.sin(local * 2.95) * 0.11 : 0;
    frame.carryPoker = local < 1.28;
    frame.rightArm = lerp(-0.38, -0.08, clamp01(local / 1.5));
    frame.facingTarget = 'tools';
  } else if (frame.phase === 'satisfied') {
    frame.hansX = HEARTH_TOOLS_X;
    frame.facingTarget = 'fire';
  } else if (frame.phase === 'leave') {
    const local = Math.max(0, timelineT - 27);
    const p = smoothstep01(local / 6);
    if (p < LEAVE_SIDE_FRACTION) {
      const sideP = smoothstep01(p / LEAVE_SIDE_FRACTION);
      frame.hansX = lerp(HEARTH_TOOLS_X, ARMOR_BYPASS_X, sideP);
      frame.route = 'leave-side';
      frame.routeProgress = sideP;
      frame.doorOpen = 0;
      frame.facingTarget = 'bypass-side';
    } else if (p < LEAVE_BYPASS_FRACTION) {
      const bypassP = smoothstep01((p - LEAVE_SIDE_FRACTION) / (LEAVE_BYPASS_FRACTION - LEAVE_SIDE_FRACTION));
      frame.hansX = ARMOR_BYPASS_X;
      frame.route = 'leave-bypass';
      frame.routeProgress = bypassP;
      frame.doorOpen = 0;
      frame.facingTarget = 'bypass-forward';
    } else {
      const doorP = smoothstep01((p - LEAVE_BYPASS_FRACTION) / (1 - LEAVE_BYPASS_FRACTION));
      frame.hansX = lerp(ARMOR_BYPASS_X, QUICK_DOOR_X, doorP);
      frame.route = 'leave-door';
      frame.routeProgress = doorP;
      frame.doorOpen = smoothstep01((doorP - 0.08) / 0.32);
      frame.facingTarget = 'door';
    }
    frame.stride = Math.sin(local * 2.9) * 0.12;
    frame.hansVisible = frame.hansVisible && p < 0.985;
  }
  return frame;
}

export function writeHansQuickIterationFrame(target, elapsedSeconds, coarsePointer = false) {
  const frame = target || {};
  const elapsed = Math.max(0, Number(elapsedSeconds) || 0);
  if (elapsed < QUICK_ENTRY_SECONDS) {
    writeHansFireplaceFrame(
      frame,
      Math.min(elapsed, 5) + HANS_FIREPLACE_START_DELAY_S,
    );
    resetQuickFrameExtras(frame);
    const entryStart = coarsePointer ? MOBILE_QUICK_ENTRY_VISIBLE_PROGRESS : 0;
    const eased = lerp(entryStart, 1, smoothstep01(elapsed / QUICK_ENTRY_SECONDS));
    const closeDoor = smoothstep01(Math.max(0, (elapsed - 1.8) / 2.4));
    frame.phase = 'fire-dimming';
    frame.active = true;
    frame.hansVisible = true;
    frame.hansX = lerp(QUICK_DOOR_X, HEARTH_BASKET_X, eased);
    frame.hansZ = HEARTH_WORK_Z;
    frame.stride = Math.sin(elapsed * 3.0) * 0.16;
    frame.route = 'entry';
    frame.routeProgress = eased;
    frame.doorOpen = 1 - closeDoor;
    frame.facingTarget = 'basket';
    frame.choreography = 'enter-to-basket';
    return frame;
  }

  const postEntryOffset = 10 - QUICK_ENTRY_SECONDS;
  const timelineT = elapsed + postEntryOffset;
  writeHansFireplaceFrame(
    frame,
    elapsed + HANS_FIREPLACE_START_DELAY_S + postEntryOffset,
  );
  resetQuickFrameExtras(frame);
  if (frame.complete) {
    frame.doorOpen = 0;
    frame.choreography = 'complete';
    return frame;
  }
  remapWorkingFrameInPlace(frame, timelineT);
  if (frame.phase !== 'leave') frame.doorOpen = 0;
  return frame;
}

export function hansQuickIterationFrame(elapsedSeconds, { coarsePointer = false } = {}) {
  return writeHansQuickIterationFrame({}, elapsedSeconds, coarsePointer);
}

function routeDepth(frame, doorDepth) {
  if (frame.route === 'entry') {
    return lerp(doorDepth, HEARTH_WORK_Z, clamp01(frame.routeProgress));
  }
  if (frame.route === 'leave-side') {
    return HEARTH_WORK_Z;
  }
  if (frame.route === 'leave-bypass') {
    return lerp(HEARTH_WORK_Z, armorBypassDepth(doorDepth), clamp01(frame.routeProgress));
  }
  if (frame.route === 'leave-door') {
    return lerp(armorBypassDepth(doorDepth), doorDepth, clamp01(frame.routeProgress));
  }
  return Number.isFinite(frame.hansZ) ? frame.hansZ : HEARTH_WORK_Z;
}

function applyHansFacingTarget(hans, targetName, side, towardBoard, doorDepth) {
  let targetX;
  let targetZ;
  switch (targetName) {
    case 'basket':
    case 'walk-to-basket':
    case 'take-log':
      targetX = side * HEARTH_BASKET_X;
      targetZ = towardBoard * HEARTH_BASKET_Z;
      break;
    case 'tools':
    case 'take-poker':
    case 'return-poker':
      targetX = side * HEARTH_TOOLS_X;
      targetZ = towardBoard * HEARTH_TOOLS_Z;
      break;
    case 'fire':
    case 'carry-log':
    case 'place-log':
    case 'stoke-fire':
    case 'satisfied':
      targetX = 0;
      targetZ = towardBoard * HEARTH_FIRE_TARGET_Z;
      break;
    case 'hearth':
      targetX = side * 0.9;
      targetZ = towardBoard * HEARTH_WORK_Z;
      break;
    case 'corridor':
      targetX = side * QUICK_DOOR_X;
      targetZ = towardBoard * HEARTH_WORK_Z;
      break;
    case 'bypass-side':
      targetX = side * ARMOR_BYPASS_X;
      targetZ = towardBoard * HEARTH_WORK_Z;
      break;
    case 'bypass-forward':
      targetX = side * ARMOR_BYPASS_X;
      targetZ = towardBoard * armorBypassDepth(doorDepth);
      break;
    case 'door':
      targetX = side * QUICK_DOOR_X;
      targetZ = towardBoard * doorDepth;
      break;
    default:
      return;
  }
  hans.rotation.y = headingTo(
    hans.position.x,
    hans.position.z,
    targetX,
    targetZ,
    hans.rotation.y,
    towardBoard,
  );
}

function applyHansTransform(hans, frame, side, towardBoard, doorDepth) {
  hans.position.x = side * frame.hansX;
  hans.position.y = -0.34 - Number(frame.crouch || 0);
  hans.position.z = towardBoard * routeDepth(frame, doorDepth);
  applyHansFacingTarget(
    hans,
    frame.orientationTarget || frame.facingTarget,
    side,
    towardBoard,
    doorDepth,
  );
}

function resolveQuickBounce(refs) {
  if (refs.bounce) return refs.bounce;
  const bounce = refs.fireplace.getObjectByName?.('war-room-fire-bounce-light') || null;
  if (bounce) refs.bounce = bounce;
  return bounce;
}

function applyQuickIterationFrame(refs, frame, towardBoard) {
  const {
    fireplace, hans, body, fireCore, fireLight, fireCoreBaseScale,
    fireLightBaseIntensity, fireLightBaseDistance,
    basketTopLog, addedLog, standPoker, side, doorRefs, doorDepth,
  } = refs;

  if (basketTopLog) basketTopLog.visible = !frame.removeBasketLog;
  if (addedLog) addedLog.visible = frame.showAddedLog;
  setWarRoomHansServiceDoorOpen(doorRefs, frame.doorOpen ?? 0);

  hans.visible = frame.hansVisible;
  if (frame.hansVisible) {
    applyHansTransform(hans, frame, side, towardBoard, doorDepth);
    body.leftLeg.rotation.x = frame.stride;
    body.rightLeg.rotation.x = -frame.stride;
    body.leftArm.rotation.x = frame.leftArm - frame.stride * 0.55;
    body.rightArm.rotation.x = frame.rightArm + frame.stride * 0.35;
    body.torso.rotation.x = towardBoard * frame.lean * 0.35;
    body.head.rotation.x = towardBoard * (frame.headNod - frame.lean * 0.12);
    body.carriedLog.visible = frame.carryLog;
    body.carriedPoker.visible = frame.carryPoker;
    body.carriedPoker.rotation.z = frame.stoke * 0.22;
    hans.userData.warRoomHansChoreographyPhase = frame.choreography || frame.phase;
    hans.userData.warRoomHansFacingTarget = frame.facingTarget || null;
    hans.userData.warRoomHansRoute = frame.route || null;
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

    const bounce = resolveQuickBounce(refs);
    if (bounce) {
      const bounceBaseIntensity = resolveBounceBaseIntensity(bounce);
      bounce.intensity = bounceBaseIntensity * (0.18 + frame.fireScale * 0.82);
    }
  }

  if (frame.complete) {
    fireCore.scale.copy(fireCoreBaseScale);
    fireLight.intensity = fireLightBaseIntensity;
    fireLight.distance = fireLightBaseDistance;
    const bounce = resolveQuickBounce(refs);
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

  let startedAt = null;
  const frameScratch = {};
  const doorDepth = Math.abs(Number(doorRefs?.doorZ) - Number(fireplace.position.z));
  const refs = {
    fireplace,
    hans,
    body: hans.userData.refs,
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
    bounce: null,
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
  driver.userData.warRoomHansServiceCorridor = 'armor-bypass-to-service-door-v2';
  driver.userData.warRoomHansMobileEntryHeadstartSeconds = 0;
  driver.userData.warRoomHansClockStart = 'first-real-render-v1';
  driver.userData.warRoomHansPresentationTimeScale = HANS_PRESENTATION_TIME_SCALE;
  driver.userData.warRoomHansEntryPresentation = coarsePointer ? 'mobile-visible-start-v4-slow' : 'full-service-corridor-v3-slow';
  driver.userData.warRoomHansChoreography = 'door-log-fire-poker-armor-bypass-door-v3';
  driver.userData.warRoomHansFrameHotPath = 'scratch-writer-v2';
  driver.userData.warRoomHansFacingHotPath = 'scalar-targets-v1';

  const initialFrame = writeHansQuickIterationFrame(frameScratch, 0, coarsePointer);
  applyQuickIterationFrame(refs, initialFrame, towardBoard);
  driver.userData.warRoomHansVisibleAtStart = hans.visible === true;

  driver.onBeforeRender = () => {
    const frameNow = nowMs();
    if (startedAt == null) startedAt = frameNow;
    const presentationElapsed = ((frameNow - startedAt) / 1000) * HANS_PRESENTATION_TIME_SCALE;
    const frame = writeHansQuickIterationFrame(frameScratch, presentationElapsed, coarsePointer);
    applyQuickIterationFrame(refs, frame, towardBoard);
    driver.userData.warRoomHansPhase = frame.phase;
    driver.userData.warRoomHansChoreographyPhase = frame.choreography || frame.phase;
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

function orientProductionHans(hans, phase, side, towardBoard, doorDepth, facingTarget = null) {
  applyHansFacingTarget(hans, facingTarget || phase, side, towardBoard, doorDepth);
}

function remapProductionHans(hans, phase, side, towardBoard, doorDepth, phaseElapsed, result) {
  const routed = result || { doorOpen: 0, hide: false };
  routed.doorOpen = 0;
  routed.hide = false;
  if (!hans?.visible) return routed;
  const rawX = Math.abs(Number(hans.position.x || 0));
  let x = rawX;
  let depth = HEARTH_WORK_Z;
  let doorOpen = 0;
  let hide = false;
  let syntheticStride = null;
  let facingTarget = null;
  let route = null;

  if (phase === 'walk-to-basket') {
    const p = clamp01((3.9 - rawX) / (3.9 - 1.95));
    x = lerp(QUICK_DOOR_X, HEARTH_BASKET_X, p);
    depth = lerp(doorDepth, HEARTH_WORK_Z, p);
    doorOpen = 1 - smoothstep01(p / 0.45);
    facingTarget = 'basket';
  } else if (phase === 'take-log') {
    x = HEARTH_BASKET_X;
    facingTarget = 'basket';
  } else if (phase === 'carry-log') {
    const walkP = smoothstep01((phaseElapsed - CARRY_LOG_TURN_SECONDS) / (3 - CARRY_LOG_TURN_SECONDS));
    x = lerp(HEARTH_BASKET_X, 0.9, walkP);
    syntheticStride = phaseElapsed < CARRY_LOG_TURN_SECONDS
      ? 0
      : Math.sin((phaseElapsed - CARRY_LOG_TURN_SECONDS) * 3.2) * 0.13;
    facingTarget = 'fire';
  } else if (phase === 'place-log') {
    x = 0.9;
    facingTarget = 'fire';
  } else if (phase === 'take-poker') {
    const walkP = smoothstep01((phaseElapsed - POKER_OUTBOUND_TURN_SECONDS) / (2 - POKER_OUTBOUND_TURN_SECONDS));
    x = lerp(0.9, HEARTH_TOOLS_X, walkP);
    syntheticStride = phaseElapsed < POKER_OUTBOUND_TURN_SECONDS
      ? 0
      : Math.sin((phaseElapsed - POKER_OUTBOUND_TURN_SECONDS) * 3.05) * 0.12;
    facingTarget = 'tools';
  } else if (phase === 'stoke-fire') {
    const walkP = smoothstep01(phaseElapsed / POKER_RETURN_TO_FIRE_SECONDS);
    x = lerp(HEARTH_TOOLS_X, 0.92, walkP);
    syntheticStride = phaseElapsed < POKER_RETURN_TO_FIRE_SECONDS ? Math.sin(phaseElapsed * 3.05) * 0.12 : 0;
    facingTarget = 'fire';
    if (phaseElapsed < POKER_RETURN_TO_FIRE_SECONDS) {
      const body = hans.userData?.refs;
      if (body?.rightArm) body.rightArm.rotation.x = -0.42;
      if (body?.leftArm) body.leftArm.rotation.x = -0.12;
      if (body?.carriedPoker) body.carriedPoker.rotation.z = 0;
    }
  } else if (phase === 'return-poker') {
    const walkP = smoothstep01(phaseElapsed / 1.5);
    x = lerp(0.92, HEARTH_TOOLS_X, walkP);
    syntheticStride = phaseElapsed < 1.42 ? Math.sin(phaseElapsed * 2.95) * 0.11 : 0;
    facingTarget = 'tools';
  } else if (phase === 'satisfied') {
    x = HEARTH_TOOLS_X;
    facingTarget = 'fire';
  } else if (phase === 'leave') {
    const p = smoothstep01(phaseElapsed / 6);
    const bypassDepth = armorBypassDepth(doorDepth);
    if (p < LEAVE_SIDE_FRACTION) {
      const sideP = smoothstep01(p / LEAVE_SIDE_FRACTION);
      x = lerp(HEARTH_TOOLS_X, ARMOR_BYPASS_X, sideP);
      depth = HEARTH_WORK_Z;
      doorOpen = 0;
      facingTarget = 'bypass-side';
      route = 'leave-side';
    } else if (p < LEAVE_BYPASS_FRACTION) {
      const bypassP = smoothstep01((p - LEAVE_SIDE_FRACTION) / (LEAVE_BYPASS_FRACTION - LEAVE_SIDE_FRACTION));
      x = ARMOR_BYPASS_X;
      depth = lerp(HEARTH_WORK_Z, bypassDepth, bypassP);
      doorOpen = 0;
      facingTarget = 'bypass-forward';
      route = 'leave-bypass';
    } else {
      const doorP = smoothstep01((p - LEAVE_BYPASS_FRACTION) / (1 - LEAVE_BYPASS_FRACTION));
      x = lerp(ARMOR_BYPASS_X, QUICK_DOOR_X, doorP);
      depth = lerp(bypassDepth, doorDepth, doorP);
      doorOpen = smoothstep01((doorP - 0.08) / 0.32);
      facingTarget = 'door';
      route = 'leave-door';
    }
    syntheticStride = Math.sin(phaseElapsed * 2.9) * 0.12;
    hide = p >= 0.985;
  }

  hans.position.x = side * x;
  hans.position.z = towardBoard * depth;
  orientProductionHans(hans, phase, side, towardBoard, doorDepth, facingTarget);
  if (syntheticStride != null) {
    const body = hans.userData?.refs;
    if (body?.leftLeg && body?.rightLeg) {
      body.leftLeg.rotation.x = syntheticStride;
      body.rightLeg.rotation.x = -syntheticStride;
    }
  }
  hans.userData.warRoomHansFacingTarget = facingTarget || phase;
  hans.userData.warRoomHansRoute = route;
  routed.doorOpen = doorOpen;
  routed.hide = hide;
  return routed;
}

function armProductionDoor(driver, hans, doorRefs, fireplace, towardBoard) {
  if (!driver?.userData?.warRoomHansSelected || typeof driver.onBeforeRender !== 'function') return;
  const original = driver.onBeforeRender;
  const side = doorRefs?.side || Math.sign(fireplace?.position.x || -1) || -1;
  const doorDepth = Math.abs(Number(doorRefs?.doorZ) - Number(fireplace?.position.z));
  const routeScratch = { doorOpen: 0, hide: false };
  let lastPhase = null;
  let phaseStartedAt = nowMs();
  driver.userData.warRoomHansUsesServiceDoor = true;
  driver.userData.warRoomHansServiceCorridor = 'armor-bypass-to-service-door-v2';
  driver.userData.warRoomHansChoreography = 'door-log-fire-poker-armor-bypass-door-v3';
  driver.userData.warRoomHansRouteHotPath = 'scratch-scalar-v1';
  driver.onBeforeRender = () => {
    original();
    const frameNow = nowMs();
    const phase = driver.userData.warRoomHansPhase;
    if (phase !== lastPhase) {
      lastPhase = phase;
      phaseStartedAt = frameNow;
    }
    const phaseElapsed = Math.max(0, (frameNow - phaseStartedAt) / 1000);
    const routed = remapProductionHans(hans, phase, side, towardBoard, doorDepth, phaseElapsed, routeScratch);
    setWarRoomHansServiceDoorOpen(doorRefs, routed.doorOpen);
    if (routed.hide && hans?.visible) hans.visible = false;
    if (driver.userData.warRoomHansCompleted || phase === 'complete') {
      setWarRoomHansServiceDoorOpen(doorRefs, 0);
    }
  };
}

function resetPartialMobileHansInstall(root) {
  const fireplace = root?.getObjectByName?.('war-room-fireplace');
  if (!fireplace) return false;
  const routineInstalled = Boolean(fireplace.userData?.warRoomHansFireplaceRoutine);
  const hans = root.getObjectByName?.('war-room-hans-butler');
  const driver = root.getObjectByName?.('war-room-hans-fireplace-driver');
  if (!routineInstalled || (hans && driver)) return false;

  delete fireplace.userData.warRoomHansFireplaceRoutine;
  if (root.userData) delete root.userData.warRoomHansFireplaceRoutine;
  fireplace.userData.warRoomHansForcedUpgrade = 'partial-mobile-to-full-v1';
  return true;
}

export function installWarRoomHansSceneRoutine(root, {
  towardBoard,
  coarsePointer = false,
  randomValue,
} = {}) {
  if (!root || !Number.isFinite(towardBoard)) return 0;
  const forceQuickIteration = quickIterationEnabled;

  if (forceQuickIteration) resetPartialMobileHansInstall(root);

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
