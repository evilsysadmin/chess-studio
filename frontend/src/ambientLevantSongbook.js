export const LEVANT_SONGBOOK_IDS = Object.freeze([
  'damascusBlueHour',
  'aleppoAfterRain',
  'ammanVelvetRoom',
  'ammanLateTable0303',
  'medinaBlueSmoke',
]);

function line(entries) {
  return Object.freeze(Object.fromEntries(entries));
}

function section({ lead = [], counter = [], chords = [], bass = [] }) {
  return Object.freeze({
    lead:line(lead),
    counter:line(counter),
    chords:line(chords.map(([step, notes]) => [step, Object.freeze(notes)])),
    bass:line(bass),
    drums:Object.freeze({}),
  });
}

// Damascus Blue Hour — cello-led chamber music with one breathy answering voice.
// No drums: motion comes from long harmony and the bow line. Four scenes keep
// 4/4/4/3 voicings for the existing Mediterranean articulation map.
const DAMASCUS_BLUE = Object.freeze([
  section({
    lead:[[4,55],[20,59],[36,52],[52,57]],
    counter:[[28,67],[58,64]],
    chords:[[0,[48,52,55]],[16,[50,53,57]],[32,[47,52,55]],[48,[48,52,57]]],
    bass:[[0,36],[16,38],[32,35],[48,36]],
  }),
  section({
    lead:[[6,57],[22,60],[38,55],[54,59]],
    counter:[[30,69],[60,65]],
    chords:[[0,[50,53,57]],[16,[48,52,55]],[32,[52,55,59]],[48,[47,50,55]]],
    bass:[[0,38],[16,36],[32,40],[48,35]],
  }),
  section({
    lead:[[8,52],[24,57],[40,50],[56,55]],
    counter:[[32,64],[60,67]],
    chords:[[0,[47,52,55]],[16,[45,50,53]],[32,[48,52,57]],[48,[47,50,55]]],
    bass:[[0,35],[16,33],[32,36],[48,35]],
  }),
  section({
    lead:[[4,55],[20,59],[38,52],[54,57]],
    counter:[[30,67]],
    chords:[[0,[48,52,55]],[24,[47,50,55]],[48,[48,52,57]]],
    bass:[[0,36],[16,35],[32,33],[48,36]],
  }),
]);

// Aleppo After Rain — nylon guitar and clarinet in a damp small room. The guitar
// owns compact motifs; clarinet answers only after the phrase, with cello below.
const ALEPPO_RAIN = Object.freeze([
  section({
    lead:[[5,64],[13,67],[25,62],[39,69],[53,64]],
    counter:[[30,71],[58,67]],
    chords:[[0,[52,55,59]],[16,[50,55,59]],[32,[53,57,60]],[48,[50,54,57]]],
    bass:[[0,40],[16,38],[32,41],[48,36]],
  }),
  section({
    lead:[[7,67],[17,71],[29,64],[43,69],[57,62]],
    counter:[[34,72],[60,69]],
    chords:[[0,[55,59,62]],[16,[52,55,59]],[32,[50,54,57]],[48,[53,57,60]]],
    bass:[[0,43],[16,40],[32,38],[48,41]],
  }),
  section({
    lead:[[9,62],[21,65],[35,60],[49,67],[61,64]],
    counter:[[28,69],[56,65]],
    chords:[[0,[50,55,59]],[16,[48,52,55]],[32,[52,55,59]],[48,[50,54,57]]],
    bass:[[0,38],[16,36],[32,40],[48,35]],
  }),
  section({
    lead:[[5,64],[15,67],[27,62],[41,69],[55,64]],
    counter:[[32,71],[60,67]],
    chords:[[0,[52,55,59]],[24,[50,54,57]],[48,[52,55,59]]],
    bass:[[0,40],[16,38],[32,36],[48,40]],
  }),
]);

// Amman Velvet Room — warm vibes and muted horn. More lounge than regional
// showcase: each scene has one memorable vibes contour and only two horn replies.
const AMMAN_VELVET = Object.freeze([
  section({
    lead:[[4,72],[14,76],[26,71],[40,74],[54,69]],
    counter:[[32,67],[60,71]],
    chords:[[0,[52,55,59]],[16,[55,59,62]],[32,[53,57,60]],[48,[50,54,57]]],
    bass:[[0,40],[12,47],[24,43],[36,41],[48,38],[60,40]],
  }),
  section({
    lead:[[6,74],[16,77],[28,72],[42,76],[56,71]],
    counter:[[34,69],[62,72]],
    chords:[[0,[55,59,62]],[16,[52,55,59]],[32,[57,60,64]],[48,[53,57,60]]],
    bass:[[0,43],[12,50],[24,45],[36,47],[48,41],[60,43]],
  }),
  section({
    lead:[[8,69],[20,74],[34,67],[48,72],[60,69]],
    counter:[[28,65],[56,69]],
    chords:[[0,[50,55,59]],[16,[48,52,55]],[32,[52,55,59]],[48,[50,54,57]]],
    bass:[[0,38],[12,45],[24,40],[36,36],[48,41],[60,38]],
  }),
  section({
    lead:[[4,72],[14,76],[28,71],[42,74],[56,69]],
    counter:[[34,67]],
    chords:[[0,[52,55,59]],[24,[50,54,57]],[48,[52,55,59]]],
    bass:[[0,40],[12,47],[24,43],[36,38],[48,41],[60,40]],
  }),
]);

// Amman Late Table — three close-miked jazz scenes. Bass counts stay 8/8/4 so
// the downstream phrasing pass can apply the authored asymmetric walking line.
const AMMAN_LATE_TABLE = Object.freeze([
  section({
    lead:[[5,64],[15,69],[27,67],[41,71],[55,66]],
    counter:[[21,72],[49,69]],
    chords:[[0,[52,55,59]],[32,[50,54,57]]],
    bass:[[0,40],[8,47],[16,43],[24,45],[32,41],[40,48],[48,43],[56,40]],
  }),
  section({
    lead:[[7,67],[17,71],[29,69],[43,64],[57,67]],
    counter:[[23,74],[51,71]],
    chords:[[0,[55,59,62]],[32,[52,55,59]]],
    bass:[[0,43],[8,50],[16,45],[24,47],[32,41],[40,48],[48,45],[56,43]],
  }),
  section({
    lead:[[9,64],[25,67],[41,62],[57,69]],
    counter:[[33,71]],
    chords:[[0,[50,55,59]],[32,[48,52,55]]],
    bass:[[0,38],[16,45],[32,40],[48,38]],
  }),
]);

// Medina Blue Smoke — a dry jazz-guitar club score on its native 72-step form.
// Muted horn replies are scarce; the walking bass provides the forward motion.
const MEDINA_BLUE_SMOKE = Object.freeze([
  section({
    lead:[[5,64],[15,67],[27,62],[41,69],[55,64],[67,66]],
    counter:[[33,71],[61,67]],
    chords:[[0,[52,55,59]],[18,[50,54,57]],[36,[53,57,60]],[54,[52,55,59]]],
    bass:[[0,40],[9,47],[18,43],[27,45],[36,41],[45,48],[54,43],[63,40]],
  }),
  section({
    lead:[[7,67],[17,71],[29,64],[43,69],[57,62],[69,67]],
    counter:[[35,72],[63,69]],
    chords:[[0,[55,59,62]],[18,[52,55,59]],[36,[50,54,57]],[54,[53,57,60]]],
    bass:[[0,43],[9,50],[18,45],[27,47],[36,41],[45,48],[54,45],[63,43]],
  }),
  section({
    lead:[[9,62],[21,65],[35,60],[49,67],[63,64]],
    counter:[[29,69],[59,65]],
    chords:[[0,[50,55,59]],[18,[48,52,55]],[36,[52,55,59]],[54,[50,54,57]]],
    bass:[[0,38],[9,45],[18,40],[27,36],[36,41],[45,43],[54,40],[63,38]],
  }),
  section({
    lead:[[5,64],[15,67],[29,62],[43,69],[57,64],[69,66]],
    counter:[[35,71],[63,67]],
    chords:[[0,[52,55,59]],[18,[50,54,57]],[36,[53,57,60]],[54,[52,55,59]]],
    bass:[[0,40],[9,47],[18,43],[27,45],[36,41],[45,48],[54,43],[63,40]],
  }),
]);

export const LEVANT_SONGBOOK_REWRITES = Object.freeze({
  damascusBlueHour:Object.freeze({
    description:'Damasco · hora azul: cello, piano de fieltro y una sola respiración de madera; cámara nocturna sin batería ni filigrana.',
    sections:DAMASCUS_BLUE,
  }),
  aleppoAfterRain:Object.freeze({
    description:'Alepo después de la lluvia: guitarra de nylon, clarinete y cello en frases cortas; pequeña sala húmeda, no escaparate regional.',
    sections:ALEPPO_RAIN,
  }),
  ammanVelvetRoom:Object.freeze({
    description:'Amán · sala de terciopelo: vibes cálidas, trompeta apagada, Rhodes y contrabajo; lounge lento con aire entre frases.',
    sections:AMMAN_VELVET,
  }),
  ammanLateTable0303:Object.freeze({
    description:'Amán · última mesa 03:03: guitarra jazz, clarinete, Rhodes y walking bass; conversación de club cercana y sin adorno gratuito.',
    sections:AMMAN_LATE_TABLE,
  }),
  medinaBlueSmoke:Object.freeze({
    description:'Medina · humo azul: guitarra jazz seca, trompeta apagada y bajo caminante; club nocturno turbio, melódico y sin oud obligatorio.',
    sections:MEDINA_BLUE_SMOKE,
  }),
});

export const LEVANT_PROFILES = Object.freeze({
  damascusBlueHour:Object.freeze({
    family:'damascus-cello-ney-drone', preserveSectionOrder:true,
    harmonyPath:Object.freeze([0,0,-2,0,3,0,-2,0]),
    swing:0, warmth:0.82, releaseScale:1.32,
    leadInstrument:'cello', counterInstrument:'cedarFlute', chordInstrument:'feltGrand', bassInstrument:'uprightBass',
    drumMode:'none',
    layers:Object.freeze({ drums:false }),
    mix:Object.freeze({ lead:0.46, counter:0.12, bass:0.46, chord:0.24 }),
  }),
  aleppoAfterRain:Object.freeze({
    family:'aleppo-rain-guitar-cello-chamber', preserveSectionOrder:true,
    harmonyPath:Object.freeze([0,-2,0,3,0,-2,0,5]),
    swing:0.04, warmth:0.90, releaseScale:1.16,
    leadInstrument:'nylonGuitar', counterInstrument:'clarinet', chordInstrument:'rhodesWarm', bassInstrument:'cello',
    mix:Object.freeze({ lead:0.52, counter:0.14, bass:0.50, chord:0.24 }),
  }),
  ammanVelvetRoom:Object.freeze({
    family:'amman-velvet-vibes-horn-lounge', preserveSectionOrder:true,
    harmonyPath:Object.freeze([0,3,0,-2,0,5,0,-2]),
    swing:0.10, warmth:0.94, releaseScale:1.12,
    leadInstrument:'warmVibes', counterInstrument:'mutedHorn', chordInstrument:'rhodesWarm', bassInstrument:'uprightBass',
    mix:Object.freeze({ lead:0.50, counter:0.14, bass:0.58, chord:0.24 }),
  }),
  ammanLateTable0303:Object.freeze({
    family:'amman-late-table-jazz-pocket', preserveSectionOrder:true,
    harmonyPath:Object.freeze([0,0,-2,3,0,-2]),
    swing:0.13, warmth:0.92, releaseScale:0.98,
    leadInstrument:'jazzGuitar', counterInstrument:'clarinet', chordInstrument:'rhodesWarm', bassInstrument:'uprightBass',
    mix:Object.freeze({ lead:0.54, counter:0.14, bass:0.72, chord:0.22 }),
  }),
  medinaBlueSmoke:Object.freeze({
    family:'medina-blue-smoke-dry-jazz-club', preserveSectionOrder:true,
    harmonyPath:Object.freeze([0,-2,3,0,5,0,-2,0]),
    swing:0.11, warmth:0.91, releaseScale:1.00,
    leadInstrument:'jazzGuitar', counterInstrument:'mutedHorn', chordInstrument:'rhodesWarm', bassInstrument:'uprightBass',
    mix:Object.freeze({ lead:0.55, counter:0.14, bass:0.70, chord:0.22 }),
  }),
});

export function installLevantSongbook({ themes }) {
  if (!themes) return;
  for (const id of LEVANT_SONGBOOK_IDS) {
    const current = themes[id];
    const rewrite = LEVANT_SONGBOOK_REWRITES[id];
    if (!current || !rewrite) continue;
    themes[id] = { ...current, ...rewrite };
  }
}

export function withLevantProduction(theme, feel) {
  const authored = LEVANT_PROFILES[theme?.id];
  if (!authored) return feel;
  return Object.freeze({
    ...(feel || {}),
    ...authored,
    layers:Object.freeze({
      ...(feel?.layers || {}),
      lead:authored.layers?.lead ?? feel?.layers?.lead ?? true,
      counter:authored.layers?.counter ?? feel?.layers?.counter ?? true,
      chords:authored.layers?.chords ?? feel?.layers?.chords ?? true,
      bass:authored.layers?.bass ?? feel?.layers?.bass ?? true,
      drums:authored.layers?.drums ?? feel?.layers?.drums ?? true,
      signature:authored.layers?.signature ?? true,
    }),
    mix:Object.freeze({ ...(feel?.mix || {}), ...authored.mix }),
  });
}
