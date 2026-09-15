export const EGYPT_NILE_SONGBOOK_IDS = Object.freeze([
  'alexandria241',
  'cairo0047',
  'cairoQuietHours',
  'cairoRedLantern',
  'cairoBlueNote0211',
  'nileBalcony0152',
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

// Alexandria 02:41 — deliberately a minimal piano trio. The old catalog named
// ney/oud as foreground voices even though the production profile muted those
// lanes. The rewritten score embraces the actual identity: felt harmony, bass,
// brushes and the existing sparse signature are enough.
const ALEXANDRIA_0241 = Object.freeze([
  section({
    chords:[[0,[52,55,59]],[16,[50,55,59]],[32,[53,57,60]],[48,[52,55,59]]],
    bass:[[0,40],[12,47],[24,43],[36,41],[48,38],[60,40]],
  }),
  section({
    chords:[[0,[55,59,62]],[16,[52,55,59]],[32,[50,54,57]],[48,[53,57,60]]],
    bass:[[0,43],[12,40],[24,38],[36,45],[48,41],[60,43]],
  }),
  section({
    chords:[[0,[50,55,59]],[16,[48,52,55]],[32,[52,55,59]],[48,[50,54,57]]],
    bass:[[0,38],[12,45],[24,40],[36,36],[48,41],[60,38]],
  }),
  section({
    chords:[[0,[52,55,59]],[16,[50,55,59]],[32,[53,57,60]],[48,[52,55,59]]],
    bass:[[0,40],[12,47],[24,43],[36,38],[48,41],[60,40]],
  }),
]);

// Cairo 00:47 — smoky horn and nylon-guitar replies around Rhodes. Short motifs
// replace the old continuous ornamental feeling; the counter voice enters only
// after the horn phrase has had room to land.
const CAIRO_0047 = Object.freeze([
  section({
    lead:[[4,67],[12,70],[22,69],[38,64],[52,67]],
    counter:[[28,60],[58,64]],
    chords:[[0,[52,55,59]],[16,[50,54,57]],[32,[53,57,60]],[48,[50,55,59]]],
    bass:[[0,40],[12,47],[24,38],[36,43],[48,41],[60,40]],
  }),
  section({
    lead:[[6,69],[14,72],[26,67],[40,64],[54,69]],
    counter:[[32,62],[60,65]],
    chords:[[0,[53,57,60]],[16,[52,55,59]],[32,[55,59,62]],[48,[50,54,57]]],
    bass:[[0,41],[12,48],[24,40],[36,45],[48,43],[60,41]],
  }),
  section({
    lead:[[8,64],[18,67],[30,62],[44,69],[58,64]],
    counter:[[24,60],[50,62]],
    chords:[[0,[50,55,59]],[16,[48,52,55]],[32,[53,57,60]],[48,[50,54,57]]],
    bass:[[0,38],[12,45],[24,40],[36,36],[48,43],[60,38]],
  }),
  section({
    lead:[[4,67],[12,70],[24,69],[40,64],[56,67]],
    counter:[[30,60],[60,64]],
    chords:[[0,[52,55,59]],[16,[50,54,57]],[32,[53,57,60]],[48,[52,55,59]]],
    bass:[[0,40],[12,47],[24,38],[36,43],[48,41],[60,40]],
  }),
]);

// Quiet Hours — muted horn, nylon guitar and long harmonic breaths. Four scenes
// keep exactly 4/4/4/3 voicings so the established Mediterranean articulation
// pass can place them on Cairo's asymmetric attack map.
const CAIRO_QUIET = Object.freeze([
  section({
    lead:[[6,69],[18,65],[34,62],[50,67]],
    counter:[[26,60],[58,64]],
    chords:[[0,[52,55,59]],[16,[50,54,57]],[32,[48,52,55]],[48,[50,55,59]]],
    bass:[[0,40],[16,38],[32,36],[48,41]],
  }),
  section({
    lead:[[8,67],[22,71],[38,64],[54,69]],
    counter:[[30,62],[60,65]],
    chords:[[0,[55,59,62]],[16,[52,55,59]],[32,[50,54,57]],[48,[53,57,60]]],
    bass:[[0,43],[16,40],[32,38],[48,41]],
  }),
  section({
    lead:[[10,64],[24,69],[40,62],[56,67]],
    counter:[[32,60],[60,64]],
    chords:[[0,[50,55,59]],[16,[48,52,55]],[32,[52,55,59]],[48,[50,54,57]]],
    bass:[[0,38],[16,36],[32,40],[48,35]],
  }),
  section({
    lead:[[6,69],[20,65],[38,62],[54,67]],
    counter:[[28,60],[58,64]],
    chords:[[0,[52,55,59]],[24,[50,54,57]],[48,[52,55,59]]],
    bass:[[0,40],[16,38],[32,36],[48,40]],
  }),
]);

// Red Lantern — more dry guitar club than regional postcard. Guitar carries a
// compact descending cell; muted horn answers after the phrase instead of both
// voices continuously decorating the same scale.
const CAIRO_RED_LANTERN = Object.freeze([
  section({
    lead:[[3,69],[11,67],[21,64],[35,66],[49,62],[61,64]],
    counter:[[27,72],[55,69]],
    chords:[[0,[53,57,60]],[16,[52,55,59]],[32,[50,54,57]],[48,[53,57,60]]],
    bass:[[0,41],[8,48],[16,43],[24,45],[32,40],[40,47],[48,43],[56,41]],
  }),
  section({
    lead:[[5,71],[15,67],[25,69],[39,64],[51,66],[63,62]],
    counter:[[31,74],[59,71]],
    chords:[[0,[55,59,62]],[16,[52,55,59]],[32,[53,57,60]],[48,[50,54,57]]],
    bass:[[0,43],[8,50],[16,45],[24,47],[32,41],[40,48],[48,45],[56,43]],
  }),
  section({
    lead:[[3,67],[13,64],[23,69],[37,66],[49,62],[61,67]],
    counter:[[29,71],[55,69]],
    chords:[[0,[52,55,59]],[16,[50,54,57]],[32,[48,52,55]],[48,[53,57,60]]],
    bass:[[0,40],[8,47],[16,43],[24,38],[32,41],[40,45],[48,43],[56,40]],
  }),
  section({
    lead:[[5,69],[15,67],[27,64],[41,66],[53,62],[63,64]],
    counter:[[33,72],[57,69]],
    chords:[[0,[53,57,60]],[16,[52,55,59]],[32,[50,54,57]],[48,[53,57,60]]],
    bass:[[0,41],[8,48],[16,43],[24,45],[32,40],[40,47],[48,43],[56,41]],
  }),
]);

// Blue Note 02:11 — almost-empty jazz club. Three scenes intentionally retain
// bass counts 8/8/4 because the downstream bass-phrasing pass owns the exact
// onset positions. The horn is sparse; the guitar answers only a few times.
const CAIRO_BLUE_NOTE = Object.freeze([
  section({
    lead:[[6,67],[18,70],[34,64],[50,69]],
    counter:[[26,60],[58,64]],
    chords:[[0,[52,55,59]],[32,[50,54,57]]],
    bass:[[0,40],[8,47],[16,43],[24,38],[32,41],[40,45],[48,43],[56,40]],
  }),
  section({
    lead:[[8,69],[22,72],[38,67],[54,64]],
    counter:[[30,62],[60,65]],
    chords:[[0,[53,57,60]],[32,[52,55,59]]],
    bass:[[0,41],[8,48],[16,43],[24,45],[32,40],[40,47],[48,43],[56,41]],
  }),
  section({
    lead:[[10,64],[26,67],[42,62],[58,69]],
    counter:[[34,60]],
    chords:[[0,[50,55,59]],[32,[48,52,55]]],
    bass:[[0,38],[16,45],[32,40],[48,38]],
  }),
]);

// Nile Balcony — a weightless river nocturne. Warm vibes are the foreground,
// an occasional cedar-flute breath answers, cello moves slowly underneath and
// the drum lane stays absent. Keep 4/4/4/3 chords for the existing Nile attack
// map; the long-form motion comes from harmony and space, not ornament.
const NILE_BALCONY = Object.freeze([
  section({
    lead:[[6,72],[20,76],[38,69],[54,74]],
    counter:[[30,67],[60,71]],
    chords:[[0,[52,55,59]],[16,[50,55,59]],[32,[53,57,60]],[48,[52,55,59]]],
    bass:[[0,40],[16,38],[32,41],[48,36]],
  }),
  section({
    lead:[[8,74],[24,77],[40,71],[56,76]],
    counter:[[32,69],[60,72]],
    chords:[[0,[55,59,62]],[16,[52,55,59]],[32,[50,54,57]],[48,[53,57,60]]],
    bass:[[0,43],[16,40],[32,38],[48,41]],
  }),
  section({
    lead:[[10,69],[26,74],[42,67],[58,72]],
    counter:[[34,65],[62,69]],
    chords:[[0,[50,55,59]],[16,[48,52,55]],[32,[52,55,59]],[48,[50,54,57]]],
    bass:[[0,38],[16,36],[32,40],[48,35]],
  }),
  section({
    lead:[[6,72],[22,76],[40,69],[56,74]],
    counter:[[32,67]],
    chords:[[0,[52,55,59]],[24,[50,54,57]],[48,[52,55,59]]],
    bass:[[0,40],[16,38],[32,41],[48,40]],
  }),
]);

export const EGYPT_NILE_SONGBOOK_REWRITES = Object.freeze({
  alexandria241:Object.freeze({
    description:'Alejandría 02:41: trío minimalista de piano de fieltro, contrabajo y escobillas; el silencio y una firma puntual hacen el resto.',
    sections:ALEXANDRIA_0241,
  }),
  cairo0047:Object.freeze({
    description:'Cairo 00:47: trompeta apagada, guitarra de nylon, Rhodes y contrabajo en frases cortas con respuesta y bastante aire.',
    sections:CAIRO_0047,
  }),
  cairoQuietHours:Object.freeze({
    description:'Cairo · Quiet Hours: metales apagados, guitarra de nylon y Rhodes con respiraciones largas; noir íntimo sin filigrana continua.',
    sections:CAIRO_QUIET,
  }),
  cairoRedLantern:Object.freeze({
    description:'Cairo · farol rojo: guitarra jazz seca, respuestas breves de trompeta y bajo caminante; club tardío, no postal oriental.',
    sections:CAIRO_RED_LANTERN,
  }),
  cairoBlueNote0211:Object.freeze({
    description:'Cairo · Blue Note 02:11: trompeta muy espaciada, guitarra jazz, Rhodes y bajo acústico en un club casi vacío.',
    sections:CAIRO_BLUE_NOTE,
  }),
  nileBalcony0152:Object.freeze({
    description:'Nilo · balcón 01:52: vibes cálidas, cello, reflejos de Rhodes y apenas una respiración de flauta; nocturno de río sin batería.',
    sections:NILE_BALCONY,
  }),
});

export const EGYPT_NILE_PROFILES = Object.freeze({
  alexandria241:Object.freeze({
    family:'alexandria-minimal-piano-trio', preserveSectionOrder:true,
    harmonyPath:Object.freeze([0,0,-2,0,3,0]),
    swing:0.12, warmth:0.96, releaseScale:1.18,
    chordInstrument:'felt', bassInstrument:'uprightBass',
    layers:Object.freeze({ lead:false, counter:false, chords:true, bass:true, drums:true, signature:true }),
    mix:Object.freeze({ lead:0, counter:0, bass:0.60, chord:0.48 }),
  }),
  cairo0047:Object.freeze({
    // Keep this family name: ambientProfiles.test uses it as the stable legacy
    // boundary marker for non-specialized profile delegation.
    family:'cairo-rhodes-horn-noir', preserveSectionOrder:true,
    harmonyPath:Object.freeze([0,-2,0,3,0,-2]),
    swing:0.055, warmth:0.90, releaseScale:1.06,
    leadInstrument:'mutedHorn', counterInstrument:'nylonGuitar', chordInstrument:'rhodesWarm', bassInstrument:'uprightBass',
    mix:Object.freeze({ lead:0.54, counter:0.17, bass:0.66, chord:0.26 }),
  }),
  cairoQuietHours:Object.freeze({
    family:'cairo-quiet-muted-horn-noir', preserveSectionOrder:true,
    harmonyPath:Object.freeze([0,-2,0,3,0,-5]),
    swing:0.10, warmth:0.88, releaseScale:1.18,
    leadInstrument:'mutedHorn', counterInstrument:'nylonGuitar', chordInstrument:'rhodesWarm', bassInstrument:'uprightBass',
    mix:Object.freeze({ lead:0.50, counter:0.15, bass:0.56, chord:0.24 }),
  }),
  cairoRedLantern:Object.freeze({
    family:'cairo-red-lantern-dry-guitar-club', preserveSectionOrder:true,
    harmonyPath:Object.freeze([0,3,0,-2,5,0,-2,0]),
    swing:0.09, warmth:0.91, releaseScale:0.96,
    leadInstrument:'jazzGuitar', counterInstrument:'mutedHorn', chordInstrument:'rhodesWarm', bassInstrument:'uprightBass',
    mix:Object.freeze({ lead:0.56, counter:0.15, bass:0.72, chord:0.22 }),
  }),
  cairoBlueNote0211:Object.freeze({
    family:'cairo-blue-note-empty-club', preserveSectionOrder:true,
    harmonyPath:Object.freeze([0,0,3,0,-2,0]),
    swing:0.13, warmth:0.92, releaseScale:1.14,
    leadInstrument:'mutedHorn', counterInstrument:'jazzGuitar', chordInstrument:'rhodesWarm', bassInstrument:'uprightBass',
    mix:Object.freeze({ lead:0.48, counter:0.14, bass:0.62, chord:0.24 }),
  }),
  nileBalcony0152:Object.freeze({
    family:'nile-vibes-cello-river-nocturne', preserveSectionOrder:true,
    harmonyPath:Object.freeze([0,0,5,0,-2,0]),
    swing:0, warmth:0.94, releaseScale:1.30,
    leadInstrument:'warmVibes', counterInstrument:'cedarFlute', chordInstrument:'rhodesWarm', bassInstrument:'cello',
    drumMode:'none',
    layers:Object.freeze({ drums:false }),
    mix:Object.freeze({ lead:0.46, counter:0.12, bass:0.48, chord:0.24 }),
  }),
});

export function installEgyptNileSongbook({ themes }) {
  if (!themes) return;
  for (const id of EGYPT_NILE_SONGBOOK_IDS) {
    const current = themes[id];
    const rewrite = EGYPT_NILE_SONGBOOK_REWRITES[id];
    if (!current || !rewrite) continue;
    // Chord and bass diversity passes run later and replace theme.sections.
    // Keep score internals immutable, but preserve that established mutable
    // theme-container boundary.
    themes[id] = { ...current, ...rewrite };
  }
}

export function withEgyptNileProduction(theme, feel) {
  const authored = EGYPT_NILE_PROFILES[theme?.id];
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
