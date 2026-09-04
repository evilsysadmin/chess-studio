// Perfiles de mezcla/arreglo para la expansión de Radio Matthias.
// Tener perfil explícito evita que una pista nueva herede humanización genérica
// y, más importante, hace que cada género cambie de banda además de partitura.

function rhythmicProfile({
  family,
  kit = 'legacy',
  period = 16,
  punch = 1,
  swing = 0.04,
  warmth = 0.86,
  space = 0.08,
  pattern = { 0:'K', 8:'S' },
  harmonyPath = [0, 0, -2, 5, 0, 3, 0],
}) {
  return Object.freeze({
    family,
    preserveSectionOrder: true,
    harmonyPath: Object.freeze(harmonyPath),
    swing,
    warmth,
    releaseScale: 1.04,
    space,
    delayMs: 110,
    chordHoldSteps: 12,
    bassHoldSteps: 3.4,
    layers: Object.freeze({ lead: true, counter: true, chords: true, bass: true, drums: true, signature: false }),
    mix: Object.freeze({ lead: 0.68, counter: 0.42, bass: 0.9, chord: 0.44 }),
    percussion: Object.freeze({ period, kit, punch, pattern: Object.freeze(pattern) }),
  });
}

function quietProfile({ family, warmth = 1, space = 0.24, harmonyPath = [0, 0, 5, 0, -2, 0] }) {
  return Object.freeze({
    family,
    preserveSectionOrder: true,
    harmonyPath: Object.freeze(harmonyPath),
    swing: 0,
    warmth,
    releaseScale: 1.42,
    space,
    delayMs: 260,
    chordHoldSteps: 22,
    bassHoldSteps: 10,
    drumMode: 'none',
    layers: Object.freeze({ lead: true, counter: true, chords: true, bass: true, drums: false, signature: false }),
    mix: Object.freeze({ lead: 0.56, counter: 0.34, bass: 0.46, chord: 0.4 }),
    percussion: Object.freeze({ period: 32, kit: 'none', punch: 0, pattern: Object.freeze({}) }),
  });
}

const RADIO_MATTHIAS_PROFILES = Object.freeze({
  zenCourtyard0408: quietProfile({
    family:'matthias-zen-courtyard-air', warmth:1.08, space:0.38,
  }),
  velvetKnight0237: rhythmicProfile({
    family:'matthias-smooth-velvet-club', kit:'brush-jazz', punch:0.76, swing:0.14, warmth:1.02, space:0.14,
    pattern:{0:'B',8:'H',16:'S',24:'H'}, period:32,
    harmonyPath:[0,3,-2,5,1,-4,0],
  }),
  bishopSunset: rhythmicProfile({
    family:'matthias-tropical-bishop-sunset', kit:'legacy', punch:0.86, swing:0.03, warmth:1.04, space:0.07,
    pattern:{0:'K',4:'H',8:'K',12:'H'},
    harmonyPath:[0,5,3,-2,0,7,5,0],
  }),
  checkEngine: rhythmicProfile({
    family:'matthias-energy-check-engine', kit:'legacy', punch:1.22, swing:0.01, warmth:0.58, space:0.05,
    pattern:{0:'K',4:'H',8:'S',12:'K',14:'H'},
    harmonyPath:[0,7,5,0,3,-2,0],
  }),
  rookAfterHours: rhythmicProfile({
    family:'matthias-postrock-rook-afterhours', kit:'legacy', punch:1.02, swing:0.015, warmth:0.78, space:0.16,
    pattern:{0:'K',8:'S',16:'K',24:'S'}, period:32,
    harmonyPath:[0,5,0,-3,7,5,0],
  }),
  queenChamberPrelude: quietProfile({
    family:'matthias-classical-queen-prelude', warmth:0.98, space:0.16,
    harmonyPath:[0, 5, 0, -2, 0, 3, 0],
  }),
  lofiPawnNotebook: rhythmicProfile({
    family:'matthias-lofi-pawn-notebook', kit:'brush-jazz', punch:0.62, swing:0.12, warmth:1.1, space:0.11,
    pattern:{0:'B',12:'H',16:'B',28:'H'}, period:32,
    harmonyPath:[0,-2,-5,0,3,-2,0],
  }),
  wetCastleTape: rhythmicProfile({
    family:'matthias-trip-hop-wet-castle', kit:'legacy', punch:0.88, swing:0.08, warmth:0.68, space:0.18,
    pattern:{0:'K',10:'B',16:'S',30:'B'}, period:32,
    harmonyPath:[0,-5,-2,0,1,-4,0],
  }),
  rookVeranda: rhythmicProfile({
    family:'matthias-bossa-rook-veranda', kit:'brush-jazz', punch:0.72, swing:0.09, warmth:1.08, space:0.09,
    pattern:{0:'B',6:'H',12:'B',18:'H',24:'B',30:'H'}, period:32,
    harmonyPath:[0,2,5,-2,3,0,-5,0],
  }),
  sixtyFourKeys: quietProfile({
    family:'matthias-minimal-sixty-four-keys', warmth:1.02, space:0.22,
    harmonyPath:[0, 0, 3, 0, -2, 0],
  }),
  sevilleLastLamp0248: rhythmicProfile({
    family:'matthias-mediterranean-seville-last-lamp', kit:'andalus-hand', punch:0.94, swing:0.08, warmth:0.98, space:0.1,
    pattern:{0:'K',8:'B',16:'S',24:'H'}, period:32,
    harmonyPath:[0,3,5,0,-2,1,-5,0],
  }),
  bishopCircuit: rhythmicProfile({
    family:'matthias-electronic-bishop-circuit', kit:'legacy', punch:1.04, swing:0, warmth:0.54, space:0.13,
    pattern:{0:'K',6:'H',16:'S',22:'H'}, period:32,
    harmonyPath:[0,1,-5,6,-2,3,0],
  }),
  winterBoard: quietProfile({
    family:'matthias-ambient-winter-board', warmth:0.94, space:0.34,
    harmonyPath:[0, 0, 5, 0, 3, 0, -2, 0],
  }),
});

export function radioMatthiasStructuredFeel(theme) {
  return RADIO_MATTHIAS_PROFILES[theme?.id] || null;
}

export { RADIO_MATTHIAS_PROFILES };