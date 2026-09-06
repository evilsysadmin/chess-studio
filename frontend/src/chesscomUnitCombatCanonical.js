import {
  chesscomPremiumMissOffset,
  chesscomPremiumRoundPattern,
} from './chesscomBabylonGpu.js';

const TILE = 1.55;
const ORIGIN_X = -((10 - 1) * TILE) / 2;
const ORIGIN_Z = -((8 - 1) * TILE) / 2;
const LEGACY_BALLISTIC_PREFIXES = Object.freeze([
  'premium-projectile-',
  'premium-trail-',
  'premium-muzzle-',
]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function easeOutCubic(value) {
  const p = clamp(value, 0, 1);
  return 1 - Math.pow(1 - p, 3);
}

function smoothstep(value) {
  const p = clamp(value, 0, 1);
  return p * p * (3 - 2 * p);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function shortestAngleDelta(from, to) {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

export function chesscomAimYaw(source, target) {
  const dx = Number(target?.x || 0) - Number(source?.x || 0);
  const dz = Number(target?.z || 0) - Number(source?.z || 0);
  if (Math.hypot(dx, dz) < 0.0001) return 0;
  // Chesscom rifles are authored along local +X. Babylon's Y rotation maps
  // local +X into world X/-Z, so this keeps the barrel facing the target.
  return -Math.atan2(dz, dx);
}

export function chesscomCanonicalShotTimeline(distance = 1, roundIndex = 0, balanced = false) {
  const safeDistance = Math.max(0, Number(distance) || 0);
  const safeRound = Math.max(0, Math.round(Number(roundIndex) || 0));
  const aimMs = balanced ? 48 : 55;
  const roundGapMs = 44;
  const legacyFlightMs = (balanced ? 150 : 125) + Math.min(45, safeDistance * 7);
  return Object.freeze({
    aimMs,
    roundGapMs,
    bornMs:aimMs + safeRound * roundGapMs,
    flightMs:Math.max(58, legacyFlightMs - aimMs),
    impactMs:legacyFlightMs + safeRound * roundGapMs,
  });
}

export function chesscomUnitVisualProfile(id, friendly = true, tier = 'ultra') {
  const normalized = String(id || '').toLowerCase();
  if (normalized === 'matthias') {
    return Object.freeze({
      identity:'matthias',
      accent:'#c99a48',
      cloth:'#181a1c',
      faceLift:tier === 'balanced' ? .035 : .055,
      roundedArms:false,
      role:'leader',
    });
  }
  if (!friendly) {
    return Object.freeze({
      identity:'hostile-mercenary',
      accent:'#8e4d39',
      cloth:'#292523',
      faceLift:.018,
      roundedArms:true,
      role:'hostile',
    });
  }
  if (normalized === 'sven') {
    return Object.freeze({
      identity:'scout-mercenary',
      accent:'#5f8f98',
      cloth:'#243033',
      faceLift:.025,
      roundedArms:true,
      role:'scout',
    });
  }
  return Object.freeze({
    identity:'rifleman-mercenary',
    accent:'#8d7953',
    cloth:'#31312b',
    faceLift:.022,
    roundedArms:true,
    role:'rifleman',
  });
}

function unitRoot(scene, id) {
  return scene.getTransformNodeByName?.(`unit-${id}`)
    || scene.transformNodes?.find?.((node) => node.name === `unit-${id}`)
    || null;
}

function unitFriendly(root) {
  const child = root?.getChildMeshes?.().find?.((mesh) => mesh?.metadata?.type === 'unit');
  return child?.metadata?.friendly !== false;
}

function worldFallback(B, unit, lift = 1) {
  return new B.Vector3(
    ORIGIN_X + Number(unit?.x || 0) * TILE,
    lift,
    ORIGIN_Z + Number(unit?.y || 0) * TILE,
  );
}

function absolutePosition(B, root, fallback) {
  if (!root) return fallback.clone ? fallback.clone() : fallback;
  root.computeWorldMatrix?.(true);
  if (root.getAbsolutePosition) return root.getAbsolutePosition().clone();
  if (root.absolutePosition?.clone) return root.absolutePosition.clone();
  return fallback.clone ? fallback.clone() : fallback;
}

function muzzleWorld(B, root, fallback) {
  const weapon = root?.metadata?.parts?.weapon;
  if (weapon?.getWorldMatrix && B?.Vector3?.TransformCoordinates) {
    weapon.computeWorldMatrix?.(true);
    const rootName = String(root?.name || '');
    const localX = rootName === 'unit-matthias' ? 1.065 : rootName === 'unit-sven' ? .82 : .91;
    return B.Vector3.TransformCoordinates(new B.Vector3(localX, 0, 0), weapon.getWorldMatrix());
  }
  return absolutePosition(B, root, fallback);
}

function aimWorld(B, root, fallback) {
  if (root?.getWorldMatrix && B?.Vector3?.TransformCoordinates) {
    root.computeWorldMatrix?.(true);
    const y = root.metadata?.operative ? 1.20 : .94;
    return B.Vector3.TransformCoordinates(new B.Vector3(0, y, -.04), root.getWorldMatrix());
  }
  return fallback.clone ? fallback.clone() : fallback;
}

function snapshotState(state) {
  return {
    selectedId:state?.selectedId ?? null,
    targetId:state?.targetId ?? null,
    friendlies:Array.isArray(state?.friendlies) ? state.friendlies.map((unit) => ({ ...unit })) : [],
    enemies:Array.isArray(state?.enemies) ? state.enemies.map((unit) => ({ ...unit })) : [],
  };
}

function attackDistance(a, b) {
  return Math.abs(Number(a?.x || 0) - Number(b?.x || 0))
    + Math.abs(Number(a?.y || 0) - Number(b?.y || 0));
}

function detectAttacks(previous, state) {
  if (!previous) return [];
  const friendlies = Array.isArray(state?.friendlies) ? state.friendlies : [];
  const enemies = Array.isArray(state?.enemies) ? state.enemies : [];
  const attacks = [];
  const oldEnemies = new Map(previous.enemies.map((unit) => [unit.id, unit]));
  const oldFriendlies = new Map(previous.friendlies.map((unit) => [unit.id, unit]));
  const damagedEnemies = enemies.filter((unit) => (oldEnemies.get(unit.id)?.hp ?? unit.hp) > unit.hp);

  for (const shooter of friendlies) {
    const oldShooter = oldFriendlies.get(shooter.id);
    if (!oldShooter || !Number.isFinite(oldShooter.ammo) || !Number.isFinite(shooter.ammo) || shooter.ammo >= oldShooter.ammo) continue;
    const rounds = clamp(oldShooter.ammo - shooter.ammo, 1, 5);
    const target = damagedEnemies.find((enemy) => enemy.id === state?.targetId)
      || damagedEnemies.slice().sort((a, b) => attackDistance(shooter, a) - attackDistance(shooter, b))[0]
      || enemies.find((enemy) => enemy.id === state?.targetId)
      || enemies.filter((enemy) => enemy.hp > 0).slice().sort((a, b) => attackDistance(shooter, a) - attackDistance(shooter, b))[0];
    if (!target) continue;
    const oldTarget = oldEnemies.get(target.id);
    attacks.push({
      source:shooter,
      target,
      rounds,
      hit:Boolean(oldTarget && target.hp < oldTarget.hp),
      friendly:true,
      distance:attackDistance(shooter, target),
    });
  }

  for (const target of friendlies) {
    const oldTarget = oldFriendlies.get(target.id);
    if (!oldTarget || target.hp >= oldTarget.hp) continue;
    const source = previous.enemies.filter((enemy) => enemy.hp > 0)
      .sort((a, b) => attackDistance(a, oldTarget) - attackDistance(b, oldTarget))[0];
    if (!source) continue;
    attacks.push({
      source,
      target,
      rounds:1,
      hit:true,
      friendly:false,
      distance:attackDistance(source, target),
    });
  }
  return attacks;
}

function createMicroTexture(B, scene, name, size, kind, bump = false) {
  const texture = new B.DynamicTexture(name, { width:size, height:size }, scene, false);
  texture.wrapU = B.Texture.WRAP_ADDRESSMODE;
  texture.wrapV = B.Texture.WRAP_ADDRESSMODE;
  texture.anisotropicFilteringLevel = 8;
  const ctx = texture.getContext();
  const base = bump ? 128 : 238;
  ctx.fillStyle = `rgb(${base},${base},${base})`;
  ctx.fillRect(0, 0, size, size);

  if (kind === 'cloth') {
    for (let p = 2; p < size; p += 4) {
      ctx.strokeStyle = bump ? 'rgba(172,172,172,.42)' : 'rgba(45,45,45,.055)';
      ctx.lineWidth = .65;
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
    }
    for (let p = -size; p < size * 2; p += 13) {
      ctx.strokeStyle = bump ? 'rgba(102,102,102,.16)' : 'rgba(255,255,255,.025)';
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p + size, size); ctx.stroke();
    }
  } else if (kind === 'ivory') {
    for (let index = 0; index < Math.max(8, Math.round(size / 8)); index += 1) {
      const y = (index * 37) % size;
      ctx.strokeStyle = bump ? 'rgba(150,150,150,.18)' : 'rgba(118,92,62,.045)';
      ctx.lineWidth = .8;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= size; x += 12) ctx.lineTo(x, y + Math.sin((x + index * 11) * .09) * 2.2);
      ctx.stroke();
    }
  } else {
    for (let index = 0; index < Math.max(12, Math.round(size / 5)); index += 1) {
      const y = (index * 29) % size;
      const x = (index * 47) % size;
      const length = 7 + (index % 5) * 4;
      ctx.strokeStyle = bump ? 'rgba(190,190,190,.28)' : 'rgba(255,255,255,.045)';
      ctx.lineWidth = .6;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(Math.min(size, x + length), y + (index % 2 ? .7 : -.7)); ctx.stroke();
    }
  }
  texture.update(false);
  return texture;
}

function tuneCharacterMaterials(B, scene, tier, disposables, restorers) {
  const size = tier === 'balanced' ? 96 : tier === 'high' ? 128 : 192;
  const targets = [
    ['friendly-body','cloth',.31], ['enemy-body','cloth',.31], ['pack','cloth',.34], ['glove','cloth',.30], ['pouch','cloth',.36],
    ['friendly-armour','metal',.16], ['enemy-armour','metal',.16], ['helmet','metal',.13], ['elite-helmet','metal',.13], ['gun','metal',.11],
    ['matthias-black','metal',.10], ['matthias-black-2','metal',.12], ['matthias-brass','metal',.08],
    ['matthias-core','ivory',.08], ['matthias-core-shade','ivory',.09], ['matthias-face','ivory',.06],
  ];
  for (const [name, kind, bumpLevel] of targets) {
    const mat = scene.getMaterialByName?.(name) || scene.materials?.find?.((candidate) => candidate.name === name);
    if (!mat || !('diffuseTexture' in mat)) continue;
    const oldDiffuse = mat.diffuseTexture;
    const oldBump = mat.bumpTexture;
    const oldPower = mat.specularPower;
    const oldEmissive = mat.emissiveColor?.clone?.() || null;
    const surface = createMicroTexture(B, scene, `canonical-unit-${name}-surface`, size, kind, false);
    const bump = createMicroTexture(B, scene, `canonical-unit-${name}-bump`, size, kind, true);
    surface.uScale = surface.vScale = kind === 'cloth' ? 7.5 : kind === 'ivory' ? 3.2 : 5.2;
    bump.uScale = bump.vScale = surface.uScale;
    bump.level = bumpLevel;
    mat.diffuseTexture = surface;
    mat.bumpTexture = bump;
    if (kind === 'cloth') mat.specularPower = 16;
    if (kind === 'metal') mat.specularPower = Math.max(Number(mat.specularPower) || 0, name.includes('brass') ? 138 : 112);
    if (kind === 'ivory') mat.specularPower = 72;
    if (name === 'matthias-face' && mat.emissiveColor) mat.emissiveColor = new B.Color3(.045,.035,.022);
    if (name === 'matthias-core' && mat.emissiveColor) mat.emissiveColor = new B.Color3(.022,.018,.012);
    disposables.push(surface, bump);
    restorers.push(() => {
      mat.diffuseTexture = oldDiffuse;
      mat.bumpTexture = oldBump;
      mat.specularPower = oldPower;
      if (oldEmissive && mat.emissiveColor) mat.emissiveColor.copyFrom(oldEmissive);
    });
  }
}

function makeAccentMaterial(B, scene, name, hex, disposables) {
  const mat = new B.StandardMaterial(name, scene);
  mat.diffuseColor = B.Color3.FromHexString(hex);
  mat.specularColor = new B.Color3(.16,.16,.14);
  mat.specularPower = 52;
  disposables.push(mat);
  return mat;
}

function roundedCapsule(B, scene, name, parent, material, height, radius, position, rotation = null) {
  let mesh;
  if (B.MeshBuilder.CreateCapsule) {
    mesh = B.MeshBuilder.CreateCapsule(name, { height, radius, tessellation:12, subdivisions:2 }, scene);
  } else {
    mesh = B.MeshBuilder.CreateCylinder(name, { height, diameter:radius * 2, tessellation:14 }, scene);
  }
  mesh.parent = parent;
  mesh.position.set(position.x, position.y, position.z);
  if (rotation) mesh.rotation.set(rotation.x, rotation.y, rotation.z);
  mesh.material = material;
  mesh.receiveShadows = true;
  mesh.isPickable = false;
  return mesh;
}

function polishMatthias(B, scene, root, profile, disposables, restorers) {
  const parts = root.metadata?.parts || {};
  const head = parts.head;
  const face = scene.getMeshByName?.('matthias-face');
  if (head?.scaling) {
    const old = head.scaling.clone();
    head.scaling.set(old.x * 1.075, old.y * 1.075, old.z * 1.075);
    restorers.push(() => head.scaling.copyFrom(old));
  }
  if (face?.material?.emissiveColor) {
    const old = face.material.emissiveColor.clone();
    face.material.emissiveColor = new B.Color3(profile.faceLift, profile.faceLift * .83, profile.faceLift * .55);
    restorers.push(() => face.material.emissiveColor.copyFrom(old));
  }
  const brass = scene.getMaterialByName?.('matthias-brass');
  const black = scene.getMaterialByName?.('matthias-black');
  if (parts.armL && brass) {
    for (const [arm, side] of [[parts.armL,-1],[parts.armR,1]]) {
      if (!arm) continue;
      const cuff = B.MeshBuilder.CreateTorus(`canonical-matthias-cuff-${side}`, { diameter:.18, thickness:.022, tessellation:18 }, scene);
      cuff.parent = arm;
      cuff.position.set(0,-.53,-.145);
      cuff.rotation.x = Math.PI / 2;
      cuff.material = brass;
      cuff.isPickable = false;
      disposables.push(cuff);
    }
  }
  if (parts.weapon && black) {
    const sight = B.MeshBuilder.CreateBox('canonical-matthias-front-sight', { width:.035,height:.10,depth:.045 }, scene);
    sight.parent = parts.weapon;
    sight.position.set(.72,.09,0);
    sight.material = black;
    sight.isPickable = false;
    disposables.push(sight);
  }
}

function polishMercenary(B, scene, root, profile, tier, disposables) {
  const parts = root.metadata?.parts || {};
  const uniform = scene.getMaterialByName?.(unitFriendly(root) ? 'friendly-body' : 'enemy-body');
  const armour = scene.getMaterialByName?.(unitFriendly(root) ? 'friendly-armour' : 'enemy-armour');
  const skin = scene.getMaterialByName?.(unitFriendly(root) ? 'friendly-head' : 'enemy-head');
  if (!uniform || !armour) return;
  const accent = makeAccentMaterial(B, scene, `canonical-${root.name}-accent`, profile.accent, disposables);

  if (tier !== 'balanced') {
    const chest = roundedCapsule(B, scene, `canonical-${root.name}-rounded-chest`, root, uniform, .61, .275, { x:0,y:.83,z:.015 });
    chest.scaling.z = .68;
    disposables.push(chest);
  }

  if (profile.roundedArms) {
    for (const [part, side] of [[parts.armL,-1],[parts.armR,1]]) {
      if (!part) continue;
      const sleeve = roundedCapsule(
        B, scene, `canonical-${root.name}-sleeve-${side}`,
        part, uniform, .48, .105,
        { x:0,y:0,z:0 }, { x:Math.PI/2,y:0,z:0 },
      );
      disposables.push(sleeve);
    }
  }

  const neck = B.MeshBuilder.CreateCylinder(`canonical-${root.name}-neck`, { height:.12,diameter:.18,tessellation:14 }, scene);
  neck.parent = root; neck.position.set(0,1.12,0); neck.material = skin || uniform; neck.isPickable = false; disposables.push(neck);

  const scarf = B.MeshBuilder.CreateTorus(`canonical-${root.name}-scarf`, { diameter:.34,thickness:.045,tessellation:18 }, scene);
  scarf.parent = root; scarf.position.set(0,1.10,0); scarf.rotation.x = Math.PI/2; scarf.material = accent; scarf.isPickable = false; disposables.push(scarf);

  const patch = B.MeshBuilder.CreatePlane(`canonical-${root.name}-role-patch`, { width:.18,height:.12 }, scene);
  patch.parent = root; patch.position.set(.13,.91,-.235); patch.rotation.y = Math.PI; patch.material = accent; patch.isPickable = false; disposables.push(patch);

  if (skin) {
    const nose = B.MeshBuilder.CreateSphere(`canonical-${root.name}-nose`, { diameter:.075,segments:10 }, scene);
    nose.parent = root; nose.position.set(0,1.25,-.205); nose.scaling.set(.72,.82,1.05); nose.material = skin; nose.isPickable = false; disposables.push(nose);
  }

  if (profile.role === 'scout') {
    const goggles = B.MeshBuilder.CreateBox(`canonical-${root.name}-goggles`, { width:.30,height:.075,depth:.045 }, scene);
    goggles.parent = root; goggles.position.set(0,1.285,-.215); goggles.material = accent; goggles.isPickable = false; disposables.push(goggles);
  } else if (profile.role === 'rifleman' && parts.helmet) {
    const antenna = B.MeshBuilder.CreateCylinder(`canonical-${root.name}-antenna`, { height:.33,diameter:.018,tessellation:8 }, scene);
    antenna.parent = root; antenna.position.set(.18,1.55,.05); antenna.rotation.z = -.10; antenna.material = accent; antenna.isPickable = false; disposables.push(antenna);
  }
}

function hideLegacyBallistic(mesh, hiddenMeshes) {
  if (!mesh || !LEGACY_BALLISTIC_PREFIXES.some((prefix) => String(mesh.name || '').startsWith(prefix))) return;
  hiddenMeshes.add(mesh);
  mesh.isVisible = false;
  mesh.visibility = 0;
}

function snapshotPart(part) {
  if (!part) return null;
  return {
    position:part.position?.clone?.() || null,
    rotation:part.rotation?.clone?.() || null,
  };
}

function restorePart(part, state) {
  if (!part || !state) return;
  if (state.position && part.position?.copyFrom) part.position.copyFrom(state.position);
  if (state.rotation && part.rotation?.copyFrom) part.rotation.copyFrom(state.rotation);
}

function beginFirePose(B, scene, poses, attack, balanced) {
  const root = unitRoot(scene, attack.source.id);
  const targetRoot = unitRoot(scene, attack.target.id);
  if (!root || !targetRoot) return;
  const existing = poses.get(root);
  if (existing) {
    root.rotation.y = existing.baseYaw;
    restorePart(existing.parts.weapon, existing.base.weapon);
    restorePart(existing.parts.armL, existing.base.armL);
    restorePart(existing.parts.armR, existing.base.armR);
  }
  const sourcePosition = absolutePosition(B, root, worldFallback(B, attack.source, 1));
  const targetPosition = absolutePosition(B, targetRoot, worldFallback(B, attack.target, 1));
  const parts = root.metadata?.parts || {};
  const timeline = chesscomCanonicalShotTimeline(attack.distance, 0, balanced);
  const holdMs = Math.max(120, (Math.max(1, Number(attack.rounds) || 1) - 1) * timeline.roundGapMs + 92);
  poses.set(root, {
    root,
    parts,
    baseYaw:Number(root.rotation?.y || 0),
    targetYaw:chesscomAimYaw(sourcePosition, targetPosition),
    born:performance.now(),
    aimMs:timeline.aimMs,
    holdMs,
    recoverMs:145,
    rounds:Math.max(1, Number(attack.rounds) || 1),
    base:{
      weapon:snapshotPart(parts.weapon),
      armL:snapshotPart(parts.armL),
      armR:snapshotPart(parts.armR),
    },
  });
}

function posePart(part, base, blend, recoil, side = 0) {
  if (!part || !base) return;
  if (base.position && part.position) {
    part.position.copyFrom(base.position);
    if (side === 0) {
      part.position.x -= recoil * .055;
      part.position.y += blend * .035;
      part.position.z -= blend * .055;
    }
  }
  if (base.rotation && part.rotation) {
    part.rotation.copyFrom(base.rotation);
    if (side === 0) part.rotation.z += blend * .025 - recoil * .045;
    else {
      part.rotation.x += blend * (side < 0 ? .10 : -.10);
      part.rotation.z += blend * (side < 0 ? .12 : -.12);
    }
  }
}

function animateFirePoses(poses, now) {
  for (const [root, pose] of poses) {
    const elapsed = now - pose.born;
    const recoverStart = pose.aimMs + pose.holdMs;
    const end = recoverStart + pose.recoverMs;
    if (elapsed >= end) {
      root.rotation.y = pose.baseYaw;
      restorePart(pose.parts.weapon, pose.base.weapon);
      restorePart(pose.parts.armL, pose.base.armL);
      restorePart(pose.parts.armR, pose.base.armR);
      poses.delete(root);
      continue;
    }

    let blend;
    if (elapsed < pose.aimMs) blend = easeOutCubic(elapsed / pose.aimMs);
    else if (elapsed < recoverStart) blend = 1;
    else blend = 1 - smoothstep((elapsed - recoverStart) / pose.recoverMs);

    root.rotation.y = pose.baseYaw + shortestAngleDelta(pose.baseYaw, pose.targetYaw) * blend;
    let recoil = 0;
    for (let round = 0; round < pose.rounds; round += 1) {
      const local = elapsed - (pose.aimMs + round * 44);
      if (local >= 0 && local <= 82) recoil = Math.max(recoil, Math.sin((local / 82) * Math.PI));
    }
    posePart(pose.parts.weapon, pose.base.weapon, blend, recoil, 0);
    posePart(pose.parts.armL, pose.base.armL, blend, recoil, -1);
    posePart(pose.parts.armR, pose.base.armR, blend, recoil, 1);
  }
}

function makeBallisticMaterials(B, scene, disposables) {
  const friendly = new B.StandardMaterial('canonical-friendly-round', scene);
  friendly.diffuseColor = new B.Color3(1,.69,.20); friendly.emissiveColor = new B.Color3(1,.40,.055); friendly.disableLighting = true;
  const hostile = new B.StandardMaterial('canonical-hostile-round', scene);
  hostile.diffuseColor = new B.Color3(1,.24,.14); hostile.emissiveColor = new B.Color3(1,.08,.025); hostile.disableLighting = true;
  const flash = new B.StandardMaterial('canonical-muzzle-flash', scene);
  flash.diffuseColor = new B.Color3(1,.78,.28); flash.emissiveColor = new B.Color3(1,.50,.08); flash.disableLighting = true;
  disposables.push(friendly, hostile, flash);
  return { friendly, hostile, flash };
}

function queueShots(B, scene, shots, poses, materials, disposables, attack, balanced) {
  beginFirePose(B, scene, poses, attack, balanced);
  const pattern = chesscomPremiumRoundPattern(attack.rounds, attack.hit);
  const now = performance.now();
  pattern.forEach((hit, roundIndex) => {
    const timeline = chesscomCanonicalShotTimeline(attack.distance, roundIndex, balanced);
    shots.push({
      attack,
      hit,
      roundIndex,
      born:now + timeline.bornMs,
      flightMs:timeline.flightMs,
      materials,
      initialized:false,
      bullet:null,
      trail:null,
      flash:null,
      light:null,
      start:null,
      end:null,
      disposables,
    });
  });
}

function initializeShot(B, scene, shot) {
  const sourceRoot = unitRoot(scene, shot.attack.source.id);
  const targetRoot = unitRoot(scene, shot.attack.target.id);
  const start = muzzleWorld(B, sourceRoot, worldFallback(B, shot.attack.source, 1));
  const aim = aimWorld(B, targetRoot, worldFallback(B, shot.attack.target, .95));
  const end = aim.clone();
  if (!shot.hit) {
    const offset = chesscomPremiumMissOffset(`${shot.attack.source.id}:${shot.attack.target.id}`, shot.roundIndex);
    end.x += offset.x; end.z += offset.z; end.y = Math.max(.10, offset.y);
  }
  const bullet = B.MeshBuilder.CreateSphere(`canonical-ballistic-round-${performance.now()}-${shot.roundIndex}`, { diameter:.052,segments:8 }, scene);
  bullet.position.copyFrom(start); bullet.material = shot.attack.friendly ? shot.materials.friendly : shot.materials.hostile; bullet.isPickable = false;
  const trail = B.MeshBuilder.CreateLines(`canonical-ballistic-tail-${performance.now()}-${shot.roundIndex}`, { points:[start,start],updatable:true }, scene);
  trail.color = shot.attack.friendly ? new B.Color3(1,.66,.21) : new B.Color3(1,.19,.11); trail.alpha = .72; trail.isPickable = false;
  const flash = B.MeshBuilder.CreateSphere(`canonical-muzzle-pop-${performance.now()}-${shot.roundIndex}`, { diameter:.13,segments:8 }, scene);
  flash.position.copyFrom(start); flash.material = shot.materials.flash; flash.scaling.set(1.6,.72,.72); flash.isPickable = false;
  const light = new B.PointLight(`canonical-muzzle-light-${performance.now()}-${shot.roundIndex}`, start.clone(), scene);
  light.diffuse = new B.Color3(1,.47,.10); light.intensity = 2.1; light.range = 1.9;
  shot.start = start; shot.end = end; shot.bullet = bullet; shot.trail = trail; shot.flash = flash; shot.light = light; shot.initialized = true;
  shot.disposables.push(bullet, trail, flash, light);
}

function disposeShot(shot) {
  try { shot.bullet?.dispose(); } catch {}
  try { shot.trail?.dispose(); } catch {}
  try { shot.flash?.dispose(); } catch {}
  try { shot.light?.dispose(); } catch {}
}

function animateShots(B, scene, shots, now) {
  for (let index = shots.length - 1; index >= 0; index -= 1) {
    const shot = shots[index];
    if (now < shot.born) continue;
    if (!shot.initialized) initializeShot(B, scene, shot);
    const raw = clamp((now - shot.born) / shot.flightMs, 0, 1);
    const eased = easeOutCubic(raw);
    const current = B.Vector3.Lerp(shot.start, shot.end, eased);
    shot.bullet.position.copyFrom(current);
    const tailProgress = clamp(eased - .11, 0, 1);
    const tail = B.Vector3.Lerp(shot.start, shot.end, tailProgress);
    B.MeshBuilder.CreateLines(shot.trail.name, { points:[tail,current],instance:shot.trail });
    const flashProgress = clamp((now - shot.born) / 58, 0, 1);
    shot.flash.visibility = 1 - flashProgress;
    shot.flash.scaling.set(1.6 + flashProgress * .8, .72 * (1 - flashProgress), .72 * (1 - flashProgress));
    shot.light.intensity = (1 - flashProgress) * 2.1;
    if (raw < 1) continue;
    disposeShot(shot);
    shots.splice(index, 1);
  }
}

export function installChesscomUnitCombatCanonical(B, scene, { tier = 'ultra' } = {}) {
  const balanced = tier === 'balanced';
  const disposables = [];
  const restorers = [];
  const polished = new Set();
  const hiddenLegacy = new Set();
  const poses = new Map();
  const shots = [];
  const materials = makeBallisticMaterials(B, scene, disposables);
  let previous = null;

  tuneCharacterMaterials(B, scene, tier, disposables, restorers);

  function ensurePolished(id) {
    const root = unitRoot(scene, id);
    if (!root || polished.has(root)) return;
    polished.add(root);
    const profile = chesscomUnitVisualProfile(id, unitFriendly(root), tier);
    if (profile.identity === 'matthias') polishMatthias(B, scene, root, profile, disposables, restorers);
    else polishMercenary(B, scene, root, profile, tier, disposables);
  }

  scene.transformNodes?.forEach?.((node) => {
    if (String(node?.name || '').startsWith('unit-')) ensurePolished(String(node.name).slice(5));
  });
  scene.meshes?.forEach?.((mesh) => hideLegacyBallistic(mesh, hiddenLegacy));
  const meshObserver = scene.onNewMeshAddedObservable.add((mesh) => hideLegacyBallistic(mesh, hiddenLegacy));

  const renderObserver = scene.onBeforeRenderObservable.add(() => {
    const now = performance.now();
    // GPU V2 still owns hit/miss semantics, impact particles and audio. We only
    // suppress its torso-ish tracer and replace the visible ballistic path.
    for (const mesh of Array.from(hiddenLegacy)) {
      if (!mesh || mesh.isDisposed?.()) { hiddenLegacy.delete(mesh); continue; }
      mesh.isVisible = false;
      mesh.visibility = 0;
    }
    animateFirePoses(poses, now);
    animateShots(B, scene, shots, now);
  });

  return {
    update(state) {
      const friendlies = Array.isArray(state?.friendlies) ? state.friendlies : [];
      const enemies = Array.isArray(state?.enemies) ? state.enemies : [];
      [...friendlies, ...enemies].forEach((unit) => ensurePolished(unit.id));
      if (previous) {
        const attacks = detectAttacks(previous, state);
        attacks.forEach((attack) => queueShots(B, scene, shots, poses, materials, disposables, attack, balanced));
      }
      previous = snapshotState(state);
    },
    destroy() {
      scene.onBeforeRenderObservable.remove(renderObserver);
      scene.onNewMeshAddedObservable.remove(meshObserver);
      for (const [root, pose] of poses) {
        root.rotation.y = pose.baseYaw;
        restorePart(pose.parts.weapon, pose.base.weapon);
        restorePart(pose.parts.armL, pose.base.armL);
        restorePart(pose.parts.armR, pose.base.armR);
      }
      poses.clear();
      shots.splice(0).forEach(disposeShot);
      for (const restore of restorers.reverse()) {
        try { restore(); } catch {}
      }
      for (const item of disposables.reverse()) {
        try { item?.dispose?.(); } catch {}
      }
      polished.clear();
      hiddenLegacy.clear();
    },
  };
}
