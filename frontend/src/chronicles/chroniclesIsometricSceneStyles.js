export const CHRONICLES_ISOMETRIC_SCENE_STYLE_VERSION = 1;

const NEUTRAL_STYLE = Object.freeze({
  id: 'neutral',
  version: CHRONICLES_ISOMETRIC_SCENE_STYLE_VERSION,
  dressing: 'none',
});

const SCENE_STYLES = Object.freeze({
  'crypt-eight-squares': Object.freeze({
    id: 'crypt-stone',
    version: CHRONICLES_ISOMETRIC_SCENE_STYLE_VERSION,
    dressing: 'crypt-legacy',
  }),
  'gallery-of-forks': Object.freeze({
    id: 'gallery-stone',
    version: CHRONICLES_ISOMETRIC_SCENE_STYLE_VERSION,
    dressing: 'none',
  }),
  'menagerie-of-ash': Object.freeze({
    id: 'menagerie-ash',
    version: CHRONICLES_ISOMETRIC_SCENE_STYLE_VERSION,
    dressing: 'none',
  }),
});

export function chroniclesIsometricSceneStyle(mapId) {
  return SCENE_STYLES[mapId] || NEUTRAL_STYLE;
}
