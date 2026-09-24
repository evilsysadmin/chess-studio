import * as THREE from 'three';

// Soft GPU fire shared by the Home hall and every War Room variant: additive sprites that
// rise from a hearth and fade orange -> red. All motion is in the vertex shader, so the CPU
// only writes two uniforms per render (from the Points' own onBeforeRender).
export const FIRE_SPRITE_DEFAULTS = Object.freeze({
  count: 72, height: 1.15, spreadX: 0.45, spreadZ: 0.10, size: 0.38, opacity: 0.95,
});

export function fireSpriteSeeds(count = FIRE_SPRITE_DEFAULTS.count, salt = 1, spreadX = FIRE_SPRITE_DEFAULTS.spreadX, spreadZ = FIRE_SPRITE_DEFAULTS.spreadZ) {
  let state = (0x51ed270b ^ Math.imul(salt, 0x9e3779b9)) >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  return Array.from({ length: count }, () => ({
    x: (next() * 2 - 1) * spreadX,
    z: (next() * 2 - 1) * spreadZ,
    speed: 0.32 + next() * 0.38,
    phase: next(),
  }));
}

const VERTEX = `
attribute vec4 aSeed;
uniform float uTime; uniform float uHeight; uniform float uSize; uniform float uViewportH; uniform vec3 uBase;
varying float vLife;
void main() {
  float life = fract(aSeed.w + uTime * aSeed.z);
  vec3 p = uBase + vec3(aSeed.x * (1.0 - life * 0.55) + sin(uTime * 2.3 + aSeed.w * 31.0) * 0.05 * life,
    life * uHeight, aSeed.y * (1.0 - life * 0.4));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.0, uSize * (1.0 - life * 0.55) * projectionMatrix[1][1] * uViewportH * 0.5 / -mv.z);
  vLife = life;
}`;

const FRAGMENT = `
uniform float uOpacity; varying float vLife;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d);
  vec3 col = mix(vec3(1.0, 0.86, 0.42), vec3(0.85, 0.20, 0.04), smoothstep(0.0, 1.0, vLife));
  float alpha = a * (1.0 - vLife) * smoothstep(0.0, 0.10, vLife) * uOpacity;
  gl_FragColor = vec4(col, alpha);
}`;

const nowSeconds = (renderer) => {
  const motion = renderer?.userData?.board3DMotionNowMs;
  return (Number.isFinite(motion) ? motion : (globalThis.performance?.now?.() ?? Date.now())) / 1000;
};

/**
 * Build one hearth's fire. `base` is the local position where the flame roots (a child of
 * `parent` keeps it attached to the fireplace); dims are in the parent's units.
 */
export function createFireSprites({
  base = [0, 0, 0], salt = 1, name = 'fire-sprites', coarsePointer = false, ...overrides
} = {}) {
  const cfg = { ...FIRE_SPRITE_DEFAULTS, ...overrides };
  const count = Math.max(8, Math.round(cfg.count * (coarsePointer ? 0.5 : 1)));
  const seeds = fireSpriteSeeds(count, salt, cfg.spreadX, cfg.spreadZ);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(seeds.flatMap((sd) => [sd.x, sd.z, sd.speed, sd.phase])), 4));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uHeight: { value: cfg.height }, uSize: { value: cfg.size },
      uViewportH: { value: 900 }, uBase: { value: new THREE.Vector3(...base) }, uOpacity: { value: cfg.opacity },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  });
  const points = new THREE.Points(geometry, material);
  points.name = name;
  points.frustumCulled = false;
  points.renderOrder = 6;
  points.onBeforeRender = (renderer) => {
    material.uniforms.uTime.value = nowSeconds(renderer);
    material.uniforms.uViewportH.value = renderer?.domElement?.height || 900;
  };
  return points;
}

export function disposeFireSprites(points) {
  points?.parent?.remove?.(points);
  points?.geometry?.dispose?.();
  points?.material?.dispose?.();
}

// Coffee steam: a few large, very faint puffs that drift up, swell and dissolve (normal
// blending, gaussian falloff), replacing the hard-edged baked wisp mesh.
export const STEAM_SPRITE_DEFAULTS = Object.freeze({
  count: 14, height: 0.50, spread: 0.030, size: 0.22, opacity: 0.50,
});

const STEAM_VERTEX = `
attribute vec4 aSeed;
uniform float uTime; uniform float uHeight; uniform float uSize; uniform float uViewportH; uniform vec3 uBase;
varying float vLife;
void main() {
  float life = fract(aSeed.w + uTime * aSeed.z * 0.30);
  float sway = sin(uTime * 0.9 + aSeed.w * 6.2831) * 0.05 * (0.3 + life) + sin(uTime * 0.47 + aSeed.x * 40.0) * 0.03 * life;
  vec3 p = uBase + vec3(aSeed.x + sway, life * uHeight, aSeed.y + cos(uTime * 0.7 + aSeed.w * 5.0) * 0.02 * life);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.0, uSize * (0.55 + life * 1.7) * projectionMatrix[1][1] * uViewportH * 0.5 / -mv.z);
  vLife = life;
}`;

const STEAM_FRAGMENT = `
uniform float uOpacity; varying float vLife;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = exp(-dot(c, c) * 14.0);
  float fade = smoothstep(0.0, 0.16, vLife) * (1.0 - smoothstep(0.50, 1.0, vLife));
  gl_FragColor = vec4(vec3(0.95, 0.93, 0.90), a * fade * uOpacity);
}`;

export function createSteamSprites({ base = [0, 0, 0], salt = 1, name = 'steam-sprites', ...overrides } = {}) {
  const cfg = { ...STEAM_SPRITE_DEFAULTS, ...overrides };
  const seeds = fireSpriteSeeds(cfg.count, salt, cfg.spread, cfg.spread);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cfg.count * 3), 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(seeds.flatMap((sd) => [sd.x, sd.z, sd.speed, sd.phase])), 4));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 }, uHeight: { value: cfg.height }, uSize: { value: cfg.size },
      uViewportH: { value: 900 }, uBase: { value: new THREE.Vector3(...base) }, uOpacity: { value: cfg.opacity },
    },
    vertexShader: STEAM_VERTEX,
    fragmentShader: STEAM_FRAGMENT,
  });
  const points = new THREE.Points(geometry, material);
  points.name = name;
  points.frustumCulled = false;
  points.renderOrder = 7;
  points.onBeforeRender = (renderer) => {
    material.uniforms.uTime.value = nowSeconds(renderer);
    material.uniforms.uViewportH.value = renderer?.domElement?.height || 900;
  };
  return points;
}
