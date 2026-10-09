import * as THREE from 'three';
import { buildSchoolRoomLayer } from './SchoolRoomShell.js';

const COLORS = Object.freeze({
  walnutWarm: 0x5a321c,
  burgundyDark: 0x2e1015,
  emerald: 0x245542,
  brass: 0xc5963f,
});

function material(color, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0.08,
    roughness: options.roughness ?? 0.56,
    clearcoat: options.clearcoat ?? 0.28,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.2,
    sheen: options.sheen ?? 0.08,
    sheenRoughness: options.sheenRoughness ?? 0.5,
    sheenColor: new THREE.Color(options.sheenColor ?? color),
    ior: options.ior ?? 1.48,
    specularIntensity: options.specularIntensity ?? 0.72,
    specularColor: new THREE.Color(options.specularColor ?? 0xffffff),
    transparent: options.opacity != null && options.opacity < 1,
    opacity: options.opacity ?? 1,
    depthWrite: options.depthWrite ?? true,
  });
}

function addMesh(group, geometry, mat, position, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addTableEdgeWear(group, coarsePointer = false) {
  if (coarsePointer) return;
  const wear = material(0x7b5730, {
    metalness: 0.02,
    roughness: 0.82,
    clearcoat: 0.02,
    opacity: 0.48,
    specularIntensity: 0.18,
  });
  for (const [x, z, sx, sz] of [
    [-3.8, -5.245, 0.48, 0.022],
    [-1.25, -5.245, 0.25, 0.018],
    [2.72, -5.245, 0.4, 0.02],
    [5.245, -2.95, 0.022, 0.42],
    [5.245, 2.1, 0.02, 0.3],
    [-5.245, 1.1, 0.02, 0.36],
  ]) addMesh(group, new THREE.BoxGeometry(sx, 0.012, sz), wear, [x, 0.055, z]);
}

function buildPremiumSchoolTableLayer(theme, coarsePointer = false) {
  const group = new THREE.Group();
  group.name = 'premium-table-layer';
  group.userData.premiumPass = 'cinematic-v3-teutonic';

  const brass = material(theme?.glow ?? COLORS.brass, {
    metalness: 0.86, roughness: 0.2, clearcoat: 0.76, clearcoatRoughness: 0.07,
  });
  const leather = material(COLORS.burgundyDark, {
    roughness: 0.46, clearcoat: 0.3, clearcoatRoughness: 0.16,
    sheen: 0.38, sheenColor: 0x8c4c56,
  });
  const walnut = material(COLORS.walnutWarm, {
    metalness: 0.04, roughness: 0.4, clearcoat: 0.54, clearcoatRoughness: 0.14,
  });
  const emerald = material(COLORS.emerald, {
    roughness: 0.42, clearcoat: 0.34, sheen: 0.22, sheenColor: 0x6ea88c,
  });

  addMesh(group, new THREE.BoxGeometry(10.25, 0.07, 10.25), leather, [0, -0.165, 0]);

  for (const [x, z, sx, sz] of [
    [0, 5.23, 10.55, 0.18], [0, -5.23, 10.55, 0.18],
    [5.23, 0, 0.18, 10.55], [-5.23, 0, 0.18, 10.55],
  ]) addMesh(group, new THREE.BoxGeometry(sx, 0.2, sz), walnut, [x, -0.08, z]);

  for (const [x, z, sx, sz] of [
    [0, 5.1, 10.24, 0.045], [0, -5.1, 10.24, 0.045],
    [5.1, 0, 0.045, 10.24], [-5.1, 0, 0.045, 10.24],
  ]) addMesh(group, new THREE.BoxGeometry(sx, 0.075, sz), brass, [x, 0.035, z]);

  const emeraldInlay = new THREE.Group();
  emeraldInlay.name = 'emerald-table-inlay';
  for (const [x, z, sx, sz] of [
    [0, 4.88, 9.74, 0.055], [0, -4.88, 9.74, 0.055],
    [4.88, 0, 0.055, 9.74], [-4.88, 0, 0.055, 9.74],
  ]) addMesh(emeraldInlay, new THREE.BoxGeometry(sx, 0.04, sz), emerald, [x, 0.045, z]);
  group.add(emeraldInlay);

  const cornerSegments = coarsePointer ? 12 : 22;
  for (const x of [-5.15, 5.15]) {
    for (const z of [-5.15, 5.15]) {
      addMesh(group, new THREE.CylinderGeometry(0.16, 0.2, 0.12, cornerSegments), brass, [x, 0.01, z]);
      addMesh(group, new THREE.SphereGeometry(0.08, cornerSegments, 8), brass, [x, 0.11, z]);
      if (!coarsePointer) {
        addMesh(group, new THREE.TorusGeometry(0.11, 0.018, 8, cornerSegments), emerald, [x, 0.12, z], [Math.PI / 2, 0, 0]);
      }
    }
  }

  group.userData.warRoomRetiredTableClutterMeshesOmitted = coarsePointer ? 13 : 20;
  addTableEdgeWear(group, coarsePointer);
  return group;
}

function buildBoardFurniture(boardGroup, theme) {
  const table = new THREE.Mesh(
    new THREE.BoxGeometry(11.6, 0.55, 11.6),
    new THREE.MeshPhysicalMaterial({
      color: 0x1f120c,
      metalness: 0.08,
      roughness: 0.6,
      clearcoat: 0.28,
      clearcoatRoughness: 0.25,
      envMapIntensity: 0.74,
    }),
  );
  table.name = 'school-room-board-table';
  table.position.y = -0.48;
  table.receiveShadow = true;

  const frame = new THREE.Group();
  frame.name = 'war-room-classic-board-frame';
  boardGroup.add(frame);

  const pedestal = new THREE.Mesh(
    new THREE.BoxGeometry(9.35, 0.4, 9.35),
    new THREE.MeshPhysicalMaterial({
      color: theme.frame,
      metalness: 0.08,
      roughness: 0.67,
      clearcoat: 0.18,
      clearcoatRoughness: 0.36,
      envMapIntensity: 0.48,
      specularIntensity: 0.42,
    }),
  );
  pedestal.position.y = -0.22;
  pedestal.receiveShadow = true;
  frame.add(pedestal);

  const frameGold = new THREE.MeshPhysicalMaterial({
    color: 0xa77a2d,
    metalness: 0.72,
    roughness: 0.24,
    clearcoat: 0.68,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.2,
  });
  const frameWood = new THREE.MeshPhysicalMaterial({
    color: theme.frame,
    metalness: 0.025,
    roughness: 0.7,
    clearcoat: 0.15,
    clearcoatRoughness: 0.4,
    envMapIntensity: 0.42,
    specularIntensity: 0.36,
  });

  for (const [x, z, sx, sz] of [
    [0, 4.38, 9.05, 0.28], [0, -4.38, 9.05, 0.28],
    [4.38, 0, 0.28, 9.05], [-4.38, 0, 0.28, 9.05],
  ]) addMesh(frame, new THREE.BoxGeometry(sx, 0.18, sz), frameWood, [x, 0.03, z]);

  for (const [x, z, sx, sz] of [
    [0, 4.16, 8.55, 0.055], [0, -4.16, 8.55, 0.055],
    [4.16, 0, 0.055, 8.55], [-4.16, 0, 0.055, 8.55],
  ]) addMesh(frame, new THREE.BoxGeometry(sx, 0.08, sz), frameGold, [x, 0.135, z]);

  return { table, frame };
}

// Dedicated Class Room bootstrap. It intentionally does not import or build the
// War Room castle/premium room layers: SchoolRoomLayer already owns the visible
// classroom architecture. Keeping only the shared table treatment and board frame
// preserves the teaching composition while avoiding hidden castle geometry.
export function buildClassicWarRoomShell({
  scene,
  boardGroup,
  theme,
  whiteSide,
  renderLite,
  visible = true,
}) {
  const schoolRoomLayer = buildSchoolRoomLayer(theme, whiteSide, renderLite);
  const { table, frame } = buildBoardFurniture(boardGroup, theme);
  const premiumTableLayer = buildPremiumSchoolTableLayer(theme, renderLite);

  scene.add(table);
  scene.add(premiumTableLayer);
  scene.add(schoolRoomLayer);

  const classicShellObjects = [table, premiumTableLayer, schoolRoomLayer, frame];
  classicShellObjects.forEach((object) => { object.visible = visible; });

  schoolRoomLayer.userData.schoolRoomBootstrap = 'dedicated-v1';
  schoolRoomLayer.userData.schoolRoomRetiredWarRoomLayers = 2;
  return { classicShellObjects };
}
