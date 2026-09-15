import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createThreeRenderer } from '../threeRenderer.js';
import './HomeMatthias3D.css';

const MODEL_URL = `${import.meta.env.BASE_URL}models/matthias-home-canonical.glb`;
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

export function homeMatthiasFacingRotation({ headZ = 0, noseZ = 0 } = {}) {
  const head = Number(headZ);
  const nose = Number(noseZ);
  if (!Number.isFinite(head) || !Number.isFinite(nose) || Math.abs(nose - head) < 0.0001) return 0;
  return nose < head ? Math.PI : 0;
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
  const distance = Math.max(3.6, (visibleHeight * 0.5) / Math.tan(THREE.MathUtils.degToRad(safeFov * 0.5)));
  return { targetY, distance };
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
  const desiredMotionRef = useRef({ profile: 'idle', reducedMotion: false });
  const profile = useMemo(
    () => homeMatthiasMotionProfile({ scene, activity, speaking }),
    [activity, scene, speaking],
  );
  const phase = useMemo(() => homeMatthiasMotionPhase({ scene, activity }), [activity, scene]);
  const [modelState, setModelState] = useState('loading');

  desiredMotionRef.current = { profile, reducedMotion };

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
    key.position.set(-2.4, 3.2, 4.5);
    const fill = new THREE.DirectionalLight(0x91b7d2, 1.25);
    fill.position.set(2.5, 1.6, 2.6);
    const rim = new THREE.DirectionalLight(0xd69d59, 1.5);
    rim.position.set(0.8, 2.8, -3.6);
    threeScene.add(hemi, key, fill, rim);

    const clock = new THREE.Clock();
    let model = null;
    let mixer = null;
    let currentAction = null;
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

    const selectClip = (clipName, still = false) => {
      if (!mixer || !runtimeRef.current?.clips) return;
      const clip = runtimeRef.current.clips.get(clipName) || runtimeRef.current.clips.get('Idle');
      if (!clip) return;
      const next = mixer.clipAction(clip);
      if (next !== currentAction) {
        currentAction?.fadeOut?.(0.22);
        next.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.22).play();
        currentAction = next;
      }
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

        const headNode = model.getObjectByName('Head');
        const noseNode = model.getObjectByName('Nose');
        if (headNode && noseNode) {
          const headWorld = new THREE.Vector3();
          const noseWorld = new THREE.Vector3();
          headNode.getWorldPosition(headWorld);
          noseNode.getWorldPosition(noseWorld);
          model.rotation.y = homeMatthiasFacingRotation({ headZ: headWorld.z, noseZ: noseWorld.z });
          model.updateMatrixWorld(true);
        }

        const bounds = new THREE.Box3().setFromObject(model);
        const portraitFrame = homeMatthiasPortraitFrame({
          minY: bounds.min.y,
          maxY: bounds.max.y,
          fovDeg: camera.fov,
        });
        camera.position.set(0, portraitFrame.targetY, portraitFrame.distance);
        camera.lookAt(0, portraitFrame.targetY, 0);
        camera.updateProjectionMatrix();

        model.traverse((node) => {
          if (node.isMesh) {
            node.frustumCulled = true;
            node.castShadow = false;
            node.receiveShadow = false;
          }
        });
        threeScene.add(model);
        mixer = new THREE.AnimationMixer(model);
        runtimeRef.current.clips = new Map(gltf.animations.map((clip) => [clip.name, clip]));
        const desired = desiredMotionRef.current;
        runtimeRef.current.reducedMotion = desired.reducedMotion;
        selectClip(homeMatthiasClipForProfile(desired.profile), desired.reducedMotion);
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
    runtime.selectClip?.(homeMatthiasClipForProfile(profile), reducedMotion);
    if (!reducedMotion) runtime.resume?.();
  }, [profile, reducedMotion, modelState]);

  if (!fallbackAvatar) return null;

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
        src={fallbackAvatar}
        alt=""
        draggable="false"
        data-matthias-fallback="canonical-scene-render"
        style={reducedMotion ? undefined : { animationDelay: `${-phase}s` }}
      />
      <canvas ref={canvasRef} data-matthias-canonical-model="blender" />
    </span>
  );
}
