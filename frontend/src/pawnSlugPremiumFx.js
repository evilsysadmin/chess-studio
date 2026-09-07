import * as THREE from 'three';
import { PAWN_SLUG_FX_RESOURCE_VERSION } from './pawnSlugArt.js';

export const PAWN_SLUG_PROJECTILE_FX = Object.freeze({
  pistol: Object.freeze({ core: 0xffe6a1, tracer: 0xffb94d, length: 0.34, radius: 0.032, flash: 0.9 }),
  machinegun: Object.freeze({ core: 0xfff0b5, tracer: 0xffc14f, length: 0.54, radius: 0.028, flash: 0.72 }),
  shotgun: Object.freeze({ core: 0xffd18a, tracer: 0xff8f45, length: 0.22, radius: 0.026, flash: 1.35 }),
  panzerfaust: Object.freeze({ core: 0xffd57c, tracer: 0xff6e35, length: 0.72, radius: 0.075, flash: 1.75 }),
  enemy: Object.freeze({ core: 0xff8b73, tracer: 0xff3f31, length: 0.4, radius: 0.034, flash: 0.85 }),
});

export const PAWN_SLUG_PREMIUM_FX_RESOURCE_VERSION = 'premium-shared-resources-v1';
const premiumSharedResources = new Map();

function markShared(resource) {
  if (!resource) return resource;
  resource.userData ||= {};
  resource.userData.pawnSlugSharedFx = PAWN_SLUG_FX_RESOURCE_VERSION;
  resource.userData.pawnSlugPremiumSharedFx = PAWN_SLUG_PREMIUM_FX_RESOURCE_VERSION;
  return resource;
}

function shared(key, factory) {
  let resource = premiumSharedResources.get(key);
  if (!resource) {
    resource = markShared(factory());
    premiumSharedResources.set(key, resource);
  }
  return resource;
}

function basic(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 0.9,
    blending: opacity < 1 ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

function standard(color, roughness = 0.4, metalness = 0.5) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function mesh(geometry, material, x = 0, y = 0, z = 0) {
  const node = new THREE.Mesh(geometry, material);
  node.position.set(x, y, z);
  node.castShadow = false;
  node.receiveShadow = false;
  return node;
}

function fxProfile({ enemy = false, weapon = 'pistol' } = {}) {
  return PAWN_SLUG_PROJECTILE_FX[enemy ? 'enemy' : weapon] || PAWN_SLUG_PROJECTILE_FX.pistol;
}

function fxKey({ enemy = false, weapon = 'pistol' } = {}) {
  return enemy ? 'enemy' : weapon;
}

export function createPremiumBulletModel({ enemy = false, explosive = false, weapon = 'pistol' } = {}) {
  const profile = fxProfile({ enemy, weapon });
  const key = fxKey({ enemy, weapon });
  const root = new THREE.Group();
  root.name = `pawn-slug-projectile-${enemy ? 'enemy' : weapon}`;
  root.userData.premiumProjectile = true;
  root.userData.weapon = weapon;
  root.userData.enemy = enemy;
  root.userData.explosive = explosive;
  root.userData.premiumFxResources = PAWN_SLUG_PREMIUM_FX_RESOURCE_VERSION;

  if (explosive) {
    const body = mesh(
      shared(`${key}:rocket:body-geometry`, () => new THREE.CylinderGeometry(profile.radius * 0.72, profile.radius, 0.42, 10)),
      shared(`${key}:rocket:body-material`, () => standard(enemy ? 0x7f3f35 : 0x58606a, 0.38, 0.62)),
    );
    body.rotation.z = -Math.PI / 2;
    const tip = mesh(
      shared(`${key}:rocket:tip-geometry`, () => new THREE.ConeGeometry(profile.radius * 1.28, 0.2, 10)),
      shared(`${key}:rocket:tip-material`, () => standard(enemy ? 0xc75442 : 0xc99e49, 0.34, 0.5)),
      0.3,
    );
    tip.rotation.z = -Math.PI / 2;
    const exhaust = mesh(
      shared(`${key}:rocket:exhaust-geometry`, () => new THREE.ConeGeometry(profile.radius * 1.45, 0.42, 9)),
      shared(`${key}:rocket:exhaust-material`, () => basic(profile.tracer, 0.72)),
      -0.42,
    );
    exhaust.rotation.z = Math.PI / 2;
    exhaust.userData.projectileGlow = true;
    root.add(body, tip, exhaust);
    return root;
  }

  const tracer = mesh(
    shared(`${key}:bullet:tracer-geometry`, () => new THREE.BoxGeometry(profile.length, profile.radius * 1.35, profile.radius * 0.7)),
    shared(`${key}:bullet:tracer-material`, () => basic(profile.tracer, enemy ? 0.72 : 0.84)),
    -profile.length * 0.4,
  );
  tracer.userData.projectileGlow = true;
  const core = mesh(
    shared(`${key}:bullet:core-geometry`, () => new THREE.SphereGeometry(profile.radius, 8, 6)),
    shared(`${key}:bullet:core-material`, () => basic(profile.core)),
    profile.radius * 1.2,
  );
  root.add(tracer, core);
  return root;
}

export function createPremiumMuzzleFlash({ enemy = false, weapon = 'pistol' } = {}) {
  const profile = fxProfile({ enemy, weapon });
  const key = fxKey({ enemy, weapon });
  const root = new THREE.Group();
  root.name = `pawn-slug-muzzle-${enemy ? 'enemy' : weapon}`;
  root.userData.premiumMuzzle = true;
  root.userData.life = weapon === 'panzerfaust' ? 0.115 : weapon === 'shotgun' ? 0.09 : 0.065;
  root.userData.baseScale = profile.flash;
  root.userData.premiumFxGeometry = PAWN_SLUG_PREMIUM_FX_RESOURCE_VERSION;

  // Geometry is immutable and identical for every flash of the same weapon, so
  // keep it on the GPU. Materials remain per-flash because the live fade mutates
  // opacity independently and overlapping machine-gun flashes must not couple.
  const core = mesh(
    shared(`${key}:muzzle:core-geometry`, () => new THREE.SphereGeometry(0.095 * profile.flash, 8, 6)),
    basic(0xfff7d6, 0.98),
  );
  const cone = mesh(
    shared(`${key}:muzzle:cone-geometry`, () => new THREE.ConeGeometry(0.13 * profile.flash, 0.46 * profile.flash, 8)),
    basic(profile.tracer, 0.88),
    0.27 * profile.flash,
  );
  cone.rotation.z = -Math.PI / 2;
  const flareGeometry = shared(`${key}:muzzle:flare-geometry`, () => new THREE.PlaneGeometry(0.7 * profile.flash, 0.055 * profile.flash));
  const flareMaterial = basic(profile.core, 0.54);
  const flare = mesh(flareGeometry, flareMaterial, 0.11 * profile.flash, 0, 0.01);
  const flare2 = mesh(flareGeometry, flareMaterial, 0.11 * profile.flash, 0, 0.01);
  flare2.rotation.z = Math.PI / 2;
  root.add(core, cone, flare, flare2);
  return root;
}

export function animatePremiumProjectile(model, { time = 0, explosive = false } = {}) {
  if (!model?.userData?.premiumProjectile) return;
  const pulse = 0.92 + Math.sin(time * 38) * 0.08;
  for (const child of model.children) {
    if (!child.userData?.projectileGlow) continue;
    child.scale.y = pulse;
    child.scale.z = pulse;
  }
  if (explosive) model.rotation.x = Math.sin(time * 18) * 0.03;
}

export function animatePremiumMuzzleFlash(model, lifeRatio = 1) {
  if (!model?.userData?.premiumMuzzle) return;
  const safe = Math.max(0, Math.min(1, Number(lifeRatio) || 0));
  const kick = 1 + (1 - safe) * 0.55;
  model.scale.set(kick, 0.9 + safe * 0.18, 1);
  for (const child of model.children) {
    if (!child.material || !('opacity' in child.material)) continue;
    child.material.opacity = Math.max(0, Math.min(1, safe * 1.1));
  }
}