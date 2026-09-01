import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
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
  if (/coffee|beer-break|night/.test(sceneKey) || /cafe|cerve/.test(activityKey)) return 'sip';
  if (/lunch|bocata/.test(sceneKey) || /comida|cena|repostando/.test(activityKey)) return 'bite';
  if (/inception/.test(sceneKey) || /partida|ajedrez dentro/.test(activityKey)) return 'think';
  if (/ops/.test(sceneKey) || /operacion|notas/.test(activityKey)) return 'write';
  if (/dossier/.test(sceneKey) || /auditoria|expedient/.test(activityKey)) return 'dossier';
  if (/strategy|weekly|reading/.test(sceneKey) || /lectura|estudio|manual|estrategia/.test(activityKey)) return 'read';
  return 'idle';
}

function gaussian(x, y, cx, cy, sx, sy) {
  const dx = (x - cx) / sx;
  const dy = (y - cy) / sy;
  return Math.exp(-(dx * dx + dy * dy) * 2.15);
}

function envelope(time, period = 8.4, active = 2.65) {
  const local = ((time % period) + period) % period;
  if (local >= active) return 0;
  const phase = local / active;
  return Math.sin(Math.PI * phase) ** 2;
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

function deformVertex(profile, x, y, imageAspect, time, speaking) {
  const nx = imageAspect ? x / imageAspect : x;
  const head = gaussian(nx, y, 0, .30, .42, .42);
  const leftArm = gaussian(nx, y, -.36, -.18, .34, .55);
  const rightArm = gaussian(nx, y, .36, -.18, .34, .55);
  const centerProp = gaussian(nx, y, 0, -.38, .42, .34);
  const rightProp = gaussian(nx, y, .40, -.34, .34, .38);
  const body = gaussian(nx, y, 0, -.05, .78, .94);
  const idleBreath = Math.sin(time * 1.35) * .0045 * body;
  let dx = 0;
  let dy = idleBreath;
  let dz = 0;

  if (profile === 'idle') {
    const action = envelope(time + .25, 10.5, 2.2);
    const rot = rotateRegion(nx, y, 0, .17, -.025 * action, head);
    dx += rot.dx * imageAspect;
    dy += rot.dy;
    dz += head * action * .008;
    return { dx, dy, dz, energy: action };
  }

  if (profile === 'sip') {
    const action = envelope(time, 8.2, 2.7);
    dy += rightArm * action * .115;
    dy += rightProp * action * .145;
    dx -= (rightArm + rightProp) * action * .022;
    const rot = rotateRegion(nx, y, 0, .18, .035 * action, head);
    dx += rot.dx * imageAspect;
    dy += rot.dy - head * action * .012;
    dz += (rightArm + rightProp) * action * .014;
    return { dx, dy, dz, energy: action };
  }

  if (profile === 'bite') {
    const action = envelope(time + .3, 9.4, 2.75);
    dy += (leftArm + rightArm) * action * .072;
    dy += centerProp * action * .105;
    const rot = rotateRegion(nx, y, 0, .18, -.028 * action, head);
    dx += rot.dx * imageAspect;
    dy += rot.dy - head * action * .014;
    dz += centerProp * action * .012;
    return { dx, dy, dz, energy: action };
  }

  if (profile === 'write') {
    const action = envelope(time, 7.6, 3.0);
    const scribble = Math.sin(time * 12.5) * action;
    dx += rightArm * scribble * .045;
    dy += rightArm * action * .045 + rightArm * Math.cos(time * 11.2) * action * .018;
    const rot = rotateRegion(nx, y, 0, .18, -.022 * action, head);
    dx += rot.dx * imageAspect;
    dy += rot.dy + head * action * .008;
    dz += rightArm * action * .012;
    return { dx, dy, dz, energy: action };
  }

  if (profile === 'dossier') {
    const action = envelope(time + .15, 8.8, 3.15);
    const scan = Math.sin(time * 4.6) * action;
    dx += head * scan * .012;
    dy += rightArm * action * .052;
    dy += rightProp * action * .062;
    dx -= rightProp * action * .012;
    dz += rightProp * action * .016;
    return { dx, dy, dz, energy: action };
  }

  if (profile === 'read') {
    const action = envelope(time, 8.6, 3.25);
    const scan = Math.sin(time * 4.2) * action;
    dx += head * scan * .014;
    dy += head * Math.sin(time * 2.1) * action * .004;
    dx += rightProp * Math.sin(time * 1.9) * action * .006;
    dz += head * action * .006;
    return { dx, dy, dz, energy: action };
  }

  if (profile === 'think') {
    const action = envelope(time + .25, 8.1, 3.0);
    dy += rightArm * action * .105;
    dx -= rightArm * action * .035;
    const rot = rotateRegion(nx, y, 0, .17, -.038 * action, head);
    dx += rot.dx * imageAspect;
    dy += rot.dy - head * action * .018;
    dz += rightArm * action * .018;
    return { dx, dy, dz, energy: action };
  }

  if (profile === 'sleep') {
    const action = envelope(time + .4, 9.8, 4.2);
    const nod = Math.sin(Math.PI * Math.min(1, ((time + .4) % 9.8) / 4.2)) * action;
    const rot = rotateRegion(nx, y, 0, .17, -.06 * nod, head);
    dx += rot.dx * imageAspect;
    dy += rot.dy - head * nod * .036;
    dz -= head * nod * .012;
    return { dx, dy, dz, energy: action };
  }

  if (profile === 'speak') {
    const action = speaking ? (.55 + Math.sin(time * 4.4) * .22) : envelope(time, 5, 2);
    const rot = rotateRegion(nx, y, 0, .16, Math.sin(time * 2.8) * .014 * action, head);
    dx += rot.dx * imageAspect;
    dy += rot.dy - body * action * .006;
    dz += head * action * .009;
    return { dx, dy, dz, energy: action };
  }

  return { dx, dy, dz, energy: 0 };
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
}) {
  const canvasRef = useRef(null);
  const rootRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const profile = useMemo(
    () => matthiasThreeMotionProfile({ scene, activity, speaking }),
    [activity, scene, speaking],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root || !avatar) return undefined;

    let renderer;
    let raf = 0;
    let disposed = false;
    let resizeObserver = null;
    let geometry = null;
    let material = null;
    let texture = null;

    setReady(false);
    setFailed(false);
    root.dataset.threeReady = 'false';
    root.dataset.threeFrame = '0';
    root.dataset.threeEnergy = '0';

    try {
      const coarsePointer = Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: !coarsePointer,
        powerPreference: coarsePointer ? 'low-power' : 'default',
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarsePointer ? 1.15 : 1.5));
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
        const imageAspect = Math.max(.1, (loaded.image?.naturalWidth || loaded.image?.width || 1) / (loaded.image?.naturalHeight || loaded.image?.height || 1));
        geometry = new THREE.PlaneGeometry(2 * imageAspect, 2, 24, 28);
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
          window.addEventListener('resize', doResize);
        }

        let frames = 0;
        const startedAt = performance.now();
        const render = (stamp) => {
          if (disposed) return;
          const time = Math.max(0, stamp - startedAt) / 1000;
          const positions = geometry.attributes.position;
          let energy = 0;
          for (let index = 0; index < positions.count; index += 1) {
            const offset = index * 3;
            const x = basePositions[offset];
            const y = basePositions[offset + 1];
            const z = basePositions[offset + 2];
            const motion = reducedMotion
              ? { dx: 0, dy: 0, dz: 0, energy: 0 }
              : deformVertex(profile, x, y, imageAspect, time, speaking);
            positions.array[offset] = x + motion.dx;
            positions.array[offset + 1] = y + motion.dy;
            positions.array[offset + 2] = z + motion.dz;
            energy = Math.max(energy, motion.energy || 0);
          }
          positions.needsUpdate = true;
          if (!reducedMotion) {
            mesh.rotation.z = Math.sin(time * 1.05) * .0035;
            mesh.rotation.y = Math.sin(time * .72) * .0045;
          } else {
            mesh.rotation.set(0, 0, 0);
          }
          renderer.render(scene3d, camera);
          frames += 1;
          if (frames === 1) {
            setReady(true);
            root.dataset.threeReady = 'true';
          }
          if (frames % 6 === 0 || frames === 1) {
            root.dataset.threeFrame = String(frames);
            root.dataset.threeEnergy = energy.toFixed(3);
          }
          if (!reducedMotion) raf = window.requestAnimationFrame(render);
        };

        raf = window.requestAnimationFrame(render);
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
      if (raf) window.cancelAnimationFrame(raf);
      resizeObserver?.disconnect?.();
      if (!resizeObserver) window.removeEventListener('resize', () => {});
      geometry?.dispose?.();
      material?.dispose?.();
      texture?.dispose?.();
      renderer?.dispose?.();
    };
  }, [avatar, profile, reducedMotion, speaking]);

  return (
    <span
      ref={rootRef}
      className={`matthias-three-avatar${ready ? ' is-ready' : ''}${failed ? ' is-failed' : ''}`}
      data-matthias-three-avatar="true"
      data-three-scene={scene || 'base'}
      data-three-activity={activity || ''}
      data-three-profile={profile}
      data-three-motion={reducedMotion ? 'reduced' : 'active'}
      data-three-ready={ready ? 'true' : 'false'}
      data-three-failed={failed ? 'true' : 'false'}
      data-three-frame="0"
      data-three-energy="0"
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
