export const CHRONICLES_ISOMETRIC_SCENE_STYLE_VERSION = 2;

function scenePalette(values) {
  return Object.freeze({
    ...values,
    floor: Object.freeze([...values.floor]),
    wall: Object.freeze([...values.wall]),
  });
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
  hemiSky: 0xd6c5a8,
  hemiGround: 0x15100d,
  key: 0xffd39b,
  rim: 0x758aa2,
  fill: 0x9db7c6,
  bounce: 0x9b5b30,
});

const GALLERY_PALETTE = scenePalette({
  background: 0x101312,
  fog: 0x1a211f,
  floor: [0x555a56, 0x62645e, 0x4c514d, 0x696860],
  foundation: 0x202320,
  wall: [0x55564f, 0x626158, 0x494b47],
  wallTrim: 0x27251f,
  metal: 0x836f46,
  rune: 0x9ec9bd,
  hemiSky: 0xd8d5c6,
  hemiGround: 0x111713,
  key: 0xe7d9b3,
  rim: 0x7fa3a0,
  fill: 0xa8c0b4,
  bounce: 0x6c5a3e,
});

const MENAGERIE_PALETTE = scenePalette({
  background: 0x0b0a0a,
  fog: 0x171312,
  floor: [0x343230, 0x403a37, 0x2c2b2a, 0x48403a],
  foundation: 0x171514,
  wall: [0x332f2c, 0x3d3531, 0x2a2827],
  wallTrim: 0x171311,
  metal: 0x765033,
  rune: 0xc78158,
  hemiSky: 0xc9b49e,
  hemiGround: 0x120f0e,
  key: 0xe8b17c,
  rim: 0x6f7c84,
  fill: 0x8f8278,
  bounce: 0x8e3f24,
});

const NEUTRAL_STYLE = Object.freeze({
  id: 'neutral',
  version: CHRONICLES_ISOMETRIC_SCENE_STYLE_VERSION,
  dressing: 'none',
  palette: CRYPT_PALETTE,
});

const SCENE_STYLES = Object.freeze({
  'crypt-eight-squares': Object.freeze({
    id: 'crypt-stone',
    version: CHRONICLES_ISOMETRIC_SCENE_STYLE_VERSION,
    dressing: 'crypt-legacy',
    palette: CRYPT_PALETTE,
  }),
  'gallery-of-forks': Object.freeze({
    id: 'gallery-stone',
    version: CHRONICLES_ISOMETRIC_SCENE_STYLE_VERSION,
    dressing: 'none',
    palette: GALLERY_PALETTE,
  }),
  'menagerie-of-ash': Object.freeze({
    id: 'menagerie-ash',
    version: CHRONICLES_ISOMETRIC_SCENE_STYLE_VERSION,
    dressing: 'none',
    palette: MENAGERIE_PALETTE,
  }),
});

export function chroniclesIsometricSceneStyle(mapId) {
  return SCENE_STYLES[mapId] || NEUTRAL_STYLE;
}
