import * as THREE from 'three';

// MM3-style pixel-art surfaces for the 3D overworld. Every tile is small
// (32–64 px), built from a short hand-picked colour ramp per material and
// quantised with a 4×4 Bayer matrix, so walls, roads and meadows share the
// chunky VGA pixel of the painted billboards. Deterministic and generated in
// memory: no downloads, one cached texture per kind.

const BAYER4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
].map(v => (v + 0.5) / 16 - 0.5);

function hash(x, y, salt = 0) {
  let n = Math.imul(x + 374761393 + salt * 668265263, 0x27d4eb2d) ^ Math.imul(y + 668265263, 0x165667b1);
  n ^= n >>> 15;
  n = Math.imul(n, 0x85ebca6b);
  return ((n ^ (n >>> 13)) >>> 0) / 0xffffffff;
}

// Smooth tileable value noise over `cells` lattice cells across the tile.
function valueNoise(x, y, size, cells, salt) {
  const u = x * cells / size;
  const v = y * cells / size;
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const fx = (u - x0) ** 2 * (3 - 2 * (u - x0));
  const fy = (v - y0) ** 2 * (3 - 2 * (v - y0));
  const s = (dx, dy) => hash((x0 + dx) % cells, (y0 + dy) % cells, salt);
  const a = s(0, 0) * (1 - fx) + s(1, 0) * fx;
  const b = s(0, 1) * (1 - fx) + s(1, 1) * fx;
  return a * (1 - fy) + b * fy;
}

const hex = value => [(value >> 16) & 255, (value >> 8) & 255, value & 255];

// Dark → light ramps. Surfaces tinted by a material colour stay near-neutral
// so roofs/plaster keep their per-building hue; grass carries its own greens.
const RAMPS = Object.freeze({
  grass: [0x24461a, 0x335f22, 0x45782a, 0x5a8f33, 0x76a840, 0x93bd52].map(hex),
  masonry: [0x4a4440, 0x8a8178, 0xb3aa9c, 0xd4cbbb, 0xeee6d6, 0xfff9ec].map(hex),
  stucco: [0xa99c88, 0xd9cfbf, 0xeae2d4, 0xf6efe3, 0xfffaf0].map(hex),
  timber: [0x5a4a3a, 0x8f7a63, 0xb59f86, 0xd2bea4, 0xeadbc4].map(hex),
  roof: [0x5c5650, 0x9a928a, 0xc4bcb2, 0xe2dbd1, 0xfbf6ee].map(hex),
  cobble: [0x4b453d, 0x7d7468, 0xa59b8c, 0xc8bfae, 0xe6dece].map(hex),
  bark: [0x3a2a1c, 0x5e4630, 0x7f6244, 0x9c7d5a].map(hex),
  leaves: [0x1f3a19, 0x2f5223, 0x416b2d, 0x58843a, 0x75a04a].map(hex),
});

const SIZES = Object.freeze({
  grass: 64, masonry: 64, stucco: 32, timber: 32, roof: 32, cobble: 64, bark: 32, leaves: 32,
});

// Returns a light value (≈0..1, dithered onto the ramp), SEAM (darkest ramp
// colour, for mortar and gaps) or { color } for an off-ramp accent pixel.
const SEAM = Object.freeze({ index: 0 });
function sample(kind, x, y, size) {
  const grain = hash(x, y, 3) - 0.5;
  if (kind === 'grass') {
    const meadow = valueNoise(x, y, size, 4, 1) - 0.5;
    const clover = valueNoise(x, y, size, 11, 2) - 0.5;
    // Short dark blades with a lit tip, scattered on a 4-px grid.
    const bx = x % 4;
    const by = y % 6;
    const blade = hash(Math.floor(x / 4), Math.floor(y / 6), 9);
    if (blade > 0.72 && bx === 1 && by < 3) return by === 0 ? 0.92 : 0.12;
    const flower = hash(x, y, 17);
    if (flower > 0.9965) return { color: flower > 0.9985 ? 0xf2ead2 : 0xe6c84a };
    return 0.52 + meadow * 0.55 + clover * 0.25 + grain * 0.18;
  }
  if (kind === 'masonry' || kind === 'roof' || kind === 'cobble') {
    let cellX;
    let cellY;
    let lx;
    let ly;
    let w;
    let h;
    if (kind === 'cobble') {
      // Jittered 8-px cobbles with rounded corners.
      w = 8; h = 8;
      const row = Math.floor(y / h);
      const off = (row % 2) * 4;
      cellX = Math.floor((x + off) / w); cellY = row;
      lx = (x + off) % w; ly = y % h;
      const corner = (lx === 0 || lx === w - 1) && (ly === 0 || ly === h - 1);
      if (lx === 0 || ly === 0 || corner) return SEAM;
    } else {
      h = kind === 'roof' ? 8 : 16;
      const row = Math.floor(y / h);
      const widths = kind === 'roof' ? [8, 8] : [32, 24, 32, 16];
      w = widths[row % widths.length];
      const off = kind === 'roof' ? (row % 2) * 4 : (row % 2) * 12;
      cellX = Math.floor((x + off) / w); cellY = row;
      lx = (x + off) % w; ly = y % h;
      if (ly === 0 || lx === 0) return SEAM;
    }
    const stone = hash(cellX, cellY, kind === 'roof' ? 31 : 37);
    // Pixel-art bevel: lit top/left rim, shadowed bottom/right rim.
    let bevel = 0;
    if (ly === 1 || lx === 1) bevel = 0.22;
    if (ly === h - 1 || lx === w - 1) bevel = -0.24;
    const pit = hash(x, y, 41) > 0.93 ? -0.18 : 0;
    return 0.5 + (stone - 0.5) * 0.45 + bevel + pit + grain * 0.12;
  }
  if (kind === 'stucco') {
    const wash = valueNoise(x, y, size, 4, 5) - 0.5;
    const crack = hash(Math.floor(x / 2), y, 7) > 0.985 || hash(x, Math.floor(y / 3), 8) > 0.99;
    if (crack) return 0.05;
    return 0.6 + wash * 0.5 + grain * 0.2;
  }
  if (kind === 'timber') {
    // Horizontal planks 8 px tall with dark seams, grain streaks and knots.
    const plank = Math.floor(y / 8);
    const ly = y % 8;
    if (ly === 0) return SEAM;
    const streak = Math.sin((x + hash(plank, 0, 11) * 32) * 0.45 + ly * 0.9) * 0.18;
    const knot = hash(Math.floor(x / 5), plank, 13) > 0.94 && ly > 2 && ly < 6 ? -0.35 : 0;
    return 0.55 + (hash(plank, 1, 12) - 0.5) * 0.3 + streak + knot + grain * 0.1;
  }
  if (kind === 'bark') {
    const ridge = Math.sin(x * 1.3 + valueNoise(x, y, size, 4, 21) * 5) * 0.32;
    return 0.48 + ridge + grain * 0.18;
  }
  // leaves: clumped needles with dark gaps.
  const clump = valueNoise(x, y, size, 8, 23) - 0.5;
  const needle = hash(x, Math.floor(y / 2), 25) - 0.5;
  return 0.5 + clump * 0.9 + needle * 0.35;
}

const cache = new Map();

export function chroniclesPixelTexture(kind) {
  if (!RAMPS[kind]) throw new Error('Unsupported pixel texture: ' + kind);
  if (cache.has(kind)) return cache.get(kind);
  const size = SIZES[kind];
  const ramp = RAMPS[kind];
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const value = sample(kind, x, y, size);
      let rgb;
      if (value === SEAM) {
        rgb = ramp[0];
      } else if (typeof value === 'object') {
        rgb = hex(value.color);
      } else {
        const dithered = value + BAYER4[(y % 4) * 4 + (x % 4)] / (ramp.length - 1);
        const index = Math.max(0, Math.min(ramp.length - 1, Math.round(dithered * (ramp.length - 1))));
        rgb = ramp[index];
      }
      const offset = (y * size + x) * 4;
      pixels[offset] = rgb[0];
      pixels[offset + 1] = rgb[1];
      pixels[offset + 2] = rgb[2];
      pixels[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.name = 'chronicles-pixel-' + kind;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  // Up close every texel is a crisp square; far away mipmaps keep it calm.
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  texture.userData.chroniclesPixelArt = { kind, size, palette: ramp.length };
  cache.set(kind, texture);
  return texture;
}
