import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  createMatthiasHomePresenceMachine,
  MATTHIAS_HOME_PRESENCE_VERSION,
  MATTHIAS_HOME_STATES,
  matthiasHomeIdleDelay,
  matthiasHomeStateDescriptor,
  matthiasHomeStateDuration,
  nextMatthiasHomeAmbientState,
  transitionMatthiasHomePresence,
} from './matthiasHomePresenceStateMachine.js';
import './MatthiasThreeAvatar.css';

function cue(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function matthiasHomeMotionProfile({ scene = '', activity = '', speaking = false } = {}) {
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

export function matthiasHomeMotionPhase({ scene = '', activity = '' } = {}) {
  const key = `${cue(scene)}|${cue(activity)}`;
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 3600) / 1000;
}

function normalizeIntensity(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(.72, Math.min(1.24, parsed));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smooth01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function wave01(time, speed = 1, phase = 0) {
  return .5 + Math.sin(time * speed + phase) * .5;
}

function statePulse(stateElapsed, durationMs) {
  if (!durationMs) return 1;
  const progress = clamp01((stateElapsed * 1000) / durationMs);
  return Math.sin(progress * Math.PI);
}

function activityPose(profile, time, speaking) {
  const breath = Math.sin(time * .92);
  const pose = {
    x: 0,
    y: breath * .0025,
    rx: 0,
    ry: 0,
    rz: 0,
    scale: 1 + breath * .0012,
    energy: Math.abs(breath) * .09,
    reach: 0,
  };

  if (profile === 'sip') {
    const action = smooth01(wave01(time, 1.55, .7));
    pose.rx -= action * .0105;
    pose.y += action * .0042;
    pose.scale += action * .0018;
    pose.energy = Math.max(pose.energy, .18 + action * .34);
    pose.reach = action * .48;
  } else if (profile === 'bite') {
    const action = smooth01(wave01(time, 1.38, 1.1));
    pose.rx -= action * .0125;
    pose.y -= action * .0024;
    pose.scale += action * .0026;
    pose.energy = Math.max(pose.energy, .2 + action * .38);
    pose.reach = action * .60;
  } else if (profile === 'write') {
    const scribble = Math.sin(time * 3.8);
    pose.x += scribble * .0026;
    pose.rz += scribble * .0024;
    pose.ry += Math.sin(time * 1.15) * .0032;
    pose.energy = Math.max(pose.energy, .15 + Math.abs(scribble) * .20);
  } else if (profile === 'dossier') {
    const scan = Math.sin(time * 1.2);
    pose.ry += scan * .0062;
    pose.rz -= scan * .0018;
    pose.scale += .0015;
    pose.energy = Math.max(pose.energy, .15 + Math.abs(scan) * .18);
  } else if (profile === 'read') {
    const scan = Math.sin(time * 1.45);
    const nod = Math.sin(time * .74);
    pose.ry += scan * .0052;
    pose.rx += nod * .0048;
    pose.y -= .0015;
    pose.energy = Math.max(pose.energy, .14 + Math.max(Math.abs(scan), Math.abs(nod)) * .18);
  } else if (profile === 'think') {
    const thought = wave01(time, .72, .4);
    pose.rx -= thought * .0065;
    pose.scale += thought * .0036;
    pose.energy = Math.max(pose.energy, .14 + thought * .16);
  } else if (profile === 'sleep') {
    const nod = smooth01(wave01(time, .58, .3));
    pose.rx += nod * .0145;
    pose.y -= nod * .0032;
    pose.rz += Math.sin(time * .41) * .003;
    pose.energy = Math.max(pose.energy, .12 + nod * .22);
  } else if (profile === 'speak' && speaking) {
    const cadence = Math.sin(time * 2.65);
    const emphasis = wave01(time, 1.2, .9);
    pose.rx -= .0055 + emphasis * .004;
    pose.y += .0035 + cadence * .0015;
    pose.scale += .0038;
    pose.rz += cadence * .0016;
    pose.energy = Math.max(pose.energy, .52);
  }

  return pose;
}

function presencePose(mode, stateElapsed) {
  const duration = matthiasHomeStateDuration(mode);
  const pulse = statePulse(stateElapsed, duration);
  const pose = { x: 0, y: 0, rx: 0, ry: 0, rz: 0, scale: 1, energy: 0 };

  switch (mode) {
    case MATTHIAS_HOME_STATES.GLANCE_LEFT:
      pose.ry = -.0155 * pulse;
      pose.rz = .0022 * pulse;
      pose.energy = .36 * pulse;
      break;
    case MATTHIAS_HOME_STATES.GLANCE_RIGHT:
      pose.ry = .0155 * pulse;
      pose.rz = -.0022 * pulse;
      pose.energy = .36 * pulse;
      break;
    case MATTHIAS_HOME_STATES.SURVEY:
      pose.ry = Math.sin(stateElapsed * 4.1) * .0125 * pulse;
      pose.x = Math.sin(stateElapsed * 3.2) * .0024 * pulse;
      pose.energy = .42 * pulse;
      break;
    case MATTHIAS_HOME_STATES.LEAN_IN:
      pose.rx = -.011 * pulse;
      pose.y = .0045 * pulse;
      pose.scale = 1 + .0075 * pulse;
      pose.energy = .48 * pulse;
      break;
    case MATTHIAS_HOME_STATES.NOD:
      pose.rx = Math.sin(stateElapsed * 7.6) * .0105 * pulse;
      pose.y = -Math.abs(Math.sin(stateElapsed * 7.6)) * .0018 * pulse;
      pose.energy = .43 * pulse;
      break;
    case MATTHIAS_HOME_STATES.SKEPTICAL:
      pose.rz = -.0068 * pulse;
      pose.ry = .0042 * pulse;
      pose.energy = .40 * pulse;
      break;
    case MATTHIAS_HOME_STATES.ATTEND:
      pose.rx = -.007;
      pose.y = .0035;
      pose.scale = 1.004;
      pose.energy = .50;
      break;
    default:
      break;
  }

  return pose;
}

export function matthiasHomeRigidPoseSample({
  profile = 'idle',
  presenceState = MATTHIAS_HOME_STATES.IDLE,
  time = 0,
  stateElapsed = 0,
  speaking = false,
  motionIntensity = 1,
} = {}) {
  const intensity = normalizeIntensity(motionIntensity);
  const activity = activityPose(profile, time, speaking);
  const presence = presencePose(presenceState, stateElapsed);
  return {
    x: (activity.x + presence.x) * intensity,
    y: (activity.y + presence.y) * intensity,
    rx: (activity.rx + presence.rx) * intensity,
    ry: (activity.ry + presence.ry) * intensity,
    rz: (activity.rz + presence.rz) * intensity,
    scale: 1 + ((activity.scale - 1) + (presence.scale - 1)) * intensity,
    energy: Math.max(activity.energy, presence.energy),
    reach: activity.reach,
  };
}

function renderPolicy({ coarsePointer = false, width = 0, height = 0 } = {}) {
  const compact = coarsePointer && Math.min(Number(width) || 0, Number(height) || 0) <= 96;
  if (compact) return { tier: 'compact', maxFps: 30, pixelRatioCap: 1 };
  if (coarsePointer) return { tier: 'coarse', maxFps: 45, pixelRatioCap: 1.15 };
  return { tier: 'full', maxFps: 60, pixelRatioCap: 1.5 };
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
  const baseScale = Math.max(1, canvasAspect / Math.max(.1, imageAspect));
  mesh.userData.baseScale = baseScale;
  mesh.scale.setScalar(baseScale);
}

export default function MatthiasHomePresenceAvatar({
  avatar,
  scene = 'base',
  activity = '',
  speaking = false,
  reducedMotion = false,
  motionIntensity = 1,
}) {
  const canvasRef = useRef(null);
  const rootRef = useRef(null);
  const modeRef = useRef(MATTHIAS_HOME_STATES.IDLE);
  const modeStartedAtRef = useRef(0);
  const [machine, dispatch] = useReducer(
    transitionMatthiasHomePresence,
    undefined,
    createMatthiasHomePresenceMachine,
  );
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const profile = useMemo(
    () => matthiasHomeMotionProfile({ scene, activity, speaking }),
    [activity, scene, speaking],
  );
  const phase = useMemo(() => matthiasHomeMotionPhase({ scene, activity }), [activity, scene]);
  const normalizedIntensity = normalizeIntensity(motionIntensity);
  const descriptor = matthiasHomeStateDescriptor(machine.mode);
  modeRef.current = machine.mode;

  useEffect(() => {
    modeStartedAtRef.current = typeof performance !== 'undefined' ? performance.now() : 0;
    if (rootRef.current) rootRef.current.dataset.homePresenceState = machine.mode;
  }, [machine.mode]);

  useEffect(() => {
    if (reducedMotion) {
      dispatch({ type: 'RESET' });
      return;
    }
    dispatch({ type: speaking ? 'SPEECH_START' : 'SPEECH_END' });
  }, [reducedMotion, speaking]);

  useEffect(() => {
    if (reducedMotion || speaking || typeof window === 'undefined') return undefined;
    let timer = 0;
    if (machine.mode === MATTHIAS_HOME_STATES.IDLE) {
      const next = nextMatthiasHomeAmbientState({
        lastAmbient: machine.lastAmbient,
        profile,
      });
      timer = window.setTimeout(
        () => dispatch({ type: 'AMBIENT_START', mode: next }),
        matthiasHomeIdleDelay(Math.random, profile),
      );
    } else if (machine.mode !== MATTHIAS_HOME_STATES.ATTEND) {
      timer = window.setTimeout(
        () => dispatch({ type: 'AMBIENT_END', mode: machine.mode }),
        matthiasHomeStateDuration(machine.mode),
      );
    }
    return () => window.clearTimeout(timer);
  }, [machine.lastAmbient, machine.mode, profile, reducedMotion, speaking]);

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
    root.dataset.threeFaceWarp = '0.000';
    root.dataset.threeVisibility = documentVisible ? 'visible' : 'hidden';

    const coarsePointer = Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
    const policy = renderPolicy({
      coarsePointer,
      width: canvas.clientWidth,
      height: canvas.clientHeight,
    });
    root.dataset.threeRenderTier = policy.tier;
    root.dataset.threeSegments = '1x1';
    root.dataset.threeMaxFps = String(policy.maxFps);

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
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, policy.pixelRatioCap));
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
        const imageAspect = Math.max(
          .1,
          (loaded.image?.naturalWidth || loaded.image?.width || 1)
          / (loaded.image?.naturalHeight || loaded.image?.height || 1),
        );
        // Four vertices, one rigid plane. Home never bends the canonical face.
        geometry = new THREE.PlaneGeometry(2 * imageAspect, 2, 1, 1);
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
        const minFrameInterval = 1000 / policy.maxFps;
        renderFrame = (stamp) => {
          raf = 0;
          if (disposed) return;
          if (frames > 0 && stamp - lastRenderedAt < minFrameInterval) {
            requestFrame();
            return;
          }
          lastRenderedAt = stamp;
          const time = Math.max(0, stamp - startedAt) / 1000 + phase;
          const stateElapsed = Math.max(0, stamp - modeStartedAtRef.current) / 1000;
          const pose = reducedMotion
            ? { x: 0, y: 0, rx: 0, ry: 0, rz: 0, scale: 1, energy: 0, reach: 0 }
            : matthiasHomeRigidPoseSample({
              profile,
              presenceState: modeRef.current,
              time,
              stateElapsed,
              speaking,
              motionIntensity: normalizedIntensity,
            });

          mesh.position.set(pose.x, pose.y, 0);
          mesh.rotation.set(pose.rx, pose.ry, pose.rz);
          mesh.scale.setScalar((mesh.userData.baseScale || 1) * pose.scale);
          renderer.render(scene3d, camera);
          frames += 1;
          peakEnergy = Math.max(peakEnergy, pose.energy || 0);
          peakReach = Math.max(peakReach, pose.reach || 0);
          if (frames === 1) {
            setReady(true);
            root.dataset.threeReady = 'true';
          }
          if (frames % 6 === 0 || frames === 1) {
            root.dataset.threeFrame = String(frames);
            root.dataset.threeEnergy = peakEnergy.toFixed(3);
            root.dataset.threeReach = peakReach.toFixed(3);
            root.dataset.threeFaceWarp = '0.000';
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

        // Always paint one frame so the canonical fallback can hand off cleanly.
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
      if (visibilityListener && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', visibilityListener);
      }
      geometry?.dispose?.();
      material?.dispose?.();
      texture?.dispose?.();
      renderer?.dispose?.();
    };
  }, [avatar, normalizedIntensity, phase, profile, reducedMotion, speaking]);

  return (
    <span
      ref={rootRef}
      className={`matthias-three-avatar${ready ? ' is-ready' : ''}${failed ? ' is-failed' : ''}`}
      data-matthias-three-avatar="true"
      data-home-presence-version={MATTHIAS_HOME_PRESENCE_VERSION}
      data-home-presence-state={machine.mode}
      data-home-presence-gesture={descriptor.gesture}
      data-three-scene={scene || 'base'}
      data-three-activity={activity || ''}
      data-three-profile={profile}
      data-three-motion={reducedMotion ? 'reduced' : 'active'}
      data-three-motion-intensity={normalizedIntensity.toFixed(2)}
      data-three-motion-phase={phase.toFixed(3)}
      data-three-deformation="rigid-only"
      data-three-face-rig="home-rigid-v1"
      data-three-face-expression="canonical"
      data-three-face-gesture={descriptor.gesture}
      data-three-face-warp="0.000"
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
