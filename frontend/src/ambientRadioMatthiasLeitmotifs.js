// Radio Matthias · leitmotivs de identidad.
//
// La forma larga ya diferencia la dramaturgia de cada pista. Esta capa añade una
// firma diminuta y escasa a los 13 temas modernos que todavía no tenían
// `signature`: 3-4 notas, sólo en escenas concretas y no en todos los ciclos.
// No hay timers ni síntesis nuevos; únicamente datos para el motor structured.

function motif(entries) {
  return Object.freeze(Object.fromEntries(entries));
}

function signature({ instrumentRole = 'lead', sections, everyCycles = 2, durationSteps = 3.6, volume = 0.2, notes }) {
  return Object.freeze({
    instrumentRole,
    sections: Object.freeze([...sections]),
    everyCycles,
    durationSteps,
    volume,
    motif: motif(notes),
  });
}

export const RADIO_MATTHIAS_LEITMOTIFS = Object.freeze({
  zenCourtyard0408: signature({
    instrumentRole: 'lead', sections: [1, 3], everyCycles: 3, durationSteps: 5.2, volume: 0.16,
    notes: [[6, 69], [20, 72], [34, 67]],
  }),
  velvetKnight0237: signature({
    instrumentRole: 'counter', sections: [1, 4], everyCycles: 2, durationSteps: 3.8, volume: 0.18,
    notes: [[6, 76], [20, 79], [38, 83], [54, 77]],
  }),
  bishopSunset: signature({
    instrumentRole: 'lead', sections: [0, 3], everyCycles: 2, durationSteps: 3.2, volume: 0.2,
    notes: [[4, 67], [18, 74], [36, 71], [54, 76]],
  }),
  checkEngine: signature({
    instrumentRole: 'lead', sections: [0, 3], everyCycles: 2, durationSteps: 2.8, volume: 0.17,
    notes: [[3, 64], [17, 71], [35, 67], [51, 76]],
  }),
  rookAfterHours: signature({
    instrumentRole: 'lead', sections: [0, 3], everyCycles: 2, durationSteps: 4.4, volume: 0.22,
    notes: [[5, 64], [21, 69], [37, 72], [57, 67]],
  }),
  queenChamberPrelude: signature({
    instrumentRole: 'lead', sections: [0, 3], everyCycles: 3, durationSteps: 2.4, volume: 0.17,
    notes: [[4, 76], [16, 79], [36, 74], [52, 83]],
  }),
  lofiPawnNotebook: signature({
    instrumentRole: 'lead', sections: [0, 3], everyCycles: 2, durationSteps: 4.2, volume: 0.17,
    notes: [[6, 64], [22, 62], [38, 67], [56, 59]],
  }),
  wetCastleTape: signature({
    instrumentRole: 'counter', sections: [0, 3], everyCycles: 2, durationSteps: 5, volume: 0.2,
    notes: [[8, 45], [24, 52], [40, 48], [56, 43]],
  }),
  rookVeranda: signature({
    instrumentRole: 'lead', sections: [0, 3], everyCycles: 2, durationSteps: 3.8, volume: 0.19,
    notes: [[4, 64], [18, 69], [34, 67], [50, 72]],
  }),
  sixtyFourKeys: signature({
    instrumentRole: 'counter', sections: [0, 3], everyCycles: 3, durationSteps: 4.8, volume: 0.16,
    notes: [[6, 48], [18, 55], [30, 52], [42, 59]],
  }),
  sevilleLastLamp0248: signature({
    instrumentRole: 'counter', sections: [0, 2, 4], everyCycles: 3, durationSteps: 4.4, volume: 0.2,
    notes: [[6, 67], [22, 65], [38, 72], [54, 69]],
  }),
  bishopCircuit: signature({
    instrumentRole: 'lead', sections: [0, 4], everyCycles: 2, durationSteps: 2.6, volume: 0.15,
    notes: [[2, 64], [18, 65], [34, 72], [50, 66]],
  }),
  winterBoard: signature({
    instrumentRole: 'lead', sections: [0, 3], everyCycles: 3, durationSteps: 5.4, volume: 0.16,
    notes: [[4, 67], [16, 74], [28, 69], [42, 64]],
  }),
});

function resolveInstrument(theme, instrumentRole) {
  if (instrumentRole === 'counter') return theme?.counterInstrument || theme?.leadInstrument || null;
  if (instrumentRole === 'chord') return theme?.chordInstrument || theme?.leadInstrument || null;
  return theme?.leadInstrument || theme?.counterInstrument || null;
}

export function withRadioMatthiasLeitmotif(theme, feel) {
  const spec = RADIO_MATTHIAS_LEITMOTIFS[theme?.id];
  if (!spec || !feel) return feel;

  const instrument = resolveInstrument(theme, spec.instrumentRole);
  if (!instrument) return feel;

  return Object.freeze({
    ...feel,
    layers: Object.freeze({ ...feel.layers, signature: true }),
    signature: Object.freeze({
      instrument,
      sections: spec.sections,
      everyCycles: spec.everyCycles,
      repeatPeriod: Math.max(1, theme?.stepsPerSection || 32),
      durationSteps: spec.durationSteps,
      volume: spec.volume,
      motif: spec.motif,
    }),
  });
}
