import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const DESKTOP_DPR_CAP = 1.1;
const MOBILE_DPR_CAP = 1;

function standardMaterial(THREE, options) {
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
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    mat,
  );
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function addHalfArch(THREE, parent, radius, tube, position, mat, scaleX = 1) {
  const arch = new THREE.Mesh(
    new THREE.TorusGeometry(radius, tube, 8, 30, Math.PI),
    mat,
  );
  arch.position.set(...position);
  arch.rotation.z = Math.PI;
  arch.scale.x = scaleX;
  parent.add(arch);
  return arch;
}

function addStonePier(THREE, parent, x, stone, stoneEdge, scale = 1) {
  const pier = new THREE.Group();
  pier.position.set(x, 0, -3.92);
  pier.scale.setScalar(scale);
  parent.add(pier);

  addBox(THREE, pier, [0.62, 6.72, 0.68], [0, 2.15, 0], stoneEdge);
  addBox(THREE, pier, [0.92, 0.28, 0.88], [0, -1.02, 0.02], stone);
  addBox(THREE, pier, [0.86, 0.22, 0.82], [0, 5.28, 0.02], stone);

  for (const y of [-0.55, 0.65, 1.85, 3.05, 4.25]) {
    addBox(THREE, pier, [0.68, 0.035, 0.72], [0, y, 0.04], stone);
  }
}

function addLancetWindow(THREE, parent, {
  x,
  y = 1.95,
  width = 1.36,
  height = 3.85,
  stone,
  stoneEdge,
  glass,
  oak,
  brass,
}) {
  const group = new THREE.Group();
  group.position.set(x, y, -4.08);
  parent.add(group);

  const depth = 0.52;
  const half = width / 2;

  addBox(THREE, group, [width + 0.72, height + 0.62, depth], [0, 0, -0.20], stone);
  addBox(THREE, group, [width, height, 0.18], [0, 0, 0.10], glass);

  addBox(THREE, group, [0.22, height + 0.18, 0.54], [-half - 0.17, 0, 0], stoneEdge);
  addBox(THREE, group, [0.22, height + 0.18, 0.54], [half + 0.17, 0, 0], stoneEdge);
  addBox(THREE, group, [width + 0.54, 0.24, 0.54], [0, -(height / 2) - 0.12, 0], stoneEdge);

  addHalfArch(
    THREE,
    group,
    half + 0.16,
    0.13,
    [0, height / 2 - 0.03, 0.04],
    stoneEdge,
    1,
  );

  addBox(THREE, group, [0.075, height - 0.10, 0.16], [0, -0.05, 0.23], oak);
  addBox(THREE, group, [width - 0.08, 0.06, 0.16], [0, 0.35, 0.23], brass);

  const sill = addBox(
    THREE,
    group,
    [width + 0.82, 0.28, 0.78],
    [0, -(height / 2) - 0.17, 0.18],
    stoneEdge,
  );
  sill.rotation.x = -0.03;
}

function addFireplace(THREE, parent, {
  x = -0.35,
  stone,
  stoneEdge,
  oak,
  ember,
  brass,
}) {
  const hearth = new THREE.Group();
  hearth.position.set(x, 0, -3.75);
  parent.add(hearth);

  addBox(THREE, hearth, [3.55, 0.34, 1.05], [0, -0.92, 0.42], stoneEdge);
  addBox(THREE, hearth, [3.05, 3.88, 0.62], [0, 1.06, -0.02], stone);
  addBox(THREE, hearth, [2.18, 2.42, 0.32], [0, 0.68, 0.34], standardMaterial(THREE, {
    color: 0x0b0907,
    roughness: 1,
    metalness: 0,
  }));

  addBox(THREE, hearth, [0.54, 3.54, 0.82], [-1.52, 0.86, 0.04], stoneEdge);
  addBox(THREE, hearth, [0.54, 3.54, 0.82], [1.52, 0.86, 0.04], stoneEdge);
  addBox(THREE, hearth, [3.74, 0.36, 1.02], [0, 2.76, 0.02], stoneEdge);
  addHalfArch(THREE, hearth, 1.13, 0.24, [0, 1.82, 0.38], stoneEdge, 1.06);

  addBox(THREE, hearth, [1.58, 0.16, 0.22], [0, -0.34, 0.62], oak, [0, 0.05, 0.02]);
  addBox(THREE, hearth, [1.36, 0.15, 0.20], [0.18, -0.18, 0.64], oak, [0, -0.08, -0.02]);

  for (const [xOffset, yOffset, scale] of [
    [-0.42, 0.02, 1.0],
    [0.05, 0.14, 1.24],
    [0.46, 0.02, 0.92],
  ]) {
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), ember);
    flame.position.set(xOffset, yOffset, 0.72);
    flame.scale.set(0.74 * scale, 1.6 * scale, 0.74 * scale);
    hearth.add(flame);
  }

  const grate = addBox(THREE, hearth, [1.74, 0.10, 0.10], [0, -0.12, 0.84], brass);
  grate.rotation.z = 0.03;
}

function addTapestry(THREE, parent, {
  x,
  y,
  velvet,
  brass,
  oak,
  scale = 1,
}) {
  const group = new THREE.Group();
  group.position.set(x, y, -3.63);
  group.scale.setScalar(scale);
  parent.add(group);

  addBox(THREE, group, [1.55, 2.70, 0.055], [0, 0, 0], velvet);
  addBox(THREE, group, [1.80, 0.09, 0.12], [0, 1.42, 0.08], oak);

  for (const xOffset of [-0.45, 0, 0.45]) {
    addBox(THREE, group, [0.055, 2.46, 0.035], [xOffset, -0.04, 0.05], brass);
  }

  const crest = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.045, 8, 22), brass);
  crest.position.set(0, 0.30, 0.10);
  group.add(crest);
}

function addBench(THREE, parent, {
  x,
  z,
  oak,
  oakEdge,
  scale = 1,
  rotationY = 0,
}) {
  const group = new THREE.Group();
  group.position.set(x, -0.45, z);
  group.rotation.y = rotationY;
  group.scale.setScalar(scale);
  parent.add(group);

  addBox(THREE, group, [2.35, 0.18, 0.72], [0, 0.50, 0], oakEdge);
  addBox(THREE, group, [2.18, 0.14, 0.60], [0, 0.64, 0], oak);
  addBox(THREE, group, [2.26, 1.05, 0.14], [0, 1.10, 0.31], oakEdge);

  for (const legX of [-0.92, 0.92]) {
    addBox(THREE, group, [0.15, 0.88, 0.15], [legX, 0.06, -0.23], oak);
    addBox(THREE, group, [0.15, 0.88, 0.15], [legX, 0.06, 0.23], oak);
  }
}

function addSideboard(THREE, parent, {
  x,
  z,
  oak,
  oakEdge,
  brass,
  parchment,
}) {
  const group = new THREE.Group();
  group.position.set(x, -0.34, z);
  group.rotation.y = -0.12;
  parent.add(group);

  addBox(THREE, group, [2.30, 1.34, 0.72], [0, 0.44, 0], oak);
  addBox(THREE, group, [2.46, 0.18, 0.84], [0, 1.18, 0], oakEdge);

  for (const legX of [-0.92, 0.92]) {
    addBox(THREE, group, [0.16, 0.84, 0.16], [legX, -0.34, -0.24], oakEdge);
    addBox(THREE, group, [0.16, 0.84, 0.16], [legX, -0.34, 0.24], oakEdge);
  }

  addBox(THREE, group, [0.90, 0.05, 0.52], [-0.45, 1.30, 0.05], parchment, [0.03, 0.06, -0.04]);

  const cup = addCylinder(THREE, group, 0.14, 0.16, 0.28, [0.66, 1.36, -0.02], brass, 12);
  cup.rotation.z = 0.03;
}

function addTorch(THREE, parent, {
  x,
  y,
  warmMaterial,
  brass,
  wallGlowColor = 0xff8b32,
  side = 1,
}) {
  const group = new THREE.Group();
  group.position.set(x, y, -3.46);
  parent.add(group);

  const bracket = addBox(THREE, group, [0.10, 0.74, 0.10], [0, 0, 0], brass);
  bracket.rotation.z = side * 0.25;

  addCylinder(THREE, group, 0.19, 0.11, 0.17, [0, 0.43, 0], brass, 10);

  const ember = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), warmMaterial);
  ember.scale.set(0.82, 1.55, 0.82);
  ember.position.set(0, 0.66, 0);
  group.add(ember);

  const light = new THREE.PointLight(wallGlowColor, 2.55, 5.8, 2.0);
  light.position.set(0, 0.72, 0.58);
  group.add(light);
}

function addCandle(THREE, parent, {
  x,
  z,
  brass,
  wax,
  warmMaterial,
}) {
  const group = new THREE.Group();
  group.position.set(x, 0.86, z);
  parent.add(group);

  addCylinder(THREE, group, 0.08, 0.11, 0.32, [0, 0.14, 0], brass, 10);
  addCylinder(THREE, group, 0.052, 0.052, 0.24, [0, 0.42, 0], wax, 10);

  const ember = new THREE.Mesh(new THREE.SphereGeometry(0.052, 8, 6), warmMaterial);
  ember.scale.set(0.72, 1.45, 0.72);
  ember.position.set(0, 0.60, 0);
  group.add(ember);
}

function createDust(THREE, count) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 15;
    positions[i * 3 + 1] = Math.random() * 6.4 - 0.5;
    positions[i * 3 + 2] = Math.random() * 7.0 - 2.4;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0xcbb890,
      size: 0.020,
      transparent: true,
      opacity: 0.20,
      depthWrite: false,
    }),
  );
}

function buildScene(THREE, { host, ambience }) {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
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
  renderer.toneMappingExposure = coarse ? 0.96 : 1.02;
  renderer.shadowMap.enabled = false;
  renderer.setPixelRatio(Math.min(
    window.devicePixelRatio || 1,
    coarse ? MOBILE_DPR_CAP : DESKTOP_DPR_CAP,
  ));
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0d0f, coarse ? 0.042 : 0.030);

  const camera = new THREE.PerspectiveCamera(coarse ? 45 : 35, 1, 0.1, 55);
  camera.position.set(coarse ? 0.18 : 0.48, coarse ? 4.10 : 3.72, coarse ? 12.9 : 11.2);
  camera.lookAt(-0.18, 1.48, -0.35);

  const stone = standardMaterial(THREE, {
    color: 0x34322d,
    roughness: 0.96,
    metalness: 0.01,
  });
  const stoneEdge = standardMaterial(THREE, {
    color: 0x565149,
    roughness: 0.92,
    metalness: 0.02,
  });
  const deepStone = standardMaterial(THREE, {
    color: 0x1d1d1a,
    roughness: 0.98,
    metalness: 0.01,
  });
  const oak = standardMaterial(THREE, {
    color: 0x29170d,
    roughness: 0.76,
    metalness: 0.02,
  });
  const oakEdge = standardMaterial(THREE, {
    color: 0x4a2a16,
    roughness: 0.68,
    metalness: 0.04,
  });
  const brass = standardMaterial(THREE, {
    color: 0x9f7934,
    roughness: 0.34,
    metalness: 0.78,
  });
  const velvet = standardMaterial(THREE, {
    color: 0x4e1118,
    roughness: 0.98,
    metalness: 0,
  });
  const runner = standardMaterial(THREE, {
    color: 0x3e1118,
    roughness: 0.94,
    metalness: 0,
  });
  const parchment = standardMaterial(THREE, {
    color: 0xb5a07a,
    roughness: 0.94,
    metalness: 0,
  });
  const wax = standardMaterial(THREE, {
    color: 0xd6c9a8,
    roughness: 0.88,
    metalness: 0,
  });
  const glass = standardMaterial(THREE, {
    color: 0x3d586a,
    emissive: 0x172a37,
    emissiveIntensity: coarse ? 0.36 : 0.48,
    roughness: 0.48,
    metalness: 0.01,
    transparent: true,
    opacity: 0.72,
  });
  const ember = standardMaterial(THREE, {
    color: 0xffbd72,
    emissive: 0xff7a28,
    emissiveIntensity: 2.8,
    roughness: 0.34,
  });

  const room = new THREE.Group();
  scene.add(room);

  addBox(THREE, room, [18.2, 9.0, 0.62], [0, 2.55, -4.52], stone);
  addBox(THREE, room, [0.72, 9.0, 12.8], [-8.55, 2.35, 0.78], deepStone, [0, -0.025, 0]);
  addBox(THREE, room, [0.72, 9.0, 12.8], [8.55, 2.35, 0.78], deepStone, [0, 0.025, 0]);
  addBox(THREE, room, [18.0, 0.38, 12.7], [0, -1.20, 0.90], deepStone);

  for (const y of [-0.58, 0.62, 1.82, 3.02, 4.22]) {
    addBox(THREE, room, [17.6, 0.035, 0.08], [0, y, -4.18], stoneEdge);
  }

  for (const x of [-7.6, -4.0, 0.0, 4.0, 7.6]) {
    addBox(THREE, room, [0.04, 0.035, 12.0], [x, -0.99, 0.92], stoneEdge, [-Math.PI / 2, 0, 0]);
  }
  for (const z of [-2.8, -0.5, 1.8, 4.1]) {
    addBox(THREE, room, [17.2, 0.025, 0.045], [0, -0.985, z], stoneEdge, [-Math.PI / 2, 0, 0]);
  }

  addBox(THREE, room, [4.25, 0.035, 10.5], [-0.18, -0.95, 1.15], runner);

  addStonePier(THREE, room, -7.15, stone, stoneEdge, 1.04);
  addStonePier(THREE, room, -2.90, stone, stoneEdge, 1.08);
  addStonePier(THREE, room, 3.28, stone, stoneEdge, 1.10);
  addStonePier(THREE, room, 7.05, stone, stoneEdge, 1.02);

  addHalfArch(THREE, room, 2.10, 0.20, [-5.05, 5.22, -3.89], stoneEdge, 1.08);
  addHalfArch(THREE, room, 2.34, 0.20, [0.20, 5.16, -3.89], stoneEdge, 1.18);
  addHalfArch(THREE, room, 1.84, 0.20, [5.16, 5.20, -3.89], stoneEdge, 1.02);

  addLancetWindow(THREE, room, {
    x: -5.18,
    y: 2.02,
    width: 1.42,
    height: 3.92,
    stone,
    stoneEdge,
    glass,
    oak,
    brass,
  });
  addLancetWindow(THREE, room, {
    x: 5.26,
    y: 2.12,
    width: 1.30,
    height: 4.15,
    stone,
    stoneEdge,
    glass,
    oak,
    brass,
  });

  addFireplace(THREE, room, {
    x: -0.35,
    stone,
    stoneEdge,
    oak,
    ember,
    brass,
  });

  addTapestry(THREE, room, {
    x: 7.65,
    y: 2.95,
    velvet,
    brass,
    oak,
    scale: 0.78,
  });

  addBench(THREE, room, {
    x: -5.55,
    z: -1.75,
    oak,
    oakEdge,
    scale: 0.88,
    rotationY: 0.12,
  });
  addSideboard(THREE, room, {
    x: 5.72,
    z: -1.72,
    oak,
    oakEdge,
    brass,
    parchment,
  });

  const table = new THREE.Group();
  table.position.set(0.45, -0.28, 2.65);
  table.rotation.y = -0.055;
  room.add(table);

  addBox(THREE, table, [8.8, 0.34, 3.05], [0, 0.48, 0], oakEdge);
  addBox(THREE, table, [8.52, 0.10, 2.80], [0, 0.70, 0], oak);
  addBox(THREE, table, [2.25, 0.025, 2.45], [-0.55, 0.77, 0.05], runner);

  for (const x of [-3.72, 3.72]) {
    for (const z of [-1.05, 1.05]) {
      addBox(THREE, table, [0.36, 1.86, 0.36], [x, -0.54, z], oak);
    }
  }

  addCandle(THREE, table, { x: -3.0, z: -0.70, brass, wax, warmMaterial: ember });
  addCandle(THREE, table, { x: 2.65, z: 0.72, brass, wax, warmMaterial: ember });
  addBox(THREE, table, [1.30, 0.05, 0.84], [-1.72, 0.81, 0.54], parchment, [0.03, 0.10, -0.05]);
  addCylinder(THREE, table, 0.13, 0.13, 1.02, [1.38, 0.82, 0.68], oakEdge, 14).rotation.z = Math.PI / 2;

  addTorch(THREE, room, {
    x: -7.62,
    y: 1.78,
    warmMaterial: ember,
    brass,
    side: -1,
  });
  addTorch(THREE, room, {
    x: 3.92,
    y: 1.82,
    warmMaterial: ember,
    brass,
    side: 1,
  });
  addTorch(THREE, room, {
    x: 7.72,
    y: 1.70,
    warmMaterial: ember,
    brass,
    side: 1,
  });

  const hearthLight = new THREE.PointLight(
    0xff8734,
    ambience === 'honour' ? 4.6 : 4.0,
    8.0,
    2.0,
  );
  hearthLight.position.set(-0.35, 0.75, -2.65);
  scene.add(hearthLight);

  scene.add(new THREE.HemisphereLight(0x526879, 0x1b120c, coarse ? 0.76 : 0.90));

  const moon = new THREE.DirectionalLight(0x809aae, coarse ? 0.62 : 0.78);
  moon.position.set(-5.0, 7.8, 5.2);
  scene.add(moon);

  const warmFill = new THREE.DirectionalLight(0xb46a32, ambience === 'honour' ? 0.74 : 0.60);
  warmFill.position.set(3.8, 4.8, 3.0);
  scene.add(warmFill);

  if (!coarse) scene.add(createDust(THREE, 42));

  let renderRaf = 0;
  let lastWidth = 0;
  let lastHeight = 0;

  const renderScene = () => {
    renderRaf = 0;
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);

    if (width !== lastWidth || height !== lastHeight) {
      lastWidth = width;
      lastHeight = height;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    renderer.render(scene, camera);
  };

  const scheduleRender = () => {
    if (renderRaf || document.hidden) return;
    renderRaf = window.requestAnimationFrame(renderScene);
  };

  const resizeObserver = new ResizeObserver(scheduleRender);
  resizeObserver.observe(host);

  const intersectionObserver = new IntersectionObserver(([entry]) => {
    if (entry?.isIntersecting) scheduleRender();
  }, { rootMargin: '140px' });
  intersectionObserver.observe(host);

  const onVisibility = () => {
    if (!document.hidden) scheduleRender();
  };
  document.addEventListener('visibilitychange', onVisibility);

  renderScene();
  host.dataset.homeSceneReady = 'true';
  host.dataset.homeSceneRenderMode = 'on-demand';
  host.dataset.homeSceneArchitecture = 'inhabited-great-hall-v2';

  return () => {
    if (renderRaf) window.cancelAnimationFrame(renderRaf);
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);

    scene.traverse((object) => {
      if (object.geometry?.dispose) object.geometry.dispose();
      if (Array.isArray(object.material)) {
        object.material.forEach((entry) => entry?.dispose?.());
      } else {
        object.material?.dispose?.();
      }
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
      data-home-scene="three-v3-inhabited-great-hall"
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
