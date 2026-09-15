export const ISTANBUL_SONGBOOK_IDS = Object.freeze([
  'istanbul0326',
  'istanbulBackgammon',
  'bosphorusRain',
]);

function line(entries) {
  return Object.freeze(Object.fromEntries(entries));
}

function section({ lead = [], counter = [], chords = [], bass = [], leadInstrument = null, counterInstrument = null }) {
  return Object.freeze({
    lead:line(lead),
    counter:line(counter),
    chords:line(chords.map(([step, notes]) => [step, Object.freeze(notes)])),
    bass:line(bass),
    drums:Object.freeze({}),
    ...(leadInstrument ? { leadInstrument } : {}),
    ...(counterInstrument ? { counterInstrument } : {}),
  });
}

// 03:26 — the broken meter is the hook. Long clarinet statements land around
// the 9/8 pulse and leave whole pockets empty; a nylon answer replaces the old
// permanent qanun layer. Scene two swaps the written players, then the opening
// roles return so the exchange is audible rather than decorative metadata.
const ISTANBUL_0326 = Object.freeze([
  section({
    lead:[[4,67],[12,71],[21,69],[34,64],[46,67]],
    counter:[[27,62],[51,65]],
    bass:[[0,38],[9,45],[18,41],[27,43],[36,38],[45,40],[54,38]],
  }),
  section({
    leadInstrument:'guitar2',
    counterInstrument:'clarinet',
    lead:[[6,62],[18,65],[31,64],[44,67]],
    counter:[[13,72],[38,69],[52,71]],
    bass:[[0,38],[9,43],[18,40],[27,45],[36,41],[45,38],[54,43]],
  }),
  section({
    lead:[[8,69],[17,72],[29,67],[42,64],[52,69]],
    counter:[[23,64],[48,62]],
    bass:[[0,41],[9,38],[18,45],[27,40],[36,43],[45,38],[54,41]],
  }),
  section({
    lead:[[4,67],[13,71],[22,69],[35,64],[47,67]],
    counter:[[28,65],[50,62]],
    bass:[[0,38],[9,45],[18,41],[27,43],[36,40],[45,38],[54,38]],
  }),
]);

// Tavla 03:08 — a dry table-room piece. The clarinet uses short calls, the
// guitar answers in the gaps and the walking bass does most of the travelling.
// It remains asymmetrical, but the groove is social and close rather than the
// suspended long-breath character of 03:26.
const ISTANBUL_TAVLA = Object.freeze([
  section({
    lead:[[3,64],[11,69],[20,67],[34,71],[48,66],[62,69]],
    counter:[[15,60],[27,64],[42,62],[57,65]],
    bass:[[0,38],[6,45],[12,41],[18,43],[24,40],[30,47],[36,41],[42,43],[48,38],[54,45],[60,40],[66,43]],
  }),
  section({
    leadInstrument:'guitar2',
    counterInstrument:'clarinet',
    lead:[[5,60],[17,64],[29,62],[45,65],[61,64]],
    counter:[[10,69],[24,72],[38,67],[54,71],[68,69]],
    bass:[[0,40],[6,47],[12,43],[18,45],[24,41],[30,48],[36,43],[42,45],[48,40],[54,47],[60,41],[66,43]],
  }),
  section({
    lead:[[4,67],[14,64],[26,69],[40,66],[52,71],[64,67]],
    counter:[[20,62],[34,65],[58,64]],
    bass:[[0,38],[6,43],[12,40],[18,45],[24,41],[30,47],[36,38],[42,45],[48,40],[54,43],[60,41],[66,38]],
  }),
  section({
    lead:[[3,64],[12,69],[22,67],[36,71],[50,66],[63,64]],
    counter:[[17,60],[31,64],[46,62],[59,65]],
    bass:[[0,38],[6,45],[12,41],[18,43],[24,40],[30,47],[36,41],[42,43],[48,38],[54,45],[60,40],[66,38]],
  }),
]);

// Bosphorus Rain — chamber music rather than a regional groove showcase. Felt
// piano carries the foreground, cello moves slowly underneath and clarinet is
// an occasional human breath. Glass exists only as a quiet harmonic reflection;
// there is deliberately no drum lane in the final profile. Keep the authored
// 4/4/4/3 voicing count: the Mediterranean articulation pass moves those
// voicings onto Bosphorus' asymmetric rain-cadence attack plan later.
const BOSPHORUS_RAIN = Object.freeze([
  section({
    lead:[[4,64],[18,67],[34,62],[50,69]],
    counter:[[26,72],[58,67]],
    chords:[[0,[52,55,59]],[16,[50,55,59]],[32,[53,57,60]],[48,[50,54,57]]],
    bass:[[0,40],[16,38],[32,41],[48,36]],
  }),
  section({
    lead:[[8,67],[24,71],[40,64],[56,69]],
    counter:[[30,74]],
    chords:[[0,[55,59,62]],[16,[52,55,59]],[32,[53,57,60]],[48,[50,54,57]]],
    bass:[[0,43],[16,40],[32,38],[48,41]],
  }),
  section({
    lead:[[6,62],[22,65],[38,60],[54,67]],
    counter:[[14,69],[46,72]],
    chords:[[0,[50,55,59]],[16,[48,52,55]],[32,[52,55,59]],[48,[50,54,57]]],
    bass:[[0,38],[16,36],[32,40],[48,35]],
  }),
  section({
    lead:[[4,64],[20,67],[36,62],[52,69]],
    counter:[[28,71]],
    chords:[[0,[52,55,59]],[24,[50,54,57]],[48,[52,55,59]]],
    bass:[[0,40],[16,38],[32,41],[48,40]],
  }),
]);

export const ISTANBUL_SONGBOOK_REWRITES = Object.freeze({
  istanbul0326:Object.freeze({
    description:'Estambul 03:26: clarinete largo sobre un 9/8 grave, guitarra de nylon en respuesta y silencios que dejan respirar el compás quebrado.',
    sections:ISTANBUL_0326,
  }),
  istanbulBackgammon:Object.freeze({
    description:'Tavla 03:08: llamadas cortas de clarinete, guitarra seca y contrabajo caminante alrededor de una mesa nocturna; ritmo antes que exotismo.',
    sections:ISTANBUL_TAVLA,
  }),
  bosphorusRain:Object.freeze({
    description:'Bósforo bajo la lluvia: piano de fieltro, cello, reflejos de cristal y apenas unas respiraciones de clarinete; cámara nocturna sin percusión decorativa.',
    sections:BOSPHORUS_RAIN,
  }),
});

export const ISTANBUL_PROFILES = Object.freeze({
  istanbul0326:Object.freeze({
    family:'istanbul-0326-broken-clarinet-nine-eight', preserveSectionOrder:true,
    harmonyPath:Object.freeze([0,2,0,-2,0,3,0,-2]),
    swing:0.015, warmth:0.91, releaseScale:1.08,
    leadInstrument:'clarinet', counterInstrument:'nylonGuitar', chordInstrument:'rhodesWarm', bassInstrument:'uprightBass',
    layers:Object.freeze({ chords:false }),
    mix:Object.freeze({ lead:0.54, counter:0.16, bass:0.68, chord:0.18 }),
  }),
  istanbulBackgammon:Object.freeze({
    family:'istanbul-tavla-table-pocket', preserveSectionOrder:true,
    harmonyPath:Object.freeze([0,0,-2,0,3,0,-2,0]),
    swing:0.04, warmth:0.90, releaseScale:0.94,
    leadInstrument:'clarinet', counterInstrument:'nylonGuitar', chordInstrument:'rhodesWarm', bassInstrument:'uprightBass',
    mix:Object.freeze({ lead:0.54, counter:0.15, bass:0.76, chord:0.22 }),
  }),
  bosphorusRain:Object.freeze({
    family:'bosphorus-rain-felt-cello-chamber', preserveSectionOrder:true,
    harmonyPath:Object.freeze([0,-2,0,3,0,-2,0,5]),
    swing:0, warmth:0.84, releaseScale:1.28,
    leadInstrument:'feltGrand', counterInstrument:'clarinet', chordInstrument:'glass', bassInstrument:'cello',
    drumMode:'none',
    layers:Object.freeze({ drums:false }),
    mix:Object.freeze({ lead:0.48, counter:0.12, bass:0.52, chord:0.24 }),
  }),
});

export function installIstanbulSongbook({ themes }) {
  if (!themes) return;
  for (const id of ISTANBUL_SONGBOOK_IDS) {
    const current = themes[id];
    const rewrite = ISTANBUL_SONGBOOK_REWRITES[id];
    if (!current || !rewrite) continue;
    // The Mediterranean articulation pass runs later and replaces sections
    // with its authored chord attacks. Keep the score internals immutable, but
    // leave the theme container writable for that established pipeline stage.
    themes[id] = { ...current, ...rewrite };
  }
}

export function withIstanbulProduction(theme, feel) {
  const authored = ISTANBUL_PROFILES[theme?.id];
  if (!authored) return feel;
  return Object.freeze({
    ...(feel || {}),
    ...authored,
    layers:Object.freeze({
      ...(feel?.layers || {}),
      lead:true,
      counter:true,
      chords:authored.layers?.chords ?? feel?.layers?.chords ?? true,
      bass:true,
      drums:authored.layers?.drums ?? feel?.layers?.drums ?? true,
      signature:true,
    }),
    mix:Object.freeze({ ...(feel?.mix || {}), ...authored.mix }),
  });
}
