import * as THREE from 'three';
import { buildChroniclesCharacter } from './chroniclesOfMatthiasArt.js';
import { installChroniclesCanonicalMatthias } from './chroniclesOfMatthiasBlenderArt.js';
import { installChroniclesTacticsPartyBlenderArt } from './chroniclesOfMatthiasPartyBlenderArt.js';
import { createExperimentalThreeRenderer } from './experimentalThreeRenderer.js';

const PORTRAIT_MEMBERS = Object.freeze(['matthias', 'rook', 'bishop', 'knight']);
const EXPECTED_BLENDER_SOURCE = Object.freeze({
  matthias: 'blender-home-canonical-v1',
  rook: 'chronicles-tactics-party-v3',
  bishop: 'chronicles-tactics-party-v3',
  knight: 'chronicles-tactics-party-v3',
});
const THUMBNAIL_SIZE = 96;

function configurePortraitRenderer(renderer, { coarsePointer }) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.setClearColor(0x080706, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarsePointer ? 1.2 : 1.65));
  renderer.shadowMap.enabled = !coarsePointer;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}

function disposeObject(root) {
  root?.traverse?.((node) => {
    node.geometry?.dispose?.();
    if (Array.isArray(node.material)) node.material.forEach((entry) => entry?.dispose?.());
    else node.material?.dispose?.();
  });
}

function portraitArtSource(model) {
  return model?.userData?.chroniclesPartyArtSource
    || model?.userData?.chroniclesArtSource
    || 'procedural-fallback';
}

function hasCanonicalBlenderParty(models) {
  return PORTRAIT_MEMBERS.every((id) => portraitArtSource(models.get(id)) === EXPECTED_BLENDER_SOURCE[id]);
}

export function createChroniclesPartyPortrait(host, { onThumbnailsReady = null } = {}) {
  if (!host) throw new Error('Chronicles party portrait requires a host element');

  const coarse = Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
  const reducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  const renderer = createExperimentalThreeRenderer({ antialias: !coarse, alpha: true, powerPreference: 'low-power' });
  configurePortraitRenderer(renderer, { coarsePointer: coarse });
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 20);
  camera.position.set(2.55, 1.65, 4.25);
  camera.lookAt(0, 0.92, 0);

  scene.add(new THREE.HemisphereLight(0xe8d7bb, 0x17110d, 1.45));
  const key = new THREE.DirectionalLight(0xffd79a, 2.1);
  key.position.set(2.5, 4.2, 3.2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8295b8, 1.15);
  rim.position.set(-3, 2.3, -2.2);
  scene.add(rim);

  const pedestalMaterial = new THREE.MeshStandardMaterial({ color: 0x17120e, roughness: 0.84, metalness: 0.08 });
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.1, 0.12, coarse ? 18 : 28), pedestalMaterial);
  pedestal.position.y = -0.07;
  pedestal.receiveShadow = true;
  scene.add(pedestal);

  const models = new Map(PORTRAIT_MEMBERS.map((id) => {
    const model = buildChroniclesCharacter(id, { coarsePointer: coarse });
    model.visible = id === 'matthias';
    model.rotation.y = -0.28;
    scene.add(model);
    return [id, model];
  }));

  const cancelMatthiasArt = installChroniclesCanonicalMatthias(models.get('matthias'), {
    coarsePointer: coarse,
    reducedMotion,
  });
  const cancelPartyArt = installChroniclesTacticsPartyBlenderArt(models, {
    coarsePointer: coarse,
    reducedMotion,
  });

  let active = models.get('matthias');
  let destroyed = false;
  let frame = 0;
  let visible = document.visibilityState !== 'hidden';
  let thumbnailsEmitted = false;
  const clock = new THREE.Clock();

  function syncHostState() {
    host.dataset.chroniclesPartyArtSource = portraitArtSource(active);
    host.dataset.chroniclesPartyMember = active?.userData?.chroniclesCharacterId || 'matthias';
  }

  function resize() {
    const width = Math.max(1, host.clientWidth || 1);
    const height = Math.max(1, host.clientHeight || 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function captureBlenderThumbnails() {
    const originalSize = renderer.getSize(new THREE.Vector2());
    const originalPixelRatio = renderer.getPixelRatio();
    const originalAspect = camera.aspect;
    const snapshots = new Map(PORTRAIT_MEMBERS.map((id) => {
      const model = models.get(id);
      return [id, {
        visible: model?.visible,
        rotationY: model?.rotation.y,
        positionY: model?.position.y,
      }];
    }));
    const thumbnails = {};

    try {
      renderer.setPixelRatio(1);
      renderer.setSize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, false);
      camera.aspect = 1;
      camera.updateProjectionMatrix();

      PORTRAIT_MEMBERS.forEach((id) => {
        const model = models.get(id);
        models.forEach((candidate) => { candidate.visible = candidate === model; });
        if (model) {
          model.rotation.y = -0.28;
          model.position.y = 0;
          model.userData?.chroniclesArtTick?.(0.35);
        }
        renderer.render(scene, camera);
        thumbnails[id] = renderer.domElement.toDataURL('image/png');
      });
    } catch (error) {
      console.warn('Chronicles party Blender thumbnails could not be captured', error);
      return null;
    } finally {
      snapshots.forEach((snapshot, id) => {
        const model = models.get(id);
        if (!model) return;
        model.visible = snapshot.visible;
        model.rotation.y = snapshot.rotationY;
        model.position.y = snapshot.positionY;
      });
      renderer.setPixelRatio(originalPixelRatio);
      renderer.setSize(Math.max(1, originalSize.x), Math.max(1, originalSize.y), false);
      camera.aspect = originalAspect;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    }

    return thumbnails;
  }

  function maybeEmitThumbnails() {
    if (thumbnailsEmitted || typeof onThumbnailsReady !== 'function' || !hasCanonicalBlenderParty(models)) return;
    const thumbnails = captureBlenderThumbnails();
    if (!thumbnails || Object.keys(thumbnails).length !== PORTRAIT_MEMBERS.length) return;
    thumbnailsEmitted = true;
    host.dataset.chroniclesPartyThumbnailCount = String(PORTRAIT_MEMBERS.length);
    onThumbnailsReady(thumbnails);
  }

  function renderMember(memberId) {
    const next = models.get(memberId) || models.get('matthias');
    models.forEach((model) => { model.visible = model === next; });
    active = next;
    if (active) {
      active.rotation.y = -0.28;
      active.position.y = 0;
    }
    syncHostState();
    renderer.render(scene, camera);
  }

  function render() {
    if (destroyed) return;
    frame = requestAnimationFrame(render);
    if (!visible) return;

    const time = clock.getElapsedTime();
    active?.userData?.chroniclesArtTick?.(time);
    if (!reducedMotion && active) {
      active.rotation.y = -0.28 + Math.sin(time * 0.55) * 0.16;
      active.position.y = Math.sin(time * 0.9) * 0.008;
    }
    syncHostState();
    maybeEmitThumbnails();
    renderer.render(scene, camera);
  }

  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  observer?.observe(host);
  const onWindowResize = () => resize();
  if (!observer) window.addEventListener('resize', onWindowResize);
  const onVisibility = () => { visible = document.visibilityState !== 'hidden'; };
  document.addEventListener('visibilitychange', onVisibility);

  syncHostState();
  resize();
  render();

  return {
    renderMember,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      if (!observer) window.removeEventListener('resize', onWindowResize);
      document.removeEventListener('visibilitychange', onVisibility);
      cancelPartyArt?.();
      cancelMatthiasArt?.();
      disposeObject(scene);
      renderer.dispose();
      renderer.forceContextLoss?.();
      renderer.domElement.remove();
      delete host.dataset.chroniclesPartyArtSource;
      delete host.dataset.chroniclesPartyMember;
      delete host.dataset.chroniclesPartyThumbnailCount;
    },
  };
}
