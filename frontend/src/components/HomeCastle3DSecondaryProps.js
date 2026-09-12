import * as THREE from 'three';
import { homeCastleDestinationPropScale } from './HomeCastle3DProps.js';

export const HOME_CASTLE_SECONDARY_PROP_ANCHORS = Object.freeze({
  history: Object.freeze({ x: -1.24, y: -0.105, z: 0.31 }),
  combat: Object.freeze({ x: 0.34, y: 0.055, z: 0.285 }),
});

function attachViewportScale(group, driverMesh, baseScale) {
  group.userData.baseScale = baseScale;
  group.scale.setScalar(baseScale);
  driverMesh.onBeforeRender = (renderer, _scene, camera) => {
    const cameraWidth = Math.abs((camera?.right ?? 0) - (camera?.left ?? 0));
    const cameraHeight = Math.abs((camera?.top ?? 0) - (camera?.bottom ?? 0));
    const cameraAspect = cameraHeight > 0 ? cameraWidth / cameraHeight : 1.6;
    const canvas = renderer?.domElement;
    const canvasRect = canvas?.getBoundingClientRect?.();
    const canvasWidth = Math.max(1, canvasRect?.width || canvas?.clientWidth || 1);
    const view = canvas?.ownerDocument?.defaultView
      || (typeof window !== 'undefined' ? window : null);
    const viewportWidth = Math.max(1, view?.innerWidth || canvasWidth);
    const viewportHeight = Math.max(1, view?.innerHeight || (canvasWidth / cameraAspect));
    const viewportAspect = viewportWidth / viewportHeight;
    const visibleWidthRatio = Math.min(1, viewportWidth / canvasWidth);
    group.scale.setScalar(
      baseScale * homeCastleDestinationPropScale(viewportAspect, visibleWidthRatio),
    );
  };
}

function createHistoryChronicle(resources) {
  const group = new THREE.Group();
  group.name = 'home-castle-prop-history';
  group.userData.destination = 'history';
  group.position.set(
    HOME_CASTLE_SECONDARY_PROP_ANCHORS.history.x,
    HOME_CASTLE_SECONDARY_PROP_ANCHORS.history.y,
    HOME_CASTLE_SECONDARY_PROP_ANCHORS.history.z,
  );
  group.rotation.z = -0.025;

  const parchment = new THREE.MeshStandardMaterial({
    color: 0xd9c18f,
    roughness: 0.92,
    metalness: 0,
    emissive: 0x463116,
    emissiveIntensity: 0.08,
  });
  const leather = new THREE.MeshStandardMaterial({
    color: 0x58341f,
    roughness: 0.83,
    metalness: 0.015,
    emissive: 0x160a04,
    emissiveIntensity: 0.035,
  });
  const wax = new THREE.MeshStandardMaterial({
    color: 0x8f2d23,
    roughness: 0.7,
    metalness: 0.02,
    emissive: 0x260502,
    emissiveIntensity: 0.035,
  });
  resources.materials.push(parchment, leather, wax);

  const supportGeometry = new THREE.BoxGeometry(0.135, 0.012, 0.062);
  const sheetGeometry = new THREE.BoxGeometry(0.115, 0.075, 0.006);
  const rollerGeometry = new THREE.CylinderGeometry(0.0065, 0.0065, 0.128, 12);
  const sealGeometry = new THREE.CylinderGeometry(0.012, 0.012, 0.006, 16);
  resources.geometries.push(
    supportGeometry,
    sheetGeometry,
    rollerGeometry,
    sealGeometry,
  );

  const support = new THREE.Mesh(supportGeometry, leather);
  support.position.y = 0.006;

  const sheet = new THREE.Mesh(sheetGeometry, parchment);
  sheet.position.set(0, 0.055, 0.006);
  sheet.rotation.x = -0.06;

  const topRoll = new THREE.Mesh(rollerGeometry, leather);
  topRoll.position.set(0, 0.094, 0.006);
  topRoll.rotation.z = Math.PI / 2;

  const bottomRoll = new THREE.Mesh(rollerGeometry, leather);
  bottomRoll.position.set(0, 0.016, 0.006);
  bottomRoll.rotation.z = Math.PI / 2;

  const seal = new THREE.Mesh(sealGeometry, wax);
  seal.name = 'home-castle-history-seal';
  seal.position.set(0.033, 0.033, 0.013);
  seal.rotation.x = Math.PI / 2;

  group.add(support, sheet, topRoll, bottomRoll, seal);
  attachViewportScale(group, support, 0.72);
  return group;
}

function createCombatHeraldry(resources) {
  const group = new THREE.Group();
  group.name = 'home-castle-prop-combat';
  group.userData.destination = 'combat';
  group.position.set(
    HOME_CASTLE_SECONDARY_PROP_ANCHORS.combat.x,
    HOME_CASTLE_SECONDARY_PROP_ANCHORS.combat.y,
    HOME_CASTLE_SECONDARY_PROP_ANCHORS.combat.z,
  );
  group.rotation.z = 0.015;

  const steel = new THREE.MeshStandardMaterial({
    color: 0x6f7679,
    roughness: 0.55,
    metalness: 0.6,
    emissive: 0x111517,
    emissiveIntensity: 0.05,
  });
  const darkSteel = new THREE.MeshStandardMaterial({
    color: 0x303538,
    roughness: 0.68,
    metalness: 0.5,
    emissive: 0x090b0c,
    emissiveIntensity: 0.03,
  });
  const brass = new THREE.MeshStandardMaterial({
    color: 0xa77b39,
    roughness: 0.56,
    metalness: 0.46,
    emissive: 0x2b1805,
    emissiveIntensity: 0.055,
  });
  resources.materials.push(steel, darkSteel, brass);

  const shieldGeometry = new THREE.CylinderGeometry(0.052, 0.052, 0.013, 8);
  const bossGeometry = new THREE.CylinderGeometry(0.016, 0.016, 0.017, 16);
  const bladeGeometry = new THREE.BoxGeometry(0.009, 0.155, 0.007);
  const guardGeometry = new THREE.BoxGeometry(0.044, 0.008, 0.009);
  const gripGeometry = new THREE.BoxGeometry(0.012, 0.036, 0.01);
  resources.geometries.push(
    shieldGeometry,
    bossGeometry,
    bladeGeometry,
    guardGeometry,
    gripGeometry,
  );

  const createSword = (rotationZ) => {
    const sword = new THREE.Group();
    sword.rotation.z = rotationZ;
    sword.position.z = -0.012;

    const blade = new THREE.Mesh(bladeGeometry, steel);
    blade.position.y = 0.018;
    const guard = new THREE.Mesh(guardGeometry, brass);
    guard.position.y = -0.056;
    const grip = new THREE.Mesh(gripGeometry, darkSteel);
    grip.position.y = -0.077;
    sword.add(blade, guard, grip);
    return sword;
  };

  const leftSword = createSword(-0.68);
  const rightSword = createSword(0.68);

  const shield = new THREE.Mesh(shieldGeometry, darkSteel);
  shield.name = 'home-castle-combat-shield';
  shield.rotation.x = Math.PI / 2;
  shield.scale.set(1, 1, 1.14);

  const boss = new THREE.Mesh(bossGeometry, brass);
  boss.position.z = 0.012;
  boss.rotation.x = Math.PI / 2;

  group.add(leftSword, rightSword, shield, boss);
  attachViewportScale(group, shield, 0.74);
  return group;
}

export function createHomeCastleSecondaryDestinationProps() {
  const group = new THREE.Group();
  group.name = 'home-castle-secondary-destination-props';

  const resources = { geometries: [], materials: [] };
  const history = createHistoryChronicle(resources);
  const combat = createCombatHeraldry(resources);
  group.add(history, combat);

  return {
    group,
    history,
    combat,
    dispose() {
      for (const geometry of resources.geometries) geometry.dispose();
      for (const material of resources.materials) material.dispose();
    },
  };
}
