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

function addCylinder(THREE, parent, radiusTop, radiusBottom, height, position, mat, segments = 12) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), mat);
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function addWindow(THREE, parent, x, stone, glass, brass, velvet, mobile) {
  const frame = new THREE.Group();
  frame.position.x = x;
  parent.add(frame);

  addBox(THREE, frame, [2.46, 4.45, 0.16], [0, 2.10, -4.18], glass);
  addBox(THREE, frame, [0.22, 4.78, 0.28], [-1.28, 2.14, -4.02], stone);
  addBox(THREE, frame, [0.22, 4.78, 0.28], [1.28, 2.14, -4.02], stone);
  addBox(THREE, frame, [2.78, 0.24, 0.28], [0, -0.19, -4.02], stone);

  const arch = new THREE.Mesh(new THREE.TorusGeometry(1.28, 0.13, 8, 28, Math.PI), stone);
  arch.position.set(0, 4.34, -4.02);
  arch.rotation.z = Math.PI;
  frame.add(arch);

  addBox(THREE, frame, [0.10, 4.43, 0.12], [0, 2.11, -3.94], brass);
  addBox(THREE, frame, [2.40, 0.08, 0.12], [0, 1.72, -3.94], brass);
  addBox(THREE, frame, [2.40, 0.08, 0.12], [0, 3.08, -3.94], brass);

  const curtainOffset = 1.50;
  const foldCount = mobile ? 2 : 4;
  for (const side of [-1, 1]) {
    for (let i = 0; i < foldCount; i += 1) {
      const radius = mobile ? 0.12 : 0.15;
      const fold = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius * 1.08, 5.25, 8, 1, false),
        velvet,
      );
      const outward = i * 0.15;
      fold.position.set(
        side * (curtainOffset + outward),
        1.95,
        -3.80 + (i % 2) * 0.07,
      );
      frame.add(fold);
    }
  }
  addBox(THREE, frame, [3.72, 0.28, 0.24], [0, 4.79, -3.77], velvet);
  addBox(THREE, frame, [3.90, 0.07, 0.07], [0, 5.01, -3.68], brass);
}

function addBanner(THREE, parent, x, y, velvet, brass, scale = 1) {
  const group = new THREE.Group();
  group.position.set(x, y, -3.78);
  group.scale.setScalar(scale);
  parent.add(group);

  addBox(THREE, group, [1.16, 2.55, 0.06], [0, 0, 0], velvet);
  addBox(THREE, group, [1.32, 0.07, 0.10], [0, 1.34, 0.07], brass);
  addCylinder(THREE, group, 0.10, 0.10, 0.42, [0, 0.28, 0.08], brass, 12);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 9), brass);
  head.position.set(0, 0.60, 0.08);
  group.add(head);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.035, 7, 22), brass);
  ring.position.set(0, 0.32, 0.08);
  group.add(ring);
}

function addChair(THREE, parent, x, z, oak, brass, scale = 1) {
  const group = new THREE.Group();
  group.position.set(x, -0.13, z);
  group.scale.setScalar(scale);
  parent.add(group);

  addBox(THREE, group, [1.20, 0.16, 1.08], [0, 0.52, 0], oak);
  addBox(THREE, group, [1.34, 2.18, 0.18], [0, 1.55, 0.43], oak);
  addBox(THREE, group, [1.48, 0.16, 0.24], [0, 2.70, 0.43], brass);
  for (const legX of [-.48, .48]) {
    addBox(THREE, group, [.14, 1.0, .14], [legX, .02, -.36], oak);
    addBox(THREE, group, [.14, 1.0, .14], [legX, .02, .36], oak);
  }
  const crest = new THREE.Mesh(new THREE.SphereGeometry(.14, 10, 8), brass);
  crest.position.set(0, 2.88, .43);
  group.add(crest);
}

function addCandle(THREE, parent, x, z, brass, warm) {
  const group = new THREE.Group();
  group.position.set(x, .82, z);
  parent.add(group);
  addCylinder(THREE, group, .08, .11, .34, [0, .16, 0], brass, 10);
  addCylinder(THREE, group, .055, .055, .25, [0, .44, 0], material(THREE, { color: 0xd7c7a1, roughness: .82 }), 10);
  const ember = new THREE.Mesh(new THREE.SphereGeometry(.055, 8, 6), warm);
  ember.scale.set(.78, 1.45, .78);
  ember.position.set(0, .61, 0);
  group.add(ember);
}

function addTorch(THREE, parent, x, y, warmMaterial, side = 1) {
  const group = new THREE.Group();
  group.position.set(x, y, -3.54);
  parent.add(group);

  const bracket = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.64, 0.09),
    new THREE.MeshStandardMaterial({ color: 0x7b5b2d, metalness: 0.72, roughness: 0.32 }),
  );
  bracket.rotation.z = side * 0.25;
  group.add(bracket);

  const bowl = new THREE.Mesh(
    new THREE.CylinderGeometry(.18, .10, .16, 10),
    new THREE.MeshStandardMaterial({ color: 0x6f5229, metalness: .72, roughness: .34 }),
  );
  bowl.position.y = .38;
  group.add(bowl);

  const ember = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), warmMaterial);
  ember.scale.set(.82, 1.45, .82);
  ember.position.y = 0.58;
  group.add(ember);

  const light = new THREE.PointLight(0xffa047, 1.55, 5.8, 2);
  light.position.set(0, 0.62, 0.26);
  group.add(light);
  return light;
}

function createDust(THREE, count) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 14;
    positions[i * 3 + 1] = Math.random() * 6.2 - 0.6;
    positions[i * 3 + 2] = Math.random() * 7.8 - 2.6;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0xd3bb8b,
      size: 0.022,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
    }),
  );
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
  renderer.toneMappingExposure = coarse ? .98 : 1.07;
  renderer.shadowMap.enabled = false;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? MOBILE_DPR_CAP : DESKTOP_DPR_CAP));
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x071018, coarse ? 0.046 : 0.034);

  const camera = new THREE.PerspectiveCamera(coarse ? 43 : 34, 1, 0.1, 55);
  camera.position.set(0, coarse ? 4.25 : 3.86, coarse ? 12.7 : 10.7);
  camera.lookAt(0, 1.62, -0.35);

  const stone = material(THREE, { color: 0x242a2d, roughness: 0.93, metalness: 0.03 });
  const stoneEdge = material(THREE, { color: 0x444743, roughness: 0.86, metalness: 0.05 });
  const oak = material(THREE, { color: 0x25150d, roughness: 0.71, metalness: 0.04 });
  const oakEdge = material(THREE, { color: 0x56331d, roughness: 0.60, metalness: 0.09 });
  const brass = material(THREE, { color: 0xb98a35, roughness: 0.30, metalness: 0.84 });
  const velvet = material(THREE, { color: 0x59111f, roughness: 0.96, metalness: 0 });
  const runner = material(THREE, { color: 0x4b1320, roughness: 0.91, metalness: 0 });
  const glass = material(THREE, {
    color: 0x6f9bc0,
    emissive: 0x315f82,
    emissiveIntensity: coarse ? 0.72 : 1.08,
    roughness: 0.34,
    metalness: 0.01,
    transparent: true,
    opacity: 0.76,
  });
  const warm = material(THREE, {
    color: 0xffb366,
    emissive: 0xff7b25,
    emissiveIntensity: 2.55,
    roughness: 0.38,
  });

  const room = new THREE.Group();
  scene.add(room);

  addBox(THREE, room, [17.4, 8.8, 0.48], [0, 2.62, -4.46], stone);
  addBox(THREE, room, [0.55, 8.8, 12.2], [-8.35, 2.45, 0.85], stone);
  addBox(THREE, room, [0.55, 8.8, 12.2], [8.35, 2.45, 0.85], stone);
  addBox(THREE, room, [17.5, 0.34, 12.6], [0, -1.18, 0.95], stoneEdge);

  for (const z of [-3.0, -1.0, 1.0, 3.0, 5.0]) {
    addBox(THREE, room, [16.9, 0.025, 0.05], [0, -0.995, z], stone, [-Math.PI / 2, 0, 0]);
  }
  for (const x of [-6.4, -3.2, 0, 3.2, 6.4]) {
    addBox(THREE, room, [0.035, 0.03, 11.8], [x, -0.99, .8], stone, [-Math.PI / 2, 0, 0]);
  }

  addBox(THREE, room, [5.35, 0.035, 10.8], [0, -0.955, 1.2], runner);
  addBox(THREE, room, [0.075, 0.045, 10.9], [-2.72, -0.92, 1.2], brass);
  addBox(THREE, room, [0.075, 0.045, 10.9], [2.72, -0.92, 1.2], brass);

  addWindow(THREE, room, -4.95, stoneEdge, glass, brass, velvet, coarse);
  addWindow(THREE, room, 0, stoneEdge, glass, brass, velvet, coarse);
  addWindow(THREE, room, 4.95, stoneEdge, glass, brass, velvet, coarse);

  for (const x of [-7.2, -2.48, 2.48, 7.2]) {
    addBox(THREE, room, [0.54, 6.55, 0.62], [x, 2.1, -3.85], stoneEdge);
    addBox(THREE, room, [0.80, 0.24, 0.82], [x, -0.91, -3.82], stoneEdge);
    addBox(THREE, room, [0.76, 0.20, 0.78], [x, 5.24, -3.82], stoneEdge);
  }

  addBanner(THREE, room, -2.50, 3.0, velvet, brass, .82);
  addBanner(THREE, room, 2.50, 3.0, velvet, brass, .82);
  addBanner(THREE, room, -7.46, 2.8, velvet, brass, .72);
  addBanner(THREE, room, 7.46, 2.8, velvet, brass, .72);

  addChair(THREE, room, 0, -2.48, oakEdge, brass, 1.08);
  addChair(THREE, room, -4.0, -2.68, oakEdge, brass, .82);
  addChair(THREE, room, 4.0, -2.68, oakEdge, brass, .82);

  const table = new THREE.Group();
  table.position.set(0, -0.20, 2.06);
  room.add(table);
  addBox(THREE, table, [11.45, 0.38, 3.75], [0, 0.54, 0], oakEdge);
  addBox(THREE, table, [11.08, 0.11, 3.36], [0, 0.78, 0], oak);
  addBox(THREE, table, [10.74, 0.026, 3.06], [0, 0.86, 0], runner);
  addBox(THREE, table, [11.15, 0.09, 0.14], [0, 0.89, 1.67], brass);
  for (const x of [-4.95, 4.95]) {
    for (const z of [-1.33, 1.33]) addBox(THREE, table, [0.42, 2.10, 0.42], [x, -0.58, z], oak);
  }
  addBox(THREE, table, [10.55, 0.94, 0.28], [0, -0.03, 1.61], oakEdge);

  for (const [x, z] of [[-4.5, -1.1], [-2.9, 1.0], [2.9, 1.0], [4.5, -1.1]]) {
    addCandle(THREE, table, x, z, brass, warm);
  }
  addBox(THREE, table, [1.75, .06, 1.05], [-3.65, .90, .55], material(THREE, { color: 0xbca879, roughness: .92 }));
  addBox(THREE, table, [1.28, .07, .82], [3.65, .91, .48], material(THREE, { color: 0x8e6b48, roughness: .88 }));
  addCylinder(THREE, table, .14, .14, 1.18, [-1.45, .92, 1.05], oakEdge, 14).rotation.z = Math.PI / 2;

  const torchLights = [
    addTorch(THREE, room, -6.75, 1.72, warm, -1),
    addTorch(THREE, room, -2.85, 1.58, warm, -1),
    addTorch(THREE, room, 2.85, 1.58, warm, 1),
    addTorch(THREE, room, 6.75, 1.72, warm, 1),
  ];

  scene.add(new THREE.HemisphereLight(0x7898b0, 0x1d1009, coarse ? 1.18 : 1.38));
  const key = new THREE.DirectionalLight(0xbfdcf0, coarse ? 1.35 : 1.72);
  key.position.set(-5.8, 8.5, 6.0);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x688fb2, coarse ? .62 : .82);
  rim.position.set(6.5, 6.2, -1.5);
  scene.add(rim);
  const fill = new THREE.PointLight(0xc57d3f, ambience === 'honour' ? 2.75 : 2.15, 12.5, 2);
  fill.position.set(0, 4.5, 2.4);
  scene.add(fill);

  let dust = null;
  if (!coarse) {
    dust = createDust(THREE, 58);
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
        torchLights.forEach((light, index) => {
          light.intensity = 1.50
            + Math.sin(t * (4.6 + index * .34) + index * 1.07) * .11
            + Math.sin(t * (8.2 + index * .28) + index * .41) * .045;
        });
        fill.intensity = (ambience === 'honour' ? 2.75 : 2.15) + Math.sin(t * .83) * .06;
        if (dust) {
          dust.rotation.y = Math.sin(t * .08) * .035;
          dust.position.y = Math.sin(t * .17) * .045;
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
      data-home-scene="three-v2-approved-mock"
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
