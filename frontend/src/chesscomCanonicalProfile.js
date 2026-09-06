export const CHESSCOM_CANONICAL_SCENE = 'dust-veil-canonical-v1';

export function chesscomCanonicalQualityProfile({
  coarse = false,
  dpr = 1,
  maxTextureSize = 4096,
  webglVersion = 2,
} = {}) {
  const constrained = coarse || maxTextureSize < 4096 || webglVersion < 2;
  if (constrained) {
    return Object.freeze({
      tier:'balanced',
      puddles:4,
      cables:1,
      extraLights:1,
      lightIntensity:2.4,
      fogDensity:.0105,
      contrast:1.20,
      exposure:.94,
      wetness:.72,
    });
  }

  const denseDisplay = Number(dpr) >= 2.25;
  return Object.freeze({
    tier:denseDisplay ? 'high' : 'ultra',
    puddles:denseDisplay ? 6 : 9,
    cables:denseDisplay ? 2 : 3,
    extraLights:denseDisplay ? 2 : 3,
    lightIntensity:denseDisplay ? 3.2 : 3.8,
    fogDensity:.009,
    contrast:1.18,
    exposure:.98,
    wetness:denseDisplay ? .82 : .90,
  });
}

export const CHESSCOM_CANONICAL_PUDDLES = Object.freeze([
  Object.freeze({ x:-5.2, z:-4.25, w:2.9, h:1.15, r:-.24 }),
  Object.freeze({ x:-3.1, z:-1.75, w:2.35, h:.92, r:.31 }),
  Object.freeze({ x:-.95, z:3.95, w:2.55, h:1.05, r:-.12 }),
  Object.freeze({ x:1.85, z:4.42, w:2.1, h:.84, r:.22 }),
  Object.freeze({ x:3.65, z:2.55, w:2.65, h:1.05, r:-.28 }),
  Object.freeze({ x:5.15, z:-2.7, w:2.5, h:.94, r:.18 }),
  Object.freeze({ x:2.05, z:-4.6, w:2.2, h:.82, r:-.17 }),
  Object.freeze({ x:-4.95, z:2.6, w:1.95, h:.76, r:.14 }),
  Object.freeze({ x:.25, z:.28, w:1.72, h:.66, r:-.34 }),
]);

export const CHESSCOM_CANONICAL_LIGHTS = Object.freeze([
  Object.freeze({ x:-5.15, y:2.4, z:-3.15, warm:1.0, range:4.8 }),
  Object.freeze({ x:4.95, y:2.55, z:2.8, warm:.9, range:4.6 }),
  Object.freeze({ x:-.6, y:2.85, z:4.75, warm:.74, range:4.2 }),
]);
