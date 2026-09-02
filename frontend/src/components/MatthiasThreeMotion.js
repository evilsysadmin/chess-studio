function cue(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function matthiasThreeMotionProfile({ scene = '', activity = '', speaking = false } = {}) {
  if (speaking) return 'speak';
  const sceneKey = cue(scene);
  const activityKey = cue(activity);
  if (/sleep|sobando/.test(sceneKey) || /sobando|cabeceando/.test(activityKey)) return 'sleep';
  if (/coffee|beer-break|night|breakfast/.test(sceneKey) || /cafe|cerve|desayuno/.test(activityKey)) return 'sip';
  if (/lunch|bocata/.test(sceneKey) || /comida|cena|repostando/.test(activityKey)) return 'bite';
  if (/inception/.test(sceneKey) || /partida|ajedrez dentro/.test(activityKey)) return 'think';
  if (/ops/.test(sceneKey) || /operacion|notas/.test(activityKey)) return 'write';
  if (/dossier/.test(sceneKey) || /auditoria|expedient/.test(activityKey)) return 'dossier';
  if (/strategy|weekly|reading/.test(sceneKey) || /lectura|estudio|manual|estrategia|prensa/.test(activityKey)) return 'read';
  return 'idle';
}

export function matthiasThreeMotionPhase({ scene = '', activity = '' } = {}) {
  const key = `${cue(scene)}|${cue(activity)}`;
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 3600) / 1000;
}

export function normalizeMatthiasMotionIntensity(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(.65, Math.min(1.35, parsed));
}

export function matthiasThreeRenderProfile({ coarsePointer = false, width = 0, height = 0 } = {}) {
  const safeWidth = Math.max(0, Number(width) || 0);
  const safeHeight = Math.max(0, Number(height) || 0);
  const compactSurface = coarsePointer && safeWidth > 0 && safeHeight > 0 && Math.min(safeWidth, safeHeight) <= 96;

  if (compactSurface) {
    return { tier: 'compact', widthSegments: 14, heightSegments: 16, maxFps: 30, pixelRatioCap: 1 };
  }
  if (coarsePointer) {
    return { tier: 'coarse', widthSegments: 20, heightSegments: 24, maxFps: 45, pixelRatioCap: 1.15 };
  }
  return { tier: 'full', widthSegments: 28, heightSegments: 32, maxFps: 60, pixelRatioCap: 1.5 };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smooth01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function gestureCycle(time, {
  period = 8.4,
  delay = 0.45,
  rise = 1.0,
  hold = 0.75,
  fall = 1.05,
} = {}) {
  const local = ((time % period) + period) % period;
  const riseEnd = delay + rise;
  const holdEnd = riseEnd + hold;
  const fallEnd = holdEnd + fall;
  if (local < delay || local >= fallEnd) return 0;
  if (local < riseEnd) return smooth01((local - delay) / Math.max(.001, rise));
  if (local < holdEnd) return 1;
  return 1 - smooth01((local - holdEnd) / Math.max(.001, fall));
}

function gaussian(x, y, cx, cy, sx, sy) {
  const dx = (x - cx) / sx;
  const dy = (y - cy) / sy;
  return Math.exp(-(dx * dx + dy * dy) * 2.15);
}

function rotateRegion(x, y, pivotX, pivotY, angle, weight) {
  if (!angle || !weight) return { dx: 0, dy: 0 };
  const rx = x - pivotX;
  const ry = y - pivotY;
  const sin = Math.sin(angle) * weight;
  const cos = 1 + (Math.cos(angle) - 1) * weight;
  return {
    dx: rx * cos - ry * sin + pivotX - x,
    dy: rx * sin + ry * cos + pivotY - y,
  };
}

function deformVertex(profile, x, y, imageAspect, time, speaking) {
  const nx = imageAspect ? x / imageAspect : x;
  const head = gaussian(nx, y, 0, .30, .42, .42);
  const mouth = gaussian(nx, y, 0, .18, .20, .12);
  const eyeBand = gaussian(nx, y, 0, .40, .28, .10);
  const leftArm = gaussian(nx, y, -.36, -.18, .32, .52);
  const rightArm = gaussian(nx, y, .36, -.18, .32, .52);
  const centerProp = gaussian(nx, y, 0, -.40, .36, .30);
  const rightProp = gaussian(nx, y, .40, -.34, .30, .34);
  const book = gaussian(nx, y, 0, -.46, .58, .28);
  const body = gaussian(nx, y, 0, -.05, .74, .92);
  const idleBreath = Math.sin(time * 1.25) * .0048 * body;
  let dx = 0;
  let dy = idleBreath;
  let dz = 0;
  let energy = 0;

  if (profile === 'idle') {
    const action = gestureCycle(time + .2, { period: 10.6, delay: .7, rise: .8, hold: .35, fall: .9 });
    const glance = Math.sin(time * 1.7) * action;
    const rot = rotateRegion(nx, y, 0, .17, -.026 * action, head);
    dx += rot.dx * imageAspect + head * glance * .006;
    dy += rot.dy;
    dz += head * action * .008;
    energy = action;
  } else if (profile === 'sip') {
    const action = gestureCycle(time, { period: 8.4, delay: .45, rise: 1.05, hold: .85, fall: 1.12 });
    const swallow = action > .94 ? Math.sin(time * 8.2) * .5 + .5 : 0;
    dy += rightArm * action * .205;
    dy += rightProp * action * .305;
    dx -= rightArm * action * .045;
    dx -= rightProp * action * .075;
    const rot = rotateRegion(nx, y, 0, .18, .046 * action, head);
    dx += rot.dx * imageAspect;
    dy += rot.dy - head * action * .022 - head * swallow * .007;
    dz += (rightArm + rightProp) * action * .022;
    energy = action;
  } else if (profile === 'bite') {
    const action = gestureCycle(time + .15, { period: 9.2, delay: .5, rise: 1.15, hold: .95, fall: 1.18 });
    const chew = action > .9 ? (Math.sin(time * 10.5) * .5 + .5) : 0;
    dy += centerProp * action * .355;
    dy += leftArm * action * .225;
    dy += rightArm * action * .225;
    dx += leftArm * action * .035;
    dx -= rightArm * action * .035;
    const rot = rotateRegion(nx, y, 0, .18, -.052 * action, head);
    dx += rot.dx * imageAspect;
    dy += rot.dy - head * action * .034 - mouth * chew * .012;
    dz += centerProp * action * .028 + (leftArm + rightArm) * action * .012;
    energy = action;
  } else if (profile === 'write') {
    const action = gestureCycle(time, { period: 7.8, delay: .35, rise: .7, hold: 1.8, fall: .8 });
    const scribble = Math.sin(time * 13.5) * action;
    const scratch = Math.cos(time * 8.4) * action;
    dx += rightArm * scribble * .052 + rightProp * scribble * .035;
    dy += rightArm * action * .052 + rightArm * scratch * .014;
    dy += rightProp * action * .028;
    const rot = rotateRegion(nx, y, 0, .18, -.034 * action, head);
    dx += rot.dx * imageAspect;
    dy += rot.dy - head * action * .012;
    dz += rightArm * action * .014;
    energy = action;
  } else if (profile === 'dossier') {
    const action = gestureCycle(time + .1, { period: 8.9, delay: .45, rise: .85, hold: 1.55, fall: .95 });
    const scan = Math.sin(time * 4.8) * action;
    dx += head * scan * .017;
    dy += rightArm * action * .065;
    dy += rightProp * action * .085;
    dx -= rightProp * action * .018;
    dz += rightProp * action * .018;
    const rot = rotateRegion(nx, y, 0, .18, -.022 * action, head);
    dx += rot.dx * imageAspect;
    dy += rot.dy;
    energy = action;
  } else if (profile === 'read') {
    const action = .38 + gestureCycle(time, { period: 8.8, delay: .6, rise: .75, hold: 1.85, fall: .8 }) * .62;
    const scan = Math.sin(time * 3.7) * action;
    const page = gestureCycle(time + 4.2, { period: 9.6, delay: .25, rise: .45, hold: .18, fall: .55 });
    dx += head * scan * .018;
    dy += head * Math.sin(time * 1.9) * .0045;
    dx += book * page * .018;
    dy += book * page * .012;
    dz += head * action * .007 + book * page * .006;
    energy = Math.max(action * .55, page);
  } else if (profile === 'think') {
    const action = gestureCycle(time + .2, { period: 8.2, delay: .5, rise: .95, hold: 1.2, fall: 1.0 });
    // Chess-inception used to rotate a gaussian region around the face itself.
    // On a single raster portrait that bends eyes, mouth and cap independently
    // and reads as a melting face. Keep tactical intent in the arm only; the
    // head/body lean is applied later as one rigid Three.js mesh transform.
    dy += rightArm * action * .17;
    dx -= rightArm * action * .055;
    dz += rightArm * action * .02;
    energy = action;
  } else if (profile === 'sleep') {
    const local = ((time + .4) % 9.8 + 9.8) % 9.8;
    const action = gestureCycle(time + .4, { period: 9.8, delay: .5, rise: 1.8, hold: 1.4, fall: 1.8 });
    const nod = action * (.72 + Math.sin(local * 1.1) * .18);
    const rot = rotateRegion(nx, y, 0, .17, -.082 * nod, head);
    dx += rot.dx * imageAspect;
    dy += rot.dy - head * nod * .048 + body * Math.sin(time * .72) * .005;
    dz -= head * nod * .015;
    energy = action;
  } else if (profile === 'speak') {
    const action = speaking ? (.62 + Math.sin(time * 3.8) * .18) : gestureCycle(time, { period: 5, delay: .2, rise: .5, hold: 1.2, fall: .6 });
    const syllable = speaking ? Math.sin(time * 11.5) : 0;
    const rot = rotateRegion(nx, y, 0, .16, Math.sin(time * 2.4) * .017 * action, head);
    dx += rot.dx * imageAspect;
    dy += rot.dy - body * action * .006 + mouth * syllable * .009;
    dz += head * action * .01;
    energy = action;
  }

  if (profile !== 'sleep') {
    const blink = gestureCycle(time + 5.1, { period: 7.4, delay: 0, rise: .06, hold: .025, fall: .09 });
    dy -= eyeBand * blink * .012;
    energy = Math.max(energy, blink * .3);
  }

  return { dx, dy, dz, energy };
}

export function matthiasThreeMotionSample({
  profile = 'idle',
  x = 0,
  y = 0,
  imageAspect = 1,
  time = 0,
  speaking = false,
  motionIntensity = 1,
} = {}) {
  const motion = deformVertex(profile, x, y, imageAspect, time, speaking);
  const intensity = normalizeMatthiasMotionIntensity(motionIntensity);
  return {
    dx: motion.dx * intensity,
    dy: motion.dy * intensity,
    dz: motion.dz * intensity,
    energy: motion.energy,
  };
}

export function matthiasThreeRigidPose({ profile = 'idle', time = 0, motionIntensity = 1 } = {}) {
  const intensity = normalizeMatthiasMotionIntensity(motionIntensity);
  if (profile !== 'think') return { x: 0, y: 0, rotationZ: 0, rotationY: 0 };
  const action = gestureCycle(time + .2, { period: 8.2, delay: .5, rise: .95, hold: 1.2, fall: 1.0 });
  return {
    x: Math.sin(time * 1.35) * .003 * action * intensity,
    y: -action * .008 * intensity,
    rotationZ: (-.014 * action + Math.sin(time * 1.15) * .0025) * intensity,
    rotationY: Math.sin(time * .92) * .009 * action * intensity,
  };
}
