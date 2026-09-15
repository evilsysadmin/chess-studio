import {
  AMBIENT_THEME_GROUPS,
  AMBIENT_THEME_OPTIONS,
  AMBIENT_THEMES,
  CURATED_HIDDEN_THEME_IDS,
} from './ambientCatalog.js';
import { installIberianRecomposition } from './ambientIberianRecomposition.js';

// Public curation is deliberately non-destructive: rejected songs stay defined
// so old saves/references and future reworks remain valid, but they disappear
// from the selector, session radio and any persisted-session restore path.
export const RETIRED_MEDITERRANEAN_THEME_IDS = Object.freeze([
  'tangierRedTable',
  'beirutNightTaxi',
  'istanbulBackgammon',
]);

for (const id of RETIRED_MEDITERRANEAN_THEME_IDS) CURATED_HIDDEN_THEME_IDS.add(id);

for (let index = AMBIENT_THEME_OPTIONS.length - 1; index >= 0; index -= 1) {
  if (CURATED_HIDDEN_THEME_IDS.has(AMBIENT_THEME_OPTIONS[index]?.id)) AMBIENT_THEME_OPTIONS.splice(index, 1);
}
for (const group of AMBIENT_THEME_GROUPS) {
  for (let index = group.themes.length - 1; index >= 0; index -= 1) {
    if (CURATED_HIDDEN_THEME_IDS.has(group.themes[index]?.id)) group.themes.splice(index, 1);
  }
}

// Recompose the two Iberian pieces before the profile stack installs chord,
// bass and production polish. Their difference now lives in the score itself,
// not merely in a different drum kit or foreground instrument.
installIberianRecomposition({ themes: AMBIENT_THEMES });

// Las composiciones mediterráneas ya tienen armonía y timbres propios, pero
// varias conservaban exactamente la misma rejilla de batería. Estas variaciones
// respetan su métrica y tempo: más aire en las lentas, más subdivisión en taxis
// y trenes, y acentos de piel distintos entre patios, cafés y puertos.

function groove(period, pattern) {
  return Object.freeze({ period, pattern:Object.freeze(pattern) });
}

export const MEDITERRANEAN_GROOVE_REWRITES = Object.freeze({
  casablanca: groove(16, {0:'B',6:'H',8:'S',14:'H'}),
  alexandria241: groove(16, {0:'B',5:'H',8:'S',13:'H'}),
  terraceFireflies: groove(16, {0:'B',7:'H',10:'B',14:'H'}),
  cafeFirelight: groove(16, {0:'B',4:'H',9:'S',13:'H'}),
  alexandriaHarborCafe: groove(16, {0:'B',6:'H',11:'B',14:'H'}),

  cairo0047: groove(32, {0:'B',10:'H',16:'S',26:'H'}),
  cairoRedLantern: groove(32, {0:'B',6:'H',12:'S',18:'H',24:'B',30:'H'}),
  cairoBlueNote0211: groove(32, {0:'B',12:'H',18:'S',28:'H'}),

  bosphorusRain: groove(16, {0:'K',5:'B',10:'H',14:'B'}),
  aleppoAfterRain: groove(16, {0:'K',4:'H',9:'B',13:'H'}),
  ammanVelvetRoom: groove(16, {0:'K',3:'B',8:'S',11:'H',15:'B'}),
  damascusCourtyard0144: groove(16, {0:'K',7:'B',12:'H'}),
  ammanLateTable0303: groove(16, {0:'K',4:'B',9:'H',14:'B'}),
  oudTrench: groove(16, {0:'K',3:'H',8:'S',12:'B',15:'H'}),

  beirutRooftop0412: groove(16, {0:'B',5:'H',8:'S',13:'H',15:'B'}),
  // Taxi's score is written as four 18-step phrases inside each 72-step scene.
  // The former 16-step loop walked out of phase with those phrase boundaries,
  // so the backbeat sounded late/early even though every individual hit was quantized.
  beirutNightTaxi: groove(18, {0:'K',3:'H',6:'B',9:'S',12:'H',15:'B'}),
  casablancaLastCall: groove(16, {0:'K',3:'B',7:'H',8:'S',12:'B',15:'H'}),
  medinaBlueSmoke: groove(16, {0:'K',5:'B',8:'S',11:'H',14:'B'}),

  tangierRedTable: groove(12, {0:'K',3:'H',5:'B',6:'S',9:'H',11:'B'}),
  tangierNightTrain0058: groove(12, {0:'K',2:'H',5:'B',6:'S',8:'B',11:'H'}),
  // Tarde clara phrases the foreground on a four-step lattice. Keep the hand
  // drum on those same pillars and remove the 3/11/14 accents that sounded as
  // if the percussion was leaning against the melody rather than supporting it.
  andalusianCoast: groove(16, {0:'K',4:'B',8:'S',12:'B'}),
  cordobaRooftop0026: groove(16, {0:'K',2:'B',6:'H',8:'S',12:'B',15:'H'}),
});

export const MEDITERRANEAN_GROOVE_IDS = Object.freeze(Object.keys(MEDITERRANEAN_GROOVE_REWRITES));

export function withMediterraneanGrooveDiversity(theme, feel) {
  const rewrite = MEDITERRANEAN_GROOVE_REWRITES[theme?.id];
  if (!rewrite || !feel?.percussion) return feel;
  return Object.freeze({
    ...feel,
    percussion:Object.freeze({
      ...feel.percussion,
      period:rewrite.period,
      pattern:rewrite.pattern,
    }),
  });
}
