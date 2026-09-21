import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { request } from '../http.js';
import { createThreeRenderer } from '../threeRenderer.js';
import './HomeMatthias3D.css';

const MODEL_URL = `${import.meta.env.BASE_URL}models/matthias-home-canonical.glb`;
const CANONICAL_FALLBACK_URL = `${import.meta.env.BASE_URL}matthias-home-canonical.b64`;
const FRONT_GEOMETRY_NAMES = Object.freeze([
  'Eye.L',
  'Eye.R',
  'Brow.L',
  'Brow.R',
  'Mouth.L',
  'Mouth.R',
  'Classic cap badge',
  'Classic cap badge inset',
  'Classic chest cross brass',
  'Classic chest cross inset',
]);
export function homeMatthiasCanonicalMeshName(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

const FRONT_GEOMETRY_SET = new Set(
  FRONT_GEOMETRY_NAMES.map((name) => homeMatthiasCanonicalMeshName(name)),
);

export function homeMatthiasIsFrontGeometryName(value = '') {
  return FRONT_GEOMETRY_SET.has(homeMatthiasCanonicalMeshName(value));
}
const CLIP_BY_PROFILE = Object.freeze({
  idle: 'Idle',
  speak: 'Speak',
  sleep: 'Sleep',
  sip: 'Sip',
  bite: 'Bite',
  think: 'Think',
  write: 'Write',
  dossier: 'Dossier',
  read: 'Read',
});
const ONE_SHOT_PROFILES = new Set(['sip', 'bite']);

function cue(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function homeMatthiasMotionProfile({ scene = '', activity = '', speaking = false } = {}) {
  if (speaking) return 'speak';
  const sceneKey = cue(scene);
  const activityKey = cue(activity);
  if (/sleep|sobando/.test(sceneKey) || /sobando|cabeceando|dormido/.test(activityKey)) return 'sleep';
  if (/coffee|beer-break|night|breakfast/.test(sceneKey) || /cafe|cerve|desayuno/.test(activityKey)) return 'sip';
  if (/lunch|bocata|dinner/.test(sceneKey) || /comida|cena|repostando/.test(activityKey)) return 'bite';
  if (/inception/.test(sceneKey) || /partida|ajedrez dentro|emboscada/.test(activityKey)) return 'think';
  if (/ops/.test(sceneKey) || /operacion|notas/.test(activityKey)) return 'write';
  if (/dossier/.test(sceneKey) || /auditoria|expedient|heridas/.test(activityKey)) return 'dossier';
  if (/strategy|weekly|reading/.test(sceneKey) || /lectura|estudio|manual|estrategia|prensa/.test(activityKey)) return 'read';
  return 'idle';
}

export function homeMatthiasMotionPhase({ scene = '', activity = '' } = {}) {
  const key = `${cue(scene)}|${cue(activity)}`;
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 3600) / 1000;
}

export function homeMatthiasClipForProfile(profile = 'idle') {
  return CLIP_BY_PROFILE[profile] || CLIP_BY_PROFILE.idle;
}

export function homeMatthiasPlaybackPolicy(profile = 'idle') {
  const normalized = CLIP_BY_PROFILE[profile] ? profile : 'idle';
  const oneShot = ONE_SHOT_PROFILES.has(normalized);
  return {
    loop: oneShot ? 'once' : 'repeat',
    returnToIdle: oneShot,
  };
}

export function homeMatthiasClipStartTime({ duration = 0, phase = 0, profile = 'idle' } = {}) {
  const safeDuration = Number(duration);
  const safePhase = Number(phase);
  if (!Number.isFinite(safeDuration) || safeDuration <= 0 || !Number.isFinite(safePhase)) return 0;
  if (homeMatthiasPlaybackPolicy(profile).loop === 'once') return 0;
  return ((safePhase % safeDuration) + safeDuration) % safeDuration;
}

export function homeMatthiasPortraitFrame({ minY = 0, maxY = 2.35, fovDeg = 24 } = {}) {
  const low = Number(minY);
  const high = Number(maxY);
  const fov = Number(fovDeg);
  const height = Number.isFinite(low) && Number.isFinite(high) && high > low ? high - low : 2.35;
  const base = Number.isFinite(low) ? low : 0;
  const safeFov = Number.isFinite(fov) && fov > 1 && fov < 120 ? fov : 24;
  const targetY = base + (height * 0.62);
  const visibleHeight = height * 0.78;
  const distance = Math.max(4.6, (visibleHeight * 0.5) / Math.tan(THREE.MathUtils.degToRad(safeFov * 0.5)));
  return { targetY, distance };
}

export function homeMatthiasCameraPose({
  headX = 0,
  headZ = 0,
  noseX = 0,
  noseZ = 1,
  faceSource = 'head-nose-vector',
  minY = 0,
  maxY = 2.35,
  centerX = 0,
  centerZ = 0,
  fovDeg = 24,
} = {}) {
  const dx = Number(noseX) - Number(headX);
  const dz = Number(noseZ) - Number(headZ);
  const length = Math.hypot(Number.isFinite(dx) ? dx : 0, Number.isFinite(dz) ? dz : 0);
  const source = length > 0.0001 ? faceSource : 'fallback-axis';
  const anchored = source !== 'fallback-axis';
  const faceX = anchored ? dx / length : 0;
  const faceZ = anchored ? dz / length : 1;
  const safeCenterX = Number.isFinite(Number(centerX)) ? Number(centerX) : 0;
  const safeCenterZ = Number.isFinite(Number(centerZ)) ? Number(centerZ) : 0;
  const frame = homeMatthiasPortraitFrame({ minY, maxY, fovDeg });

  return {
    source,
    faceX,
    faceZ,
    targetX: safeCenterX,
    targetY: frame.targetY,
    targetZ: safeCenterZ,
    cameraX: safeCenterX + (faceX * frame.distance),
    cameraY: frame.targetY,
    cameraZ: safeCenterZ + (faceZ * frame.distance),
    distance: frame.distance,
  };
}

export function homeMatthiasFrontDirectionFromPoints({ centerX = 0, centerZ = 0, points = [] } = {}) {
  const safeCenterX = Number.isFinite(Number(centerX)) ? Number(centerX) : 0;
  const safeCenterZ = Number.isFinite(Number(centerZ)) ? Number(centerZ) : 0;
  const valid = (Array.isArray(points) ? points : [])
    .map((point) => ({ x: Number(point?.x), z: Number(point?.z) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.z));
  if (valid.length < 2) return null;

  const anchorX = valid.reduce((sum, point) => sum + point.x, 0) / valid.length;
  const anchorZ = valid.reduce((sum, point) => sum + point.z, 0) / valid.length;
  const dx = anchorX - safeCenterX;
  const dz = anchorZ - safeCenterZ;
  const length = Math.hypot(dx, dz);
  if (!Number.isFinite(length) || length < 0.02) return null;

  return {
    anchorX,
    anchorZ,
    faceX: dx / length,
    faceZ: dz / length,
    count: valid.length,
  };
}

export function homeMatthiasCanonicalFallbackDataUrl(payload = '') {
  const normalized = String(payload || '').trim();
  return normalized.startsWith('UklG') ? `data:image/webp;base64,${normalized}` : '';
}

function visibleGeometryCenter(node) {
  if (!node) return null;
  const bounds = new THREE.Box3().setFromObject(node);
  if (bounds.isEmpty()) return null;
  return bounds.getCenter(new THREE.Vector3());
}

function deriveVisibleFrontGeometry(model, center) {
  const points = [];
  model.traverse((node) => {
    if (!node?.isMesh || !homeMatthiasIsFrontGeometryName(node.name)) return;
    const point = visibleGeometryCenter(node);
    if (point) points.push({ x: point.x, z: point.z });
  });
  return homeMatthiasFrontDirectionFromPoints({
    centerX: center.x,
    centerZ: center.z,
    points,
  });
}

function placePortraitLights({ key, fill, rim }, pose) {
  const sideX = -pose.faceZ;
  const sideZ = pose.faceX;
  const target = new THREE.Vector3(pose.targetX, pose.targetY, pose.targetZ);

  key.position.set(
    pose.targetX + (pose.faceX * 4.2) - (sideX * 2.0),
    pose.targetY + 2.0,
    pose.targetZ + (pose.faceZ * 4.2) - (sideZ * 2.0),
  );
  fill.position.set(
    pose.targetX + (pose.faceX * 2.7) + (sideX * 2.5),
    pose.targetY + 0.8,
    pose.targetZ + (pose.faceZ * 2.7) + (sideZ * 2.5),
  );
  rim.position.set(
    pose.targetX - (pose.faceX * 3.6) + (sideX * 0.8),
    pose.targetY + 1.6,
    pose.targetZ - (pose.faceZ * 3.6) + (sideZ * 0.8),
  );
  key.target.position.copy(target);
  fill.target.position.copy(target);
  rim.target.position.copy(target);
}

function disposeMaterial(material) {
  if (!material) return;
  const values = Array.isArray(material) ? material : [material];
  for (const item of values) {
    for (const value of Object.values(item)) {
      if (value?.isTexture) value.dispose();
    }
    item.dispose?.();
  }
}

function disposeModel(root) {
  root?.traverse?.((node) => {
    node.geometry?.dispose?.();
    disposeMaterial(node.material);
  });
}

function fitRenderer(renderer, camera, canvas) {
  const width = Math.max(1, canvas.clientWidth || canvas.parentElement?.clientWidth || 1);
  const height = Math.max(1, canvas.clientHeight || canvas.parentElement?.clientHeight || 1);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

export default function HomeMatthias3D({
  fallbackAvatar,
  scene = 'base',
  activity = '',
  speaking = false,
  reducedMotion = false,
}) {
  const canvasRef = useRef(null);
  const runtimeRef = useRef(null);
  const desiredMotionRef = useRef({ profile: 'idle', reducedMotion: false, phase: 0 });
  const profile = useMemo(
    () => homeMatthiasMotionProfile({ scene, activity, speaking }),
    [activity, scene, speaking],
  );
  const phase = useMemo(() => homeMatthiasMotionPhase({ scene, activity }), [activity, scene]);
  const [modelState, setModelState] = useState('loading');
  const [fallbackSrc, setFallbackSrc] = useState(fallbackAvatar);

  desiredMotionRef.current = { profile, reducedMotion, phase };

  useEffect(() => {
    if (modelState !== 'fallback') {
      setFallbackSrc(fallbackAvatar);
      return undefined;
    }

    let active = true;
    request(CANONICAL_FALLBACK_URL, { cache: 'force-cache' })
      .then((response) => {
        if (!response.ok) throw new Error(`canonical fallback ${response.status}`);
        return response.text();
      })
      .then((payload) => {
        const canonical = homeMatthiasCanonicalFallbackDataUrl(payload);
        if (active && canonical) setFallbackSrc(canonical);
      })
      .catch(() => {
        if (active) setFallbackSrc(fallbackAvatar);
      });

    return () => { active = false; };
  }, [fallbackAvatar, modelState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let renderer;
    try {
      renderer = createThreeRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'low-power',
      });
    } catch {
      setModelState('fallback');
      return undefined;
    }

    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.2 : 1.5));

    const threeScene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 20);
    camera.position.set(0, 1.46, 4.6);
    camera.lookAt(0, 1.46, 0);

    const hemi = new THREE.HemisphereLight(0xffe6bd, 0x18202a, 1.65);
    const key = new THREE.DirectionalLight(0xffe0ad, 3.1);
    const fill = new THREE.DirectionalLight(0x91b7d2, 1.25);
    const rim = new THREE.DirectionalLight(0xd69d59, 1.5);
    threeScene.add(hemi, key, fill, rim, key.target, fill.target, rim.target);

    const clock = new THREE.Clock();
    let model = null;
    let mixer = null;
    let currentAction = null;
    let currentProfile = 'idle';
    let currentPhase = 0;
    let frame = 0;
    let disposed = false;
    let intersecting = true;
    let firstFramePainted = false;

    const renderOnce = () => {
      try {
        renderer.render(threeScene, camera);
        if (model && !firstFramePainted) {
          firstFramePainted = true;
          setModelState('ready');
        }
      } catch {
        setModelState('fallback');
      }
    };

    const selectClip = (clipName, {
      still = false,
      profile: requestedProfile = 'idle',
      phase: requestedPhase = 0,
      force = false,
    } = {}) => {
      if (!mixer || !runtimeRef.current?.clips) return;
      const exactClip = runtimeRef.current.clips.get(clipName);
      const clip = exactClip || runtimeRef.current.clips.get('Idle');
      if (!clip) return;

      const resolvedProfile = exactClip ? requestedProfile : 'idle';
      const policy = homeMatthiasPlaybackPolicy(resolvedProfile);
      const safePhase = Number.isFinite(Number(requestedPhase)) ? Number(requestedPhase) : 0;
      const next = mixer.clipAction(clip);
      const shouldRestart = force
        || next !== currentAction
        || (policy.loop === 'once' && (currentProfile !== resolvedProfile || currentPhase !== safePhase));

      if (shouldRestart) {
        currentAction?.fadeOut?.(0.22);
        next.reset();
        next.enabled = true;
        next.clampWhenFinished = policy.loop === 'once';
        next.setLoop(policy.loop === 'once' ? THREE.LoopOnce : THREE.LoopRepeat, policy.loop === 'once' ? 1 : Infinity);
        next.fadeIn(0.22).play();
        if (policy.loop === 'repeat') {
          next.time = homeMatthiasClipStartTime({ duration: clip.duration, phase: safePhase, profile: resolvedProfile });
          mixer.update(0);
        }
        currentAction = next;
        currentProfile = resolvedProfile;
        currentPhase = safePhase;
      } else if (policy.loop === 'repeat' && currentPhase !== safePhase) {
        next.time = homeMatthiasClipStartTime({ duration: clip.duration, phase: safePhase, profile: resolvedProfile });
        currentPhase = safePhase;
        mixer.update(0);
      }

      canvas.dataset.matthiasClip = clip.name;
      canvas.dataset.matthiasPlayback = policy.loop;

      if (still) {
        mixer.setTime(Math.max(0, clip.duration * 0.34));
        renderOnce();
      }
    };

    const shouldAnimate = () => !disposed && model && !document.hidden && intersecting && !runtimeRef.current?.reducedMotion;
    const stop = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    };
    const tick = () => {
      frame = 0;
      if (!shouldAnimate()) return;
      mixer?.update(Math.min(clock.getDelta(), 0.05));
      renderOnce();
      frame = window.requestAnimationFrame(tick);
    };
    const resume = () => {
      if (shouldAnimate() && !frame) {
        clock.getDelta();
        frame = window.requestAnimationFrame(tick);
      }
    };
    const onMixerFinished = ({ action: finishedAction } = {}) => {
      if (disposed || finishedAction !== currentAction) return;
      if (!homeMatthiasPlaybackPolicy(currentProfile).returnToIdle) return;
      const desired = desiredMotionRef.current;
      selectClip('Idle', {
        profile: 'idle',
        phase: desired.phase,
        force: true,
      });
      resume();
    };

    runtimeRef.current = {
      clips: new Map(),
      selectClip,
      resume,
      reducedMotion: desiredMotionRef.current.reducedMotion,
    };

    const loader = new GLTFLoader();
    loader.load(
      MODEL_URL,
      (gltf) => {
        if (disposed) {
          disposeModel(gltf.scene);
          return;
        }
        model = gltf.scene;
        model.position.set(0, 0, 0);
        model.rotation.set(0, 0, 0);
        model.scale.setScalar(1.0);
        model.updateMatrixWorld(true);

        const bounds = new THREE.Box3().setFromObject(model);
        const center = bounds.getCenter(new THREE.Vector3());
        const visibleFront = deriveVisibleFrontGeometry(model, center);

        // Do not guess Blender/glTF axes. Use the actual rendered geometry of
        // the face, cap badge and chest cross. If those canonical meshes cannot
        // establish a front, prefer the approved static render to a faceless GLB.
        if (!visibleFront) {
          disposeModel(model);
          model = null;
          setModelState('fallback');
          return;
        }

        const cameraPose = homeMatthiasCameraPose({
          headX: center.x,
          headZ: center.z,
          noseX: visibleFront.anchorX,
          noseZ: visibleFront.anchorZ,
          faceSource: 'visible-front-geometry',
          minY: bounds.min.y,
          maxY: bounds.max.y,
          centerX: center.x,
          centerZ: center.z,
          fovDeg: camera.fov,
        });
        camera.position.set(cameraPose.cameraX, cameraPose.cameraY, cameraPose.cameraZ);
        camera.lookAt(cameraPose.targetX, cameraPose.targetY, cameraPose.targetZ);
        camera.updateProjectionMatrix();
        placePortraitLights({ key, fill, rim }, cameraPose);
        canvas.dataset.matthiasCameraFacing = cameraPose.source;
        canvas.dataset.matthiasCameraContract = cameraPose.source;
        canvas.dataset.matthiasCameraFaceX = cameraPose.faceX.toFixed(4);
        canvas.dataset.matthiasCameraFaceZ = cameraPose.faceZ.toFixed(4);
        canvas.dataset.matthiasCameraDistance = cameraPose.distance.toFixed(3);
        canvas.dataset.matthiasFrontGeometryCount = String(visibleFront.count);

        model.traverse((node) => {
          if (node.isMesh) {
            const isFrontGeometry = homeMatthiasIsFrontGeometryName(node.name);
            node.castShadow = false;
            node.receiveShadow = false;
            node.frustumCulled = !isFrontGeometry;
            if (isFrontGeometry) {
              const materials = Array.isArray(node.material) ? node.material : [node.material];
              for (const material of materials) {
                if (!material) continue;
                material.side = THREE.DoubleSide;
                material.needsUpdate = true;
              }
            }
          }
        });
        threeScene.add(model);
        mixer = new THREE.AnimationMixer(model);
        mixer.addEventListener('finished', onMixerFinished);
        runtimeRef.current.clips = new Map(gltf.animations.map((clip) => [clip.name, clip]));
        const desired = desiredMotionRef.current;
        runtimeRef.current.reducedMotion = desired.reducedMotion;
        selectClip(homeMatthiasClipForProfile(desired.profile), {
          still: desired.reducedMotion,
          profile: desired.profile,
          phase: desired.phase,
        });
        fitRenderer(renderer, camera, canvas);
        frame = window.requestAnimationFrame(() => {
          renderOnce();
          resume();
        });
      },
      undefined,
      () => {
        if (!disposed) setModelState('fallback');
      },
    );

    const onVisibility = () => (document.hidden ? stop() : resume());
    document.addEventListener('visibilitychange', onVisibility);

    const observer = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(([entry]) => {
          intersecting = entry?.isIntersecting !== false;
          if (intersecting) resume(); else stop();
        }, { rootMargin: '80px' })
      : null;
    observer?.observe(canvas);

    const resize = () => {
      fitRenderer(renderer, camera, canvas);
      if (model) renderOnce();
    };
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    resizeObserver?.observe(canvas);
    window.addEventListener('resize', resize, { passive: true });
    resize();

    return () => {
      disposed = true;
      stop();
      observer?.disconnect();
      resizeObserver?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', resize);
      runtimeRef.current = null;
      if (mixer) mixer.removeEventListener('finished', onMixerFinished);
      mixer?.stopAllAction();
      if (model) {
        threeScene.remove(model);
        disposeModel(model);
      }
      renderer.dispose();
      renderer.forceContextLoss?.();
    };
  // The renderer/model lifetime follows the Home mount. Routine/avatar changes
  // only update the fallback image and active animation clip.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.reducedMotion = reducedMotion;
    runtime.selectClip?.(homeMatthiasClipForProfile(profile), {
      still: reducedMotion,
      profile,
      phase,
    });
    if (!reducedMotion) runtime.resume?.();
  }, [phase, profile, reducedMotion, modelState]);

  if (!fallbackAvatar) return null;

  const canonicalFallbackReady = fallbackSrc.startsWith('data:image/webp;base64,');

  return (
    <span
      className={`home-matthias-3d ${modelState === 'ready' ? 'is-model-ready' : 'is-fallback'}`}
      data-home-matthias-3d="ready"
      data-home-matthias-model-state={modelState}
      data-matthias-identity="canonical-blender-rig"
      data-matthias-render-source={modelState === 'ready' ? 'blender-glb' : 'bundled-scene-art-fallback'}
      data-home-matthias-profile={profile}
      data-motion={reducedMotion ? 'still-rigged-model' : 'rigged-gltf-clips'}
      aria-hidden="true"
    >
      <img
        src={fallbackSrc || fallbackAvatar}
        alt=""
        draggable="false"
        data-matthias-fallback="canonical-scene-render"
        data-matthias-fallback-source={canonicalFallbackReady ? 'canonical-static-webp' : 'scene-art'}
        style={reducedMotion ? undefined : { animationDelay: `${-phase}s` }}
      />
      <canvas ref={canvasRef} data-matthias-canonical-model="blender" />
    </span>
  );
}