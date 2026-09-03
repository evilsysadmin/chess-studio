import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  MATTHIAS_FACIAL_RIG_VERSION,
  matthiasFacialMotionSample,
} from './matthiasFacialRig.js';
import {
  matthiasHomeMotionPhase,
  matthiasHomeMotionProfile,
  matthiasHomeRigidPoseSample,
} from './MatthiasHomePresenceAvatar.jsx';
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

export const MATTHIAS_HOME_FACE_WARP_LIMIT = .019;
export const MATTHIAS_HOME_MICROGESTURE_VERSION = 'home-face-v2';

function normalizeIntensity(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(.72, Math.min(1.24, parsed));
}

export function matthiasHomeFacialCue({
  profile = 'idle',
  presenceState = MATTHIAS_HOME_STATES.IDLE,
  speaking = false,
} = {}) {
  if (speaking || presenceState === MATTHIAS_HOME_STATES.ATTEND) {
    return { expression: 'alert', gesture: 'idle' };
  }
  if (presenceState === MATTHIAS_HOME_STATES.GLANCE_LEFT) {
    return { expression: 'alert', gesture: 'head-left' };
  }
  if (presenceState === MATTHIAS_HOME_STATES.GLANCE_RIGHT) {
    return { expression: 'alert', gesture: 'head-right' };
  }
  if (presenceState === MATTHIAS_HOME_STATES.SURVEY) {
    return { expression: 'focus', gesture: 'survey' };
  }
  if (presenceState === MATTHIAS_HOME_STATES.LEAN_IN) {
    return { expression: 'focus', gesture: 'idle' };
  }
  if (presenceState === MATTHIAS_HOME_STATES.SKEPTICAL) {
    return { expression: 'smirk', gesture: 'idle' };
  }
  if (presenceState === MATTHIAS_HOME_STATES.NOD) {
    return { expression: 'stern', gesture: 'idle' };
  }

  if (profile === 'sip') return { expression: 'coffee', gesture: 'idle' };
  if (profile === 'read' || profile === 'dossier') return { expression: 'focus', gesture: 'survey' };
  if (profile === 'write') return { expression: 'focus', gesture: 'idle' };
  if (profile === 'think') return { expression: 'focus', gesture: 'glance' };
  return { expression: 'stern', gesture: 'idle' };
}

export function matthiasHomeFacialMotionSample({
  profile = 'idle',
  presenceState = MATTHIAS_HOME_STATES.IDLE,
  x = 0,
  y = 0,
  imageAspect = 1,
  time = 0,
  speaking = false,
  motionIntensity = 1,
} = {}) {
  const cue = matthiasHomeFacialCue({ profile, presenceState, speaking });
  return matthiasFacialMotionSample({
    expression: cue.expression,
    gesture: cue.gesture,
    x,
    y,
    imageAspect,
    time,
    speaking,
    intensity: normalizeIntensity(motionIntensity),
  });
}

function renderPolicy({ coarsePointer = false, width = 0, height = 0 } = {}) {
  const compact = coarsePointer && Math.min(Number(width) || 0, Number(height) || 0) <= 96;
  if (compact) return { tier: 'compact', widthSegments: 14, heightSegments: 16, maxFps: 30, pixelRatioCap: 1 };
  if (coarsePointer) return { tier: 'coarse', widthSegments: 18, heightSegments: 22, maxFps: 45, pixelRatioCap: 1.15 };
  return { tier: 'full', widthSegments: 24, heightSegments: 28, maxFps: 60, pixelRatioCap: 1.5 };
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

export default function MatthiasHomeMicrogestureAvatar({
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
  const intensity = normalizeIntensity(motionIntensity);
  const descriptor = matthiasHomeStateDescriptor(machine.mode);
  const facialCue = matthiasHomeFacialCue({ profile, presenceState: machine.mode, speaking });
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
    root.dataset.threeFaceWarp = '0.0000';
    root.dataset.threeVisibility = documentVisible ? 'visible' : 'hidden';

    const coarsePointer = Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
    const policy = renderPolicy({
      coarsePointer,
      width: canvas.clientWidth,
      height: canvas.clientHeight,
    });
    root.dataset.threeRenderTier = policy.tier;
    root.dataset.threeSegments = `${policy.widthSegments}x${policy.heightSegments}`;
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

        // The body stays a rigid card. Segmentation exists only so the bounded
        // face-v1 rig can move eyes, brows, cheeks and jaw inside its own mask.
        geometry = new THREE.PlaneGeometry(
          2 * imageAspect,
          2,
          policy.widthSegments,
          policy.heightSegments,
        );
        const positions = geometry.attributes.position;
        const basePositions = new Float32Array(positions.array);
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
        let peakFaceWarp = 0;
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
              motionIntensity: intensity,
            });

          const currentCue = matthiasHomeFacialCue({
            profile,
            presenceState: modeRef.current,
            speaking,
          });
          let frameFaceWarp = 0;
          let faceEnergy = 0;
          for (let index = 0; index < positions.count; index += 1) {
            const offset = index * 3;
            const x = basePositions[offset];
            const y = basePositions[offset + 1];
            const z = basePositions[offset + 2];
            const faceMotion = reducedMotion
              ? { dx: 0, dy: 0, dz: 0, energy: 0 }
              : matthiasFacialMotionSample({
                expression: currentCue.expression,
                gesture: currentCue.gesture,
                x,
                y,
                imageAspect,
                time,
                speaking,
                intensity,
              });
            positions.array[offset] = x + faceMotion.dx;
            positions.array[offset + 1] = y + faceMotion.dy;
            positions.array[offset + 2] = z + faceMotion.dz;
            frameFaceWarp = Math.max(
              frameFaceWarp,
              Math.abs(faceMotion.dx),
              Math.abs(faceMotion.dy),
              Math.abs(faceMotion.dz),
            );
            faceEnergy = Math.max(faceEnergy, faceMotion.energy || 0);
          }
          positions.needsUpdate = true;

          mesh.position.set(pose.x, pose.y, 0);
          mesh.rotation.set(pose.rx, pose.ry, pose.rz);
          mesh.scale.setScalar((mesh.userData.baseScale || 1) * pose.scale);
          renderer.render(scene3d, camera);

          frames += 1;
          peakEnergy = Math.max(peakEnergy, pose.energy || 0, faceEnergy);
          peakReach = Math.max(peakReach, pose.reach || 0);
          peakFaceWarp = Math.max(peakFaceWarp, frameFaceWarp);
          if (frames === 1) {
            setReady(true);
            root.dataset.threeReady = 'true';
          }
          if (frames % 6 === 0 || frames === 1) {
            root.dataset.threeFrame = String(frames);
            root.dataset.threeEnergy = peakEnergy.toFixed(3);
            root.dataset.threeReach = peakReach.toFixed(3);
            root.dataset.threeFaceWarp = peakFaceWarp.toFixed(4);
            root.dataset.threeFaceExpression = currentCue.expression;
            root.dataset.threeFaceGesture = currentCue.gesture;
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

        // One frame is always painted for a clean canonical-art hand-off.
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
  }, [avatar, intensity, phase, profile, reducedMotion, speaking]);

  return (
    <span
      ref={rootRef}
      className={`matthias-three-avatar${ready ? ' is-ready' : ''}${failed ? ' is-failed' : ''}`}
      data-matthias-three-avatar="true"
      data-home-presence-version={MATTHIAS_HOME_PRESENCE_VERSION}
      data-home-microgesture-version={MATTHIAS_HOME_MICROGESTURE_VERSION}
      data-home-presence-state={machine.mode}
      data-home-presence-gesture={descriptor.gesture}
      data-three-scene={scene || 'base'}
      data-three-activity={activity || ''}
      data-three-profile={profile}
      data-three-motion={reducedMotion ? 'reduced' : 'active'}
      data-three-motion-intensity={intensity.toFixed(2)}
      data-three-motion-phase={phase.toFixed(3)}
      data-three-deformation="rigid-body+bounded-face"
      data-three-face-rig={MATTHIAS_FACIAL_RIG_VERSION}
      data-three-face-expression={facialCue.expression}
      data-three-face-gesture={facialCue.gesture}
      data-three-face-warp="0.0000"
      data-three-face-warp-limit={MATTHIAS_HOME_FACE_WARP_LIMIT.toFixed(3)}
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
