import { chroniclesReadableIsometricLighting } from './chroniclesLightingPolicy.js';

export const CHRONICLES_ISOMETRIC_SCENE_STYLE_VERSION = 5;

function scenePalette(values) {
  return Object.freeze({
    ...values,
    floor: Object.freeze([...values.floor]),
    wall: Object.freeze([...values.wall]),
  });
}

function sceneLighting(values) {
  return chroniclesReadableIsometricLighting(values);
}

const CRYPT_PALETTE = scenePalette({
  background: 0x100c09,
  fog: 0x17120e,
  floor: [0x4e4a43, 0x575249, 0x45423d, 0x5b554b],
  foundation: 0x211f1c,
  wall: [0x403a34, 0x49423a, 0x393530],
  wallTrim: 0x1d1a17,
  metal: 0x7b562c,
  rune: 0x8ed8c7,
  runeEmissive: 0x2aa88e,
  runeGlow: 0x58d8bc,
  hemiSky: 0xd6c5a8,
  hemiGround: 0x15100d,
  key: 0xffd39b,
  rim: 0x758aa2,
  fill: 0x9db7c6,
  bounce: 0x9b5b30,
});

const GALLERY_PALETTE = scenePalette({
  background: 0x0f1312,
  fog: 0x1b2421,
  floor: [0x59605b, 0x696a62, 0x505752, 0x716d63],
  foundation: 0x202420,
  wall: [0x5a5a52, 0x69665d, 0x4a4e49],
  wallTrim: 0x28261f,
  metal: 0x8b7445,
  rune: 0xa8d1c5,
  runeEmissive: 0x3f8d80,
  runeGlow: 0x7ec6b5,
  hemiSky: 0xded8c8,
  hemiGround: 0x101713,
  key: 0xf1dfb5,
  rim: 0x85aaa5,
  fill: 0xb0cabc,
  bounce: 0x735e3e,
});

const MENAGERIE_PALETTE = scenePalette({
  background: 0x0c0908,
  fog: 0x1d1512,
  floor: [0x3b3834, 0x49413b, 0x322f2d, 0x55483e],
  foundation: 0x191614,
  wall: [0x3c342f, 0x493b35, 0x312c29],
  wallTrim: 0x1d1612,
  metal: 0x855a37,
  rune: 0xd18a5d,
  runeEmissive: 0x9d4525,
  runeGlow: 0xd06d40,
  hemiSky: 0xd4baa1,
  hemiGround: 0x120e0c,
  key: 0xf0b77e,
  rim: 0x78868e,
  fill: 0x9c8b80,
  bounce: 0xa64a27,
});

const HOLLOW_BELL_PALETTE = scenePalette({
  background: 0x090b0e,
  fog: 0x121820,
  floor: [0x44474a, 0x53504c, 0x3b4045, 0x5a554d],
  foundation: 0x181a1d,
  wall: [0x35393e, 0x42454a, 0x2c3136],
  wallTrim: 0x191d22,
  metal: 0x8c7044,
  rune: 0xb1c8cf,
  runeEmissive: 0x476d7a,
  runeGlow: 0x7caebb,
  hemiSky: 0xc2ced8,
  hemiGround: 0x0e1216,
  key: 0xe2c28f,
  rim: 0x7898b5,
  fill: 0x91aabb,
  bounce: 0x865d36,
});

const CAVE_WATER_PALETTE = scenePalette({
  background: 0x070b0d,
  fog: 0x0f1a1d,
  floor: [0x374348, 0x465256, 0x303b40, 0x526064],
  foundation: 0x151a1c,
  wall: [0x424f53, 0x4d5b5f, 0x354247],
  wallTrim: 0x1a2225,
  metal: 0x66777c,
  rune: 0xa7d6d8,
  runeEmissive: 0x3d8f98,
  runeGlow: 0x70c4cb,
  hemiSky: 0xb7d5d9,
  hemiGround: 0x0b1416,
  key: 0xd7e1cf,
  rim: 0x6ea7b8,
  fill: 0xa1c6c9,
  bounce: 0x446a70,
});

const NEUTRAL_STYLE = Object.freeze({
  id: 'neutral',
  version: CHRONICLES_ISOMETRIC_SCENE_STYLE_VERSION,
  dressing: 'none',
  lighting: sceneLighting({ exposure: 1, hemi: 1, fill: 1, bounce: 1 }),
  palette: CRYPT_PALETTE,
});

const CAVE_WATER_STYLE = Object.freeze({
  id: 'cave-water',
  version: CHRONICLES_ISOMETRIC_SCENE_STYLE_VERSION,
  dressing: 'none',
  lighting: sceneLighting({ exposure: 1.06, hemi: 1.16, fill: 1.22, bounce: 1.08 }),
  palette: CAVE_WATER_PALETTE,
});

const SCENE_STYLES = Object.freeze({
  'crypt-eight-squares': Object.freeze({
    id: 'crypt-stone',
    version: CHRONICLES_ISOMETRIC_SCENE_STYLE_VERSION,
    dressing: 'crypt-legacy',
    lighting: sceneLighting({ exposure: 1, hemi: 1, fill: 1, bounce: 1 }),
    palette: CRYPT_PALETTE,
  }),
  'gallery-of-forks': Object.freeze({
    id: 'gallery-stone',
    version: CHRONICLES_ISOMETRIC_SCENE_STYLE_VERSION,
    dressing: 'gallery-forked-v3',
    lighting: sceneLighting({ exposure: 1.035, hemi: 1.06, fill: 1.08, bounce: 1.02 }),
    palette: GALLERY_PALETTE,
  }),
  'menagerie-of-ash': Object.freeze({
    id: 'menagerie-ash',
    version: CHRONICLES_ISOMETRIC_SCENE_STYLE_VERSION,
    dressing: 'menagerie-ash-v3',
    lighting: sceneLighting({ exposure: 1.15, hemi: 1.28, fill: 1.42, bounce: 1.24 }),
    palette: MENAGERIE_PALETTE,
  }),
  'hollow-bell-tower': Object.freeze({
    id: 'hollow-bell-bronze',
    version: CHRONICLES_ISOMETRIC_SCENE_STYLE_VERSION,
    dressing: 'hollow-bell-v1',
    lighting: sceneLighting({ exposure: 1.28, hemi: 1.4, fill: 1.62, bounce: 1.46 }),
    palette: HOLLOW_BELL_PALETTE,
  }),
  'echo-cistern': CAVE_WATER_STYLE,
});

export function chroniclesIsometricSceneStyle(mapId) {
  const id = String(mapId || '').trim().toLowerCase();
  if (SCENE_STYLES[id]) return SCENE_STYLES[id];
  if (/(cistern|cave|cavern|grotto|mine|mountain|tunnel|sewer|water|flood|canal)/.test(id)) {
    return CAVE_WATER_STYLE;
  }
  return NEUTRAL_STYLE;
}
