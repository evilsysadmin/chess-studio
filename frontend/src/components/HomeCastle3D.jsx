import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const CAMERA_FOV = 35;
const ART_WIDTH = 3.2;
const ART_HEIGHT = 1.8;
const PARALLAX_X = 0.018;
const PARALLAX_Y = 0.012;

function cameraDistanceForHeight(height, fovDegrees) {
  return (height / 2) / Math.tan(THREE.MathUtils.degToRad(fovDegrees / 2));
}

export default function HomeCastle3D({ artUrl }) {
  const canvasRef = useRef(null);

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

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 16 / 9, 0.1, 20);
    camera.position.set(0, 0, cameraDistanceForHeight(ART_HEIGHT, CAMERA_FOV));

    const geometry = new THREE.PlaneGeometry(ART_WIDTH, ART_HEIGHT);
    const material = new THREE.MeshBasicMaterial({ transparent: true });
    const art = new THREE.Mesh(geometry, material);
    art.scale.setScalar(1.035);
    scene.add(art);

    const pointer = new THREE.Vector2();
    const target = new THREE.Vector2();
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const textureLoader = new THREE.TextureLoader();
    let frame = 0;
    let disposed = false;

    const resize = () => {
      const width = Math.max(1, canvas.clientWidth || canvas.parentElement?.clientWidth || 1);
      const height = Math.max(1, canvas.clientHeight || canvas.parentElement?.clientHeight || 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const render = () => {
      if (disposed) return;
      if (!reducedMotion?.matches) {
        pointer.lerp(target, 0.055);
        art.rotation.y = pointer.x * PARALLAX_X;
        art.rotation.x = -pointer.y * PARALLAX_Y;
      } else {
        pointer.set(0, 0);
        art.rotation.set(0, 0, 0);
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
  }, [artUrl]);

  return <canvas ref={canvasRef} className="illustrated-home__castle-3d" aria-hidden="true" />;
}
