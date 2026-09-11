import * as THREE from 'three';
import { PAWN_SLUG_FX_RESOURCE_VERSION } from './pawnSlugArt.js';
import { pawnSlugArcadeProjectileProfile } from './pawnSlugArcadeProjectileProfile.js';
import { playPawnSlugWeaponSfx } from './pawnSlugSfx.js';

export const PAWN_SLUG_PROJECTILE_FX = Object.freeze({
  pistol: Object.freeze({ core: 0xffe6a1, tracer: 0xffb94d, length: 0.34, radius: 0.032, flash: 0.9 }),
  machinegun: Object.freeze({ core: 0xfff0b5, tracer: 0xffc14f, length: 0.54, radius: 0.028, flash: 0.72 }),
  shotgun: Object.freeze({ core: 0xffd18a, tracer: 0xff8f45, length: 0.22, radius: 0.026, flash: 1.35 }),
  panzerfaust: Object.freeze({ core: 0xffd57c, tracer: 0xff6e35, length: 0.72, radius: 0.075, flash: 1.75 }),
  enemy: Object.freeze({ core: 0xff8b73, tracer: 0xff3f31, length: 0.4, radius: 0.034, flash: 0.85 }),
});

export const PAWN_SLUG_PREMIUM_FX_RESOURCE_VERSION = 'premium-shared-resources-v2-arcade-bullets';
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
  const arcade = pawnSlugArcadeProjectileProfile({ enemy, weapon, explosive });
  const key = fxKey({ enemy, weapon });
  const root = new THREE.Group();
  root.name = `pawn-slug-projectile-${enemy ? 'enemy' : weapon}`;
  root.userData.premiumProjectile = true;
  root.userData.weapon = weapon;
  root.userData.enemy = enemy;
  root.userData.explosive = explosive;
  root.userData.arcadeProjectileShape = arcade.shape;
  root.userData.premiumFxResources = PAWN_SLUG_PREMIUM_FX_RESOURCE_VERSION;

  if (explosive) {
    const body = mesh(
      shared(`${key}:rocket:body-geometry`, () => new THREE.CylinderGeometry(arcade.radius * 0.75, arcade.radius, arcade.length * 0.66, 10)),
      shared(`${key}:rocket:body-material`, () => standard(enemy ? 0x7f3f35 : 0x58606a, 0.38, 0.62)),
    );
    body.rotation.z = -Math.PI / 2;
    const tip = mesh(
      shared(`${key}:rocket:tip-geometry`, () => new THREE.ConeGeometry(arcade.radius * 1.28, arcade.length * 0.3, 10)),
      shared(`${key}:rocket:tip-material`, () => standard(enemy ? 0xc75442 : 0xc99e49, 0.34, 0.5)),
      arcade.length * 0.46,
    );
    tip.rotation.z = -Math.PI / 2;
    const exhaust = mesh(
      shared(`${key}:rocket:exhaust-geometry`, () => new THREE.ConeGeometry(arcade.radius * 1.55, arcade.trail, 9)),
      shared(`${key}:rocket:exhaust-material`, () => basic(profile.tracer, 0.76)),
      -arcade.length * 0.58,
    );
    exhaust.rotation.z = Math.PI / 2;
    exhaust.userData.projectileGlow = true;
    exhaust.userData.projectileExhaust = true;
    root.add(body, tip, exhaust);
    return root;
  }

  if (arcade.shape === 'pellet') {
    for (let index = 0; index < arcade.pellets; index += 1) {
      const offset = index - (arcade.pellets - 1) / 2;
      const pellet = mesh(
        shared(`${key}:pellet:geometry`, () => new THREE.SphereGeometry(arcade.radius, 8, 6)),
        shared(`${key}:pellet:material`, () => basic(profile.core)),
        offset * arcade.length * 0.46,
        offset * arcade.spread * 0.12,
      );
      pellet.userData.projectileGlow = true;
      root.add(pellet);
    }
    return root;
  }

  const trail = mesh(
    shared(`${key}:bullet:trail-geometry`, () => new THREE.BoxGeometry(arcade.trail, arcade.radius * 0.7, arcade.radius * 0.45)),
    shared(`${key}:bullet:trail-material`, () => basic(profile.tracer, enemy ? 0.72 : 0.82)),
    -arcade.trail * 0.55,
  );
  trail.userData.projectileGlow = true;

  const slug = mesh(
    shared(`${key}:bullet:slug-geometry`, () => new THREE.CapsuleGeometry(arcade.radius, Math.max(0.02, arcade.length - arcade.radius * 2), 4, 8)),
    shared(`${key}:bullet:slug-material`, () => basic(profile.core)),
    arcade.radius * 0.8,
  );
  slug.rotation.z = Math.PI / 2;
  slug.userData.projectileGlow = true;
  root.add(trail, slug);
  return root;
}

export function createPremiumMuzzleFlash({ enemy = false, weapon = 'pistol' } = {}) {
  playPawnSlugWeaponSfx(weapon, { enemy });
  const profile = fxProfile({ enemy, weapon });
  const key = fxKey({ enemy, weapon });
  const root = new THREE.Group();
  root.name = `pawn-slug-muzzle-${enemy ? 'enemy' : weapon}`;
  root.userData.premiumMuzzle = true;
  root.userData.life = weapon === 'panzerfaust' ? 0.115 : weapon === 'shotgun' ? 0.09 : 0.065;
  root.userData.baseScale = profile.flash;
  root.userData.premiumFxGeometry = PAWN_SLUG_PREMIUM_FX_RESOURCE_VERSION;
  root.userData.panzerfaustPunch = weapon === 'panzerfaust' ? 'shockwave-smoke' : null;
  root.userData.muzzleSignature = weapon === 'machinegun'
    ? 'staccato-needle'
    : weapon === 'shotgun'
      ? 'wide-smoke-blast'
      : weapon === 'panzerfaust'
        ? 'shockwave-smoke'
        : 'dry-crack';

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
  const flare2 = mesh(flareGeometry, flareMaterial.clone(), 0.11 * profile.flash, 0, 0.01);
  flare2.rotation.z = Math.PI / 2;
  root.add(core, cone, flare, flare2);

  if (weapon === 'machinegun') {
    const streak = mesh(
      shared(`${key}:muzzle:streak-geometry`, () => new THREE.PlaneGeometry(0.96 * profile.flash, 0.032 * profile.flash)),
      basic(profile.core, 0.66),
      0.36 * profile.flash,
      0,
      0.012,
    );
    streak.userData.muzzleStreak = true;
    root.add(streak);
  }

  if (weapon === 'shotgun') {
    const sideGeometry = shared(`${key}:muzzle:shotgun-side-geometry`, () => new THREE.ConeGeometry(0.09 * profile.flash, 0.35 * profile.flash, 7));
    for (const side of [-1, 1]) {
      const sideFlare = mesh(sideGeometry, basic(profile.tracer, 0.62), 0.24 * profile.flash, side * 0.09 * profile.flash, 0.008);
      sideFlare.rotation.z = -Math.PI / 2 + side * 0.18;
      sideFlare.userData.muzzleShotgunFlare = true;
      root.add(sideFlare);
    }
    for (let index = 0; index < 2; index += 1) {
      const smoke = mesh(
        shared(`${key}:muzzle:shotgun-smoke-geometry:${index}`, () => new THREE.SphereGeometry(0.085 + index * 0.025, 7, 5)),
        basic(0x7c7770, 0.22 - index * 0.025),
        (-0.025 - index * 0.075) * profile.flash,
        (index === 0 ? 0.06 : -0.055) * profile.flash,
        -0.014,
      );
      smoke.userData.muzzleShotgunSmoke = true;
      smoke.userData.smokeIndex = index;
      root.add(smoke);
    }
  }

  if (weapon === 'panzerfaust') {
    const shockwave = mesh(
      shared(`${key}:muzzle:shockwave-geometry`, () => new THREE.RingGeometry(0.11, 0.2, 16)),
      basic(enemy ? 0xff5745 : 0xffc35e, 0.52),
      0.18 * profile.flash,
      0,
      -0.005,
    );
    shockwave.rotation.y = Math.PI / 2;
    shockwave.userData.muzzleShockwave = true;
    root.add(shockwave);

    for (let index = 0; index < 2; index += 1) {
      const smoke = mesh(
        shared(`${key}:muzzle:smoke-geometry:${index}`, () => new THREE.SphereGeometry(0.11 + index * 0.035, 7, 5)),
        basic(enemy ? 0x6d4b47 : 0x6f7478, 0.3 - index * 0.04),
        (-0.05 - index * 0.1) * profile.flash,
        (index === 0 ? 0.06 : -0.055) * profile.flash,
        -0.015,
      );
      smoke.userData.muzzleSmoke = true;
      smoke.userData.smokeIndex = index;
      root.add(smoke);
    }
  }
  return root;
}

export function animatePremiumProjectile(model, { time = 0, explosive = false } = {}) {
  if (!model?.userData?.premiumProjectile) return;
  const pulse = 0.92 + Math.sin(time * 38) * 0.08;
  for (const child of model.children) {
    if (!child.userData?.projectileGlow) continue;
    child.scale.y = pulse;
    child.scale.z = pulse;
    if (child.userData.projectileExhaust) child.scale.x = 0.86 + Math.sin(time * 52) * 0.14;
  }
  if (explosive) model.rotation.x = Math.sin(time * 18) * 0.03;
}

export function animatePremiumMuzzleFlash(model, lifeRatio = 1) {
  if (!model?.userData?.premiumMuzzle) return;
  const safe = Math.max(0, Math.min(1, Number(lifeRatio) || 0));
  const progress = 1 - safe;
  const kick = 1 + progress * 0.55;
  model.scale.set(kick, 0.9 + safe * 0.18, 1);
  for (const child of model.children) {
    if (child.userData?.muzzleShockwave) {
      const waveScale = 0.72 + progress * 2.2;
      child.scale.set(waveScale, waveScale, waveScale);
    } else if (child.userData?.muzzleSmoke) {
      const smokeIndex = child.userData.smokeIndex || 0;
      const smokeScale = 0.82 + progress * (1.35 + smokeIndex * 0.25);
      child.scale.set(smokeScale, smokeScale, smokeScale);
      child.position.x -= progress * (0.015 + smokeIndex * 0.008);
    } else if (child.userData?.muzzleShotgunSmoke) {
      const smokeIndex = child.userData.smokeIndex || 0;
      const smokeScale = 0.84 + progress * (0.8 + smokeIndex * 0.18);
      child.scale.set(smokeScale, smokeScale, smokeScale);
      child.position.x -= progress * (0.01 + smokeIndex * 0.006);
    } else if (child.userData?.muzzleShotgunFlare) {
      child.scale.y = 0.9 + progress * 0.45;
    } else if (child.userData?.muzzleStreak) {
      child.scale.x = 0.7 + progress * 1.45;
    }
    if (!child.material || !('opacity' in child.material)) continue;
    const fade = child.userData?.muzzleSmoke
      ? safe * 0.42
      : child.userData?.muzzleShotgunSmoke
        ? safe * 0.32
        : child.userData?.muzzleShockwave
          ? safe * 0.72
          : child.userData?.muzzleStreak
            ? safe * 0.9
            : safe * 1.1;
    child.material.opacity = Math.max(0, Math.min(1, fade));
  }
}
