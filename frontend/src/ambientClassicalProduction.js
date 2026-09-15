function finish(name, brightness, reflectionScale, stereoWidth, sampleGain = 1, sampleAttack = 1) {
  return Object.freeze({ name, brightness, reflectionScale, stereoWidth, sampleGain, sampleAttack, driftCents: 0.5 });
}

const ROOMS = Object.freeze({
  baroque: finish('baroque-gallery', 1.06, 0.82, 0.82),
  cathedral: finish('stone-nave', 0.86, 1.24, 1.18),
  western: finish('western-dawn', 0.92, 0.92, 1.08),
  late: finish('late-chamber', 0.84, 1.08, 0.96, 0.94, 1.08),
  riga: finish('baltic-glass', 1.02, 1.02, 1.04),
  tango: finish('tango-stage', 0.98, 0.76, 0.88),
  vienna: finish('viennese-salon', 0.94, 0.94, 1.08, 0.96, 0.92),
  snow: finish('snow-library', 0.76, 1.16, 0.84, 0.88, 1.12),
  requiem: finish('requiem-nave', 0.78, 1.28, 1.18, 0.92, 1.16),
  adagio: finish('adagio-close-stage', 0.90, 1.10, 1.12, 1.04, 1.08),
  fugue: finish('fugue-chamber', 1.08, 0.72, 0.94, 1.06, 0.82),
  quartet: finish('quartet-stage', 0.96, 1.06, 1.2, 1.08, 1.04),
  clockwork: finish('clockwork-orchestra', 1.04, 0.88, 1.16, 1.08, 0.78),
});

function signature(instrument, motif, sections, repeatPeriod, durationSteps, volume = 0.18, everyCycles = 2) {
  return Object.freeze({
    instrument,
    motif: Object.freeze(motif),
    sections: Object.freeze(sections),
    repeatPeriod,
    durationSteps,
    volume,
    everyCycles,
  });
}

function percussion(kit, period, pattern, punch) {
  return Object.freeze({ kit, period, pattern: Object.freeze(pattern), punch });
}

const CLASSICAL_PRODUCTION = Object.freeze({
  gambit: Object.freeze({
    family:'royal-gambit-baroque-ensemble', finish:ROOMS.baroque,
    leadInstrument:'harpsichord', chordInstrument:'harpsichord', bassInstrument:'pizz',
    space:0.105, delayMs:126, chordHoldSteps:5, bassHoldSteps:2.4,
    percussion:percussion('baroque-wood', 16, { 0:'W', 6:'H', 8:'W', 14:'H' }, 0.56),
    signature:signature('spiccatoStrings', { 1:76, 9:81, 17:77, 25:83 }, [0], 32, 2.4, 0.16),
  }),
  cathedral: Object.freeze({
    family:'empty-cathedral-organ-choir-nave', finish:ROOMS.cathedral,
    leadInstrument:'organ', counterInstrument:'choir', chordInstrument:'organ', bassInstrument:'organbass',
    space:0.30, delayMs:382, chordHoldSteps:30, bassHoldSteps:28,
    signature:signature('choir', { 6:67, 14:72, 38:65, 46:70 }, [0,1], 64, 9.2, 0.13, 3),
  }),
  duel: Object.freeze({
    family:'western-dawn-tremolo-duel', finish:ROOMS.western,
    leadInstrument:'tremoloGuitar', counterInstrument:'mutedHorn', chordInstrument:'nylonGuitar', bassInstrument:'uprightBass',
    space:0.13, delayMs:174, chordHoldSteps:9, bassHoldSteps:4,
    percussion:percussion('western-brush', 32, { 0:'B', 16:'W', 24:'B' }, 0.62),
    signature:signature('tremoloGuitar', { 7:67, 15:71, 23:64, 31:69 }, [0], 32, 5.4, 0.17),
  }),
  lateEndgame: Object.freeze({
    family:'late-endgame-grand-cello-chamber', finish:ROOMS.late,
    leadInstrument:'feltGrand', counterInstrument:'strings', chordInstrument:'feltGrand', bassInstrument:'cello',
    space:0.24, delayMs:286, chordHoldSteps:26, bassHoldSteps:18,
    signature:signature('cello', { 4:57, 20:64, 36:60, 52:55 }, [0,1], 64, 7.8, 0.14, 3),
  }),
  rigaRain: Object.freeze({
    family:'riga-rain-warm-marimba-glass', finish:ROOMS.riga,
    leadInstrument:'warmMarimba', counterInstrument:'glass', chordInstrument:'feltGrand', bassInstrument:'pizz',
    space:0.17, delayMs:218, chordHoldSteps:16, bassHoldSteps:4,
    percussion:percussion('riga-rain-glass', 16, { 7:'B', 15:'M' }, 0.44),
    signature:signature('glass', { 5:70, 13:74, 21:69, 29:76 }, [0,1], 32, 4.8, 0.14, 3),
  }),
  kingTango: Object.freeze({
    family:'knife-king-tango-stage', finish:ROOMS.tango,
    leadInstrument:'bandoneon', counterInstrument:'nylonGuitar', chordInstrument:'bandoneon', bassInstrument:'uprightBass',
    space:0.095, delayMs:104, chordHoldSteps:7, bassHoldSteps:2.4,
    percussion:percussion('tango-stage', 8, { 0:'K', 3:'W', 4:'K', 7:'S' }, 0.92),
    signature:signature('bandoneon', { 3:69, 11:76, 19:65, 27:72 }, [0], 32, 3.8, 0.19),
  }),
  zugzwangWaltz: Object.freeze({
    family:'viennese-waltz-live-chamber', finish:ROOMS.vienna,
    leadInstrument:'feltGrand', counterInstrument:'strings', chordInstrument:'feltGrand', bassInstrument:'cello',
    space:0.18, delayMs:212, chordHoldSteps:16, bassHoldSteps:8,
    percussion:percussion('chamber-waltz', 24, { 0:'K', 8:'B', 16:'B' }, 0.52),
    signature:signature('strings', { 2:72, 8:76, 14:74, 20:79 }, [0,1], 24, 5.6, 0.15, 3),
  }),
  winterLibrary: Object.freeze({
    family:'snow-library-grand-string-whisper', finish:ROOMS.snow,
    leadInstrument:'feltGrand', counterInstrument:'strings', chordInstrument:'feltGrand', bassInstrument:'cello',
    space:0.27, delayMs:326, chordHoldSteps:30, bassHoldSteps:20,
    signature:signature('strings', { 7:76, 15:72, 39:74, 47:69 }, [0,1], 64, 8.4, 0.12, 4),
  }),
  queenRequiem: Object.freeze({
    family:'queen-requiem-choir-organ-cello', finish:ROOMS.requiem,
    leadInstrument:'choir', counterInstrument:'strings', chordInstrument:'organ', bassInstrument:'cello',
    space:0.30, delayMs:414, chordHoldSteps:31, bassHoldSteps:26,
    signature:signature('strings', { 8:67, 20:70, 40:65, 52:72 }, [0,1], 64, 9.6, 0.12, 4),
  }),
  endgameAdagio: Object.freeze({
    family:'chamber-adagio-recorded-strings', finish:ROOMS.adagio,
    leadInstrument:'strings', counterInstrument:'feltGrand', chordInstrument:'strings', bassInstrument:'cello',
    space:0.25, delayMs:302, chordHoldSteps:28, bassHoldSteps:22,
    signature:signature('cello', { 6:57, 18:64, 38:60, 54:67 }, [0,2], 64, 8.8, 0.15, 3),
  }),
  knightFugue: Object.freeze({
    family:'baroque-fugue-spiccato-dialogue', finish:ROOMS.fugue,
    leadInstrument:'harpsichord', counterInstrument:'spiccatoStrings', chordInstrument:'harpsichord', bassInstrument:'spiccatoCello',
    space:0.095, delayMs:116, chordHoldSteps:6, bassHoldSteps:2.6,
    signature:signature('spiccatoStrings', { 2:72, 18:76, 34:74, 50:79 }, [0,1], 64, 2.6, 0.17),
  }),
  nocturnalQuartet: Object.freeze({
    family:'night-string-quartet-recorded-stage', finish:ROOMS.quartet,
    leadInstrument:'strings', counterInstrument:'cello', chordInstrument:'strings', bassInstrument:'cello',
    space:0.23, delayMs:274, chordHoldSteps:24, bassHoldSteps:18,
    signature:signature('strings', { 6:69, 18:76, 42:72, 58:67 }, [0,2], 80, 7.6, 0.15, 3),
  }),
  clockworkOverture: Object.freeze({
    family:'orchestral-clockwork-overture', finish:ROOMS.clockwork,
    leadInstrument:'spiccatoStrings', counterInstrument:'feltGrand', chordInstrument:'strings', bassInstrument:'spiccatoCello',
    space:0.20, delayMs:226, chordHoldSteps:12, bassHoldSteps:3,
  }),
});

export const CLASSICAL_PRODUCTION_IDS = Object.freeze(Object.keys(CLASSICAL_PRODUCTION));

export function withClassicalProduction(theme, feel) {
  const production = CLASSICAL_PRODUCTION[theme?.id];
  if (!production || !feel) return feel;
  return Object.freeze({
    ...feel,
    ...production,
    layers:Object.freeze({ ...(feel.layers || {}), signature:true }),
    mix:Object.freeze({ ...(feel.mix || {}) }),
  });
}

export { CLASSICAL_PRODUCTION, ROOMS as CLASSICAL_ROOMS };
