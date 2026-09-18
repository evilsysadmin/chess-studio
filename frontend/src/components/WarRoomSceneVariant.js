import * as THREE from 'three';
import { buildPremiumTableLayer, buildPremiumWarRoomLayer } from './PremiumWarRoomScene.js';
import { addMesh, buildWarRoom } from './Board3DScene.js';

export function buildClassicWarRoomShell({ scene, boardGroup, theme, whiteSide, renderLite }) {
  const warRoom = buildWarRoom(theme, whiteSide, renderLite);
  scene.add(warRoom);
  const premiumWarRoomLayer = buildPremiumWarRoomLayer(theme, whiteSide, renderLite);
  scene.add(premiumWarRoomLayer);

  const table = new THREE.Mesh(
    new THREE.BoxGeometry(11.6, 0.55, 11.6),
    new THREE.MeshPhysicalMaterial({
      color: 0x1f120c, metalness: 0.08, roughness: 0.6,
      clearcoat: 0.28, clearcoatRoughness: 0.25, envMapIntensity: 0.74,
    }),
  );
  table.position.y = -0.48;
  table.receiveShadow = true;
  scene.add(table);

  const premiumTableLayer = buildPremiumTableLayer(theme, renderLite);
  scene.add(premiumTableLayer);

  const legacyBoardFrameGroup = new THREE.Group();
  legacyBoardFrameGroup.name = 'war-room-classic-board-frame';
  boardGroup.add(legacyBoardFrameGroup);

  const pedestal = new THREE.Mesh(
    new THREE.BoxGeometry(9.35, 0.4, 9.35),
    new THREE.MeshPhysicalMaterial({
      color: theme.frame, metalness: 0.08, roughness: 0.67,
      clearcoat: 0.18, clearcoatRoughness: 0.36, envMapIntensity: 0.48, specularIntensity: 0.42,
    }),
  );
  pedestal.position.y = -0.22;
  pedestal.receiveShadow = true;
  legacyBoardFrameGroup.add(pedestal);

  const frameGold = new THREE.MeshPhysicalMaterial({
    color: 0xa77a2d, metalness: 0.72, roughness: 0.24,
    clearcoat: 0.68, clearcoatRoughness: 0.12, envMapIntensity: 1.2,
  });
  const frameWood = new THREE.MeshPhysicalMaterial({
    color: theme.frame, metalness: 0.025, roughness: 0.7,
    clearcoat: 0.15, clearcoatRoughness: 0.4, envMapIntensity: 0.42, specularIntensity: 0.36,
  });

  for (const [x, z, sx, sz] of [
    [0, 4.38, 9.05, 0.28], [0, -4.38, 9.05, 0.28],
    [4.38, 0, 0.28, 9.05], [-4.38, 0, 0.28, 9.05],
  ]) addMesh(legacyBoardFrameGroup, new THREE.BoxGeometry(sx, 0.18, sz), frameWood, [x, 0.03, z]);

  for (const [x, z, sx, sz] of [
    [0, 4.16, 8.55, 0.055], [0, -4.16, 8.55, 0.055],
    [4.16, 0, 0.055, 8.55], [-4.16, 0, 0.055, 8.55],
  ]) addMesh(legacyBoardFrameGroup, new THREE.BoxGeometry(sx, 0.08, sz), frameGold, [x, 0.135, z]);

  return { classicShellObjects: [warRoom, premiumWarRoomLayer, table, premiumTableLayer, legacyBoardFrameGroup] };
}

function setClassicShellVisible(objects, visible) {
  objects.forEach((object) => { if (object) object.visible = visible; });
}

export function startWarRoomVariantScene({
  scene, classicShellObjects, variant, selectable, whiteSide, renderLite, canvas, onStatus, onPaint,
}) {
  let cancelled = false;
  let releaseV2 = null;
  const setStatus = (status, renderedVariant) => {
    if (canvas) {
      canvas.dataset.warRoomV2Status = status;
      if (renderedVariant) canvas.dataset.warRoomVariant = renderedVariant;
    }
    onStatus?.(status);
  };

  if (!selectable || variant !== 'v2') {
    setClassicShellVisible(classicShellObjects, true);
    scene.userData ||= {};
    scene.userData.warRoomRenderedVariant = 'classic';
    setStatus('idle', 'classic');
    return () => {};
  }

  setStatus('loading', 'v2-loading');
  void import('./WarRoomV2Shell.js')
    .then(({ installWarRoomV2Shell }) => installWarRoomV2Shell(scene, { whiteSide, coarsePointer: renderLite }))
    .then((release) => {
      if (cancelled) return release?.();
      releaseV2 = release;
      setClassicShellVisible(classicShellObjects, false);
      scene.userData ||= {};
      scene.userData.warRoomRenderedVariant = 'v2';
      setStatus('ready', 'v2');
      onPaint?.();
    })
    .catch(() => {
      if (cancelled) return;
      setClassicShellVisible(classicShellObjects, true);
      scene.userData ||= {};
      scene.userData.warRoomRenderedVariant = 'classic';
      setStatus('fallback', 'classic-fallback');
      onPaint?.();
    });

  return () => {
    cancelled = true;
    releaseV2?.();
    releaseV2 = null;
    scene.userData ||= {};
    scene.userData.warRoomRenderedVariant = 'classic';
  };
}
