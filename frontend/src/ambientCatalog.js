// ambientCatalog.js — catálogo y constantes puras de la radio ambiental.
// Separado del motor WebAudio para que editar pistas no implique tocar transporte/síntesis.

export const KEY_CENTERS_SEMITONES = [0, 5, 1, 7]; // Do / Fa / Reb / Sol

export const OUD_SCALE = [130.81, 138.59, 164.81, 174.61, 195.99, 207.65, 233.08]; // C3 Db3 E3 F3 G3 Ab3 Bb3

// Contrabajo: una octava por debajo de OUD_SCALE, walking bass simple —
// nueva capa, para sumar color y un ancla armónica grave que hasta acá no
// existía (el pad sostiene acordes, esto camina por debajo marcando el
// pulso, más "jazz" que "drone").
const BASS_PATTERN = [0, 4, 0, 6]; // tónica, quinta, tónica, séptima bemol — un compás completo (4 pasos de negra)
export const BASS_STEP_GAP = 4; // una nota cada 4 dieciseisavos = pulso de negra
export const BASS_DURATION_S = 0.9;

// Índices dentro de OUD_SCALE, no frecuencias directas — cada frase es una
// forma melódica real, no una selección al azar.
const PHRASES = [
  [4, 3, 2, 0], // G F E C — carrerita descendente al reposo
  [0, 2, 4, 3], // C E G F — ascendente, cálida
  [0, 2, 4], // C E G — tríada mayor ascendente, cálida — nueva, para bajarle el filo a la escala
  [4, 2, 0], // G E C — misma tríada, descendente y directa — nueva
  [4, 5, 4], // G Ab G — el único giro que enfatiza la tensión de la 2a aumentada (antes había dos)
  [6, 4, 3, 2, 0], // Bb G F E C — carrerita descendente más larga
  [0, 3, 4], // C F G — subdominante a dominante, cálida
  [2, 4, 6, 4, 2], // E G Bb G E — arco simétrico, sube y baja, más variedad de contorno
  [3, 4, 6, 4], // F G Bb G — arco corto con el color de la séptima
];

// ---------- Pulso base compartido ----------
//
// Iteración 6: hasta acá cada capa tenía su propio intervalo suelto (pad
// cada 2100ms, punteo cada 1300ms, saxo cada 2800ms, percusión cada
// 650ms) — ninguno múltiplo limpio del otro, así que nada estaba
// realmente sincronizado a una grilla común. Eso era la causa real de
// que sonara "deslabazado": no importa cuán buena sea cada frase
// individual, si no comparten pulso, flotan unas contra otras en vez de
// sentirse como una sola banda tocando junta.
//
// Ahora todo deriva de un único STEP_MS (un dieciseisavo a ~107 BPM). La
// percusión pasa a patrones de 16 pasos estilo breakbeat (la base rítmica
// de un drum & bass, aunque a tempo bien más relajado — esto es fondo de
// menú, no una pista de baile) con bombo y caja en posiciones
// sincopadas, no solo "fuerte-silencio-suave-silencio". El punteo, el
// saxo y el pad ahora arrancan siempre en un límite de compás exacto.
const STEP_MS = 130; // grilla de dieciseisavos, ~115 BPM — antes 140ms/~107 BPM.
// Ajustado tras analizar con librosa (tempo, no melodía) una referencia de jazz árabe que
// compartió el usuario: tempo mediano ~129 BPM en los segmentos muestreados. No se llega
// hasta ahí (demasiado vivo para fondo de menú), pero se acerca un poco desde los 107 BPM.
export const STEPS_PER_BAR = 16;
const BAR_MS = STEP_MS * STEPS_PER_BAR; // 2240ms, un compás completo

export const PHRASE_NOTE_GAP_MS = STEP_MS * 2; // corcheas exactas: melodía y percusión comparten rejilla
const PLUCK_GAP_STEPS = 8; // cada medio compás intenta una frase
export const PLUCK_DURATION_S = 1.4;
const PLUCK_CHANCE = 0.7;

// El saxo toca licks más cortos y espaciados (legato, no punteado) — menos
// seguido que las cuerdas, para que se sienta como una voz solista que
// aparece de vez en cuando, no una tercera capa constante compitiendo.
const SAX_PHRASES = [
  [4], // una sola nota sostenida
  [0, 4], // tónica a quinta — cálida
  [6, 4], // séptima bemol bajando a la quinta
  [2, 0], // tercera mayor bajando a la tónica — cálida
  [3, 0], // subdominante bajando a la tónica — cálida, nueva
  [4, 6, 4], // giro corto legato alrededor de la quinta y la séptima — nueva
];
export const SAX_NOTE_GAP_MS = STEP_MS * 5; // fraseo amplio, cuantizado al mismo pulso
const SAX_GAP_STEPS = 32; // 2 compases exactos — antes eran 20, que NO es múltiplo de 16 (el compás):
// tardaba 4 compases en volver a alinearse con el patrón de percusión, entrando en un punto
// distinto cada vez — eso sonaba a "cada voz por su lado" aunque compartieran el mismo reloj.
export const SAX_DURATION_S = 2.3;
const SAX_CHANCE = 0.4;

// Subido una octava (antes C3/G3/Bb3, sonaba a "drone de sótano") — más
// arriba se siente cálido y presente, menos "algo acecha en la oscuridad".
// Ataque más corto también (antes 0.9s), para que no se sienta como algo
// apareciendo de la nada.
const PAD_NOTES = [261.63, 392.0, 466.16, 392.0]; // C4 G4 Bb4 G4 — tónica/quinta/séptima, una octava más arriba
export const PAD_GAP_STEPS = 16; // un compás completo por nota del pad
export const PAD_DURATION_S = 3.5; // bajado de 4.5 — menos sostenido/fantasmal
export const PAD_ATTACK_S = 0.5; // bajado de 0.9

// Patrones de batería de 16 pasos, estilo breakbeat (bombo/caja en
// posiciones sincopadas, no solo en los tiempos fuertes) — la base
// rítmica de un drum & bass, aunque a un tempo bien más relajado. 'D' es
// el "dum" grave (bombo), 'T' el "tak" agudo (caja/borde), '.' silencio.
// Cada patrón dura un compás completo (16 pasos = BAR_MS).
function parsePattern(str, dumVol, takVol) {
  return str.split('').map((c) => {
    if (c === 'D') return ['dum', dumVol];
    if (c === 't') return ['tak', takVol * 0.6]; // tak flojo, de relleno
    if (c === 'T') return ['tak', takVol];
    return null;
  });
}

const PERCUSSION_PATTERNS = [
  // Breakbeat clásico: bombo en 1 y en la sincopa antes del 3, caja en el
  // "and" del 2 y en el 4 -- el patrón base de un break tipo Amen simplificado.
  parsePattern('D..t..T.D...T.t.', 0.15, 0.11),
  // Variante con mas movimiento, bombo doble al final del compás
  parsePattern('D..T..t.D.D...T.', 0.15, 0.11),
  // Mas espaciado, caja de relleno entre los golpes fuertes
  parsePattern('D......T..t...T.', 0.16, 0.1),
  // Con adorno de entrada (dos taks pegados al arranque)
  parsePattern('DT..T...D...t.T.', 0.15, 0.09),
  // silencio -- un compás entero de respiro real, no todo constante
  parsePattern('................', 0, 0),
];


// Temas ambientales originales. Comparten el mismo motor de síntesis, pero
// cambian escala, tempo, fraseo, bajo, percusión y densidad de solista. Así el
// usuario puede elegir una melodía/ambiente sin depender de MP3 externos ni
// sumar peso al frontend.
export const AMBIENT_THEMES = {
  andalus: {
    id: 'andalus',
    label: 'Al-Ándalus',
    description: 'Oud, guitarra y saxo con color frigio.',
    scale: OUD_SCALE,
    keyCenters: KEY_CENTERS_SEMITONES,
    phrases: PHRASES,
    saxPhrases: SAX_PHRASES,
    padNotes: PAD_NOTES,
    bassPattern: BASS_PATTERN,
    percussionPatterns: PERCUSSION_PATTERNS,
    stepMs: STEP_MS,
    phraseNoteGapMs: PHRASE_NOTE_GAP_MS,
    pluckGapSteps: PLUCK_GAP_STEPS,
    pluckChance: PLUCK_CHANCE,
    saxNoteGapMs: SAX_NOTE_GAP_MS,
    saxGapSteps: SAX_GAP_STEPS,
    saxChance: SAX_CHANCE,
    instruments: ['oud', 'guitar'],
    keyChangeBars: 6,
  },
  nocturne: {
    id: 'nocturne',
    label: 'Nocturno',
    description: 'Más lento, menor y espacioso.',
    scale: [130.81, 146.83, 155.56, 174.61, 196.0, 207.65, 233.08], // C natural minor
    keyCenters: [0, 3, 5, -2],
    phrases: [
      [4, 3, 2, 0], [6, 5, 3, 2], [0, 2, 3], [5, 4, 2, 0], [2, 3, 5, 3], [6, 4, 3, 0],
    ],
    saxPhrases: [[2], [4], [6, 4], [3, 2, 0], [5, 3]],
    padNotes: [261.63, 311.13, 392.0, 349.23],
    bassPattern: [0, 4, 5, 4],
    percussionPatterns: [
      parsePattern('D.......T.......', 0.11, 0.07),
      parsePattern('D.........t...T.', 0.1, 0.065),
      parsePattern('................', 0, 0),
      parsePattern('................', 0, 0),
    ],
    stepMs: 165,
    phraseNoteGapMs: 260,
    pluckGapSteps: 16,
    pluckChance: 0.58,
    saxNoteGapMs: 760,
    saxGapSteps: 48,
    saxChance: 0.25,
    instruments: ['guitar', 'oud'],
    keyChangeBars: 8,
  },
  gambit: {
    id: 'gambit',
    label: 'Gambito barroco',
    description: 'Arpegios rápidos y tensión de menor armónica.',
    scale: [110.0, 123.47, 130.81, 146.83, 164.81, 174.61, 207.65], // A harmonic minor
    keyCenters: [0, 5, 7, 2],
    phrases: [
      [0, 2, 4, 6], [6, 4, 2, 0], [0, 4, 2, 6], [4, 3, 2, 1, 0],
      [0, 2, 3, 4], [5, 4, 2, 0], [2, 4, 6, 5, 4],
    ],
    saxPhrases: [[4, 6], [6, 5, 4], [2, 0]],
    padNotes: [220.0, 329.63, 261.63, 329.63],
    bassPattern: [0, 4, 2, 6],
    percussionPatterns: [
      parsePattern('D...T...D...T...', 0.14, 0.09),
      parsePattern('D..tT...D.t.T...', 0.14, 0.085),
      parsePattern('D...T.D.....T...', 0.14, 0.09),
      parsePattern('................', 0, 0),
    ],
    stepMs: 112,
    phraseNoteGapMs: 145,
    pluckGapSteps: 8,
    pluckChance: 0.84,
    saxNoteGapMs: 520,
    saxGapSteps: 48,
    saxChance: 0.16,
    instruments: ['guitar', 'guitar', 'oud'],
    keyChangeBars: 6,
  },
  casablanca: {
    id: 'casablanca',
    label: 'Café de Casablanca',
    description: 'Jazz cálido, bajo caminante y más saxo.',
    scale: [130.81, 146.83, 155.56, 174.61, 196.0, 220.0, 233.08], // C dorian
    keyCenters: [0, 5, 7, -2],
    phrases: [
      [0, 2, 4, 5], [6, 4, 2, 0], [2, 4, 6, 5], [0, 3, 5, 4],
      [4, 5, 6, 4], [3, 2, 0], [5, 3, 2, 4],
    ],
    saxPhrases: [[2, 4], [5, 4, 2], [6, 5, 4], [3, 5, 4], [4, 6, 5, 2]],
    padNotes: [261.63, 311.13, 392.0, 466.16],
    bassPattern: [0, 4, 5, 6],
    percussionPatterns: [
      parsePattern('D..t..T...D.T...', 0.12, 0.085),
      parsePattern('D.....T.D...t.T.', 0.12, 0.085),
      parsePattern('D...t.T.....T...', 0.115, 0.08),
      parsePattern('................', 0, 0),
    ],
    stepMs: 142,
    phraseNoteGapMs: 215,
    pluckGapSteps: 8,
    pluckChance: 0.62,
    saxNoteGapMs: 560,
    saxGapSteps: 24,
    saxChance: 0.66,
    instruments: ['oud', 'guitar'],
    keyChangeBars: 8,
  },
  march: {
    id: 'march',
    label: 'Marcha del rey',
    description: 'Percusiva, seca y con aire de asedio.',
    scale: [130.81, 138.59, 155.56, 174.61, 196.0, 207.65, 233.08], // C phrygian
    keyCenters: [0, 1, -1, 5],
    phrases: [[0, 1, 0], [0, 4, 3, 0], [4, 3, 1, 0], [0, 3, 4], [6, 4, 3, 1, 0]],
    saxPhrases: [[0], [4], [3, 1, 0]],
    padNotes: [261.63, 277.18, 392.0, 349.23],
    bassPattern: [0, 0, 4, 3],
    percussionPatterns: [
      parsePattern('D...T...D...T...', 0.18, 0.12),
      parsePattern('D.D.T...D...T...', 0.17, 0.11),
      parsePattern('D...T.D.D...T...', 0.18, 0.11),
      parsePattern('D.......D...T...', 0.16, 0.1),
    ],
    stepMs: 120,
    phraseNoteGapMs: 175,
    pluckGapSteps: 12,
    pluckChance: 0.68,
    saxNoteGapMs: 580,
    saxGapSteps: 64,
    saxChance: 0.12,
    instruments: ['oud', 'guitar'],
    keyChangeBars: 4,
  },
  clockwork: {
    id: 'clockwork',
    sequenceMode: 'cycle',
    label: 'Relojería',
    description: 'Pulso preciso, arpegios secos y sensación de reloj de torneo.',
    scale: [130.81, 146.83, 164.81, 174.61, 196.0, 220.0, 246.94], // C major
    keyCenters: [0, 7, 5, 2],
    phrases: [[0, 2, 4, 2], [1, 3, 5, 3], [4, 2, 1, 0], [0, 4, 6, 4], [2, 5, 4, 2]],
    saxPhrases: [[4], [2, 4], [6, 4, 2]],
    padNotes: [261.63, 329.63, 392.0, 493.88],
    bassPattern: [0, 4, 2, 4],
    percussionPatterns: [
      parsePattern('D.t.T.t.D.t.T.t.', 0.105, 0.075),
      parsePattern('D...T.t.D...T.t.', 0.11, 0.08),
      parsePattern('D.t.T...D.t.T...', 0.105, 0.075),
      parsePattern('................', 0, 0),
    ],
    stepMs: 104,
    phraseNoteGapMs: 132,
    pluckGapSteps: 8,
    pluckChance: 0.88,
    saxNoteGapMs: 470,
    saxGapSteps: 64,
    saxChance: 0.08,
    instruments: ['guitar', 'guitar', 'oud'],
    keyChangeBars: 4,
  },
  velvet: {
    id: 'velvet',
    label: 'Acero y terciopelo',
    description: 'Jazz oscuro, suave por fuera y con dientes por dentro.',
    scale: [130.81, 146.83, 155.56, 174.61, 196.0, 220.0, 246.94], // C dorian / major 7 color
    keyCenters: [0, -2, 5, 7],
    phrases: [[0, 2, 4, 6], [6, 5, 4, 2], [2, 3, 5, 4], [0, 3, 4, 2], [5, 4, 2, 1]],
    saxPhrases: [[2, 4, 6], [5, 4, 2], [6, 4], [3, 5, 4, 2]],
    padNotes: [261.63, 311.13, 392.0, 493.88],
    bassPattern: [0, 4, 5, 2],
    percussionPatterns: [
      parsePattern('D.....t.T...t...', 0.09, 0.065),
      parsePattern('D...t...D.....T.', 0.095, 0.07),
      parsePattern('................', 0, 0),
      parsePattern('................', 0, 0),
    ],
    stepMs: 150,
    phraseNoteGapMs: 245,
    pluckGapSteps: 12,
    pluckChance: 0.56,
    saxNoteGapMs: 610,
    saxGapSteps: 24,
    saxChance: 0.72,
    instruments: ['guitar', 'oud'],
    keyChangeBars: 8,
  },
  electricDesert: {
    id: 'electricDesert',
    label: 'Desierto eléctrico',
    description: 'Frigio nervioso, bajo insistente y ataques cortos.',
    scale: [123.47, 130.81, 155.56, 164.81, 185.0, 196.0, 220.0], // B phrygian-ish
    keyCenters: [0, 1, 6, 5],
    phrases: [[0, 1, 3, 2, 0], [4, 3, 1, 0], [0, 3, 5, 3], [6, 5, 3, 1], [1, 4, 3, 0]],
    saxPhrases: [[3], [5, 3], [6, 4, 3]],
    padNotes: [246.94, 261.63, 369.99, 329.63],
    bassPattern: [0, 3, 0, 5],
    percussionPatterns: [
      parsePattern('D..tT.D...t.T...', 0.15, 0.1),
      parsePattern('D.t...T.D.t.T...', 0.15, 0.095),
      parsePattern('D...T...D.t.T.t.', 0.145, 0.095),
      parsePattern('................', 0, 0),
    ],
    stepMs: 116,
    phraseNoteGapMs: 158,
    pluckGapSteps: 8,
    pluckChance: 0.8,
    saxNoteGapMs: 520,
    saxGapSteps: 48,
    saxChance: 0.2,
    instruments: ['oud', 'oud', 'guitar'],
    keyChangeBars: 5,
  },
  cathedral: {
    id: 'cathedral',
    sequenceMode: 'cycle',
    label: 'Catedral de humo',
    description: 'Muy lenta, grave y espaciosa; casi sin percusión.',
    scale: [110.0, 123.47, 130.81, 146.83, 164.81, 174.61, 207.65], // A harmonic minor
    keyCenters: [0, 5, -2, 3],
    phrases: [[0, 4, 6], [6, 4, 2, 0], [0, 3, 5], [5, 3, 2], [4, 2, 0]],
    saxPhrases: [[0], [4], [6, 4]],
    padNotes: [220.0, 261.63, 329.63, 349.23],
    bassPattern: [0, 0, 4, 0],
    percussionPatterns: [
      parsePattern('D...............', 0.07, 0),
      parsePattern('........T.......', 0, 0.045),
      parsePattern('................', 0, 0),
      parsePattern('................', 0, 0),
    ],
    stepMs: 192,
    phraseNoteGapMs: 330,
    pluckGapSteps: 24,
    pluckChance: 0.42,
    saxNoteGapMs: 850,
    saxGapSteps: 64,
    saxChance: 0.28,
    instruments: ['oud', 'guitar'],
    keyChangeBars: 10,
  },
  duel: {
    id: 'duel',
    sequenceMode: 'cycle',
    label: 'Duelo al amanecer',
    description: 'Tenso, seco y con silencios largos antes del golpe.',
    scale: [110.0, 123.47, 130.81, 146.83, 164.81, 185.0, 196.0], // A minor color
    keyCenters: [0, 7, 3, 5],
    phrases: [[0, 4], [4, 2, 0], [0, 3, 6], [6, 3, 1, 0], [2, 4, 3]],
    saxPhrases: [[4], [6], [4, 2]],
    padNotes: [220.0, 261.63, 329.63, 392.0],
    bassPattern: [0, 0, 4, 6],
    percussionPatterns: [
      parsePattern('D.......T.......', 0.14, 0.08),
      parsePattern('D...........T...', 0.14, 0.08),
      parsePattern('................', 0, 0),
      parsePattern('D.......D.......', 0.12, 0),
    ],
    stepMs: 138,
    phraseNoteGapMs: 205,
    pluckGapSteps: 16,
    pluckChance: 0.61,
    saxNoteGapMs: 700,
    saxGapSteps: 64,
    saxChance: 0.1,
    instruments: ['guitar', 'oud'],
    keyChangeBars: 6,
  },
  storm: {
    id: 'storm',
    label: 'Tormenta táctica',
    description: 'La opción rápida: percusión activa y frases cortantes.',
    scale: [146.83, 155.56, 174.61, 196.0, 207.65, 233.08, 261.63], // D phrygian
    keyCenters: [0, 5, 7, 1],
    phrases: [[0, 2, 4, 6], [6, 5, 3, 1], [0, 3, 2, 5], [4, 2, 0, 1], [2, 5, 6, 4]],
    saxPhrases: [[4, 6], [6, 4], [3, 5, 4]],
    padNotes: [293.66, 349.23, 440.0, 523.25],
    bassPattern: [0, 4, 0, 6],
    percussionPatterns: [
      parsePattern('D.t.T.D.t...T.t.', 0.17, 0.11),
      parsePattern('D..Tt.D.D.t.T...', 0.17, 0.105),
      parsePattern('D.t.T...D.t.T.D.', 0.165, 0.105),
      parsePattern('D...T...D...T...', 0.16, 0.1),
    ],
    stepMs: 92,
    phraseNoteGapMs: 118,
    pluckGapSteps: 6,
    pluckChance: 0.9,
    saxNoteGapMs: 430,
    saxGapSteps: 32,
    saxChance: 0.22,
    instruments: ['guitar', 'oud', 'guitar'],
    keyChangeBars: 4,
  },
  lateEndgame: {
    id: 'lateEndgame',
    sequenceMode: 'cycle',
    label: 'Final de madrugada',
    description: 'Minimalista, casi sin batería, para pensar sin que te empuje.',
    scale: [130.81, 146.83, 164.81, 196.0, 220.0, 261.63, 293.66], // pentatonic-ish expanded
    keyCenters: [0, 5, -2, 7],
    phrases: [[0, 2, 4], [4, 2, 0], [1, 3, 5], [5, 3, 1], [0, 4, 3]],
    saxPhrases: [[2], [4], [5, 3]],
    padNotes: [261.63, 329.63, 440.0, 392.0],
    bassPattern: [0, 4, 0, 3],
    percussionPatterns: [
      parsePattern('................', 0, 0),
      parsePattern('D...............', 0.055, 0),
      parsePattern('................', 0, 0),
      parsePattern('...............t', 0, 0.035),
    ],
    stepMs: 176,
    phraseNoteGapMs: 300,
    pluckGapSteps: 24,
    pluckChance: 0.46,
    saxNoteGapMs: 820,
    saxGapSteps: 80,
    saxChance: 0.12,
    instruments: ['guitar', 'oud'],
    keyChangeBars: 10,
  },
 };

// V11: Al-Ándalus conserva deliberadamente el motor original de arriba.
// El resto deja de ser una variación del mismo generador oud/guitarra/saxo:
// cada tema usa un secuenciador estructurado y una familia tímbrica propia.
// Son composiciones originales y deterministas por secciones; no MP3s, no
// samples externos y, sobre todo, no once clones con bigote postizo.
Object.assign(AMBIENT_THEMES, {
  nocturne: {
    id: 'nocturne', engine: 'structured', label: 'Nocturno de piezas blancas',
    description: 'Piano amortiguado y bajo de arco; lento, íntimo y sin batería.',
    stepMs: 230, stepsPerSection: 32, leadInstrument: 'felt', chordInstrument: 'felt', bassInstrument: 'cello',
    sections: [
      {
        lead: { 0: 69, 4: 72, 8: 76, 12: 74, 16: 72, 20: 69, 24: 67, 28: 64 },
        chords: { 0: [57, 60, 64], 16: [53, 57, 60] },
        bass: { 0: 45, 8: 40, 16: 41, 24: 40 },
      },
      {
        lead: { 0: 64, 4: 67, 8: 69, 12: 72, 16: 71, 20: 67, 24: 64, 28: 62 },
        chords: { 0: [52, 55, 59], 16: [50, 53, 57] },
        bass: { 0: 40, 8: 43, 16: 38, 24: 45 },
      },
    ],
  },
  gambit: {
    id: 'gambit', engine: 'structured', label: 'Gambito del rey',
    description: 'Clave seco y contrapunto rápido: barroco sin peluca prestada.',
    stepMs: 105, stepsPerSection: 32, leadInstrument: 'harpsichord', chordInstrument: 'harpsichord', bassInstrument: 'pizz',
    sections: [
      {
        lead: { 0: 69, 2: 72, 4: 76, 6: 81, 8: 80, 10: 76, 12: 72, 14: 69, 16: 71, 18: 74, 20: 77, 22: 83, 24: 81, 26: 77, 28: 74, 30: 71 },
        chords: { 0: [57, 60, 64], 8: [52, 57, 60], 16: [55, 59, 62], 24: [52, 56, 59] },
        bass: { 0: 45, 4: 52, 8: 48, 12: 52, 16: 43, 20: 50, 24: 40, 28: 47 },
        drums: { 0: 'W', 8: 'W', 16: 'W', 24: 'W' },
      },
    ],
  },
  casablanca: {
    id: 'casablanca', engine: 'structured', label: 'Club de medianoche',
    description: 'Piano eléctrico, vibráfono, walking bass y escobillas de club vacío.',
    stepMs: 145, stepsPerSection: 32, leadInstrument: 'vibes', chordInstrument: 'epiano', bassInstrument: 'bass',
    sections: [
      {
        lead: { 2: 67, 6: 70, 10: 72, 14: 74, 18: 72, 22: 69, 26: 67, 30: 65 },
        chords: { 0: [48, 55, 58, 64], 8: [53, 57, 60, 64], 16: [50, 57, 60, 65], 24: [55, 59, 62, 65] },
        bass: { 0: 36, 4: 43, 8: 41, 12: 45, 16: 38, 20: 45, 24: 43, 28: 47 },
        drums: { 0: 'B', 4: 'B', 8: 'B', 12: 'B', 16: 'B', 20: 'B', 24: 'B', 28: 'B', 7: 'H', 15: 'H', 23: 'H', 31: 'H' },
      },
    ],
  },
  march: {
    id: 'march', engine: 'structured', label: 'Asedio',
    description: 'Metales sintéticos, tambor seco y una marcha que no pide permiso.',
    stepMs: 125, stepsPerSection: 32, leadInstrument: 'brass', chordInstrument: 'brass', bassInstrument: 'bass',
    sections: [
      {
        lead: { 0: 55, 4: 55, 8: 58, 12: 57, 16: 55, 20: 62, 24: 60, 28: 58 },
        chords: { 0: [43, 50, 55], 16: [41, 48, 53] },
        bass: { 0: 31, 8: 31, 16: 29, 24: 26 },
        drums: { 0: 'K', 4: 'S', 8: 'K', 12: 'S', 16: 'K', 20: 'S', 24: 'K', 28: 'S', 30: 'K' },
      },
    ],
  },
  clockwork: {
    id: 'clockwork', engine: 'structured', label: 'Relojería',
    description: 'Clave seco, fieltro y clicks mecánicos: un reloj de torneo con engranajes, sin campanitas ni pájaros electrónicos.',
    stepMs: 112, stepsPerSection: 32, leadInstrument: 'harpsichord', chordInstrument: 'felt', bassInstrument: 'pizz',
    sections: [
      {
        lead: { 0: 72, 2: 79, 4: 76, 6: 79, 8: 74, 10: 81, 12: 77, 14: 81, 16: 71, 18: 77, 20: 74, 22: 77, 24: 69, 26: 76, 28: 72, 30: 76 },
        chords: { 0: [60, 64, 67], 8: [62, 65, 69], 16: [59, 62, 65], 24: [57, 60, 64] },
        bass: { 0: 48, 8: 50, 16: 47, 24: 45 },
        drums: { 0: 'W', 4: 'W', 8: 'W', 12: 'W', 16: 'W', 20: 'W', 24: 'W', 28: 'W' },
      },
    ],
  },
  velvet: {
    id: 'velvet', engine: 'structured', label: 'Acero y terciopelo',
    description: 'Vibráfono amplio, acordes eléctricos y silencio entre frases.',
    stepMs: 170, stepsPerSection: 32, leadInstrument: 'vibes', chordInstrument: 'epiano', bassInstrument: 'cello',
    sections: [
      {
        lead: { 0: 72, 6: 75, 10: 79, 16: 77, 22: 74, 28: 70 },
        chords: { 0: [48, 55, 59, 63], 16: [46, 53, 57, 62] },
        bass: { 0: 36, 8: 43, 16: 34, 24: 41 },
        drums: { 6: 'B', 14: 'B', 22: 'B', 30: 'B' },
      },
    ],
  },
  electricDesert: {
    id: 'electricDesert', engine: 'structured', label: 'Neón sobre el tablero',
    description: 'Bajo pulsante, lead analógico y batería electrónica contenida.',
    stepMs: 108, stepsPerSection: 32, leadInstrument: 'synth', chordInstrument: 'pad', bassInstrument: 'synthbass',
    sections: [
      {
        lead: { 0: 64, 3: 65, 6: 71, 10: 69, 14: 65, 16: 64, 19: 72, 22: 71, 26: 65, 30: 64 },
        chords: { 0: [52, 59, 64], 16: [53, 60, 65] },
        bass: { 0: 40, 4: 40, 8: 43, 12: 40, 16: 41, 20: 41, 24: 36, 28: 39 },
        drums: { 0: 'K', 4: 'H', 8: 'S', 12: 'H', 16: 'K', 20: 'K', 24: 'S', 28: 'H' },
      },
    ],
  },
  cathedral: {
    id: 'cathedral', engine: 'structured', label: 'Catedral vacía',
    description: 'Órgano sostenido y voces graves; sin batería, sin prisas, sin absolución.',
    stepMs: 260, stepsPerSection: 32, leadInstrument: 'organ', chordInstrument: 'organ', bassInstrument: 'organbass',
    sections: [
      {
        lead: { 8: 67, 24: 65 },
        chords: { 0: [48, 55, 60, 63], 16: [46, 53, 58, 62] },
        bass: { 0: 36, 16: 34 },
      },
      {
        lead: { 8: 70, 24: 67 },
        chords: { 0: [43, 50, 55, 58], 16: [41, 48, 53, 57] },
        bass: { 0: 31, 16: 29 },
      },
    ],
  },
  duel: {
    id: 'duel', engine: 'structured', label: 'Duelo al amanecer',
    description: 'Cuerda seca, notas aisladas y madera: dos miradas y un tablero entre medias.',
    stepMs: 190, stepsPerSection: 32, leadInstrument: 'tremolo', chordInstrument: 'guitar2', bassInstrument: 'bass',
    sections: [
      {
        lead: { 0: 64, 7: 67, 14: 71, 21: 69, 28: 64 },
        chords: { 0: [52, 59, 64], 16: [50, 57, 62] },
        bass: { 0: 40, 16: 38 },
        drums: { 0: 'W', 16: 'W', 24: 'W' },
      },
    ],
  },
  storm: {
    id: 'storm', engine: 'structured', label: 'Tormenta táctica',
    description: 'Arpegiador, bajo agresivo y golpes sincopados para posiciones que arden.',
    stepMs: 82, stepsPerSection: 32, leadInstrument: 'arp', chordInstrument: 'pad', bassInstrument: 'synthbass',
    sections: [
      {
        lead: { 0: 62, 2: 65, 4: 69, 6: 74, 8: 72, 10: 69, 12: 65, 14: 62, 16: 63, 18: 67, 20: 70, 22: 75, 24: 74, 26: 70, 28: 67, 30: 63 },
        chords: { 0: [50, 57, 62], 16: [51, 58, 63] },
        bass: { 0: 38, 4: 38, 8: 41, 12: 36, 16: 39, 20: 39, 24: 34, 28: 36 },
        drums: { 0: 'K', 2: 'H', 4: 'S', 6: 'H', 8: 'K', 10: 'K', 12: 'S', 14: 'H', 16: 'K', 18: 'H', 20: 'S', 22: 'K', 24: 'K', 26: 'H', 28: 'S', 30: 'H' },
      },
    ],
  },
  lateEndgame: {
    id: 'lateEndgame', engine: 'structured', label: 'Final de madrugada',
    description: 'Piano de fieltro, campanas lejanas y mucho aire para calcular finales.',
    stepMs: 245, stepsPerSection: 32, leadInstrument: 'felt', chordInstrument: 'felt', bassInstrument: 'cello',
    sections: [
      {
        lead: { 0: 72, 8: 67, 16: 69, 24: 64 },
        chords: { 0: [48, 55, 60], 16: [45, 52, 57] },
        bass: { 0: 36, 16: 33 },
      },
      {
        lead: { 4: 76, 12: 72, 20: 71, 28: 67 },
        chords: { 0: [53, 57, 60], 16: [50, 55, 59] },
        bass: { 0: 41, 16: 38 },
      },
    ],
  },
  rigaRain: {
    id: 'rigaRain', engine: 'structured', label: 'Lluvia en Riga',
    description: 'Marimba húmeda, cristal y pizzicato: caminar de noche con el tablero aún en la cabeza.',
    stepMs: 152, stepsPerSection: 32, leadInstrument: 'marimba', chordInstrument: 'glass', bassInstrument: 'pizz',
    sections: [
      {
        lead: { 0: 67, 5: 70, 9: 74, 14: 72, 18: 65, 23: 69, 27: 67 },
        chords: { 0: [55, 62, 67], 16: [53, 60, 65] },
        bass: { 0: 43, 8: 38, 16: 41, 24: 36 },
        drums: { 3: 'H', 7: 'B', 11: 'H', 15: 'B', 19: 'H', 23: 'B', 27: 'H', 31: 'B' },
      },
      {
        lead: { 2: 69, 6: 72, 12: 76, 17: 74, 21: 70, 26: 67, 30: 65 },
        chords: { 0: [57, 64, 69], 16: [50, 57, 62] },
        bass: { 0: 45, 8: 40, 16: 38, 24: 43 },
        drums: { 5: 'H', 13: 'B', 21: 'H', 29: 'B' },
      },
    ],
  },
  kingTango: {
    id: 'kingTango', engine: 'structured', label: 'Tango del rey',
    description: 'Bandoneón sintético, contrabajo y golpes secos: elegante, tenso y con cuchillo bajo la mesa.',
    stepMs: 118, stepsPerSection: 32, leadInstrument: 'bandoneon', chordInstrument: 'bandoneon', bassInstrument: 'bass',
    sections: [
      {
        lead: { 0: 69, 3: 72, 6: 71, 8: 69, 11: 76, 14: 74, 16: 72, 19: 71, 22: 67, 24: 69, 27: 65, 30: 64 },
        chords: { 0: [57, 60, 64], 8: [55, 59, 62], 16: [53, 57, 60], 24: [52, 56, 59] },
        bass: { 0: 45, 3: 52, 8: 43, 11: 50, 16: 41, 19: 48, 24: 40, 27: 47 },
        drums: { 0: 'K', 3: 'W', 8: 'K', 11: 'S', 16: 'K', 19: 'W', 24: 'K', 27: 'S' },
      },
    ],
  },
  orbitalMonastery: {
    id: 'orbitalMonastery', engine: 'structured', label: 'Monasterio orbital',
    description: 'Voces sintéticas y drones suspendidos; ajedrez a trescientos kilómetros sobre cualquier parroquia.',
    stepMs: 325, stepsPerSection: 32, leadInstrument: 'choir', chordInstrument: 'pad', bassInstrument: 'organbass',
    sections: [
      {
        lead: { 8: 72, 24: 67 },
        chords: { 0: [48, 55, 60, 67], 16: [46, 53, 58, 65] },
        bass: { 0: 36, 16: 34 },
      },
      {
        lead: { 8: 74, 24: 69 },
        chords: { 0: [50, 57, 62, 69], 16: [45, 52, 57, 64] },
        bass: { 0: 38, 16: 33 },
      },
    ],
  },
  metro317: {
    id: 'metro317', engine: 'structured', label: 'Metro 03:17',
    description: 'Pulsos cortos, bajo eléctrico y síncopas: fluorescentes, túneles y una última combinación antes de casa.',
    stepMs: 92, stepsPerSection: 32, leadInstrument: 'pulse', chordInstrument: 'synth', bassInstrument: 'synthbass',
    sections: [
      {
        lead: { 0: 64, 3: 67, 5: 71, 8: 64, 10: 72, 13: 67, 16: 63, 19: 67, 21: 70, 24: 63, 26: 72, 29: 70 },
        chords: { 0: [52, 59, 64], 16: [51, 58, 63] },
        bass: { 0: 40, 4: 40, 7: 43, 12: 38, 16: 39, 20: 39, 23: 34, 28: 36 },
        drums: { 0: 'K', 2: 'H', 6: 'S', 7: 'H', 10: 'K', 14: 'S', 16: 'K', 18: 'H', 22: 'S', 23: 'H', 26: 'K', 30: 'S' },
      },
    ],
  },
  glassAsh: {
    id: 'glassAsh', engine: 'structured', label: 'Vidrio y ceniza',
    description: 'Armónicos de cristal, notas aisladas y graves largos. Casi inmóvil; bastante incómodo.',
    stepMs: 238, stepsPerSection: 32, leadInstrument: 'glass', chordInstrument: 'glass', bassInstrument: 'cello',
    sections: [
      {
        lead: { 1: 79, 9: 76, 18: 72, 27: 74 },
        chords: { 0: [55, 62, 67], 16: [53, 60, 65] },
        bass: { 0: 31, 16: 29 },
      },
      {
        lead: { 5: 81, 13: 77, 21: 74, 29: 72 },
        chords: { 0: [57, 64, 69], 16: [50, 57, 62] },
        bass: { 0: 33, 16: 26 },
      },
    ],
  },
  alexandria241: {
    id: 'alexandria241', engine: 'structured', label: 'Alejandría 02:41',
    description: 'Ney, oud y contramelodías sobre Rhodes, contrabajo y escobillas: jazz árabe nocturno con más conversación y profundidad.',
    stepMs: 140, stepsPerSection: 64, leadInstrument: 'ney', counterInstrument: 'oudJazz', chordInstrument: 'epiano', bassInstrument: 'bass',
    sections: [
      {
        // D Hijaz: frase contenida, mucho aire y respuesta del Rhodes.
        leadInstrument: 'ney',
        lead: { 4: 62, 8: 63, 12: 66, 18: 67, 24: 69, 30: 67, 36: 66, 42: 63, 50: 62, 58: 61.5 },
        counter: { 14: 57, 22: 60, 34: 59, 46: 57, 60: 54 },
        chords: { 0: [50, 57, 60, 64], 16: [51, 57, 60, 66], 32: [55, 60, 64, 69], 48: [50, 57, 61, 64] },
        bass: { 0: 38, 8: 45, 16: 39, 24: 45, 32: 43, 40: 38, 48: 42, 56: 45 },
        drums: { 0: 'B', 4: 'H', 8: 'B', 12: 'H', 16: 'B', 20: 'H', 24: 'B', 28: 'H', 32: 'B', 36: 'H', 40: 'B', 44: 'H', 48: 'B', 52: 'H', 56: 'B', 60: 'H' },
      },
      {
        // El oud toma el relevo: frases cortas y sincopadas, sin copiar ninguna melodía externa.
        leadInstrument: 'oudJazz',
        lead: { 2: 62, 6: 66, 10: 67, 15: 69, 19: 70, 23: 69, 28: 66, 34: 63, 38: 66, 44: 69, 49: 73, 54: 70, 60: 67 },
        counterInstrument: 'ney',
        counter: { 12: 74, 25: 70, 41: 67, 56: 69 },
        chords: { 0: [50, 57, 60, 64], 16: [46, 53, 57, 62], 32: [48, 55, 58, 62], 48: [49, 55, 58, 64] },
        bass: { 0: 38, 6: 45, 12: 50, 16: 34, 24: 41, 32: 36, 40: 43, 48: 37, 56: 44 },
        drums: { 0: 'B', 7: 'H', 12: 'B', 15: 'H', 20: 'B', 28: 'B', 31: 'H', 36: 'B', 44: 'B', 47: 'H', 52: 'B', 60: 'B' },
      },
      {
        // Sección más jazzística: la melodía sube de registro y el walking bass camina más.
        leadInstrument: 'ney',
        lead: { 0: 69, 5: 70, 10: 73, 16: 74, 22: 73, 27: 69, 33: 67, 39: 66, 45: 63, 52: 66, 58: 62 },
        counter: { 7: 57, 18: 60, 30: 62, 42: 59, 55: 57 },
        chords: { 0: [53, 57, 60, 64], 16: [55, 59, 62, 66], 32: [50, 57, 60, 64], 48: [51, 57, 60, 66] },
        bass: { 0: 41, 4: 45, 8: 48, 12: 52, 16: 43, 20: 47, 24: 50, 28: 54, 32: 38, 36: 42, 40: 45, 44: 49, 48: 39, 52: 43, 56: 46, 60: 50 },
        drums: { 0: 'B', 4: 'H', 8: 'B', 12: 'H', 16: 'B', 20: 'H', 24: 'B', 28: 'H', 32: 'B', 36: 'H', 40: 'B', 44: 'H', 48: 'B', 52: 'H', 56: 'B', 60: 'H' },
      },
      {
        // Coda espaciosa: menos notas, más noche.
        leadInstrument: 'oudJazz',
        lead: { 6: 74, 14: 70, 22: 69, 31: 66, 40: 63.5, 49: 62, 58: 66 },
        chords: { 0: [50, 57, 60, 64], 24: [46, 53, 57, 62], 40: [55, 60, 64, 69], 56: [50, 57, 61, 64] },
        bass: { 0: 38, 16: 34, 32: 43, 48: 38 },
        drums: { 0: 'B', 12: 'H', 24: 'B', 36: 'H', 48: 'B', 60: 'H' },
      },
    ],
  },
  cairo0047: {
    id: 'cairo0047', engine: 'structured', label: 'Cairo 00:47',
    description: 'Jazz árabe de madrugada: qanun y trompeta se contestan sobre Rhodes, contrabajo y escobillas, con más melodía sin perder espacio.',
    stepMs: 168, stepsPerSection: 64, longFormMs: 300000, leadInstrument: 'mutedHorn', counterInstrument: 'qanun', chordInstrument: 'epiano', bassInstrument: 'bass',
    sections: [
      {
        // Apertura casi vacía: el Rhodes marca el horizonte y el qanun responde con pocas notas.
        leadInstrument: 'qanun',
        lead: { 6: 62, 12: 63, 18: 66, 26: 67, 34: 66, 42: 63, 52: 61.5, 60: 62 },
        counterInstrument: 'mutedHorn',
        counter: { 22: 69, 38: 67, 56: 66 },
        chords: { 0: [50, 57, 60, 64], 20: [46, 53, 57, 62], 40: [55, 60, 64, 69], 56: [50, 57, 61, 64] },
        bass: { 0: 38, 12: 45, 20: 34, 32: 41, 40: 43, 52: 38 },
        drums: { 0: 'B', 8: 'H', 16: 'B', 24: 'H', 32: 'B', 40: 'H', 48: 'B', 56: 'H' },
      },
      {
        // Entra la voz de metal apagado, lenta y casi conversacional.
        leadInstrument: 'mutedHorn',
        lead: { 3: 69, 11: 70, 19: 67, 27: 66, 35: 63.5, 43: 66, 51: 69, 59: 67 },
        counter: { 7: 62, 23: 66, 39: 63, 55: 62 },
        chords: { 0: [53, 57, 60, 64], 16: [51, 57, 60, 66], 32: [48, 55, 58, 62], 48: [50, 57, 60, 64] },
        bass: { 0: 41, 8: 45, 16: 39, 24: 46, 32: 36, 40: 43, 48: 38, 56: 45 },
        drums: { 0: 'B', 12: 'H', 16: 'B', 28: 'H', 32: 'B', 44: 'H', 48: 'B', 60: 'H' },
      },
      {
        // Sección central algo más jazzística: walking bass suave y pregunta/respuesta.
        leadInstrument: 'qanun',
        lead: { 2: 66, 7: 69, 13: 70, 20: 74, 27: 70, 33: 69, 39: 66, 46: 63, 53: 66, 61: 62 },
        counterInstrument: 'mutedHorn',
        counter: { 10: 62, 24: 67, 36: 66, 50: 63, 58: 66 },
        chords: { 0: [50, 57, 60, 64], 16: [55, 59, 62, 66], 32: [53, 57, 60, 64], 48: [46, 53, 57, 62] },
        bass: { 0: 38, 4: 45, 8: 50, 12: 45, 16: 43, 20: 47, 24: 50, 28: 47, 32: 41, 36: 45, 40: 48, 44: 45, 48: 34, 52: 41, 56: 46, 60: 41 },
        drums: { 0: 'B', 6: 'H', 12: 'B', 18: 'H', 24: 'B', 30: 'H', 36: 'B', 42: 'H', 48: 'B', 54: 'H', 60: 'B' },
      },
      {
        // Coda: trompeta muy escasa y acordes suspendidos. Debe sentirse como una calle vacía, no como un solo.
        leadInstrument: 'mutedHorn',
        lead: { 8: 74, 20: 70, 31: 69, 43: 66, 55: 63.5 },
        chords: { 0: [50, 57, 60, 64], 24: [51, 57, 60, 66], 44: [55, 60, 64, 69] },
        bass: { 0: 38, 16: 39, 32: 43, 48: 38 },
        drums: { 0: 'B', 16: 'H', 32: 'B', 48: 'H' },
      },
    ],
  },
  beirut0113: {
    id: 'beirut0113', engine: 'structured', label: 'Beirut 01:13',
    description: 'Jazz levantino de madrugada: buzuq y clarinete en pregunta/respuesta, Rhodes, contrabajo y escobillas en un 6/8 con más fondo.',
    stepMs: 154, stepsPerSection: 72, longFormMs: 330000, leadInstrument: 'buzuq', counterInstrument: 'clarinet', chordInstrument: 'epiano', bassInstrument: 'bass',
    sections: [
      {
        // Apertura: buzuq seco sobre un 6/8 muy aireado. La escala sugiere
        // color levantino sin reutilizar las frases de Cairo/Alejandría.
        leadInstrument: 'buzuq',
        lead: { 3: 64, 8: 65, 13: 68, 19: 71, 26: 69, 32: 68, 39: 65, 46: 64, 55: 62.5, 64: 64, 69: 68 },
        counter: { 16: 59, 29: 62, 43: 60, 58: 59 },
        chords: { 0: [52, 59, 62, 67], 18: [50, 57, 60, 65], 36: [55, 62, 65, 69], 54: [51, 58, 62, 67] },
        bass: { 0: 40, 9: 47, 18: 38, 27: 45, 36: 43, 45: 50, 54: 39, 63: 46 },
        drums: { 0: 'B', 6: 'H', 12: 'W', 18: 'B', 24: 'H', 30: 'W', 36: 'B', 42: 'H', 48: 'W', 54: 'B', 60: 'H', 66: 'W' },
      },
      {
        // Respuesta de clarinete: notas largas, casi conversación, mientras
        // el bajo se mueve un poco más que en la primera sección.
        leadInstrument: 'clarinet',
        lead: { 4: 71, 12: 73, 21: 69, 29: 68, 38: 65, 47: 68, 56: 71, 66: 69 },
        counterInstrument: 'buzuq',
        counter: { 8: 64, 25: 65, 42: 62.5, 61: 64 },
        chords: { 0: [55, 59, 62, 67], 18: [53, 60, 64, 69], 36: [50, 57, 60, 65], 54: [52, 59, 62, 67] },
        bass: { 0: 43, 6: 47, 12: 50, 18: 41, 24: 45, 30: 48, 36: 38, 42: 45, 48: 50, 54: 40, 60: 47, 66: 45 },
        drums: { 0: 'B', 9: 'H', 18: 'B', 27: 'H', 36: 'B', 45: 'H', 54: 'B', 63: 'H' },
      },
      {
        // Parte central más jazzística, con pregunta/respuesta entre registros
        // y acordes algo más tensos. Sigue siendo fondo, no un solo invasivo.
        leadInstrument: 'buzuq',
        lead: { 2: 68, 7: 71, 13: 73, 20: 76, 27: 73, 34: 71, 40: 68, 47: 65, 53: 68, 60: 71, 67: 64 },
        counter: { 10: 64, 24: 68, 37: 65, 50: 64, 63: 62.5 },
        chords: { 0: [52, 59, 62, 67], 18: [57, 62, 65, 69], 36: [53, 60, 64, 69], 54: [50, 57, 60, 65] },
        bass: { 0: 40, 6: 47, 12: 52, 18: 45, 24: 43, 30: 50, 36: 41, 42: 48, 48: 45, 54: 38, 60: 45, 66: 50 },
        drums: { 0: 'B', 6: 'H', 12: 'W', 18: 'B', 24: 'H', 30: 'W', 36: 'B', 42: 'H', 48: 'W', 54: 'B', 60: 'H', 66: 'W' },
      },
      {
        // Coda de azotea: clarinete escaso, Rhodes suspendido y muy poco
        // movimiento. La pista termina respirando en vez de perseguirse.
        leadInstrument: 'clarinet',
        lead: { 8: 76, 20: 73, 31: 71, 43: 68, 55: 65, 67: 64 },
        chords: { 0: [52, 59, 62, 67], 24: [50, 57, 60, 65], 48: [55, 62, 65, 69] },
        bass: { 0: 40, 18: 38, 36: 43, 54: 40 },
        drums: { 0: 'B', 18: 'H', 36: 'B', 54: 'H' },
      },
    ],
  },
  damascusBlueHour: {
    id: 'damascusBlueHour', engine: 'structured', label: 'Damasco · hora azul',
    description: 'Ney, oud oscuro y cello sobre Rhodes: una melodía lenta que vuelve transformada entre calle vacía y humo de madrugada.',
    stepMs: 176, stepsPerSection: 64, longFormMs: 320000, leadInstrument: 'ney', counterInstrument: 'oudJazz', chordInstrument: 'epiano', bassInstrument: 'cello',
    sections: [
      {
        lead: { 4: 62, 10: 63, 17: 66, 24: 69, 31: 67, 38: 66, 46: 63, 54: 62, 60: 57 },
        counter: { 13: 54, 28: 57, 42: 59, 58: 54 },
        chords: { 0: [50, 57, 60, 64], 16: [51, 57, 60, 66], 32: [46, 53, 57, 62], 48: [50, 57, 61, 64] },
        bass: { 0: 38, 16: 39, 32: 34, 48: 38 },
        drums: { 0: 'B', 16: 'H', 32: 'B', 48: 'H' },
      },
      {
        leadInstrument: 'oudJazz', counterInstrument: 'ney',
        lead: { 2: 62, 7: 66, 12: 67, 18: 70, 24: 69, 30: 66, 36: 63, 43: 66, 50: 69, 57: 67, 62: 62 },
        counter: { 15: 74, 33: 70, 47: 67, 60: 69 },
        chords: { 0: [53, 57, 60, 64], 16: [50, 57, 60, 65], 32: [55, 59, 62, 66], 48: [51, 57, 60, 66] },
        bass: { 0: 41, 8: 45, 16: 38, 24: 45, 32: 43, 40: 47, 48: 39, 56: 46 },
        drums: { 0: 'B', 8: 'H', 16: 'B', 24: 'H', 32: 'B', 40: 'H', 48: 'B', 56: 'H' },
      },
      {
        lead: { 0: 69, 5: 70, 11: 73, 17: 74, 23: 70, 29: 69, 35: 66, 41: 63, 47: 66, 53: 69, 59: 62 },
        counter: { 8: 57, 20: 60, 32: 59, 44: 57, 56: 54 },
        chords: { 0: [55, 60, 64, 69], 16: [53, 57, 60, 64], 32: [50, 57, 60, 64], 48: [46, 53, 57, 62] },
        bass: { 0: 43, 4: 47, 8: 50, 12: 47, 16: 41, 20: 45, 24: 48, 28: 45, 32: 38, 36: 42, 40: 45, 44: 42, 48: 34, 52: 41, 56: 46, 60: 41 },
        drums: { 0: 'B', 6: 'H', 12: 'B', 18: 'H', 24: 'B', 30: 'H', 36: 'B', 42: 'H', 48: 'B', 54: 'H', 60: 'B' },
      },
      {
        leadInstrument: 'cello', counterInstrument: 'ney',
        lead: { 6: 50, 18: 53, 30: 55, 42: 51, 54: 50 },
        counter: { 12: 69, 28: 66, 44: 63, 60: 62 },
        chords: { 0: [50, 57, 60, 64], 24: [46, 53, 57, 62], 48: [55, 60, 64, 69] },
        bass: { 0: 38, 24: 34, 48: 43 },
        drums: { 0: 'B', 32: 'H' },
      },
    ],
  },
  istanbul0326: {
    id: 'istanbul0326', engine: 'structured', label: 'Estambul 03:26',
    description: 'Clarinete largo, qanun y bajo con pulso grave en compás quebrado: nocturno, melódico y con más pecho que click.',
    stepMs: 118, stepsPerSection: 56, longFormMs: 300000, leadInstrument: 'clarinet', counterInstrument: 'qanun', chordInstrument: 'epiano', bassInstrument: 'bass',
    sections: [
      {
        lead: { 0: 67, 5: 68, 9: 71, 14: 74, 19: 72, 24: 71, 29: 68, 35: 67, 41: 65, 48: 67, 53: 71 },
        counter: { 7: 60, 16: 63, 27: 62, 38: 60, 50: 63 },
        chords: { 0: [55, 62, 65, 70], 14: [53, 60, 64, 69], 28: [50, 57, 60, 65], 42: [55, 62, 66, 70] },
        bass: { 0: 43, 7: 50, 14: 41, 21: 48, 28: 38, 35: 45, 42: 43, 49: 50 },
        drums: { 0: 'W', 7: 'B', 14: 'W', 21: 'H', 28: 'W', 35: 'B', 42: 'W', 49: 'H' },
      },
      {
        leadInstrument: 'qanun', counterInstrument: 'clarinet',
        lead: { 2: 67, 4: 71, 8: 72, 11: 74, 16: 77, 20: 74, 24: 72, 30: 71, 34: 68, 39: 65, 44: 68, 49: 71, 54: 67 },
        counter: { 13: 79, 27: 76, 40: 74, 52: 72 },
        chords: { 0: [57, 64, 67, 72], 14: [55, 62, 65, 70], 28: [52, 59, 63, 68], 42: [53, 60, 64, 69] },
        bass: { 0: 45, 7: 52, 14: 43, 21: 50, 28: 40, 35: 47, 42: 41, 49: 48 },
        drums: { 0: 'W', 5: 'H', 14: 'B', 19: 'H', 28: 'W', 33: 'H', 42: 'B', 47: 'H' },
      },
      {
        lead: { 1: 74, 6: 76, 12: 79, 17: 77, 22: 74, 27: 72, 32: 71, 37: 68, 43: 71, 49: 74, 54: 72 },
        counter: { 9: 67, 20: 71, 30: 68, 40: 65, 51: 67 },
        chords: { 0: [50, 57, 60, 65], 14: [55, 62, 65, 70], 28: [53, 60, 64, 69], 42: [57, 64, 67, 72] },
        bass: { 0: 38, 4: 45, 7: 50, 11: 45, 14: 43, 18: 50, 21: 55, 25: 50, 28: 41, 32: 48, 35: 53, 39: 48, 42: 45, 46: 52, 49: 57, 53: 52 },
        drums: { 0: 'W', 4: 'H', 7: 'B', 14: 'W', 18: 'H', 21: 'B', 28: 'W', 32: 'H', 35: 'B', 42: 'W', 46: 'H', 49: 'B' },
      },
      {
        lead: { 4: 79, 14: 76, 24: 74, 34: 71, 44: 68, 52: 67 },
        counter: { 9: 60, 27: 63, 45: 62 },
        chords: { 0: [55, 62, 65, 70], 20: [53, 60, 64, 69], 40: [50, 57, 60, 65] },
        bass: { 0: 43, 14: 41, 28: 38, 42: 43 },
        drums: { 0: 'B', 14: 'H', 28: 'B', 42: 'H' },
      },
    ],
  },
  tangierSmoke: {
    id: 'tangierSmoke', engine: 'structured', label: 'Tánger · humo',
    description: 'Trompeta apagada, guitarra seca y vibráfono: club marroquí imaginario, humo espeso y un walking bass con malas intenciones.',
    stepMs: 148, stepsPerSection: 64, longFormMs: 310000, leadInstrument: 'mutedHorn', counterInstrument: 'guitar2', chordInstrument: 'epiano', bassInstrument: 'bass',
    sections: [
      {
        lead: { 3: 65, 9: 68, 15: 70, 22: 72, 29: 70, 36: 68, 44: 65, 52: 63, 59: 65 },
        counter: { 12: 56, 26: 60, 40: 58, 55: 56 },
        chords: { 0: [53, 60, 63, 68], 16: [50, 57, 60, 65], 32: [55, 62, 65, 70], 48: [51, 58, 62, 67] },
        bass: { 0: 41, 8: 48, 16: 38, 24: 45, 32: 43, 40: 50, 48: 39, 56: 46 },
        drums: { 0: 'B', 8: 'H', 16: 'B', 24: 'W', 32: 'B', 40: 'H', 48: 'B', 56: 'W' },
      },
      {
        leadInstrument: 'guitar2', counterInstrument: 'mutedHorn',
        lead: { 1: 65, 5: 68, 10: 72, 14: 70, 19: 68, 24: 65, 29: 63, 35: 65, 41: 68, 46: 70, 52: 72, 58: 68, 62: 65 },
        counter: { 16: 77, 32: 72, 48: 70, 60: 68 },
        chords: { 0: [50, 57, 60, 65], 16: [53, 60, 63, 68], 32: [48, 55, 58, 63], 48: [55, 62, 65, 70] },
        bass: { 0: 38, 4: 45, 8: 50, 12: 45, 16: 41, 20: 48, 24: 53, 28: 48, 32: 36, 36: 43, 40: 48, 44: 43, 48: 43, 52: 50, 56: 55, 60: 50 },
        drums: { 0: 'B', 4: 'H', 8: 'B', 12: 'H', 16: 'B', 20: 'H', 24: 'B', 28: 'H', 32: 'B', 36: 'H', 40: 'B', 44: 'H', 48: 'B', 52: 'H', 56: 'B', 60: 'H' },
      },
      {
        leadInstrument: 'vibes', counterInstrument: 'mutedHorn',
        lead: { 0: 72, 6: 75, 12: 77, 18: 80, 24: 77, 30: 75, 36: 72, 42: 70, 48: 72, 54: 75, 60: 68 },
        counter: { 9: 65, 21: 68, 33: 70, 45: 68, 57: 65 },
        chords: { 0: [53, 60, 63, 68], 16: [55, 62, 65, 70], 32: [50, 57, 60, 65], 48: [51, 58, 62, 67] },
        bass: { 0: 41, 8: 48, 16: 43, 24: 50, 32: 38, 40: 45, 48: 39, 56: 46 },
        drums: { 0: 'B', 7: 'H', 16: 'B', 23: 'H', 32: 'B', 39: 'H', 48: 'B', 55: 'H' },
      },
      {
        lead: { 8: 77, 20: 72, 32: 70, 44: 68, 56: 65 },
        counter: { 14: 56, 38: 58 },
        chords: { 0: [53, 60, 63, 68], 24: [50, 57, 60, 65], 48: [55, 62, 65, 70] },
        bass: { 0: 41, 16: 38, 32: 43, 48: 41 },
        drums: { 0: 'B', 16: 'H', 32: 'B', 48: 'H' },
      },
    ],
  },
  bosphorusRain: {
    id: 'bosphorusRain', engine: 'structured', label: 'Bósforo bajo la lluvia',
    description: 'Piano de fieltro, clarinete y cristal sobre cello: lluvia nocturna, reflejos de ciudad y una melodía que aparece y desaparece.',
    stepMs: 198, stepsPerSection: 64, longFormMs: 340000, leadInstrument: 'felt', counterInstrument: 'clarinet', chordInstrument: 'glass', bassInstrument: 'cello',
    sections: [
      {
        lead: { 0: 69, 8: 72, 16: 76, 24: 74, 32: 72, 40: 69, 48: 67, 56: 64 },
        counter: { 12: 81, 28: 79, 44: 76, 60: 74 },
        chords: { 0: [57, 60, 64, 69], 16: [53, 57, 60, 64], 32: [55, 59, 62, 67], 48: [52, 57, 60, 64] },
        bass: { 0: 45, 16: 41, 32: 43, 48: 40 },
        drums: { 7: 'H', 23: 'H', 39: 'H', 55: 'H' },
      },
      {
        leadInstrument: 'clarinet', counterInstrument: 'felt',
        lead: { 5: 76, 13: 79, 21: 81, 29: 79, 37: 76, 45: 74, 53: 72, 61: 69 },
        counter: { 1: 60, 17: 64, 33: 62, 49: 60 },
        chords: { 0: [53, 57, 60, 64], 16: [55, 59, 62, 67], 32: [50, 55, 59, 62], 48: [57, 60, 64, 69] },
        bass: { 0: 41, 16: 43, 32: 38, 48: 45 },
        drums: { 8: 'H', 24: 'B', 40: 'H', 56: 'B' },
      },
      {
        lead: { 0: 72, 6: 76, 12: 79, 18: 81, 24: 79, 30: 76, 36: 74, 42: 72, 48: 69, 54: 67, 60: 64 },
        counter: { 9: 67, 21: 69, 33: 67, 45: 64, 57: 62 },
        chords: { 0: [57, 60, 64, 69], 16: [55, 59, 62, 67], 32: [53, 57, 60, 64], 48: [50, 55, 59, 62] },
        bass: { 0: 45, 8: 40, 16: 43, 24: 38, 32: 41, 40: 36, 48: 38, 56: 45 },
        drums: { 4: 'H', 12: 'B', 20: 'H', 28: 'B', 36: 'H', 44: 'B', 52: 'H', 60: 'B' },
      },
      {
        leadInstrument: 'glass', counterInstrument: 'clarinet',
        lead: { 8: 81, 24: 76, 40: 72, 56: 69 },
        counter: { 16: 67, 32: 64, 48: 62 },
        chords: { 0: [57, 60, 64, 69], 24: [53, 57, 60, 64], 48: [55, 59, 62, 67] },
        bass: { 0: 45, 24: 41, 48: 43 },
        drums: { 16: 'H', 48: 'H' },
      },
    ],
  },
  beirutRooftop0412: {
    id: 'beirutRooftop0412', engine: 'structured', label: 'Beirut rooftop 04:12',
    description: 'Clarinete más suelto, buzuq, Rhodes y contrabajo: el primo más jazzístico de Beirut 01:13, ya con la noche torcida.',
    stepMs: 146, stepsPerSection: 72, longFormMs: 350000, leadInstrument: 'clarinet', counterInstrument: 'buzuq', chordInstrument: 'epiano', bassInstrument: 'bass',
    sections: [
      {
        lead: { 4: 68, 10: 71, 17: 73, 25: 76, 33: 73, 41: 71, 49: 68, 58: 65, 67: 68 },
        counter: { 13: 59, 29: 62, 45: 60, 61: 59 },
        chords: { 0: [52, 59, 62, 67], 18: [55, 62, 65, 69], 36: [50, 57, 60, 65], 54: [53, 60, 64, 69] },
        bass: { 0: 40, 9: 47, 18: 43, 27: 50, 36: 38, 45: 45, 54: 41, 63: 48 },
        drums: { 0: 'B', 6: 'H', 12: 'W', 18: 'B', 24: 'H', 30: 'W', 36: 'B', 42: 'H', 48: 'W', 54: 'B', 60: 'H', 66: 'W' },
      },
      {
        leadInstrument: 'buzuq', counterInstrument: 'clarinet',
        lead: { 1: 64, 5: 68, 9: 71, 14: 73, 20: 76, 26: 73, 32: 71, 38: 68, 44: 65, 50: 68, 56: 71, 62: 73, 68: 64 },
        counter: { 17: 80, 35: 76, 53: 73, 66: 71 },
        chords: { 0: [55, 62, 65, 69], 18: [52, 59, 62, 67], 36: [57, 62, 65, 69], 54: [50, 57, 60, 65] },
        bass: { 0: 43, 6: 47, 12: 50, 18: 40, 24: 47, 30: 52, 36: 45, 42: 50, 48: 53, 54: 38, 60: 45, 66: 50 },
        drums: { 0: 'B', 6: 'H', 12: 'W', 18: 'B', 24: 'H', 30: 'W', 36: 'B', 42: 'H', 48: 'W', 54: 'B', 60: 'H', 66: 'W' },
      },
      {
        lead: { 0: 76, 5: 78, 11: 80, 17: 83, 23: 80, 29: 78, 35: 76, 41: 73, 47: 71, 53: 73, 59: 76, 65: 68, 70: 71 },
        counter: { 8: 64, 20: 68, 32: 71, 44: 68, 56: 65, 68: 64 },
        chords: { 0: [57, 62, 65, 69], 18: [55, 62, 65, 69], 36: [53, 60, 64, 69], 54: [52, 59, 62, 67] },
        bass: { 0: 45, 6: 52, 12: 57, 18: 43, 24: 50, 30: 55, 36: 41, 42: 48, 48: 53, 54: 40, 60: 47, 66: 52 },
        drums: { 0: 'B', 4: 'H', 9: 'W', 18: 'B', 22: 'H', 27: 'W', 36: 'B', 40: 'H', 45: 'W', 54: 'B', 58: 'H', 63: 'W' },
      },
      {
        lead: { 8: 80, 20: 76, 32: 73, 44: 71, 56: 68, 68: 64 },
        counter: { 14: 59, 38: 62, 62: 60 },
        chords: { 0: [52, 59, 62, 67], 24: [50, 57, 60, 65], 48: [55, 62, 65, 69] },
        bass: { 0: 40, 18: 38, 36: 43, 54: 40 },
        drums: { 0: 'B', 18: 'H', 36: 'B', 54: 'H' },
      },
    ],
  },
  casablancaLastCall: {
    id: 'casablancaLastCall', engine: 'structured', label: 'Casablanca · Last Call',
    description: 'Rhodes, trompeta apagada, vibráfono y contrabajo: el camarero recoge vasos y aún queda una última partida.',
    stepMs: 162, stepsPerSection: 64, longFormMs: 330000, leadInstrument: 'mutedHorn', counterInstrument: 'vibes', chordInstrument: 'epiano', bassInstrument: 'bass',
    sections: [
      {
        lead: { 5: 67, 13: 70, 21: 72, 29: 74, 37: 72, 45: 69, 53: 67, 61: 65 },
        counter: { 9: 79, 25: 76, 41: 74, 57: 72 },
        chords: { 0: [48, 55, 58, 64], 16: [53, 57, 60, 64], 32: [50, 57, 60, 65], 48: [55, 59, 62, 65] },
        bass: { 0: 36, 8: 43, 16: 41, 24: 45, 32: 38, 40: 45, 48: 43, 56: 47 },
        drums: { 0: 'B', 8: 'H', 16: 'B', 24: 'H', 32: 'B', 40: 'H', 48: 'B', 56: 'H' },
      },
      {
        leadInstrument: 'vibes', counterInstrument: 'mutedHorn',
        lead: { 2: 72, 8: 75, 14: 79, 20: 77, 26: 74, 32: 72, 38: 69, 44: 67, 50: 69, 56: 72, 62: 65 },
        counter: { 11: 67, 27: 70, 43: 69, 59: 67 },
        chords: { 0: [53, 57, 60, 64], 16: [50, 57, 60, 65], 32: [55, 59, 62, 65], 48: [48, 55, 58, 64] },
        bass: { 0: 41, 4: 45, 8: 48, 12: 45, 16: 38, 20: 45, 24: 50, 28: 45, 32: 43, 36: 47, 40: 50, 44: 47, 48: 36, 52: 43, 56: 48, 60: 43 },
        drums: { 0: 'B', 4: 'H', 8: 'B', 12: 'H', 16: 'B', 20: 'H', 24: 'B', 28: 'H', 32: 'B', 36: 'H', 40: 'B', 44: 'H', 48: 'B', 52: 'H', 56: 'B', 60: 'H' },
      },
      {
        lead: { 0: 70, 6: 74, 12: 77, 18: 79, 24: 77, 30: 74, 36: 72, 42: 69, 48: 67, 54: 70, 60: 65 },
        counter: { 9: 76, 21: 74, 33: 72, 45: 70, 57: 67 },
        chords: { 0: [50, 57, 60, 65], 16: [55, 59, 62, 65], 32: [53, 57, 60, 64], 48: [48, 55, 58, 64] },
        bass: { 0: 38, 8: 45, 16: 43, 24: 50, 32: 41, 40: 48, 48: 36, 56: 43 },
        drums: { 0: 'B', 7: 'H', 14: 'B', 21: 'H', 28: 'B', 35: 'H', 42: 'B', 49: 'H', 56: 'B' },
      },
      {
        lead: { 8: 74, 20: 72, 32: 69, 44: 67, 56: 65 },
        counter: { 14: 79, 38: 76 },
        chords: { 0: [48, 55, 58, 64], 24: [53, 57, 60, 64], 48: [50, 57, 60, 65] },
        bass: { 0: 36, 16: 41, 32: 38, 48: 36 },
        drums: { 0: 'B', 16: 'H', 32: 'B', 48: 'H' },
      },
    ],
  },
  cairoQuietHours: {
    id: 'cairoQuietHours', engine: 'structured', label: 'Cairo · Quiet Hours',
    description: 'Jazz árabe introspectivo: trompeta apagada, oud, Rhodes y contrabajo; melodías largas que dejan respirar el silencio entre frase y frase.',
    stepMs: 184, stepsPerSection: 64, longFormMs: 360000, leadInstrument: 'mutedHorn', counterInstrument: 'oudJazz', chordInstrument: 'epiano', bassInstrument: 'bass',
    sections: [
      {
        lead: { 6: 67, 14: 70, 22: 72, 31: 74, 39: 72, 47: 70, 55: 67, 61: 65 },
        counter: { 10: 58, 27: 62, 43: 60, 59: 58 },
        chords: { 0: [48, 55, 58, 62], 16: [53, 57, 60, 64], 32: [50, 57, 60, 65], 48: [55, 59, 62, 67] },
        bass: { 0: 36, 16: 41, 32: 38, 48: 43 },
        drums: { 0: 'B', 16: 'H', 32: 'B', 48: 'H' },
      },
      {
        leadInstrument: 'oudJazz', counterInstrument: 'mutedHorn',
        lead: { 2: 65, 8: 67, 13: 70, 19: 72, 25: 74, 31: 72, 37: 70, 43: 67, 49: 65, 55: 67, 61: 62 },
        counter: { 17: 77, 34: 74, 50: 72, 60: 70 },
        chords: { 0: [53, 57, 60, 64], 16: [48, 55, 58, 62], 32: [55, 59, 62, 67], 48: [50, 57, 60, 65] },
        bass: { 0: 41, 8: 45, 16: 36, 24: 43, 32: 43, 40: 47, 48: 38, 56: 45 },
        drums: { 0: 'B', 8: 'H', 16: 'B', 24: 'H', 32: 'B', 40: 'H', 48: 'B', 56: 'H' },
      },
      {
        lead: { 4: 72, 10: 74, 16: 77, 22: 79, 28: 77, 34: 74, 40: 72, 46: 70, 52: 67, 58: 65 },
        counter: { 13: 62, 25: 65, 37: 67, 49: 65, 61: 62 },
        chords: { 0: [50, 57, 60, 65], 16: [55, 59, 62, 67], 32: [53, 57, 60, 64], 48: [48, 55, 58, 62] },
        bass: { 0: 38, 8: 45, 16: 43, 24: 50, 32: 41, 40: 48, 48: 36, 56: 43 },
        drums: { 0: 'B', 12: 'H', 24: 'B', 36: 'H', 48: 'B', 60: 'H' },
      },
      {
        lead: { 8: 74, 20: 72, 32: 70, 44: 67, 56: 65 },
        counter: { 15: 58, 39: 60 },
        chords: { 0: [48, 55, 58, 62], 24: [53, 57, 60, 64], 48: [50, 57, 60, 65] },
        bass: { 0: 36, 24: 41, 48: 38 },
        drums: { 0: 'B', 32: 'H' },
      },
    ],
  },
  nileBalcony0152: {
    id: 'nileBalcony0152', engine: 'structured', label: 'Nilo · balcón 01:52',
    description: 'Ney, vibráfono y piano eléctrico flotando sobre cello; una pieza lenta de balcón abierto, río oscuro y ciudad todavía despierta.',
    stepMs: 202, stepsPerSection: 64, longFormMs: 370000, leadInstrument: 'ney', counterInstrument: 'vibes', chordInstrument: 'epiano', bassInstrument: 'cello',
    sections: [
      {
        lead: { 4: 69, 12: 72, 20: 76, 28: 74, 36: 72, 44: 69, 52: 67, 60: 64 },
        counter: { 8: 81, 24: 79, 40: 76, 56: 74 },
        chords: { 0: [57, 60, 64, 69], 16: [53, 57, 60, 64], 32: [55, 59, 62, 67], 48: [52, 57, 60, 64] },
        bass: { 0: 45, 16: 41, 32: 43, 48: 40 },
        drums: { 15: 'H', 31: 'H', 47: 'H', 63: 'H' },
      },
      {
        leadInstrument: 'vibes', counterInstrument: 'ney',
        lead: { 2: 72, 10: 76, 18: 79, 26: 81, 34: 79, 42: 76, 50: 74, 58: 72 },
        counter: { 14: 67, 30: 69, 46: 67, 62: 64 },
        chords: { 0: [53, 57, 60, 64], 16: [55, 59, 62, 67], 32: [50, 55, 59, 62], 48: [57, 60, 64, 69] },
        bass: { 0: 41, 16: 43, 32: 38, 48: 45 },
        drums: { 8: 'H', 24: 'B', 40: 'H', 56: 'B' },
      },
      {
        lead: { 0: 76, 6: 79, 12: 81, 18: 83, 24: 81, 30: 79, 36: 76, 42: 74, 48: 72, 54: 69, 60: 67 },
        counter: { 9: 64, 21: 67, 33: 69, 45: 67, 57: 64 },
        chords: { 0: [57, 60, 64, 69], 16: [55, 59, 62, 67], 32: [53, 57, 60, 64], 48: [50, 55, 59, 62] },
        bass: { 0: 45, 8: 40, 16: 43, 24: 38, 32: 41, 40: 36, 48: 38, 56: 45 },
        drums: { 4: 'H', 20: 'B', 36: 'H', 52: 'B' },
      },
      {
        leadInstrument: 'ney', counterInstrument: 'vibes',
        lead: { 8: 79, 24: 76, 40: 72, 56: 69 },
        counter: { 16: 83, 32: 79, 48: 76 },
        chords: { 0: [57, 60, 64, 69], 24: [53, 57, 60, 64], 48: [55, 59, 62, 67] },
        bass: { 0: 45, 24: 41, 48: 43 },
        drums: { 32: 'H' },
      },
    ],
  },
  aleppoAfterRain: {
    id: 'aleppoAfterRain', engine: 'structured', label: 'Alepo · después de la lluvia',
    description: 'Clarinete cálido, qanun y piano de fieltro: gotas en piedra, calles vacías y un motivo que reaparece cada vez un poco más cansado.',
    stepMs: 188, stepsPerSection: 64, longFormMs: 350000, leadInstrument: 'clarinet', counterInstrument: 'qanun', chordInstrument: 'felt', bassInstrument: 'bass',
    sections: [
      {
        lead: { 5: 65, 13: 68, 21: 72, 29: 70, 37: 68, 45: 65, 53: 63, 61: 65 },
        counter: { 9: 60, 25: 63, 41: 62, 57: 60 },
        chords: { 0: [53, 60, 63, 68], 16: [50, 57, 60, 65], 32: [55, 62, 65, 70], 48: [51, 58, 62, 67] },
        bass: { 0: 41, 16: 38, 32: 43, 48: 39 },
        drums: { 0: 'B', 16: 'H', 32: 'B', 48: 'H' },
      },
      {
        leadInstrument: 'qanun', counterInstrument: 'clarinet',
        lead: { 1: 65, 5: 68, 9: 72, 14: 74, 20: 72, 26: 70, 32: 68, 38: 65, 44: 63, 50: 65, 56: 68, 62: 65 },
        counter: { 17: 77, 33: 74, 49: 72, 60: 70 },
        chords: { 0: [50, 57, 60, 65], 16: [53, 60, 63, 68], 32: [48, 55, 58, 63], 48: [55, 62, 65, 70] },
        bass: { 0: 38, 8: 45, 16: 41, 24: 48, 32: 36, 40: 43, 48: 43, 56: 50 },
        drums: { 0: 'B', 8: 'H', 16: 'B', 24: 'H', 32: 'B', 40: 'H', 48: 'B', 56: 'H' },
      },
      {
        lead: { 0: 72, 6: 75, 12: 77, 18: 80, 24: 77, 30: 75, 36: 72, 42: 70, 48: 68, 54: 65, 60: 63 },
        counter: { 9: 65, 21: 68, 33: 70, 45: 68, 57: 65 },
        chords: { 0: [53, 60, 63, 68], 16: [55, 62, 65, 70], 32: [50, 57, 60, 65], 48: [51, 58, 62, 67] },
        bass: { 0: 41, 8: 48, 16: 43, 24: 50, 32: 38, 40: 45, 48: 39, 56: 46 },
        drums: { 0: 'B', 12: 'H', 24: 'B', 36: 'H', 48: 'B', 60: 'H' },
      },
      {
        lead: { 8: 77, 20: 72, 32: 70, 44: 68, 56: 65 },
        counter: { 14: 60, 38: 62 },
        chords: { 0: [53, 60, 63, 68], 24: [50, 57, 60, 65], 48: [55, 62, 65, 70] },
        bass: { 0: 41, 24: 38, 48: 43 },
        drums: { 0: 'B', 32: 'H' },
      },
    ],
  },
  ammanVelvetRoom: {
    id: 'ammanVelvetRoom', engine: 'structured', label: 'Amán · habitación de terciopelo',
    description: 'Rhodes, buzuq y vibráfono con un bajo perezoso: jazz de hotel pequeño, luz ámbar y conversación a media voz.',
    stepMs: 170, stepsPerSection: 64, longFormMs: 345000, leadInstrument: 'buzuq', counterInstrument: 'vibes', chordInstrument: 'epiano', bassInstrument: 'bass',
    sections: [
      {
        lead: { 3: 64, 9: 68, 15: 71, 22: 73, 29: 71, 36: 68, 43: 66, 50: 64, 57: 62.5 },
        counter: { 12: 76, 28: 73, 44: 71, 60: 68 },
        chords: { 0: [52, 59, 62, 67], 16: [55, 62, 65, 69], 32: [50, 57, 60, 65], 48: [53, 60, 64, 69] },
        bass: { 0: 40, 8: 47, 16: 43, 24: 50, 32: 38, 40: 45, 48: 41, 56: 48 },
        drums: { 0: 'B', 8: 'H', 16: 'B', 24: 'H', 32: 'B', 40: 'H', 48: 'B', 56: 'H' },
      },
      {
        leadInstrument: 'vibes', counterInstrument: 'buzuq',
        lead: { 2: 71, 8: 74, 14: 78, 20: 76, 26: 73, 32: 71, 38: 68, 44: 66, 50: 68, 56: 71, 62: 64 },
        counter: { 11: 64, 27: 68, 43: 66, 59: 64 },
        chords: { 0: [55, 62, 65, 69], 16: [52, 59, 62, 67], 32: [57, 62, 65, 69], 48: [50, 57, 60, 65] },
        bass: { 0: 43, 8: 50, 16: 40, 24: 47, 32: 45, 40: 52, 48: 38, 56: 45 },
        drums: { 0: 'B', 12: 'H', 24: 'B', 36: 'H', 48: 'B', 60: 'H' },
      },
      {
        lead: { 0: 73, 5: 76, 11: 78, 17: 80, 23: 78, 29: 76, 35: 73, 41: 71, 47: 68, 53: 71, 59: 64 },
        counter: { 8: 64, 20: 68, 32: 71, 44: 68, 56: 66 },
        chords: { 0: [57, 62, 65, 69], 16: [55, 62, 65, 69], 32: [53, 60, 64, 69], 48: [52, 59, 62, 67] },
        bass: { 0: 45, 8: 52, 16: 43, 24: 50, 32: 41, 40: 48, 48: 40, 56: 47 },
        drums: { 0: 'B', 6: 'H', 12: 'W', 24: 'B', 30: 'H', 36: 'W', 48: 'B', 54: 'H', 60: 'W' },
      },
      {
        leadInstrument: 'vibes', counterInstrument: 'buzuq',
        lead: { 8: 78, 20: 73, 32: 71, 44: 68, 56: 64 },
        counter: { 16: 59, 40: 62 },
        chords: { 0: [52, 59, 62, 67], 24: [50, 57, 60, 65], 48: [55, 62, 65, 69] },
        bass: { 0: 40, 24: 38, 48: 43 },
        drums: { 0: 'B', 32: 'H' },
      },
    ],
  },
  medinaBlueSmoke: {
    id: 'medinaBlueSmoke', engine: 'structured', label: 'Medina · humo azul',
    description: 'Oud jazz, clarinete y Rhodes con percusión mínima: nocturno cálido, algo turbio y hecho para pensar sin prisa.',
    stepMs: 178, stepsPerSection: 72, longFormMs: 365000, leadInstrument: 'oudJazz', counterInstrument: 'clarinet', chordInstrument: 'epiano', bassInstrument: 'bass',
    sections: [
      {
        lead: { 4: 62, 10: 65, 16: 69, 23: 71, 30: 69, 37: 65, 44: 62, 52: 60, 60: 62, 68: 65 },
        counter: { 14: 74, 32: 71, 50: 69, 66: 67 },
        chords: { 0: [50, 57, 60, 65], 18: [53, 60, 63, 68], 36: [55, 62, 65, 70], 54: [51, 58, 62, 67] },
        bass: { 0: 38, 9: 45, 18: 41, 27: 48, 36: 43, 45: 50, 54: 39, 63: 46 },
        drums: { 0: 'B', 12: 'H', 24: 'W', 36: 'B', 48: 'H', 60: 'W' },
      },
      {
        leadInstrument: 'clarinet', counterInstrument: 'oudJazz',
        lead: { 5: 69, 13: 72, 21: 74, 29: 72, 37: 69, 45: 67, 53: 65, 61: 62, 69: 65 },
        counter: { 9: 58, 27: 62, 45: 60, 63: 58 },
        chords: { 0: [53, 60, 63, 68], 18: [50, 57, 60, 65], 36: [48, 55, 58, 63], 54: [55, 62, 65, 70] },
        bass: { 0: 41, 9: 48, 18: 38, 27: 45, 36: 36, 45: 43, 54: 43, 63: 50 },
        drums: { 0: 'B', 18: 'H', 36: 'B', 54: 'H' },
      },
      {
        lead: { 0: 69, 6: 72, 12: 76, 18: 78, 24: 76, 30: 72, 36: 69, 42: 67, 48: 65, 54: 67, 60: 69, 66: 62 },
        counter: { 9: 62, 21: 65, 33: 69, 45: 67, 57: 65, 69: 62 },
        chords: { 0: [55, 62, 65, 70], 18: [53, 60, 63, 68], 36: [50, 57, 60, 65], 54: [51, 58, 62, 67] },
        bass: { 0: 43, 6: 50, 12: 55, 18: 41, 24: 48, 30: 53, 36: 38, 42: 45, 48: 50, 54: 39, 60: 46, 66: 51 },
        drums: { 0: 'B', 6: 'H', 12: 'W', 18: 'B', 24: 'H', 30: 'W', 36: 'B', 42: 'H', 48: 'W', 54: 'B', 60: 'H', 66: 'W' },
      },
      {
        leadInstrument: 'clarinet', counterInstrument: 'oudJazz',
        lead: { 8: 74, 20: 72, 32: 69, 44: 67, 56: 65, 68: 62 },
        counter: { 14: 58, 38: 60, 62: 58 },
        chords: { 0: [50, 57, 60, 65], 24: [53, 60, 63, 68], 48: [55, 62, 65, 70] },
        bass: { 0: 38, 18: 41, 36: 43, 54: 38 },
        drums: { 0: 'B', 36: 'H' },
      },
    ],
  },
  cairoRedLantern: {
    id: 'cairoRedLantern', engine: 'structured', label: 'Cairo · farol rojo 01:37',
    description: 'Qanun, trompeta apagada y Rhodes con un pulso más vivo: calle nocturna, café lleno y una partida que ya se calentó.',
    stepMs: 108, stepsPerSection: 64, longFormMs: 330000, leadInstrument: 'qanun', counterInstrument: 'mutedHorn', chordInstrument: 'epiano', bassInstrument: 'bass',
    sections: [
      {
        lead: { 0: 62, 4: 63, 7: 66, 10: 67, 14: 69, 18: 67, 21: 66, 24: 63, 28: 62, 32: 66, 36: 69, 39: 70, 42: 69, 46: 66, 50: 63, 55: 61.5, 60: 62 },
        counter: { 12: 74, 26: 70, 44: 72, 58: 69 },
        chords: { 0: [50, 57, 60, 64], 16: [51, 57, 60, 66], 32: [55, 60, 64, 69], 48: [50, 57, 61, 64] },
        bass: { 0: 38, 4: 45, 8: 50, 12: 45, 16: 39, 20: 46, 24: 51, 28: 46, 32: 43, 36: 50, 40: 55, 44: 50, 48: 38, 52: 45, 56: 49, 60: 45 },
        drums: { 0: 'K', 4: 'H', 8: 'W', 12: 'H', 16: 'K', 20: 'H', 24: 'S', 28: 'H', 32: 'K', 36: 'H', 40: 'W', 44: 'H', 48: 'K', 52: 'H', 56: 'S', 60: 'H' },
      },
      {
        leadInstrument: 'mutedHorn', counterInstrument: 'qanun',
        lead: { 2: 69, 7: 70, 12: 74, 17: 72, 22: 69, 27: 67, 32: 66, 37: 69, 42: 72, 47: 74, 52: 70, 57: 67, 62: 66 },
        counter: { 5: 62, 15: 66, 25: 63, 35: 66, 45: 69, 55: 63 },
        chords: { 0: [53, 57, 60, 64], 16: [55, 59, 62, 66], 32: [50, 57, 60, 64], 48: [46, 53, 57, 62] },
        bass: { 0: 41, 4: 48, 8: 53, 12: 48, 16: 43, 20: 50, 24: 55, 28: 50, 32: 38, 36: 45, 40: 50, 44: 45, 48: 34, 52: 41, 56: 46, 60: 41 },
        drums: { 0: 'K', 3: 'H', 8: 'S', 11: 'H', 16: 'K', 19: 'H', 24: 'W', 27: 'H', 32: 'K', 35: 'H', 40: 'S', 43: 'H', 48: 'K', 51: 'H', 56: 'W', 59: 'H' },
      },
      {
        lead: { 0: 74, 3: 73, 6: 70, 10: 69, 13: 66, 17: 69, 20: 70, 24: 74, 28: 77, 32: 74, 35: 70, 39: 69, 43: 66, 47: 63, 51: 66, 55: 69, 59: 67, 63: 62 },
        counter: { 8: 62, 22: 67, 38: 66, 54: 63 },
        chords: { 0: [55, 60, 64, 69], 16: [53, 57, 60, 64], 32: [51, 57, 60, 66], 48: [50, 57, 60, 64] },
        bass: { 0: 43, 4: 50, 8: 55, 12: 50, 16: 41, 20: 48, 24: 53, 28: 48, 32: 39, 36: 46, 40: 51, 44: 46, 48: 38, 52: 45, 56: 50, 60: 45 },
        drums: { 0: 'K', 4: 'H', 8: 'S', 12: 'H', 16: 'K', 20: 'H', 24: 'W', 28: 'H', 32: 'K', 36: 'H', 40: 'S', 44: 'H', 48: 'K', 52: 'H', 56: 'W', 60: 'H' },
      },
      {
        leadInstrument: 'mutedHorn', counterInstrument: 'qanun',
        lead: { 4: 72, 12: 70, 20: 69, 28: 66, 36: 69, 44: 67, 52: 63.5, 60: 62 },
        counter: { 8: 62, 24: 66, 40: 63, 56: 61.5 },
        chords: { 0: [50, 57, 60, 64], 16: [46, 53, 57, 62], 32: [55, 60, 64, 69], 48: [50, 57, 61, 64] },
        bass: { 0: 38, 8: 45, 16: 34, 24: 41, 32: 43, 40: 50, 48: 38, 56: 45 },
        drums: { 0: 'K', 8: 'W', 16: 'K', 24: 'S', 32: 'K', 40: 'W', 48: 'K', 56: 'S' },
      },
    ],
  },
  beirutNightTaxi: {
    id: 'beirutNightTaxi', engine: 'structured', label: 'Beirut · taxi nocturno 02:18',
    description: 'Buzuq y clarinete sobre bajo caminante y percusión seca: más calle, más movimiento y menos sillón de terciopelo.',
    stepMs: 102, stepsPerSection: 72, longFormMs: 345000, leadInstrument: 'buzuq', counterInstrument: 'clarinet', chordInstrument: 'epiano', bassInstrument: 'bass',
    sections: [
      {
        lead: { 0: 62, 3: 65, 6: 67, 9: 68, 12: 67, 15: 65, 18: 62, 21: 60, 24: 62, 27: 65, 30: 68, 33: 70, 36: 68, 39: 67, 42: 65, 45: 62, 48: 65, 51: 67, 54: 70, 57: 72, 60: 70, 63: 68, 66: 65, 69: 62 },
        counter: { 10: 74, 22: 72, 34: 75, 46: 72, 58: 74, 70: 68 },
        chords: { 0: [50, 57, 60, 65], 18: [53, 60, 63, 68], 36: [55, 62, 65, 70], 54: [51, 58, 62, 67] },
        bass: { 0: 38, 6: 45, 12: 50, 18: 41, 24: 48, 30: 53, 36: 43, 42: 50, 48: 55, 54: 39, 60: 46, 66: 51 },
        drums: { 0: 'K', 3: 'H', 6: 'W', 9: 'H', 12: 'S', 15: 'H', 18: 'K', 21: 'H', 24: 'W', 27: 'H', 30: 'S', 33: 'H', 36: 'K', 39: 'H', 42: 'W', 45: 'H', 48: 'S', 51: 'H', 54: 'K', 57: 'H', 60: 'W', 63: 'H', 66: 'S', 69: 'H' },
      },
      {
        leadInstrument: 'clarinet', counterInstrument: 'buzuq',
        lead: { 1: 69, 5: 72, 9: 74, 14: 72, 18: 69, 23: 67, 28: 65, 32: 67, 37: 70, 41: 74, 46: 75, 50: 72, 55: 70, 59: 67, 64: 65, 68: 62 },
        counter: { 3: 58, 12: 62, 21: 65, 30: 62, 39: 67, 48: 65, 57: 62, 66: 58 },
        chords: { 0: [53, 60, 63, 68], 18: [50, 57, 60, 65], 36: [48, 55, 58, 63], 54: [55, 62, 65, 70] },
        bass: { 0: 41, 6: 48, 12: 53, 18: 38, 24: 45, 30: 50, 36: 36, 42: 43, 48: 48, 54: 43, 60: 50, 66: 55 },
        drums: { 0: 'K', 6: 'W', 12: 'S', 18: 'K', 24: 'W', 30: 'S', 36: 'K', 42: 'W', 48: 'S', 54: 'K', 60: 'W', 66: 'S' },
      },
      {
        lead: { 0: 70, 4: 72, 8: 75, 12: 77, 16: 75, 20: 72, 24: 70, 28: 68, 32: 65, 36: 68, 40: 70, 44: 72, 48: 75, 52: 72, 56: 70, 60: 68, 64: 65, 68: 62 },
        counter: { 6: 62, 18: 65, 30: 68, 42: 67, 54: 65, 66: 62 },
        chords: { 0: [55, 62, 65, 70], 18: [53, 60, 63, 68], 36: [50, 57, 60, 65], 54: [51, 58, 62, 67] },
        bass: { 0: 43, 3: 50, 6: 55, 9: 50, 12: 41, 15: 48, 18: 53, 21: 48, 24: 38, 27: 45, 30: 50, 33: 45, 36: 39, 39: 46, 42: 51, 45: 46, 48: 43, 51: 50, 54: 55, 57: 50, 60: 38, 63: 45, 66: 50, 69: 45 },
        drums: { 0: 'K', 3: 'H', 6: 'W', 9: 'H', 12: 'S', 15: 'H', 18: 'K', 21: 'H', 24: 'W', 27: 'H', 30: 'S', 33: 'H', 36: 'K', 39: 'H', 42: 'W', 45: 'H', 48: 'S', 51: 'H', 54: 'K', 57: 'H', 60: 'W', 63: 'H', 66: 'S', 69: 'H' },
      },
      {
        leadInstrument: 'clarinet', counterInstrument: 'buzuq',
        lead: { 6: 74, 18: 72, 30: 70, 42: 68, 54: 65, 66: 62 },
        counter: { 12: 58, 24: 62, 48: 60, 60: 58 },
        chords: { 0: [50, 57, 60, 65], 24: [53, 60, 63, 68], 48: [55, 62, 65, 70] },
        bass: { 0: 38, 12: 45, 24: 41, 36: 48, 48: 43, 60: 38 },
        drums: { 0: 'K', 12: 'W', 24: 'K', 36: 'S', 48: 'K', 60: 'W' },
      },
    ],
  },
  tangierRedTable: {
    id: 'tangierRedTable', engine: 'structured', label: 'Tánger · mesa roja',
    description: 'Oud, vibráfono y contrabajo con un groove ladeado de club: humo, fichas, vasos y demasiada confianza.',
    stepMs: 116, stepsPerSection: 64, longFormMs: 325000, leadInstrument: 'oudJazz', counterInstrument: 'vibes', chordInstrument: 'epiano', bassInstrument: 'bass',
    sections: [
      {
        lead: { 0: 64, 5: 67, 9: 70, 13: 69, 17: 67, 21: 64, 25: 62, 29: 64, 33: 67, 37: 70, 41: 72, 45: 70, 49: 67, 53: 65, 57: 64, 61: 62 },
        counter: { 7: 76, 19: 74, 31: 72, 43: 76, 55: 72 },
        chords: { 0: [52, 59, 62, 67], 16: [50, 57, 60, 65], 32: [55, 62, 65, 70], 48: [53, 60, 63, 68] },
        bass: { 0: 40, 4: 47, 8: 52, 12: 47, 16: 38, 20: 45, 24: 50, 28: 45, 32: 43, 36: 50, 40: 55, 44: 50, 48: 41, 52: 48, 56: 53, 60: 48 },
        drums: { 0: 'K', 4: 'H', 7: 'W', 12: 'S', 16: 'K', 20: 'H', 23: 'W', 28: 'S', 32: 'K', 36: 'H', 39: 'W', 44: 'S', 48: 'K', 52: 'H', 55: 'W', 60: 'S' },
      },
      {
        leadInstrument: 'vibes', counterInstrument: 'oudJazz',
        lead: { 2: 72, 6: 76, 11: 74, 15: 72, 20: 69, 24: 67, 29: 69, 34: 72, 38: 76, 43: 77, 47: 74, 52: 72, 56: 69, 61: 67 },
        counter: { 4: 60, 14: 64, 26: 62, 36: 65, 50: 64, 58: 60 },
        chords: { 0: [55, 62, 65, 70], 16: [53, 60, 63, 68], 32: [50, 57, 60, 65], 48: [52, 59, 62, 67] },
        bass: { 0: 43, 4: 50, 8: 55, 12: 50, 16: 41, 20: 48, 24: 53, 28: 48, 32: 38, 36: 45, 40: 50, 44: 45, 48: 40, 52: 47, 56: 52, 60: 47 },
        drums: { 0: 'K', 6: 'W', 12: 'S', 16: 'K', 22: 'W', 28: 'S', 32: 'K', 38: 'W', 44: 'S', 48: 'K', 54: 'W', 60: 'S' },
      },
      {
        lead: { 0: 67, 3: 70, 6: 72, 10: 74, 14: 72, 18: 70, 22: 67, 26: 65, 30: 64, 34: 67, 38: 70, 42: 74, 46: 77, 50: 74, 54: 72, 58: 69, 62: 67 },
        counter: { 8: 76, 20: 74, 32: 72, 44: 76, 56: 74 },
        chords: { 0: [53, 60, 63, 68], 16: [55, 62, 65, 70], 32: [52, 59, 62, 67], 48: [50, 57, 60, 65] },
        bass: { 0: 41, 4: 48, 8: 53, 12: 48, 16: 43, 20: 50, 24: 55, 28: 50, 32: 40, 36: 47, 40: 52, 44: 47, 48: 38, 52: 45, 56: 50, 60: 45 },
        drums: { 0: 'K', 4: 'H', 8: 'W', 12: 'S', 16: 'K', 20: 'H', 24: 'W', 28: 'S', 32: 'K', 36: 'H', 40: 'W', 44: 'S', 48: 'K', 52: 'H', 56: 'W', 60: 'S' },
      },
      {
        leadInstrument: 'vibes', counterInstrument: 'oudJazz',
        lead: { 4: 76, 12: 74, 20: 72, 28: 69, 36: 72, 44: 70, 52: 67, 60: 64 },
        counter: { 8: 60, 24: 64, 40: 62, 56: 60 },
        chords: { 0: [52, 59, 62, 67], 16: [50, 57, 60, 65], 32: [55, 62, 65, 70], 48: [53, 60, 63, 68] },
        bass: { 0: 40, 8: 47, 16: 38, 24: 45, 32: 43, 40: 50, 48: 41, 56: 48 },
        drums: { 0: 'K', 8: 'W', 16: 'K', 24: 'S', 32: 'K', 40: 'W', 48: 'K', 56: 'S' },
      },
    ],
  },
  istanbulBackgammon: {
    id: 'istanbulBackgammon', engine: 'structured', label: 'Estambul · tavla 03:08',
    description: 'Clarinete y qanun sobre un 9/8 grave y caminante: tavla al fondo, bajo con cuerpo y melodía que respira.',
    stepMs: 116, stepsPerSection: 72, longFormMs: 340000, leadInstrument: 'clarinet', counterInstrument: 'qanun', chordInstrument: 'epiano', bassInstrument: 'bass',
    sections: [
      {
        lead: { 0: 69, 4: 72, 8: 73, 12: 72, 16: 69, 20: 67, 24: 69, 28: 72, 32: 76, 36: 73, 40: 72, 44: 69, 48: 67, 52: 65, 56: 67, 60: 69, 64: 72, 68: 69 },
        counter: { 6: 61, 14: 64, 22: 67, 30: 64, 38: 61, 46: 64, 54: 67, 62: 64, 70: 61 },
        chords: { 0: [50, 57, 61, 64], 18: [53, 60, 64, 67], 36: [55, 62, 65, 69], 54: [48, 55, 59, 62] },
        bass: { 0: 38, 3: 45, 6: 50, 9: 45, 12: 41, 15: 48, 18: 53, 21: 48, 24: 43, 27: 50, 30: 55, 33: 50, 36: 36, 39: 43, 42: 48, 45: 43, 48: 40, 51: 47, 54: 52, 57: 47, 60: 38, 63: 45, 66: 50, 69: 45 },
        drums: { 0: 'K', 3: 'H', 6: 'W', 9: 'H', 12: 'S', 15: 'H', 18: 'K', 21: 'H', 24: 'W', 27: 'H', 30: 'S', 33: 'H', 36: 'K', 39: 'H', 42: 'W', 45: 'H', 48: 'S', 51: 'H', 54: 'K', 57: 'H', 60: 'W', 63: 'H', 66: 'S', 69: 'H' },
      },
      {
        leadInstrument: 'qanun', counterInstrument: 'clarinet',
        lead: { 2: 61, 5: 64, 8: 67, 11: 69, 14: 67, 17: 64, 20: 61, 23: 59, 26: 61, 29: 64, 32: 67, 35: 71, 38: 69, 41: 67, 44: 64, 47: 61, 50: 64, 53: 67, 56: 69, 59: 72, 62: 69, 65: 67, 68: 64, 71: 61 },
        counter: { 10: 74, 22: 72, 34: 76, 46: 74, 58: 72, 70: 69 },
        chords: { 0: [53, 60, 64, 67], 18: [50, 57, 61, 64], 36: [48, 55, 59, 62], 54: [55, 62, 65, 69] },
        bass: { 0: 41, 6: 48, 12: 53, 18: 38, 24: 45, 30: 50, 36: 36, 42: 43, 48: 48, 54: 43, 60: 50, 66: 55 },
        drums: { 0: 'K', 6: 'W', 12: 'S', 18: 'K', 24: 'W', 30: 'S', 36: 'K', 42: 'W', 48: 'S', 54: 'K', 60: 'W', 66: 'S' },
      },
      {
        lead: { 0: 72, 3: 73, 6: 76, 9: 78, 12: 76, 15: 73, 18: 72, 21: 69, 24: 67, 27: 69, 30: 72, 33: 73, 36: 76, 39: 80, 42: 78, 45: 76, 48: 73, 51: 72, 54: 69, 57: 67, 60: 69, 63: 72, 66: 69, 69: 67 },
        counter: { 6: 61, 18: 64, 30: 67, 42: 64, 54: 61, 66: 64 },
        chords: { 0: [55, 62, 65, 69], 18: [53, 60, 64, 67], 36: [50, 57, 61, 64], 54: [48, 55, 59, 62] },
        bass: { 0: 43, 3: 50, 6: 55, 9: 50, 12: 41, 15: 48, 18: 53, 21: 48, 24: 38, 27: 45, 30: 50, 33: 45, 36: 40, 39: 47, 42: 52, 45: 47, 48: 36, 51: 43, 54: 48, 57: 43, 60: 38, 63: 45, 66: 50, 69: 45 },
        drums: { 0: 'K', 3: 'H', 6: 'W', 9: 'H', 12: 'S', 15: 'H', 18: 'K', 21: 'H', 24: 'W', 27: 'H', 30: 'S', 33: 'H', 36: 'K', 39: 'H', 42: 'W', 45: 'H', 48: 'S', 51: 'H', 54: 'K', 57: 'H', 60: 'W', 63: 'H', 66: 'S', 69: 'H' },
      },
      {
        leadInstrument: 'qanun', counterInstrument: 'clarinet',
        lead: { 6: 69, 18: 67, 30: 64, 42: 67, 54: 64, 66: 61 },
        counter: { 12: 74, 36: 72, 60: 69 },
        chords: { 0: [50, 57, 61, 64], 24: [53, 60, 64, 67], 48: [55, 62, 65, 69] },
        bass: { 0: 38, 12: 45, 24: 41, 36: 48, 48: 43, 60: 38 },
        drums: { 0: 'K', 12: 'W', 24: 'K', 36: 'S', 48: 'K', 60: 'W' },
      },
    ],
  },
  machineRoom: {
    id: 'machineRoom', engine: 'structured', label: 'Sala de máquinas',
    description: 'Metal, subgrave y patrones industriales contenidos. Algo enorme está funcionando detrás de la pared.',
    stepMs: 104, stepsPerSection: 32, leadInstrument: 'metallic', chordInstrument: 'pad', bassInstrument: 'synthbass',
    sections: [
      {
        lead: { 0: 52, 6: 55, 12: 59, 18: 58, 24: 55, 30: 52 },
        chords: { 0: [40, 47, 52], 16: [39, 46, 51] },
        bass: { 0: 28, 4: 28, 8: 31, 12: 28, 16: 27, 20: 27, 24: 34, 28: 31 },
        drums: { 0: 'M', 4: 'K', 8: 'M', 12: 'S', 16: 'M', 20: 'K', 24: 'M', 28: 'S' },
      },
    ],
  },
});

// Bloque menos contemplativo: costa andalusí (oud + guitarra)
// y chill-jazz luminoso con vibráfono/Rhodes. Inspiración de atmósfera, no
// melodías ajenas: material original generado por este motor.
Object.assign(AMBIENT_THEMES, {
  andalusianCoast: {
    id: 'andalusianCoast', engine: 'structured', label: 'Costa andalusí · tarde clara',
    description: 'Oud y guitarra española imaginaria sobre bajo caminante y percusión ligera; cálido, melódico y con más paso que los temas de madrugada.',
    stepMs: 138, stepsPerSection: 64, longFormMs: 330000, leadInstrument: 'guitar2', counterInstrument: 'oudJazz', chordInstrument: 'epiano', bassInstrument: 'bass',
    sections: [
      { lead:{0:64,4:67,8:69,12:71,16:69,20:67,24:64,28:62,32:64,36:67,40:71,44:72,48:71,52:69,56:67,60:64}, counter:{6:76,14:74,22:72,30:69,38:76,46:74,54:72,62:69}, chords:{0:[52,57,60,64],16:[55,59,62,67],32:[50,57,60,65],48:[53,57,60,65]}, bass:{0:40,4:47,8:52,12:47,16:43,20:50,24:55,28:50,32:38,36:45,40:50,44:45,48:41,52:48,56:53,60:48}, drums:{0:'K',4:'H',8:'W',12:'H',16:'S',20:'H',24:'W',28:'H',32:'K',36:'H',40:'W',44:'H',48:'S',52:'H',56:'W',60:'H'} },
      { leadInstrument:'oudJazz', counterInstrument:'guitar2', lead:{2:64,6:67,10:71,14:72,18:74,22:72,26:69,30:67,34:64,38:67,42:69,46:71,50:74,54:76,58:72,62:69}, counter:{8:57,16:60,24:62,32:60,40:57,48:60,56:62}, chords:{0:[57,60,64,69],16:[52,57,60,64],32:[55,59,62,67],48:[50,57,60,65]}, bass:{0:45,8:40,16:40,24:47,32:43,40:50,48:38,56:45}, drums:{0:'K',6:'H',12:'W',18:'H',24:'S',30:'H',36:'W',42:'H',48:'K',54:'H',60:'S'} },
      { lead:{0:69,5:71,10:74,15:76,20:74,25:71,30:69,35:67,40:69,45:72,50:74,55:77,60:76}, counter:{7:81,19:79,31:76,43:74,55:72}, chords:{0:[53,57,60,65],16:[55,59,62,67],32:[57,60,64,69],48:[50,57,60,65]}, bass:{0:41,4:48,8:53,12:48,16:43,20:50,24:55,28:50,32:45,36:52,40:57,44:52,48:38,52:45,56:50,60:45}, drums:{0:'K',4:'H',8:'W',12:'H',16:'S',20:'H',24:'W',28:'H',32:'K',36:'H',40:'W',44:'H',48:'S',52:'H',56:'W',60:'H'} },
      { lead:{4:72,12:71,20:69,28:67,36:64,44:67,52:64,60:62}, counter:{10:76,26:74,42:72,58:69}, chords:{0:[52,57,60,64],24:[55,59,62,67],48:[50,57,60,65]}, bass:{0:40,16:43,32:38,48:40}, drums:{0:'K',16:'H',32:'W',48:'H'} },
    ],
  },
  granadaPatio: {
    id: 'granadaPatio', engine: 'structured', label: 'Granada · patio encendido',
    description: 'Guitarra seca, qanun y oud en diálogo; palmas sugeridas con madera y una melodía que entra y sale del patio.',
    stepMs: 132, stepsPerSection: 64, longFormMs: 320000, leadInstrument: 'oudJazz', counterInstrument: 'guitar2', chordInstrument: 'felt', bassInstrument: 'bass',
    sections: [
      {lead:{0:62,3:65,6:67,9:69,12:72,15:69,18:67,21:65,24:62,27:65,30:67,33:70,36:69,39:67,42:65,45:62,48:65,51:69,54:72,57:74,60:72},counter:{6:74,18:72,30:77,42:74,54:72},chords:{0:[50,57,60,65],16:[53,57,60,65],32:[55,62,65,69],48:[50,57,60,65]},bass:{0:38,8:45,16:41,24:48,32:43,40:50,48:38,56:45},drums:{0:'W',4:'H',8:'K',12:'H',16:'W',20:'H',24:'S',28:'H',32:'W',36:'H',40:'K',44:'H',48:'W',52:'H',56:'S',60:'H'}},
      {leadInstrument:'guitar2',counterInstrument:'qanun',lead:{1:65,5:67,9:70,13:72,17:74,21:72,25:69,29:67,33:65,37:67,41:70,45:74,49:77,53:74,57:72,61:69},counter:{11:79,23:77,35:74,47:72,59:70},chords:{0:[53,57,60,65],16:[50,57,60,65],32:[57,60,64,69],48:[55,62,65,69]},bass:{0:41,4:48,8:53,12:48,16:38,20:45,24:50,28:45,32:45,36:52,40:57,44:52,48:43,52:50,56:55,60:50},drums:{0:'W',4:'H',8:'K',12:'H',16:'W',20:'H',24:'S',28:'H',32:'W',36:'H',40:'K',44:'H',48:'W',52:'H',56:'S',60:'H'}},
      {lead:{0:69,6:72,12:74,18:77,24:74,30:72,36:69,42:67,48:65,54:69,60:62},counter:{9:60,21:64,33:67,45:64,57:60},chords:{0:[57,60,64,69],16:[55,62,65,69],32:[53,57,60,65],48:[50,57,60,65]},bass:{0:45,8:43,16:41,24:38,32:43,40:41,48:38,56:45},drums:{0:'W',6:'H',12:'K',18:'H',24:'S',30:'H',36:'W',42:'H',48:'K',54:'H',60:'S'}},
      {lead:{8:74,20:72,32:69,44:67,56:62},counter:{14:77,38:74},chords:{0:[50,57,60,65],24:[53,57,60,65],48:[55,62,65,69]},bass:{0:38,24:41,48:43},drums:{0:'W',24:'H',48:'W'}},
    ],
  },
  cadizLanterns: {
    id:'cadizLanterns', engine:'structured', label:'Cádiz · faroles al viento',
    description:'Oud brillante, guitarra y clarinete sobre un 6/8 ligero; costero, nocturno y bastante menos somnífero.',
    stepMs:126, stepsPerSection:72, longFormMs:340000, leadInstrument:'guitar2', counterInstrument:'clarinet', chordInstrument:'epiano', bassInstrument:'bass',
    sections:[
      {lead:{0:64,6:67,12:69,18:71,24:72,30:71,36:69,42:67,48:64,54:67,60:69,66:72},counter:{9:76,21:74,33:72,45:71,57:69,69:67},chords:{0:[52,57,60,64],18:[55,59,62,67],36:[57,60,64,69],54:[50,57,60,65]},bass:{0:40,6:47,12:52,18:43,24:50,30:55,36:45,42:52,48:57,54:38,60:45,66:50},drums:{0:'K',6:'W',12:'S',18:'K',24:'W',30:'S',36:'K',42:'W',48:'S',54:'K',60:'W',66:'S'}},
      {leadInstrument:'oudJazz',counterInstrument:'guitar2',lead:{3:67,9:71,15:74,21:76,27:74,33:71,39:69,45:67,51:69,57:72,63:74,69:67},counter:{12:60,30:64,48:62,66:60},chords:{0:[55,59,62,67],18:[52,57,60,64],36:[50,57,60,65],54:[57,60,64,69]},bass:{0:43,9:50,18:40,27:47,36:38,45:45,54:45,63:52},drums:{0:'K',6:'H',12:'W',18:'S',24:'H',30:'W',36:'K',42:'H',48:'W',54:'S',60:'H',66:'W'}},
      {lead:{0:72,6:74,12:77,18:79,24:77,30:74,36:72,42:69,48:67,54:69,60:72,66:64},counter:{9:79,27:76,45:74,63:72},chords:{0:[57,60,64,69],18:[55,59,62,67],36:[53,57,60,65],54:[50,57,60,65]},bass:{0:45,6:52,12:57,18:43,24:50,30:55,36:41,42:48,48:53,54:38,60:45,66:50},drums:{0:'K',6:'W',12:'S',18:'K',24:'W',30:'S',36:'K',42:'W',48:'S',54:'K',60:'W',66:'S'}},
      {lead:{6:76,18:74,30:72,42:69,54:67,66:64},counter:{12:60,36:62,60:60},chords:{0:[52,57,60,64],24:[55,59,62,67],48:[50,57,60,65]},bass:{0:40,24:43,48:38},drums:{0:'K',24:'W',48:'K'}},
    ],
  },
  terraceFireflies: {
    id:'terraceFireflies', engine:'structured', label:'Luciérnagas en la terraza',
    description:'Vibráfono, Rhodes, clarinete y contrabajo: chill jazz luminoso, con swing suave y frases que se contestan sin ponerse solemnes.',
    stepMs:142, stepsPerSection:64, longFormMs:350000, leadInstrument:'vibes', counterInstrument:'clarinet', chordInstrument:'epiano', bassInstrument:'bass',
    sections:[
      {lead:{0:67,4:71,8:74,12:76,16:74,20:71,24:69,28:67,32:69,36:72,40:74,44:77,48:76,52:74,56:71,60:67},counter:{6:79,14:77,22:74,30:72,38:79,46:77,54:74,62:72},chords:{0:[55,59,62,67],16:[52,57,60,64],32:[57,60,64,69],48:[53,57,60,64]},bass:{0:43,4:47,8:50,12:47,16:40,20:47,24:52,28:47,32:45,36:48,40:52,44:48,48:41,52:45,56:48,60:45},drums:{0:'B',4:'H',8:'B',12:'H',16:'B',20:'H',24:'B',28:'H',32:'B',36:'H',40:'B',44:'H',48:'B',52:'H',56:'B',60:'H'}},
      {leadInstrument:'clarinet',counterInstrument:'vibes',lead:{2:69,7:72,12:74,17:77,22:76,27:74,32:72,37:69,42:67,47:69,52:72,57:74,62:67},counter:{10:81,26:79,42:76,58:74},chords:{0:[52,57,60,64],16:[55,59,62,67],32:[50,55,59,62],48:[57,60,64,69]},bass:{0:40,8:47,16:43,24:50,32:38,40:45,48:45,56:52},drums:{0:'B',6:'H',12:'B',18:'H',24:'B',30:'H',36:'B',42:'H',48:'B',54:'H',60:'B'}},
      {lead:{0:74,5:77,10:79,15:81,20:79,25:77,30:74,35:72,40:69,45:72,50:74,55:77,60:69},counter:{8:67,20:71,32:69,44:67,56:64},chords:{0:[57,60,64,69],16:[55,59,62,67],32:[53,57,60,64],48:[50,55,59,62]},bass:{0:45,4:48,8:52,12:48,16:43,20:47,24:50,28:47,32:41,36:45,40:48,44:45,48:38,52:45,56:50,60:45},drums:{0:'B',4:'H',8:'B',12:'H',16:'B',20:'H',24:'B',28:'H',32:'B',36:'H',40:'B',44:'H',48:'B',52:'H',56:'B',60:'H'}},
      {lead:{8:79,20:76,32:74,44:72,56:67},counter:{14:83,38:79},chords:{0:[55,59,62,67],24:[52,57,60,64],48:[57,60,64,69]},bass:{0:43,24:40,48:45},drums:{0:'B',16:'H',32:'B',48:'H'}},
    ],
  },
  cafeFirelight: {
    id:'cafeFirelight', engine:'structured', label:'Café · luces pequeñas',
    description:'Rhodes, guitarra limpia y trompeta apagada con brushes: jazz de café sereno pero con pulso, más sonrisa que funeral.',
    stepMs:148, stepsPerSection:64, longFormMs:330000, leadInstrument:'mutedHorn', counterInstrument:'guitar2', chordInstrument:'epiano', bassInstrument:'bass',
    sections:[
      {lead:{4:65,10:68,16:70,22:72,28:70,34:68,40:65,46:63,52:65,58:68},counter:{8:57,20:60,32:59,44:57,56:60},chords:{0:[53,57,60,64],16:[50,57,60,65],32:[55,59,62,67],48:[52,57,60,64]},bass:{0:41,8:45,16:38,24:45,32:43,40:47,48:40,56:47},drums:{0:'B',8:'H',16:'B',24:'H',32:'B',40:'H',48:'B',56:'H'}},
      {leadInstrument:'guitar2',counterInstrument:'mutedHorn',lead:{2:65,6:68,10:70,14:73,18:75,22:73,26:70,30:68,34:65,38:68,42:70,46:73,50:77,54:73,58:70,62:65},counter:{12:77,28:75,44:73,60:70},chords:{0:[50,57,60,65],16:[53,57,60,64],32:[57,60,64,69],48:[55,59,62,67]},bass:{0:38,4:45,8:50,12:45,16:41,20:48,24:53,28:48,32:45,36:52,40:57,44:52,48:43,52:50,56:55,60:50},drums:{0:'B',4:'H',8:'B',12:'H',16:'B',20:'H',24:'B',28:'H',32:'B',36:'H',40:'B',44:'H',48:'B',52:'H',56:'B',60:'H'}},
      {lead:{0:70,6:73,12:75,18:77,24:75,30:73,36:70,42:68,48:65,54:68,60:63},counter:{9:74,21:72,33:70,45:68,57:65},chords:{0:[57,60,64,69],16:[55,59,62,67],32:[53,57,60,64],48:[50,57,60,65]},bass:{0:45,8:43,16:41,24:38,32:43,40:40,48:38,56:45},drums:{0:'B',6:'H',12:'B',18:'H',24:'B',30:'H',36:'B',42:'H',48:'B',54:'H',60:'B'}},
      {lead:{8:75,20:73,32:70,44:68,56:65},counter:{14:79,38:75},chords:{0:[53,57,60,64],24:[50,57,60,65],48:[55,59,62,67]},bass:{0:41,24:38,48:43},drums:{0:'B',16:'H',32:'B',48:'H'}},
    ],
  },
  malagaLastTram: {
    id:'malagaLastTram', engine:'structured', label:'Málaga · último tranvía',
    description:'Guitarra, oud y vibráfono con un bajo que camina sin prisa; mediterráneo, elegante y claramente despierto.',
    stepMs:134, stepsPerSection:64, longFormMs:340000, leadInstrument:'guitar2', counterInstrument:'vibes', chordInstrument:'epiano', bassInstrument:'bass',
    sections:[
      {lead:{0:64,4:67,8:71,12:72,16:71,20:67,24:64,28:62,32:64,36:67,40:69,44:72,48:74,52:72,56:69,60:64},counter:{6:76,18:79,30:76,42:74,54:72},chords:{0:[52,57,60,64],16:[55,59,62,67],32:[50,57,60,65],48:[57,60,64,69]},bass:{0:40,4:47,8:52,12:47,16:43,20:50,24:55,28:50,32:38,36:45,40:50,44:45,48:45,52:52,56:57,60:52},drums:{0:'K',4:'H',8:'B',12:'H',16:'S',20:'H',24:'B',28:'H',32:'K',36:'H',40:'B',44:'H',48:'S',52:'H',56:'B',60:'H'}},
      {leadInstrument:'oudJazz',counterInstrument:'guitar2',lead:{2:67,7:69,12:72,17:74,22:76,27:74,32:72,37:69,42:67,47:69,52:72,57:74,62:67},counter:{10:60,26:64,42:62,58:60},chords:{0:[55,59,62,67],16:[52,57,60,64],32:[57,60,64,69],48:[50,57,60,65]},bass:{0:43,8:50,16:40,24:47,32:45,40:52,48:38,56:45},drums:{0:'K',6:'H',12:'B',18:'H',24:'S',30:'H',36:'B',42:'H',48:'K',54:'H',60:'S'}},
      {lead:{0:72,5:74,10:77,15:79,20:77,25:74,30:72,35:69,40:67,45:69,50:72,55:76,60:69},counter:{8:81,20:79,32:76,44:74,56:72},chords:{0:[57,60,64,69],16:[55,59,62,67],32:[53,57,60,64],48:[50,57,60,65]},bass:{0:45,4:52,8:57,12:52,16:43,20:50,24:55,28:50,32:41,36:48,40:53,44:48,48:38,52:45,56:50,60:45},drums:{0:'K',4:'H',8:'B',12:'H',16:'S',20:'H',24:'B',28:'H',32:'K',36:'H',40:'B',44:'H',48:'S',52:'H',56:'B',60:'H'}},
      {lead:{8:77,20:74,32:72,44:69,56:64},counter:{14:81,38:77},chords:{0:[52,57,60,64],24:[55,59,62,67],48:[50,57,60,65]},bass:{0:40,24:43,48:38},drums:{0:'K',16:'H',32:'B',48:'H'}},
    ],
  },
});


// Segundo bloque de estilos: deliberadamente no mediterráneo.
// Aquí no cambiamos sólo el timbre: cambian métrica implícita, densidad,
// función del bajo y presencia/ausencia de percusión para ampliar el catálogo.
Object.assign(AMBIENT_THEMES, {
  zugzwangWaltz: {
    id: 'zugzwangWaltz', engine: 'structured', label: 'Vals del zugzwang',
    description: 'Piano de salón en tres, cello y silencios incómodos: elegante hasta que toca mover.',
    stepMs: 178, stepsPerSection: 24, leadInstrument: 'felt', chordInstrument: 'felt', bassInstrument: 'cello',
    sections: [
      { lead: {0:69,4:72,8:76,12:74,16:71,20:67}, chords: {0:[57,60,64],8:[55,59,62],16:[53,57,60]}, bass: {0:45,8:43,16:41}, drums: {0:'W',8:'W',16:'W'} },
      { lead: {0:72,4:76,8:79,12:77,16:74,20:69}, chords: {0:[60,64,67],8:[57,62,65],16:[55,59,64]}, bass: {0:48,8:45,16:43}, drums: {0:'W',8:'W',16:'W'} },
    ],
  },
  bishopBlues: {
    id: 'bishopBlues', engine: 'structured', label: 'Blues del alfil',
    description: 'Rhodes, contrabajo, trompeta apagada y escobillas; doce compases con diagonales largas.',
    stepMs: 132, stepsPerSection: 48, leadInstrument: 'mutedHorn', chordInstrument: 'rhodesWarm', bassInstrument: 'uprightBass',
    sections: [
      { lead: {2:67,8:70,14:72,20:70,26:67,32:65,38:63,44:67}, chords: {0:[48,55,58,62],16:[53,57,60,64],32:[50,57,60,65]}, bass: {0:36,4:43,8:46,12:47,16:41,20:48,24:50,28:52,32:38,36:45,40:48,44:50}, drums: {0:'B',6:'H',12:'B',18:'H',24:'B',30:'H',36:'B',42:'H'} },
      { lead: {4:70,10:72,16:74,22:72,28:69,34:67,40:65,46:63}, chords: {0:[53,57,60,64],16:[48,55,58,62],32:[55,59,62,65]}, bass: {0:41,4:48,8:50,12:52,16:36,20:43,24:46,28:47,32:43,36:50,40:52,44:53}, drums: {0:'B',6:'H',12:'B',18:'H',24:'B',30:'H',36:'B',42:'H'} },
    ],
  },
  winterLibrary: {
    id: 'winterLibrary', engine: 'structured', label: 'Biblioteca bajo nieve',
    description: 'Fieltro, cello y una campana muy lejana. Sin batería; casi todo lo importante ocurre entre las notas.',
    stepMs: 285, stepsPerSection: 32, leadInstrument: 'felt', chordInstrument: 'felt', bassInstrument: 'cello',
    sections: [
      { lead: {4:72,14:67,25:69}, chords: {0:[48,55,60],16:[45,52,57]}, bass: {0:36,16:33} },
      { lead: {7:74,18:69,28:65}, chords: {0:[50,57,62],16:[46,53,58]}, bass: {0:38,16:34} },
    ],
  },
  analogBunker: {
    id: 'analogBunker', engine: 'structured', label: 'Búnker analógico',
    description: 'Secuenciador seco, bajo monofónico y golpes mecánicos: luces verdes, hormigón y cálculo frío.',
    stepMs: 96, stepsPerSection: 40, leadInstrument: 'pulse', chordInstrument: 'synth', bassInstrument: 'synthbass',
    sections: [
      { lead: {0:52,5:55,10:59,15:55,20:51,25:58,30:55,35:52}, chords: {}, bass: {0:28,4:28,8:31,12:28,16:27,20:27,24:34,28:31,32:28,36:27}, drums: {0:'K',5:'H',10:'S',15:'H',20:'K',25:'H',30:'S',35:'H'} },
      { lead: {0:55,4:58,9:63,14:58,20:54,24:61,29:58,34:55}, chords: {}, bass: {0:31,5:31,10:34,15:29,20:30,25:30,30:37,35:34}, drums: {0:'K',4:'H',9:'S',14:'H',20:'K',24:'H',29:'S',34:'H'} },
    ],
  },
  queenRequiem: {
    id: 'queenRequiem', engine: 'structured', label: 'Réquiem para una dama',
    description: 'Órgano grave y coro suspendido. Sin percusión; dedicado a todas las damas entregadas por un peón.',
    stepMs: 315, stepsPerSection: 32, leadInstrument: 'choir', chordInstrument: 'organ', bassInstrument: 'organbass',
    sections: [
      { lead: {10:67,26:65}, chords: {0:[45,52,57,60],16:[43,50,55,59]}, bass: {0:33,16:31} },
      { lead: {8:70,24:67}, chords: {0:[41,48,53,57],16:[38,45,50,55]}, bass: {0:29,16:26} },
    ],
  },
  nightFreight: {
    id: 'nightFreight', engine: 'structured', label: 'Mercancías 04:12',
    description: 'Pulso ferroviario, metal lejano y bajo obstinado; motorik nocturno sin postal mediterránea.',
    stepMs: 116, stepsPerSection: 48, leadInstrument: 'metallic', chordInstrument: 'pad', bassInstrument: 'synthbass',
    sections: [
      { lead: {7:64,19:67,31:63,43:70}, chords: {0:[52,59,64],24:[51,58,63]}, bass: {0:40,6:40,12:43,18:40,24:39,30:39,36:46,42:43}, drums: {0:'K',6:'H',12:'W',18:'H',24:'K',30:'H',36:'M',42:'H'} },
      { lead: {5:67,17:70,29:66,41:72}, chords: {0:[55,62,67],24:[53,60,65]}, bass: {0:43,6:43,12:46,18:41,24:41,30:41,36:48,42:45}, drums: {0:'K',6:'H',12:'W',18:'H',24:'K',30:'H',36:'M',42:'H'} },
    ],
  },
 });

// Expansión transversal del catálogo: SPA/zen, rock ambiental y
// clásica/cámara. Son composiciones originales del motor Web Audio; no se
// samplean ni reproducen obras externas.
Object.assign(AMBIENT_THEMES, {
  mistSpa: {
    id: 'mistSpa', genre: 'SPA / Zen', engine: 'structured', label: 'SPA · niebla de cedro',
    description: 'Flauta respirada, cuencos y colchones largos; casi sin pulso, pensada para calcular sin que el cerebro pida vacaciones.',
    stepMs: 290, stepsPerSection: 32, longFormMs: 360000, leadInstrument: 'breathFlute', chordInstrument: 'singingBowl', bassInstrument: 'pad',
    sections: [
      { lead:{4:72,13:76,23:69}, chords:{0:[55,62,67],16:[53,60,65]}, bass:{0:43,16:41} },
      { lead:{7:74,18:71,28:67}, chords:{0:[57,64,69],16:[50,57,62]}, bass:{0:45,16:38} },
      { lead:{5:76,15:72,26:69}, chords:{0:[52,59,64],16:[55,62,67]}, bass:{0:40,16:43} },
    ],
  },
  moonOnsen: {
    id: 'moonOnsen', genre: 'SPA / Zen', engine: 'structured', label: 'Onsen · agua de luna',
    description: 'Marimba de madera, cristal y aire; un spa nocturno que por alguna razón también tiene un tablero de ajedrez.',
    stepMs: 245, stepsPerSection: 40, longFormMs: 350000, leadInstrument: 'marimba', counterInstrument: 'breathFlute', chordInstrument: 'glass', bassInstrument: 'cello',
    sections: [
      { lead:{2:67,10:71,18:74,28:69,36:67}, counter:{14:79,32:76}, chords:{0:[55,62,67],20:[52,59,64]}, bass:{0:43,20:40}, drums:{8:'B',28:'B'} },
      { lead:{4:69,12:72,22:76,30:72,38:69}, counter:{17:81,35:77}, chords:{0:[57,64,69],20:[53,60,65]}, bass:{0:45,20:41}, drums:{10:'B',30:'B'} },
      { lead:{6:72,16:69,26:67,36:64}, counter:{20:76}, chords:{0:[52,59,64],20:[50,57,62]}, bass:{0:40,20:38} },
    ],
  },
  postRockMidnight: {
    id: 'postRockMidnight', genre: 'Ecléctica', engine: 'structured', label: 'Post-rock · medianoche',
    description: 'Guitarra con tremolo, bajo amplio y batería contenida; crece despacio y nunca se convierte en un solo de quince minutos.',
    stepMs: 112, stepsPerSection: 64, longFormMs: 380000, leadInstrument: 'tremolo', counterInstrument: 'guitar2', chordInstrument: 'pad', bassInstrument: 'bass',
    sections: [
      { lead:{0:64,8:67,16:71,24:69,32:64,40:72,48:71,56:67}, counter:{12:76,28:74,44:79,60:76}, chords:{0:[52,59,64],32:[50,57,62]}, bass:{0:40,8:47,16:43,24:47,32:38,40:45,48:43,56:45}, drums:{0:'K',8:'H',16:'S',24:'H',32:'K',40:'H',48:'S',56:'H'} },
      { lead:{0:67,6:71,12:74,18:76,24:74,30:71,36:69,42:67,48:69,54:72,60:67}, counter:{9:79,21:76,33:74,45:72,57:71}, chords:{0:[55,62,67],32:[53,60,65]}, bass:{0:43,8:50,16:47,24:50,32:41,40:48,48:45,56:48}, drums:{0:'K',8:'H',16:'S',24:'K',32:'K',40:'H',48:'S',56:'K'} },
      { leadInstrument:'overdriveGuitar', lead:{4:72,12:74,20:76,28:79,36:76,44:74,52:72,60:67}, counter:{8:64,24:67,40:69,56:67}, chords:{0:[57,64,69],32:[55,62,67]}, bass:{0:45,8:52,16:48,24:52,32:43,40:50,48:47,56:50}, drums:{0:'K',4:'H',8:'S',12:'H',16:'K',20:'H',24:'S',28:'H',32:'K',36:'H',40:'S',44:'H',48:'K',52:'H',56:'S',60:'H'} },
    ],
  },
  rookGarage: {
    id: 'rookGarage', genre: 'Ecléctica', engine: 'structured', label: 'Rock · garaje de la torre',
    description: 'Riff grave, bajo directo y caja seca. Más rock que ambient, pero todavía deja espacio para pensar antes de estrellar la dama.',
    stepMs: 94, stepsPerSection: 48, longFormMs: 330000, leadInstrument: 'overdriveGuitar', chordInstrument: 'guitar2', bassInstrument: 'bass',
    sections: [
      { lead:{0:52,6:55,12:59,18:57,24:52,30:60,36:59,42:55}, chords:{0:[40,47,52],24:[38,45,50]}, bass:{0:28,6:35,12:31,18:35,24:26,30:33,36:31,42:33}, drums:{0:'K',6:'H',12:'S',18:'H',24:'K',30:'K',36:'S',42:'H'} },
      { lead:{0:55,6:59,12:62,18:60,24:55,30:64,36:62,42:59}, chords:{0:[43,50,55],24:[41,48,53]}, bass:{0:31,6:38,12:34,18:38,24:29,30:36,36:34,42:36}, drums:{0:'K',6:'H',12:'S',18:'H',24:'K',30:'H',36:'S',42:'K'} },
    ],
  },
  desertDriveRock: {
    id: 'desertDriveRock', genre: 'Ecléctica', engine: 'structured', label: 'Rock · carretera del desierto',
    description: 'Guitarra limpia, riff polvoriento y batería de carretera; medio western, medio post-rock, cero gasolinera abierta.',
    stepMs: 105, stepsPerSection: 48, longFormMs: 340000, leadInstrument: 'guitar2', counterInstrument: 'mutedHorn', chordInstrument: 'tremolo', bassInstrument: 'uprightBass',
    sections: [
      { lead:{0:57,6:60,12:64,18:62,24:57,30:65,36:64,42:60}, counter:{9:69,21:67,33:72,45:69}, chords:{0:[45,52,57],24:[43,50,55]}, bass:{0:33,6:40,12:36,18:40,24:31,30:38,36:36,42:38}, drums:{0:'K',6:'H',12:'S',18:'H',24:'K',30:'H',36:'S',42:'H'} },
      { lead:{3:60,9:64,15:67,21:69,27:67,33:64,39:62,45:60}, counter:{12:72,30:69}, chords:{0:[48,55,60],24:[45,52,57]}, bass:{0:36,6:43,12:40,18:43,24:33,30:40,36:38,42:40}, drums:{0:'K',6:'H',12:'S',18:'K',24:'K',30:'H',36:'S',42:'H'} },
    ],
  },
  endgameAdagio: {
    id: 'endgameAdagio', genre: 'Clásica', engine: 'structured', label: 'Adagio del final',
    description: 'Cuerdas largas, piano de fieltro y cello. Sin percusión; para finales donde cada casilla cuesta una vida.',
    stepMs: 310, stepsPerSection: 32, longFormMs: 390000, leadInstrument: 'strings', counterInstrument: 'felt', chordInstrument: 'strings', bassInstrument: 'cello',
    sections: [
      { lead:{4:69,12:72,20:71,28:67}, counter:{8:76,24:74}, chords:{0:[57,60,64],16:[55,59,62]}, bass:{0:45,16:43} },
      { lead:{4:72,12:76,20:74,28:69}, counter:{8:79,24:77}, chords:{0:[60,64,67],16:[57,62,65]}, bass:{0:48,16:45} },
      { lead:{4:71,12:74,20:72,28:67}, counter:{10:76,26:72}, chords:{0:[55,59,64],16:[53,57,60]}, bass:{0:43,16:41} },
    ],
  },
  knightFugue: {
    id: 'knightFugue', genre: 'Clásica', engine: 'structured', label: 'Fuga del caballo',
    description: 'Clave, pizzicato y contrapunto juguetón: entradas sucesivas que saltan por el tablero como un caballo con cafeína.',
    stepMs: 108, stepsPerSection: 64, longFormMs: 360000, leadInstrument: 'harpsichord', counterInstrument: 'pizz', chordInstrument: 'harpsichord', bassInstrument: 'cello',
    sections: [
      { lead:{0:64,4:67,8:69,12:71,16:69,20:67,24:64,28:62,32:64,36:67,40:71,44:72,48:71,52:69,56:67,60:64}, counter:{8:52,12:55,16:57,20:59,24:57,28:55,32:52,36:50,40:52,44:55,48:59,52:60,56:59,60:57}, chords:{0:[52,55,59],32:[50,53,57]}, bass:{0:40,16:38,32:36,48:38} },
      { lead:{0:67,4:71,8:72,12:74,16:72,20:71,24:67,28:65,32:67,36:71,40:74,44:76,48:74,52:72,56:71,60:67}, counter:{4:55,8:59,12:60,16:62,20:60,24:59,28:55,32:53,36:55,40:59,44:62,48:64,52:62,56:60,60:59}, chords:{0:[55,59,62],32:[53,57,60]}, bass:{0:43,16:41,32:40,48:41} },
    ],
  },
  nocturnalQuartet: {
    id: 'nocturnalQuartet', genre: 'Clásica', engine: 'structured', label: 'Cuarteto nocturno',
    description: 'Dos líneas de cuerda, cello y silencios de cámara. Sobrio, melódico y ligeramente sospechoso a las tres de la mañana.',
    stepMs: 235, stepsPerSection: 40, longFormMs: 370000, leadInstrument: 'strings', counterInstrument: 'cello', chordInstrument: 'strings', bassInstrument: 'cello',
    sections: [
      { lead:{0:67,8:71,16:74,24:72,32:67}, counter:{4:55,12:59,20:57,28:55,36:52}, chords:{0:[55,59,62],20:[53,57,60]}, bass:{0:43,20:41} },
      { lead:{0:69,8:72,16:76,24:74,32:69}, counter:{4:57,12:60,20:59,28:57,36:53}, chords:{0:[57,60,64],20:[55,59,62]}, bass:{0:45,20:43} },
      { lead:{0:71,8:74,16:72,24:69,32:67}, counter:{4:59,12:62,20:60,28:57,36:55}, chords:{0:[59,62,65],20:[55,59,64]}, bass:{0:47,20:43} },
    ],
  },
});

// Dos familias adicionales para ampliar contraste real: lo-fi/chill
// y synthwave. Siguen siendo composiciones originales del motor Web Audio.
Object.assign(AMBIENT_THEMES, {
  lofiRainTape: {
    id:'lofiRainTape', genre:'Lo-Fi / Chill', engine:'structured', label:'Lo-fi · lluvia en cassette',
    description:'Piano de fieltro, Rhodes gastado, contrabajo y brushes; cálido, ligeramente polvoriento y muy poco interesado en impresionar a nadie.',
    stepMs:164, stepsPerSection:64, longFormMs:360000, leadInstrument:'felt', counterInstrument:'rhodesWarm', chordInstrument:'epiano', bassInstrument:'uprightBass',
    sections:[
      {lead:{2:64,10:67,18:71,26:69,34:64,42:72,50:69,58:67},counter:{14:76,30:74,46:72,62:71},chords:{0:[52,55,59,64],16:[50,53,57,62],32:[55,59,62,67],48:[53,57,60,65]},bass:{0:40,8:47,16:38,24:45,32:43,40:50,48:41,56:48},drums:{0:'B',8:'H',16:'B',24:'H',32:'B',40:'H',48:'B',56:'H'}},
      {lead:{4:67,12:71,20:74,28:72,36:69,44:67,52:64,60:67},counter:{8:79,24:76,40:74,56:72},chords:{0:[55,59,62,67],16:[52,55,59,64],32:[57,60,64,69],48:[50,53,57,62]},bass:{0:43,8:50,16:40,24:47,32:45,40:52,48:38,56:45},drums:{0:'B',8:'H',16:'B',24:'H',32:'B',40:'H',48:'B',56:'H'}}
    ],
  },
  lofiWindowLight: {
    id:'lofiWindowLight', genre:'Lo-Fi / Chill', engine:'structured', label:'Lo-fi · ventana encendida',
    description:'Vibráfono, guitarra limpia y acordes blandos; beat pequeño de madrugada para partidas largas sin dramatismo innecesario.',
    stepMs:156, stepsPerSection:64, longFormMs:350000, leadInstrument:'vibes', counterInstrument:'guitar2', chordInstrument:'rhodesWarm', bassInstrument:'uprightBass',
    sections:[
      {lead:{0:67,8:71,16:74,24:71,32:69,40:72,48:74,56:67},counter:{4:55,20:59,36:57,52:55},chords:{0:[55,59,62,67],16:[52,57,60,64],32:[53,57,60,65],48:[50,55,59,62]},bass:{0:43,8:47,16:40,24:47,32:41,40:48,48:38,56:45},drums:{0:'B',12:'H',16:'B',28:'H',32:'B',44:'H',48:'B',60:'H'}},
      {lead:{4:69,12:72,20:76,28:74,36:72,44:69,52:67,60:69},counter:{8:57,24:60,40:59,56:57},chords:{0:[57,60,64,69],16:[55,59,62,67],32:[52,57,60,64],48:[53,57,60,65]},bass:{0:45,8:52,16:43,24:50,32:40,40:47,48:41,56:48},drums:{0:'B',12:'H',16:'B',28:'H',32:'B',44:'H',48:'B',60:'H'}}
    ],
  },
  neonKnight: {
    id:'neonKnight', genre:'Energía', engine:'structured', label:'Outrun · caballo de neón',
    description:'Arpegios luminosos, pulso de autopista y bajo sintético; velocidad nocturna sin perder el compás.',
    stepMs:92, stepsPerSection:64, longFormMs:350000, leadInstrument:'synth', counterInstrument:'arp', chordInstrument:'pad', bassInstrument:'synthbass',
    sections:[
      {lead:{0:64,8:67,16:71,24:69,32:72,40:71,48:67,56:64},counter:{2:76,6:79,10:83,14:79,18:74,22:79,26:81,30:79,34:76,38:79,42:83,46:86,50:83,54:79,58:76,62:74},chords:{0:[52,59,64],16:[55,62,67],32:[50,57,62],48:[53,60,65]},bass:{0:28,4:35,8:40,12:35,16:31,20:38,24:43,28:38,32:26,36:33,40:38,44:33,48:29,52:36,56:41,60:36},drums:{0:'K',4:'H',8:'S',12:'H',16:'K',20:'H',24:'S',28:'H',32:'K',36:'H',40:'S',44:'H',48:'K',52:'H',56:'S',60:'H'}},
      {lead:{0:67,8:71,16:74,24:72,32:76,40:74,48:71,56:67},counter:{2:79,6:83,10:86,14:83,18:77,22:83,26:84,30:83,34:79,38:83,42:86,46:88,50:86,54:83,58:79,62:77},chords:{0:[55,62,67],16:[57,64,69],32:[53,60,65],48:[50,57,62]},bass:{0:31,4:38,8:43,12:38,16:33,20:40,24:45,28:40,32:29,36:36,40:41,44:36,48:26,52:33,56:38,60:33},drums:{0:'K',4:'H',8:'S',12:'H',16:'K',20:'H',24:'S',28:'H',32:'K',36:'H',40:'S',44:'H',48:'K',52:'H',56:'S',60:'H'}}
    ],
  },
  midnightArcade: {
    id:'midnightArcade', genre:'Energía', engine:'structured', label:'Boombox · arcade 02:17',
    description:'Breakbeat frontal, golpes secos y bajo oscuro; energía de boombox con espacio suficiente para calcular.',
    stepMs:82, stepsPerSection:64, longFormMs:340000, leadInstrument:'pulse', counterInstrument:'glass', chordInstrument:'synth', bassInstrument:'synthbass',
    sections:[
      {lead:{0:52,8:55,16:59,24:57,32:60,40:59,48:55,56:52},counter:{12:76,28:79,44:74,60:72},chords:{0:[40,47,52],16:[43,50,55],32:[38,45,50],48:[41,48,53]},bass:{0:28,4:28,8:35,12:31,16:31,20:31,24:38,28:35,32:26,36:26,40:33,44:29,48:29,52:29,56:36,60:33},drums:{0:'K',4:'H',8:'S',12:'H',16:'K',20:'H',24:'S',28:'H',32:'K',36:'H',40:'S',44:'H',48:'K',52:'H',56:'S',60:'H'}},
      {lead:{0:55,8:59,16:62,24:60,32:64,40:62,48:59,56:55},counter:{12:79,28:83,44:77,60:76},chords:{0:[43,50,55],16:[45,52,57],32:[41,48,53],48:[38,45,50]},bass:{0:31,4:31,8:38,12:34,16:33,20:33,24:40,28:36,32:29,36:29,40:36,44:33,48:26,52:26,56:33,60:29},drums:{0:'K',4:'H',8:'S',12:'H',16:'K',20:'H',24:'S',28:'H',32:'K',36:'H',40:'S',44:'H',48:'K',52:'H',56:'S',60:'H'}}
    ],
  },
});


// Cuatro familias con contraste de arreglo, no sólo de preset.
// Nada de campanillas/pajaritos: todos los leads viven en registros medios o graves.
Object.assign(AMBIENT_THEMES, {
  concreteRain: {
    id:'concreteRain', genre:'Trip-Hop / Downtempo', engine:'structured', label:'Trip-hop · lluvia sobre hormigón',
    description:'Rhodes oscuro, trompeta apagada y bajo profundo sobre un beat lento y seco; ciudad mojada, cero prisa.',
    stepMs:174, stepsPerSection:64, longFormMs:370000, leadInstrument:'mutedHorn', counterInstrument:'rhodesWarm', chordInstrument:'epiano', bassInstrument:'synthbass',
    sections:[
      {lead:{6:62,18:65,30:67,42:65,54:60},counter:{2:50,14:53,26:55,38:53,50:48,62:50},chords:{0:[50,53,57,60],16:[48,52,55,59],32:[45,50,53,57],48:[47,50,54,57]},bass:{0:26,8:26,16:29,24:24,32:21,40:21,48:23,56:26},drums:{0:'K',8:'B',16:'S',24:'B',32:'K',40:'B',48:'S',56:'B'}},
      {lead:{4:65,16:67,28:70,40:67,52:63},counter:{10:53,22:57,34:55,46:50,58:53},chords:{0:[53,57,60,64],16:[50,53,57,60],32:[48,52,55,59],48:[45,50,53,57]},bass:{0:29,8:29,16:26,24:26,32:24,40:24,48:21,56:23},drums:{0:'K',12:'B',16:'S',28:'B',32:'K',44:'B',48:'S',60:'B'}}
    ],
  },
  velvetStatic: {
    id:'velvetStatic', genre:'Trip-Hop / Downtempo', engine:'structured', label:'Trip-hop · estática de terciopelo',
    description:'Vibrato de Rhodes, cello y un pulso roto casi dub; denso pero con espacio para calcular.',
    stepMs:182, stepsPerSection:64, longFormMs:365000, leadInstrument:'rhodesWarm', counterInstrument:'cello', chordInstrument:'pad', bassInstrument:'uprightBass',
    sections:[
      {lead:{0:57,12:60,24:64,36:62,48:57,60:55},counter:{8:45,24:48,40:47,56:43},chords:{0:[45,52,57],16:[48,55,60],32:[43,50,55],48:[41,48,53]},bass:{0:33,8:40,16:36,24:43,32:31,40:38,48:29,56:36},drums:{0:'K',10:'B',16:'S',30:'B',32:'K',42:'B',48:'S',62:'B'}},
      {lead:{4:60,16:64,28:65,40:62,52:59},counter:{12:48,28:50,44:45,60:43},chords:{0:[48,55,60],16:[45,52,57],32:[50,57,62],48:[43,50,55]},bass:{0:36,8:43,16:33,24:40,32:38,40:45,48:31,56:38},drums:{0:'K',12:'B',16:'S',28:'B',32:'K',44:'B',48:'S',60:'B'}}
    ],
  },
  abyssalArchive: {
    id:'abyssalArchive', genre:'Dark Ambient', engine:'structured', label:'Dark ambient · archivo abisal',
    description:'Órgano grave, coro lejano y cello suspendido; no ocurre mucho, pero todo parece importante.',
    stepMs:330, stepsPerSection:40, longFormMs:410000, leadInstrument:'choir', counterInstrument:'cello', chordInstrument:'organ', bassInstrument:'organbass',
    sections:[
      {lead:{10:55,30:52},counter:{18:43,36:41},chords:{0:[36,43,48,52],20:[34,41,46,50]},bass:{0:24,20:22}},
      {lead:{8:57,28:53},counter:{16:45,34:40},chords:{0:[38,45,50,53],20:[33,40,45,48]},bass:{0:26,20:21}},
      {lead:{12:52,32:50},counter:{4:41,24:38},chords:{0:[31,38,43,47],20:[36,43,48,52]},bass:{0:19,20:24}}
    ],
  },
  redVault: {
    id:'redVault', genre:'Dark Ambient', engine:'structured', label:'Dark ambient · cámara roja',
    description:'Cuerdas tensas, subgrave y respiraciones de órgano; claustrofóbico sin caer en ruido de susto barato.',
    stepMs:286, stepsPerSection:48, longFormMs:395000, leadInstrument:'strings', counterInstrument:'organ', chordInstrument:'pad', bassInstrument:'cello',
    sections:[
      {lead:{6:52,18:55,30:53,42:50},counter:{12:40,36:38},chords:{0:[40,47,52],24:[38,45,50]},bass:{0:28,12:31,24:26,36:29}},
      {lead:{4:55,16:57,28:53,40:52},counter:{10:43,34:40},chords:{0:[43,50,55],24:[41,48,53]},bass:{0:31,12:34,24:29,36:28}}
    ],
  },
  queenBossa: {
    id:'queenBossa', genre:'Bossa / Latin Lounge', engine:'structured', label:'Bossa · dama en la terraza',
    description:'Guitarra limpia, Rhodes y contrabajo con una bossa discreta; soleada sin convertirse en música de ascensor.',
    stepMs:142, stepsPerSection:64, longFormMs:350000, leadInstrument:'guitar2', counterInstrument:'rhodesWarm', chordInstrument:'epiano', bassInstrument:'uprightBass',
    sections:[
      {lead:{0:64,6:67,12:69,18:71,24:69,30:67,36:64,42:62,48:64,54:67,60:69},counter:{9:55,21:57,33:60,45:57,57:55},chords:{0:[52,57,60,64],16:[55,59,62,67],32:[57,60,64,69],48:[50,55,59,62]},bass:{0:40,8:47,16:43,24:50,32:45,40:52,48:38,56:45},drums:{0:'B',6:'H',12:'B',18:'H',24:'B',30:'H',36:'B',42:'H',48:'B',54:'H',60:'B'}},
      {lead:{3:67,9:71,15:72,21:74,27:72,33:69,39:67,45:64,51:67,57:69,63:64},counter:{12:59,28:60,44:57,60:55},chords:{0:[55,59,62,67],16:[52,57,60,64],32:[50,55,59,62],48:[57,60,64,69]},bass:{0:43,8:50,16:40,24:47,32:38,40:45,48:45,56:52},drums:{0:'B',8:'H',16:'B',24:'H',32:'B',40:'H',48:'B',56:'H'}}
    ],
  },
  havana205: {
    id:'havana205', genre:'Bossa / Latin Lounge', engine:'structured', label:'Havana · 02:05',
    description:'Bandoneón seco, guitarra y bajo caminante; lounge latino nocturno con un punto de humo y malas decisiones.',
    stepMs:136, stepsPerSection:64, longFormMs:355000, leadInstrument:'bandoneon', counterInstrument:'guitar2', chordInstrument:'rhodesWarm', bassInstrument:'bass',
    sections:[
      {lead:{2:62,8:65,14:67,20:69,26:67,32:65,38:62,44:60,50:62,56:65,62:60},counter:{5:50,17:53,29:55,41:53,53:50},chords:{0:[50,53,57,62],16:[53,57,60,65],32:[48,52,55,60],48:[55,59,62,67]},bass:{0:38,4:45,8:50,12:45,16:41,20:48,24:53,28:48,32:36,36:43,40:48,44:43,48:43,52:50,56:55,60:50},drums:{0:'K',6:'H',12:'B',18:'H',24:'S',30:'H',36:'B',42:'H',48:'K',54:'H',60:'S'}},
      {lead:{0:65,7:69,14:72,21:70,28:67,35:65,42:62,49:65,56:69,63:62},counter:{10:53,26:57,42:55,58:53},chords:{0:[53,57,60,65],16:[50,53,57,62],32:[57,60,64,69],48:[48,52,55,60]},bass:{0:41,8:48,16:38,24:45,32:45,40:52,48:36,56:43},drums:{0:'K',8:'H',16:'S',24:'B',32:'K',40:'H',48:'S',56:'B'}}
    ],
  },
  fourSquares: {
    id:'fourSquares', genre:'Piano / Minimal', engine:'structured', label:'Minimal · cuatro casillas',
    description:'Piano de fieltro repetitivo y cello casi inmóvil; cambia poco a poco, como una posición que se aprieta sin avisar.',
    stepMs:224, stepsPerSection:48, longFormMs:390000, leadInstrument:'felt', counterInstrument:'cello', chordInstrument:'felt', bassInstrument:'cello',
    sections:[
      {lead:{0:60,8:64,16:62,24:67,32:64,40:62},counter:{12:48,36:47},chords:{0:[48,55,60],24:[47,53,59]},bass:{0:36,24:35}},
      {lead:{0:62,8:65,16:64,24:69,32:65,40:64},counter:{12:50,36:48},chords:{0:[50,57,62],24:[48,55,60]},bass:{0:38,24:36}},
      {lead:{0:59,8:62,16:60,24:64,32:62,40:59},counter:{12:47,36:45},chords:{0:[47,53,59],24:[45,52,57]},bass:{0:35,24:33}}
    ],
  },
  verticalRainPiano: {
    id:'verticalRainPiano', genre:'Piano / Minimal', engine:'structured', label:'Piano · lluvia vertical',
    description:'Piano desnudo, silencios largos y cello grave; íntimo y melódico, sin una sola campanita criminal.',
    stepMs:272, stepsPerSection:40, longFormMs:400000, leadInstrument:'felt', counterInstrument:'cello', chordInstrument:'felt', bassInstrument:'cello',
    sections:[
      {lead:{4:67,12:71,22:69,32:64},counter:{8:48,28:45},chords:{0:[48,55,60],20:[45,52,57]},bass:{0:36,20:33}},
      {lead:{6:69,16:72,26:71,36:67},counter:{10:50,30:47},chords:{0:[50,57,62],20:[47,53,59]},bass:{0:38,20:35}},
      {lead:{8:64,18:67,28:65,38:62},counter:{12:45,32:43},chords:{0:[45,52,57],20:[43,50,55]},bass:{0:33,20:31}}
    ],
  },
});



// Bloque más melódico: ocho escenas de jazz mediterráneo.
// Priorizan líneas cantables y contramelodía sobre textura/ruido. Las pistas
// experimentales retiradas más abajo se conservan internamente para no romper
// sesiones antiguas, pero dejan de entrar en selector y radio aleatoria.
Object.assign(AMBIENT_THEMES, {
  beirutHarbor2340: {
    id:'beirutHarbor2340', genre:'Jazz / Mediterráneo', engine:'structured', label:'Beirut · puerto 23:40',
    description:'Buzuq y clarinete se contestan sobre Rhodes y contrabajo; nocturna, melódica y con pulso contenido.',
    stepMs:152, stepsPerSection:64, longFormMs:425000, leadInstrument:'buzuq', counterInstrument:'clarinet', chordInstrument:'rhodesWarm', bassInstrument:'uprightBass',
    sections:[
      {lead:{0:64,5:68,10:71,17:69,24:66,31:64,39:68,46:73,54:71,61:66},counter:{8:55,20:59,34:57,49:62,60:59},chords:{0:[52,57,60,64],16:[50,55,59,62],32:[48,53,57,60],48:[55,59,62,67]},bass:{0:40,8:47,16:38,24:45,32:36,40:43,48:43,56:50},drums:{0:'K',6:'H',12:'B',18:'H',24:'S',30:'H',36:'K',42:'H',48:'S',54:'H',60:'B'}},
      {lead:{2:68,8:71,14:73,21:76,28:73,35:69,42:68,50:71,58:66},counter:{11:57,25:60,38:59,53:55},chords:{0:[55,59,62,67],16:[52,57,60,64],32:[57,60,64,69],48:[50,55,59,62]},bass:{0:43,8:50,16:40,24:47,32:45,40:52,48:38,56:45},drums:{0:'K',8:'B',16:'S',24:'H',32:'K',40:'B',48:'S',56:'H'}},
      {lead:{4:66,12:69,20:71,28:68,36:64,44:62,52:66,60:69},counter:{6:54,22:57,40:55,56:52},chords:{0:[50,55,59,62],16:[48,53,57,60],32:[45,52,57,60],48:[52,57,60,64]},bass:{0:38,8:45,16:36,24:43,32:33,40:40,48:40,56:47},drums:{0:'K',10:'H',16:'S',26:'B',32:'K',42:'H',48:'S',58:'B'}}
    ],
  },
  cairoBlueNote0211: {
    id:'cairoBlueNote0211', genre:'Jazz / Mediterráneo', engine:'structured', label:'Cairo · Blue Note 02:11',
    description:'Trompeta apagada, Rhodes ancho y bajo acústico; club casi vacío y melodía sin prisas.',
    stepMs:176, stepsPerSection:64, longFormMs:440000, leadInstrument:'mutedHorn', counterInstrument:'rhodesWarm', chordInstrument:'epiano', bassInstrument:'uprightBass',
    sections:[
      {lead:{4:62,14:65,24:69,34:67,44:64,54:60},counter:{8:50,18:53,30:55,42:53,58:50},chords:{0:[50,53,57,60],16:[48,52,55,59],32:[45,50,53,57],48:[47,50,54,57]},bass:{0:38,8:45,16:36,24:43,32:33,40:40,48:35,56:42},drums:{0:'B',16:'S',32:'B',48:'S'}},
      {lead:{6:65,16:69,26:72,38:69,50:64,60:62},counter:{12:53,28:57,44:55,56:52},chords:{0:[53,57,60,64],16:[50,53,57,60],32:[48,52,55,59],48:[45,50,53,57]},bass:{0:41,8:48,16:38,24:45,32:36,40:43,48:33,56:40},drums:{0:'B',12:'H',16:'S',32:'B',44:'H',48:'S'}},
      {lead:{2:60,18:64,30:67,46:65,58:62},counter:{10:48,26:52,42:50,54:47},chords:{0:[48,52,55,59],16:[45,50,53,57],32:[50,53,57,60],48:[43,48,52,55]},bass:{0:36,16:33,32:38,48:31},drums:{0:'B',16:'S',32:'B',48:'S'}}
    ],
  },
  alexandriaHarborCafe: {
    id:'alexandriaHarborCafe', genre:'Jazz / Mediterráneo', engine:'structured', label:'Alejandría · café del puerto',
    description:'Piano de fieltro, clarinete suave y contrabajo; íntima, luminosa y pensada para partidas largas.',
    stepMs:188, stepsPerSection:56, longFormMs:420000, leadInstrument:'clarinet', counterInstrument:'felt', chordInstrument:'felt', bassInstrument:'uprightBass',
    sections:[
      {lead:{5:67,13:71,21:69,31:64,41:67,51:62},counter:{0:55,16:57,28:60,44:57},chords:{0:[48,55,60],14:[50,57,62],28:[45,52,57],42:[47,53,59]},bass:{0:36,7:43,14:38,21:45,28:33,35:40,42:35,49:42},drums:{0:'B',14:'H',28:'B',42:'H'}},
      {lead:{3:69,11:72,19:74,29:71,39:67,49:64},counter:{7:57,23:60,35:59,51:55},chords:{0:[50,57,62],14:[52,59,64],28:[47,53,59],42:[48,55,60]},bass:{0:38,7:45,14:40,21:47,28:35,35:42,42:36,49:43},drums:{0:'B',14:'H',28:'B',42:'H'}},
      {lead:{6:64,16:67,26:69,36:65,46:62},counter:{10:52,24:55,38:53,52:50},chords:{0:[45,52,57],14:[48,55,60],28:[43,50,55],42:[47,53,59]},bass:{0:33,14:36,28:31,42:35},drums:{0:'B',28:'B'}}
    ],
  },
  cordobaRooftop0026: {
    id:'cordobaRooftop0026', genre:'Jazz / Mediterráneo', engine:'structured', label:'Córdoba · azotea 00:26',
    description:'Guitarra limpia, cello y Rhodes cálido; aire andalusí con melodía principal bien al frente.',
    stepMs:148, stepsPerSection:64, longFormMs:405000, leadInstrument:'guitar2', counterInstrument:'cello', chordInstrument:'rhodesWarm', bassInstrument:'uprightBass',
    sections:[
      {lead:{0:64,6:67,12:69,18:72,24:69,30:67,36:65,42:64,48:67,54:69,60:64},counter:{9:48,21:52,33:50,45:47,57:48},chords:{0:[52,57,60,64],16:[50,55,59,62],32:[57,60,64,69],48:[48,52,55,60]},bass:{0:40,8:47,16:38,24:45,32:45,40:52,48:36,56:43},drums:{0:'B',8:'H',16:'B',24:'H',32:'B',40:'H',48:'B',56:'H'}},
      {lead:{3:67,9:69,15:72,21:74,27:72,33:69,39:67,45:65,51:64,57:67,63:62},counter:{12:50,28:53,44:52,60:48},chords:{0:[55,59,62,67],16:[52,57,60,64],32:[50,55,59,62],48:[57,60,64,69]},bass:{0:43,8:50,16:40,24:47,32:38,40:45,48:45,56:52},drums:{0:'B',12:'H',24:'B',36:'H',48:'B',60:'H'}},
      {lead:{4:62,12:65,20:67,28:69,36:67,44:64,52:62,60:60},counter:{8:47,24:50,40:48,56:45},chords:{0:[48,52,55,60],16:[45,52,57,60],32:[50,53,57,62],48:[43,50,55,59]},bass:{0:36,16:33,32:38,48:31},drums:{0:'B',16:'H',32:'B',48:'H'}}
    ],
  },
  damascusCourtyard0144: {
    id:'damascusCourtyard0144', genre:'Jazz / Mediterráneo', engine:'structured', label:'Damasco · patio 01:44',
    description:'Ney, cello y piano oscuro; contemplativa pero con frases largas que avanzan en vez de flotar sin rumbo.',
    stepMs:214, stepsPerSection:48, longFormMs:430000, leadInstrument:'ney', counterInstrument:'cello', chordInstrument:'felt', bassInstrument:'cello',
    sections:[
      {lead:{4:69,12:72,20:71,30:67,40:64},counter:{8:45,24:48,36:47},chords:{0:[45,52,57],16:[48,55,60],32:[43,50,55]},bass:{0:33,16:36,32:31}},
      {lead:{6:71,14:74,22:72,32:69,42:66},counter:{10:47,26:50,38:48},chords:{0:[47,53,59],16:[50,57,62],32:[45,52,57]},bass:{0:35,16:38,32:33}},
      {lead:{2:67,12:69,24:71,34:68,44:64},counter:{6:43,20:47,36:45},chords:{0:[43,50,55],16:[45,52,57],32:[40,47,52]},bass:{0:31,16:33,32:28}}
    ],
  },
  tangierNightTrain0058: {
    id:'tangierNightTrain0058', genre:'Jazz / Mediterráneo', engine:'structured', label:'Tánger · tren nocturno 00:58',
    description:'Trompeta seca, guitarra y walking bass; más viaje que experimento, con groove discreto y fraseo claro.',
    stepMs:142, stepsPerSection:64, longFormMs:410000, leadInstrument:'mutedHorn', counterInstrument:'guitar2', chordInstrument:'rhodesWarm', bassInstrument:'uprightBass',
    sections:[
      {lead:{2:62,10:65,18:67,26:70,34:67,42:65,50:62,58:60},counter:{6:50,22:53,38:55,54:53},chords:{0:[50,53,57,62],16:[48,52,55,60],32:[53,57,60,65],48:[55,59,62,67]},bass:{0:38,4:45,8:50,12:45,16:36,20:43,24:48,28:43,32:41,36:48,40:53,44:48,48:43,52:50,56:55,60:50},drums:{0:'K',6:'H',12:'B',18:'H',24:'S',30:'H',36:'K',42:'H',48:'S',54:'H',60:'B'}},
      {lead:{4:65,12:69,20:72,28:70,36:67,44:65,52:62,60:65},counter:{8:53,24:57,40:55,56:50},chords:{0:[53,57,60,65],16:[50,53,57,62],32:[57,60,64,69],48:[48,52,55,60]},bass:{0:41,8:48,16:38,24:45,32:45,40:52,48:36,56:43},drums:{0:'K',8:'H',16:'S',24:'B',32:'K',40:'H',48:'S',56:'B'}},
      {lead:{0:60,16:64,24:67,40:65,56:62},counter:{12:48,28:52,44:50,60:47},chords:{0:[48,52,55,60],16:[45,50,53,57],32:[50,53,57,62],48:[43,48,52,55]},bass:{0:36,8:43,16:33,24:40,32:38,40:45,48:31,56:38},drums:{0:'K',16:'S',32:'K',48:'S'}}
    ],
  },
  granadaCopperRain0232: {
    id:'granadaCopperRain0232', genre:'Jazz / Mediterráneo', engine:'structured', label:'Granada · lluvia de cobre 02:32',
    description:'Guitarra, clarinete y cello con lluvia imaginaria pero sin efectos de feria; melancólica y muy melódica.',
    stepMs:168, stepsPerSection:56, longFormMs:435000, leadInstrument:'guitar2', counterInstrument:'clarinet', chordInstrument:'felt', bassInstrument:'cello',
    sections:[
      {lead:{0:64,7:67,14:71,21:69,28:67,35:64,42:62,49:64},counter:{10:55,24:59,38:57,52:55},chords:{0:[48,55,60],14:[50,57,62],28:[45,52,57],42:[47,53,59]},bass:{0:36,14:38,28:33,42:35},drums:{0:'B',14:'H',28:'B',42:'H'}},
      {lead:{4:67,11:71,18:74,25:72,32:69,39:67,46:64,53:62},counter:{8:57,22:60,36:59,50:55},chords:{0:[50,57,62],14:[52,59,64],28:[47,53,59],42:[48,55,60]},bass:{0:38,14:40,28:35,42:36},drums:{0:'B',14:'H',28:'B',42:'H'}},
      {lead:{2:62,12:65,22:67,32:64,42:60,52:62},counter:{6:53,20:55,34:52,48:50},chords:{0:[45,52,57],14:[48,55,60],28:[43,50,55],42:[45,52,57]},bass:{0:33,14:36,28:31,42:33},drums:{0:'B',28:'B'}}
    ],
  },
  ammanLateTable0303: {
    id:'ammanLateTable0303', genre:'Jazz / Mediterráneo', engine:'structured', label:'Amán · última mesa 03:03',
    description:'Rhodes, clarinete y contrabajo en conversación lenta; cálida, profunda y sin textura rara por obligación.',
    stepMs:184, stepsPerSection:64, longFormMs:445000, leadInstrument:'clarinet', counterInstrument:'rhodesWarm', chordInstrument:'epiano', bassInstrument:'uprightBass',
    sections:[
      {lead:{6:64,18:67,30:71,42:69,54:65},counter:{2:52,14:55,26:57,38:55,50:52,62:50},chords:{0:[52,55,59,64],16:[50,53,57,62],32:[48,52,55,60],48:[45,50,53,57]},bass:{0:40,8:47,16:38,24:45,32:36,40:43,48:33,56:40},drums:{0:'B',16:'S',32:'B',48:'S'}},
      {lead:{4:67,16:71,28:72,40:69,52:64},counter:{10:55,22:59,34:57,46:53,58:55},chords:{0:[55,59,62,67],16:[52,55,59,64],32:[50,53,57,62],48:[48,52,55,60]},bass:{0:43,8:50,16:40,24:47,32:38,40:45,48:36,56:43},drums:{0:'B',12:'H',16:'S',32:'B',44:'H',48:'S'}},
      {lead:{8:62,20:65,32:67,44:64,56:60},counter:{4:50,16:53,28:55,40:52,52:48},chords:{0:[50,53,57,62],16:[48,52,55,60],32:[45,50,53,57],48:[43,48,52,55]},bass:{0:38,16:36,32:33,48:31},drums:{0:'B',16:'S',32:'B',48:'S'}}
    ],
  },
});

// Energía tiene repertorio propio: no es un alias de Rock ni «todo aleatorio».
Object.assign(AMBIENT_THEMES, {
  neonSiege: {
    id:'neonSiege', genre:'Energía', engine:'structured', label:'Synth metal · asedio de neón',
    description:'Thrash digital rápido: doble bombo seco, caja corta y riff cortante. El tema más veloz de Energía.',
    stepMs:68, stepsPerSection:64, longFormMs:330000, leadInstrument:'guitar2', counterInstrument:'arp', chordInstrument:'synth', bassInstrument:'synthbass',
    sections:[
      {lead:{0:52,4:52,8:55,12:52,16:59,20:57,24:55,28:52,32:52,36:55,40:60,44:59,48:57,52:55,56:52,60:50},counter:{2:76,6:71,10:79,14:74,18:76,22:71,26:81,30:79,34:76,38:72,42:79,46:83,50:81,54:76,58:74,62:71},chords:{0:[40,47,52],16:[43,50,55],32:[45,52,57],48:[38,45,50]},bass:{0:28,2:28,4:28,8:31,12:28,16:35,20:33,24:31,28:28,32:28,36:31,40:36,44:35,48:33,52:31,56:28,60:26},drums:{0:'K',2:'H',4:'K',6:'H',8:'S',10:'K',12:'H',14:'K',16:'K',18:'H',20:'K',22:'H',24:'S',26:'K',28:'H',30:'K',32:'K',34:'H',36:'K',38:'H',40:'S',42:'K',44:'H',46:'K',48:'K',50:'H',52:'K',54:'H',56:'S',58:'K',60:'H',62:'K'}},
      {lead:{0:55,4:55,8:59,12:55,16:62,20:60,24:59,28:55,32:57,36:60,40:64,44:62,48:60,52:59,56:55,60:52},counter:{2:79,6:74,10:83,14:77,18:79,22:74,26:84,30:83,34:81,38:76,42:83,46:86,50:84,54:81,58:77,62:74},chords:{0:[43,50,55],16:[46,53,58],32:[45,52,57],48:[40,47,52]},bass:{0:31,2:31,4:31,8:35,12:31,16:38,20:36,24:35,28:31,32:33,36:36,40:40,44:38,48:36,52:35,56:31,60:28},drums:{0:'K',2:'H',4:'K',6:'H',8:'S',10:'K',12:'H',14:'K',16:'K',18:'H',20:'K',22:'H',24:'S',26:'K',28:'H',30:'K',32:'K',34:'H',36:'K',38:'H',40:'S',42:'K',44:'H',46:'K',48:'K',50:'H',52:'K',54:'H',56:'S',58:'K',60:'H',62:'K'}}
    ],
  },
  overclockedKnight: {
    id:'overclockedKnight', genre:'Energía', engine:'structured', label:'Synth metal · caballo overclocked',
    description:'Galope de tres apoyos, toms electrónicos y bajo mecánico; menos recto y más elástico que el thrash.',
    stepMs:100, stepsPerSection:64, longFormMs:325000, leadInstrument:'pulse', counterInstrument:'guitar2', chordInstrument:'pad', bassInstrument:'synthbass',
    sections:[
      {lead:{0:64,6:67,8:71,14:67,16:72,22:71,24:67,30:64,32:64,38:67,40:74,46:72,48:71,54:67,56:64,62:62},counter:{0:52,3:52,4:55,7:52,8:59,11:57,12:55,15:52,16:52,19:55,20:60,23:59,24:57,27:55,28:52,31:50,32:52,35:52,36:55,39:52,40:59,43:57,44:55,47:52,48:55,51:55,52:59,55:55,56:62,59:60,60:59,63:55},chords:{0:[40,47,52],16:[38,45,50],32:[43,50,55],48:[45,52,57]},bass:{0:28,3:28,4:31,7:28,8:35,11:33,12:31,15:28,16:26,19:26,20:29,23:26,24:33,27:31,28:29,31:26,32:31,35:31,36:35,39:31,40:38,43:36,44:35,47:31,48:33,51:33,52:36,55:33,56:40,59:38,60:36,63:33},drums:{0:'K',2:'H',4:'K',6:'H',8:'S',10:'H',12:'K',14:'H',16:'K',18:'H',20:'K',22:'H',24:'S',26:'H',28:'K',30:'H',32:'K',34:'H',36:'K',38:'H',40:'S',42:'H',44:'K',46:'H',48:'K',50:'H',52:'K',54:'H',56:'S',58:'H',60:'K',62:'H'}},
      {lead:{0:67,6:71,8:74,14:71,16:76,22:74,24:71,30:67,32:69,38:72,40:76,46:74,48:72,54:69,56:67,62:64},counter:{0:55,3:55,4:59,7:55,8:62,11:60,12:59,15:55,16:57,19:57,20:60,23:57,24:64,27:62,28:60,31:57,32:55,35:55,36:59,39:55,40:62,43:60,44:59,47:55,48:57,51:57,52:60,55:57,56:64,59:62,60:60,63:57},chords:{0:[43,50,55],16:[45,52,57],32:[41,48,53],48:[45,52,57]},bass:{0:31,3:31,4:35,7:31,8:38,11:36,12:35,15:31,16:33,19:33,20:36,23:33,24:40,27:38,28:36,31:33,32:29,35:29,36:33,39:29,40:36,43:34,44:33,47:29,48:33,51:33,52:36,55:33,56:40,59:38,60:36,63:33},drums:{0:'K',2:'H',4:'K',6:'H',8:'S',10:'H',12:'K',14:'H',16:'K',18:'H',20:'K',22:'H',24:'S',26:'H',28:'K',30:'H',32:'K',34:'H',36:'K',38:'H',40:'S',42:'H',44:'K',46:'H',48:'K',50:'H',52:'K',54:'H',56:'S',58:'H',60:'K',62:'H'}}
    ],
  },
  reactorGambit: {
  id:'reactorGambit', genre:'Energía', engine:'structured', label:'Synth metal · gambito del reactor',
  description:'Synth metal melódico y nocturno: riff de guitarra, sintetizador de respuesta y una subida clara hacia estribillo, breakdown y reprise final.',
  stepMs:120, stepsPerSection:64, longFormMs:360000, leadInstrument:'guitar2', counterInstrument:'synth', chordInstrument:'pad', bassInstrument:'synthbass',
  sections:[
    {
      // Arranque contenido: el reactor despierta, pero todavía no pisa al oyente con botas industriales.
      lead:{0:52,8:55,16:59,24:57,32:52,40:55,48:60,56:59},
      counter:{12:64,28:67,44:69,60:67},
      chords:{0:[40,47,52],16:[43,50,55],32:[45,52,57],48:[40,47,52]},
      bass:{0:28,4:28,8:31,12:28,16:31,20:31,24:33,28:31,32:33,36:33,40:35,44:33,48:28,52:35,56:31,60:28},
      drums:{0:'K',8:'S',16:'K',24:'S',32:'K',40:'S',48:'K',56:'S'},
    },
    {
      // Riff principal sincopado, con huecos suficientes para que el synth conteste en vez de chillar encima.
      lead:{0:52,3:52,6:55,10:59,14:57,16:52,19:55,22:60,26:59,30:55,32:50,35:52,38:55,42:59,46:57,48:52,51:55,54:62,58:60,62:59},
      counter:{7:67,15:64,23:69,31:67,39:64,47:71,55:69,63:67},
      chords:{0:[40,47,52],16:[38,45,50],32:[43,50,55],48:[40,47,52]},
      bass:{0:28,2:28,6:31,8:28,12:35,16:26,20:33,24:31,28:26,32:31,36:38,40:35,44:31,48:28,52:35,56:40,60:35},
      drums:{0:'K',4:'H',8:'S',12:'K',16:'K',20:'H',24:'S',28:'K',32:'K',36:'H',40:'S',44:'K',48:'K',52:'H',56:'S',60:'K'},
    },
    {
      // Estribillo: la melodía sube de registro y por fin abre el techo sin convertirse en una ametralladora de notas.
      lead:{0:64,4:67,8:71,12:69,16:67,20:64,24:62,28:64,32:67,36:71,40:74,44:72,48:71,52:67,56:64,60:62},
      counter:{2:76,10:74,18:79,26:76,34:81,42:79,50:76,58:74},
      chords:{0:[45,52,57],16:[43,50,55],32:[47,54,59],48:[40,47,52]},
      bass:{0:33,4:40,8:33,12:40,16:31,20:38,24:31,28:38,32:35,36:42,40:35,44:42,48:28,52:35,56:40,60:35},
      drums:{0:'K',4:'H',8:'S',10:'K',12:'H',16:'K',20:'H',24:'S',28:'K',32:'K',36:'H',40:'S',42:'K',44:'H',48:'K',52:'H',56:'S',60:'K'},
    },
    {
      // Breakdown: baja el riff, deja respirar al pad y prepara la última subida con tensión en vez de simple volumen.
      lead:{0:52,8:50,16:47,24:50,32:52,40:55,48:57,56:59},
      counter:{6:64,14:62,22:59,30:62,38:64,46:67,54:69,62:71},
      chords:{0:[40,47,52],16:[38,45,50],32:[35,42,47],48:[43,50,55]},
      bass:{0:28,8:26,16:23,24:26,32:28,40:31,48:33,56:35},
      drums:{0:'K',8:'S',16:'K',24:'S',32:'K',40:'S',48:'K',56:'S'},
    },
    {
      // Reprise final: vuelve el riff y lo cruza con la melodía del estribillo para que la pieza cierre con identidad propia.
      lead:{0:52,3:55,6:59,10:64,14:62,16:55,19:59,22:67,26:64,30:62,32:57,35:60,38:64,42:69,46:67,48:59,51:62,54:71,58:69,62:64},
      counter:{4:76,12:79,20:81,28:79,36:83,44:81,52:79,60:76},
      chords:{0:[40,47,52],16:[43,50,55],32:[45,52,57],48:[47,54,59]},
      bass:{0:28,4:35,8:31,12:35,16:31,20:38,24:35,28:38,32:33,36:40,40:36,44:40,48:35,52:42,56:40,60:35},
      drums:{0:'K',4:'H',8:'S',12:'K',16:'K',20:'H',24:'S',28:'K',32:'K',36:'H',40:'S',44:'K',48:'K',52:'H',56:'S',60:'K'},
    },
  ],
},
});



// dm46p · familias acústicas/electrónicas con identidad explícita. El objetivo
// es que cambiar de emisora cambie de banda, no sólo de progresión armónica.
Object.assign(AMBIENT_THEMES, {
  midnightSatin: {
    id:'midnightSatin', genre:'Smooth Jazz', engine:'structured', label:'Smooth jazz · satén de medianoche',
    description:'Guitarra jazz de caja, Rhodes, saxo apagado y contrabajo. Redonda, elegante y sin dientes de sierra.',
    stepMs:156, stepsPerSection:64, longFormMs:420000, leadInstrument:'jazzGuitar', counterInstrument:'mutedHorn', chordInstrument:'rhodesWarm', bassInstrument:'uprightBass',
    sections:[
      {lead:{2:64,8:67,14:71,20:69,28:67,34:64,42:62,50:64,58:67},counter:{11:76,27:74,43:71,59:69},chords:{0:[52,55,59,64],16:[50,53,57,62],32:[57,60,64,69],48:[55,59,62,67]},bass:{0:40,4:47,8:52,12:47,16:38,20:45,24:50,28:45,32:45,36:52,40:57,44:52,48:43,52:50,56:55,60:50},drums:{0:'B',8:'H',16:'B',24:'S',32:'B',40:'H',48:'B',56:'S'}},
      {lead:{4:67,12:71,20:74,28:72,36:69,44:67,52:64,60:62},counter:{8:79,24:76,40:74,56:71},chords:{0:[55,59,62,67],16:[52,55,59,64],32:[50,53,57,62],48:[57,60,64,69]},bass:{0:43,8:50,16:40,24:47,32:38,40:45,48:45,56:52},drums:{0:'B',12:'H',16:'S',32:'B',44:'H',48:'S'}},
      {lead:{6:62,18:65,30:67,42:64,54:60},counter:{12:69,36:67,60:64},chords:{0:[50,53,57,62],24:[48,52,55,60],48:[45,50,53,57]},bass:{0:38,16:36,32:33,48:31},drums:{0:'B',32:'B'}}
    ],
  },
  blueLobby: {
    id:'blueLobby', genre:'Smooth Jazz', engine:'structured', label:'Smooth jazz · lobby azul',
    description:'Rhodes aterciopelado, guitarra limpia y saxo tenor imaginario; menos nocturno árabe, más club de hotel a las dos.',
    stepMs:162, stepsPerSection:64, longFormMs:430000, leadInstrument:'mutedHorn', counterInstrument:'jazzGuitar', chordInstrument:'rhodesWarm', bassInstrument:'uprightBass',
    sections:[
      {lead:{4:65,12:69,20:72,28:70,36:67,44:65,52:62,60:65},counter:{8:57,24:60,40:59,56:55},chords:{0:[53,57,60,64],16:[50,55,59,62],32:[57,60,64,69],48:[52,55,59,64]},bass:{0:41,8:48,16:38,24:45,32:45,40:52,48:40,56:47},drums:{0:'B',8:'H',16:'S',24:'H',32:'B',40:'H',48:'S',56:'H'}},
      {lead:{2:68,10:72,18:75,26:73,34:70,42:68,50:65,58:63},counter:{6:60,22:63,38:62,54:58},chords:{0:[56,60,63,68],16:[53,58,62,65],32:[60,63,67,72],48:[55,58,62,67]},bass:{0:44,8:51,16:41,24:48,32:48,40:55,48:43,56:50},drums:{0:'B',12:'H',16:'S',32:'B',44:'H',48:'S'}},
      {lead:{8:63,24:67,40:65,56:60},counter:{16:55,48:53},chords:{0:[51,55,58,63],24:[48,53,57,60],48:[46,51,55,58]},bass:{0:39,24:36,48:34},drums:{0:'B',32:'B'}}
    ],
  },
  palmsAtDusk: {
    id:'palmsAtDusk', genre:'Tropical House', engine:'structured', label:'Tropical house · palmeras al anochecer',
    description:'Marimba seca, guitarra de nylon, bajo redondo y pulso four-on-the-floor ligero. Sol sin megafonía de chiringuito.',
    stepMs:126, stepsPerSection:64, longFormMs:390000, leadInstrument:'marimba', counterInstrument:'nylonGuitar', chordInstrument:'epiano', bassInstrument:'synthbass',
    sections:[
      {lead:{0:72,8:76,16:79,24:76,32:74,40:72,48:69,56:72},counter:{4:64,12:67,20:69,28:67,36:62,44:66,52:69,60:67},chords:{0:[52,55,59,64],16:[55,59,62,67],32:[57,60,64,69],48:[50,55,59,62]},bass:{0:40,8:40,16:43,24:43,32:45,40:45,48:38,56:38},drums:{0:'K',4:'H',8:'K',12:'H',16:'K',20:'H',24:'K',28:'H',32:'K',36:'H',40:'K',44:'H',48:'K',52:'H',56:'K',60:'H'}},
      {lead:{4:74,12:77,20:81,28:79,36:76,44:74,52:72,60:69},counter:{0:67,16:64,32:69,48:66},chords:{0:[55,59,62,67],16:[57,60,64,69],32:[52,55,59,64],48:[50,55,59,62]},bass:{0:43,8:43,16:45,24:45,32:40,40:40,48:38,56:38},drums:{0:'K',4:'H',8:'K',12:'H',16:'K',20:'H',24:'K',28:'H',32:'K',36:'H',40:'K',44:'H',48:'K',52:'H',56:'K',60:'H'}},
      {lead:{8:76,24:74,40:72,56:69},counter:{12:64,28:62,44:60,60:62},chords:{0:[52,55,59,64],32:[50,55,59,62]},bass:{0:40,16:43,32:38,48:40},drums:{0:'K',8:'K',16:'K',24:'K',32:'K',40:'K',48:'K',56:'K'}}
    ],
  },
  islandKnight: {
    id:'islandKnight', genre:'Tropical House', engine:'structured', label:'Tropical house · caballo de isla',
    description:'Pluck tropical, nylon sincopada, acordes suaves y bajo con bombeo sugerido; más playa nocturna que EDM de estadio.',
    stepMs:122, stepsPerSection:64, longFormMs:400000, leadInstrument:'nylonGuitar', counterInstrument:'marimba', chordInstrument:'rhodesWarm', bassInstrument:'synthbass',
    sections:[
      {lead:{2:67,6:71,10:74,14:71,18:69,22:67,26:64,30:67,34:69,38:72,42:76,46:72,50:69,54:67,58:64,62:62},counter:{8:79,24:76,40:81,56:76},chords:{0:[55,59,62,67],16:[52,55,59,64],32:[57,60,64,69],48:[50,55,59,62]},bass:{0:43,8:43,16:40,24:40,32:45,40:45,48:38,56:38},drums:{0:'K',4:'H',8:'K',12:'H',16:'K',20:'H',24:'K',28:'H',32:'K',36:'H',40:'K',44:'H',48:'K',52:'H',56:'K',60:'H'}},
      {lead:{4:69,12:72,20:76,28:74,36:71,44:69,52:67,60:64},counter:{0:81,16:79,32:76,48:74},chords:{0:[57,60,64,69],16:[55,59,62,67],32:[52,55,59,64],48:[50,55,59,62]},bass:{0:45,8:45,16:43,24:43,32:40,40:40,48:38,56:38},drums:{0:'K',4:'H',8:'K',12:'H',16:'K',20:'H',24:'K',28:'H',32:'K',36:'H',40:'K',44:'H',48:'K',52:'H',56:'K',60:'H'}},
      {lead:{8:67,24:64,40:62,56:60},counter:{16:76,48:72},chords:{0:[55,59,62,67],32:[50,55,59,62]},bass:{0:43,16:40,32:38,48:36},drums:{0:'K',8:'K',16:'K',24:'K',32:'K',40:'K',48:'K',56:'K'}}
    ],
  },
});



// dm46zey · pequeño pack de escenas nuevas: rellenan huecos del catálogo sin
// cargar samples externos. Siguen siendo composiciones originales WebAudio.
Object.assign(AMBIENT_THEMES, {
  pawnMarshal: {
    id:'pawnMarshal', genre:'Ecléctica', engine:'structured', label:'Marcha del peón ilustrado',
    description:'Caja seca, metales contenidos y piano marcial con una ceja levantada. Muy Matthias.',
    stepMs:132, stepsPerSection:64, longFormMs:410000, leadInstrument:'brass', counterInstrument:'felt', chordInstrument:'rhodesWarm', bassInstrument:'uprightBass',
    sections:[
      {lead:{0:55,8:58,16:62,24:60,32:55,40:63,48:62,56:58},counter:{4:67,20:65,36:70,52:67},chords:{0:[43,50,55],16:[46,53,58],32:[41,48,53],48:[43,50,55]},bass:{0:31,8:38,16:34,24:41,32:29,40:36,48:31,56:38},drums:{0:'K',8:'S',16:'K',24:'S',32:'K',40:'S',48:'K',56:'S'}},
      {lead:{0:58,8:62,16:65,24:63,32:60,40:67,48:65,56:62},counter:{12:70,28:67,44:72,60:70},chords:{0:[46,53,58],16:[48,55,60],32:[43,50,55],48:[46,53,58]},bass:{0:34,8:41,16:36,24:43,32:31,40:38,48:34,56:41},drums:{0:'K',8:'S',16:'K',20:'H',24:'S',32:'K',40:'S',48:'K',52:'H',56:'S'}}
    ],
  },
  cafeGambit213: {
    id:'cafeGambit213', genre:'Smooth Jazz', engine:'structured', label:'Café Gambito · 2:13',
    description:'Rhodes, contrabajo y saxo apagado en un club pequeño cuando ya han recogido media sala.',
    stepMs:166, stepsPerSection:64, longFormMs:435000, leadInstrument:'mutedHorn', counterInstrument:'jazzGuitar', chordInstrument:'rhodesWarm', bassInstrument:'uprightBass',
    sections:[
      {lead:{6:67,14:70,22:72,30:69,38:65,46:67,54:64,62:62},counter:{10:57,26:60,42:55,58:57},chords:{0:[48,55,58,64],16:[53,57,60,64],32:[50,57,60,65],48:[55,59,62,65]},bass:{0:36,8:43,16:41,24:45,32:38,40:45,48:43,56:47},drums:{0:'B',8:'H',16:'B',24:'S',32:'B',40:'H',48:'B',56:'S'}},
      {lead:{4:70,12:74,20:77,28:74,36:72,44:69,52:67,60:64},counter:{8:60,24:62,40:59,56:57},chords:{0:[50,57,60,65],16:[48,55,58,64],32:[53,57,60,64],48:[55,59,62,65]},bass:{0:38,8:45,16:36,24:43,32:41,40:48,48:43,56:50},drums:{0:'B',12:'H',16:'S',32:'B',44:'H',48:'S'}}
    ],
  },
  rainOnE4: {
    id:'rainOnE4', genre:'Piano / Minimal', engine:'structured', label:'Lluvia sobre e4',
    description:'Piano de fieltro, cello muy atrás y silencios largos para calcular sin prisa.',
    stepMs:218, stepsPerSection:64, longFormMs:455000, leadInstrument:'felt', counterInstrument:'cello', chordInstrument:'felt', bassInstrument:'cello',
    sections:[
      {lead:{0:64,8:67,16:69,24:72,32:71,40:67,48:64,56:62},counter:{12:52,44:50},chords:{0:[52,55,59],24:[50,53,57],48:[48,52,55]},bass:{0:40,24:38,48:36}},
      {lead:{4:62,12:65,20:67,28:64,36:60,44:62,52:59,60:57},counter:{16:50,48:48},chords:{0:[50,53,57],32:[48,52,55]},bass:{0:38,32:36}}
    ],
  },
  knightAlleyNoir: {
    id:'knightAlleyNoir', genre:'Trip-Hop / Downtempo', engine:'structured', label:'Caballo en callejón mojado',
    description:'Vibráfono, Rhodes oscuro y batería lenta de cine negro; detective sin gabardina obligatoria.',
    stepMs:184, stepsPerSection:64, longFormMs:425000, leadInstrument:'vibes', counterInstrument:'mutedHorn', chordInstrument:'rhodesWarm', bassInstrument:'uprightBass',
    sections:[
      {lead:{4:62,12:65,20:69,28:67,36:64,44:62,52:60,60:57},counter:{10:74,26:72,42:69,58:67},chords:{0:[50,53,57,62],16:[48,52,55,60],32:[45,50,53,57],48:[47,50,54,59]},bass:{0:38,8:38,16:36,24:36,32:33,40:33,48:35,56:35},drums:{0:'K',12:'H',16:'S',32:'K',44:'H',48:'S'}},
      {lead:{6:65,18:68,30:70,42:67,54:63},counter:{14:77,38:74,62:72},chords:{0:[53,56,60,65],24:[50,55,58,63],48:[48,53,56,60]},bass:{0:41,16:38,32:36,48:34},drums:{0:'K',16:'S',32:'K',48:'S'}}
    ],
  },
  oudTrench: {
    id:'oudTrench', genre:'Jazz / Mediterráneo', engine:'structured', label:'Oud en la trinchera',
    description:'Oud seco, piano cálido y contrabajo: tensión táctica sin convertir la sala en una película épica.',
    stepMs:152, stepsPerSection:64, longFormMs:440000, leadInstrument:'oudJazz', counterInstrument:'felt', chordInstrument:'rhodesWarm', bassInstrument:'uprightBass',
    sections:[
      {lead:{0:64,6:65,12:68,18:67,24:64,30:62,36:61,42:64,48:67,54:65,60:64},counter:{9:72,27:70,45:68,63:67},chords:{0:[52,55,59,64],16:[49,53,56,61],32:[50,55,58,62],48:[47,52,55,59]},bass:{0:40,8:47,16:37,24:44,32:38,40:45,48:35,56:42},drums:{0:'K',8:'B',16:'S',24:'H',32:'K',40:'B',48:'S',56:'H'}},
      {lead:{2:67,10:68,18:72,26:70,34:67,42:65,50:64,58:61},counter:{14:76,30:72,46:70,62:68},chords:{0:[55,59,62,67],16:[52,56,59,64],32:[50,55,58,62],48:[49,53,56,61]},bass:{0:43,8:50,16:40,24:47,32:38,40:45,48:37,56:44},drums:{0:'K',12:'H',16:'S',32:'K',44:'H',48:'S'}}
    ],
  },
});

export const AMBIENT_GENRE_ORDER = ['SPA / Zen', 'Smooth Jazz', 'Tropical House', 'Energía', 'Ecléctica', 'Clásica', 'Lo-Fi / Chill', 'Trip-Hop / Downtempo', 'Bossa / Latin Lounge', 'Piano / Minimal', 'Dark Ambient', 'Jazz / Mediterráneo', 'Electrónica / Experimental', 'Ambient / Otros'];
const MEDITERRANEAN_IDS = new Set([
  'andalus','casablanca','velvet','alexandria241','cairo0047','beirut0113','damascusBlueHour','istanbul0326','tangierSmoke','bosphorusRain',
  'beirutRooftop0412','casablancaLastCall','cairoQuietHours','nileBalcony0152','aleppoAfterRain','ammanVelvetRoom','medinaBlueSmoke','cairoRedLantern',
  'beirutNightTaxi','tangierRedTable','istanbulBackgammon','andalusianCoast','granadaPatio','cadizLanterns','terraceFireflies','cafeFirelight','malagaLastTram','bishopBlues',
]);
const ELECTRONIC_IDS = new Set(['clockwork','electricDesert','storm','orbitalMonastery','metro317','glassAsh','analogBunker','nightFreight','machineRoom']);
export const CURATED_HIDDEN_THEME_IDS = new Set(['orbitalMonastery','metro317','glassAsh','machineRoom','abyssalArchive','redVault']);
const CLASSICAL_IDS = new Set(['gambit','cathedral','duel','lateEndgame','rigaRain','kingTango','zugzwangWaltz','winterLibrary','queenRequiem','endgameAdagio','knightFugue','nocturnalQuartet']);
function ambientGenre(theme) {
  if (theme.genre) return theme.genre;
  if (CLASSICAL_IDS.has(theme.id)) return 'Clásica';
  if (MEDITERRANEAN_IDS.has(theme.id)) return 'Jazz / Mediterráneo';
  if (ELECTRONIC_IDS.has(theme.id)) return 'Electrónica / Experimental';
  return 'Ambient / Otros';
}

export const AMBIENT_THEME_OPTIONS = Object.values(AMBIENT_THEMES)
  .filter(({ id }) => !CURATED_HIDDEN_THEME_IDS.has(id))
  .map(({ id, label, description, ...theme }) => ({
    id, label, description, genre: ambientGenre({ id, ...theme }),
  }));
export const AMBIENT_THEME_GROUPS = AMBIENT_GENRE_ORDER.map((genre) => ({
  genre,
  themes: AMBIENT_THEME_OPTIONS.filter((theme) => theme.genre === genre),
})).filter((group) => group.themes.length);
