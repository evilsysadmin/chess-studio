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
import { armWarRoomOneShotHookRetirement, registerWarRoomDeferredFinalizer } from './WarRoomDeferredFinalizer.js';
import { installWarRoomMilitaryGallery } from './WarRoomMilitaryGallery.js';
import { installWarRoomHansSceneRoutine } from './WarRoomHansIteration.js';
import { applyWarRoomPerformanceBudget } from './WarRoomPerformanceBudget.js';

const TORCH_WALL_WASH_VERSION = 'hearth-contour-v3';
const TORCH_FLAME_FINISH_VERSION = 'hearth-warm-v2';
const TORCH_FLAME_PULSE_VERSION = 'hearth-flame-pulse-v2';
const GALLERY_PAINTING_ORIENTATION_VERSION = 'upright-texture-v1';

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

export function correctWarRoomGalleryPaintingOrientation(group) {
  if (!group) return 0;
  let corrected = 0;

  const frames = [
    group.getObjectByName?.('war-room-premium-painting-0'),
    group.getObjectByName?.('war-room-premium-painting-1'),
    group.getObjectByName?.('war-room-campaign-painting-left'),
    group.getObjectByName?.('war-room-campaign-painting-right'),
  ];

  for (const frame of frames) {
    if (!frame) continue;
    const canvas = frame.getObjectByName?.('war-room-premium-painting-canvas')
      || frame.getObjectByName?.('war-room-campaign-side-canvas');
    const texture = canvas?.material?.map;
    if (!texture?.userData?.warRoomCampaignArt) continue;
    if (texture.flipY === true && texture.userData.warRoomPaintingOrientation === GALLERY_PAINTING_ORIENTATION_VERSION) continue;

    texture.flipY = true;
    texture.needsUpdate = true;
    texture.userData.warRoomPaintingOrientation = GALLERY_PAINTING_ORIENTATION_VERSION;
    frame.userData.warRoomPaintingOrientation = GALLERY_PAINTING_ORIENTATION_VERSION;
    corrected += 1;
  }

  return corrected;
}

function registerGalleryPaintingOrientationFinalizer(group, coarsePointer) {
  return registerWarRoomDeferredFinalizer(group, {
    key: 'gallery-painting-orientation-upright-v1',
    coarsePointer,
    run: (root) => correctWarRoomGalleryPaintingOrientation(root || group),
  });
}

function registerHansFireplaceFinalizer(group, towardBoard, coarsePointer) {
  return registerWarRoomDeferredFinalizer(group, {
    key: 'hans-fireplace-scene-install-v2',
    coarsePointer,
    run: (root) => installWarRoomHansSceneRoutine(root || group, { towardBoard, coarsePointer }),
  });
}

export function tuneWarRoomGalleryTorchWallWash(group) {
  if (!group) return 0;
  let tuned = 0;

  for (const side of ['left', 'right']) {
    const torch = group.getObjectByName?.(`war-room-side-torch-${side}`);
    if (!torch) continue;

    const needsWallWash = torch.userData.warRoomTorchWallWash !== TORCH_WALL_WASH_VERSION;
    const needsFlameFinish = torch.userData.warRoomTorchFlameFinish !== TORCH_FLAME_FINISH_VERSION;
    if (!needsWallWash && !needsFlameFinish) continue;

    const halo = torch.getObjectByName?.('war-room-side-torch-wall-halo');
    if (needsWallWash && halo?.material) {
      halo.material.color?.setHex?.(0xff7622);
      halo.material.opacity = 0.94;
      halo.material.toneMapped = false;
      halo.material.needsUpdate = true;
      halo.scale.set(1.78, 1.68, 1);

      let innerHalo = torch.getObjectByName?.('war-room-side-torch-wall-halo-inner');
      if (!innerHalo) {
        innerHalo = halo.clone();
        innerHalo.name = 'war-room-side-torch-wall-halo-inner';
        innerHalo.material = halo.material.clone();
        innerHalo.position.z += 0.004;
        innerHalo.renderOrder = Math.max(2, Number(halo.renderOrder || 0) + 1);
        innerHalo.castShadow = false;
        innerHalo.receiveShadow = false;
        torch.add(innerHalo);
      }
      innerHalo.material.color?.setHex?.(0xffb24d);
      innerHalo.material.opacity = 0.74;
      innerHalo.material.toneMapped = false;
      innerHalo.material.needsUpdate = true;
      innerHalo.scale.set(0.84, 0.84, 1);
    }

    const outer = torch.getObjectByName?.('war-room-side-torch-flame-outer');
    const inner = torch.getObjectByName?.('war-room-side-torch-flame-inner');
    const embers = torch.getObjectByName?.('war-room-side-torch-embers');

    if (needsFlameFinish) {
      for (const [mesh, color, emissive, emissiveIntensity, opacity] of [
        [outer, 0xff5a08, 0xff1600, 1.15, 0.96],
        [inner, 0xffb83d, 0xff4a08, 1.45, 0.94],
      ]) {
        const material = mesh?.material;
        if (!material) continue;
        material.color?.setHex?.(color);
        material.emissive?.setHex?.(emissive);
        material.emissiveIntensity = emissiveIntensity;
        material.opacity = opacity;
        material.toneMapped = false;
        material.needsUpdate = true;
      }

      if (embers?.material) {
        embers.material.color?.setHex?.(0x8f1c06);
        embers.material.emissive?.setHex?.(0xff2100);
        embers.material.emissiveIntensity = 1.9;
        embers.material.toneMapped = false;
        embers.material.needsUpdate = true;
      }
    }

    const light = torch.getObjectByName?.('war-room-side-torch-light');
    const wallGlow = torch.getObjectByName?.('war-room-side-torch-wall-glow');
    if (needsWallWash && light) {
      light.color?.setHex?.(0xff7424);
      light.distance = Math.max(Number(light.distance || 0), 12);
      light.intensity *= 1.5;
    }
    if (needsWallWash && wallGlow) {
      wallGlow.color?.setHex?.(0xffa442);
      wallGlow.distance = Math.max(Number(wallGlow.distance || 0), 8.6);
      wallGlow.intensity *= 2.5;
    }

    if (needsWallWash && outer?.onBeforeRender && !outer.userData.warRoomTorchWallWashHook) {
      const original = outer.onBeforeRender;
      outer.onBeforeRender = (...args) => {
        original(...args);
        if (light) light.intensity *= 1.5;
        if (wallGlow) wallGlow.intensity *= 2.5;
      };
      outer.userData.warRoomTorchWallWashHook = TORCH_WALL_WASH_VERSION;
    }

    if (needsFlameFinish && outer?.onBeforeRender && !outer.userData.warRoomTorchFlamePulseHook) {
      const original = outer.onBeforeRender;
      const outerBaseEmissive = Number(outer.material?.emissiveIntensity || 1.15);
      const innerBaseEmissive = Number(inner?.material?.emissiveIntensity || 1.45);
      outer.onBeforeRender = (...args) => {
        original(...args);
        outer.scale.x *= 1.14;
        outer.scale.y *= 1.06;
        outer.scale.z *= 1.06;
        if (inner) {
          inner.scale.x *= 0.68;
          inner.scale.y *= 0.82;
          inner.scale.z *= 0.72;
        }

        const baseLight = Number(light?.userData?.baseWarRoomIntensity || 0);
        const boostedBase = baseLight > 0 ? baseLight * 1.5 : 0;
        const flamePulse = boostedBase > 0
          ? THREE.MathUtils.clamp(light.intensity / boostedBase, 0.92, 1.1)
          : 1;
        if (outer.material) outer.material.emissiveIntensity = outerBaseEmissive * flamePulse;
        if (inner?.material) {
          const innerPulse = THREE.MathUtils.clamp(0.985 + (flamePulse - 1) * 0.55, 0.94, 1.045);
          inner.material.emissiveIntensity = innerBaseEmissive * innerPulse;
        }
      };
      outer.userData.warRoomTorchFlamePulseHook = TORCH_FLAME_PULSE_VERSION;
    }

    if (needsWallWash) torch.userData.warRoomTorchWallWash = TORCH_WALL_WASH_VERSION;
    if (needsFlameFinish) torch.userData.warRoomTorchFlameFinish = TORCH_FLAME_FINISH_VERSION;
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
  registerHansFireplaceFinalizer(group, towardBoard, coarsePointer);
  correctWarRoomGalleryPaintingOrientation(group);
  registerGalleryPaintingOrientationFinalizer(group, coarsePointer);
  tuneWarRoomGalleryTorchWallWash(group);

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

  const performanceBudget = applyWarRoomPerformanceBudget(group, { coarsePointer });
  group.userData.warRoomPerformancePointLightsKept = performanceBudget.pointLightsKept;
  group.userData.warRoomPerformancePointLightsCulled = performanceBudget.pointLightsCulled;
  group.userData.warRoomPerformanceSpotLightsCulled = performanceBudget.spotLightsCulled;

  group.userData.warRoomPracticalLightingVersion = 'museum-v4';
  group.userData.warRoomPracticalLightCount = lightCount;
  group.userData.warRoomPracticalMaterialsTuned = tunedMaterials;
  return lightCount;
}
