import * as THREE from 'three';

export const HOME_CASTLE_PROP_FOCUS_LERP = 0.18;
export const HOME_CASTLE_PROP_FOCUS_MAX_EMISSIVE = 0.3;

function materialTarget(base, focused) {
  if (!focused) return base;
  return Math.min(
    HOME_CASTLE_PROP_FOCUS_MAX_EMISSIVE,
    base + Math.max(0.035, base * 0.45),
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

export function applyHomeCastleDestinationPropFocus(
  propsByRoom,
  activeRoom,
  reducedMotion = false,
) {
  for (const [room, group] of Object.entries(propsByRoom || {})) {
    const focused = room === activeRoom;
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
