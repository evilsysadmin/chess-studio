import * as THREE from 'three';
import {
  HOME_CASTLE_ART_HEIGHT,
  HOME_CASTLE_ART_WIDTH,
} from './HomeCastle3DGeometry.js';

export const HOME_CASTLE_ORIGINAL_UV_ATTRIBUTE = 'homeCastleOriginalUv';

export const HOME_CASTLE_CLEAN_PATCH_PLAN = Object.freeze([
  Object.freeze({
    id: 'tournament',
    center: Object.freeze({ x: -0.96, y: 0.018 }),
    size: Object.freeze({ width: 0.19, height: 0.17 }),
    sampleOffset: Object.freeze({ x: 0.155, y: 0 }),
    feather: 0.34,
  }),
]);

function smoothPatchWeight(distanceToEdge, feather) {
  if (distanceToEdge <= 0) return 0;
  if (feather <= 0) return 1;
  return THREE.MathUtils.smootherstep(distanceToEdge, 0, feather);
}

function patchCenterUv(patch) {
  return {
    u: 0.5 + (patch.center.x / HOME_CASTLE_ART_WIDTH),
    v: 0.5 + (patch.center.y / HOME_CASTLE_ART_HEIGHT),
  };
}

export function applyHomeCastleBackgroundCleanPatches(
  geometry,
  plan = HOME_CASTLE_CLEAN_PATCH_PLAN,
) {
  const uv = geometry?.attributes?.uv;
  if (!uv) return geometry;

  let originalUv = geometry.getAttribute(HOME_CASTLE_ORIGINAL_UV_ATTRIBUTE);
  if (!originalUv) {
    originalUv = uv.clone();
    geometry.setAttribute(HOME_CASTLE_ORIGINAL_UV_ATTRIBUTE, originalUv);
  }

  for (let index = 0; index < uv.count; index += 1) {
    const baseU = originalUv.getX(index);
    const baseV = originalUv.getY(index);
    let nextU = baseU;
    let nextV = baseV;

    for (const patch of plan) {
      const center = patchCenterUv(patch);
      const halfU = patch.size.width / HOME_CASTLE_ART_WIDTH / 2;
      const halfV = patch.size.height / HOME_CASTLE_ART_HEIGHT / 2;
      if (halfU <= 0 || halfV <= 0) continue;

      const normalizedX = Math.abs((baseU - center.u) / halfU);
      const normalizedY = Math.abs((baseV - center.v) / halfV);
      const maxDistance = Math.max(normalizedX, normalizedY);
      if (maxDistance >= 1) continue;

      const distanceToEdge = 1 - maxDistance;
      const weight = smoothPatchWeight(distanceToEdge, patch.feather);
      nextU += (patch.sampleOffset.x / HOME_CASTLE_ART_WIDTH) * weight;
      nextV += (patch.sampleOffset.y / HOME_CASTLE_ART_HEIGHT) * weight;
    }

    uv.setXY(
      index,
      THREE.MathUtils.clamp(nextU, 0, 1),
      THREE.MathUtils.clamp(nextV, 0, 1),
    );
  }

  uv.needsUpdate = true;
  return geometry;
}

export function restoreHomeCastleOriginalUvs(geometry) {
  const originalUv = geometry?.getAttribute?.(HOME_CASTLE_ORIGINAL_UV_ATTRIBUTE);
  if (!originalUv) return geometry;
  geometry.setAttribute('uv', originalUv.clone());
  geometry.deleteAttribute(HOME_CASTLE_ORIGINAL_UV_ATTRIBUTE);
  return geometry;
}
