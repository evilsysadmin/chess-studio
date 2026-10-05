export function deterministicNoise(x, y, salt = 0) {
  const value = Math.sin((x + 17.31 + salt) * 12.9898 + (y - 9.17 - salt) * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

export function facingAngle(from, to) {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

export function shortestAngleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}
