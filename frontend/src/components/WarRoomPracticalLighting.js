import * as THREE from 'three';
import { installWarRoomArchitecturalDepth } from './WarRoomArchitecturalDepth.js';
import { installWarRoomArchitecturalUpper } from './WarRoomArchitecturalUpper.js';
import { installWarRoomArchitecturalPatina } from './WarRoomArchitecturalPatina.js';
import { installWarRoomTextileFinish } from './WarRoomTextileFinish.js';
import { installWarRoomNightWindowDepth } from './WarRoomNightWindowDepth.js';
import { installWarRoomAmbientLife } from './WarRoomAmbientLife.js';
import { applyWarRoomCompositionPolish } from './WarRoomCompositionPolish.js';
import { applyWarRoomUserPolish } from './WarRoomUserPolish.js';
import { installWarRoomApprovedMockContract } from './WarRoomApprovedMockContract.js';
import { installWarRoomCommandDeskStudy } from './WarRoomCommandDeskStudy.js';
import { installWarRoomCommandDeskLuxury } from './WarRoomCommandDeskLuxury.js';
import { attachWarRoomCompositionRootDriver } from './WarRoomCompositionRootDriver.js';
import { armWarRoomOneShotHookRetirement } from './WarRoomDeferredFinalizer.js';
import { installWarRoomMilitaryGallery } from './WarRoomMilitaryGallery.js';

const TORCH_WALL_WASH_VERSION = 'hearth-contour-v2';

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

export function tuneWarRoomGalleryTorchWallWash(group) {
  if (!group) return 0;
  let tuned = 0;

  for (const side of ['left', 'right']) {
    const torch = group.getObjectByName?.(`war-room-side-torch-${side}`);
    if (!torch || torch.userData.warRoomTorchWallWash === TORCH_WALL_WASH_VERSION) continue;

    const halo = torch.getObjectByName?.('war-room-side-torch-wall-halo');
    if (halo?.material) {
      halo.material.color?.setHex?.(0xff7622);
      halo.material.opacity = 0.88;
      halo.material.toneMapped = false;
      halo.material.needsUpdate = true;
      halo.scale.set(1.55, 1.48, 1);

      const innerHalo = halo.clone();
      innerHalo.name = 'war-room-side-torch-wall-halo-inner';
      innerHalo.material = halo.material.clone();
      innerHalo.material.color?.setHex?.(0xffb24d);
      innerHalo.material.opacity = 0.68;
      innerHalo.material.toneMapped = false;
      innerHalo.material.needsUpdate = true;
      innerHalo.scale.set(0.78, 0.78, 1);
      innerHalo.position.z += 0.004;
      innerHalo.renderOrder = Math.max(2, Number(halo.renderOrder || 0) + 1);
      innerHalo.castShadow = false;
      innerHalo.receiveShadow = false;
      torch.add(innerHalo);
    }

    const outer = torch.getObjectByName?.('war-room-side-torch-flame-outer');
    const inner = torch.getObjectByName?.('war-room-side-torch-flame-inner');
    for (const [mesh, color, emissive] of [
      [outer, 0xff9634, 0xff4d0b],
      [inner, 0xffd77f, 0xffad42],
    ]) {
      const material = mesh?.material;
      if (!material) continue;
      material.color?.setHex?.(color);
      material.emissive?.setHex?.(emissive);
      material.toneMapped = false;
      material.needsUpdate = true;
    }

    const light = torch.getObjectByName?.('war-room-side-torch-light');
    const wallGlow = torch.getObjectByName?.('war-room-side-torch-wall-glow');
    if (light) {
      light.color?.setHex?.(0xff7424);
      light.distance = Math.max(Number(light.distance || 0), 10.5);
      light.intensity *= 1.3;
    }
    if (wallGlow) {
      wallGlow.color?.setHex?.(0xffa442);
      wallGlow.distance = Math.max(Number(wallGlow.distance || 0), 7.4);
      wallGlow.intensity *= 2.1;
    }

    // Gallery flame kinetics restores the captured base intensity every frame.
    // Keep the wall wash boost after that reset so the contour does not vanish
    // as soon as the first flicker tick runs.
    if (outer?.onBeforeRender && !outer.userData.warRoomTorchWallWashHook) {
      const original = outer.onBeforeRender;
      outer.onBeforeRender = (...args) => {
        original(...args);
        if (light) light.intensity *= 1.3;
        if (wallGlow) wallGlow.intensity *= 2.1;
      };
      outer.userData.warRoomTorchWallWashHook = TORCH_WALL_WASH_VERSION;
    }

    torch.userData.warRoomTorchWallWash = TORCH_WALL_WASH_VERSION;
    tuned += 1;
  }

  return tuned;
}

export function applyWarRoomPracticalLighting(group, {
  wallZ,
  towardBoard,
  coarsePointer = false,
} = {}) {
  if (!group || !Number.isFinite(wallZ) || !Number.isFinite(towardBoard)) return 0;

  // Static refinement converges through the shared deferred finalizer. The
  // only continuous work kept in render hooks is actual animation: castle/fire
  // kinetics plus AmbientLife on the floor slab. PremiumRoom is another task in
  // that same queue, so the side wall no longer owns a static render chain.
  installWarRoomArchitecturalDepth(group, { wallZ, towardBoard, coarsePointer });
  installWarRoomArchitecturalUpper(group, { wallZ, towardBoard, coarsePointer });
  installWarRoomArchitecturalPatina(group, { coarsePointer });
  installWarRoomTextileFinish(group, { coarsePointer });
  installWarRoomNightWindowDepth(group, { wallZ, towardBoard, coarsePointer });
  installWarRoomAmbientLife(group, { coarsePointer });
  applyWarRoomCompositionPolish(group, { wallZ, towardBoard, coarsePointer });
  attachWarRoomCompositionRootDriver(group, { wallZ, towardBoard, coarsePointer });
  applyWarRoomUserPolish(group, { wallZ, towardBoard, coarsePointer });
  installWarRoomApprovedMockContract(group, { wallZ, towardBoard, coarsePointer });
  installWarRoomCommandDeskStudy(group, { towardBoard, coarsePointer });
  installWarRoomCommandDeskLuxury(group, { towardBoard, coarsePointer });
  installWarRoomMilitaryGallery(group, { wallZ, towardBoard, coarsePointer });
  tuneWarRoomGalleryTorchWallWash(group);

  // Desktop static work shares the painting canvas and gets exactly one first
  // paint before the whole static chain becomes a no-op. Coarse rendering has
  // no canvas and therefore keeps its opt-in wall finalizer intact.
  armWarRoomOneShotHookRetirement(group, {
    anchorName: 'war-room-premium-painting-canvas',
    key: 'canvas-static-first-paint-v1',
    coarsePointer,
  });

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
