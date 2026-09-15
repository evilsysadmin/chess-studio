import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { createExperimentalThreeRenderer } from '../experimentalThreeRenderer.js';
import {
  applyHomeMatthiasCanonicalPose,
  createHomeMatthiasCanonicalRig,
  disposeHomeMatthiasCanonicalRig,
  HOME_MATTHIAS_CANONICAL_ART_VERSION,
  HOME_MATTHIAS_CANONICAL_ASPECT,
  HOME_MATTHIAS_CANONICAL_ASSET_URL,
  HOME_MATTHIAS_CANONICAL_RIG_VERSION,
  homeMatthiasCanonicalDataUrl,
} from './HomeMatthiasCanonicalRig.js';
import './HomeMatthias3D.css';

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

function smooth01(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function wave01(time, speed = 1, phase = 0) {
  return 0.5 + Math.sin(time * speed + phase) * 0.5;
}

export function homeMatthiasPoseSample({ profile = 'idle', time = 0, speaking = false } = {}) {
  const breathWave = Math.sin(time * 0.92);
  const survey = Math.sin(time * 0.37 + 0.6);
  const pose = {
    bodyY: breathWave * 0.006,
    bodyYaw: survey * 0.006,
    bodyRoll: Math.sin(time * 0.29) * 0.0028,
    headPitch: Math.sin(time * 0.55 + 0.2) * 0.004,
    headYaw: survey * 0.016,
    headRoll: Math.sin(time * 0.31 + 0.8) * 0.004,
    breath: breathWave * 0.0025,
  };

  if (profile === 'sip') {
    const action = smooth01(wave01(time, 0.72, 0.7));
    pose.headPitch -= action * 0.038;
    pose.headRoll += action * 0.012;
    pose.headYaw += action * 0.012;
    pose.bodyY += action * 0.006;
  } else if (profile === 'bite') {
    const action = smooth01(wave01(time, 0.64, 1.1));
    pose.headPitch -= action * 0.048;
    pose.bodyY -= action * 0.004;
    pose.headYaw += Math.sin(time * 0.7) * 0.009;
  } else if (profile === 'write') {
    pose.headPitch += 0.026;
    pose.headYaw += Math.sin(time * 1.45) * 0.025;
    pose.bodyRoll += Math.sin(time * 1.9) * 0.0028;
  } else if (profile === 'dossier') {
    pose.headPitch += 0.022;
    pose.headYaw += Math.sin(time * 0.9) * 0.038;
    pose.headRoll += Math.sin(time * 0.47) * 0.007;
  } else if (profile === 'read') {
    pose.headPitch += 0.028 + Math.sin(time * 0.46) * 0.008;
    pose.headYaw += Math.sin(time * 1.08) * 0.031;
  } else if (profile === 'think') {
    const thought = smooth01(wave01(time, 0.42, 0.4));
    pose.headPitch -= thought * 0.018;
    pose.headYaw += Math.sin(time * 0.58) * 0.052;
    pose.headRoll -= thought * 0.014;
  } else if (profile === 'sleep') {
    const nod = smooth01(wave01(time, 0.31, 0.3));
    pose.headPitch += 0.052 + nod * 0.032;
    pose.headRoll += Math.sin(time * 0.23) * 0.018;
    pose.bodyY -= nod * 0.004;
  } else if (profile === 'speak' && speaking) {
    const cadence = Math.sin(time * 2.6);
    pose.headPitch -= 0.012 + cadence * 0.009;
    pose.headYaw += Math.sin(time * 0.8) * 0.022;
    pose.bodyY += 0.004 + cadence * 0.0015;
  }

  return pose;
}

function resizeRenderer(renderer, camera, host) {
  const width = Math.max(1, host.clientWidth || 1);
  const height = Math.max(1, host.clientHeight || 1);
  renderer.setSize(width, height, false);

  // Orthographic cover semantics preserve the approved 3:4 render without
  // stretching it. The Home shell may crop a little, but never changes Matthias.
  const viewportAspect = width / height;
  const artHeight = 4;
  const artWidth = artHeight * HOME_MATTHIAS_CANONICAL_ASPECT;
  let viewWidth;
  let viewHeight;
  if (viewportAspect >= HOME_MATTHIAS_CANONICAL_ASPECT) {
    viewWidth = artWidth;
    viewHeight = artWidth / viewportAspect;
  } else {
    viewHeight = artHeight;
    viewWidth = artHeight * viewportAspect;
  }
  camera.left = -viewWidth / 2;
  camera.right = viewWidth / 2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
  camera.updateProjectionMatrix();
}

export default function HomeMatthias3D({
  fallbackAvatar,
  scene = 'base',
  activity = '',
  speaking = false,
  reducedMotion = false,
}) {
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const [canonicalSrc, setCanonicalSrc] = useState('');
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const profile = useMemo(
    () => homeMatthiasMotionProfile({ scene, activity, speaking }),
    [activity, scene, speaking],
  );
  const phase = useMemo(() => homeMatthiasMotionPhase({ scene, activity }), [activity, scene]);

  useEffect(() => {
    let cancelled = false;
    const base = String(import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
    fetch(`${base}${HOME_MATTHIAS_CANONICAL_ASSET_URL}`, { cache: 'force-cache' })
      .then((response) => {
        if (!response.ok) throw new Error(`Canonical Matthias asset ${response.status}`);
        return response.text();
      })
      .then(homeMatthiasCanonicalDataUrl)
      .then((src) => {
        if (!cancelled) setCanonicalSrc(src);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!canonicalSrc || failed) return undefined;
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return undefined;

    let renderer;
    try {
      const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
      renderer = createExperimentalThreeRenderer({
        canvas,
        alpha: true,
        antialias: !coarsePointer,
        powerPreference: coarsePointer ? 'low-power' : 'high-performance',
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarsePointer ? 1.45 : 1.85));
    } catch {
      setFailed(true);
      return undefined;
    }

    let disposed = false;
    let animationFrame = 0;
    let rig = null;
    let inViewport = true;
    let documentVisible = !document.hidden;
    let motionTick = -1;
    const stage = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);

    const resize = () => {
      if (!disposed) resizeRenderer(renderer, camera, host);
    };

    const renderPose = (seconds, animate) => {
      if (!rig) return;
      const pose = animate
        ? homeMatthiasPoseSample({ profile, time: seconds + phase, speaking })
        : homeMatthiasPoseSample({ profile: 'idle', time: 0, speaking: false });
      applyHomeMatthiasCanonicalPose(rig, pose);
      renderer.render(stage, camera);
    };

    const canAnimate = () => !reducedMotion && inViewport && documentVisible;
    const loop = (now) => {
      animationFrame = 0;
      if (disposed || !rig) return;
      if (canAnimate()) {
        const seconds = now / 1000;
        renderPose(seconds, true);
        const nextTick = Math.floor(seconds * 2);
        if (nextTick !== motionTick) {
          motionTick = nextTick;
          canvas.dataset.motionTick = String(nextTick);
        }
      }
      if (canAnimate()) animationFrame = window.requestAnimationFrame(loop);
    };

    const schedule = () => {
      if (!disposed && !animationFrame && canAnimate() && rig) {
        animationFrame = window.requestAnimationFrame(loop);
      }
    };

    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(
      canonicalSrc,
      (texture) => {
        if (disposed) {
          texture.dispose?.();
          return;
        }
        rig = createHomeMatthiasCanonicalRig(texture);
        stage.add(rig.root);
        resize();
        renderPose(0, false);
        canvas.dataset.motionTick = '0';
        canvas.dataset.motion = reducedMotion ? 'still-canonical-three' : 'canonical-three-routines';
        canvas.dataset.matthiasIdentity = 'canonical-angry-mock';
        canvas.dataset.artVersion = HOME_MATTHIAS_CANONICAL_ART_VERSION;
        canvas.dataset.rigVersion = HOME_MATTHIAS_CANONICAL_RIG_VERSION;
        setReady(true);
        schedule();
      },
      undefined,
      () => {
        if (!disposed) setFailed(true);
      },
    );

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(resize)
      : null;
    resizeObserver?.observe(host);
    if (!resizeObserver) window.addEventListener('resize', resize);

    const intersectionObserver = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(([entry]) => {
        inViewport = entry?.isIntersecting ?? true;
        if (inViewport) schedule();
        else if (animationFrame) {
          window.cancelAnimationFrame(animationFrame);
          animationFrame = 0;
        }
      }, { threshold: 0.01 })
      : null;
    intersectionObserver?.observe(host);

    const onVisibilityChange = () => {
      documentVisible = !document.hidden;
      if (documentVisible) schedule();
      else if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const onContextLost = (event) => {
      event.preventDefault();
      if (!disposed) setFailed(true);
    };
    canvas.addEventListener('webglcontextlost', onContextLost, false);

    resize();

    return () => {
      disposed = true;
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      intersectionObserver?.disconnect();
      resizeObserver?.disconnect();
      if (!resizeObserver) window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      canvas.removeEventListener('webglcontextlost', onContextLost, false);
      if (rig) stage.remove(rig.root);
      disposeHomeMatthiasCanonicalRig(rig);
      renderer.dispose();
    };
  }, [canonicalSrc, failed, phase, profile, reducedMotion, speaking]);

  const status = failed ? 'fallback' : ready ? 'ready' : 'loading';
  const fallbackSrc = canonicalSrc || fallbackAvatar || '';

  return (
    <span
      ref={hostRef}
      className={`home-matthias-3d is-${status}`}
      data-home-matthias-3d={status}
      data-matthias-identity="canonical-three-layer-rig"
      data-home-matthias-profile={profile}
      data-three-art-version={HOME_MATTHIAS_CANONICAL_ART_VERSION}
      data-three-rig-version={HOME_MATTHIAS_CANONICAL_RIG_VERSION}
      data-motion={reducedMotion ? 'still-canonical-three' : 'canonical-three-routines'}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} />
      {fallbackSrc ? <img src={fallbackSrc} alt="" draggable="false" /> : null}
    </span>
  );
}
