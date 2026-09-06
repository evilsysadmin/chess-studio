import {
  BABYLON_VERSION,
  chesscomMuzzleWorldPosition,
  createChesscomBabylon as createBaseChesscomBabylon,
  loadChesscomBabylon,
} from './chesscomBabylonPremium.js';
import { isFxMuted } from './soundPreferences.js';

const BASE_FX_NAMES = new Set(['muzzle-flash', 'tracer', 'impact']);
const SURFACE_PROFILES = Object.freeze({
  ground: { kind:'grit', scale:7.5, bump:.28 },
  tile: { kind:'grit', scale:5.5, bump:.19 },
  road: { kind:'asphalt', scale:7.5, bump:.32 },
  concrete: { kind:'concrete', scale:3.8, bump:.30 },
  roof: { kind:'metal', scale:4.8, bump:.18 },
  'roof-trim': { kind:'metal', scale:4.8, bump:.16 },
  door: { kind:'metal', scale:4.0, bump:.21 },
  wood: { kind:'wood', scale:2.8, bump:.24 },
  'wood-light': { kind:'wood', scale:3.2, bump:.20 },
  barrel: { kind:'painted-metal', scale:3.6, bump:.20 },
  'barrel-top': { kind:'painted-metal', scale:3.6, bump:.18 },
  sandbag: { kind:'fabric', scale:6.0, bump:.34 },
  metal: { kind:'metal', scale:4.5, bump:.18 },
  'metal-bright': { kind:'metal', scale:4.0, bump:.15 },
  'metal-dark': { kind:'metal', scale:5.0, bump:.18 },
  truck: { kind:'painted-metal', scale:3.4, bump:.18 },
  tire: { kind:'rubber', scale:7.0, bump:.30 },
  'friendly-body': { kind:'fabric', scale:8.0, bump:.18 },
  'enemy-body': { kind:'fabric', scale:8.0, bump:.18 },
  'friendly-armour': { kind:'painted-metal', scale:5.0, bump:.16 },
  'enemy-armour': { kind:'painted-metal', scale:5.0, bump:.16 },
  helmet: { kind:'painted-metal', scale:5.5, bump:.14 },
  'elite-helmet': { kind:'painted-metal', scale:5.5, bump:.14 },
  pack: { kind:'fabric', scale:7.0, bump:.22 },
  boot: { kind:'rubber', scale:7.0, bump:.22 },
  glove: { kind:'fabric', scale:8.0, bump:.18 },
  pouch: { kind:'fabric', scale:7.0, bump:.24 },
  gun: { kind:'gunmetal', scale:5.5, bump:.12 },
  'matthias-core': { kind:'ivory', scale:4.0, bump:.10 },
  'matthias-core-shade': { kind:'ivory', scale:4.0, bump:.10 },
  'matthias-face': { kind:'ivory', scale:4.0, bump:.08 },
  'matthias-black': { kind:'gunmetal', scale:5.5, bump:.12 },
  'matthias-black-2': { kind:'painted-metal', scale:5.0, bump:.14 },
  'matthias-brass': { kind:'brass', scale:4.5, bump:.10 },
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hashString(value) {
  let hash = 2166136261;
  const text = String(value ?? '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function chesscomGpuQualityProfile({ coarse = false, dpr = 1, maxTextureSize = 4096, webglVersion = 2 } = {}) {
  const constrained = coarse || maxTextureSize < 4096 || webglVersion < 2;
  if (constrained) {
    return Object.freeze({
      tier:'balanced',
      textureSize:96,
      ssao:false,
      bloomKernel:24,
      bloomWeight:.13,
      msaa:1,
      gpuParticles:false,
      projectileMs:150,
    });
  }
  const veryDense = Number(dpr) >= 2.25;
  return Object.freeze({
    tier:veryDense ? 'high' : 'ultra',
    textureSize:veryDense ? 128 : 192,
    ssao:!veryDense,
    bloomKernel:veryDense ? 32 : 44,
    bloomWeight:veryDense ? .16 : .19,
    msaa:veryDense ? 2 : 4,
    gpuParticles:true,
    projectileMs:veryDense ? 135 : 125,
  });
}

export function chesscomPremiumRoundPattern(rounds, attackHit = true) {
  const count = clamp(Math.round(Number(rounds) || 1), 1, 5);
  if (!attackHit) return Array.from({ length:count }, () => false);
  if (count === 1) return [true];
  if (count === 2) return [false, true];
  if (count === 3) return [false, true, true];
  if (count === 4) return [false, true, false, true];
  return [false, true, false, true, true];
}

export function chesscomPremiumMissOffset(seed, roundIndex = 0) {
  const random = seededRandom(hashString(`${seed}:${roundIndex}`));
  const angle = random() * Math.PI * 2;
  const radius = .62 + random() * .58;
  return {
    x:Math.cos(angle) * radius,
    z:Math.sin(angle) * radius,
    y:.10 + random() * .16,
  };
}

function paintSurfaceTexture(texture, kind, seedText, bump = false) {
  const ctx = texture.getContext();
  const size = texture.getSize().width;
  const random = seededRandom(hashString(`${seedText}:${kind}:${bump ? 'b' : 'c'}`));
  const base = bump ? 128 : 225;
  ctx.fillStyle = `rgb(${base},${base},${base})`;
  ctx.fillRect(0, 0, size, size);

  const dotCount = Math.round(size * size * (kind === 'fabric' ? .055 : .032));
  for (let index = 0; index < dotCount; index += 1) {
    const x = random() * size;
    const y = random() * size;
    const alpha = bump ? .22 + random() * .30 : .035 + random() * .075;
    const bright = random() > .54;
    const value = bump
      ? Math.round(clamp(base + (bright ? 1 : -1) * (15 + random() * 44), 42, 220))
      : bright ? 255 : Math.round(145 + random() * 56);
    ctx.fillStyle = `rgba(${value},${value},${value},${alpha})`;
    const radius = kind === 'grit' || kind === 'asphalt' ? .7 + random() * 1.5 : .45 + random() * 1.05;
    ctx.fillRect(x, y, radius, radius);
  }

  if (kind === 'wood') {
    ctx.lineWidth = bump ? 1.2 : .8;
    for (let y = 5; y < size; y += 9) {
      ctx.strokeStyle = bump ? 'rgba(190,190,190,.38)' : 'rgba(120,94,65,.085)';
      ctx.beginPath();
      ctx.moveTo(0, y + Math.sin(y) * 1.4);
      for (let x = 0; x <= size; x += 12) ctx.lineTo(x, y + Math.sin((x + y) * .11) * 1.9);
      ctx.stroke();
    }
  } else if (kind === 'metal' || kind === 'painted-metal' || kind === 'gunmetal' || kind === 'brass') {
    ctx.lineWidth = bump ? .8 : .55;
    for (let index = 0; index < Math.round(size / 4); index += 1) {
      const y = random() * size;
      const x = random() * size;
      const length = 8 + random() * size * .42;
      ctx.strokeStyle = bump ? 'rgba(196,196,196,.28)' : 'rgba(255,255,255,.045)';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(Math.min(size, x + length), y + (random() - .5) * 1.2);
      ctx.stroke();
    }
  } else if (kind === 'fabric' || kind === 'rubber') {
    ctx.lineWidth = .5;
    for (let step = 4; step < size; step += 6) {
      ctx.strokeStyle = bump ? 'rgba(178,178,178,.24)' : 'rgba(255,255,255,.032)';
      ctx.beginPath(); ctx.moveTo(0, step); ctx.lineTo(size, step); ctx.stroke();
      if (kind === 'fabric') { ctx.beginPath(); ctx.moveTo(step, 0); ctx.lineTo(step, size); ctx.stroke(); }
    }
  } else if (kind === 'concrete' || kind === 'asphalt' || kind === 'grit') {
    for (let index = 0; index < Math.round(size / 9); index += 1) {
      const x = random() * size;
      const y = random() * size;
      const radius = 1.2 + random() * 3.6;
      ctx.strokeStyle = bump ? 'rgba(80,80,80,.16)' : 'rgba(35,35,35,.045)';
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
    }
  }
  texture.update(false);
}

function createSurfaceTexture(B, scene, name, kind, size, bump = false) {
  const texture = new B.DynamicTexture(`chesscom-${name}-${bump ? 'normal' : 'surface'}`, { width:size, height:size }, scene, false);
  texture.wrapU = B.Texture.WRAP_ADDRESSMODE;
  texture.wrapV = B.Texture.WRAP_ADDRESSMODE;
  texture.anisotropicFilteringLevel = 8;
  paintSurfaceTexture(texture, kind, name, bump);
  return texture;
}

function enhanceMaterials(B, scene, quality, disposables) {
  const cache = new Map();
  for (const mat of scene.materials) {
    const profile = SURFACE_PROFILES[mat.name];
    if (!profile || mat.diffuseTexture || !('diffuseColor' in mat)) continue;
    const key = `${profile.kind}:${quality.textureSize}`;
    let pair = cache.get(key);
    if (!pair) {
      pair = {
        surface:createSurfaceTexture(B, scene, `${profile.kind}-${quality.textureSize}`, profile.kind, quality.textureSize, false),
        bump:createSurfaceTexture(B, scene, `${profile.kind}-${quality.textureSize}`, profile.kind, quality.textureSize, true),
      };
      cache.set(key, pair);
      disposables.push(pair.surface, pair.bump);
    }
    mat.diffuseTexture = pair.surface;
    mat.bumpTexture = pair.bump;
    pair.surface.uScale = pair.surface.vScale = profile.scale;
    pair.bump.uScale = pair.bump.vScale = profile.scale;
    pair.bump.level = profile.bump;
    if (profile.kind === 'metal' || profile.kind === 'gunmetal' || profile.kind === 'brass') {
      mat.specularPower = Math.max(Number(mat.specularPower) || 0, profile.kind === 'brass' ? 110 : 92);
    } else if (profile.kind === 'fabric' || profile.kind === 'rubber') {
      mat.specularPower = Math.min(Number(mat.specularPower) || 48, 24);
    }
  }
}

function installPostFx(B, scene, quality, disposables) {
  const camera = scene.activeCamera;
  if (!camera) return;
  try {
    const pipeline = new B.DefaultRenderingPipeline('chesscom-gpu-premium-v2', true, scene, [camera]);
    pipeline.samples = quality.msaa;
    pipeline.fxaaEnabled = true;
    pipeline.bloomEnabled = true;
    pipeline.bloomThreshold = .72;
    pipeline.bloomWeight = quality.bloomWeight;
    pipeline.bloomKernel = quality.bloomKernel;
    pipeline.sharpenEnabled = true;
    if (pipeline.sharpen) {
      pipeline.sharpen.edgeAmount = .18;
      pipeline.sharpen.colorAmount = 1.02;
    }
    disposables.push(pipeline);
  } catch (error) {
    console.warn('Chesscom premium post-process unavailable', error);
  }

  if (!quality.ssao || !B.SSAO2RenderingPipeline) return;
  try {
    const ssao = new B.SSAO2RenderingPipeline('chesscom-ssao-v2', scene, { ssaoRatio:.55, blurRatio:.5 }, [camera]);
    ssao.radius = 1.8;
    ssao.totalStrength = .70;
    ssao.expensiveBlur = false;
    disposables.push(ssao);
  } catch (error) {
    console.warn('Chesscom SSAO unavailable', error);
  }
}

function createParticleTexture(B, scene) {
  const texture = new B.DynamicTexture('chesscom-particle-dot', { width:32, height:32 }, scene, false);
  texture.hasAlpha = true;
  const ctx = texture.getContext();
  const gradient = ctx.createRadialGradient(16, 16, 1, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(.30, 'rgba(255,228,165,.95)');
  gradient.addColorStop(1, 'rgba(255,190,80,0)');
  ctx.clearRect(0, 0, 32, 32);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);
  texture.update(false);
  return texture;
}

function createCombatAudio() {
  if (typeof window === 'undefined') return { ricochet() {}, ouch() {}, destroy() {} };
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return { ricochet() {}, ouch() {}, destroy() {} };
  let ctx = null;
  let bus = null;

  function ensure() {
    if (ctx) return ctx;
    ctx = new AudioCtx();
    bus = ctx.createGain();
    bus.gain.value = .24;
    bus.connect(ctx.destination);
    return ctx;
  }

  function resume() {
    const audio = ensure();
    if (audio.state === 'suspended') void audio.resume().catch(() => {});
    return audio;
  }

  function tone({ from, to, duration, gain = .10, type = 'triangle', delay = 0 }) {
    const audio = resume();
    const now = audio.currentTime + .004 + delay;
    const osc = audio.createOscillator();
    const env = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(24, from), now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(24, to), now + duration);
    env.gain.setValueAtTime(Math.max(.0001, gain), now);
    env.gain.exponentialRampToValueAtTime(.0001, now + duration);
    osc.connect(env); env.connect(bus); osc.start(now); osc.stop(now + duration + .025);
  }

  function noise(duration, gain, highpass) {
    const audio = resume();
    const length = Math.max(1, Math.floor(audio.sampleRate * duration));
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / length);
    const src = audio.createBufferSource();
    const env = audio.createGain();
    const filter = audio.createBiquadFilter();
    src.buffer = buffer; env.gain.value = gain; filter.type = 'highpass'; filter.frequency.value = highpass;
    src.connect(env); env.connect(filter); filter.connect(bus); src.start();
  }

  function ricochet() {
    if (isFxMuted()) return;
    noise(.045, .10, 1450);
    tone({ from:2480, to:710, duration:.14, gain:.075, type:'sine' });
    tone({ from:1320, to:410, duration:.17, gain:.055, type:'triangle', delay:.018 });
  }

  function ouch() {
    if (isFxMuted()) return;
    noise(.052, .055, 420);
    tone({ from:235, to:132, duration:.17, gain:.10, type:'sawtooth' });
    tone({ from:455, to:245, duration:.14, gain:.055, type:'triangle', delay:.012 });
    tone({ from:780, to:520, duration:.09, gain:.026, type:'sine', delay:.018 });
  }

  return {
    ricochet,
    ouch,
    destroy() {
      if (!ctx) return;
      try { bus?.disconnect(); } catch {}
      void ctx.close().catch(() => {});
      ctx = null; bus = null;
    },
  };
}

function snapshotState(state) {
  return {
    selectedId:state.selectedId,
    targetId:state.targetId,
    friendlies:state.friendlies.map((unit) => ({ ...unit })),
    enemies:state.enemies.map((unit) => ({ ...unit })),
  };
}

function unitById(scene, id) {
  return scene.getTransformNodeByName?.(`unit-${id}`) || scene.transformNodes.find((node) => node.name === `unit-${id}`) || null;
}

function premiumMuzzlePosition(B, root, fallback) {
  const weapon = root?.metadata?.parts?.weapon;
  if (weapon?.getWorldMatrix && B?.Vector3?.TransformCoordinates) {
    weapon.computeWorldMatrix?.(true);
    const rootName = String(root?.name || '');
    const localX = rootName === 'unit-matthias' ? 1.065 : rootName === 'unit-sven' ? .82 : .91;
    return B.Vector3.TransformCoordinates(new B.Vector3(localX, 0, 0), weapon.getWorldMatrix());
  }
  return chesscomMuzzleWorldPosition(B, root, fallback);
}

function premiumAimPosition(B, root, fallback) {
  if (root?.getWorldMatrix && B?.Vector3?.TransformCoordinates) {
    root.computeWorldMatrix?.(true);
    const y = root.metadata?.operative ? 1.20 : .94;
    return B.Vector3.TransformCoordinates(new B.Vector3(0, y, -.04), root.getWorldMatrix());
  }
  return fallback.clone ? fallback.clone() : fallback;
}

function worldFallback(B, unit, lift = 1) {
  const tile = 1.55;
  const originX = -((10 - 1) * tile) / 2;
  const originZ = -((8 - 1) * tile) / 2;
  return new B.Vector3(originX + unit.x * tile, lift, originZ + unit.y * tile);
}

function setBillboardText(B, scene, text, position, hit, disposables) {
  const texture = new B.DynamicTexture(`combat-word-${text}-${performance.now()}`, { width:256, height:96 }, scene, false);
  texture.hasAlpha = true;
  const ctx = texture.getContext();
  ctx.clearRect(0, 0, 256, 96);
  ctx.font = '900 42px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(4,6,7,.92)';
  ctx.strokeText(text, 128, 48);
  ctx.fillStyle = hit ? '#ffe1a0' : '#f8cf6a';
  ctx.fillText(text, 128, 48);
  texture.update(false);
  const mat = new B.StandardMaterial(`combat-word-mat-${text}-${performance.now()}`, scene);
  mat.diffuseTexture = texture; mat.opacityTexture = texture; mat.emissiveTexture = texture;
  mat.useAlphaFromDiffuseTexture = true; mat.disableLighting = true; mat.backFaceCulling = false;
  const plane = B.MeshBuilder.CreatePlane(`premium-word-${text}`, { width:1.18, height:.44 }, scene);
  plane.material = mat; plane.position.copyFrom(position); plane.billboardMode = B.Mesh.BILLBOARDMODE_ALL; plane.isPickable = false;
  const born = performance.now();
  disposables.push(texture, mat, plane);
  return { plane, mat, born, life:430 };
}

function particleBurst(B, scene, quality, particleTexture, position, hit, disposables) {
  const gpu = quality.gpuParticles && B.GPUParticleSystem && Boolean(B.GPUParticleSystem.IsSupported);
  let system;
  try {
    system = gpu
      ? new B.GPUParticleSystem(`premium-${hit ? 'hit' : 'ricochet'}-${performance.now()}`, { capacity:64 }, scene)
      : new B.ParticleSystem(`premium-${hit ? 'hit' : 'ricochet'}-${performance.now()}`, 48, scene);
  } catch {
    system = new B.ParticleSystem(`premium-${hit ? 'hit' : 'ricochet'}-${performance.now()}`, 40, scene);
  }
  system.particleTexture = particleTexture;
  system.emitter = position.clone();
  system.minSize = hit ? .035 : .028; system.maxSize = hit ? .095 : .075;
  system.minLifeTime = .08; system.maxLifeTime = hit ? .24 : .20;
  system.emitRate = hit ? 520 : 360;
  system.minEmitPower = hit ? .55 : .42; system.maxEmitPower = hit ? 1.45 : 1.15;
  system.direction1 = new B.Vector3(-.9, .25, -.9);
  system.direction2 = new B.Vector3(.9, 1.1, .9);
  system.gravity = new B.Vector3(0, -4.8, 0);
  system.color1 = hit ? new B.Color4(1, .72, .25, 1) : new B.Color4(1, .86, .48, 1);
  system.color2 = hit ? new B.Color4(1, .28, .08, 1) : new B.Color4(1, .55, .12, 1);
  system.colorDead = new B.Color4(.3, .12, .03, 0);
  system.blendMode = B.ParticleSystem.BLENDMODE_ADD;
  system.updateSpeed = .012;
  system.start();
  const stopTimer = setTimeout(() => { try { system.stop(); } catch {} }, hit ? 42 : 34);
  const disposeTimer = setTimeout(() => { try { system.dispose(); } catch {} }, 520);
  disposables.push({ dispose() { clearTimeout(stopTimer); clearTimeout(disposeTimer); try { system.dispose(); } catch {} } });
}

function makeFxMaterials(B, scene, disposables) {
  const tracer = new B.StandardMaterial('premium-tracer-mat', scene);
  tracer.diffuseColor = new B.Color3(1, .68, .20); tracer.emissiveColor = new B.Color3(1, .47, .08); tracer.disableLighting = true;
  const hostileTracer = new B.StandardMaterial('premium-hostile-tracer-mat', scene);
  hostileTracer.diffuseColor = new B.Color3(1, .20, .12); hostileTracer.emissiveColor = new B.Color3(1, .08, .035); hostileTracer.disableLighting = true;
  const flash = new B.StandardMaterial('premium-muzzle-mat', scene);
  flash.diffuseColor = new B.Color3(1, .75, .27); flash.emissiveColor = new B.Color3(1, .50, .08); flash.disableLighting = true;
  const impact = new B.StandardMaterial('premium-impact-mat', scene);
  impact.diffuseColor = new B.Color3(1, .84, .44); impact.emissiveColor = new B.Color3(1, .36, .08); impact.disableLighting = true;
  disposables.push(tracer, hostileTracer, flash, impact);
  return { tracer, hostileTracer, flash, impact };
}

function startProjectile(B, scene, fxState, attack, roundIndex, roundHit, primaryHit, primaryMiss) {
  const sourceRoot = unitById(scene, attack.source.id);
  const targetRoot = unitById(scene, attack.target.id);
  const fallbackStart = worldFallback(B, attack.source, 1.0);
  const start = premiumMuzzlePosition(B, sourceRoot, fallbackStart);
  const fallbackTarget = worldFallback(B, attack.target, .95);
  const aim = premiumAimPosition(B, targetRoot, fallbackTarget);
  let end = aim.clone();
  if (!roundHit) {
    const offset = chesscomPremiumMissOffset(`${attack.source.id}:${attack.target.id}`, roundIndex);
    end.x += offset.x; end.z += offset.z; end.y = Math.max(.10, offset.y);
  } else {
    const jitter = seededRandom(hashString(`${attack.source.id}:${attack.target.id}:hit:${roundIndex}`));
    end.x += (jitter() - .5) * .12; end.y += (jitter() - .5) * .10; end.z += (jitter() - .5) * .12;
  }

  const bullet = B.MeshBuilder.CreateSphere(`premium-projectile-${performance.now()}-${roundIndex}`, { diameter:.075, segments:10 }, scene);
  bullet.position.copyFrom(start); bullet.material = attack.friendly ? fxState.materials.tracer : fxState.materials.hostileTracer; bullet.isPickable = false;
  const trail = B.MeshBuilder.CreateLines(`premium-trail-${performance.now()}-${roundIndex}`, { points:[start, start], updatable:true }, scene);
  trail.color = attack.friendly ? new B.Color3(1, .69, .24) : new B.Color3(1, .20, .13); trail.alpha = .92; trail.isPickable = false;
  const flash = B.MeshBuilder.CreateSphere(`premium-muzzle-${performance.now()}-${roundIndex}`, { diameter:.18, segments:8 }, scene);
  flash.position.copyFrom(start); flash.material = fxState.materials.flash; flash.scaling.set(1.8, .78, .78); flash.isPickable = false;
  const light = fxState.quality.tier === 'balanced' ? null : new B.PointLight(`premium-muzzle-light-${performance.now()}-${roundIndex}`, start.clone(), scene);
  if (light) { light.diffuse = new B.Color3(1, .50, .12); light.intensity = 2.8; light.range = 2.25; }

  fxState.disposables.push(bullet, trail, flash);
  if (light) fxState.disposables.push(light);
  fxState.projectiles.push({
    bullet, trail, flash, light, start, end, born:performance.now() + roundIndex * 44,
    duration:fxState.quality.projectileMs + Math.min(45, attack.distance * 7),
    hit:roundHit, targetRoot, primaryHit, primaryMiss, friendly:attack.friendly,
  });
}

function launchAttack(B, scene, fxState, attack) {
  const pattern = chesscomPremiumRoundPattern(attack.rounds, attack.hit);
  const hitIndices = pattern.map((value, index) => value ? index : -1).filter((index) => index >= 0);
  const missIndices = pattern.map((value, index) => !value ? index : -1).filter((index) => index >= 0);
  const primaryHitIndex = hitIndices.at(-1) ?? -1;
  const primaryMissIndex = missIndices[0] ?? -1;
  pattern.forEach((roundHit, index) => startProjectile(
    B, scene, fxState, attack, index, roundHit, index === primaryHitIndex, index === primaryMissIndex,
  ));
}

function attackDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function detectAttacks(previous, state) {
  if (!previous) return [];
  const attacks = [];
  const oldEnemies = new Map(previous.enemies.map((unit) => [unit.id, unit]));
  const oldFriendlies = new Map(previous.friendlies.map((unit) => [unit.id, unit]));
  const damagedEnemies = state.enemies.filter((unit) => (oldEnemies.get(unit.id)?.hp ?? unit.hp) > unit.hp);

  for (const shooter of state.friendlies) {
    const oldShooter = oldFriendlies.get(shooter.id);
    if (!oldShooter || !Number.isFinite(oldShooter.ammo) || !Number.isFinite(shooter.ammo) || shooter.ammo >= oldShooter.ammo) continue;
    const rounds = clamp(oldShooter.ammo - shooter.ammo, 1, 5);
    const target = damagedEnemies.find((enemy) => enemy.id === state.targetId)
      || damagedEnemies.slice().sort((a, b) => attackDistance(shooter, a) - attackDistance(shooter, b))[0]
      || state.enemies.find((enemy) => enemy.id === state.targetId)
      || state.enemies.filter((enemy) => enemy.hp > 0).slice().sort((a, b) => attackDistance(shooter, a) - attackDistance(shooter, b))[0];
    if (!target) continue;
    const oldTarget = oldEnemies.get(target.id);
    attacks.push({ source:shooter, target, rounds, hit:Boolean(oldTarget && target.hp < oldTarget.hp), friendly:true, distance:attackDistance(shooter, target) });
  }

  for (const target of state.friendlies) {
    const oldTarget = oldFriendlies.get(target.id);
    if (!oldTarget || target.hp >= oldTarget.hp) continue;
    const source = previous.enemies.filter((enemy) => enemy.hp > 0)
      .sort((a, b) => attackDistance(a, oldTarget) - attackDistance(b, oldTarget))[0];
    if (!source) continue;
    attacks.push({ source, target, rounds:1, hit:true, friendly:false, distance:attackDistance(source, target) });
  }
  return attacks;
}

function animatePremiumFx(B, scene, fxState) {
  const now = performance.now();
  for (let index = fxState.projectiles.length - 1; index >= 0; index -= 1) {
    const item = fxState.projectiles[index];
    if (now < item.born) {
      item.bullet.isVisible = false; item.trail.isVisible = false; item.flash.isVisible = false;
      if (item.light) item.light.intensity = 0;
      continue;
    }
    item.bullet.isVisible = true; item.trail.isVisible = true; item.flash.isVisible = true;
    const raw = clamp((now - item.born) / item.duration, 0, 1);
    const eased = 1 - Math.pow(1 - raw, 3);
    const current = B.Vector3.Lerp(item.start, item.end, eased);
    item.bullet.position.copyFrom(current);
    const tailProgress = clamp(eased - .16, 0, 1);
    const tail = B.Vector3.Lerp(item.start, item.end, tailProgress);
    B.MeshBuilder.CreateLines(item.trail.name, { points:[tail, current], instance:item.trail });
    const flashProgress = clamp((now - item.born) / 70, 0, 1);
    item.flash.scaling.set(1.8 + flashProgress * .9, .78 * (1 - flashProgress), .78 * (1 - flashProgress));
    item.flash.visibility = 1 - flashProgress;
    if (item.light) item.light.intensity = (1 - flashProgress) * 2.8;
    if (raw < 1) continue;

    const impactPos = item.end.clone();
    particleBurst(B, scene, fxState.quality, fxState.particleTexture, impactPos, item.hit, fxState.disposables);
    const pop = B.MeshBuilder.CreateSphere(`premium-impact-pop-${now}`, { diameter:item.hit ? .23 : .16, segments:10 }, scene);
    pop.position.copyFrom(impactPos); pop.material = fxState.materials.impact; pop.isPickable = false;
    fxState.impacts.push({ mesh:pop, born:now, life:item.hit ? 190 : 150 });
    fxState.disposables.push(pop);

    if (item.hit && item.primaryHit) {
      fxState.audio.ouch();
      const labelPos = impactPos.add(new B.Vector3(0, .72, 0));
      fxState.words.push(setBillboardText(B, scene, 'AUCH!', labelPos, true, fxState.disposables));
      if (item.targetRoot) fxState.reactions.set(item.targetRoot, { born:now, until:now + 240 });
    } else if (!item.hit && item.primaryMiss) {
      fxState.audio.ricochet();
      const labelPos = impactPos.add(new B.Vector3(0, .46, 0));
      fxState.words.push(setBillboardText(B, scene, 'PIÑAU!', labelPos, false, fxState.disposables));
      const ricochetEnd = impactPos.add(new B.Vector3(item.friendly ? .58 : -.58, .22, .22));
      const bounce = B.MeshBuilder.CreateLines(`premium-ricochet-${now}`, { points:[impactPos, ricochetEnd] }, scene);
      bounce.color = new B.Color3(1, .73, .28); bounce.alpha = .84; bounce.isPickable = false;
      fxState.impacts.push({ mesh:bounce, born:now, life:125 }); fxState.disposables.push(bounce);
    }

    try { item.bullet.dispose(); item.trail.dispose(); item.flash.dispose(); item.light?.dispose(); } catch {}
    fxState.projectiles.splice(index, 1);
  }

  for (let index = fxState.impacts.length - 1; index >= 0; index -= 1) {
    const item = fxState.impacts[index];
    const progress = clamp((now - item.born) / item.life, 0, 1);
    item.mesh.visibility = 1 - progress;
    const scale = 1 + progress * 1.4;
    item.mesh.scaling.set(scale, scale, scale);
    if (progress >= 1) { try { item.mesh.dispose(); } catch {} fxState.impacts.splice(index, 1); }
  }

  for (let index = fxState.words.length - 1; index >= 0; index -= 1) {
    const item = fxState.words[index];
    const progress = clamp((now - item.born) / item.life, 0, 1);
    item.plane.position.y += scene.getEngine().getDeltaTime() * .00034;
    item.mat.alpha = 1 - progress;
    if (progress >= 1) { try { item.plane.dispose(); item.mat.dispose(); } catch {} fxState.words.splice(index, 1); }
  }

  for (const [root, reaction] of fxState.reactions) {
    const progress = clamp((now - reaction.born) / Math.max(1, reaction.until - reaction.born), 0, 1);
    if (now >= reaction.until) {
      root.scaling.set(1, 1, 1); root.rotation.x = 0; root.rotation.z = 0; fxState.reactions.delete(root); continue;
    }
    const kick = Math.sin(progress * Math.PI) * (1 - progress);
    root.scaling.set(1 + kick * .035, 1 - kick * .025, 1 + kick * .025);
    root.rotation.x = -kick * .055;
    root.rotation.z = (hashString(root.name) % 2 ? 1 : -1) * kick * .075;
  }
}

function sceneFromBabylon(B) {
  return B.EngineStore?.LastCreatedScene
    || B.EngineStore?.Instances?.at?.(-1)?.scenes?.at?.(-1)
    || null;
}

function hideBaseBallistics(scene) {
  const hide = (mesh) => {
    if (!BASE_FX_NAMES.has(mesh?.name)) return;
    mesh.isVisible = false;
    mesh.visibility = 0;
  };
  scene.meshes.forEach(hide);
  const observer = scene.onNewMeshAddedObservable.add(hide);
  return () => scene.onNewMeshAddedObservable.remove(observer);
}

export async function createChesscomBabylon(host, options = {}) {
  const B = await loadChesscomBabylon();
  const { onReady, ...baseOptions } = options;
  const base = await createBaseChesscomBabylon(host, { ...baseOptions, onReady:() => {} });
  const scene = sceneFromBabylon(B);
  if (!scene) {
    onReady?.(`BABYLON.JS ${BABYLON_VERSION} · TACTICAL PREMIUM V1`);
    return base;
  }

  const engine = scene.getEngine();
  const caps = engine.getCaps?.() || {};
  const coarse = Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
  const quality = chesscomGpuQualityProfile({
    coarse,
    dpr:window.devicePixelRatio || 1,
    maxTextureSize:caps.maxTextureSize || 2048,
    webglVersion:engine.webGLVersion || 1,
  });
  const disposables = [];
  enhanceMaterials(B, scene, quality, disposables);
  installPostFx(B, scene, quality, disposables);
  const particleTexture = createParticleTexture(B, scene); disposables.push(particleTexture);
  const materials = makeFxMaterials(B, scene, disposables);
  const audio = createCombatAudio();
  const restoreBaseBallistics = hideBaseBallistics(scene);
  const fxState = {
    quality, materials, particleTexture, audio, disposables,
    projectiles:[], impacts:[], words:[], reactions:new Map(),
  };
  const beforeRender = scene.onBeforeRenderObservable.add(() => animatePremiumFx(B, scene, fxState));
  let previous = null;

  onReady?.(`BABYLON.JS ${BABYLON_VERSION} · GPU PREMIUM V2 · BALLISTICS`);

  return {
    ...base,
    update(state, ui = {}) {
      base.update(state, ui);
      if (previous) {
        const attacks = detectAttacks(previous, state);
        attacks.forEach((attack) => launchAttack(B, scene, fxState, attack));
      }
      previous = snapshotState(state);
    },
    destroy() {
      scene.onBeforeRenderObservable.remove(beforeRender);
      restoreBaseBallistics();
      audio.destroy();
      for (const item of disposables.reverse()) {
        try { item?.dispose?.(); } catch {}
      }
      fxState.projectiles.length = 0; fxState.impacts.length = 0; fxState.words.length = 0; fxState.reactions.clear();
      base.destroy();
    },
  };
}

export { BABYLON_VERSION, loadChesscomBabylon };
