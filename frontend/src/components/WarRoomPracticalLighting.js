import * as THREE from 'three';
import { installWarRoomArchitecturalDepth } from './WarRoomArchitecturalDepth.js';
import { installWarRoomArchitecturalUpper } from './WarRoomArchitecturalUpper.js';
import { installWarRoomArchitecturalPatina } from './WarRoomArchitecturalPatina.js';
import { installWarRoomTextileFinish } from './WarRoomTextileFinish.js';
import { installWarRoomNightWindowDepth } from './WarRoomNightWindowDepth.js';
import { applyWarRoomCompositionPolish } from './WarRoomCompositionPolish.js';
import { attachWarRoomCompositionRootDriver } from './WarRoomCompositionRootDriver.js';

function materialList(object) {
  if (!object?.material) return [];
  return Array.isArray(object.material) ? object.material : [object.material];
}

function tuneArmorMaterials(armor) {
  if (!armor || armor.userData.warRoomPracticalMaterialPass === 'v4') return 0;
  const seen = new Set();
  let tuned = 0;

  armor.traverse((object) => {
    for (const material of materialList(object)) {
      if (!material || seen.has(material) || (material.metalness ?? 0) < 0.55) continue;
      seen.add(material);
      material.envMapIntensity = Math.max(material.envMapIntensity ?? 1, 1.12);
      material.specularIntensity = Math.max(material.specularIntensity ?? 0.5, 0.62);
      if (typeof material.clearcoat === 'number') material.clearcoat = Math.max(material.clearcoat, 0.17);
      if (typeof material.clearcoatRoughness === 'number') material.clearcoatRoughness = Math.min(material.clearcoatRoughness, 0.34);
      material.userData.warRoomPracticalFinish = 'museum-steel-response-v4';
      material.needsUpdate = true;
      tuned += 1;
    }
  });

  armor.userData.warRoomPracticalMaterialPass = 'v4';
  return tuned;
}

function tunePaintingMaterials(frame) {
  if (!frame || frame.userData.warRoomPracticalMaterialPass === 'v4') return 0;
  const canvas = frame.getObjectByName('war-room-premium-painting-canvas');
  const seen = new Set();
  let tuned = 0;

  frame.traverse((object) => {
    for (const material of materialList(object)) {
      if (!material || seen.has(material)) continue;
      seen.add(material);

      if (material === canvas?.material) {
        material.envMapIntensity = Math.min(material.envMapIntensity ?? 1, 0.58);
        material.specularIntensity = Math.min(material.specularIntensity ?? 0.2, 0.18);
        material.userData.warRoomPracticalFinish = 'museum-canvas-response-v4';
      } else if ((material.metalness ?? 0) > 0.5) {
        material.envMapIntensity = Math.max(material.envMapIntensity ?? 1, 1.05);
        material.specularIntensity = Math.max(material.specularIntensity ?? 0.45, 0.56);
        material.userData.warRoomPracticalFinish = 'aged-gilt-response-v4';
      } else if (material.color) {
        material.envMapIntensity = Math.min(material.envMapIntensity ?? 1, 0.72);
        material.userData.warRoomPracticalFinish = 'dark-wood-response-v4';
      }
      material.needsUpdate = true;
      tuned += 1;
    }
  });

  frame.userData.warRoomPracticalMaterialPass = 'v4';
  return tuned;
}

function addMuseumSideKey(group, { side, wallZ, towardBoard }) {
  const light = new THREE.SpotLight(0xffd3a2, 2.05, 7.4, 0.5, 0.84, 2);
  light.name = side < 0 ? 'war-room-museum-side-key-left' : 'war-room-museum-side-key-right';
  light.position.set(side * 5.75, 4.92, wallZ + towardBoard * 3.15);
  light.castShadow = false;
  light.userData.warRoomPracticalLight = 'painting-armor-shared-key-v4';

  const target = new THREE.Object3D();
  target.name = side < 0 ? 'war-room-museum-side-target-left' : 'war-room-museum-side-target-right';
  target.position.set(side * 6.05, 2.58, wallZ + towardBoard * 2.7);
  light.target = target;

  group.add(target);
  group.add(light);
  return light;
}

export function applyWarRoomPracticalLighting(group, {
  wallZ,
  towardBoard,
  coarsePointer = false,
} = {}) {
  if (!group || !Number.isFinite(wallZ) || !Number.isFinite(towardBoard)) return 0;

  // The museum keys only look intentional when the surrounding wall/floor joins
  // read as one room. These lightweight passes are idempotent and desktop-only:
  // depth grounds the furniture, upper framing closes the far silhouette, patina
  // breaks showroom symmetry, textile finish removes perfectly smooth surfaces,
  // the night-window pass adds depth, and the final composition pass separates
  // armor from consoles while giving paintings/fireplace their finished surfaces.
  installWarRoomArchitecturalDepth(group, { wallZ, towardBoard, coarsePointer });
  installWarRoomArchitecturalUpper(group, { wallZ, towardBoard, coarsePointer });
  installWarRoomArchitecturalPatina(group, { coarsePointer });
  installWarRoomTextileFinish(group, { coarsePointer });
  installWarRoomNightWindowDepth(group, { wallZ, towardBoard, coarsePointer });
  applyWarRoomCompositionPolish(group, { wallZ, towardBoard, coarsePointer });
  attachWarRoomCompositionRootDriver(group, { wallZ, towardBoard, coarsePointer });

  if (group.userData.warRoomPracticalLightingVersion === 'museum-v4') return 0;

  let tunedMaterials = 0;
  tunedMaterials += tuneArmorMaterials(group.getObjectByName('war-room-teutonic-armor-left'));
  tunedMaterials += tuneArmorMaterials(group.getObjectByName('war-room-teutonic-armor-right'));
  tunedMaterials += tunePaintingMaterials(group.getObjectByName('war-room-premium-painting-0'));
  tunedMaterials += tunePaintingMaterials(group.getObjectByName('war-room-premium-painting-1'));

  let lightCount = 0;
  if (!coarsePointer) {
    addMuseumSideKey(group, { side: -1, wallZ, towardBoard });
    addMuseumSideKey(group, { side: 1, wallZ, towardBoard });
    lightCount = 2;
  }

  group.userData.warRoomPracticalLightingVersion = 'museum-v4';
  group.userData.warRoomPracticalLightCount = lightCount;
  group.userData.warRoomPracticalMaterialsTuned = tunedMaterials;
  return lightCount;
}
