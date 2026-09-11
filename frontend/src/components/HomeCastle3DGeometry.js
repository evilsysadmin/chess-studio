import * as THREE from 'three';

export const HOME_CASTLE_ART_WIDTH = 3.2;
export const HOME_CASTLE_ART_HEIGHT = 1.8;

export function canonicalHallDepth(u, v) {
  const floor = THREE.MathUtils.clamp((0.34 - v) / 0.34, 0, 1);
  const edge = THREE.MathUtils.clamp((Math.abs(u - 0.5) * 2 - 0.62) / 0.38, 0, 1);
  const vault = THREE.MathUtils.clamp((v - 0.83) / 0.17, 0, 1);

  return (
    (0.2 * Math.pow(floor, 1.45))
    + (0.075 * edge * (0.45 + (0.55 * v)))
    + (0.018 * vault)
  );
}

export function createCanonicalHallGeometry({
  width = HOME_CASTLE_ART_WIDTH,
  height = HOME_CASTLE_ART_HEIGHT,
  widthSegments = 64,
  heightSegments = 36,
} = {}) {
  const geometry = new THREE.PlaneGeometry(width, height, widthSegments, heightSegments);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;

  for (let index = 0; index < position.count; index += 1) {
    position.setZ(index, canonicalHallDepth(uv.getX(index), uv.getY(index)));
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}
