import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  HOME_BLENDER_RUNTIME_MIN_WIDTH,
  homeBlenderCameraFovForAspect,
  homeBlenderCameraPoseForAspect,
  createHomeBlenderRenderCameraReset,
  homeBlenderFireKind,
  applyHomeBlenderFlameSinglePass,
  homeBlenderSteamMotion,
  homeBlenderSteamMotionPrepared,
  applyHomeBlenderCoffeeTemperature,
  applyHomeBlenderPieceLift,
  disposeStaleHomeBlenderGltf,
  homeBlenderProjectAnchors,
  HOME_BLENDER_BEACON_ANCHORS,
  homeBlenderFireMotion,
  homeBlenderFireMotionPrepared,
  homeBlenderFireSeed,
  homeBlenderCandleLightFactor,
  homeBlenderCandleLightFactorPrepared,
  homeBlenderSharedFireGust,
  rebaseFlameToPivot,
  homeBlenderFireFramePlan,
  homeBlenderGlowOpacity,
  flameHeightRange,
  applyFlameGradient,
  HOME_BLENDER_FLAME_GRADIENT,
  homeBlenderTimeOfDayLook,
  applyHomeBlenderMoonVisibility,
  HOME_BLENDER_TIME_OF_DAY,
  homeBlenderIsSoftwareRenderer,
  homeBlenderShouldRenderShadows,
  applyFlameLook,
  HOME_BLENDER_FLAME_LOOK,
  HOME_BLENDER_FIRE_MAX_RENDER_MS,
  HOME_BLENDER_FIRE_MIN_SAMPLES,
  HOME_BLENDER_FIRE_MAX_FRAME_GAP_MS,
  HOME_BLENDER_FIRE_MAX_INTERVAL_MS,
  homeBlenderPolicyNeedsFallback,
  homeBlenderAdaptiveLodFloor,
  homeBlenderAdaptiveLodCap,
  homeBlenderRuntimePolicy,
  homeBlenderDustSeeds,
  homeBlenderDustPosition,
  homeBlenderWriteDustPositions,
  HOME_BLENDER_DUST,
  homeBlenderMoonShaftPose,
  HOME_BLENDER_MOON_SHAFT,
  homeBlenderFireSeeds,
  homeBlenderFireHearthBases,
  HOME_BLENDER_FIRE_PARTICLES,
  homeBlenderCandleBases,
  homeBlenderCandleAttributes,
  HOME_BLENDER_CANDLE_PARTICLES,
  HOME_BLENDER_KLAUS_MOTION,
  HOME_BLENDER_KLAUS_HEAD_MOTION,
  HOME_BLENDER_KLAUS_EAR_MOTION,
  homeBlenderKlausHeadPose,
  homeBlenderKlausEarPose,
  homeBlenderIsKlausPart,
  homeBlenderKlausPose,
  prepareHomeBlenderKlausRig,
  applyHomeBlenderKlausMotion,
  releaseHomeBlenderWebglContext,
} from './HomeBlenderScene3D.jsx';
import { tighterRuntimeLodCap } from './HomeCastle3DRenderPolicy.js';
import { createHomeCastle3DPerformanceGovernor } from './HomeCastle3DPerformanceGovernor.js';

describe('Home flame single-pass diagnostic', () => {
  it('is strictly opt-in and does not alter materials that cannot benefit', () => {
    const eligible = new THREE.MeshStandardMaterial({
      transparent: true, side: THREE.DoubleSide,
    });
    expect(applyHomeBlenderFlameSinglePass(eligible, 'flame', false)).toBe(false);
    expect(eligible.forceSinglePass).toBe(false);
    expect(applyHomeBlenderFlameSinglePass(eligible, 'hot', true)).toBe(true);
    expect(eligible.forceSinglePass).toBe(true);
    const candle = new THREE.MeshStandardMaterial({ transparent: true, side: THREE.DoubleSide });
    expect(applyHomeBlenderFlameSinglePass(candle, 'candle', true)).toBe(true);
    expect(candle.forceSinglePass).toBe(true);

    for (const opts of [
      { transparent: false, side: THREE.DoubleSide },
      { transparent: true, side: THREE.FrontSide },
      { transparent: true, side: THREE.BackSide },
    ]) {
      const material = new THREE.MeshStandardMaterial(opts);
      expect(applyHomeBlenderFlameSinglePass(material, 'flame', true)).toBe(false);
      expect(material.forceSinglePass).toBe(false);
    }
    const steam = new THREE.MeshStandardMaterial({ transparent: true, side: THREE.DoubleSide });
    expect(applyHomeBlenderFlameSinglePass(steam, 'steam', true)).toBe(false);
    expect(steam.forceSinglePass).toBe(false);
  });
});

describe('Home Blender stationary render camera', () => {
  const canonical = homeBlenderCameraPoseForAspect(16 / 9);

  it('restores the same position and quaternion as the original per-frame camera setup', () => {
    const baseline = new THREE.PerspectiveCamera(22.9, 16 / 9, 0.1, 80);
    baseline.position.set(canonical.position.x, canonical.position.y, canonical.position.z);
    baseline.lookAt(canonical.target.x, canonical.target.y, canonical.target.z);

    const camera = new THREE.PerspectiveCamera(22.9, 16 / 9, 0.1, 80);
    const lookAt = vi.spyOn(camera, 'lookAt');
    const reset = createHomeBlenderRenderCameraReset(camera);
    expect(reset.restore()).toBe(true);
    expect(camera.position.equals(baseline.position)).toBe(true);
    expect(camera.quaternion.equals(baseline.quaternion)).toBe(true);
    expect(lookAt).toHaveBeenCalledTimes(1);

    for (let frame = 0; frame < 240; frame += 1) expect(reset.restore()).toBe(false);
    expect(lookAt).toHaveBeenCalledTimes(1);
    expect(camera.position.equals(baseline.position)).toBe(true);
    expect(camera.quaternion.equals(baseline.quaternion)).toBe(true);
  });

  it('reapplies the exact canonical rendering pose after viewport and actor projections', () => {
    const camera = new THREE.PerspectiveCamera(22.9, 16 / 9, 0.1, 80);
    const baseline = new THREE.PerspectiveCamera(22.9, 16 / 9, 0.1, 80);
    baseline.position.set(canonical.position.x, canonical.position.y, canonical.position.z);
    baseline.lookAt(canonical.target.x, canonical.target.y, canonical.target.z);
    const reset = createHomeBlenderRenderCameraReset(camera);
    reset.restore();
    const lookAt = vi.spyOn(camera, 'lookAt');
    for (const aspect of [0.45, 0.8, 1, 1.5]) {
      // The Home projects hotspots and Matthias using a temporary framing,
      // then the next render returns to the existing stationary view.
      const pose = homeBlenderCameraPoseForAspect(aspect);
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      camera.position.set(pose.position.x, pose.position.y, pose.position.z);
      camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
      reset.invalidate();
      expect(reset.restore()).toBe(true);
      expect(camera.position.equals(baseline.position)).toBe(true);
      expect(camera.quaternion.equals(baseline.quaternion)).toBe(true);
      expect(camera.aspect).toBe(aspect);
      expect(reset.restore()).toBe(false);
    }
    expect(lookAt).toHaveBeenCalledTimes(8); // 4 temporary projections, 4 restorations
  });

  it('does not reset after a redundant request but invalidates after an actor update', () => {
    const camera = new THREE.PerspectiveCamera();
    const reset = createHomeBlenderRenderCameraReset(camera);
    expect(reset.restore()).toBe(true);
    expect(reset.restore()).toBe(false);
    // A routine change temporarily aims at Matthias; restoration is deferred
    // until the next actual room draw, never during the projection callback.
    camera.position.set(8, 3, 9);
    camera.lookAt(0, 1, 0);
    reset.invalidate();
    expect(camera.position.x).toBe(8);
    expect(reset.restore()).toBe(true);
    expect(camera.position.x).toBe(canonical.position.x);
    expect(reset.restore()).toBe(false);
  });
});

describe('HomeBlenderScene3D GLTF lifecycle', () => {
  it('releases the cached WebGL context exactly once when teardown owns it', () => {
    const loseContext = vi.fn();
    expect(releaseHomeBlenderWebglContext({ loseContext })).toBe(true);
    expect(loseContext).toHaveBeenCalledTimes(1);
    expect(releaseHomeBlenderWebglContext(null)).toBe(false);
    expect(releaseHomeBlenderWebglContext({})).toBe(false);
  });

  it('disposes a Matthias GLTF that finishes after the Home scene is stale', () => {
    const texture = new THREE.Texture();
    const material = new THREE.MeshBasicMaterial({ map: texture });
    const geometry = new THREE.BoxGeometry();
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(geometry, material));
    const disposeTexture = vi.spyOn(texture, 'dispose');
    const disposeMaterial = vi.spyOn(material, 'dispose');
    const disposeGeometry = vi.spyOn(geometry, 'dispose');

    expect(disposeStaleHomeBlenderGltf({ scene }, false)).toBe(false);
    expect(disposeGeometry).not.toHaveBeenCalled();

    expect(disposeStaleHomeBlenderGltf({ scene }, true)).toBe(true);
    expect(disposeGeometry).toHaveBeenCalledTimes(1);
    expect(disposeMaterial).toHaveBeenCalledTimes(1);
    expect(disposeTexture).toHaveBeenCalledTimes(1);
  });

  it('disposes shared GLTF GPU resources only once, including multi-material meshes', () => {
    const texture = new THREE.Texture();
    const sharedGeometry = new THREE.BoxGeometry();
    const extraGeometry = new THREE.SphereGeometry(1, 8, 6);
    const primary = new THREE.MeshStandardMaterial({ map: texture, roughnessMap: texture });
    const secondary = new THREE.MeshBasicMaterial({ map: texture });
    const scene = new THREE.Group();
    scene.add(
      new THREE.Mesh(sharedGeometry, primary),
      new THREE.Mesh(sharedGeometry, [primary, secondary]),
      new THREE.Mesh(extraGeometry, secondary),
    );
    const disposals = [texture, sharedGeometry, extraGeometry, primary, secondary]
      .map((resource) => vi.spyOn(resource, 'dispose'));

    expect(disposeStaleHomeBlenderGltf({ scene }, true)).toBe(true);
    for (const dispose of disposals) {
      expect(dispose).toHaveBeenCalledTimes(1);
    }
  });
});

describe('HomeBlenderScene3D mobile runtime policy', () => {
  it('keeps portrait phone framing tight enough to avoid empty ceiling runway', () => {
    expect(homeBlenderCameraFovForAspect(16 / 9)).toBe(22.9);
    for (const [width, height] of [[360, 800], [390, 844], [430, 932]]) {
      const fov = homeBlenderCameraFovForAspect(width / height);
      expect(fov).toBeGreaterThan(22.9);
      expect(fov).toBeLessThanOrEqual(35.5);
    }
    expect(homeBlenderCameraFovForAspect(390 / 844)).toBe(35.5);
    expect(homeBlenderCameraFovForAspect(430 / 932)).toBe(35.5);
  });

  it('allows the canonical Blender Home from 360px on capable Android-class hardware', () => {
    expect(HOME_BLENDER_RUNTIME_MIN_WIDTH).toBe(360);

    for (const viewportWidth of [360, 390, 430, 768]) {
      expect(homeBlenderRuntimePolicy({
        viewportWidth,
        devicePixelRatio: 3,
        hardwareConcurrency: 8,
      })).toMatchObject({
        enabled: true,
        lod: 'lite',
        pixelRatio: 1.25,
        antialias: false,
        powerPreference: 'low-power',
      });
    }
  });

  it('keeps constrained phones on the existing fallback path', () => {
    expect(homeBlenderRuntimePolicy({
      viewportWidth: 390,
      devicePixelRatio: 3,
      hardwareConcurrency: 4,
    })).toMatchObject({ enabled: false, lod: 'lite' });

    expect(homeBlenderRuntimePolicy({
      viewportWidth: 430,
      devicePixelRatio: 2,
      hardwareConcurrency: 2,
    })).toMatchObject({ enabled: false, lod: '2d' });
  });

  it('preserves full-quality Blender rendering on roomy desktop hardware', () => {
    expect(homeBlenderRuntimePolicy({
      viewportWidth: 1440,
      devicePixelRatio: 2,
      hardwareConcurrency: 8,
    })).toMatchObject({
      enabled: true,
      lod: 'full',
      antialias: true,
      powerPreference: 'high-performance',
    });
  });
});


describe('HomeBlenderScene3D live fallback policy', () => {
  it('preserves a 3D lite floor under sustained governor slowdown', () => {
    const governorDecision = (lod, frameMs, count) => {
      const governor = createHomeCastle3DPerformanceGovernor(lod);
      let timestamp = 0;
      let decision = governor.observe(timestamp);
      for (let index = 0; index < count; index += 1) {
        timestamp += frameMs;
        decision = governor.observe(timestamp) || decision;
      }
      return decision;
    };
    const fullSignal = governorDecision('full', 33.4, 400);
    expect(fullSignal).toBe('lite');
    const cap = homeBlenderAdaptiveLodCap(null, fullSignal, 'lite');
    expect(cap).toBe('lite');

    const liteSignal = governorDecision('lite', 70, 320);
    expect(liteSignal).toBe('2d');
    expect(homeBlenderAdaptiveLodCap(cap, liteSignal, 'lite')).toBe('lite');
    // A genuinely ineligible policy may still request the explicit 2D path.
    expect(homeBlenderAdaptiveLodCap(null, liteSignal, '2d')).toBe('2d');
  });

  it('never performance-ejects an eligible 3D session to static 2D', () => {
    expect(homeBlenderAdaptiveLodFloor({ enabled: true, lod: 'full' })).toBe('lite');
    expect(homeBlenderAdaptiveLodFloor({ enabled: true, lod: 'lite' })).toBe('lite');
    expect(homeBlenderAdaptiveLodFloor({ enabled: false, lod: 'lite' })).toBe('2d');
    expect(homeBlenderAdaptiveLodFloor({ enabled: true, lod: '2d' })).toBe('2d');
  });

  it('falls back when a resize/runtime policy disables 3D', () => {
    expect(homeBlenderPolicyNeedsFallback({ enabled: false, lod: 'lite' })).toBe(true);
    expect(homeBlenderPolicyNeedsFallback({ enabled: false, lod: '2d' })).toBe(true);
    expect(homeBlenderPolicyNeedsFallback({ enabled: true, lod: '2d' })).toBe(true);
  });

  it('keeps the Blender scene mounted while lite/full remain eligible', () => {
    expect(homeBlenderPolicyNeedsFallback({ enabled: true, lod: 'lite' })).toBe(false);
    expect(homeBlenderPolicyNeedsFallback({ enabled: true, lod: 'full' })).toBe(false);
  });
});


describe('HomeBlenderScene3D Klaus idle motion', () => {
  it('moves Klaus but keeps his cushion and tassels static', () => {
    expect(homeBlenderIsKlausPart('HOME_PROP_cat_body')).toBe(true);
    expect(homeBlenderIsKlausPart('HOME_PROP_cat_whisker_l_1')).toBe(true);
    expect(homeBlenderIsKlausPart('HOME_PROP_cat_cushion')).toBe(false);
    expect(homeBlenderIsKlausPart('HOME_PROP_cat_cushion_piping')).toBe(false);
    expect(homeBlenderIsKlausPart('HOME_PROP_cat_tassel_2')).toBe(false);
    expect(homeBlenderIsKlausPart('HOME_PROP_table_candle')).toBe(false);
  });

  it('breathes visibly but keeps the settle drift tiny', () => {
    let deepest = 0;
    for (let timeMs = 0; timeMs < 60000; timeMs += 137) {
      const pose = homeBlenderKlausPose(timeMs);
      expect(pose.scaleY).toBeGreaterThanOrEqual(1);
      expect(pose.scaleY).toBeLessThanOrEqual(1 + HOME_BLENDER_KLAUS_MOTION.breatheScale);
      expect(pose.scaleXZ).toBeLessThanOrEqual(1 + HOME_BLENDER_KLAUS_MOTION.breatheSpread);
      expect(Math.abs(pose.offsetX)).toBeLessThanOrEqual(HOME_BLENDER_KLAUS_MOTION.settleX);
      expect(Math.abs(pose.offsetZ)).toBeLessThanOrEqual(HOME_BLENDER_KLAUS_MOTION.settleZ);
      expect(Math.abs(pose.yaw)).toBeLessThanOrEqual(HOME_BLENDER_KLAUS_MOTION.yaw);
      expect(Math.abs(pose.roll)).toBeLessThanOrEqual(HOME_BLENDER_KLAUS_MOTION.roll);
      deepest = Math.max(deepest, pose.scaleY - 1);
    }
    // ~2% of a 0.25 m cat: a breath that reads at Home distance.
    expect(deepest).toBeGreaterThan(0.015);
    expect(HOME_BLENDER_KLAUS_MOTION.breatheScale).toBeLessThanOrEqual(0.03);
  });

  it('lifts his head for a brief glance about once a minute, asleep otherwise', () => {
    const spec = HOME_BLENDER_KLAUS_HEAD_MOTION;
    let awake = 0;
    let peak = 0;
    let samples = 0;
    let previous = homeBlenderKlausHeadPose(0);
    for (let timeMs = 0; timeMs < spec.periodSeconds * 2000; timeMs += 50) {
      const pose = homeBlenderKlausHeadPose(timeMs);
      expect(pose.up).toBeGreaterThanOrEqual(0);
      expect(pose.up).toBeLessThanOrEqual(1);
      expect(pose.lift).toBeLessThanOrEqual(spec.lift + 1e-9);
      expect(Math.abs(pose.yaw)).toBeLessThanOrEqual(THREE.MathUtils.degToRad(spec.yawDeg) + 1e-9);
      // Eased: no snapping between consecutive frames.
      expect(Math.abs(pose.up - previous.up)).toBeLessThan(0.12);
      if (pose.up > 0.05) awake += 1;
      peak = Math.max(peak, pose.up);
      previous = pose;
      samples += 1;
    }
    expect(peak).toBeGreaterThan(0.99);
    expect(awake / samples).toBeGreaterThan(0.03);
    expect(awake / samples).toBeLessThan(0.15);
  });

  it('flicks each ear briefly on its own clock', () => {
    const limit = THREE.MathUtils.degToRad(HOME_BLENDER_KLAUS_EAR_MOTION.flickDeg);
    for (const index of [0, 1]) {
      let flicking = 0;
      let samples = 0;
      for (let timeMs = 0; timeMs < 60000; timeMs += 20) {
        const angle = homeBlenderKlausEarPose(timeMs, index);
        expect(angle).toBeGreaterThanOrEqual(0);
        expect(angle).toBeLessThanOrEqual(limit + 1e-9);
        if (angle > limit * 0.5) flicking += 1;
        samples += 1;
      }
      expect(flicking).toBeGreaterThan(0);
      expect(flicking / samples).toBeLessThan(0.12);
    }
    // Not in sync: one ear flicks while the other rests.
    expect(homeBlenderKlausEarPose(200, 0)).toBeGreaterThan(0);
    expect(homeBlenderKlausEarPose(200, 1)).toBe(0);
  });

  it('groups the authored cat around its own pivot without dragging the cushion', () => {
    const root = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.38), new THREE.MeshBasicMaterial());
    body.name = 'HOME_PROP_cat_body';
    body.position.set(1.1, 0.3, -1.4);
    const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.7), new THREE.MeshBasicMaterial());
    cushion.name = 'HOME_PROP_cat_cushion';
    cushion.position.set(1.15, 0.12, -1.4);
    root.add(body, cushion);
    root.updateMatrixWorld(true);

    const bodyBefore = body.getWorldPosition(new THREE.Vector3()).clone();
    const cushionBefore = cushion.getWorldPosition(new THREE.Vector3()).clone();
    const bottomBefore = new THREE.Box3().setFromObject(body).min.y;
    const rig = prepareHomeBlenderKlausRig(root);

    expect(rig).toBeTruthy();
    expect(body.parent).toBe(rig);
    expect(cushion.parent).toBe(root);
    // Without the head landmarks (older GLB) he still breathes.
    expect(rig.userData.homeKlausHead).toBeNull();
    expect(body.getWorldPosition(new THREE.Vector3()).distanceTo(bodyBefore)).toBeLessThan(1e-6);

    const deepMs = Array.from({ length: 400 }, (_, index) => index * 17)
      .reduce((best, timeMs) => (homeBlenderKlausPose(timeMs).scaleY > homeBlenderKlausPose(best).scaleY ? timeMs : best), 0);
    expect(applyHomeBlenderKlausMotion(rig, deepMs)).toBe(true);
    const box = new THREE.Box3().setFromObject(body);
    // The chest rises; the belly stays on the cushion.
    expect(box.max.y - box.min.y).toBeGreaterThan(0.22 * 1.015);
    expect(Math.abs(box.min.y - bottomBefore)).toBeLessThan(0.0035);
    expect(body.getWorldPosition(new THREE.Vector3()).distanceTo(bodyBefore)).toBeLessThan(0.02);
    expect(cushion.getWorldPosition(new THREE.Vector3()).distanceTo(cushionBefore)).toBeLessThan(1e-6);
  });

  it('soft-skins the head and ears for the glance, leaves the body, and settles back exactly', () => {
    const root = new THREE.Group();
    const material = new THREE.MeshBasicMaterial();
    const part = (name, geometry, x, y, z) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      mesh.position.set(x, y, z);
      root.add(mesh);
      return mesh;
    };
    // Facing +z, Y up, ear panels 0.144 apart (Blender builder scale); the
    // head centre sits 0.112 behind the nose and 0.010 above it.
    part('HOME_PROP_cat_nose', new THREE.BoxGeometry(0.016, 0.011, 0.01), 0, 0.176, 0.31);
    part('HOME_PROP_cat_ear_inner_l', new THREE.BoxGeometry(0.044, 0.066, 0.004), -0.072, 0.289, 0.218);
    part('HOME_PROP_cat_ear_inner_r', new THREE.BoxGeometry(0.044, 0.066, 0.004), 0.072, 0.289, 0.218);
    const head = part('HOME_PROP_cat_body', new THREE.SphereGeometry(0.1, 16, 12), 0, 0.186, 0.198);
    const haunch = part('HOME_PROP_cat_haunch', new THREE.BoxGeometry(0.2, 0.2, 0.2), 0.45, 0.1, -0.35);
    const headRest = head.geometry.getAttribute('position').array.slice();
    const haunchRest = haunch.geometry.getAttribute('position').array.slice();
    root.updateMatrixWorld(true);

    const rig = prepareHomeBlenderKlausRig(root);
    expect(rig.userData.homeKlausHead).toBeTruthy();
    const spec = HOME_BLENDER_KLAUS_HEAD_MOTION;
    const peakMs = (spec.offsetSeconds + spec.riseSeconds + spec.holdSeconds * 0.5) * 1000;
    expect(homeBlenderKlausHeadPose(peakMs).up).toBeGreaterThan(0.99);

    applyHomeBlenderKlausMotion(rig, peakMs);
    const moved = head.geometry.getAttribute('position').array;
    let largest = 0;
    for (let index = 0; index < moved.length; index += 1) {
      largest = Math.max(largest, Math.abs(moved[index] - headRest[index]));
    }
    expect(largest).toBeGreaterThan(0.005);
    // A glance, not a head flying off: well under the head's own radius.
    expect(largest).toBeLessThan(0.07);
    expect(Array.from(haunch.geometry.getAttribute('position').array)).toEqual(Array.from(haunchRest));

    const quietMs = Array.from({ length: 400 }, (_, index) => peakMs + 6000 + index * 50)
      .find((timeMs) => homeBlenderKlausHeadPose(timeMs).up === 0
        && homeBlenderKlausEarPose(timeMs, 0) === 0
        && homeBlenderKlausEarPose(timeMs, 1) === 0);
    expect(quietMs).toBeDefined();
    applyHomeBlenderKlausMotion(rig, quietMs);
    expect(Array.from(head.geometry.getAttribute('position').array)).toEqual(Array.from(headRest));
  });
});

describe('HomeBlenderScene3D live flame animation', () => {
  it('classifies hearth, candle and wall-torch flames without touching unrelated props', () => {
    expect(homeBlenderFireKind('HOME_PROP_fireplace_left_front_flame_2')).toBe('flame');
    expect(homeBlenderFireKind('HOME_PROP_fireplace_right_front_hot_1')).toBe('hot');
    expect(homeBlenderFireKind('HOME_PROP_fireplace_left_front_tongue_0')).toBe('flame');
    expect(homeBlenderFireKind('HOME_PROP_fireplace_right_ember_bed')).toBe('ember');
    expect(homeBlenderFireKind('HOME_PROP_chandelier_flame_3')).toBe('candle');
    expect(homeBlenderFireKind('HOME_PROP_fireplace_right_mantel_flame_1')).toBe('candle');
    expect(homeBlenderFireKind('HOME_PROP_table_candle_flame')).toBe('candle');
    expect(homeBlenderFireKind('HOME_PROP_torch_flame_2')).toBe('candle');
    expect(homeBlenderFireKind('HOME_PROP_fireplace_left_log_a')).toBeNull();
  });

  it('keeps every live flame motion restrained around the authored silhouette', () => {
    for (const kind of ['flame', 'hot', 'ember', 'candle']) {
      for (let timeMs = 0; timeMs < 20000; timeMs += 137) {
        const motion = homeBlenderFireMotion({ timeMs, phase: 1.234, kind });
        expect(motion.scaleX).toBeGreaterThan(0.93);
        expect(motion.scaleX).toBeLessThan(1.07);
        expect(motion.scaleY).toBeGreaterThan(0.86);
        expect(motion.scaleY).toBeLessThan(1.16);
        expect(motion.scaleZ).toBeGreaterThan(0.93);
        expect(motion.scaleZ).toBeLessThan(1.07);
        expect(Math.abs(motion.lean)).toBeLessThan(0.09);
        expect(motion.emission).toBeGreaterThan(0.84);
        expect(motion.emission).toBeLessThan(1.10);
        expect(motion.light).toBeGreaterThan(0.72);
        expect(motion.light).toBeLessThan(1.12);
      }
    }
  });

  it('preserves the exact legacy ember animation after skipping unused noise', () => {
    // Frozen values from the pre-optimization flame motion; independent of the
    // new short-circuit implementation. These cover time/phase boundaries.
    const baseline = [
      [0, 0, [1.0122549182805232, 1.0098039346244185, 0.981749589322135, 0.9945098365610465]],
      [16.7, 0.137, [0.9945262594665164, 0.9956210075732131, 0.9027136644023754, 0.9590525189330328]],
      [250, 1.234, [0.9978200971601904, 0.9982560777281523, 0.9062358420378366, 0.9656401943203806]],
      [4321, 3.9, [0.9940415297832134, 0.9952332238265708, 0.9211409410307563, 0.9580830595664267]],
      [12345, -1.2, [0.9990009236091998, 0.9992007388873598, 0.9418893486790095, 0.9680018472183994]],
      [90000, 0.17, [1.0071406382438726, 1.0057125105950981, 0.9546136231161655, 0.9842812764877453]],
      [1e7, Math.PI, [1.0094609018438496, 1.0075687214750797, 0.9614496365375818, 0.9889218036876991]],
    ];
    for (const [timeMs, phase, [scaleX, scaleY, emission, light]] of baseline) {
      for (const commonGust of [undefined, -0.8, 0.71]) {
        const motion = homeBlenderFireMotion({ timeMs, phase, kind: 'ember', commonGust });
        // Object.is asserts exact binary parity, not a perceptual epsilon.
        expect(Object.is(motion.scaleX, scaleX)).toBe(true);
        expect(Object.is(motion.scaleY, scaleY)).toBe(true);
        expect(Object.is(motion.scaleZ, scaleX)).toBe(true);
        expect(Object.is(motion.emission, emission)).toBe(true);
        expect(Object.is(motion.light, light)).toBe(true);
        expect(motion.lean).toBe(0);
      }
    }
    const negative = homeBlenderFireMotion({ timeMs: -4, phase: NaN, kind: 'ember' });
    expect(negative).toEqual(homeBlenderFireMotion({ timeMs: 0, phase: 0, kind: 'ember' }));
  });

  it('shares the exact Klaus head pose with both ear flicks without changing standalone calls', () => {
    // Runtime can reuse the posture it already calculated for the head skin.
    // Standalone callers still calculate that same posture when omitted.
    for (const timeMs of [
      -50, 0, 16.7, 137, 1000, 5000, 10001, 18000, 30000,
      45000, 65000, 120000, 600000, NaN,
    ]) {
      const up = homeBlenderKlausHeadPose(timeMs).up;
      for (const ear of [0, 1]) {
        const oldCall = homeBlenderKlausEarPose(timeMs, ear);
        const sharedCall = homeBlenderKlausEarPose(timeMs, ear, up);
        expect(Object.is(sharedCall, oldCall)).toBe(true);
      }
    }
  });

  it('reuses fixed per-mesh seeds without changing any fire-kind motion', () => {
    // The runtime normalizes the frame clock once and stores each node's seed
    // at GLB load; compare it against the unchanged public call contract.
    for (const timeMs of [0, 16.7, 137, 1010, 4321, 90000, 1e7, -40, NaN]) {
      const seconds = Math.max(0, Number(timeMs) || 0) / 1000;
      for (const phase of [0, 0.137, 1.234, 3.9, -1.2, NaN]) {
        const seed = homeBlenderFireSeed(phase);
        for (const kind of ['flame', 'hot', 'ember', 'candle']) {
          for (const gust of [undefined, -0.8, 0.71]) {
            const normal = homeBlenderFireMotion({ timeMs, phase, kind, commonGust: gust });
            const prepared = homeBlenderFireMotionPrepared(seconds, seed, kind, gust);
            for (const key of Object.keys(normal)) {
              expect(Object.is(prepared[key], normal[key]), `${kind} ${key} ${timeMs} ${phase}`).toBe(true);
            }
          }
        }
        const normalLight = homeBlenderCandleLightFactor(timeMs, phase);
        const preparedLight = homeBlenderCandleLightFactorPrepared(seconds, seed);
        expect(Object.is(preparedLight, normalLight), `torch ${timeMs} ${phase}`).toBe(true);
      }
    }
    expect(homeBlenderFireSeed(0)).toBe(13);
    expect(homeBlenderFireSeed(NaN)).toBe(13);
  });

  it('reuses independent fire records without changing a single output float', () => {
    const a = {};
    const b = {};
    for (const timeMs of [0, 16.7, 137, 4321, 90000, -40, NaN]) {
      const seconds = Math.max(0, Number(timeMs) || 0) / 1000;
      for (const phase of [0, 0.137, 1.234, -1.2, NaN]) {
        for (const kind of ['flame', 'hot', 'ember', 'candle']) {
          for (const gust of [undefined, -0.8, 0.71]) {
            const seed = homeBlenderFireSeed(phase);
            const normal = homeBlenderFireMotion({ timeMs, phase, kind, commonGust: gust });
            const result = homeBlenderFireMotionPrepared(seconds, seed, kind, gust, a);
            expect(result).toBe(a);
            expect(result).not.toBe(normal);
            expect(Object.keys(result)).toEqual(Object.keys(normal));
            for (const key of Object.keys(normal)) expect(Object.is(result[key], normal[key])).toBe(true);
            // Repeated updates into a different node's record must not mutate this node.
            const snapshot = { ...a };
            expect(homeBlenderFireMotionPrepared(seconds, seed + 1, kind, gust, b)).toBe(b);
            expect(a).toEqual(snapshot);
          }
        }
      }
    }
    expect(homeBlenderFireMotionPrepared(0, 13)).not.toBe(homeBlenderFireMotionPrepared(0, 13));
  });

  it('reuses steam wisp records with exact standalone pose parity', () => {
    const a = {};
    const b = {};
    for (const timeMs of [0, 16.7, 137, 4321, 90000, -40, NaN]) {
      const seconds = Math.max(0, Number(timeMs) || 0) / 1000;
      for (const phase of [0, 0.137, 1.234, -1.2, NaN]) {
        for (const height of [0.05, 0.4, 1.1]) {
          const standalone = homeBlenderSteamMotion({ timeMs, phase, height });
          const actual = homeBlenderSteamMotionPrepared(seconds, Number(phase) || 0, height, a);
          expect(actual).toBe(a);
          expect(Object.keys(actual)).toEqual(Object.keys(standalone));
          for (const key of Object.keys(standalone)) {
            expect(Object.is(actual[key], standalone[key]), `steam ${key} ${timeMs}`).toBe(true);
          }
          const snapshot = { ...a };
          expect(homeBlenderSteamMotionPrepared(seconds, 2, height, b)).toBe(b);
          expect(a).toEqual(snapshot);
        }
      }
    }
    expect(homeBlenderSteamMotion({})).not.toBe(homeBlenderSteamMotion({}));
  });

  it('matches frozen pre-optimization fire motion floats for all four flame kinds', () => {
    // Values recorded from the unmodified v5782 implementation; guard both
    // public and prepared calculations against a correlated formula change.
    const snapshots = [
      [0, 0, 'flame', undefined, [0.9914785529787187, 1.0221567309859674, 0.03613860896322876, 0.9608031610553153, 0.9648247780883683]],
      [167.5, 0.137, 'hot', undefined, [1.0024557310929514, 0.9942699607831132, -0.00701216115664675, 0.949488074345368, 0.9483243335734549]],
      [4321, 1.234, 'candle', undefined, [0.9830012214151452, 1.0396638166979946, -0.003676956097189417, 0.9280848553342714, 0.9986189665025442]],
      [12345, 3.9, 'ember', undefined, [1.0026574895446667, 1.0021259916357335, 0, 0.9312032649900317, 0.9753149790893334]],
      [90000, -1.2, 'flame', 0.71, [0.9900500074561686, 1.0238630548380314, -0.0010382326656021151, 0.988840244259592, 0.9868274790951982]],
      [-45, NaN, 'hot', -0.8, [0.9951715432952624, 1.0135397535806987, 0.0026599347880110133, 0.9608031610553153, 0.9648247780883683]],
      [1e7, Math.PI, 'candle', undefined, [0.9880218338441104, 1.0279490543637424, -0.014262612294405699, 0.9356135656149126, 0.9123009193914012]],
    ];
    const keys = ['scaleX', 'scaleY', 'lean', 'emission', 'light'];
    for (const [timeMs, phase, kind, commonGust, values] of snapshots) {
      const motion = homeBlenderFireMotionPrepared(
        Math.max(0, Number(timeMs) || 0) / 1000, homeBlenderFireSeed(phase), kind, commonGust,
      );
      for (let index = 0; index < keys.length; index += 1) {
        expect(Object.is(motion[keys[index]], values[index]), `${kind} ${keys[index]} at ${timeMs}`).toBe(true);
      }
      expect(Object.is(motion.scaleX, motion.scaleZ)).toBe(true);
    }
  });

  it('computes torch-only light intensity with exact candle-motion equivalence', () => {
    // Verify the actual runtime optimization, not an approximation: the same
    // intensity reaches each existing Three.js light for every sampled phase.
    for (const timeMs of [0, 16.7, 250, 1010, 4321, 12345, 40000, 90000, 1e7, -4, NaN]) {
      for (const phase of [0, 0.137, 1.234, 3.9, -1.2, NaN]) {
        const oldIntensity = homeBlenderFireMotion({ timeMs, phase, kind: 'candle' }).light;
        const newIntensity = homeBlenderCandleLightFactor(timeMs, phase);
        expect(Object.is(newIntensity, oldIntensity)).toBe(true);
      }
    }
    // Non-candle motion is unaffected by the specialised scalar path.
    for (const kind of ['flame', 'ember', 'hot']) {
      expect(homeBlenderFireMotion({ timeMs: 1234, phase: 1, kind }))
        .toEqual(homeBlenderFireMotion({ timeMs: 1234, phase: 1, kind }));
    }
  });

  it('shares one wind sample across every flame kind without changing their motion', () => {
    // Pixel-equivalent contract: the canonical scalar path and the batched
    // runtime path must return exactly the same floats, not merely be close.
    for (const timeMs of [0, 16.7, 555, 5000, 12345, 90000]) {
      const commonGust = homeBlenderSharedFireGust(timeMs);
      for (const kind of ['flame', 'hot', 'ember', 'candle']) {
        for (const phase of [0, 0.137, 1.234, 3.9]) {
          expect(homeBlenderFireMotion({ timeMs, kind, phase, commonGust }))
            .toEqual(homeBlenderFireMotion({ timeMs, kind, phase }));
        }
      }
    }
  });

  it('is deterministic for the same clock and phase', () => {
    const a = homeBlenderFireMotion({ timeMs: 4321, phase: 2.1, kind: 'flame' });
    const b = homeBlenderFireMotion({ timeMs: 4321, phase: 2.1, kind: 'flame' });
    expect(a).toEqual(b);
  });

  it('never settles into a loop and desynchronises separate flames', () => {
    const heights = [];
    for (let timeMs = 0; timeMs < 30000; timeMs += 250) {
      heights.push(homeBlenderFireMotion({ timeMs, phase: 0.7, kind: 'flame' }).scaleY);
    }
    // Sine mixes with a common period would repeat; noise must not.
    const firstHalf = heights.slice(0, 60).map((value) => value.toFixed(3)).join();
    const secondHalf = heights.slice(60, 120).map((value) => value.toFixed(3)).join();
    expect(firstHalf).not.toBe(secondHalf);
    expect(new Set(heights.map((value) => value.toFixed(3))).size).toBeGreaterThan(60);

    const one = homeBlenderFireMotion({ timeMs: 5000, phase: 0.7, kind: 'flame' });
    const two = homeBlenderFireMotion({ timeMs: 5000, phase: 3.9, kind: 'flame' });
    expect(one.scaleY).not.toBeCloseTo(two.scaleY, 3);
  });

  it('moves smoothly between rendered frames', () => {
    // 42 ms is the full-LOD frame interval; a flame must not pop between frames.
    for (const kind of ['flame', 'hot', 'ember', 'candle']) {
      let previous = homeBlenderFireMotion({ timeMs: 0, phase: 1.9, kind });
      for (let timeMs = 42; timeMs < 8000; timeMs += 42) {
        const current = homeBlenderFireMotion({ timeMs, phase: 1.9, kind });
        expect(Math.abs(current.scaleY - previous.scaleY)).toBeLessThan(0.06);
        expect(Math.abs(current.lean - previous.lean)).toBeLessThan(0.03);
        expect(Math.abs(current.emission - previous.emission)).toBeLessThan(0.06);
        previous = current;
      }
    }
  });

  it('shares one slow draught so a hearth leans together', () => {
    // Same clock, different flames: the shared gust term keeps their lean correlated.
    let agree = 0;
    let total = 0;
    for (let timeMs = 0; timeMs < 60000; timeMs += 500) {
      const a = homeBlenderFireMotion({ timeMs, phase: 0.4, kind: 'flame' }).lean;
      const b = homeBlenderFireMotion({ timeMs, phase: 4.4, kind: 'flame' }).lean;
      if (Math.sign(a) === Math.sign(b)) agree += 1;
      total += 1;
    }
    expect(agree / total).toBeGreaterThan(0.55);
  });

  describe('flame pivot', () => {
    const worldBox = (mesh) => {
      mesh.updateMatrixWorld(true);
      return new THREE.Box3().setFromObject(mesh);
    };
    const panel = (cx, base, height, width = 0.16, z = -6.04) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([
        cx - width, base, z, cx + width, base, z, cx, base + height, z,
      ], 3));
      return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    };

    it('reseats a world-origin flame on its base without moving it', () => {
      const mesh = panel(-6.15, 0.58, 0.7);
      const before = worldBox(mesh);
      expect(rebaseFlameToPivot(mesh)).toBe(true);
      const after = worldBox(mesh);
      expect(after.min.x).toBeCloseTo(before.min.x, 5);
      expect(after.max.x).toBeCloseTo(before.max.x, 5);
      expect(after.min.y).toBeCloseTo(before.min.y, 5);
      expect(after.max.y).toBeCloseTo(before.max.y, 5);
      expect(after.min.z).toBeCloseTo(before.min.z, 5);
      mesh.geometry.computeBoundingBox();
      expect(mesh.geometry.boundingBox.min.y).toBeCloseTo(0, 5);
      expect((mesh.geometry.boundingBox.min.x + mesh.geometry.boundingBox.max.x) / 2).toBeCloseTo(0, 5);
    });

    it('handles the non-uniform node transform the published scene really carries', () => {
      // Taken from the published home.scene.runtime: the flame nodes hold a global
      // scene scale/translation while their vertices stay far from the node origin.
      const mesh = panel(-6.69, 0.58, 0.38, 0.16, -5.585);
      mesh.scale.set(0.126, 0.063, 0.9);
      mesh.position.set(-0.615, 0.035, -1.01);
      const before = worldBox(mesh);
      expect(rebaseFlameToPivot(mesh)).toBe(true);
      const after = worldBox(mesh);
      for (const axis of ['x', 'y', 'z']) {
        expect(after.min[axis]).toBeCloseTo(before.min[axis], 5);
        expect(after.max[axis]).toBeCloseTo(before.max[axis], 5);
      }
      // Stretching about the new pivot must keep the flame's base where it was.
      const baseY = after.min.y;
      mesh.scale.set(0.126 * 0.96, 0.063 * 1.12, 0.9 * 0.96);
      expect(worldBox(mesh).min.y).toBeCloseTo(baseY, 5);
    });

    it('keeps the base fixed when the reseated flame is stretched and leaned', () => {
      const mesh = panel(4.45, 0.58, 0.56);
      const baseBefore = worldBox(mesh).min.y;
      rebaseFlameToPivot(mesh);
      mesh.scale.set(0.96, 1.12, 0.96);
      mesh.rotation.z = 0.06;
      const box = worldBox(mesh);
      expect(box.min.y).toBeGreaterThan(baseBefore - 0.03);
      expect(box.max.y - baseBefore).toBeGreaterThan(0.56);
      expect(Math.abs((box.min.x + box.max.x) / 2 - 4.45)).toBeLessThan(0.05);
    });

    it('leaves a flame that is already pivoted on its base untouched', () => {
      const mesh = panel(0, 0, 0.7, 0.16, 0);
      mesh.position.set(-6.15, 0.58, -6.04);
      const geometry = mesh.geometry;
      expect(rebaseFlameToPivot(mesh)).toBe(false);
      expect(mesh.geometry).toBe(geometry);
      expect(mesh.position.toArray()).toEqual([-6.15, 0.58, -6.04]);
    });
  });

  describe('fire frame budget', () => {
    it('keeps the base cadence while it has too few samples to judge', () => {
      expect(homeBlenderFireFramePlan({ baseIntervalMs: 42, renderCostMs: 500, samples: HOME_BLENDER_FIRE_MIN_SAMPLES - 1 }))
        .toEqual({ enabled: true, intervalMs: 42 });
    });

    it('keeps the base cadence on cheap frames', () => {
      for (const renderCostMs of [0, 1, 4, 9]) {
        expect(homeBlenderFireFramePlan({ baseIntervalMs: 42, renderCostMs, samples: 30 }))
          .toEqual({ enabled: true, intervalMs: 42 });
      }
    });

    it('stretches the interval so the fire never takes more than about a third of the thread', () => {
      const plan = homeBlenderFireFramePlan({ baseIntervalMs: 42, renderCostMs: 20, samples: 30 });
      expect(plan.enabled).toBe(true);
      expect(plan.intervalMs).toBe(60);
      expect(plan.intervalMs).toBeGreaterThanOrEqual(20 * 3);
    });

    it('caps the stretched interval', () => {
      const plan = homeBlenderFireFramePlan({
        baseIntervalMs: 42,
        renderCostMs: HOME_BLENDER_FIRE_MAX_RENDER_MS,
        samples: 30,
      });
      expect(plan.enabled).toBe(true);
      expect(plan.intervalMs).toBeLessThanOrEqual(HOME_BLENDER_FIRE_MAX_INTERVAL_MS);
    });

    it('keeps the emergency cadence visibly alive instead of becoming a slideshow', () => {
      expect(HOME_BLENDER_FIRE_MAX_INTERVAL_MS).toBeLessThanOrEqual(200);
      const plan = homeBlenderFireFramePlan({
        baseIntervalMs: 66,
        renderCostMs: 500,
        frameGapMs: 100,
        samples: 30,
      });
      expect(plan).toEqual({ enabled: true, intervalMs: HOME_BLENDER_FIRE_MAX_INTERVAL_MS });
    });

    it('throttles hard instead of killing the shared Home loop when RAF arrives late', () => {
      // WebGL rasterises in the GPU process: the render call can look cheap while
      // frame pacing collapses. A transient stall must remain recoverable because
      // Matthias and all ambient motion share this RAF.
      const starved = homeBlenderFireFramePlan({
        baseIntervalMs: 42,
        renderCostMs: 2,
        frameGapMs: HOME_BLENDER_FIRE_MAX_FRAME_GAP_MS + 5,
        samples: 30,
      });
      expect(starved).toEqual({
        enabled: true,
        intervalMs: HOME_BLENDER_FIRE_MAX_INTERVAL_MS,
      });
      for (const frameGapMs of [8, 16.7, 20, HOME_BLENDER_FIRE_MAX_FRAME_GAP_MS]) {
        expect(homeBlenderFireFramePlan({ baseIntervalMs: 42, renderCostMs: 2, frameGapMs, samples: 30 }).enabled)
          .toBe(true);
      }
    });

    it('slows the fire down instead of stopping it on a modest desktop CPU', () => {
      for (const renderCostMs of [30, 45, 60]) {
        const plan = homeBlenderFireFramePlan({ baseIntervalMs: 42, renderCostMs, frameGapMs: 20, samples: 30 });
        expect(plan.enabled).toBe(true);
        expect(plan.intervalMs).toBeGreaterThanOrEqual(renderCostMs * 3);
      }
    });

    it('keeps a minimal recoverable pulse on hardware that cannot afford full cadence', () => {
      const plan = homeBlenderFireFramePlan({
        baseIntervalMs: 42,
        renderCostMs: HOME_BLENDER_FIRE_MAX_RENDER_MS + 1,
        samples: 30,
      });
      expect(plan).toEqual({
        enabled: true,
        intervalMs: HOME_BLENDER_FIRE_MAX_INTERVAL_MS,
      });
    });
  });

  describe('software renderer detection', () => {
    it('avoids the first full shadow pass only on software WebGL', () => {
      for (const name of [
        'ANGLE (Google, Vulkan (SwiftShader Device (Subzero)), SwiftShader driver)',
        'Mesa llvmpipe (LLVM 15)',
        'Software Rasterizer',
      ]) {
        expect(homeBlenderShouldRenderShadows('full', name)).toBe(false);
      }
      for (const name of [
        'NVIDIA GeForce RTX 5070 Ti',
        'AMD Radeon RX 7800 XT',
        'Apple M2',
      ]) {
        expect(homeBlenderShouldRenderShadows('full', name)).toBe(true);
        expect(homeBlenderShouldRenderShadows('lite', name)).toBe(false);
        expect(homeBlenderShouldRenderShadows('2d', name)).toBe(false);
      }
    });
    it('recognises CPU rasterisers by name', () => {
      for (const name of [
        'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
        'llvmpipe (LLVM 15.0.7, 256 bits)',
        'Google SwiftShader',
        'Microsoft Basic Render Driver',
        'Mesa softpipe',
        'Software Rasterizer',
      ]) {
        expect(homeBlenderIsSoftwareRenderer(name)).toBe(true);
      }
    });

    it('lets real GPUs animate', () => {
      for (const name of [
        'ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Ti Laptop GPU (0x00002C19) Direct3D11 vs_5_0 ps_5_0, D3D11)',
        'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)',
        'Mali-G78',
        'Adreno (TM) 740',
        'Intel(R) Iris(R) Xe Graphics',
        '',
      ]) {
        expect(homeBlenderIsSoftwareRenderer(name)).toBe(false);
      }
    });
  });

  describe('flame look', () => {
    const lit = () => new THREE.MeshStandardMaterial({ color: 0x571a05, roughness: 0.18, metalness: 0.1, emissive: 0x050100, emissiveIntensity: 1 });

    it('removes the diffuse response so the hearth light cannot wash the flame out', () => {
      for (const kind of ['flame', 'hot', 'candle']) {
        const material = lit();
        expect(applyFlameLook(material, kind)).toBe(true);
        expect(Math.max(material.color.r, material.color.g, material.color.b)).toBeLessThan(0.05);
        expect(material.metalness).toBe(0);
        expect(material.roughness).toBe(1);
        // Tone mapping would desaturate the flame toward pink-white.
        expect(material.toneMapped).toBe(false);
      }
    });

    it('gives every flame kind its own orange-to-amber emission, never white', () => {
      for (const kind of ['flame', 'hot', 'candle']) {
        const material = lit();
        applyFlameLook(material, kind);
        expect(material.emissive.r).toBeGreaterThan(material.emissive.g);
        expect(material.emissive.g).toBeGreaterThan(material.emissive.b);
        expect(material.emissive.b).toBeLessThan(0.35);
        expect(material.emissiveIntensity).toBe(HOME_BLENDER_FLAME_LOOK[kind].intensity);
      }
      const outer = lit(); applyFlameLook(outer, 'flame');
      const core = lit(); applyFlameLook(core, 'hot');
      expect(core.emissive.g).toBeGreaterThan(outer.emissive.g);
    });

    it('leaves unknown kinds and missing materials alone', () => {
      expect(applyFlameLook(lit(), 'ember')).toBe(false);
      expect(applyFlameLook(null, 'flame')).toBe(false);
    });
  });

  describe('torch light flicker', () => {
    it('makes a candle or torch light waver within a restrained band', () => {
      let min = Infinity;
      let max = -Infinity;
      for (let timeMs = 0; timeMs < 60000; timeMs += 42) {
        const { light } = homeBlenderFireMotion({ timeMs, phase: 1.7, kind: 'candle' });
        min = Math.min(min, light);
        max = Math.max(max, light);
      }
      expect(min).toBeGreaterThan(0.72);
      expect(max).toBeLessThan(1.08);
      // It must visibly move, not sit near a constant.
      expect(max - min).toBeGreaterThan(0.12);
    });

    it('does not flicker two torches in step', () => {
      let agree = 0;
      let total = 0;
      for (let timeMs = 0; timeMs < 60000; timeMs += 250) {
        const a = homeBlenderFireMotion({ timeMs, phase: 0.6, kind: 'candle' }).light - 0.90;
        const b = homeBlenderFireMotion({ timeMs, phase: 3.9, kind: 'candle' }).light - 0.90;
        if (Math.sign(a) === Math.sign(b)) agree += 1;
        total += 1;
      }
      // Independent noise agrees about half the time, never always.
      expect(agree / total).toBeLessThan(0.8);
      expect(agree / total).toBeGreaterThan(0.2);
    });

    it('is smooth from one rendered frame to the next', () => {
      let previous = homeBlenderFireMotion({ timeMs: 0, phase: 2.2, kind: 'candle' }).light;
      for (let timeMs = 42; timeMs < 8000; timeMs += 42) {
        const current = homeBlenderFireMotion({ timeMs, phase: 2.2, kind: 'candle' }).light;
        expect(Math.abs(current - previous)).toBeLessThan(0.05);
        previous = current;
      }
    });
  });

  describe('time of day look', () => {
    const channel = (hex, shift) => (hex >> shift) & 0xff;

    it('has a look for every period and falls back to day', () => {
      for (const period of ['dawn', 'day', 'dusk', 'night']) {
        expect(HOME_BLENDER_TIME_OF_DAY[period]).toBeTruthy();
        expect(homeBlenderTimeOfDayLook(period)).toBe(HOME_BLENDER_TIME_OF_DAY[period]);
      }
      expect(homeBlenderTimeOfDayLook('midnight')).toBe(HOME_BLENDER_TIME_OF_DAY.day);
      expect(homeBlenderTimeOfDayLook(undefined)).toBe(HOME_BLENDER_TIME_OF_DAY.day);
    });

    it('makes the sun/moon key cool at night and warm-bright at noon', () => {
      const night = homeBlenderTimeOfDayLook('night').key;
      const day = homeBlenderTimeOfDayLook('day').key;
      expect(channel(night.color, 0)).toBeGreaterThan(channel(night.color, 16));
      expect(channel(day.color, 16)).toBeGreaterThan(channel(day.color, 0));
      expect(night.scale).toBeLessThan(day.scale);
    });

    it('gives the window fill more daylight at noon than at night', () => {
      expect(homeBlenderTimeOfDayLook('day').fill.scale)
        .toBeGreaterThan(homeBlenderTimeOfDayLook('dusk').fill.scale);
    });

    it('only shows the moon when the sky is not full daylight', () => {
      const moon = { name: 'HOME_PROP_window_moon', visible: true };
      const mare = { name: 'HOME_PROP_window_moon_mare_2', visible: true };
      const other = { name: 'HOME_PROP_table_top', visible: true };
      const root = { traverse: (fn) => [moon, mare, other].forEach(fn) };
      expect(applyHomeBlenderMoonVisibility(root, 'day')).toBe(2);
      expect([moon.visible, mare.visible, other.visible]).toEqual([false, false, true]);
      applyHomeBlenderMoonVisibility(root, 'night');
      expect([moon.visible, mare.visible, other.visible]).toEqual([true, true, true]);
    });
  });

  describe('flame gradient', () => {
    it('reads the vertical extent of a flame geometry', () => {
      const geometry = {
        computeBoundingBox() {},
        boundingBox: { min: { y: 0.1 }, max: { y: 0.7 } },
      };
      expect(flameHeightRange(geometry)).toEqual({ min: 0.1, max: 0.7 });
      expect(flameHeightRange(null)).toBeNull();
      expect(flameHeightRange({ computeBoundingBox() {}, boundingBox: { min: { y: 1 }, max: { y: 1 } } })).toBeNull();
    });

    it('makes the tip hotter (more green) than the base', () => {
      const { base, tip } = HOME_BLENDER_FLAME_GRADIENT;
      expect(tip[1]).toBeGreaterThan(base[1] * 1.3);
      expect(tip[2]).toBeLessThan(base[2]);
    });

    it('injects the gradient into the shader without dropping the emissive chunk', () => {
      const material = { needsUpdate: false };
      expect(applyFlameGradient(material, { min: 0, max: 1 })).toBe(true);
      const shader = {
        uniforms: {},
        vertexShader: '#include <common>\n#include <begin_vertex>',
        fragmentShader: '#include <common>\n#include <emissivemap_fragment>',
      };
      material.onBeforeCompile(shader);
      expect(shader.uniforms.uFlameMin.value).toBe(0);
      expect(shader.uniforms.uFlameMax.value).toBe(1);
      expect(shader.vertexShader).toContain('vFlameY = position.y');
      expect(shader.fragmentShader).toContain('#include <emissivemap_fragment>');
      expect(shader.fragmentShader).toContain('totalEmissiveRadiance = mix(');
      expect(material.customProgramCacheKey()).toBe('home-flame-gradient');
      expect(applyFlameGradient(material, null)).toBe(false);
    });
  });

  describe('flame glow', () => {
    it('follows the light flicker but stays inside a sane band', () => {
      expect(homeBlenderGlowOpacity(0.5, 1)).toBeCloseTo(0.5);
      expect(homeBlenderGlowOpacity(0.5, 0.9)).toBeCloseTo(0.45);
      expect(homeBlenderGlowOpacity(0.5, 0.1)).toBeCloseTo(0.25);
      expect(homeBlenderGlowOpacity(0.5, 9)).toBeCloseTo(0.7);
    });

    it('never leaves 0..1 and tolerates bad input', () => {
      expect(homeBlenderGlowOpacity(0.9, 1.4)).toBe(1);
      expect(homeBlenderGlowOpacity(0, 1)).toBe(0);
      expect(homeBlenderGlowOpacity(undefined, undefined)).toBe(0);
      expect(homeBlenderGlowOpacity(0.5, Number.NaN)).toBeCloseTo(0.25);
    });
  });
});

describe('HomeBlenderScene3D table candelabra and coffee steam', () => {
  it('drives every candelabra flame as an animated candle and the mug wisps as steam', () => {
    for (const idx of [0, 1, 2, 3, 4]) {
      expect(homeBlenderFireKind(`HOME_PROP_table_candelabra_candle_flame_${idx}`)).toBe('candle');
      expect(homeBlenderFireKind(`HOME_PROP_table_mug_steam_${idx}`)).toBe('steam');
    }
    expect(homeBlenderFireKind('HOME_PROP_table_candelabra_candle_3')).toBeNull();
    expect(homeBlenderFireKind('HOME_PROP_table_mug_body')).toBeNull();
  });

  it('loops steam wisps: fades in and out at the cup, rises, swells and stays bounded', () => {
    const height = 0.4;
    let peak = 0;
    for (let ms = 0; ms <= 12000; ms += 250) {
      const motion = homeBlenderSteamMotion({ timeMs: ms, phase: 1.3, height });
      expect(motion.opacity).toBeGreaterThanOrEqual(0);
      expect(motion.opacity).toBeLessThanOrEqual(0.30 + 1e-9);
      expect(motion.rise).toBeGreaterThanOrEqual(0);
      expect(motion.rise).toBeLessThanOrEqual(height * 0.55 + 1e-9);
      expect(motion.scaleXZ).toBeGreaterThanOrEqual(1.8);
      expect(motion.scaleXZ).toBeLessThanOrEqual(5.0 + 1e-9);
      peak = Math.max(peak, motion.opacity);
    }
    expect(peak).toBeGreaterThan(0.2);
    // A wisp is invisible when it is born at the rim.
    const born = homeBlenderSteamMotion({ timeMs: 0, phase: 0, height });
    expect(born.progress).toBe(0);
    expect(born.opacity).toBe(0);
  });

  it('keeps wisps out of phase and deterministic', () => {
    const a = homeBlenderSteamMotion({ timeMs: 3000, phase: 0.4 });
    const b = homeBlenderSteamMotion({ timeMs: 3000, phase: 3.9 });
    expect(a.progress).not.toBeCloseTo(b.progress, 2);
    expect(homeBlenderSteamMotion({ timeMs: 3000, phase: 0.4 })).toEqual(a);
  });
});

describe('HomeBlenderScene3D flame flutter shader', () => {
  const compile = (material) => {
    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\nvoid main(){\n#include <begin_vertex>\n}',
      fragmentShader: '#include <common>\nvoid main(){\n#include <emissivemap_fragment>\n}',
    };
    material.onBeforeCompile(shader);
    return shader;
  };

  it('adds a tip-weighted vertex flutter with an advanceable clock when asked', () => {
    const material = new THREE.MeshStandardMaterial();
    expect(applyFlameGradient(material, { min: 0, max: 0.4 }, { amp: 0.15, phase: 1.2 })).toBe(true);
    const shader = compile(material);
    expect(shader.vertexShader).toContain('flameTip');
    expect(shader.vertexShader).toContain('uniform float uFlameTime');
    expect(shader.uniforms.uFlutterAmp.value).toBe(0.15);
    expect(shader.uniforms.uFlutterPhase.value).toBe(1.2);
    expect(material.userData.flameTime).toBe(shader.uniforms.uFlameTime);
    expect(material.customProgramCacheKey()).toBe('home-flame-gradient-flutter');
  });

  it('keeps the plain gradient program for flames without flutter', () => {
    const material = new THREE.MeshStandardMaterial();
    applyFlameGradient(material, { min: 0, max: 0.4 });
    const shader = compile(material);
    expect(shader.vertexShader).not.toContain('flameTip');
    expect(material.userData.flameTime).toBeUndefined();
    expect(material.customProgramCacheKey()).toBe('home-flame-gradient');
  });
});

describe('HomeBlenderScene3D beacon anchors', () => {
  const canonicalCamera = (aspect) => {
    const camera = new THREE.PerspectiveCamera(22.9, aspect, 0.1, 80);
    camera.position.set(0, 4.85, 16);
    camera.lookAt(0, 1.55, -2.3);
    return camera;
  };

  it('projects every destination into the canvas, left to right in room order', () => {
    const layout = homeBlenderProjectAnchors(canonicalCamera(1870 / 852));
    for (const id of Object.keys(HOME_BLENDER_BEACON_ANCHORS)) {
      expect(layout[id].x).toBeGreaterThan(0);
      expect(layout[id].x).toBeLessThan(1);
      expect(layout[id].y).toBeGreaterThan(0);
      expect(layout[id].y).toBeLessThan(1);
    }
    expect(layout.history.x).toBeLessThan(layout.tournament.x);
    expect(layout.tournament.x).toBeLessThan(layout.train.x);
    expect(layout.train.x).toBeLessThan(layout.combat.x);
    expect(layout.combat.x).toBeLessThan(layout.daily.x);
    expect(layout.daily.x).toBeLessThan(layout.dungeon.x);
    // The armour stands on the room's centre line, above the table.
    expect(layout.combat.x).toBeGreaterThan(0.5);
    expect(layout.combat.x).toBeLessThan(0.62);
    expect(layout.combat.y).toBeLessThan(layout.daily.y);
  });

  it('follows the canvas aspect: the field of view is vertical, so a wider stage pulls side beacons towards the centre', () => {
    const wide = homeBlenderProjectAnchors(canonicalCamera(2.6));
    const narrow = homeBlenderProjectAnchors(canonicalCamera(1.8));
    expect(wide.tournament.x).toBeGreaterThan(narrow.tournament.x);
    expect(wide.daily.x).toBeLessThan(narrow.daily.x);
    // Vertical position does not depend on the aspect.
    expect(wide.combat.y).toBeCloseTo(narrow.combat.y, 3);
  });

  it('returns null without a camera', () => {
    expect(homeBlenderProjectAnchors(null)).toBeNull();
  });
});

describe('HomeBlenderScene3D chess piece lift', () => {
  const mesh = (materialName) => {
    const material = new THREE.MeshStandardMaterial();
    material.name = materialName;
    return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  };

  it('warms the light and dark pieces but leaves the board squares and everything else alone', () => {
    const root = new THREE.Group();
    const light = mesh('HOME_MAT_piece_light');
    const lightAlt = mesh('HOME_MAT_piece_light_alt');
    const dark = mesh('HOME_MAT_piece_dark');
    const square = mesh('HOME_MAT_board_light');
    const wall = mesh('HOME_MAT_stone');
    root.add(light, lightAlt, dark, square, wall);
    expect(applyHomeBlenderPieceLift(root)).toBe(3);
    expect(light.material.emissive.getHex()).toBeGreaterThan(dark.material.emissive.getHex());
    expect(lightAlt.material.emissive.getHex()).toBe(light.material.emissive.getHex());
    expect(square.material.emissive.getHex()).toBe(0);
    expect(wall.material.emissive.getHex()).toBe(0);
  });

  it('is safe on an empty or missing scene', () => {
    expect(applyHomeBlenderPieceLift(null)).toBe(0);
    expect(applyHomeBlenderPieceLift(new THREE.Group())).toBe(0);
  });
});

describe('home dust motes', () => {
  it('seeds deterministically inside the light volume', () => {
    const a = homeBlenderDustSeeds();
    expect(a).toEqual(homeBlenderDustSeeds());
    expect(a).toHaveLength(HOME_BLENDER_DUST.count);
    for (const seed of a) {
      expect(seed.y).toBeGreaterThanOrEqual(HOME_BLENDER_DUST.yMin);
      expect(seed.y).toBeLessThanOrEqual(HOME_BLENDER_DUST.yMax);
    }
  });

  it('writes the exact original positions to the persistent float32 buffer without replacing it', () => {
    const seeds = homeBlenderDustSeeds(64);
    const buffer = new Float32Array(seeds.length * 3);
    const original = buffer;
    for (const timeMs of [0, 16.7, 555, 5000, 90000, 1e7]) {
      buffer.fill(NaN);
      expect(homeBlenderWriteDustPositions(seeds, timeMs, buffer)).toBe(original);
      const reference = new Float32Array(seeds.length * 3);
      seeds.forEach((seed, i) => {
        const [x, y, z] = homeBlenderDustPosition(seed, timeMs);
        reference[i * 3] = x;
        reference[i * 3 + 1] = y;
        reference[i * 3 + 2] = z;
      });
      expect(buffer).toEqual(reference);
    }
    const sentinel = new Float32Array([42, 43, 44]);
    homeBlenderWriteDustPositions([], 123, sentinel);
    expect(sentinel).toEqual(new Float32Array([42, 43, 44]));
  });

  it('drifts slowly and wraps vertically', () => {
    const [seed] = homeBlenderDustSeeds(1);
    for (const t of [0, 5000, 90000, 1e7]) {
      const [x, y] = homeBlenderDustPosition(seed, t);
      expect(y).toBeGreaterThanOrEqual(HOME_BLENDER_DUST.yMin);
      expect(y).toBeLessThanOrEqual(HOME_BLENDER_DUST.yMax);
      expect(Math.abs(x - seed.x)).toBeLessThanOrEqual(0.23);
    }
  });
});

describe('home moon shaft', () => {
  it('points from the window down toward the floor', () => {
    const pose = homeBlenderMoonShaftPose();
    expect(pose.length).toBeGreaterThan(4);
    expect(pose.center.y).toBeLessThan(HOME_BLENDER_MOON_SHAFT.from[1]);
    expect(pose.center.y).toBeGreaterThan(HOME_BLENDER_MOON_SHAFT.to[1]);
  });
});

describe('home fire particles', () => {
  it('seeds deterministically and differently per hearth', () => {
    const left = homeBlenderFireSeeds(HOME_BLENDER_FIRE_PARTICLES.count, 1);
    expect(left).toEqual(homeBlenderFireSeeds(HOME_BLENDER_FIRE_PARTICLES.count, 1));
    expect(left).not.toEqual(homeBlenderFireSeeds(HOME_BLENDER_FIRE_PARTICLES.count, 2));
    expect(left).toHaveLength(HOME_BLENDER_FIRE_PARTICLES.count);
    for (const seed of left) expect(Math.abs(seed.x)).toBeLessThanOrEqual(HOME_BLENDER_FIRE_PARTICLES.spreadX);
  });

  it('finds one base per hearth from the flame nodes', () => {
    const mk = (x) => {
      const object = new THREE.Object3D();
      object.position.set(x, 0.5, -5.7);
      object.updateMatrixWorld(true);
      return object;
    };
    const bases = homeBlenderFireHearthBases([
      { hearth: 'left', kind: 'flame', object: mk(-6.2) },
      { hearth: 'left', kind: 'hot', object: mk(-6.1) },
      { hearth: 'right', kind: 'flame', object: mk(4.4) },
      { hearth: 'right', kind: 'candle', object: mk(9) },
    ]);
    expect(bases.map((b) => b.hearth)).toEqual(['left', 'right']);
    expect(bases[0].base[0]).toBeCloseTo(-6.15, 2);
    expect(bases[1].base[0]).toBeCloseTo(4.4, 2);
  });
});

describe('home candle particles', () => {
  it('builds per-flame bases and matching attribute sizes', () => {
    const mk = (x, kind) => {
      const object = new THREE.Object3D();
      object.position.set(x, 2, -3);
      object.updateMatrixWorld(true);
      return { kind, object };
    };
    const bases = homeBlenderCandleBases([mk(1, 'candle'), mk(2, 'flame'), mk(3, 'candle')]);
    expect(bases).toEqual([[1, 2, -3], [3, 2, -3]]);
    const attrs = homeBlenderCandleAttributes(bases);
    expect(attrs.count).toBe(bases.length * HOME_BLENDER_CANDLE_PARTICLES.perFlame);
    expect(attrs.base).toHaveLength(attrs.count * 3);
    expect(attrs.seed).toHaveLength(attrs.count * 4);
    expect(Array.from(attrs.base.slice(0, 3))).toEqual([1, 2, -3]);
  });
});

describe('home blender runtime LOD cap', () => {
  const desktop = { viewportWidth: 1920, devicePixelRatio: 2, hardwareConcurrency: 8 };

  it('is full by default and tightens to lite then 2d with the shared cap', () => {
    expect(homeBlenderRuntimePolicy(desktop).lod).toBe('full');
    const lite = homeBlenderRuntimePolicy({ ...desktop, runtimeLodCap: 'lite' });
    expect(lite.lod).toBe('lite');
    expect(lite.pixelRatio).toBeLessThanOrEqual(1.25);
    expect(homeBlenderPolicyNeedsFallback(lite)).toBe(false);
    expect(homeBlenderPolicyNeedsFallback(homeBlenderRuntimePolicy({ ...desktop, runtimeLodCap: '2d' }))).toBe(true);
  });

  it('never loosens a cap', () => {
    expect(tighterRuntimeLodCap(null, 'lite')).toBe('lite');
    expect(tighterRuntimeLodCap('lite', '2d')).toBe('2d');
    expect(tighterRuntimeLodCap('2d', 'lite')).toBe('2d');
    expect(tighterRuntimeLodCap('lite', null)).toBe('lite');
  });
});


describe('Home coffee is cold only while Matthias sleeps', () => {
  it('hides only the coffee particles while keeping the hearth and candles untouched', () => {
    const steam = { userData: { steam: true }, visible: true };
    const fire = { userData: { fire: true }, visible: true };
    const candle = { userData: { candles: true }, visible: true };
    const particles = [steam, fire, candle];
    expect(applyHomeBlenderCoffeeTemperature(particles, { profile: 'sleep' })).toBe('cold');
    expect(steam.visible).toBe(false);
    expect(fire.visible).toBe(true);
    expect(candle.visible).toBe(true);

    expect(applyHomeBlenderCoffeeTemperature(particles, { profile: 'sip' })).toBe('hot');
    expect(steam.visible).toBe(true);
    expect(fire.visible).toBe(true);
    expect(candle.visible).toBe(true);
    expect(applyHomeBlenderCoffeeTemperature([], { profile: 'sleep' })).toBe('cold');
  });
});
