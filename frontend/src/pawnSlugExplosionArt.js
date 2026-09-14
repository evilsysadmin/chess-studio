import * as THREE from 'three';
import { PAWN_SLUG_FX_RESOURCE_VERSION } from './pawnSlugArt.js';

const sharedGeometry = new Map();

function geometry(key, factory) {
  let resource = sharedGeometry.get(key);
  if (!resource) {
    resource = factory();
    resource.userData ||= {};
    resource.userData.pawnSlugSharedFx = PAWN_SLUG_FX_RESOURCE_VERSION;
    resource.userData.pawnSlugExplosionGeometry = PAWN_SLUG_EXPLOSION_ART_META.artVersion;
    sharedGeometry.set(key, resource);
  }
  return resource;
}

function rgb(hex) {
  return {
    r: (hex >> 16) & 0xff,
    g: (hex >> 8) & 0xff,
    b: hex & 0xff,
  };
}

export function pawnSlugExplosionParticleStyle(color = 0xffa43c) {
  const safeColor = Number(color) >>> 0;
  const { r, g, b } = rgb(safeColor);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max === 0 ? 0 : (max - min) / max;
  if (saturation < 0.22) return 'smoke';
  if (r > 220 && g > 150) return 'ember';
  return 'spark';
}

function particleMaterial(color, style) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: style === 'smoke' ? 0.58 : 0.96,
    depthWrite: false,
    blending: style === 'smoke' ? THREE.NormalBlending : THREE.AdditiveBlending,
  });
}

export function createExplosionParticle(color = 0xffa43c, size = 0.1) {
  const style = pawnSlugExplosionParticleStyle(color);
  const safeSize = Math.max(0.025, Number(size) || 0.1);
  const geometryByStyle = {
    smoke: () => geometry('smoke', () => new THREE.DodecahedronGeometry(1, 0)),
    ember: () => geometry('ember', () => new THREE.IcosahedronGeometry(1, 0)),
    spark: () => geometry('spark', () => new THREE.OctahedronGeometry(1, 0)),
  };
  const particle = new THREE.Mesh(geometryByStyle[style](), particleMaterial(color, style));
  particle.castShadow = false;
  particle.receiveShadow = false;
  particle.userData.pawnSlugExplosionParticle = true;
  particle.userData.explosionStyle = style;
  particle.userData.dynamicLights = 0;
  particle.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

  if (style === 'smoke') {
    particle.scale.set(safeSize * 1.35, safeSize * 0.95, safeSize * 1.12);
  } else if (style === 'ember') {
    particle.scale.set(safeSize * 0.82, safeSize * 1.12, safeSize * 0.82);
  } else {
    particle.scale.set(safeSize * 0.48, safeSize * 1.85, safeSize * 0.48);
  }
  return particle;
}

export const PAWN_SLUG_EXPLOSION_ART_META = Object.freeze({
  artVersion: 'shrapnel-smoke-v2',
  styles: Object.freeze(['spark', 'ember', 'smoke']),
  geometryReuse: 'shared-tagged-geometry',
  materials: 'per-particle-fade-safe',
  dynamicLights: 0,
  runtimeContract: 'single-mesh-opacity-compatible',
});
