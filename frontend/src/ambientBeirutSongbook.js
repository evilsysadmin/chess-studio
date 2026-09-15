export const BEIRUT_SONGBOOK_IDS = Object.freeze([
  'beirut0113',
  'beirutRooftop0412',
  'beirutNightTaxi',
  'beirutHarbor2340',
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

// Beirut 01:13 — 6/8 late table. The four-note cell returns in each scene but
// leaves real air around it; harmony moves underneath instead of inviting a
// continuous scale run over one static background.
const BEIRUT_0113 = Object.freeze([
  section({
    lead:[[4,64],[10,67],[16,69],[22,67],[38,64],[46,62],[58,67]],
    counter:[[28,71],[52,69]],
    chords:[[0,[52,55,59]],[18,[50,55,59]],[36,[53,57,60]],[54,[50,54,57]]],
    bass:[[0,40],[12,47],[24,38],[36,41],[48,38],[60,43]],
  }),
  section({
    // The second scene deliberately swaps the written soloists. This is an
    // audible conversation, not a metadata trick: clarinet takes the phrase
    // while the guitar answers before the opening roles return.
    leadInstrument:'clarinet',
    counterInstrument:'guitar2',
    lead:[[6,64],[12,67],[18,70],[26,69],[42,67],[50,64],[62,69]],
    counter:[[32,74],[56,71]],
    chords:[[0,[52,55,59]],[18,[55,59,62]],[36,[50,55,59]],[54,[53,57,60]]],
    bass:[[0,40],[12,43],[24,38],[36,45],[48,41],[60,38]],
  }),
  section({
    lead:[[8,62],[14,64],[20,67],[30,64],[44,69],[54,67],[64,62]],
    counter:[[36,71],[60,69]],
    chords:[[0,[50,55,59]],[18,[52,55,59]],[36,[53,57,60]],[54,[50,54,57]]],
    bass:[[0,38],[12,45],[24,40],[36,41],[48,38],[60,43]],
  }),
  section({
    lead:[[4,64],[10,67],[16,69],[24,67],[40,64],[50,62],[66,64]],
    counter:[[30,71],[58,67]],
    chords:[[0,[52,55,59]],[18,[50,55,59]],[36,[53,57,60]],[54,[52,55,59]]],
    bass:[[0,40],[12,47],[24,38],[36,41],[48,43],[60,40]],
  }),
]);

// Rooftop 04:12 — suspended, less street pulse. Clarinet speaks in compact
// phrases and the guitar answers only after the line has finished.
const BEIRUT_ROOFTOP = Object.freeze([
  section({
    lead:[[6,69],[14,72],[22,71],[34,67],[48,69],[62,64]],
    counter:[[28,64],[54,67]],
    chords:[[0,[53,57,60]],[18,[52,55,59]],[36,[55,59,62]],[54,[50,55,59]]],
    bass:[[0,41],[18,40],[36,43],[54,38]],
  }),
  section({
    lead:[[8,71],[16,74],[26,72],[40,69],[56,67],[66,69]],
    counter:[[32,65],[60,64]],
    chords:[[0,[55,59,62]],[18,[53,57,60]],[36,[52,55,59]],[54,[50,54,57]]],
    bass:[[0,43],[18,41],[36,40],[54,38]],
  }),
  section({
    lead:[[10,67],[18,71],[30,69],[44,64],[58,67]],
    counter:[[24,62],[50,65]],
    chords:[[0,[52,55,59]],[18,[50,55,59]],[36,[53,57,60]],[54,[55,59,62]]],
    bass:[[0,40],[18,38],[36,41],[54,43]],
  }),
  section({
    lead:[[6,69],[14,72],[24,71],[38,67],[52,64],[66,69]],
    counter:[[30,64],[58,67]],
    chords:[[0,[53,57,60]],[18,[52,55,59]],[36,[50,55,59]],[54,[53,57,60]]],
    bass:[[0,41],[18,40],[36,38],[54,41]],
  }),
]);

// Night Taxi — urban and syncopated, but still a melody rather than a staircase.
// Short cells skip around chord tones and leave the clarinet to comment between
// them; the walking bass supplies motion instead of filling the lead lane.
const BEIRUT_TAXI = Object.freeze([
  section({
    lead:[[3,62],[9,67],[15,65],[25,69],[35,64],[47,67],[61,62]],
    counter:[[20,71],[42,69],[66,67]],
    chords:[[0,[50,54,57]],[18,[53,57,60]],[36,[52,55,59]],[54,[55,59,62]]],
    bass:[[0,38],[8,45],[16,41],[24,43],[32,40],[40,47],[48,41],[56,43],[64,38]],
  }),
  section({
    lead:[[5,64],[13,69],[21,67],[31,71],[43,65],[55,69],[65,64]],
    counter:[[26,72],[49,67]],
    chords:[[0,[52,55,59]],[18,[55,59,62]],[36,[53,57,60]],[54,[50,54,57]]],
    bass:[[0,40],[8,47],[16,43],[24,45],[32,41],[40,48],[48,43],[56,45],[64,40]],
  }),
  section({
    lead:[[3,62],[11,67],[19,64],[29,69],[41,66],[53,71],[63,67]],
    counter:[[24,69],[46,72],[68,67]],
    chords:[[0,[50,54,57]],[18,[52,55,59]],[36,[53,57,60]],[54,[55,59,62]]],
    bass:[[0,38],[8,45],[16,40],[24,43],[32,41],[40,47],[48,43],[56,40],[64,38]],
  }),
  section({
    lead:[[5,64],[13,69],[23,67],[35,62],[45,65],[57,69],[67,64]],
    counter:[[28,71],[50,67]],
    chords:[[0,[52,55,59]],[18,[53,57,60]],[36,[50,54,57]],[54,[52,55,59]]],
    bass:[[0,40],[8,47],[16,41],[24,43],[32,38],[40,45],[48,41],[56,43],[64,40]],
  }),
]);

// Harbor 23:40 — descending waterline bass, one foreground voice and very
// sparse answers. The final scene resolves by returning to the opening contour
// instead of escalating into another ornamental run.
const BEIRUT_HARBOR = Object.freeze([
  section({
    lead:[[8,67],[16,71],[26,69],[40,64],[56,67],[66,62]],
    counter:[[32,72],[60,69]],
    chords:[[0,[52,55,59]],[18,[50,55,59]],[36,[48,52,55]],[54,[50,54,57]]],
    bass:[[0,43],[12,41],[24,40],[36,38],[48,36],[60,38]],
  }),
  section({
    lead:[[6,69],[14,72],[24,67],[38,64],[52,69],[64,67]],
    counter:[[30,71],[58,72]],
    chords:[[0,[53,57,60]],[18,[52,55,59]],[36,[50,54,57]],[54,[48,52,55]]],
    bass:[[0,45],[12,43],[24,41],[36,40],[48,38],[60,36]],
  }),
  section({
    lead:[[10,64],[20,67],[34,62],[48,69],[62,64]],
    counter:[[28,71],[56,67]],
    chords:[[0,[50,55,59]],[18,[48,52,55]],[36,[53,57,60]],[54,[50,54,57]]],
    bass:[[0,41],[12,40],[24,38],[36,36],[48,41],[60,38]],
  }),
  section({
    lead:[[8,67],[16,71],[28,69],[42,64],[58,67],[68,62]],
    counter:[[34,72],[62,69]],
    chords:[[0,[52,55,59]],[18,[50,55,59]],[36,[48,52,55]],[54,[52,55,59]]],
    bass:[[0,43],[12,41],[24,40],[36,38],[48,36],[60,43]],
  }),
]);

export const BEIRUT_SONGBOOK_REWRITES = Object.freeze({
  beirut0113:Object.freeze({
    description:'Jazz levantino íntimo en 6/8: motivo corto de guitarra, respuestas de clarinete, contrabajo y silencios de verdad.',
    sections:BEIRUT_0113,
  }),
  beirutRooftop0412:Object.freeze({
    description:'Terraza a las 04:12: clarinete contenido, guitarra de nylon, Rhodes suspendido y mucho aire entre frases.',
    sections:BEIRUT_ROOFTOP,
  }),
  beirutNightTaxi:Object.freeze({
    description:'Taxi nocturno: células de guitarra sincopadas, comentarios breves de clarinete y bajo caminante; calle sin carrera de escalas.',
    sections:BEIRUT_TAXI,
  }),
  beirutHarbor2340:Object.freeze({
    description:'Puerto 23:40: melodía espaciosa, respuestas de viento y una línea de bajo descendente que deja respirar al agua y al arreglo.',
    sections:BEIRUT_HARBOR,
  }),
});

export const BEIRUT_PROFILES = Object.freeze({
  beirut0113:Object.freeze({
    family:'beirut-0113-intimate-six-eight', harmonyPath:Object.freeze([0,-2,0,3,0,-2,5,0]),
    swing:0.035, warmth:0.92, releaseScale:1.04,
    leadInstrument:'nylonGuitar', counterInstrument:'clarinet', chordInstrument:'rhodesWarm', bassInstrument:'uprightBass',
    layers:Object.freeze({ chords:false }),
    mix:Object.freeze({ lead:0.58, counter:0.20, bass:0.70, chord:0.34 }),
  }),
  beirutRooftop0412:Object.freeze({
    family:'beirut-rooftop-suspended-dialogue', harmonyPath:Object.freeze([0,0,3,0,-2,0,5,0]),
    swing:0.10, warmth:0.92, releaseScale:1.16,
    leadInstrument:'clarinet', counterInstrument:'nylonGuitar', chordInstrument:'rhodesWarm', bassInstrument:'uprightBass',
    mix:Object.freeze({ lead:0.54, counter:0.18, bass:0.62, chord:0.31 }),
  }),
  beirutNightTaxi:Object.freeze({
    family:'beirut-night-taxi-pocket', harmonyPath:Object.freeze([0,-2,3,0,5,3,-2,0]),
    swing:0.065, warmth:0.88, releaseScale:0.94,
    leadInstrument:'nylonGuitar', counterInstrument:'clarinet', chordInstrument:'rhodesWarm', bassInstrument:'uprightBass',
    mix:Object.freeze({ lead:0.58, counter:0.16, bass:0.78, chord:0.28 }),
  }),
  beirutHarbor2340:Object.freeze({
    family:'beirut-harbor-waterline', harmonyPath:Object.freeze([0,3,0,-2,0,5,3,0]),
    swing:0.075, warmth:0.90, releaseScale:1.12,
    leadInstrument:'mutedHorn', counterInstrument:'nylonGuitar', chordInstrument:'rhodesWarm', bassInstrument:'uprightBass',
    mix:Object.freeze({ lead:0.52, counter:0.17, bass:0.66, chord:0.30 }),
  }),
});

export function installBeirutSongbook({ themes }) {
  if (!themes) return;
  for (const id of BEIRUT_SONGBOOK_IDS) {
    const current = themes[id];
    const rewrite = BEIRUT_SONGBOOK_REWRITES[id];
    if (!current || !rewrite) continue;
    themes[id] = Object.freeze({ ...current, ...rewrite });
  }
}

export function withBeirutProduction(theme, feel) {
  const authored = BEIRUT_PROFILES[theme?.id];
  if (!authored) return feel;
  return Object.freeze({
    ...(feel || {}),
    ...authored,
    layers:Object.freeze({
      ...(feel?.layers || {}),
      lead:true,
      counter:true,
      chords:authored.layers?.chords ?? true,
      bass:true,
      drums:true,
      signature:true,
    }),
    mix:Object.freeze({ ...(feel?.mix || {}), ...authored.mix }),
  });
}
