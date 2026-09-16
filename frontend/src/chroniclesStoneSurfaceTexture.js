import * as THREE from 'three';

function fract(value) {
  return value - Math.floor(value);
}

function noise(x, y, seed) {
  return fract(Math.sin((x + seed * 0.73) * 12.9898 + (y - seed * 1.11) * 78.233) * 43758.5453);
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function createChroniclesStoneSurfaceTexture({ coarsePointer = false, seed = 1, wet = false } = {}) {
  const size = coarsePointer ? 48 : 96;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const broad = noise(Math.floor(x / 9), Math.floor(y / 9), seed);
      const fine = noise(x, y, seed + 17);
      const vein = Math.abs(Math.sin((x * 0.17) + (y * 0.09) + seed * 1.7));
      const crack = vein > 0.985 && fine > 0.55 ? -34 : 0;
      const moisture = wet ? Math.max(0, 22 - Math.abs(fine - 0.5) * 36) : 0;
      const base = 112 + broad * 34 + (fine - 0.5) * 18 + crack;

      data[index] = clampByte(base - 5 + moisture * 0.35);
      data[index + 1] = clampByte(base + moisture * 0.48);
      data[index + 2] = clampByte(base + 4 + moisture);
      data[index + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = `chronicles-stone-surface-${wet ? 'wet' : 'dry'}-${seed}`;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(wet ? 1.8 : 2.4, wet ? 1.8 : 2.4);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
