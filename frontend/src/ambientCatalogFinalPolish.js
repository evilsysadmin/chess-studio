function signature(instrument, motif, sections, repeatPeriod, durationSteps, volume = 0.16, everyCycles = 3) {
  return Object.freeze({
    instrument,
    motif:Object.freeze(motif),
    sections:Object.freeze(sections),
    repeatPeriod,
    durationSteps,
    volume,
    everyCycles,
  });
}

function percussion(kit, period, pattern, punch = 0.7) {
  return Object.freeze({ kit, period, pattern:Object.freeze(pattern), punch });
}

function finish(name, brightness, reflectionScale, stereoWidth, driftCents = 1) {
  return Object.freeze({ name, brightness, reflectionScale, stereoWidth, driftCents });
}

// Final exceptions found by the complete catalog audit. Every entry below
// closes a measurable gap: a two-note/no-note signature, a duplicated player
// chain inside one genre, or a hidden score that still used legacy production.
const FINAL_CATALOG_POLISH = Object.freeze({
  march: Object.freeze({
    family:'siege-horn-string-field', leadInstrument:'mutedHorn', counterInstrument:'strings', chordInstrument:'strings', bassInstrument:'cello',
    percussion:percussion('siege-field', 16, { 0:'K', 4:'W', 8:'S', 12:'W' }, 0.86),
    signature:signature('mutedHorn', { 4:55, 12:62, 20:58, 28:65 }, [0], 32, 4.2, 0.18, 2),
  }),
  pawnMarshal: Object.freeze({
    family:'illustrated-pawn-march-chamber', leadInstrument:'mutedHorn', counterInstrument:'feltGrand', chordInstrument:'strings', bassInstrument:'uprightBass',
    percussion:percussion('illustrated-march', 16, { 0:'K', 6:'W', 8:'S', 14:'W' }, 0.82),
    signature:signature('mutedHorn', { 2:60, 10:67, 18:64, 26:69 }, [0,1], 32, 4.0, 0.17, 2),
  }),
  winterLibrary: Object.freeze({
    counterInstrument:'cedarFlute',
  }),
  lofiRainTape: Object.freeze({
    signature:signature('tapePiano', { 6:64, 18:67, 38:62, 54:59 }, [0,1], 64, 5.6, 0.15),
  }),
  lofiWindowLight: Object.freeze({
    signature:signature('warmVibes', { 4:72, 20:76, 36:69, 52:74 }, [0,1], 64, 4.8, 0.15),
  }),
  verticalRainPiano: Object.freeze({
    signature:signature('feltGrand', { 8:67, 24:64, 48:69, 64:62 }, [0,2], 80, 8.0, 0.14),
  }),
  midnightSatin: Object.freeze({
    signature:signature('jazzGuitar', { 10:71, 26:74, 42:67, 58:69 }, [0,1], 64, 5.2, 0.17, 2),
  }),

  // Three remaining within-genre player-chain collisions.
  istanbulBackgammon: Object.freeze({
    family:'istanbul-tavla-clarinet-buzuq', counterInstrument:'buzuq', chordInstrument:'rhodesWarm',
    percussion:percussion('tavla-table', 18, { 0:'K', 5:'W', 9:'S', 14:'W' }, 0.78),
  }),
  beirutHarbor2340: Object.freeze({
    family:'beirut-harbor-horn-guitar-combo', leadInstrument:'mutedHorn', counterInstrument:'nylonGuitar',
    percussion:percussion('harbor-brush', 24, { 0:'B', 8:'H', 12:'S', 20:'B' }, 0.66),
  }),
  cadizLanterns: Object.freeze({
    family:'cadiz-lantern-guitar-qanun', counterInstrument:'qanun',
    // The score is written as four 18-step 6/8 phrases. Keep its hand drum on
    // that same grid: a 16-step loop drifted by eight steps at every section
    // boundary and eventually placed the backbeat against the melody.
    percussion:percussion('cadiz-lantern-hand', 18, { 0:'K', 3:'B', 6:'H', 9:'B', 12:'S', 15:'B' }, 0.76),
  }),

  // Curated/hidden material stays production-ready even while it is not in
  // the public selector. Re-enabling it later cannot regress the premium bar.
  orbitalMonastery: Object.freeze({
    family:'orbital-monastery-choir-wide-orbit', leadInstrument:'choir', counterInstrument:'glass', chordInstrument:'widePad', bassInstrument:'organbass',
    finish:finish('orbital-chapel', 0.82, 1.28, 1.20, 1.8),
    signature:signature('choir', { 6:67, 22:74, 38:69, 54:76 }, [0,1], 64, 9.0, 0.12, 4),
  }),
  metro317: Object.freeze({
    family:'metro-0317-arcade-rail', leadInstrument:'arcadePulse', chordInstrument:'stormPad', bassInstrument:'subPulse',
    finish:finish('fluorescent-rail', 1.08, 0.74, 0.82, 2.2),
    percussion:percussion('metro-rail', 16, { 0:'K', 3:'H', 8:'S', 11:'H' }, 0.96),
    signature:signature('arcadePulse', { 2:72, 10:75, 18:67, 26:79 }, [0], 32, 2.6, 0.16, 2),
  }),
  glassAsh: Object.freeze({
    family:'glass-ash-frosted-drone', leadInstrument:'glass', counterInstrument:'cedarFlute', chordInstrument:'stormPad', bassInstrument:'cello',
    finish:finish('ash-and-glass', 0.88, 1.20, 1.16, 1.4),
    signature:signature('glass', { 8:76, 24:71, 40:79, 56:69 }, [0,1], 64, 7.2, 0.12, 4),
  }),
  machineRoom: Object.freeze({
    family:'machine-room-sub-industrial', leadInstrument:'metallic', counterInstrument:'stormPluck', chordInstrument:'stormPad', bassInstrument:'subPulse',
    finish:finish('machine-steel', 0.96, 0.72, 0.76, 0.6),
    percussion:percussion('machine-industrial', 16, { 0:'K', 4:'M', 8:'S', 12:'H' }, 1.10),
    signature:signature('metallic', { 3:60, 11:66, 19:55, 27:63 }, [0], 32, 3.0, 0.14, 2),
  }),
  abyssalArchive: Object.freeze({
    family:'abyssal-archive-choir-cello-nave', leadInstrument:'choir', counterInstrument:'cello', chordInstrument:'organ', bassInstrument:'organbass',
    finish:finish('abyssal-nave', 0.72, 1.30, 1.18, 1.2),
    signature:signature('cello', { 6:43, 22:38, 38:45, 54:36 }, [0,2], 64, 9.4, 0.11, 4),
  }),
  redVault: Object.freeze({
    family:'red-vault-string-organ-drone', leadInstrument:'strings', counterInstrument:'organ', chordInstrument:'stormPad', bassInstrument:'cello',
    finish:finish('red-vault', 0.78, 1.26, 1.12, 1.0),
    signature:signature('strings', { 4:60, 20:65, 36:58, 52:67 }, [0,1], 64, 8.6, 0.12, 4),
  }),
  blackArchive: Object.freeze({
    family:'black-archive-forbidden-library', preserveSectionOrder:true,
    harmonyPath:Object.freeze([0,0,-2,0,3,0]), swing:0, warmth:0.76, releaseScale:1.54, space:0.30, delayMs:388,
    leadInstrument:'choir', counterInstrument:'cello', chordInstrument:'organ', bassInstrument:'organbass', chordHoldSteps:30, bassHoldSteps:24,
    drumMode:'none', percussion:percussion('none', 40, {}, 0),
    layers:Object.freeze({ lead:true, counter:true, chords:true, bass:true, drums:false, signature:true }),
    mix:Object.freeze({ lead:0.42, counter:0.24, bass:0.46, chord:0.30 }),
    finish:finish('black-library', 0.68, 1.30, 1.06, 1.4),
    signature:signature('choir', { 6:55, 18:50, 46:57, 58:48 }, [0,2], 80, 10.2, 0.10, 4),
  }),
});

export const FINAL_CATALOG_POLISH_IDS = Object.freeze(Object.keys(FINAL_CATALOG_POLISH));

export function withFinalCatalogPolish(theme, feel) {
  const polish = FINAL_CATALOG_POLISH[theme?.id];
  if (!polish && !feel) return feel;
  const result = {
    ...(feel || {}),
    ...polish,
    layers:Object.freeze({ ...(feel?.layers || {}), ...(polish?.layers || {}), ...(polish ? { signature:true } : {}) }),
    mix:Object.freeze({ ...(feel?.mix || {}), ...(polish?.mix || {}) }),
  };
  const signatureSections = result.signature?.sections;
  if (Array.isArray(signatureSections) && Array.isArray(theme?.sections)) {
    const validSections = signatureSections.filter((section) => section >= 0 && section < theme.sections.length);
    if (validSections.length !== signatureSections.length) {
      result.signature = Object.freeze({ ...result.signature, sections:Object.freeze(validSections.length ? validSections : [0]) });
    }
  }
  if (!polish && result.signature === feel?.signature) return feel;
  return Object.freeze(result);
}

export { FINAL_CATALOG_POLISH };
