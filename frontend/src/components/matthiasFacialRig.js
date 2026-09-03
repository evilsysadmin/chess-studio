export const MATTHIAS_FACIAL_RIG_VERSION = 'face-v2';

const SUPPORTED_EXPRESSIONS = new Set([
  'stern',
  'alert',
  'focus',
  'glare',
  'smirk',
  'grumble',
  'grumble-hot',
  'simmer',
  'coffee',
]);

const SUPPORTED_GESTURES = new Set([
  'idle',
  'glance',
  'glare',
  'head-left',
  'head-right',
  'lean-in',
  'survey',
  'coffee',
  'speaking',
  'smirk',
  'grumble',
]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function smooth01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function gaussian(x, y, cx, cy, sx, sy) {
  const dx = (x - cx) / sx;
  const dy = (y - cy) / sy;
  return Math.exp(-(dx * dx + dy * dy) * 2.15);
}

function shortPulse(time, period, start, rise, hold, fall) {
  const local = ((time % period) + period) % period;
  const riseEnd = start + rise;
  const holdEnd = riseEnd + hold;
  const fallEnd = holdEnd + fall;
  if (local < start || local >= fallEnd) return 0;
  if (local < riseEnd) return smooth01((local - start) / Math.max(.001, rise));
  if (local < holdEnd) return 1;
  return 1 - smooth01((local - holdEnd) / Math.max(.001, fall));
}

function signedHold(time, period, firstStart, secondStart) {
  const first = shortPulse(time, period, firstStart, .08, .34, .13);
  const second = shortPulse(time, period, secondStart, .08, .28, .13);
  return first - second;
}

export function normalizeMatthiasFacialExpression(value = 'stern') {
  const key = String(value || '').trim().toLowerCase();
  return SUPPORTED_EXPRESSIONS.has(key) ? key : 'stern';
}

export function normalizeMatthiasFacialGesture(value = 'idle') {
  const key = String(value || '').trim().toLowerCase();
  return SUPPORTED_GESTURES.has(key) ? key : 'idle';
}

function blinkAmount(time, expression) {
  const first = shortPulse(time + 1.11, 5.3, .12, .048, .018, .075);
  const second = shortPulse(time + 2.47, 8.7, .22, .052, .022, .082);
  const doubleBlink = shortPulse(time + .61, 13.1, .58, .042, .015, .065) * .68;
  const raw = Math.max(first, second, doubleBlink);
  if (expression === 'glare' || expression === 'grumble-hot') return raw * .48;
  if (expression === 'smirk' || expression === 'focus') return raw * .78;
  return raw;
}

function expressionStrength(expression) {
  if (expression === 'grumble-hot') return 1;
  if (expression === 'simmer' || expression === 'glare') return .9;
  if (expression === 'grumble' || expression === 'focus') return .78;
  if (expression === 'smirk') return .74;
  if (expression === 'alert') return .52;
  if (expression === 'coffee') return .34;
  return .3;
}

function surveyDirection(time) {
  const local = ((time % 2.35) + 2.35) % 2.35;
  if (local < .18) return -smooth01(local / .18);
  if (local < .72) return -1;
  if (local < .96) return -(1 - smooth01((local - .72) / .24));
  if (local < 1.16) return smooth01((local - .96) / .20);
  if (local < 1.76) return 1;
  if (local < 2.02) return 1 - smooth01((local - 1.76) / .26);
  return 0;
}

function gazeDirection(time, gesture) {
  if (gesture === 'head-left') return -1;
  if (gesture === 'head-right') return 1;
  if (gesture === 'survey') return surveyDirection(time);
  if (gesture === 'glance') return (Math.floor((time + .7) / 2.7) % 2 === 0 ? 1 : -1) * .88;
  return signedHold(time + .35, 8.9, .7, 4.95) * .42;
}

function speechSyllable(time) {
  const fast = Math.sin(time * 9.7) * .5 + .5;
  const slow = Math.sin(time * 14.9 + .83) * .5 + .5;
  const gate = Math.sin(time * 3.05 + .4) * .5 + .5;
  return smooth01(clamp01(.12 + fast * .47 + slow * .29 + gate * .12));
}

export function matthiasFacialMotionSample({
  expression = 'stern',
  gesture = 'idle',
  x = 0,
  y = 0,
  imageAspect = 1,
  time = 0,
  speaking = false,
  intensity = 1,
} = {}) {
  const face = normalizeMatthiasFacialExpression(expression);
  const faceGesture = normalizeMatthiasFacialGesture(gesture);
  const nx = imageAspect ? x / imageAspect : x;
  const strength = expressionStrength(face) * clamp(Number(intensity) || 1, .75, 1.45);

  // Landmarks stay broad and low-amplitude. The v2 rig adds intention and
  // irregular cadence, but keeps the canonical raster inside the same hard
  // anti-melt envelope as v1.
  const leftEye = gaussian(nx, y, -.105, .395, .105, .055);
  const rightEye = gaussian(nx, y, .105, .395, .105, .055);
  const leftBrow = gaussian(nx, y, -.105, .475, .135, .07);
  const rightBrow = gaussian(nx, y, .105, .475, .135, .07);
  const leftMouth = gaussian(nx, y, -.105, .175, .11, .07);
  const rightMouth = gaussian(nx, y, .105, .175, .11, .07);
  const mouthCenter = gaussian(nx, y, 0, .17, .14, .075);
  const jaw = gaussian(nx, y, 0, .095, .20, .105);
  const leftCheek = gaussian(nx, y, -.17, .245, .15, .13);
  const rightCheek = gaussian(nx, y, .17, .245, .15, .13);
  const noseCore = gaussian(nx, y, 0, .305, .07, .105);
  const faceEnvelope = gaussian(nx, y, 0, .30, .34, .35);
  const coreProtection = 1 - noseCore * .92;

  let dx = 0;
  let dy = 0;
  let dz = 0;
  let energy = 0;

  const blink = blinkAmount(time, face);
  if (blink > 0) {
    dy -= (leftEye + rightEye) * blink * .0125;
    dz -= (leftEye + rightEye) * blink * .0025;
    energy = Math.max(energy, blink * .45);
  }

  if (face === 'alert') {
    dy += (leftBrow + rightBrow) * .0042 * strength;
    dy += (leftEye + rightEye) * .0028 * strength;
  } else if (face === 'focus') {
    dx += leftBrow * .0062 * strength;
    dx -= rightBrow * .0062 * strength;
    dy -= (leftBrow + rightBrow) * .0053 * strength;
    dy -= (leftEye + rightEye) * .0025 * strength;
  } else if (face === 'glare' || face === 'simmer') {
    const glareScale = face === 'glare' ? 1 : .84;
    dx += leftBrow * .0081 * strength * glareScale;
    dx -= rightBrow * .0081 * strength * glareScale;
    dy -= (leftBrow + rightBrow) * .0076 * strength * glareScale;
    dy -= (leftEye + rightEye) * .0049 * strength * glareScale;
    dy -= jaw * .0027 * strength;
  } else if (face === 'smirk') {
    const smugPulse = .88 + shortPulse(time + .2, 3.7, .4, .18, .42, .28) * .12;
    dy += rightMouth * .0122 * strength * smugPulse;
    dx += rightMouth * .0072 * strength * smugPulse;
    dy += rightCheek * .0046 * strength;
    dy -= leftMouth * .0022 * strength;
    dz += rightCheek * .003 * strength;
  } else if (face === 'grumble' || face === 'grumble-hot') {
    const hot = face === 'grumble-hot' ? 1 : .72;
    const jawTension = .86 + shortPulse(time + .18, 2.9, .36, .08, .22, .12) * .14;
    dx += leftBrow * .009 * strength * hot;
    dx -= rightBrow * .009 * strength * hot;
    dy -= (leftBrow + rightBrow) * .0086 * strength * hot;
    dy -= (leftEye + rightEye) * .005 * strength * hot;
    dy -= (leftMouth + rightMouth) * .0072 * strength * hot;
    dx -= leftMouth * .004 * strength * hot;
    dx += rightMouth * .004 * strength * hot;
    dy -= jaw * .0072 * strength * hot * jawTension;
    dz += jaw * .0037 * strength * hot;
  } else if (face === 'coffee') {
    const swallow = shortPulse(time + .55, 4.7, 1.45, .12, .08, .18);
    dy -= jaw * swallow * .0048 * strength;
    dy += mouthCenter * swallow * .002 * strength;
  } else {
    dx += leftBrow * .0031 * strength;
    dx -= rightBrow * .0031 * strength;
    dy -= (leftBrow + rightBrow) * .0025 * strength;
  }

  const direction = gazeDirection(time, faceGesture);
  const gazeScale = faceGesture === 'survey' ? 1 : faceGesture === 'glance' ? .9 : .72;
  if (direction !== 0) {
    const eyeShift = direction * .0052 * strength * gazeScale;
    dx += (leftEye + rightEye) * eyeShift;
    dx += (leftBrow + rightBrow) * eyeShift * .26;
    energy = Math.max(energy, Math.abs(direction) * .28);
  }

  if (faceGesture === 'glare') {
    dx += leftEye * .0019 * strength;
    dx -= rightEye * .0019 * strength;
    dy -= (leftBrow + rightBrow) * .0018 * strength;
    dz += (leftEye + rightEye) * .0012 * strength;
  } else if (faceGesture === 'lean-in') {
    dx += leftBrow * .0017 * strength;
    dx -= rightBrow * .0017 * strength;
    dy -= (leftEye + rightEye) * .0012 * strength;
    dz += (leftEye + rightEye + leftCheek + rightCheek) * .0018 * strength;
  } else if (faceGesture === 'smirk') {
    dy -= rightEye * .0019 * strength;
    dy += rightBrow * .0013 * strength;
  } else if (faceGesture === 'grumble') {
    const twitch = signedHold(time + .14, 2.35, .22, 1.34);
    dx += (leftMouth + rightMouth) * twitch * .0014 * strength;
    dy -= jaw * Math.abs(twitch) * .0012 * strength;
  } else if (faceGesture === 'coffee') {
    const settle = shortPulse(time + .3, 4.7, 1.72, .12, .12, .18);
    dy -= (leftEye + rightEye) * settle * .0011 * strength;
  }

  if (speaking || faceGesture === 'speaking') {
    const syllable = speechSyllable(time);
    const cadence = .62 + (Math.sin(time * 2.75 + .2) * .5 + .5) * .38;
    dy -= jaw * syllable * cadence * .0064 * strength;
    dy += mouthCenter * syllable * .0027 * strength;
    dz += jaw * syllable * .0029 * strength;
    energy = Math.max(energy, syllable * .65);
  }

  dx *= faceEnvelope * coreProtection;
  dy *= faceEnvelope * coreProtection;
  dz *= faceEnvelope * coreProtection;

  dx = clamp(dx, -.017, .017);
  dy = clamp(dy, -.019, .019);
  dz = clamp(dz, -.006, .006);

  return {
    dx,
    dy,
    dz,
    energy: Math.max(energy, Math.min(1, (Math.abs(dx) + Math.abs(dy)) * 42)),
  };
}
