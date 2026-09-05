import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import * as THREE from 'three';
import { request } from '../http.js';
import { matthiasFacialMotionSample } from './matthiasFacialRig.js';
import {
  matthiasHomeMotionPhase,
  matthiasHomeMotionProfile,
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
import {
  canonicalMatthiasDataUrl,
  MATTHIAS_CANONICAL_ART_VERSION,
  MATTHIAS_CANONICAL_ASSET_URL,
} from './MatthiasCanonicalMock.js';
import {
  applyMatthiasPremiumHomePose,
  createMatthiasPremiumHome3D,
  disposeMatthiasPremiumHome3D,
  matthiasPremiumHomeActivityProp,
  MATTHIAS_PAWN_EMBLEM,
  MATTHIAS_PREMIUM_HOME_ACTIVITY_RIG_VERSION,
  MATTHIAS_PREMIUM_HOME_FACE_RIG_VERSION,
  MATTHIAS_PREMIUM_HOME_FIDELITY_VERSION,
  MATTHIAS_PREMIUM_HOME_MODEL_VERSION,
  MATTHIAS_PREMIUM_HOME_REFERENCE,
  MATTHIAS_PREMIUM_HOME_RENDER_CONTRACT,
} from './MatthiasPremiumHome3D.js';
import { matthiasPawnPoseSample } from './MatthiasPawn3D.js';
import './MatthiasThreeAvatar.css';

export const MATTHIAS_HOME_FACE_WARP_LIMIT = .019;
export const MATTHIAS_HOME_MICROGESTURE_VERSION = 'home-face-v3-premium';

function normalizeIntensity(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(.72, Math.min(1.24, parsed));
}

function semanticCue(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function matthiasHomeActivityProfile({ scene = '', activity = '' } = {}) {
  const key = `${semanticCue(scene)}|${semanticCue(activity)}`;
  if (/breakfast|desayuno/.test(key)) return 'breakfast';
  return matthiasHomeMotionProfile({ scene, activity, speaking: false });
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

// Compatibility helper for callers/tests that still sample the bounded facial
// field. The live Home renderer below is real geometry and never warps pixels.
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
  if (compact) return { tier: 'compact', maxFps: 30, pixelRatioCap: 1.15 };
  if (coarsePointer) return { tier: 'coarse', maxFps: 45, pixelRatioCap: 1.35 };
  return { tier: 'full', maxFps: 60, pixelRatioCap: 1.7 };
}

function resizeRenderer(renderer, camera, canvas) {
  const width = Math.max(1, canvas.clientWidth || 1);
  const height = Math.max(1, canvas.clientHeight || 1);
  renderer.setSize(width, height, false);

  // Orthographic framing is identity-critical: no wide-angle mascot distortion.
  const aspect = width / height;
  const viewHeight = 2.72;
  const viewWidth = viewHeight * aspect;
  camera.left = -viewWidth / 2;
  camera.right = viewWidth / 2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
  camera.updateProjectionMatrix();
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
  const profileRef = useRef('idle');
  const activityProfileRef = useRef('idle');
  const phaseRef = useRef(0);
  const intensityRef = useRef(1);
  const speakingRef = useRef(false);
  const [machine, dispatch] = useReducer(
    transitionMatthiasHomePresence,
    undefined,
    createMatthiasHomePresenceMachine,
  );
  const [canonicalSrc, setCanonicalSrc] = useState('');
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Speech owns face/attention, not the physical task. Keep a second semantic
  // profile without the speech override so Matthias can talk while holding the
  // cup/book/dossier he was already using. Breakfast deliberately keeps sip-like
  // motion while exposing a richer cup+plate composition to the 3D activity rig.
  const activityProfile = useMemo(
    () => matthiasHomeActivityProfile({ scene, activity }),
    [activity, scene],
  );
  const profile = useMemo(
    () => matthiasHomeMotionProfile({ scene, activity, speaking }),
    [activity, scene, speaking],
  );
  const activityProp = useMemo(
    () => matthiasPremiumHomeActivityProp(activityProfile),
    [activityProfile],
  );
  const phase = useMemo(() => matthiasHomeMotionPhase({ scene, activity }), [activity, scene]);
  const intensity = normalizeIntensity(motionIntensity);
  const descriptor = matthiasHomeStateDescriptor(machine.mode);
  const facialCue = matthiasHomeFacialCue({ profile, presenceState: machine.mode, speaking });

  modeRef.current = machine.mode;
  profileRef.current = profile;
  activityProfileRef.current = activityProfile;
  phaseRef.current = phase;
  intensityRef.current = intensity;
  speakingRef.current = speaking;

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

  // The original approved bitmap remains only as startup/failure fallback.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    let cancelled = false;
    request(MATTHIAS_CANONICAL_ASSET_URL, { cache: 'force-cache' })
      .then((response) => {
        if (!response.ok) throw new Error(`Canonical Matthias asset ${response.status}`);
        return response.text();
      })
      .then((payload) => canonicalMatthiasDataUrl(payload))
      .then((src) => {
        if (!cancelled) setCanonicalSrc(src);
      })
      .catch(() => {
        // 3D does not depend on this asset; caller-provided avatar still exists.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return undefined;

    let renderer;
    let rig = null;
    let raf = 0;
    let disposed = false;
    let resizeObserver = null;
    let resizeFallback = null;
    let visibilityListener = null;
    let intersectionObserver = null;
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
    root.dataset.threeActivityProp = matthiasPremiumHomeActivityProp(activityProfileRef.current);
    root.dataset.threeActivityReach = '0';
    root.dataset.threeFaceWarp = '0.0000';
    root.dataset.threeFaceArticulation = '0.000';
    root.dataset.threeHeadYaw = '0.000';
    root.dataset.threeBlink = '0.000';
    root.dataset.threeMouthOpen = '0.000';
    root.dataset.threeVisibility = documentVisible ? 'visible' : 'hidden';

    const coarsePointer = Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
    const policy = renderPolicy({
      coarsePointer,
      width: canvas.clientWidth,
      height: canvas.clientHeight,
    });
    root.dataset.threeRenderTier = policy.tier;
    root.dataset.threeMaxFps = String(policy.maxFps);

    const cancelFrame = () => {
      if (!raf) return;
      window.cancelAnimationFrame(raf);
      raf = 0;
    };
    const canAnimate = () => !reducedMotion && documentVisible && inViewport;
    const requestFrame = () => {
      if (disposed || !rig || !renderFrame || raf || !canAnimate()) return;
      raf = window.requestAnimationFrame(renderFrame);
    };

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: !coarsePointer,
        powerPreference: coarsePointer ? 'low-power' : 'high-performance',
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.02;
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, policy.pixelRatioCap));
    } catch {
      setFailed(true);
      root.dataset.threeFailed = 'true';
      return undefined;
    }

    const scene3d = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 20);
    camera.position.set(0, .02, 5.1);
    camera.lookAt(0, -.03, 0);

    scene3d.add(new THREE.HemisphereLight(0xffead2, 0x11141a, 1.75));
    const key = new THREE.DirectionalLight(0xffd39a, 2.65);
    key.position.set(-2.4, 3.2, 4.2);
    scene3d.add(key);
    const fill = new THREE.DirectionalLight(0xffb96f, .55);
    fill.position.set(2.2, .4, 3.6);
    scene3d.add(fill);
    const rim = new THREE.DirectionalLight(0xc4d1ee, .82);
    rim.position.set(3.1, 1.8, 2.6);
    scene3d.add(rim);

    rig = createMatthiasPremiumHome3D({ compact: policy.tier === 'compact' });
    rig.root.position.y = -.02;
    scene3d.add(rig.root);

    const doResize = () => {
      resizeRenderer(renderer, camera, canvas);
      if (reducedMotion && rig) renderer.render(scene3d, camera);
    };
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
    let peakArticulation = 0;
    let peakHeadYaw = 0;
    let peakBlink = 0;
    let peakMouthOpen = 0;
    const startedAt = performance.now();
    const minFrameInterval = 1000 / policy.maxFps;

    const samplePose = (stamp) => {
      const base = reducedMotion
        ? matthiasPawnPoseSample({
          profile: 'idle',
          presenceState: MATTHIAS_HOME_STATES.IDLE,
          time: 0,
          stateElapsed: 0,
          stateDurationMs: 0,
          motionIntensity: 0,
        })
        : matthiasPawnPoseSample({
          profile: profileRef.current,
          presenceState: modeRef.current,
          time: Math.max(0, stamp - startedAt) / 1000 + phaseRef.current,
          stateElapsed: Math.max(0, stamp - modeStartedAtRef.current) / 1000,
          stateDurationMs: matthiasHomeStateDuration(modeRef.current),
          speaking: speakingRef.current,
          motionIntensity: intensityRef.current,
        });

      // Semantic activity survives speech and reduced-motion. Motion can be
      // frozen while the prop remains visible in a legible static pose.
      return { ...base, activityProfile: activityProfileRef.current };
    };

    const paint = (stamp) => {
      const pose = samplePose(stamp);
      applyMatthiasPremiumHomePose(rig, pose);
      renderer.render(scene3d, camera);

      frames += 1;
      peakEnergy = Math.max(peakEnergy, pose.energy || 0);
      peakReach = Math.max(peakReach, pose.reach || 0);
      peakArticulation = Math.max(peakArticulation, pose.articulation || 0);
      peakHeadYaw = Math.max(peakHeadYaw, Math.abs(pose.headYaw || 0));
      peakBlink = Math.max(peakBlink, pose.blink || 0);
      peakMouthOpen = Math.max(peakMouthOpen, pose.mouthOpen || 0);

      if (frames === 1) {
        setReady(true);
        root.dataset.threeReady = 'true';
      }
      if (frames % 6 === 0 || frames === 1) {
        const currentCue = matthiasHomeFacialCue({
          profile: profileRef.current,
          presenceState: modeRef.current,
          speaking: speakingRef.current,
        });
        root.dataset.threeFrame = String(frames);
        root.dataset.threeEnergy = peakEnergy.toFixed(3);
        root.dataset.threeReach = peakReach.toFixed(3);
        root.dataset.threeActivityProp = rig.root.userData.activityProp || 'none';
        root.dataset.threeActivityReach = Number(rig.root.userData.activityReach || 0).toFixed(3);
        root.dataset.threeFaceWarp = '0.0000';
        root.dataset.threeFaceArticulation = peakArticulation.toFixed(3);
        root.dataset.threeHeadYaw = peakHeadYaw.toFixed(3);
        root.dataset.threeBlink = peakBlink.toFixed(3);
        root.dataset.threeMouthOpen = peakMouthOpen.toFixed(3);
        root.dataset.threeFaceExpression = currentCue.expression;
        root.dataset.threeFaceGesture = currentCue.gesture;
      }
    };

    renderFrame = (stamp) => {
      raf = 0;
      if (disposed || !rig) return;
      if (frames > 0 && stamp - lastRenderedAt < minFrameInterval) {
        requestFrame();
        return;
      }
      lastRenderedAt = stamp;
      paint(stamp);
      requestFrame();
    };

    if (reducedMotion) paint(startedAt);
    else raf = window.requestAnimationFrame(renderFrame);

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

    return () => {
      disposed = true;
      cancelFrame();
      resizeObserver?.disconnect?.();
      intersectionObserver?.disconnect?.();
      if (resizeFallback) window.removeEventListener('resize', resizeFallback);
      if (visibilityListener && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', visibilityListener);
      }
      disposeMatthiasPremiumHome3D(rig);
      renderer?.dispose?.();
    };
  }, [reducedMotion]);

  // Prefer the scene-specific art as fallback so loading/failure never changes
  // the semantic activity (sleep, breakfast, reading...) before/after WebGL.
  const fallbackSrc = avatar || canonicalSrc || '';

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
      data-three-activity-profile={activityProfile}
      data-three-activity-rig={MATTHIAS_PREMIUM_HOME_ACTIVITY_RIG_VERSION}
      data-three-activity-prop={activityProp}
      data-three-activity-reach="0"
      data-three-motion={reducedMotion ? 'reduced' : 'active'}
      data-three-motion-intensity={intensity.toFixed(2)}
      data-three-motion-phase={phase.toFixed(3)}
      data-three-model={MATTHIAS_PREMIUM_HOME_MODEL_VERSION}
      data-three-fidelity={MATTHIAS_PREMIUM_HOME_FIDELITY_VERSION}
      data-three-emblem={MATTHIAS_PAWN_EMBLEM}
      data-three-art-version={MATTHIAS_CANONICAL_ART_VERSION}
      data-three-deformation="rigid-geometry+facial-rig"
      data-three-render-mode="canonical-premium-pawn-3d"
      data-three-render-contract={MATTHIAS_PREMIUM_HOME_RENDER_CONTRACT}
      data-three-approved-reference={MATTHIAS_PREMIUM_HOME_REFERENCE}
      data-three-full-3d="true"
      data-three-face-rig={MATTHIAS_PREMIUM_HOME_FACE_RIG_VERSION}
      data-three-articulated-face-rig={MATTHIAS_PREMIUM_HOME_FACE_RIG_VERSION}
      data-three-face-expression={facialCue.expression}
      data-three-face-gesture={facialCue.gesture}
      data-three-face-warp="0.0000"
      data-three-face-warp-limit={MATTHIAS_HOME_FACE_WARP_LIMIT.toFixed(3)}
      data-three-face-articulation="0.000"
      data-three-head-yaw="0.000"
      data-three-blink="0.000"
      data-three-mouth-open="0.000"
      data-three-ready={ready ? 'true' : 'false'}
      data-three-failed={failed ? 'true' : 'false'}
      data-three-frame="0"
      data-three-energy="0"
      data-three-reach="0"
      data-three-visibility="visible"
      data-three-viewport="visible"
    >
      <canvas ref={canvasRef} className="matthias-three-avatar__canvas" aria-hidden="true" />
      {fallbackSrc ? (
        <img
          className="matthias-three-avatar__fallback"
          src={fallbackSrc}
          alt=""
          draggable="false"
          aria-hidden="true"
          data-matthias-canonical-art="true"
        />
      ) : null}
    </span>
  );
}
