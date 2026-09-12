import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  HOME_CASTLE_ART_HEIGHT,
  HOME_CASTLE_ART_WIDTH,
  createCanonicalHallGeometry,
} from './HomeCastle3DGeometry.js';
import { homeCastleLightingProfile } from './HomeCastle3DLighting.js';
import { homeCastleRoomFocus } from './HomeCastle3DInteraction.js';

const CAMERA_Z = 3;
const PARALLAX_X = 0.034;
const PARALLAX_Y = 0.022;
const ROOM_CAMERA_X = 0.012;
const ROOM_CAMERA_Y = 0.01;

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
  const leftTorch = new THREE.PointLight(0xff9a48, profile.torch, 2.2, 2);
  leftTorch.position.set(-1.15, 0.25, 1.1);
  const rightTorch = leftTorch.clone();
  rightTorch.position.x = 1.15;
  scene.add(hemisphere, key, fill, leftTorch, rightTorch);
}

export default function HomeCastle3D({ artUrl, ambient = 'day', activeRoom = null }) {
  const canvasRef = useRef(null);
  const activeRoomRef = useRef(activeRoom);

  useEffect(() => {
    activeRoomRef.current = activeRoom;
  }, [activeRoom]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !artUrl) return undefined;

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
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = lighting.exposure;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

    const scene = new THREE.Scene();
    addLightRig(scene, lighting);
    const roomLight = new THREE.PointLight(0xffc76f, 0, 1.45, 2);
    roomLight.position.set(0, 0, 1.18);
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
    const material = new THREE.MeshStandardMaterial({
      transparent: true,
      roughness: 0.96,
      metalness: 0,
      emissive: 0xffffff,
      emissiveIntensity: 0.72,
    });
    const art = new THREE.Mesh(geometry, material);
    art.scale.setScalar(1.018);
    scene.add(art);

    const pointer = new THREE.Vector2();
    const target = new THREE.Vector2();
    const roomFocus = new THREE.Vector3();
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const textureLoader = new THREE.TextureLoader();
    let frame = 0;
    let disposed = false;

    const resize = () => {
      const width = Math.max(1, canvas.clientWidth || canvas.parentElement?.clientWidth || 1);
      const height = Math.max(1, canvas.clientHeight || canvas.parentElement?.clientHeight || 1);
      renderer.setSize(width, height, false);
      frameOrthographicCamera(camera, width / height);
    };

    const render = () => {
      if (disposed) return;
      const focused = homeCastleRoomFocus(activeRoomRef.current);
      roomFocus.lerp(new THREE.Vector3(focused.x, focused.y, focused.light), 0.09);
      roomLight.position.x = roomFocus.x;
      roomLight.position.y = roomFocus.y;
      roomLight.intensity = roomFocus.z;

      if (!reducedMotion?.matches) {
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
      frame = window.requestAnimationFrame(render);
    };

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

    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    observer?.observe(canvas);
    window.addEventListener('resize', resize, { passive: true });
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
      },
      undefined,
      () => canvas.classList.remove('is-ready'),
    );
    render();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      canvas.parentElement?.removeEventListener('pointermove', onPointerMove);
      canvas.parentElement?.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      material.map?.dispose();
      material.dispose();
      geometry.dispose();
      renderer.dispose();
    };
  }, [ambient, artUrl]);

  return <canvas ref={canvasRef} className="illustrated-home__castle-3d" aria-hidden="true" />;
}
