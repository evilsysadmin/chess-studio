const LIGHT_EPSILON = 0.06;
const TARGET_EPSILON = 0.003;
const sceneGuards = new WeakMap();

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function near(value, expected, epsilon = LIGHT_EPSILON) {
  return Math.abs(finite(value) - expected) <= epsilon;
}

function pointLightRole(object) {
  if (!object?.isPointLight) return '';
  const distance = finite(object.distance);
  const x = finite(object.position?.x);
  const y = finite(object.position?.y);
  const color = object.color?.getHex?.();
  if (near(distance, 16, 0.02) && near(x, -4.6) && near(y, 4.4) && color === 0xffa449) return 'warm';
  if (near(distance, 19, 0.02) && near(x, 4.8) && near(y, 3.6)) return 'rim';
  return '';
}

function reactiveLights(scene) {
  const found = { warm: null, rim: null };
  scene?.traverse?.((object) => {
    const role = pointLightRole(object);
    if (role && !found[role]) found[role] = object;
  });
  return found;
}

function restoreGuard(scene, guard) {
  if (!guard || guard.restored) return false;
  guard.restored = true;
  if (guard.warm) guard.warm.intensity = guard.warmIntensity;
  if (guard.rim) guard.rim.intensity = guard.rimIntensity;
  sceneGuards.delete(scene);
  return true;
}

function ownerAtTarget(guard) {
  const owner = guard?.owner;
  if (!owner?.position) return false;
  return Math.hypot(
    finite(owner.position.x) - guard.targetX,
    finite(owner.position.z) - guard.targetZ,
  ) <= TARGET_EPSILON;
}

function shouldRestore(guard) {
  const owner = guard?.owner;
  if (!owner) return true;
  if (!owner.parent) return true;
  if (String(owner.userData?.square || '') !== guard.targetSquare) return true;
  return ownerAtTarget(guard);
}

export function armWarRoomMoveLightGuard({ scene = null, owner = null, targetSquare = '', target = null } = {}) {
  if (!scene?.isScene || !owner?.isObject3D || !target) return false;

  const previous = sceneGuards.get(scene);
  if (previous) restoreGuard(scene, previous);

  const { warm, rim } = reactiveLights(scene);
  if (!warm && !rim) return false;

  const guard = {
    owner,
    targetSquare: String(targetSquare || ''),
    targetX: finite(target.x),
    targetZ: finite(target.z),
    warm,
    rim,
    warmIntensity: warm ? finite(warm.intensity) : 0,
    rimIntensity: rim ? finite(rim.intensity) : 0,
    restored: false,
  };
  sceneGuards.set(scene, guard);

  if (!scene.userData?.board3DMoveLightGuardInstalled) {
    const previousBeforeRender = scene.onBeforeRender;
    scene.onBeforeRender = function onBeforeRender(...args) {
      const active = sceneGuards.get(scene);
      if (active && shouldRestore(active)) restoreGuard(scene, active);
      previousBeforeRender?.apply(this, args);
    };
    scene.userData.board3DMoveLightGuardInstalled = true;
    scene.userData.board3DMoveLightGuardProfile = 'reactive-light-rollback-v1';
  }
  return true;
}

export function clearWarRoomMoveLightGuard(scene, owner = null) {
  const guard = sceneGuards.get(scene);
  if (owner && guard?.owner !== owner) return false;
  return restoreGuard(scene, guard);
}

export function hasWarRoomMoveLightGuard(scene, owner = null) {
  const guard = sceneGuards.get(scene);
  return Boolean(guard && (!owner || guard.owner === owner));
}
