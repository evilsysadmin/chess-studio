import * as THREE from 'three';

export const HOME_CASTLE_PROP_FOCUS_LERP = 0.18;
export const HOME_CASTLE_PROP_FOCUS_MAX_EMISSIVE = 0.32;
export const HOME_CASTLE_PROP_FOCUS_MIN_BOOST = 0.055;
export const HOME_CASTLE_PROP_FOCUS_BOOST_RATIO = 0.75;
export const HOME_CASTLE_PROP_FOCUS_LIFT = 0.018;
export const HOME_CASTLE_PROP_FOCUS_DEPTH = 0.018;
export const HOME_CASTLE_PROP_FOCUS_TILT = 0.028;

function materialTarget(base, focused) {
  if (!focused) return base;
  return Math.min(
    HOME_CASTLE_PROP_FOCUS_MAX_EMISSIVE,
    base + Math.max(HOME_CASTLE_PROP_FOCUS_MIN_BOOST, base * HOME_CASTLE_PROP_FOCUS_BOOST_RATIO),
  );
}

function focusableMaterials(group) {
  if (!group?.traverse) return [];
  const materials = new Set();
  group.traverse((node) => {
    const nodeMaterials = Array.isArray(node?.material)
      ? node.material
      : [node?.material];
    for (const material of nodeMaterials) {
      if (material && Number.isFinite(material.emissiveIntensity)) materials.add(material);
    }
  });
  return [...materials];
}

function rememberTransform(group) {
  group.userData ||= {};
  if (!group.userData.homeCastleBasePosition) {
    group.userData.homeCastleBasePosition = group.position.clone();
  }
  if (!group.userData.homeCastleBaseRotation) {
    group.userData.homeCastleBaseRotation = group.rotation.clone();
  }
}

function applyPhysicalFocus(group, focused, reducedMotion) {
  if (!group?.position || !group?.rotation) return;
  rememberTransform(group);
  const basePosition = group.userData.homeCastleBasePosition;
  const baseRotation = group.userData.homeCastleBaseRotation;

  if (reducedMotion) {
    group.position.copy(basePosition);
    group.rotation.copy(baseRotation);
    return;
  }

  const targetY = basePosition.y + (focused ? HOME_CASTLE_PROP_FOCUS_LIFT : 0);
  const targetZ = basePosition.z + (focused ? HOME_CASTLE_PROP_FOCUS_DEPTH : 0);
  const targetRotationX = baseRotation.x + (focused ? -HOME_CASTLE_PROP_FOCUS_TILT : 0);
  const targetRotationZ = baseRotation.z + (focused ? HOME_CASTLE_PROP_FOCUS_TILT * 0.55 : 0);

  group.position.y = THREE.MathUtils.lerp(group.position.y, targetY, HOME_CASTLE_PROP_FOCUS_LERP);
  group.position.z = THREE.MathUtils.lerp(group.position.z, targetZ, HOME_CASTLE_PROP_FOCUS_LERP);
  group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, targetRotationX, HOME_CASTLE_PROP_FOCUS_LERP);
  group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, targetRotationZ, HOME_CASTLE_PROP_FOCUS_LERP);
}

export function applyHomeCastleDestinationPropFocus(
  propsByRoom,
  activeRoom,
  reducedMotion = false,
) {
  for (const [room, group] of Object.entries(propsByRoom || {})) {
    const focused = room === activeRoom;
    applyPhysicalFocus(group, focused, reducedMotion);
    for (const material of focusableMaterials(group)) {
      material.userData ||= {};
      if (!Number.isFinite(material.userData.homeCastleBaseEmissiveIntensity)) {
        material.userData.homeCastleBaseEmissiveIntensity = material.emissiveIntensity;
      }
      const base = material.userData.homeCastleBaseEmissiveIntensity;
      const target = materialTarget(base, focused);
      material.emissiveIntensity = reducedMotion
        ? target
        : THREE.MathUtils.lerp(material.emissiveIntensity, target, HOME_CASTLE_PROP_FOCUS_LERP);
    }
  }
}
