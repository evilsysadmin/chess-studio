import * as THREE from 'three';

function clamp01(value) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

export function canonicalHallOcclusion(u, v, depth = 0) {
  const floor = clamp01((0.4 - v) / 0.4);
  const edge = clamp01((Math.abs(u - 0.5) * 2 - 0.55) / 0.45);
  const floorJoint = 1 - clamp01(Math.abs(v - 0.34) / 0.09);
  const vault = clamp01((v - 0.82) / 0.18);
  const depthWeight = clamp01(depth / 0.28);
  const darkness = Math.min(
    0.18,
    (0.055 * floor)
      + (0.045 * edge)
      + (0.025 * floorJoint)
      + (0.02 * vault * edge)
      + (0.04 * depthWeight),
  );
  return 1 - darkness;
}

export function applyCanonicalHallOcclusion(geometry) {
  const position = geometry?.attributes?.position;
  const uv = geometry?.attributes?.uv;
  if (!position || !uv || position.count !== uv.count) return geometry;

  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    const shade = canonicalHallOcclusion(uv.getX(index), uv.getY(index), position.getZ(index));
    colors[index * 3] = shade;
    colors[(index * 3) + 1] = shade;
    colors[(index * 3) + 2] = shade;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}
