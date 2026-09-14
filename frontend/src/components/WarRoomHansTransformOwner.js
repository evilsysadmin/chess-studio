export const WAR_ROOM_HANS_TRANSFORM_OWNER_VERSION = 'hans-transform-owner-v2-root-authority';

const TARGET_EPSILON = 0.09;

function hansBody(subject) {
  return subject?.body || subject?.userData?.refs || null;
}

function hansRoot(subject) {
  return subject?.hans || subject || null;
}

export function warRoomHansLocalForward(subject) {
  const hans = hansRoot(subject);
  const body = hansBody(subject) || hansBody(hans);

  const declared = Number(hans?.userData?.warRoomHansLocalForwardZ);
  if (Number.isFinite(declared) && Math.abs(declared) > 0.0001) return Math.sign(declared);

  const logZ = Number(body?.carriedLog?.position?.z);
  if (Number.isFinite(logZ) && Math.abs(logZ) > 0.0001) return Math.sign(logZ);

  const pokerZ = Number(body?.carriedPoker?.position?.z);
  if (Number.isFinite(pokerZ) && Math.abs(pokerZ) > 0.0001) return Math.sign(pokerZ);

  return 1;
}

function markOwner(hans, source) {
  if (!hans?.userData) return;
  hans.userData.warRoomHansTransformOwner = WAR_ROOM_HANS_TRANSFORM_OWNER_VERSION;
  hans.userData.warRoomHansTransformSource = String(source || 'actor');
}

export function setWarRoomHansCrouchIntent(subject, amount, source = 'actor-vertical-intent') {
  const hans = hansRoot(subject);
  if (!hans?.userData) return false;
  const crouch = Math.max(0, Number(amount) || 0);
  hans.userData.warRoomHansCrouchIntent = crouch;
  hans.userData.warRoomHansVerticalIntentSource = String(source || 'actor-vertical-intent');
  markOwner(hans, source);
  return true;
}

export function warRoomHansCrouchIntent(subject) {
  const hans = hansRoot(subject);
  return Math.max(0, Number(hans?.userData?.warRoomHansCrouchIntent) || 0);
}

export function commitWarRoomHansGroundedY(subject, y, source = 'rendered-grounding') {
  const hans = hansRoot(subject);
  const groundedY = Number(y);
  if (!hans?.position || !Number.isFinite(groundedY)) return false;
  hans.position.y = groundedY;
  if (hans.userData) {
    hans.userData.warRoomHansGroundedY = groundedY;
    hans.userData.warRoomHansVerticalCommitSource = String(source || 'rendered-grounding');
  }
  markOwner(hans, source);
  return true;
}

export function faceWarRoomHansToward(subject, target, source = 'actor-facing') {
  const hans = hansRoot(subject);
  if (!hans || !target) return false;

  const dx = Number(target.x) - Number(hans.position?.x);
  const dz = Number(target.z) - Number(hans.position?.z);
  if (!Number.isFinite(dx) || !Number.isFinite(dz) || (dx * dx + dz * dz) < 1e-10) return false;

  const forward = warRoomHansLocalForward(subject);
  hans.rotation.y = Math.atan2(dx, dz) + (forward < 0 ? Math.PI : 0);
  markOwner(hans, source);
  return true;
}

export function placeWarRoomHansHorizontal(actor, point, source = 'actor-place') {
  const hans = actor?.hans;
  if (!hans || !point) return false;

  const x = Number(point.x);
  const z = Number(point.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;

  hans.position.x = x;
  hans.position.z = z;
  markOwner(hans, source);
  return true;
}

export function moveWarRoomHansToward(subject, target, maxStep, source = 'actor-navigation') {
  const hans = hansRoot(subject);
  if (!hans || !target) return { arrived: false, travelled: 0, blocked: true };

  const dx = Number(target.x) - Number(hans.position?.x);
  const dz = Number(target.z) - Number(hans.position?.z);
  const distance = Math.hypot(dx, dz);
  if (!Number.isFinite(distance)) return { arrived: false, travelled: 0, blocked: true };
  if (distance <= TARGET_EPSILON) {
    faceWarRoomHansToward(subject, target, source);
    return { arrived: true, travelled: 0, blocked: false };
  }

  const step = Math.min(distance, Math.max(0, Number(maxStep) || 0));
  if (step <= 0) return { arrived: false, travelled: 0, blocked: false };

  hans.position.x += dx / distance * step;
  hans.position.z += dz / distance * step;
  faceWarRoomHansToward(subject, target, source);
  markOwner(hans, source);

  return {
    arrived: distance - step <= TARGET_EPSILON,
    travelled: step,
    blocked: false,
  };
}
