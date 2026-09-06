import * as THREE from 'three';
import { registerWarRoomDeferredFinalizer } from './WarRoomDeferredFinalizer.js';

export const WAR_ROOM_COMMAND_DESK_LUXURY_VERSION = 'command-desk-luxury-v1';

function physical(color, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0,
    roughness: options.roughness ?? 0.58,
    clearcoat: options.clearcoat ?? 0.12,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.28,
    specularIntensity: options.specularIntensity ?? 0.32,
    sheen: options.sheen ?? 0,
    sheenColor: options.sheenColor ?? color,
  });
}

function addMesh(group, geometry, material, position, rotation = [0, 0, 0], name = '') {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (name) mesh.name = name;
  group.add(mesh);
  return mesh;
}

function addBox(group, size, material, position, name = '', rotation = [0, 0, 0]) {
  return addMesh(group, new THREE.BoxGeometry(...size), material, position, rotation, name);
}

function tuneExistingDeskMaterials(art) {
  const tuned = new Set();
  const polish = (object, {
    roughnessMax,
    clearcoatMin,
    clearcoatRoughnessMax,
    envMapIntensityMin,
    specularIntensityMin,
  }) => {
    const material = object?.material;
    if (!material || tuned.has(material)) return;
    tuned.add(material);
    material.roughness = Math.min(material.roughness ?? 0.6, roughnessMax);
    material.clearcoat = Math.max(material.clearcoat ?? 0, clearcoatMin);
    material.clearcoatRoughness = Math.min(material.clearcoatRoughness ?? 0.35, clearcoatRoughnessMax);
    material.envMapIntensity = Math.max(material.envMapIntensity ?? 0.5, envMapIntensityMin);
    material.specularIntensity = Math.max(material.specularIntensity ?? 0.25, specularIntensityMin);
    material.needsUpdate = true;
  };

  art.traverse((object) => {
    if (!object?.isMesh) return;
    if (object.name === 'war-room-command-desk-top' || object.name === 'war-room-command-desk-drawer') {
      polish(object, {
        roughnessMax: 0.34,
        clearcoatMin: 0.58,
        clearcoatRoughnessMax: 0.2,
        envMapIntensityMin: 0.92,
        specularIntensityMin: 0.56,
      });
    } else if (object.name === 'war-room-command-desk-pedestal' || object.name === 'war-room-command-desk-foot') {
      polish(object, {
        roughnessMax: 0.43,
        clearcoatMin: 0.36,
        clearcoatRoughnessMax: 0.25,
        envMapIntensityMin: 0.76,
        specularIntensityMin: 0.42,
      });
    } else if (object.name === 'war-room-command-desk-brass-rim' || object.name === 'war-room-command-desk-pull') {
      polish(object, {
        roughnessMax: 0.22,
        clearcoatMin: 0.34,
        clearcoatRoughnessMax: 0.18,
        envMapIntensityMin: 1.08,
        specularIntensityMin: 0.76,
      });
    }
  });

  art.userData.warRoomCommandDeskPremiumMaterialPass = WAR_ROOM_COMMAND_DESK_LUXURY_VERSION;
}

function addBrassCornerGuard(group, brass, x, z) {
  const guard = new THREE.Group();
  guard.name = 'war-room-command-desk-luxury-corner-guard';
  guard.position.set(x, 1.151, z);
  addBox(guard, [0.17, 0.026, 0.045], brass, [0, 0, 0], 'war-room-command-desk-luxury-corner-edge-x');
  addBox(guard, [0.045, 0.026, 0.17], brass, [0, 0, 0], 'war-room-command-desk-luxury-corner-edge-z');
  group.add(guard);
}

function addBankersLamp(group, towardBoard, brass, greenGlass) {
  const lamp = new THREE.Group();
  lamp.name = 'war-room-command-desk-strategy-lamp';
  lamp.userData.commandDeskRole = 'warm-strategy-lamp';
  lamp.userData.warRoomRealLight = 'omitted-emissive-only-v1';
  lamp.position.set(1.17, 0, -towardBoard * 0.13);

  addMesh(lamp, new THREE.CylinderGeometry(0.17, 0.2, 0.045, 20), brass, [0, 1.19, 0], [0, 0, 0], 'war-room-command-desk-lamp-base');
  addMesh(lamp, new THREE.CylinderGeometry(0.026, 0.036, 0.37, 14), brass, [0, 1.39, 0], [0, 0, 0], 'war-room-command-desk-lamp-stem');
  addBox(lamp, [0.42, 0.105, 0.19], greenGlass, [0, 1.585, towardBoard * 0.035], 'war-room-command-desk-lamp-shade');
  addBox(lamp, [0.46, 0.028, 0.215], brass, [0, 1.635, towardBoard * 0.035], 'war-room-command-desk-lamp-cap');
  addMesh(lamp, new THREE.CylinderGeometry(0.036, 0.036, 0.47, 12), brass, [0, 1.585, towardBoard * 0.035], [0, 0, Math.PI / 2], 'war-room-command-desk-lamp-crossbar');

  group.add(lamp);
}

function addCampaignFolio(group, towardBoard, leather, brass, page) {
  const folio = new THREE.Group();
  folio.name = 'war-room-command-desk-campaign-folio';
  folio.userData.commandDeskRole = 'closed-campaign-dossier';
  folio.position.set(1.08, 0, towardBoard * 0.245);
  folio.rotation.y = -towardBoard * 0.055;

  addBox(folio, [0.56, 0.048, 0.36], leather, [0, 1.185, 0], 'war-room-command-desk-campaign-folio-cover');
  addBox(folio, [0.515, 0.026, 0.32], page, [0, 1.187, 0], 'war-room-command-desk-campaign-folio-pages');
  addBox(folio, [0.04, 0.054, 0.34], brass, [-0.245, 1.185, 0], 'war-room-command-desk-campaign-folio-spine');
  for (const x of [-0.235, 0.235]) {
    for (const z of [-0.145, 0.145]) {
      addBox(folio, [0.052, 0.008, 0.052], brass, [x, 1.214, z], 'war-room-command-desk-campaign-folio-corner');
    }
  }

  group.add(folio);
}

function addCommandBadge(group, towardBoard, brass, ebony) {
  const badge = new THREE.Group();
  badge.name = 'war-room-command-desk-command-badge';
  badge.userData.commandDeskRole = 'matthias-command-crest';
  badge.position.set(0, 0.82, towardBoard * 0.515);

  addMesh(badge, new THREE.CylinderGeometry(0.145, 0.145, 0.028, 24), ebony, [0, 0, 0], [Math.PI / 2, 0, 0], 'war-room-command-desk-command-badge-field');
  addBox(badge, [0.185, 0.026, 0.032], brass, [0, 0, towardBoard * 0.02], 'war-room-command-desk-command-badge-cross-horizontal');
  addBox(badge, [0.032, 0.185, 0.026], brass, [0, 0, towardBoard * 0.021], 'war-room-command-desk-command-badge-cross-vertical');
  group.add(badge);
}

function addChairCommandTrim(root, towardBoard, brass) {
  const chair = root.getObjectByName?.('war-room-teutonic-command-chair');
  if (!chair || chair.getObjectByName?.('war-room-command-chair-luxury-trim')) return 0;

  const trim = new THREE.Group();
  trim.name = 'war-room-command-chair-luxury-trim';
  trim.userData.commandDeskRole = 'matthias-strategy-seat-trim';
  for (const side of [-1, 1]) {
    addBox(trim, [0.025, 0.035, 0.54], brass, [side * 0.5, 0.925, towardBoard * 0.015], 'war-room-command-chair-brass-arm-inlay');
  }
  addBox(trim, [0.58, 0.025, 0.025], brass, [0, 1.825, -towardBoard * 0.332], 'war-room-command-chair-brass-crown-inlay');
  chair.add(trim);
  chair.userData.warRoomCommandSeatPurpose = 'matthias-strategy-seat';
  return 1;
}

export function applyWarRoomCommandDeskLuxury(root, { coarsePointer = false, towardBoard = 1 } = {}) {
  if (!root || coarsePointer) return 0;
  const desk = root.getObjectByName?.('command-cabinet');
  const art = desk?.getObjectByName?.('war-room-teutonic-command-desk-v28');
  if (!art || art.getObjectByName?.('war-room-command-desk-luxury-v1')) return 0;

  tuneExistingDeskMaterials(art);

  const walnut = physical(0x28130b, { roughness: 0.3, clearcoat: 0.62, clearcoatRoughness: 0.18, specularIntensity: 0.58 });
  const brass = physical(0xa27633, { metalness: 0.86, roughness: 0.2, clearcoat: 0.36, clearcoatRoughness: 0.16, specularIntensity: 0.78 });
  const leather = physical(0x132a22, { roughness: 0.43, clearcoat: 0.12, clearcoatRoughness: 0.38, specularIntensity: 0.34, sheen: 0.18, sheenColor: 0x3e6a55 });
  const burgundyLeather = physical(0x42171d, { roughness: 0.48, clearcoat: 0.13, clearcoatRoughness: 0.34, specularIntensity: 0.32, sheen: 0.2, sheenColor: 0x73343e });
  const greenGlass = physical(0x173f31, { roughness: 0.24, clearcoat: 0.48, clearcoatRoughness: 0.16, specularIntensity: 0.62 });
  const page = physical(0xcdbf9b, { roughness: 0.82, clearcoat: 0.02, specularIntensity: 0.14 });
  const ebony = physical(0x151313, { roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.2, specularIntensity: 0.5 });

  const luxury = new THREE.Group();
  luxury.name = 'war-room-command-desk-luxury-v1';
  luxury.userData.warRoomCommandDeskLuxuryVersion = WAR_ROOM_COMMAND_DESK_LUXURY_VERSION;
  luxury.userData.warRoomCommandDeskLuxuryPurpose = 'luxurious-military-strategy-desk';

  // A darker leather command mat anchors the chessboard without moving it.
  addBox(luxury, [1.22, 0.018, 1.0], leather, [0, 1.146, 0], 'war-room-command-desk-command-leather-mat');
  addBox(luxury, [1.29, 0.009, 0.022], brass, [0, 1.157, towardBoard * 0.49], 'war-room-command-desk-command-mat-front-inlay');
  addBox(luxury, [1.29, 0.009, 0.022], brass, [0, 1.157, -towardBoard * 0.49], 'war-room-command-desk-command-mat-rear-inlay');

  // Double perimeter inlay and protected corners give the top a field-command feel.
  for (const z of [-0.46, 0.46]) {
    addBox(luxury, [2.82, 0.018, 0.018], brass, [0, 1.151, z], 'war-room-command-desk-luxury-long-inlay');
  }
  for (const x of [-1.42, 1.42]) {
    addBox(luxury, [0.018, 0.018, 0.82], brass, [x, 1.151, 0], 'war-room-command-desk-luxury-side-inlay');
  }
  for (const x of [-1.43, 1.43]) {
    for (const z of [-0.43, 0.43]) addBrassCornerGuard(luxury, brass, x, z);
  }

  // A polished front rail and dark wood sub-rail make the desk read heavier and more expensive.
  addBox(luxury, [2.78, 0.045, 0.026], brass, [0, 1.055, towardBoard * 0.505], 'war-room-command-desk-luxury-front-brass-rail');
  addBox(luxury, [2.55, 0.06, 0.04], walnut, [0, 0.995, towardBoard * 0.492], 'war-room-command-desk-luxury-front-walnut-rail');

  addBankersLamp(luxury, towardBoard, brass, greenGlass);
  addCampaignFolio(luxury, towardBoard, burgundyLeather, brass, page);
  addCommandBadge(luxury, towardBoard, brass, ebony);

  art.add(luxury);
  addChairCommandTrim(root, towardBoard, brass);
  desk.userData.warRoomCommandDeskLuxury = WAR_ROOM_COMMAND_DESK_LUXURY_VERSION;
  return 1;
}

export function installWarRoomCommandDeskLuxury(group, {
  towardBoard = 1,
  coarsePointer = false,
} = {}) {
  if (!group || coarsePointer) return 0;
  const changed = applyWarRoomCommandDeskLuxury(group, { towardBoard, coarsePointer });
  const registered = registerWarRoomDeferredFinalizer(group, {
    key: WAR_ROOM_COMMAND_DESK_LUXURY_VERSION,
    coarsePointer,
    run: (root) => applyWarRoomCommandDeskLuxury(root || group, { towardBoard, coarsePointer }),
  });
  return changed + registered;
}
