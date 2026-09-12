import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  HOME_CASTLE_ART_HEIGHT,
  HOME_CASTLE_ART_WIDTH,
  createCanonicalHallGeometry,
} from './HomeCastle3DGeometry.js';
import { homeCastleLightingProfile } from './HomeCastle3DLighting.js';
import { homeCastleRoomFocus } from './HomeCastle3DRoomFocus.js';
import { HOME_CASTLE_3D_MIN_WIDTH, homeCastle3DRenderPolicy } from './HomeCastle3DRenderPolicy.js';
import { applyCanonicalHallOcclusion } from './HomeCastle3DOcclusion.js';
import {
  HOME_CASTLE_CHANDELIER_LIGHT_ANCHORS,
  HOME_CASTLE_FIREPLACE_LIGHT_ANCHOR,
  HOME_CASTLE_TORCH_ANCHORS,
  createHomeCastleTorchProps,
} from './HomeCastle3DProps.js';
import {
  homeCastleChandelierShimmer,
  homeCastleFireplacePulse,
  homeCastleTorchFlicker,
} from './HomeCastle3DTorchFlicker.js';
import {
  homeCastleNeedsContinuousRender,
  homeCastleShouldRender,
} from './HomeCastle3DVisibility.js';

const CAMERA_Z = 3;
const PARALLAX_X = 0.034;
const PARALLAX_Y = 0.022;
const ROOM_CAMERA_X = 0.012;
const ROOM_CAMERA_Y = 0.01;
const IDLE_ROOM_LIGHT_DEPTH = 1.18;
const IDLE_ROOM_LIGHT_REACH = 1.45;

function frameOrthographicCamera(camera, aspect) {
  const halfHeight = HOME_CASTLE_ART_HEIGHT / 2;
  const halfWidth = halfHeight * aspect;
  camera.left = -halfWidth;
  camera.right = halfWidth;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.updateProjectionMatrix();
}

function addLightRig(scene, profile) {
  const hemisphere = new THREE.HemisphereLight(0xffead0, 0x26160f, profile.ambient);
  const key = new THREE.DirectionalLight(profile.keyColor, profile.key);
  key.position.set(-1.6, 1.25, 2.4);
  const fill = new THREE.DirectionalLight(profile.fillColor, profile.fill);
  fill.position.set(1.7, 0.55, 1.8);
  scene.add(hemisphere, key, fill);

  const torchLights = HOME_CASTLE_TORCH_ANCHORS.map((anchor) => {
    const torchLight = new THREE.PointLight(0xff9a48, profile.torch, 2.2, 2);
    torchLight.position.set(anchor.x, anchor.y + 0.07, 1.1);
    scene.add(torchLight);
    return torchLight;
  });

  const chandelierIntensity = Math.max(0.02, profile.torch * 0.42);
  const chandelierLights = HOME_CASTLE_CHANDELIER_LIGHT_ANCHORS.map((anchor) => {
    const chandelierLight = new THREE.PointLight(0xffc778, chandelierIntensity, 1.65, 2);
    chandelierLight.position.set(anchor.x, anchor.y, anchor.z);
    scene.add(chandelierLight);
    return chandelierLight;
  });

  const fireplaceIntensity = Math.max(0.018, profile.torch * 0.34);
  const fireplaceLight = new THREE.PointLight(0xff8c42, fireplaceIntensity, 1.45, 2);
  fireplaceLight.position.set(
    HOME_CASTLE_FIREPLACE_LIGHT_ANCHOR.x,
    HOME_CASTLE_FIREPLACE_LIGHT_ANCHOR.y,
    HOME_CASTLE_FIREPLACE_LIGHT_ANCHOR.z,
  );
  scene.add(fireplaceLight);

  return {
    torchLights,
    chandelierLights,
    chandelierIntensity,
    fireplaceLight,
    fireplaceIntensity,
  };
}

function desktopMediaQuery() {
  return `(min-width: ${HOME_CASTLE_3D_MIN_WIDTH}px)`;
}

export default function HomeCastle3D({ artUrl, ambient = 'day', activeRoom = null }) {
  const canvasRef = useRef(null);
  const activeRoomRef = useRef(activeRoom);
  const renderRequestRef = useRef(null);
  const [desktopEnabled, setDesktopEnabled] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia?.(desktopMediaQuery()).matches === true
  ));

  useEffect(() => {
    activeRoomRef.current = activeRoom;
    renderRequestRef.current?.();
  }, [activeRoom]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const media = window.matchMedia(desktopMediaQuery());
    const sync = () => setDesktopEnabled(media.matches);
    sync();
    media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!desktopEnabled || !canvas || !artUrl) return undefined;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      return undefined;
    }

    const lighting = homeCastleLightingProfile(ambient);
    const renderPolicy = homeCastle3DRenderPolicy({
      viewportWidth: window.innerWidth,
      devicePixelRatio: window.devicePixelRatio || 1,
      hardwareConcurrency: navigator.hardwareConcurrency || 8,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = lighting.exposure;
    renderer.setPixelRatio(renderPolicy.pixelRatio);

    const scene = new THREE.Scene();
    const {
      torchLights,
      chandelierLights,
      chandelierIntensity,
      fireplaceLight,
      fireplaceIntensity,
    } = addLightRig(scene, lighting);
    const roomLight = new THREE.PointLight(0xffc76f, 0, IDLE_ROOM_LIGHT_REACH, 2);
    roomLight.position.set(0, 0, IDLE_ROOM_LIGHT_DEPTH);
    scene.add(roomLight);

    const camera = new THREE.OrthographicCamera(
      -HOME_CASTLE_ART_WIDTH / 2,
      HOME_CASTLE_ART_WIDTH / 2,
      HOME_CASTLE_ART_HEIGHT / 2,
      -HOME_CASTLE_ART_HEIGHT / 2,
      0.1,
      10,
    );
    camera.position.set(0, 0, CAMERA_Z);

    const geometry = createCanonicalHallGeometry();
    applyCanonicalHallOcclusion(geometry);
    const material = new THREE.MeshStandardMaterial({
      transparent: true,
      roughness: 0.96,
      metalness: 0,
      emissive: 0xffffff,
      emissiveIntensity: 0.72,
    });
    const occlusionMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.18,
      blending: THREE.MultiplyBlending,
      premultipliedAlpha: true,
      depthWrite: false,
      toneMapped: false,
    });
    const art = new THREE.Mesh(geometry, material);
    art.scale.setScalar(1.018);
    const occlusion = new THREE.Mesh(geometry, occlusionMaterial);
    occlusion.scale.setScalar(1.018);
    occlusion.position.z = 0.0015;
    occlusion.renderOrder = 1;
    scene.add(art, occlusion);

    const torchProps = createHomeCastleTorchProps();
    torchProps.group.renderOrder = 2;
    scene.add(torchProps.group);

    const pointer = new THREE.Vector2();
    const target = new THREE.Vector2();
    const roomFocus = new THREE.Vector3();
    const roomTarget = new THREE.Vector3();
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const textureLoader = new THREE.TextureLoader();
    let frame = 0;
    let disposed = false;
    let intersecting = true;
    let roomLightDepth = IDLE_ROOM_LIGHT_DEPTH;
    let roomLightReach = IDLE_ROOM_LIGHT_REACH;
    let lastRenderedAt = Number.NEGATIVE_INFINITY;

    const shouldRender = () => homeCastleShouldRender({
      documentHidden: document.hidden,
      intersecting,
    });

    const stopRender = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    };

    const resize = () => {
      const width = Math.max(1, canvas.clientWidth || canvas.parentElement?.clientWidth || 1);
      const height = Math.max(1, canvas.clientHeight || canvas.parentElement?.clientHeight || 1);
      renderer.setSize(width, height, false);
      frameOrthographicCamera(camera, width / height);
      renderRequestRef.current?.();
    };

    const render = (timestamp = 0) => {
      frame = 0;
      if (disposed || !shouldRender()) return;
      const reduced = reducedMotion?.matches === true;
      const continuous = homeCastleNeedsContinuousRender({ reducedMotion: reduced });
      if (
        !reduced
        && renderPolicy.minFrameIntervalMs > 0
        && timestamp - lastRenderedAt < renderPolicy.minFrameIntervalMs
      ) {
        if (continuous) frame = window.requestAnimationFrame(render);
        return;
      }
      lastRenderedAt = timestamp;

      const focused = homeCastleRoomFocus(activeRoomRef.current);
      roomTarget.set(focused.x, focused.y, focused.light);
      if (reduced) {
        roomFocus.copy(roomTarget);
        roomLightDepth = focused.depth;
        roomLightReach = focused.reach;
      } else {
        roomFocus.lerp(roomTarget, 0.09);
        roomLightDepth += (focused.depth - roomLightDepth) * 0.09;
        roomLightReach += (focused.reach - roomLightReach) * 0.09;
      }
      roomLight.position.x = roomFocus.x;
      roomLight.position.y = roomFocus.y;
      roomLight.position.z = roomLightDepth;
      roomLight.distance = roomLightReach;
      roomLight.intensity = roomFocus.z;

      for (let index = 0; index < torchProps.flames.length; index += 1) {
        const flicker = homeCastleTorchFlicker(index, timestamp, reduced);
        const flame = torchProps.flames[index];
        const torchLight = torchLights[index];
        if (flame) {
          flame.scale.x = 0.82 * (0.985 + ((flicker - 1) * 0.18));
          flame.scale.z = flame.scale.x;
          flame.scale.y = 1 + ((flicker - 1) * 0.62);
        }
        if (torchLight) torchLight.intensity = lighting.torch * flicker;
      }

      for (let index = 0; index < chandelierLights.length; index += 1) {
        const shimmer = homeCastleChandelierShimmer(index, timestamp, reduced);
        chandelierLights[index].intensity = chandelierIntensity * shimmer;
      }

      fireplaceLight.intensity = fireplaceIntensity * homeCastleFireplacePulse(timestamp, reduced);

      if (!reduced) {
        pointer.lerp(target, 0.055);
        camera.position.x = pointer.x * PARALLAX_X + roomFocus.x * ROOM_CAMERA_X;
        camera.position.y = -pointer.y * PARALLAX_Y + roomFocus.y * ROOM_CAMERA_Y;
        camera.lookAt(roomFocus.x * 0.006, roomFocus.y * 0.005, 0.035);
      } else {
        pointer.set(0, 0);
        camera.position.set(0, 0, CAMERA_Z);
        camera.lookAt(0, 0, 0.035);
      }
      renderer.render(scene, camera);
      if (continuous) frame = window.requestAnimationFrame(render);
    };

    const resumeRender = () => {
      if (!disposed && shouldRender() && !frame) frame = window.requestAnimationFrame(render);
    };
    renderRequestRef.current = resumeRender;

    const onPointerMove = (event) => {
      if (reducedMotion?.matches) return;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      target.set(
        THREE.MathUtils.clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1, 1),
        THREE.MathUtils.clamp(((event.clientY - rect.top) / rect.height) * 2 - 1, -1, 1),
      );
    };

    const onPointerLeave = () => target.set(0, 0);
    const onContextLost = () => canvas.classList.remove('is-ready');
    const onVisibilityChange = () => {
      if (document.hidden) stopRender();
      else resumeRender();
    };
    const onIntersectionChange = (entries) => {
      intersecting = entries[0]?.isIntersecting !== false;
      if (intersecting) resumeRender();
      else stopRender();
    };
    const onReducedMotionChange = () => resumeRender();

    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    const intersectionObserver = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(onIntersectionChange, { threshold: 0.01 })
      : null;
    resizeObserver?.observe(canvas);
    intersectionObserver?.observe(canvas);
    reducedMotion?.addEventListener?.('change', onReducedMotionChange);
    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
    canvas.parentElement?.addEventListener('pointermove', onPointerMove, { passive: true });
    canvas.parentElement?.addEventListener('pointerleave', onPointerLeave, { passive: true });
    canvas.addEventListener('webglcontextlost', onContextLost);

    resize();
    textureLoader.load(
      artUrl,
      (texture) => {
        if (disposed) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        material.map = texture;
        material.emissiveMap = texture;
        material.needsUpdate = true;
        canvas.classList.add('is-ready');
        resumeRender();
      },
      undefined,
      () => canvas.classList.remove('is-ready'),
    );
    resumeRender();

    return () => {
      disposed = true;
      if (renderRequestRef.current === resumeRender) renderRequestRef.current = null;
      stopRender();
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      reducedMotion?.removeEventListener?.('change', onReducedMotionChange);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      canvas.parentElement?.removeEventListener('pointermove', onPointerMove);
      canvas.parentElement?.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      material.map?.dispose();
      material.dispose();
      occlusionMaterial.dispose();
      torchProps.dispose();
      geometry.dispose();
      renderer.dispose();
    };
  }, [ambient, artUrl, desktopEnabled]);

  if (!desktopEnabled) return null;
  return <canvas ref={canvasRef} className="illustrated-home__castle-3d" aria-hidden="true" />;
}
