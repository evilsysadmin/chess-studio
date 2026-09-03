export const MATTHIAS_FACIAL_RIG_VERSION = 'face-v1';

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
  if (expression === 'glare' || expression === 'grumble-hot') return 0;
  const first = shortPulse(time + 1.37, 5.9, .08, .055, .025, .085);
  const doubleBlink = shortPulse(time + 1.37, 11.8, .36, .045, .018, .07) * .72;
  return Math.max(first, doubleBlink);
}

function expressionStrength(expression) {
  if (expression === 'grumble-hot') return 1;
  if (expression === 'simmer' || expression === 'glare') return .86;
  if (expression === 'grumble' || expression === 'focus') return .72;
  if (expression === 'smirk') return .68;
  if (expression === 'alert') return .48;
  if (expression === 'coffee') return .32;
  return .26;
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
    dy += (leftBrow + rightBrow) * .0038 * strength;
    dy += (leftEye + rightEye) * .0025 * strength;
  } else if (face === 'focus') {
    dx += leftBrow * .0055 * strength;
    dx -= rightBrow * .0055 * strength;
    dy -= (leftBrow + rightBrow) * .0048 * strength;
    dy -= (leftEye + rightEye) * .0022 * strength;
  } else if (face === 'glare' || face === 'simmer') {
    const glareScale = face === 'glare' ? 1 : .84;
    dx += leftBrow * .0075 * strength * glareScale;
    dx -= rightBrow * .0075 * strength * glareScale;
    dy -= (leftBrow + rightBrow) * .0072 * strength * glareScale;
    dy -= (leftEye + rightEye) * .0046 * strength * glareScale;
    dy -= jaw * .0025 * strength;
  } else if (face === 'smirk') {
    dy += rightMouth * .0115 * strength;
    dx += rightMouth * .0068 * strength;
    dy += rightCheek * .0042 * strength;
    dy -= leftMouth * .002 * strength;
    dz += rightCheek * .0028 * strength;
  } else if (face === 'grumble' || face === 'grumble-hot') {
    const hot = face === 'grumble-hot' ? 1 : .72;
    dx += leftBrow * .0085 * strength * hot;
    dx -= rightBrow * .0085 * strength * hot;
    dy -= (leftBrow + rightBrow) * .0082 * strength * hot;
    dy -= (leftEye + rightEye) * .0048 * strength * hot;
    dy -= (leftMouth + rightMouth) * .0068 * strength * hot;
    dx -= leftMouth * .0038 * strength * hot;
    dx += rightMouth * .0038 * strength * hot;
    dy -= jaw * .0068 * strength * hot;
    dz += jaw * .0035 * strength * hot;
  } else if (face === 'coffee') {
    const swallow = shortPulse(time + .55, 4.7, 1.45, .12, .08, .18);
    dy -= jaw * swallow * .0045 * strength;
    dy += mouthCenter * swallow * .0018 * strength;
  } else {
    dx += leftBrow * .0028 * strength;
    dx -= rightBrow * .0028 * strength;
    dy -= (leftBrow + rightBrow) * .0022 * strength;
  }

  if (speaking) {
    const syllable = faceGesture === 'speaking'
      ? speechSyllable(time)
      : (Math.sin(time * 11.2) * .5 + .5);
    const cadence = faceGesture === 'speaking'
      ? .62 + (Math.sin(time * 2.75 + .2) * .5 + .5) * .38
      : .45 + (Math.sin(time * 3.1) * .5 + .5) * .55;
    dy -= jaw * syllable * cadence * .0062 * strength;
    dy += mouthCenter * syllable * .0025 * strength;
    dz += jaw * syllable * .0028 * strength;
    energy = Math.max(energy, syllable * .65);
  }

  if (faceGesture === 'glance' || faceGesture === 'survey' || faceGesture === 'head-left' || faceGesture === 'head-right') {
    let direction = 0;
    if (faceGesture === 'head-left') direction = -1;
    else if (faceGesture === 'head-right') direction = 1;
    else direction = Math.sin(time * (faceGesture === 'survey' ? 2.1 : 1.55));
    const eyeShift = direction * .0048 * strength;
    dx += (leftEye + rightEye) * eyeShift;
    dx += (leftBrow + rightBrow) * eyeShift * .35;
    energy = Math.max(energy, Math.abs(direction) * .28);
  }

  // War Room-only intent cues. These gesture names were not accepted by v1,
  // so Home and existing callers retain their previous motion contract.
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
    const smugPulse = .82 + shortPulse(time + .2, 3.7, .4, .18, .42, .28) * .18;
    dy += rightMouth * .0015 * strength * smugPulse;
    dy -= rightEye * .0019 * strength * smugPulse;
    dy += rightBrow * .0013 * strength * smugPulse;
  } else if (faceGesture === 'grumble') {
    const twitch = signedHold(time + .14, 2.35, .22, 1.34);
    dx += (leftMouth + rightMouth) * twitch * .0014 * strength;
    dy -= jaw * Math.abs(twitch) * .0012 * strength;
  } else if (faceGesture === 'coffee') {
    const settle = shortPulse(time + .3, 4.7, 1.72, .12, .12, .18);
    dy -= (leftEye + rightEye) * settle * .0011 * strength;
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
