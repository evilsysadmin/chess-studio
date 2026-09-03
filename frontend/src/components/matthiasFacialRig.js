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

const LEGACY_GESTURES = new Set([
  'idle',
  'glance',
  'head-left',
  'head-right',
  'survey',
]);

const WAR_ROOM_GESTURES = new Set([
  'war-idle',
  'war-glance',
  'war-glare',
  'war-head-left',
  'war-head-right',
  'war-lean-in',
  'war-survey',
  'war-coffee',
  'war-speaking',
  'war-smirk',
  'war-grumble',
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
  if (LEGACY_GESTURES.has(key) || WAR_ROOM_GESTURES.has(key)) return key;
  return 'idle';
}

function isWarRoomGesture(gesture) {
  return WAR_ROOM_GESTURES.has(gesture);
}

function baseGesture(gesture) {
  return isWarRoomGesture(gesture) ? gesture.slice(4) : gesture;
}

function legacyBlinkAmount(time, expression) {
  if (expression === 'glare' || expression === 'grumble-hot') return 0;
  const first = shortPulse(time + 1.37, 5.9, .08, .055, .025, .085);
  const doubleBlink = shortPulse(time + 1.37, 11.8, .36, .045, .018, .07) * .72;
  return Math.max(first, doubleBlink);
}

function warRoomBlinkAmount(time, expression) {
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
  if (expression === 'simmer' || expression === 'glare') return .86;
  if (expression === 'grumble' || expression === 'focus') return .72;
  if (expression === 'smirk') return .68;
  if (expression === 'alert') return .48;
  if (expression === 'coffee') return .32;
  return .26;
}

function warRoomSpeechSyllable(time) {
  const fast = Math.sin(time * 9.7) * .5 + .5;
  const slow = Math.sin(time * 14.9 + .83) * .5 + .5;
  const gate = Math.sin(time * 3.05 + .4) * .5 + .5;
  return smooth01(clamp01(.12 + fast * .47 + slow * .29 + gate * .12));
}

function warRoomSurveyDirection(time) {
  const local = ((time % 2.35) + 2.35) % 2.35;
  if (local < .18) return -smooth01(local / .18);
  if (local < .72) return -1;
  if (local < .96) return -(1 - smooth01((local - .72) / .24));
  if (local < 1.16) return smooth01((local - .96) / .20);
  if (local < 1.76) return 1;
  if (local < 2.02) return 1 - smooth01((local - 1.76) / .26);
  return 0;
}

function warRoomGazeDirection(time, gesture) {
  if (gesture === 'head-left') return -1;
  if (gesture === 'head-right') return 1;
  if (gesture === 'survey') return warRoomSurveyDirection(time);
  if (gesture === 'glance') return (Math.floor((time + .7) / 2.7) % 2 === 0 ? 1 : -1) * .88;
  if (gesture === 'idle') return signedHold(time + .35, 8.9, .7, 4.95) * .42;
  return 0;
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
  const warRoom = isWarRoomGesture(faceGesture);
  const gestureKey = baseGesture(faceGesture);
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

  const blink = warRoom ? warRoomBlinkAmount(time, face) : legacyBlinkAmount(time, face);
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
    const syllable = warRoom && gestureKey === 'speaking'
      ? warRoomSpeechSyllable(time)
      : (Math.sin(time * 11.2) * .5 + .5);
    const cadence = warRoom && gestureKey === 'speaking'
      ? .62 + (Math.sin(time * 2.75 + .2) * .5 + .5) * .38
      : .45 + (Math.sin(time * 3.1) * .5 + .5) * .55;
    dy -= jaw * syllable * cadence * .0062 * strength;
    dy += mouthCenter * syllable * .0025 * strength;
    dz += jaw * syllable * .0028 * strength;
    energy = Math.max(energy, syllable * .65);
  }

  if (!warRoom && (gestureKey === 'glance' || gestureKey === 'survey' || gestureKey === 'head-left' || gestureKey === 'head-right')) {
    let direction = 0;
    if (gestureKey === 'head-left') direction = -1;
    else if (gestureKey === 'head-right') direction = 1;
    else direction = Math.sin(time * (gestureKey === 'survey' ? 2.1 : 1.55));
    const eyeShift = direction * .0048 * strength;
    dx += (leftEye + rightEye) * eyeShift;
    dx += (leftBrow + rightBrow) * eyeShift * .35;
    energy = Math.max(energy, Math.abs(direction) * .28);
  }

  if (warRoom) {
    const direction = warRoomGazeDirection(time, gestureKey);
    if (direction !== 0) {
      const gazeScale = gestureKey === 'survey' ? 1 : gestureKey === 'glance' ? .9 : .72;
      const eyeShift = direction * .0052 * strength * gazeScale;
      dx += (leftEye + rightEye) * eyeShift;
      dx += (leftBrow + rightBrow) * eyeShift * .26;
      energy = Math.max(energy, Math.abs(direction) * .28);
    }

    if (gestureKey === 'glare') {
      dx += leftEye * .0019 * strength;
      dx -= rightEye * .0019 * strength;
      dy -= (leftBrow + rightBrow) * .0018 * strength;
      dz += (leftEye + rightEye) * .0012 * strength;
    } else if (gestureKey === 'lean-in') {
      dx += leftBrow * .0017 * strength;
      dx -= rightBrow * .0017 * strength;
      dy -= (leftEye + rightEye) * .0012 * strength;
      dz += (leftEye + rightEye + leftCheek + rightCheek) * .0018 * strength;
    } else if (gestureKey === 'smirk') {
      const smugPulse = .82 + shortPulse(time + .2, 3.7, .4, .18, .42, .28) * .18;
      dy += rightMouth * .0015 * strength * smugPulse;
      dy -= rightEye * .0019 * strength * smugPulse;
      dy += rightBrow * .0013 * strength * smugPulse;
    } else if (gestureKey === 'grumble') {
      const twitch = signedHold(time + .14, 2.35, .22, 1.34);
      dx += (leftMouth + rightMouth) * twitch * .0014 * strength;
      dy -= jaw * Math.abs(twitch) * .0012 * strength;
    } else if (gestureKey === 'coffee') {
      const settle = shortPulse(time + .3, 4.7, 1.72, .12, .12, .18);
      dy -= (leftEye + rightEye) * settle * .0011 * strength;
    }
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
