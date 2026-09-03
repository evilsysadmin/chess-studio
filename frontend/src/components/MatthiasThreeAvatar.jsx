import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  MATTHIAS_FACIAL_RIG_VERSION,
  matthiasFacialMotionSample,
  normalizeMatthiasFacialExpression,
  normalizeMatthiasFacialGesture,
} from './matthiasFacialRig.js';
import './MatthiasThreeAvatar.css';

function cue(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function matthiasThreeMotionProfile({ scene = '', activity = '', speaking = false } = {}) {
  if (speaking) return 'speak';
  const sceneKey = cue(scene);
  const activityKey = cue(activity);
  if (/sleep|sobando/.test(sceneKey) || /sobando|cabeceando/.test(activityKey)) return 'sleep';
  if (/coffee|beer-break|night|breakfast/.test(sceneKey) || /cafe|cerve|desayuno/.test(activityKey)) return 'sip';
  if (/lunch|bocata/.test(sceneKey) || /comida|cena|repostando/.test(activityKey)) return 'bite';
  if (/inception/.test(sceneKey) || /partida|ajedrez dentro/.test(activityKey)) return 'think';
  if (/ops/.test(sceneKey) || /operacion|notas/.test(activityKey)) return 'write';
  if (/dossier/.test(sceneKey) || /auditoria|expedient/.test(activityKey)) return 'dossier';
  if (/strategy|weekly|reading/.test(sceneKey) || /lectura|estudio|manual|estrategia|prensa/.test(activityKey)) return 'read';
  return 'idle';
}

export function matthiasThreeMotionPhase({ scene = '', activity = '' } = {}) {
  const key = `${cue(scene)}|${cue(activity)}`;
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 3600) / 1000;
}

function normalizeMotionIntensity(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(.65, Math.min(1.35, parsed));
}

export function matthiasThreeRenderProfile({ coarsePointer = false, width = 0, height = 0 } = {}) {
  const safeWidth = Math.max(0, Number(width) || 0);
  const safeHeight = Math.max(0, Number(height) || 0);
  const compactSurface = coarsePointer && safeWidth > 0 && safeHeight > 0 && Math.min(safeWidth, safeHeight) <= 96;

  if (compactSurface) {
    return {
      tier: 'compact',
      widthSegments: 14,
      heightSegments: 16,
      maxFps: 30,
      pixelRatioCap: 1,
    };
  }
  if (coarsePointer) {
    return {
      tier: 'coarse',
      widthSegments: 20,
      heightSegments: 24,
      maxFps: 45,
      pixelRatioCap: 1.15,
    };
  }
  return {
    tier: 'full',
    widthSegments: 28,
    heightSegments: 32,
    maxFps: 60,
    pixelRatioCap: 1.5,
  };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smooth01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function gestureCycle(time, {
  period = 8.4,
  delay = 0.45,
  rise = 1.0,
  hold = 0.75,
  fall = 1.05,
} = {}) {
  const local = ((time % period) + period) % period;
  const riseEnd = delay + rise;
  const holdEnd = riseEnd + hold;
  const fallEnd = holdEnd + fall;
  if (local < delay || local >= fallEnd) return 0;
  if (local < riseEnd) return smooth01((local - delay) / Math.max(.001, rise));
  if (local < holdEnd) return 1;
  return 1 - smooth01((local - holdEnd) / Math.max(.001, fall));
}

function gaussian(x, y, cx, cy, sx, sy) {
  const dx = (x - cx) / sx;
  const dy = (y - cy) / sy;
  return Math.exp(-(dx * dx + dy * dy) * 2.15);
}

function rotateRegion(x, y, pivotX, pivotY, angle, weight) {
  if (!angle || !weight) return { dx: 0, dy: 0 };
  const rx = x - pivotX;
  const ry = y - pivotY;
  const sin = Math.sin(angle) * weight;
  const cos = 1 + (Math.cos(angle) - 1) * weight;
  return {
    dx: rx * cos - ry * sin + pivotX - x,
    dy: rx * sin + ry * cos + pivotY - y,
  };
}

function deformVertex(profile, x, y, imageAspect, time, speaking, facialRigActive = false) {
  const nx = imageAspect ? x / imageAspect : x;
  const head = gaussian(nx, y, 0, .30, .42, .42);
  const mouth = gaussian(nx, y, 0, .18, .20, .12);
  const eyeBand = gaussian(nx, y, 0, .40, .28, .10);
  const leftArm = gaussian(nx, y, -.36, -.18, .32, .52);
  const rightArm = gaussian(nx, y, .36, -.18, .32, .52);
  const centerProp = gaussian(nx, y, 0, -.40, .36, .30);
  const rightProp = gaussian(nx, y, .40, -.34, .30, .34);
  const book = gaussian(nx, y, 0, -.46, .58, .28);
  const body = gaussian(nx, y, 0, -.05, .74, .92);
  const idleBreath = Math.sin(time * 1.25) * .0048 * body;
  let dx = 0;
  let dy = idleBreath;
  let dz = 0;
  let energy = 0;

  if (profile === 'idle') {
    const action = gestureCycle(time + .2, { period: 10.6, delay: .7, rise: .8, hold: .35, fall: .9 });
    const glance = Math.sin(time * 1.7) * action;
    const rot = rotateRegion(nx, y, 0, .17, -.026 * action, head);
    dx += rot.dx * imageAspect + head * glance * .006;
    dy += rot.dy;
    dz += head * action * .008;
    energy = action;
  } else if (profile === 'sip') {
    const action = gestureCycle(time, { period: 8.4, delay: .45, rise: 1.05, hold: .85, fall: 1.12 });
    const swallow = action > .94 ? Math.sin(time * 8.2) * .5 + .5 : 0;
    dy += rightArm * action * .205;
    dy += rightProp * action * .305;
    dx -= rightArm * action * .045;
    dx -= rightProp * action * .075;
    const rot = rotateRegion(nx, y, 0, .18, .046 * action, head);
    dx += rot.dx * imageAspect;
    dy += rot.dy - head * action * .022 - head * swallow * .007;
    dz += (rightArm + rightProp) * action * .022;
    energy = action;
  } else if (profile === 'bite') {
    const action = gestureCycle(time + .15, { period: 9.2, delay: .5, rise: 1.15, hold: .95, fall: 1.18 });
    const chew = action > .9 ? (Math.sin(time * 10.5) * .5 + .5) : 0;
    dy += centerProp * action * .355;
    dy += leftArm * action * .225;
    dy += rightArm * action * .225;
    dx += leftArm * action * .035;
    dx -= rightArm * action * .035;
    const rot = rotateRegion(nx, y, 0, .18, -.052 * action, head);
    dx += rot.dx * imageAspect;
    dy += rot.dy - head * action * .034 - mouth * chew * .012;
    dz += centerProp * action * .028 + (leftArm + rightArm) * action * .012;
    energy = action;
  } else if (profile === 'write') {
    const action = gestureCycle(time, { period: 7.8, delay: .35, rise: .7, hold: 1.8, fall: .8 });
    const scribble = Math.sin(time * 13.5) * action;
    const scratch = Math.cos(time * 8.4) * action;
    dx += rightArm * scribble * .052 + rightProp * scribble * .035;
    dy += rightArm * action * .052 + rightArm * scratch * .014;
    dy += rightProp * action * .028;
    const rot = rotateRegion(nx, y, 0, .18, -.034 * action, head);
    dx += rot.dx * imageAspect;
    dy += rot.dy - head * action * .012;
    dz += rightArm * action * .014;
    energy = action;
  } else if (profile === 'dossier') {
    const action = gestureCycle(time + .1, { period: 8.9, delay: .45, rise: .85, hold: 1.55, fall: .95 });
    const scan = Math.sin(time * 4.8) * action;
    dx += head * scan * .017;
    dy += rightArm * action * .065;
    dy += rightProp * action * .085;
    dx -= rightProp * action * .018;
    dz += rightProp * action * .018;
    const rot = rotateRegion(nx, y, 0, .18, -.022 * action, head);
    dx += rot.dx * imageAspect;
    dy += rot.dy;
    energy = action;
  } else if (profile === 'read') {
    const action = .38 + gestureCycle(time, { period: 8.8, delay: .6, rise: .75, hold: 1.85, fall: .8 }) * .62;
    const scan = Math.sin(time * 3.7) * action;
    const page = gestureCycle(time + 4.2, { period: 9.6, delay: .25, rise: .45, hold: .18, fall: .55 });
    dx += head * scan * .018;
    dy += head * Math.sin(time * 1.9) * .0045;
    dx += book * page * .018;
    dy += book * page * .012;
    dz += head * action * .007 + book * page * .006;
    energy = Math.max(action * .55, page);
  } else if (profile === 'think') {
    const action = gestureCycle(time + .2, { period: 8.2, delay: .5, rise: .95, hold: 1.2, fall: 1.0 });
    // Chess scenes keep broad head warping disabled. The explicit facial rig may
    // add tiny bounded expression deltas later, after this body deformation.
    dy += rightArm * action * .17;
    dx -= rightArm * action * .055;
    dy += body * action * .006;
    dz += rightArm * action * .02;
    energy = action;
  } else if (profile === 'sleep') {
    const local = ((time + .4) % 9.8 + 9.8) % 9.8;
    const action = gestureCycle(time + .4, { period: 9.8, delay: .5, rise: 1.8, hold: 1.4, fall: 1.8 });
    const nod = action * (.72 + Math.sin(local * 1.1) * .18);
    const rot = rotateRegion(nx, y, 0, .17, -.082 * nod, head);
    dx += rot.dx * imageAspect;
    dy += rot.dy - head * nod * .048 + body * Math.sin(time * .72) * .005;
    dz -= head * nod * .015;
    energy = action;
  } else if (profile === 'speak') {
    const action = speaking ? (.62 + Math.sin(time * 3.8) * .18) : gestureCycle(time, { period: 5, delay: .2, rise: .5, hold: 1.2, fall: .6 });
    const syllable = speaking ? Math.sin(time * 11.5) : 0;
    const rot = rotateRegion(nx, y, 0, .16, Math.sin(time * 2.4) * .017 * action, head);
    dx += rot.dx * imageAspect;
    dy += rot.dy - body * action * .006 + (facialRigActive ? 0 : mouth * syllable * .009);
    dz += head * action * .01;
    energy = action;
  }

  if (profile !== 'sleep' && !facialRigActive) {
    const blink = gestureCycle(time + 5.1, { period: 7.4, delay: 0, rise: .06, hold: .025, fall: .09 });
    dy -= eyeBand * blink * .012;
    energy = Math.max(energy, blink * .3);
  }

  if (profile === 'think') {
    const faceProtection = 1 - gaussian(nx, y, 0, .31, .30, .26);
    dx *= faceProtection;
    dy *= faceProtection;
    dz *= faceProtection;
  }

  return { dx, dy, dz, energy };
}

export function matthiasThreeMotionSample({
  profile = 'idle',
  x = 0,
  y = 0,
  imageAspect = 1,
  time = 0,
  speaking = false,
  motionIntensity = 1,
  facialExpression = '',
  facialGesture = 'idle',
} = {}) {
  const facialRigActive = Boolean(facialExpression);
  const motion = deformVertex(profile, x, y, imageAspect, time, speaking, facialRigActive);
  const intensity = normalizeMotionIntensity(motionIntensity);
  const faceMotion = facialRigActive
    ? matthiasFacialMotionSample({
      expression: facialExpression,
      gesture: facialGesture,
      x,
      y,
      imageAspect,
      time,
      speaking,
      intensity,
    })
    : { dx: 0, dy: 0, dz: 0, energy: 0 };
  return {
    dx: motion.dx * intensity + faceMotion.dx,
    dy: motion.dy * intensity + faceMotion.dy,
    dz: motion.dz * intensity + faceMotion.dz,
    energy: Math.max(motion.energy, faceMotion.energy),
  };
}

function resizeRenderer(renderer, camera, canvas, imageAspect, mesh) {
  const width = Math.max(1, canvas.clientWidth || 1);
  const height = Math.max(1, canvas.clientHeight || 1);
  const canvasAspect = width / height;
  renderer.setSize(width, height, false);
  camera.left = -canvasAspect;
  camera.right = canvasAspect;
  camera.top = 1;
  camera.bottom = -1;
  camera.updateProjectionMatrix();
  const scale = Math.max(1, canvasAspect / Math.max(.1, imageAspect));
  mesh.scale.setScalar(scale);
}

export default function MatthiasThreeAvatar({
  avatar,
  scene = 'base',
  activity = '',
  speaking = false,
  reducedMotion = false,
  motionIntensity = 1,
  facialExpression = '',
  facialGesture = 'idle',
}) {
  const canvasRef = useRef(null);
  const rootRef = useRef(null);
  const facialExpressionRef = useRef(normalizeMatthiasFacialExpression(facialExpression));
  const facialGestureRef = useRef(normalizeMatthiasFacialGesture(facialGesture));
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const profile = useMemo(
    () => matthiasThreeMotionProfile({ scene, activity, speaking }),
    [activity, scene, speaking],
  );
  const phase = useMemo(() => matthiasThreeMotionPhase({ scene, activity }), [activity, scene]);
  const normalizedIntensity = normalizeMotionIntensity(motionIntensity);
  const faceRigActive = Boolean(facialExpression);
  const normalizedFacialExpression = faceRigActive ? normalizeMatthiasFacialExpression(facialExpression) : '';
  const normalizedFacialGesture = normalizeMatthiasFacialGesture(facialGesture);
  facialExpressionRef.current = normalizedFacialExpression || 'stern';
  facialGestureRef.current = normalizedFacialGesture;

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root || !avatar) return undefined;

    let renderer;
    let raf = 0;
    let disposed = false;
    let resizeObserver = null;
    let resizeFallback = null;
    let visibilityListener = null;
    let intersectionObserver = null;
    let geometry = null;
    let material = null;
    let texture = null;
    let renderFrame = null;
    let inViewport = true;
    let documentVisible = typeof document === 'undefined' || document.visibilityState !== 'hidden';
    let lastRenderedAt = -Infinity;

    setReady(false);
    setFailed(false);
    root.dataset.threeReady = 'false';
    root.dataset.threeFailed = 'false';
    root.dataset.threeFrame = '0';
    root.dataset.threeEnergy = '0';
    root.dataset.threeReach = '0';
    root.dataset.threeVisibility = documentVisible ? 'visible' : 'hidden';

    const coarsePointer = Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
    const renderProfile = matthiasThreeRenderProfile({
      coarsePointer,
      width: canvas.clientWidth,
      height: canvas.clientHeight,
    });
    root.dataset.threeRenderTier = renderProfile.tier;
    root.dataset.threeSegments = `${renderProfile.widthSegments}x${renderProfile.heightSegments}`;
    root.dataset.threeMaxFps = String(renderProfile.maxFps);

    const cancelFrame = () => {
      if (!raf) return;
      window.cancelAnimationFrame(raf);
      raf = 0;
    };

    const canAnimate = () => !reducedMotion && documentVisible && inViewport;
    const requestFrame = () => {
      if (disposed || !renderFrame || raf || !canAnimate()) return;
      raf = window.requestAnimationFrame(renderFrame);
    };

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: !coarsePointer,
        powerPreference: coarsePointer ? 'low-power' : 'default',
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, renderProfile.pixelRatioCap));
    } catch {
      setFailed(true);
      root.dataset.threeFailed = 'true';
      return undefined;
    }

    const scene3d = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 10);
    camera.position.z = 3;

    texture = new THREE.TextureLoader().load(
      avatar,
      (loaded) => {
        if (disposed) return;
        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.minFilter = THREE.LinearFilter;
        loaded.magFilter = THREE.LinearFilter;
        loaded.needsUpdate = true;
        const imageAspect = Math.max(.1, (loaded.image?.naturalWidth || loaded.image?.width || 1) / (loaded.image?.naturalHeight || loaded.image?.height || 1));
        geometry = new THREE.PlaneGeometry(
          2 * imageAspect,
          2,
          renderProfile.widthSegments,
          renderProfile.heightSegments,
        );
        const basePositions = new Float32Array(geometry.attributes.position.array);
        material = new THREE.MeshBasicMaterial({
          map: loaded,
          transparent: true,
          depthWrite: false,
          toneMapped: false,
        });
        const mesh = new THREE.Mesh(geometry, material);
        scene3d.add(mesh);

        const doResize = () => resizeRenderer(renderer, camera, canvas, imageAspect, mesh);
        doResize();
        if (typeof ResizeObserver === 'function') {
          resizeObserver = new ResizeObserver(doResize);
          resizeObserver.observe(canvas);
        } else {
          resizeFallback = doResize;
          window.addEventListener('resize', resizeFallback);
        }

        let frames = 0;
        let peakEnergy = 0;
        let peakReach = 0;
        const startedAt = performance.now();
        const minFrameInterval = 1000 / renderProfile.maxFps;
        renderFrame = (stamp) => {
          raf = 0;
          if (disposed) return;
          if (frames > 0 && stamp - lastRenderedAt < minFrameInterval) {
            requestFrame();
            return;
          }
          lastRenderedAt = stamp;
          const time = Math.max(0, stamp - startedAt) / 1000 + phase;
          const positions = geometry.attributes.position;
          let energy = 0;
          let reach = 0;
          for (let index = 0; index < positions.count; index += 1) {
            const offset = index * 3;
            const x = basePositions[offset];
            const y = basePositions[offset + 1];
            const z = basePositions[offset + 2];
            const motion = reducedMotion
              ? { dx: 0, dy: 0, dz: 0, energy: 0 }
              : matthiasThreeMotionSample({
                profile,
                x,
                y,
                imageAspect,
                time,
                speaking,
                motionIntensity: normalizedIntensity,
                facialExpression: faceRigActive ? facialExpressionRef.current : '',
                facialGesture: facialGestureRef.current,
              });
            positions.array[offset] = x + motion.dx;
            positions.array[offset + 1] = y + motion.dy;
            positions.array[offset + 2] = z + motion.dz;
            energy = Math.max(energy, motion.energy || 0);
            reach = Math.max(reach, motion.dy || 0);
          }
          positions.needsUpdate = true;
          if (!reducedMotion) {
            mesh.rotation.z = Math.sin(time * 1.05) * .0035 * normalizedIntensity;
            mesh.rotation.y = Math.sin(time * .72) * .0045 * normalizedIntensity;
          } else {
            mesh.rotation.set(0, 0, 0);
          }
          renderer.render(scene3d, camera);
          frames += 1;
          peakEnergy = Math.max(peakEnergy, energy);
          peakReach = Math.max(peakReach, reach);
          if (frames === 1) {
            setReady(true);
            root.dataset.threeReady = 'true';
          }
          if (frames % 6 === 0 || frames === 1) {
            root.dataset.threeFrame = String(frames);
            root.dataset.threeEnergy = peakEnergy.toFixed(3);
            root.dataset.threeReach = peakReach.toFixed(3);
          }
          requestFrame();
        };

        visibilityListener = () => {
          documentVisible = document.visibilityState !== 'hidden';
          root.dataset.threeVisibility = documentVisible ? 'visible' : 'hidden';
          if (!documentVisible) cancelFrame();
          else requestFrame();
        };
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visibilityListener);

        if (typeof IntersectionObserver === 'function') {
          intersectionObserver = new IntersectionObserver((entries) => {
            const entry = entries[0];
            inViewport = Boolean(entry?.isIntersecting ?? true);
            root.dataset.threeViewport = inViewport ? 'visible' : 'paused';
            if (!inViewport) cancelFrame();
            else requestFrame();
          }, { rootMargin: '80px' });
          intersectionObserver.observe(root);
        } else {
          root.dataset.threeViewport = 'visible';
        }

        // Always paint one frame so the WebGL canvas can replace the fallback.
        raf = window.requestAnimationFrame(renderFrame);
      },
      undefined,
      () => {
        if (!disposed) {
          setFailed(true);
          root.dataset.threeFailed = 'true';
        }
      },
    );

    return () => {
      disposed = true;
      cancelFrame();
      resizeObserver?.disconnect?.();
      intersectionObserver?.disconnect?.();
      if (resizeFallback) window.removeEventListener('resize', resizeFallback);
      if (visibilityListener && typeof document !== 'undefined') document.removeEventListener('visibilitychange', visibilityListener);
      geometry?.dispose?.();
      material?.dispose?.();
      texture?.dispose?.();
      renderer?.dispose?.();
    };
  }, [avatar, faceRigActive, normalizedIntensity, phase, profile, reducedMotion, speaking]);

  return (
    <span
      ref={rootRef}
      className={`matthias-three-avatar${ready ? ' is-ready' : ''}${failed ? ' is-failed' : ''}`}
      data-matthias-three-avatar="true"
      data-three-scene={scene || 'base'}
      data-three-activity={activity || ''}
      data-three-profile={profile}
      data-three-motion={reducedMotion ? 'reduced' : 'active'}
      data-three-motion-intensity={normalizedIntensity.toFixed(2)}
      data-three-motion-phase={phase.toFixed(3)}
      data-three-face-rig={faceRigActive ? MATTHIAS_FACIAL_RIG_VERSION : 'legacy'}
      data-three-face-expression={normalizedFacialExpression || 'none'}
      data-three-face-gesture={normalizedFacialGesture}
      data-three-ready={ready ? 'true' : 'false'}
      data-three-failed={failed ? 'true' : 'false'}
      data-three-frame="0"
      data-three-energy="0"
      data-three-reach="0"
      data-three-visibility="visible"
      data-three-viewport="visible"
    >
      <canvas ref={canvasRef} className="matthias-three-avatar__canvas" aria-hidden="true" />
      <img
        className="matthias-three-avatar__fallback"
        src={avatar}
        alt=""
        draggable="false"
        aria-hidden="true"
        data-matthias-canonical-art="true"
      />
    </span>
  );
}
