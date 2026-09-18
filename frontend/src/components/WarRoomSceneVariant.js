import * as THREE from 'three';
import { buildPremiumTableLayer, buildPremiumWarRoomLayer } from './PremiumWarRoomScene.js';
import { addMesh, buildWarRoom } from './Board3DScene.js';
import { isWarRoomVariantSelectable, loadWarRoomVariant } from './WarRoomVariant.js';

export function shouldShowClassicWarRoomShell({ selectable = false, variant = 'classic' } = {}) {
  return !selectable || variant !== 'v2';
}

export function buildClassicWarRoomShell({
  scene,
  boardGroup,
  theme,
  whiteSide,
  renderLite,
  visible = shouldShowClassicWarRoomShell({
    selectable: isWarRoomVariantSelectable(),
    variant: loadWarRoomVariant(),
  }),
}) {
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

  const classicShellObjects = [warRoom, premiumWarRoomLayer, table, premiumTableLayer, legacyBoardFrameGroup];
  setClassicShellVisible(classicShellObjects, visible);
  return { classicShellObjects };
}

function setClassicShellVisible(objects, visible) {
  objects.forEach((object) => { if (object) object.visible = visible; });
}

export function createWarRoomClassicShellController({ build, eager = false } = {}) {
  if (typeof build !== 'function') throw new TypeError('Classic War Room shell requires a builder');
  let objects = [];
  let built = false;

  const ensure = () => {
    if (!built) {
      const result = build();
      objects = Array.isArray(result) ? result : result?.classicShellObjects || [];
      built = true;
    }
    return objects;
  };

  if (eager) ensure();

  return {
    ensure,
    current: () => objects,
    isBuilt: () => built,
  };
}

export function createClassicWarRoomShellController(
  { scene, boardGroup, theme, whiteSide, renderLite } = {},
  eager = false,
) {
  return createWarRoomClassicShellController({
    eager,
    build: () => buildClassicWarRoomShell({
      scene, boardGroup, theme, whiteSide, renderLite,
    }).classicShellObjects,
  });
}

export function startWarRoomVariantScene({
  scene, classicShellController, variant, selectable, whiteSide, renderLite, canvas, onStatus, onPaint,
}) {
  let cancelled = false;
  let releaseV2 = null;
  const classicShellObjects = classicShellController?.current?.() || [];
  const ensureClassicShell = classicShellController?.ensure;
  const setStatus = (status, renderedVariant) => {
    if (canvas) {
      canvas.dataset.warRoomV2Status = status;
      if (renderedVariant) canvas.dataset.warRoomVariant = renderedVariant;
    }
    onStatus?.(status);
  };

  if (shouldShowClassicWarRoomShell({ selectable, variant })) {
    const visibleClassicShell = ensureClassicShell?.() || classicShellObjects;
    setClassicShellVisible(visibleClassicShell, true);
    scene.userData ||= {};
    scene.userData.warRoomRenderedVariant = 'classic';
    setStatus('idle', 'classic');
    return () => {};
  }

  // A persisted v2 session must not pay the construction cost of the procedural
  // classic room. Only hide an already-built classic shell; build it lazily if
  // the user switches back or if v2 loading actually fails.
  setClassicShellVisible(classicShellObjects, false);
  scene.userData ||= {};
  scene.userData.warRoomRenderedVariant = 'v2-loading';
  setStatus('loading', 'v2-loading');
  onPaint?.();
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
      const fallbackClassicShell = ensureClassicShell?.() || classicShellObjects;
      setClassicShellVisible(fallbackClassicShell, true);
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
