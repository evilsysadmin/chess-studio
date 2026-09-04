import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const DESKTOP_DPR_CAP = 1.35;
const MOBILE_DPR_CAP = 1;
const FRAME_INTERVAL_MS = 48;

function material(THREE, options) {
  return new THREE.MeshStandardMaterial(options);
}

function addBox(THREE, parent, size, position, mat, rotation = null) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
}

function addWindow(THREE, parent, x, stone, glass, brass, velvet, mobile) {
  const frame = new THREE.Group();
  frame.position.x = x;
  parent.add(frame);

  addBox(THREE, frame, [2.45, 4.55, 0.18], [0, 2.25, -3.82], stone);
  addBox(THREE, frame, [2.02, 4.04, 0.08], [0, 2.27, -3.70], glass);
  addBox(THREE, frame, [0.10, 4.05, 0.10], [0, 2.27, -3.60], brass);
  addBox(THREE, frame, [2.02, 0.09, 0.10], [0, 2.24, -3.60], brass);
  addBox(THREE, frame, [2.02, 0.08, 0.10], [0, 3.52, -3.60], brass);

  const curtainOffset = 1.40;
  const foldCount = mobile ? 2 : 4;
  for (const side of [-1, 1]) {
    for (let i = 0; i < foldCount; i += 1) {
      const radius = mobile ? 0.13 : 0.16;
      const fold = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius * 1.07, 4.65, 8, 1, false),
        velvet,
      );
      fold.position.set(
        side * (curtainOffset + i * 0.17 * side),
        2.18,
        -3.45 + (i % 2) * 0.06,
      );
      frame.add(fold);
    }
  }
  addBox(THREE, frame, [3.55, 0.28, 0.24], [0, 4.58, -3.42], velvet);
  addBox(THREE, frame, [3.72, 0.07, 0.07], [0, 4.79, -3.33], brass);
}

function addTorch(THREE, parent, x, warmMaterial) {
  const group = new THREE.Group();
  group.position.set(x, 2.2, -3.42);
  parent.add(group);

  const bracket = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.62, 0.09),
    new THREE.MeshStandardMaterial({ color: 0x7b5b2d, metalness: 0.72, roughness: 0.32 }),
  );
  bracket.rotation.z = x < 0 ? -0.28 : 0.28;
  group.add(bracket);

  const ember = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), warmMaterial);
  ember.position.y = 0.36;
  group.add(ember);

  const light = new THREE.PointLight(0xff9f45, 1.45, 5.4, 2);
  light.position.set(0, 0.44, 0.20);
  group.add(light);
  return light;
}

function createDust(THREE, count) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 12;
    positions[i * 3 + 1] = Math.random() * 5.8 - 0.6;
    positions[i * 3 + 2] = Math.random() * 7 - 2.4;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0xc9b07e,
      size: 0.022,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }),
  );
  return points;
}

function buildScene(THREE, { host, ambience }) {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.tabIndex = -1;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: !coarse,
      powerPreference: 'high-performance',
    });
  } catch {
    host.dataset.homeSceneFallback = 'webgl-unavailable';
    return () => {};
  }

  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = false;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? MOBILE_DPR_CAP : DESKTOP_DPR_CAP));
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x090d11, coarse ? 0.052 : 0.046);

  const camera = new THREE.PerspectiveCamera(coarse ? 42 : 36, 1, 0.1, 50);
  camera.position.set(0, coarse ? 4.15 : 4.45, coarse ? 12.5 : 11.6);
  camera.lookAt(0, 1.85, -0.55);

  const stone = material(THREE, { color: 0x262b2d, roughness: 0.94, metalness: 0.03 });
  const stoneEdge = material(THREE, { color: 0x393c3a, roughness: 0.88, metalness: 0.05 });
  const oak = material(THREE, { color: 0x2b1910, roughness: 0.73, metalness: 0.04 });
  const oakEdge = material(THREE, { color: 0x4b2e1d, roughness: 0.63, metalness: 0.08 });
  const brass = material(THREE, { color: 0x9a7435, roughness: 0.34, metalness: 0.82 });
  const velvet = material(THREE, { color: 0x4d121e, roughness: 0.96, metalness: 0 });
  const runner = material(THREE, { color: 0x481520, roughness: 0.92, metalness: 0 });
  const glass = material(THREE, {
    color: 0x5e829d,
    emissive: 0x365d78,
    emissiveIntensity: coarse ? 0.52 : 0.68,
    roughness: 0.36,
    metalness: 0.02,
    transparent: true,
    opacity: 0.62,
  });
  const warm = material(THREE, {
    color: 0xffb061,
    emissive: 0xff7d2d,
    emissiveIntensity: 2.1,
    roughness: 0.42,
  });

  const room = new THREE.Group();
  scene.add(room);

  addBox(THREE, room, [16.2, 8.3, 0.42], [0, 2.55, -4.10], stone);
  addBox(THREE, room, [0.45, 8.2, 11.2], [-7.85, 2.25, 0.8], stone);
  addBox(THREE, room, [0.45, 8.2, 11.2], [7.85, 2.25, 0.8], stone);
  addBox(THREE, room, [16.2, 0.32, 11.2], [0, -1.14, 0.8], stoneEdge);

  for (const z of [-2.2, -0.2, 1.8, 3.8]) {
    addBox(THREE, room, [15.5, 0.025, 0.055], [0, -0.96, z], stone, [-Math.PI / 2, 0, 0]);
  }
  for (const x of [-6, -3, 0, 3, 6]) {
    addBox(THREE, room, [0.035, 0.03, 10.4], [x, -0.95, 0.8], stone, [-Math.PI / 2, 0, 0]);
  }

  addBox(THREE, room, [4.65, 0.035, 9.3], [0, -0.93, 1.45], runner);
  addBox(THREE, room, [0.075, 0.045, 9.4], [-2.38, -0.90, 1.45], brass);
  addBox(THREE, room, [0.075, 0.045, 9.4], [2.38, -0.90, 1.45], brass);

  addWindow(THREE, room, -4.45, stoneEdge, glass, brass, velvet, coarse);
  addWindow(THREE, room, 4.45, stoneEdge, glass, brass, velvet, coarse);

  for (const x of [-6.75, -2.65, 2.65, 6.75]) {
    addBox(THREE, room, [0.52, 6.15, 0.58], [x, 2.05, -3.58], stoneEdge);
    addBox(THREE, room, [0.74, 0.23, 0.78], [x, -0.91, -3.56], stoneEdge);
    addBox(THREE, room, [0.70, 0.20, 0.74], [x, 5.06, -3.56], stoneEdge);
  }

  addBox(THREE, room, [4.45, 3.05, 0.20], [0, 2.65, -3.70], oak);
  addBox(THREE, room, [4.12, 2.72, 0.11], [0, 2.65, -3.57], stone);
  const crest = new THREE.Mesh(new THREE.TorusGeometry(0.69, 0.065, 8, 34), brass);
  crest.position.set(0, 2.88, -3.42);
  room.add(crest);
  const pawnHead = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), brass);
  pawnHead.position.set(0, 3.08, -3.40);
  room.add(pawnHead);
  const pawnBody = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.34, 0.64, 14), brass);
  pawnBody.position.set(0, 2.55, -3.40);
  room.add(pawnBody);

  const table = new THREE.Group();
  table.position.set(0, -0.15, 1.55);
  room.add(table);
  addBox(THREE, table, [8.35, 0.34, 3.45], [0, 0.58, 0], oakEdge);
  addBox(THREE, table, [7.92, 0.11, 3.06], [0, 0.79, 0], oak);
  addBox(THREE, table, [7.72, 0.028, 2.85], [0, 0.86, 0], runner);
  addBox(THREE, table, [8.10, 0.08, 0.12], [0, 0.88, 1.52], brass);
  for (const x of [-3.55, 3.55]) {
    for (const z of [-1.20, 1.20]) addBox(THREE, table, [0.38, 2.05, 0.38], [x, -0.56, z], oak);
  }
  addBox(THREE, table, [7.45, 0.88, 0.24], [0, 0.02, 1.48], oak);

  const torchA = addTorch(THREE, room, -6.05, warm);
  const torchB = addTorch(THREE, room, 6.05, warm);

  scene.add(new THREE.HemisphereLight(0x8194a2, 0x1b120d, coarse ? 1.1 : 1.28));
  const key = new THREE.DirectionalLight(0xc3d8e7, coarse ? 1.2 : 1.48);
  key.position.set(-5.5, 8.2, 6.5);
  scene.add(key);
  const fill = new THREE.PointLight(0xb67446, ambience === 'honour' ? 2.2 : 1.55, 10.5, 2);
  fill.position.set(0, 4.6, 1.8);
  scene.add(fill);

  let dust = null;
  if (!coarse) {
    dust = createDust(THREE, 52);
    scene.add(dust);
  }

  let visible = true;
  let pageVisible = !document.hidden;
  let raf = 0;
  let lastFrame = 0;

  const resize = () => {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  };

  const renderFrame = (now = performance.now()) => {
    if (!visible || !pageVisible) {
      raf = 0;
      return;
    }
    if (now - lastFrame >= FRAME_INTERVAL_MS) {
      lastFrame = now;
      const t = now * 0.001;
      if (!reducedMotion) {
        torchA.intensity = 1.36 + Math.sin(t * 5.2) * 0.10 + Math.sin(t * 8.7) * 0.05;
        torchB.intensity = 1.38 + Math.sin(t * 4.8 + 1.3) * 0.11 + Math.sin(t * 9.2) * 0.04;
        fill.intensity = (ambience === 'honour' ? 2.2 : 1.55) + Math.sin(t * 0.9) * 0.05;
        if (dust) {
          dust.rotation.y = Math.sin(t * 0.08) * 0.035;
          dust.position.y = Math.sin(t * 0.17) * 0.04;
        }
      }
      renderer.render(scene, camera);
    }
    raf = window.requestAnimationFrame(renderFrame);
  };

  const start = () => {
    if (raf || reducedMotion || !visible || !pageVisible) return;
    raf = window.requestAnimationFrame(renderFrame);
  };

  const stop = () => {
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
  };

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    visible = Boolean(entry?.isIntersecting);
    if (visible) {
      resize();
      start();
    } else stop();
  }, { rootMargin: '140px' });
  intersectionObserver.observe(host);

  const onVisibility = () => {
    pageVisible = !document.hidden;
    if (pageVisible) {
      resize();
      start();
    } else stop();
  };
  document.addEventListener('visibilitychange', onVisibility);

  resize();
  if (!reducedMotion) start();
  host.dataset.homeSceneReady = 'true';

  return () => {
    stop();
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    scene.traverse((object) => {
      if (object.geometry?.dispose) object.geometry.dispose();
      if (Array.isArray(object.material)) object.material.forEach((entry) => entry?.dispose?.());
      else object.material?.dispose?.();
    });
    renderer.dispose();
    renderer.forceContextLoss?.();
    canvas.remove();
  };
}

function ScenePortal({ ambience }) {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let cancelled = false;
    let dispose = () => {};
    void import('three').then((THREE) => {
      if (cancelled || !host.isConnected) return;
      dispose = buildScene(THREE, { host, ambience });
    }).catch(() => {
      if (host.isConnected) host.dataset.homeSceneFallback = 'three-load-failed';
    });
    return () => {
      cancelled = true;
      dispose();
    };
  }, [ambience]);

  return (
    <div
      ref={hostRef}
      className="home-great-hall-scene"
      data-home-scene="three-v1"
      data-home-scene-ambience={ambience || 'quiet'}
      aria-hidden="true"
    />
  );
}

export default function HomeGreatHallScene({ ambience = 'quiet' }) {
  const [target, setTarget] = useState(null);

  useEffect(() => {
    setTarget(document.querySelector('.menu.home-friendly'));
  }, []);

  return target ? createPortal(<ScenePortal ambience={ambience} />, target) : null;
}
