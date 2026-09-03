import * as THREE from 'three';
import { registerWarRoomDeferredFinalizer } from './WarRoomDeferredFinalizer.js';

export const WAR_ROOM_APPROVED_MOCK_VERSION = 'approved-mock-v28';
const NOOP_RENDER_HOOK = () => {};

function physical(color, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0,
    roughness: options.roughness ?? 0.68,
    clearcoat: options.clearcoat ?? 0.08,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.38,
    specularIntensity: options.specularIntensity ?? 0.28,
    sheen: options.sheen ?? 0,
    sheenRoughness: options.sheenRoughness ?? 0.62,
    sheenColor: new THREE.Color(options.sheenColor ?? color),
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

function hideChildrenExcept(group, keep) {
  for (const child of group?.children || []) child.visible = child === keep;
}

function ensureTeutonicSofaArt(sofa, towardBoard) {
  if (!sofa) return 0;
  let art = sofa.getObjectByName?.('war-room-teutonic-sofa-art-v28');
  if (art) {
    hideChildrenExcept(sofa, art);
    sofa.userData.warRoomPremiumUpholstery = 'teutonic-carved-burgundy-v28';
    return 0;
  }

  art = new THREE.Group();
  art.name = 'war-room-teutonic-sofa-art-v28';
  art.userData.warRoomFurnitureArt = 'approved-teutonic-sofa-v28';

  const walnut = physical(0x321a10, {
    roughness: 0.46,
    clearcoat: 0.36,
    clearcoatRoughness: 0.24,
    specularIntensity: 0.38,
  });
  const walnutDark = physical(0x1d0f0a, {
    roughness: 0.58,
    clearcoat: 0.24,
    clearcoatRoughness: 0.32,
    specularIntensity: 0.26,
  });
  const burgundy = physical(0x45171d, {
    roughness: 0.46,
    clearcoat: 0.18,
    clearcoatRoughness: 0.34,
    sheen: 0.54,
    sheenRoughness: 0.66,
    sheenColor: 0x9a535d,
  });
  const burgundyHi = physical(0x63242e, {
    roughness: 0.42,
    clearcoat: 0.22,
    clearcoatRoughness: 0.28,
    sheen: 0.6,
    sheenRoughness: 0.6,
    sheenColor: 0xb46a73,
  });
  const brass = physical(0x8a6228, {
    metalness: 0.82,
    roughness: 0.28,
    clearcoat: 0.24,
    clearcoatRoughness: 0.22,
    specularIntensity: 0.68,
  });

  addBox(art, [2.05, 0.17, 0.86], walnutDark, [0, 0.31, 0], 'war-room-sofa-carved-seat-frame');
  addBox(art, [1.76, 0.24, 0.69], burgundyHi, [0, 0.52, towardBoard * 0.01], 'war-room-sofa-burgundy-seat');
  addBox(art, [1.9, 0.12, 0.12], walnut, [0, 1.42, -towardBoard * 0.34], 'war-room-sofa-carved-top-rail');
  addBox(art, [1.62, 0.66, 0.12], burgundy, [0, 1.08, -towardBoard * 0.36], 'war-room-sofa-burgundy-back');
  addBox(art, [0.13, 0.96, 0.15], walnut, [-0.94, 0.98, -towardBoard * 0.34], 'war-room-sofa-back-stile-left');
  addBox(art, [0.13, 0.96, 0.15], walnut, [0.94, 0.98, -towardBoard * 0.34], 'war-room-sofa-back-stile-right');

  for (const side of [-1, 1]) {
    addBox(art, [0.2, 0.5, 0.8], burgundy, [side * 0.97, 0.62, 0], 'war-room-sofa-burgundy-arm');
    addBox(art, [0.23, 0.12, 0.88], walnut, [side * 0.97, 0.86, 0], 'war-room-sofa-carved-arm-rail');
    addMesh(
      art,
      new THREE.SphereGeometry(0.125, 16, 10),
      walnut,
      [side * 0.97, 0.88, towardBoard * 0.38],
      [0, 0, 0],
      'war-room-sofa-scroll-finial',
    );
    addMesh(
      art,
      new THREE.SphereGeometry(0.095, 14, 9),
      brass,
      [side * 0.94, 1.51, -towardBoard * 0.34],
      [0, 0, 0],
      'war-room-sofa-brass-finial',
    );
    addMesh(
      art,
      new THREE.ConeGeometry(0.09, 0.2, 8),
      walnut,
      [side * 0.94, 1.62, -towardBoard * 0.34],
      [0, 0, 0],
      'war-room-sofa-carved-finial-cap',
    );
  }

  for (const legX of [-0.76, 0.76]) {
    for (const legZ of [-0.27, 0.27]) {
      addMesh(
        art,
        new THREE.CylinderGeometry(0.07, 0.09, 0.32, 12),
        walnutDark,
        [legX, 0.16, legZ],
        [0, 0, 0],
        'war-room-sofa-turned-leg',
      );
    }
  }

  addBox(art, [1.72, 0.035, 0.035], brass, [0, 1.43, -towardBoard * 0.275], 'war-room-sofa-brass-top-inlay');
  addBox(art, [1.84, 0.035, 0.035], brass, [0, 0.36, towardBoard * 0.43], 'war-room-sofa-brass-front-inlay');

  for (const x of [-0.54, -0.18, 0.18, 0.54]) {
    for (const y of [0.94, 1.18]) {
      const button = addMesh(
        art,
        new THREE.SphereGeometry(0.032, 10, 7),
        brass,
        [x, y, -towardBoard * 0.292],
        [0, 0, 0],
        'war-room-sofa-tuft-button-v28',
      );
      button.castShadow = false;
    }
  }

  const crest = addMesh(
    art,
    new THREE.CylinderGeometry(0.16, 0.16, 0.045, 16),
    brass,
    [0, 1.52, -towardBoard * 0.285],
    [Math.PI / 2, 0, 0],
    'war-room-sofa-center-medallion',
  );
  crest.castShadow = false;

  hideChildrenExcept(sofa, null);
  sofa.add(art);
  sofa.userData.warRoomPremiumUpholstery = 'teutonic-carved-burgundy-v28';
  sofa.userData.warRoomSofaArtReference = 'generated-teutonic-burgundy-v28';
  return 1;
}

function ensureTeutonicDeskArt(desk, towardBoard) {
  if (!desk) return 0;
  let art = desk.getObjectByName?.('war-room-teutonic-command-desk-v28');
  if (art) {
    hideChildrenExcept(desk, art);
    return 0;
  }

  art = new THREE.Group();
  art.name = 'war-room-teutonic-command-desk-v28';
  art.userData.warRoomFurnitureArt = 'single-command-desk-v28';

  const walnut = physical(0x321b10, { roughness: 0.48, clearcoat: 0.34, clearcoatRoughness: 0.26, specularIntensity: 0.36 });
  const walnutDark = physical(0x1b0f0a, { roughness: 0.62, clearcoat: 0.18, specularIntensity: 0.22 });
  const burgundy = physical(0x42171d, { roughness: 0.52, clearcoat: 0.12, sheen: 0.34, sheenColor: 0x82404a });
  const brass = physical(0x93692a, { metalness: 0.84, roughness: 0.27, clearcoat: 0.24, specularIntensity: 0.68 });

  addBox(art, [3.05, 0.16, 1.0], walnut, [0, 1.03, 0], 'war-room-command-desk-top');
  addBox(art, [3.12, 0.045, 1.04], brass, [0, 1.125, 0], 'war-room-command-desk-brass-rim');
  addBox(art, [1.24, 0.04, 0.58], burgundy, [0, 1.135, towardBoard * 0.02], 'war-room-command-desk-leather-blotter');

  for (const side of [-1, 1]) {
    addBox(art, [0.72, 0.88, 0.78], walnutDark, [side * 1.0, 0.56, -towardBoard * 0.02], 'war-room-command-desk-pedestal');
    for (let drawer = 0; drawer < 3; drawer += 1) {
      const drawerY = 0.31 + drawer * 0.24;
      addBox(art, [0.6, 0.16, 0.045], walnut, [side * 1.0, drawerY, towardBoard * 0.405], 'war-room-command-desk-drawer');
      addMesh(
        art,
        new THREE.TorusGeometry(0.07, 0.011, 8, 16, Math.PI),
        brass,
        [side * 1.0, drawerY, towardBoard * 0.442],
        [Math.PI / 2, 0, 0],
        'war-room-command-desk-pull',
      );
    }
    for (const zSign of [-1, 1]) {
      addMesh(
        art,
        new THREE.CylinderGeometry(0.055, 0.07, 0.16, 12),
        walnutDark,
        [side * 1.17, 0.08, zSign * 0.3],
        [0, 0, 0],
        'war-room-command-desk-foot',
      );
    }
  }

  addBox(art, [1.05, 0.14, 0.08], walnut, [0, 0.9, -towardBoard * 0.42], 'war-room-command-desk-knee-apron');
  hideChildrenExcept(desk, null);
  desk.add(art);
  desk.userData.warRoomFurniture = 'single-command-desk';
  desk.userData.warRoomFurnitureArt = 'teutonic-pedestal-desk-v28';
  return 1;
}

function ensureTeutonicCommandChair(root, { wallZ, towardBoard }) {
  let chair = root.getObjectByName?.('war-room-teutonic-command-chair');
  if (chair) return chair;

  chair = new THREE.Group();
  chair.name = 'war-room-teutonic-command-chair';
  chair.userData.warRoomFurniture = 'high-back-command-chair';
  chair.userData.warRoomFurnitureArt = 'teutonic-carved-burgundy-v28';

  const walnut = physical(0x321a10, { roughness: 0.46, clearcoat: 0.36, clearcoatRoughness: 0.24, specularIntensity: 0.38 });
  const walnutDark = physical(0x1c0f0a, { roughness: 0.58, clearcoat: 0.22, specularIntensity: 0.24 });
  const burgundy = physical(0x4f1b23, { roughness: 0.44, clearcoat: 0.18, sheen: 0.54, sheenColor: 0xa05762 });
  const brass = physical(0x94692b, { metalness: 0.82, roughness: 0.28, clearcoat: 0.24, specularIntensity: 0.66 });

  addBox(chair, [0.9, 0.18, 0.72], walnutDark, [0, 0.49, 0], 'war-room-command-chair-seat-frame');
  addBox(chair, [0.72, 0.18, 0.58], burgundy, [0, 0.61, towardBoard * 0.01], 'war-room-command-chair-seat');
  addBox(chair, [0.82, 1.18, 0.14], walnut, [0, 1.31, -towardBoard * 0.26], 'war-room-command-chair-back-frame');
  addBox(chair, [0.62, 0.88, 0.1], burgundy, [0, 1.32, -towardBoard * 0.185], 'war-room-command-chair-back-pad');
  addBox(chair, [1.02, 0.12, 0.18], walnut, [0, 1.96, -towardBoard * 0.26], 'war-room-command-chair-crown-rail');

  for (const side of [-1, 1]) {
    addBox(chair, [0.12, 1.5, 0.14], walnutDark, [side * 0.46, 1.25, -towardBoard * 0.26], 'war-room-command-chair-back-post');
    addMesh(chair, new THREE.SphereGeometry(0.11, 14, 9), brass, [side * 0.46, 2.08, -towardBoard * 0.26], [0, 0, 0], 'war-room-command-chair-finial');
    addBox(chair, [0.12, 0.62, 0.12], walnutDark, [side * 0.36, 0.2, -towardBoard * 0.18], 'war-room-command-chair-leg');
    addBox(chair, [0.12, 0.62, 0.12], walnutDark, [side * 0.36, 0.2, towardBoard * 0.22], 'war-room-command-chair-leg');
    addBox(chair, [0.16, 0.1, 0.68], walnut, [side * 0.5, 0.88, 0], 'war-room-command-chair-arm');
  }

  for (const [x, y] of [[-0.2, 1.18], [0.2, 1.18], [-0.2, 1.5], [0.2, 1.5]]) {
    const button = addMesh(chair, new THREE.SphereGeometry(0.03, 10, 7), brass, [x, y, -towardBoard * 0.13], [0, 0, 0], 'war-room-command-chair-button');
    button.castShadow = false;
  }

  addMesh(
    chair,
    new THREE.CylinderGeometry(0.14, 0.14, 0.04, 16),
    brass,
    [0, 2.02, -towardBoard * 0.15],
    [Math.PI / 2, 0, 0],
    'war-room-command-chair-medallion',
  );

  chair.position.set(0, 0, wallZ + towardBoard * 0.55);
  root.add(chair);
  return chair;
}

function bulkUpArmorLegs(armor) {
  if (!armor) return 0;
  let changed = 0;
  armor.traverse?.((object) => {
    switch (object?.name) {
      case 'war-room-armor-greave':
        object.scale.set(1.38, 1, 1.06);
        changed += 1;
        break;
      case 'war-room-armor-cuisse':
        object.scale.set(1.3, 1.02, 1.06);
        changed += 1;
        break;
      case 'war-room-armor-poleyn':
        object.scale.set(1.26, 0.9, 1.02);
        changed += 1;
        break;
      case 'war-room-armor-sabaton':
        object.scale.set(1.16, 1.08, 1.16);
        changed += 1;
        break;
      default:
        break;
    }
  });
  armor.userData.warRoomArmorLegProfile = 'heavy-gothic-v28';
  armor.userData.warRoomArmorArtReference = 'generated-heavy-sentry-v28';
  return changed;
}

function poseArmorChestHighGuard(armor, towardBoard) {
  if (!armor) return 0;
  let changed = 0;

  armor.traverse?.((object) => {
    const armSide = Math.sign(object?.position?.x || 0);
    switch (object?.name) {
      case 'war-room-armor-rerebrace':
        if (!armSide) break;
        object.position.set(armSide * 0.355, 1.56, towardBoard * 0.08);
        object.rotation.set(0, 0, armSide * 0.48);
        changed += 1;
        break;
      case 'war-room-armor-couter':
        if (!armSide) break;
        object.position.set(armSide * 0.27, 1.41, towardBoard * 0.13);
        changed += 1;
        break;
      case 'war-room-armor-elbow-wing':
        if (!armSide) break;
        object.position.set(armSide * 0.39, 1.41, towardBoard * 0.12);
        object.rotation.set(0, 0, -armSide * Math.PI / 2);
        changed += 1;
        break;
      case 'war-room-armor-vambrace':
        if (!armSide) break;
        object.position.set(armSide * 0.18, armSide < 0 ? 1.455 : 1.375, towardBoard * 0.23);
        object.rotation.set(0, 0, armSide * 1.05);
        changed += 1;
        break;
      case 'war-room-armor-vambrace-flute':
        if (!armSide) break;
        object.position.set(armSide * 0.18, armSide < 0 ? 1.455 : 1.375, towardBoard * 0.295);
        object.rotation.set(0, 0, armSide * 1.05);
        changed += 1;
        break;
      case 'war-room-armor-gauntlet':
        if (!armSide) break;
        object.position.set(armSide * 0.07, armSide < 0 ? 1.5 : 1.34, towardBoard * 0.39);
        changed += 1;
        break;
      case 'war-room-zweihander':
        object.position.set(0, 0.7, towardBoard * 0.44);
        object.userData.warRoomSwordCarry = 'chest-high-guard-v28';
        changed += 1;
        break;
      default:
        break;
    }
  });

  armor.userData.warRoomArmorPose = 'chest-high-zweihander-guard-v28';
  armor.userData.warRoomArmorArtReference = 'generated-heavy-sentry-chest-guard-v28';
  return changed;
}

function placeFurniture(root, { wallZ, towardBoard }) {
  const deskOffset = 1.45;
  const chairOffset = 0.55;
  const armorOffset = 6.95;
  const sofaOffset = 12.55;
  let changed = 0;

  for (const name of ['war-room-side-console-left', 'war-room-side-console-right']) {
    const table = root.getObjectByName?.(name);
    if (!table) continue;
    table.visible = false;
    table.userData.warRoomFurniturePlacement = 'retired-duplicate-side-table-v28';
    changed += 1;
  }

  const desk = root.getObjectByName?.('command-cabinet');
  if (desk) {
    ensureTeutonicDeskArt(desk, towardBoard);
    desk.visible = true;
    desk.position.set(0, 0.38, wallZ + towardBoard * deskOffset);
    desk.rotation.y = 0;
    desk.userData.warRoomOffsetFromWall = deskOffset;
    desk.userData.warRoomFurniturePlacement = 'approved-mock-single-command-desk-v28';
    changed += 1;
  }

  const chair = ensureTeutonicCommandChair(root, { wallZ, towardBoard });
  chair.position.set(0, 0, wallZ + towardBoard * chairOffset);
  chair.userData.warRoomOffsetFromWall = chairOffset;
  chair.userData.warRoomFurniturePlacement = 'approved-mock-command-chair-v28';
  chair.userData.facesWarTable = true;

  for (const [name, side] of [
    ['war-room-teutonic-armor-left', -1],
    ['war-room-teutonic-armor-right', 1],
  ]) {
    const armor = root.getObjectByName?.(name);
    if (!armor) continue;
    armor.position.set(side * 7.08, 0, wallZ + towardBoard * armorOffset);
    armor.rotation.y = Math.atan2((-armor.position.x) * towardBoard, (-armor.position.z) * towardBoard);
    bulkUpArmorLegs(armor);
    poseArmorChestHighGuard(armor, towardBoard);
    armor.userData.warRoomOffsetFromWall = armorOffset;
    armor.userData.warRoomArmorPlacement = 'approved-mock-wall-sentry-v28';
    armor.userData.warRoomWallClearance = 0.19;
    armor.userData.facesWarTable = true;
    changed += 1;
  }

  for (const [name, side] of [
    ['war-room-sofa-left', -1],
    ['war-room-sofa-right', 1],
  ]) {
    const sofa = root.getObjectByName?.(name);
    if (!sofa) continue;
    ensureTeutonicSofaArt(sofa, towardBoard);
    sofa.position.set(side * 6.55, 0.02, wallZ + towardBoard * sofaOffset);
    sofa.rotation.y = -side * towardBoard * Math.PI / 2;
    sofa.userData.warRoomOffsetFromWall = sofaOffset;
    sofa.userData.warRoomFurniturePlacement = 'approved-mock-front-sofa-v28';
    sofa.userData.facesWarTable = true;
    changed += 1;
  }

  root.userData.warRoomFurnitureLayoutOwner = WAR_ROOM_APPROVED_MOCK_VERSION;
  root.userData.warRoomApprovedMockFurnitureOrder = 'single-desk-rear-armors-mid-sofas-foreground-v28';
  root.userData.warRoomApprovedMockDeskOffset = deskOffset;
  root.userData.warRoomApprovedMockChairOffset = chairOffset;
  root.userData.warRoomApprovedMockArmorOffset = armorOffset;
  root.userData.warRoomApprovedMockSofaOffset = sofaOffset;
  root.userData.warRoomApprovedMockArmorSofaGap = sofaOffset - armorOffset;
  root.userData.warRoomApprovedMockSideTablesRetired = true;
  return changed + 1;
}

const WALL_CLUTTER_NAMES = new Set([
  'war-room-armor-alcove-left',
  'war-room-armor-alcove-right',
  'war-room-gallery-picture-rail',
  'war-room-gallery-picture-rail-brass-line',
  'war-room-hammerbeam-side-tie',
  'war-room-hammerbeam-corbel',
  'war-room-hammerbeam-brace',
  'war-room-armor-alcove-pointed-arch',
]);

function retireWallClutter(root) {
  let retired = 0;
  root.traverse?.((object) => {
    if (!WALL_CLUTTER_NAMES.has(object?.name)) return;
    if (object.visible !== false) retired += 1;
    object.visible = false;
    object.userData.warRoomApprovedMockWall = 'clean-panel-v28';
  });
  root.userData.warRoomApprovedMockWallClutterRetired = retired;
  root.userData.warRoomApprovedMockWallStyle = 'plain-dark-castle-panel-v28';
  return retired;
}

function isCurtainPelmet(object) {
  if (!object?.isMesh || object.geometry?.type !== 'SphereGeometry') return false;
  const material = Array.isArray(object.material) ? object.material[0] : object.material;
  const velvetLike = (material?.roughness ?? 0) >= 0.75 && (material?.sheen ?? 0) >= 0.3;
  return velvetLike
    && object.scale.x >= 1.25
    && object.scale.y <= 0.5
    && object.scale.z <= 0.5;
}

function straightenCurtains(root) {
  let folds = 0;
  let pelmets = 0;
  root.traverse?.((object) => {
    if (object?.name?.includes?.('war-room-velvet-curtain-fold')) {
      object.rotation.z = 0;
      object.userData.warRoomCurtainProfile = 'straight-drop-v28';
      folds += 1;
      return;
    }
    if (!isCurtainPelmet(object)) return;
    object.visible = false;
    object.userData.warRoomCurtainPelmet = 'retired-v28';
    pelmets += 1;
  });
  root.userData.warRoomApprovedMockCurtainFolds = folds;
  root.userData.warRoomApprovedMockCurtainPelmetsRetired = pelmets;
  root.userData.warRoomApprovedMockCurtainStyle = 'straight-no-upper-doubling-v28';
  return folds + pelmets;
}

function retireLegacyLayoutDrivers(root) {
  let retired = 0;
  const retiredDrivers = [];
  root.traverse?.((object) => {
    if (object?.userData?.warRoomFinalRefinementDriver !== true) return;
    if (object.userData.warRoomApprovedMockLayoutDriverRetired === WAR_ROOM_APPROVED_MOCK_VERSION) return;

    object.onBeforeRender = NOOP_RENDER_HOOK;
    object.userData.warRoomApprovedMockLayoutDriverRetired = WAR_ROOM_APPROVED_MOCK_VERSION;
    object.userData.warRoomApprovedMockLayoutDriverRetirement = 'marker-owned-one-shot-v28';
    retiredDrivers.push(object.name || object.type || 'unnamed');
    retired += 1;
  });

  root.userData.warRoomLegacyLayoutDriversRetired = retiredDrivers;
  root.userData.warRoomLegacyLayoutDriverRetirementVersion = WAR_ROOM_APPROVED_MOCK_VERSION;
  return retired;
}

export function applyWarRoomApprovedMockContract(root, {
  wallZ,
  towardBoard,
  coarsePointer = false,
} = {}) {
  if (!root || coarsePointer || !Number.isFinite(wallZ) || !Number.isFinite(towardBoard)) return 0;
  const retiredDrivers = retireLegacyLayoutDrivers(root);
  const furniture = placeFurniture(root, { wallZ, towardBoard });
  const walls = retireWallClutter(root);
  const curtains = straightenCurtains(root);
  root.userData.warRoomApprovedMockVersion = WAR_ROOM_APPROVED_MOCK_VERSION;
  return retiredDrivers + furniture + walls + curtains;
}

export function installWarRoomApprovedMockContract(group, options = {}) {
  if (!group || options.coarsePointer) return 0;
  applyWarRoomApprovedMockContract(group, options);

  const markerDriver = group.getObjectByName?.('war-room-castle-wall-left')
    || group.getObjectByName?.('war-room-velvet-curtain-fold')
    || group.getObjectByName?.('war-room-castle-floor-slab');
  if (!markerDriver || markerDriver.userData.warRoomApprovedMockDriver === WAR_ROOM_APPROVED_MOCK_VERSION) return 0;

  const registered = registerWarRoomDeferredFinalizer(group, {
    key: 'approved-mock-v28',
    coarsePointer: options.coarsePointer,
    run: (root) => applyWarRoomApprovedMockContract(root || group, options),
  });
  if (!registered) return 0;

  markerDriver.userData.warRoomApprovedMockDriver = WAR_ROOM_APPROVED_MOCK_VERSION;
  group.userData.warRoomApprovedMockDriver = WAR_ROOM_APPROVED_MOCK_VERSION;
  group.userData.warRoomApprovedMockExecution = 'shared-finalizer-marker-driver-retirement-v7';
  return 1;
}
