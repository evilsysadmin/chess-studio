import { setProfileStorageItem } from './profileKeys.js';

// sound.js — Efectos de sonido cortitos generados con la Web Audio API. Nada
// de archivos de audio: son un par de "beeps" sintetizados al vuelo, así que
// no suman peso ni dependen de una CDN. El estado de silencio se guarda en
// localStorage para que se recuerde entre sesiones.

const LEGACY_MUTE_KEY = 'chess-study-muted';
const MUSIC_MUTED_KEY = 'chess-study-music-muted';
const FX_MUTED_KEY = 'chess-study-fx-muted';
const AMBIENT_THEME_KEY = 'chess-study-ambient-theme';
const DEFAULT_AMBIENT_THEME = 'andalus';

let audioCtx = null;
function getContext() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    audioCtx = new AudioContextClass();
  }
  return audioCtx;
}

function readChannelMuted(key) {
  if (typeof localStorage === 'undefined') return false;
  const explicit = localStorage.getItem(key);
  if (explicit !== null) return explicit === '1';
  // Compatibilidad con perfiles anteriores que solo tenían un mute global.
  return localStorage.getItem(LEGACY_MUTE_KEY) === '1';
}

export function isMusicMuted() {
  return readChannelMuted(MUSIC_MUTED_KEY);
}

export function isFxMuted() {
  return readChannelMuted(FX_MUTED_KEY);
}

export function setMusicMuted(muted) {
  setProfileStorageItem(MUSIC_MUTED_KEY, muted ? '1' : '0');
  if (muted) stopAmbientMusic();
  else startAmbientMusic();
}

export function setFxMuted(muted) {
  setProfileStorageItem(FX_MUTED_KEY, muted ? '1' : '0');
}

// API heredada: conservarla evita romper imports antiguos y permite que un
// perfil viejo con mute global siga teniendo una transición limpia.
export function isMuted() {
  return isMusicMuted() && isFxMuted();
}

export function setMuted(muted) {
  setMusicMuted(muted);
  setFxMuted(muted);
}

function beep({ freq, duration, type = 'sine', gain = 0.06, delay = 0 }) {
  if (isFxMuted()) return;
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const start = ctx.currentTime + delay;

  gainNode.gain.setValueAtTime(0, start);
  gainNode.gain.linearRampToValueAtTime(gain, start + 0.008);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

// Clic seco al mover una pieza.
export function playMoveSound() {
  beep({ freq: 520, duration: 0.09, type: 'triangle', gain: 0.05 });
}

// Golpe más grave al capturar, con un segundo "impacto" superpuesto.
export function playCaptureSound() {
  beep({ freq: 220, duration: 0.14, type: 'square', gain: 0.05 });
  beep({ freq: 140, duration: 0.16, type: 'square', gain: 0.045, delay: 0.02 });
}

// Arpegio ascendente breve para el jaque mate / fin de partida ganada.
export function playSuccessSound() {
  [523, 659, 784].forEach((freq, i) => beep({ freq, duration: 0.18, type: 'triangle', gain: 0.05, delay: i * 0.09 }));
}

// Sonido apagado/descendente para cuando un ataque falla (esquive), en
// Modo Combate — deliberadamente menos satisfactorio que un acierto.
export function playMissSound() {
  beep({ freq: 260, duration: 0.1, type: 'sine', gain: 0.035 });
  beep({ freq: 180, duration: 0.14, type: 'sine', gain: 0.03, delay: 0.06 });
}

// Aviso único y discreto al entrar en apuros de tiempo. No hace tic-tac
// constante: sería insoportable y además competiría con el propio reloj.
export function playTimePressureSound() {
  beep({ freq: 880, duration: 0.07, type: 'sine', gain: 0.028 });
  beep({ freq: 660, duration: 0.09, type: 'sine', gain: 0.025, delay: 0.08 });
}

// FX contextuales: no sustituyen el comentario; sólo subrayan eventos realmente
// memorables con una firma corta. Respetan el mute de FX y no usan assets.
export function playNoteworthySound(event, actor = 'human') {
  const type = event?.type;
  if (!type) return;
  if (['MISSED_MATE', 'ALLOWED_MATE', 'QUEEN_EN_PRISE_TO_PAWN', 'STALEMATE_BLUNDER'].includes(type)) {
    beep({ freq: 155, duration: 0.22, type: 'sawtooth', gain: 0.045 });
    beep({ freq: 103, duration: 0.3, type: 'square', gain: 0.035, delay: 0.1 });
    return;
  }
  if (['PAWN_TAKES_QUEEN', 'QUEEN_WIN', 'KNIGHT_FORK', 'PAWN_FORK', 'SKEWER', 'DISCOVERED_ATTACK'].includes(type)) {
    const up = actor === 'human';
    const notes = up ? [392, 523, 659] : [330, 247, 196];
    notes.forEach((freq, i) => beep({ freq, duration: 0.12, type: 'triangle', gain: 0.035, delay: i * 0.055 }));
    return;
  }
  if (['MATE_FOUND', 'PROMOTION', 'GREAT_SACRIFICE'].includes(type)) {
    [440, 554, 659, 880].forEach((freq, i) => beep({ freq, duration: 0.16, type: 'triangle', gain: 0.04, delay: i * 0.06 }));
  }
}

// ---------- Música ambiental (solo en el menú principal) ----------
//
// Iteración 5: hasta acá todo giraba siempre sobre el mismo centro tonal
// (Do) — sonando fijo para siempre es justo el tipo de "tensión que nunca
// se resuelve" que caracteriza a la música de tensión/terror. Ahora el
// centro tonal ROTA cada cierto tiempo entre tres posiciones: Do (tónica),
// Fa (subdominante, más abierto/relajado), y Reb (el color "español"/
// frigio, la 2a menor sobre la tónica — el propio movimiento armónico que
// le da nombre a la escala). Todo (pad, cuerdas, saxo) se transpone junto
// al cambiar de centro, así que hay una sensación real de "la música se
// mueve" en vez de un loop estático. También se suma un segundo timbre de
// percusión (un "tak" agudo, además del "dum" grave que ya había) para
// más textura rítmica.
//
// Iteración 4: se suman dos voces más. Guitarra española — comparte el
// motor de frases con el laúd/oud, pero con timbre distinto (dos
// osciladores levemente desafinados entre sí, el "chorus" natural de una
// cuerda de nylon, más brillante que el oud) — y saxofón, una voz de
// "solo" aparte, más escasa y con vibrato de verdad (un oscilador de baja
// frecuencia modulando el `frequency` del oscilador principal — así es
// como se hace vibrato de forma nativa en Web Audio API, no es un truco).
//
// Sigue siendo Phrygian dominant en Do para todo — la segunda aumentada
// entre el 2° y 3er grado (Db→E) es la sustitución más reconocible en
// temperamento igual de 12 tonos para sonoridad "oriental"; un maqam real
// usa cuartos de tono que Web Audio API no puede producir de forma nativa.

// Centro tonal actual, en semitonos de desplazamiento sobre Do — rota
// entre estas 3 posiciones con el tiempo (ver startAmbientMusic).
const KEY_CENTERS_SEMITONES = [0, 5, 1, 7]; // Do (tónica) / Fa (subdominante) / Reb (color frigio) / Sol (dominante, más cálido/familiar)
let keyCenterIndex = 0;

function transpose(freq, semitones) {
  return freq * Math.pow(2, semitones / 12);
}

function currentOffset(theme) {
  const centers = theme?.keyCenters || KEY_CENTERS_SEMITONES;
  return centers[keyCenterIndex % centers.length];
}

const OUD_SCALE = [130.81, 138.59, 164.81, 174.61, 195.99, 207.65, 233.08]; // C3 Db3 E3 F3 G3 Ab3 Bb3

// Contrabajo: una octava por debajo de OUD_SCALE, walking bass simple —
// nueva capa, para sumar color y un ancla armónica grave que hasta acá no
// existía (el pad sostiene acordes, esto camina por debajo marcando el
// pulso, más "jazz" que "drone").
const BASS_SCALE = OUD_SCALE.map((f) => f / 2); // C2 Db2 E2 F2 G2 Ab2 Bb2
const BASS_PATTERN = [0, 4, 0, 6]; // tónica, quinta, tónica, séptima bemol — un compás completo (4 pasos de negra)
const BASS_STEP_GAP = 4; // una nota cada 4 dieciseisavos = pulso de negra
const BASS_DURATION_S = 0.9;

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
const STEPS_PER_BAR = 16;
const BAR_MS = STEP_MS * STEPS_PER_BAR; // 2240ms, un compás completo

const PHRASE_NOTE_GAP_MS = 190; // notas dentro de una frase, bien pegadas
const PLUCK_GAP_STEPS = 8; // cada medio compás intenta una frase
const PLUCK_DURATION_S = 1.4;
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
const SAX_NOTE_GAP_MS = 620;
const SAX_GAP_STEPS = 32; // 2 compases exactos — antes eran 20, que NO es múltiplo de 16 (el compás):
// tardaba 4 compases en volver a alinearse con el patrón de percusión, entrando en un punto
// distinto cada vez — eso sonaba a "cada voz por su lado" aunque compartieran el mismo reloj.
const SAX_DURATION_S = 2.3;
const SAX_CHANCE = 0.4;

// Subido una octava (antes C3/G3/Bb3, sonaba a "drone de sótano") — más
// arriba se siente cálido y presente, menos "algo acecha en la oscuridad".
// Ataque más corto también (antes 0.9s), para que no se sienta como algo
// apareciendo de la nada.
const PAD_NOTES = [261.63, 392.0, 466.16, 392.0]; // C4 G4 Bb4 G4 — tónica/quinta/séptima, una octava más arriba
const PAD_GAP_STEPS = 16; // un compás completo por nota del pad
const PAD_DURATION_S = 3.5; // bajado de 4.5 — menos sostenido/fantasmal
const PAD_ATTACK_S = 0.5; // bajado de 0.9

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
const AMBIENT_THEMES = {
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
    id: 'gambit', engine: 'structured', label: 'Gambito de marfil',
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
    description: 'Caja de música, clicks mecánicos y un ostinato de reloj de torneo.',
    stepMs: 112, stepsPerSection: 32, leadInstrument: 'musicbox', chordInstrument: 'bell', bassInstrument: 'pizz',
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

export const AMBIENT_THEME_OPTIONS = Object.values(AMBIENT_THEMES).map(({ id, label, description }) => ({
  id, label, description,
}));

export function getAmbientThemeId() {
  if (typeof localStorage === 'undefined') return DEFAULT_AMBIENT_THEME;
  const saved = localStorage.getItem(AMBIENT_THEME_KEY);
  return AMBIENT_THEMES[saved] ? saved : DEFAULT_AMBIENT_THEME;
}

function getActiveAmbientTheme() {
  return AMBIENT_THEMES[getAmbientThemeId()] || AMBIENT_THEMES[DEFAULT_AMBIENT_THEME];
}

export function setAmbientTheme(themeId) {
  const nextId = AMBIENT_THEMES[themeId] ? themeId : DEFAULT_AMBIENT_THEME;
  const wasPlaying = !!stepTimer;
  setProfileStorageItem(AMBIENT_THEME_KEY, nextId);
  if (wasPlaying) {
    stopAmbientMusic();
    startAmbientMusic();
  }
  return nextId;
}

let stepTimer = null;
let padIndex = 0;
const KEY_CHANGE_STEPS = STEPS_PER_BAR * 6; // cada 6 compases (~13.4s)

function playPadNote(freq) {
  if (isMusicMuted()) return;
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const start = ctx.currentTime;

  gainNode.gain.setValueAtTime(0, start);
  gainNode.gain.linearRampToValueAtTime(0.02, start + PAD_ATTACK_S);
  gainNode.gain.linearRampToValueAtTime(0, start + PAD_DURATION_S);

  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + PAD_DURATION_S + 0.05);
}

// Contrabajo: triangle (más cuerpo que sine, menos brillo que sawtooth)
// con un toque de sawtooth grave mezclado para dar algo de definición al
// ataque, tipo pizzicato — no un tono puro, que sonaría a sintetizador y
// no a cuerda grave punteada.
function playBass(freq) {
  if (isMusicMuted()) return;
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const start = ctx.currentTime;

  const body = ctx.createOscillator();
  const bodyGain = ctx.createGain();
  body.type = 'triangle';
  body.frequency.value = freq;
  bodyGain.gain.setValueAtTime(0, start);
  bodyGain.gain.linearRampToValueAtTime(0.05, start + 0.02); // ataque rápido, tipo pizzicato
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, start + BASS_DURATION_S);
  body.connect(bodyGain);
  bodyGain.connect(ctx.destination);

  const edge = ctx.createOscillator();
  const edgeGain = ctx.createGain();
  const edgeFilter = ctx.createBiquadFilter();
  edge.type = 'sawtooth';
  edge.frequency.value = freq;
  edgeFilter.type = 'lowpass';
  edgeFilter.frequency.value = freq * 3; // solo un poco de mordiente, no el brillo completo de la sierra
  edgeGain.gain.setValueAtTime(0, start);
  edgeGain.gain.linearRampToValueAtTime(0.015, start + 0.015);
  edgeGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25); // mucho más corto que el cuerpo — solo el ataque
  edge.connect(edgeFilter);
  edgeFilter.connect(edgeGain);
  edgeGain.connect(ctx.destination);

  body.start(start);
  body.stop(start + BASS_DURATION_S + 0.05);
  edge.start(start);
  edge.stop(start + 0.3);
}

function playOudPluck(freq) {
  if (isMusicMuted()) return;
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gainNode = ctx.createGain();

  osc.type = 'sawtooth'; // más armónicos que un seno — más "cuerda", menos "flauta"
  osc.frequency.value = freq;
  filter.type = 'lowpass';
  filter.frequency.value = freq * 3.4; // antes freq*4 — un poco más oscuro, el centroide
  // espectral de la referencia salió bajo (~1055Hz), tímbrica cálida no brillante
  filter.Q.value = 0.7;

  const start = ctx.currentTime;
  gainNode.gain.setValueAtTime(0, start);
  gainNode.gain.linearRampToValueAtTime(0.05, start + 0.008); // ataque rápido, tipo punteo
  gainNode.gain.exponentialRampToValueAtTime(0.0001, start + PLUCK_DURATION_S);

  osc.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + PLUCK_DURATION_S + 0.05);
}

// Guitarra española: mismo esqueleto que el punteo de oud (diente de
// sierra + filtro, ataque rápido), pero con DOS osciladores levemente
// desafinados entre sí (unos pocos centésimos de semitono) — es el
// "chorus" natural de una cuerda de verdad vibrando, no una sola onda
// pura. Se deja pasar un poco más de brillo en el filtro que en el oud,
// que es más apagado/redondo por diseño.
function playGuitarPluck(freq) {
  if (isMusicMuted()) return;
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const filter = ctx.createBiquadFilter();
  const gainNode = ctx.createGain();
  filter.type = 'lowpass';
  filter.frequency.value = freq * 5.2; // antes freq*6 — un poco más oscuro, mismo criterio que el oud
  filter.Q.value = 0.6;

  const start = ctx.currentTime;
  gainNode.gain.setValueAtTime(0, start);
  gainNode.gain.linearRampToValueAtTime(0.045, start + 0.006);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, start + PLUCK_DURATION_S * 1.15);

  filter.connect(gainNode);
  gainNode.connect(ctx.destination);

  const detunesCents = [-6, 6]; // dos voces, una levemente grave y otra aguda
  const oscs = detunesCents.map((cents) => {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    osc.detune.value = cents;
    osc.connect(filter);
    return osc;
  });

  oscs.forEach((osc) => {
    osc.start(start);
    osc.stop(start + PLUCK_DURATION_S * 1.15 + 0.05);
  });
}

// Toca una frase completa sobre UN instrumento (oud o guitarra, elegido
// una vez para toda la frase, no nota por nota — así cada frase suena
// como un instrumento tocando de verdad, no una mezcla rara). Cada nota
// vuelve a chequear isMusicMuted() por su cuenta al disparar, así que
// silenciar a mitad de una frase la corta ahí sin dejar nada raro sonando.
function playPhrase(scaleIndices, instrument, scale = OUD_SCALE, offset = 0, noteGapMs = PHRASE_NOTE_GAP_MS) {
  const playNote = instrument === 'guitar' ? playGuitarPluck : playOudPluck;
  scaleIndices.forEach((idx, i) => {
    setTimeout(() => playNote(transpose(scale[idx], offset)), i * noteGapMs);
  });
}

// Saxofón: diente de sierra con un filtro resonante (Q más alto que las
// cuerdas — simula el formante de la lengüeta) y un LFO modulando la
// frecuencia del oscilador principal para el vibrato — así es como se
// hace vibrato de verdad en Web Audio API (un oscilador modulando el
// parámetro `frequency` de otro), no un efecto simulado con trucos.
// Ataque más lento que el punteo (un sax "entra" en la nota, no la
// golpea) y bastante más sostenido.
function playSax(freq) {
  if (isMusicMuted()) return;
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gainNode = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.value = freq;
  filter.type = 'lowpass';
  filter.frequency.value = freq * 2.9; // antes freq*3.2 — mismo criterio de calidez que las cuerdas
  filter.Q.value = 2.2; // resonancia — el formante "de lengüeta" del saxo

  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.type = 'sine';
  lfo.frequency.value = 5.3; // Hz — vibrato natural, ni tembloroso ni imperceptible
  lfoGain.gain.value = freq * 0.008; // profundidad chica y sutil
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);

  const start = ctx.currentTime;
  const attackS = 0.12; // "entra" en la nota en vez de golpearla, a diferencia del punteo
  gainNode.gain.setValueAtTime(0, start);
  gainNode.gain.linearRampToValueAtTime(0.035, start + attackS);
  gainNode.gain.linearRampToValueAtTime(0.028, start + attackS + 0.35);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, start + SAX_DURATION_S);

  osc.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);

  lfo.start(start);
  osc.start(start);
  osc.stop(start + SAX_DURATION_S + 0.05);
  lfo.stop(start + SAX_DURATION_S + 0.05);
}

function playSaxPhrase(scaleIndices, scale = OUD_SCALE, offset = 0, noteGapMs = SAX_NOTE_GAP_MS) {
  scaleIndices.forEach((idx, i) => {
    setTimeout(() => playSax(transpose(scale[idx], offset)), i * noteGapMs);
  });
}

// Percusión suave: ruido blanco corto, filtrado bien grave (nada de brillo
// tipo hi-hat), decaimiento rápido — un "thump" sordo tipo pandero, no un
// golpe de batería. `volume` es el volumen de ESTE golpe puntual (0 =
// directamente no se llama).
// "Dum" grave: hasta ahora era solo ruido filtrado, que da el "click" del
// golpe pero no el "boom" — le faltaba cuerpo grave de verdad. Se le suma
// un oscilador con caída de tono (arranca en 150Hz y cae rápido a 45Hz en
// ~0.09s) — la técnica clásica de síntesis de bombo tipo 808 — sonando
// JUNTO con el ruido de siempre, no en su lugar: el tono da el peso, el
// ruido sigue dando la definición del golpe.
function playSoftPercussion(volume) {
  if (isMusicMuted() || volume <= 0) return;
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const start = ctx.currentTime;

  // Cuerpo tonal: la parte que faltaba.
  const bodyDurationS = 0.32;
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, start);
  osc.frequency.exponentialRampToValueAtTime(45, start + 0.09);
  oscGain.gain.setValueAtTime(volume * 1.6, start); // el tono lleva más peso que el ruido en la mezcla
  oscGain.gain.exponentialRampToValueAtTime(0.0001, start + bodyDurationS);
  osc.connect(oscGain);
  oscGain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + bodyDurationS + 0.05);

  // Ruido para la definición del golpe (igual que antes).
  const noiseDurationS = 0.22;
  const bufferSize = Math.floor(ctx.sampleRate * noiseDurationS);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }

  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 450;

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(volume, start);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, start + noiseDurationS);

  noiseSource.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noiseSource.start(start);
}

// "Tak" agudo: mismo mecanismo (ruido blanco filtrado) que el "dum", pero
// genuinamente otro timbre, no la misma nota más floja — más corto
// (0.09s vs 0.22s) y con un filtro pasa-banda centrado bien arriba
// (1400Hz) en vez de pasa-bajos, para un "click" seco tipo borde de
// pandero en vez de un golpe sordo de centro.
function playHighTak(volume) {
  if (isMusicMuted() || volume <= 0) return;
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const durationS = 0.09;
  const bufferSize = Math.floor(ctx.sampleRate * durationS);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }

  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1400;
  filter.Q.value = 1.2;

  const gainNode = ctx.createGain();
  const start = ctx.currentTime;
  gainNode.gain.setValueAtTime(volume, start);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, start + durationS);

  noiseSource.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);
  noiseSource.start(start);
}

function midiToFreq(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

function voicePreset(kind) {
  switch (kind) {
    case 'felt': return { waves: [['triangle', 1, 1], ['sine', 2, 0.22]], gain: 0.024, attack: 0.012, release: 1.65, cutoff: 1800 };
    case 'harpsichord': return { waves: [['sawtooth', 1, 1], ['square', 2, 0.13]], gain: 0.018, attack: 0.003, release: 0.48, cutoff: 3900 };
    case 'vibes': return { waves: [['sine', 1, 1], ['sine', 4, 0.16]], gain: 0.026, attack: 0.008, release: 2.35, cutoff: 5200, tremolo: 5.2 };
    case 'epiano': return { waves: [['sine', 1, 1], ['triangle', 2, 0.18]], gain: 0.021, attack: 0.018, release: 1.45, cutoff: 2600 };
    case 'cello': return { waves: [['sawtooth', 1, 1], ['triangle', 0.5, 0.18]], gain: 0.017, attack: 0.09, release: 2.1, cutoff: 920 };
    case 'pizz': return { waves: [['triangle', 1, 1], ['sine', 2, 0.12]], gain: 0.026, attack: 0.004, release: 0.52, cutoff: 1700 };
    case 'bass': return { waves: [['triangle', 1, 1], ['sine', 0.5, 0.18]], gain: 0.029, attack: 0.008, release: 0.72, cutoff: 760 };
    case 'brass': return { waves: [['sawtooth', 1, 1], ['square', 0.5, 0.1]], gain: 0.016, attack: 0.065, release: 1.2, cutoff: 1250 };
    case 'musicbox': return { waves: [['sine', 1, 1], ['sine', 3, 0.25], ['sine', 5, 0.08]], gain: 0.019, attack: 0.002, release: 1.55, cutoff: 6500 };
    case 'bell': return { waves: [['sine', 1, 1], ['sine', 2.01, 0.2], ['sine', 3.99, 0.08]], gain: 0.018, attack: 0.004, release: 2.3, cutoff: 7000 };
    case 'synth': return { waves: [['sawtooth', 1, 1], ['square', 2, 0.08]], gain: 0.017, attack: 0.018, release: 0.52, cutoff: 1450 };
    case 'synthbass': return { waves: [['square', 1, 0.55], ['triangle', 1, 1]], gain: 0.026, attack: 0.006, release: 0.42, cutoff: 640 };
    case 'pad': return { waves: [['sine', 1, 1], ['triangle', 2, 0.08]], gain: 0.014, attack: 0.28, release: 2.9, cutoff: 1600 };
    case 'organ': return { waves: [['sine', 1, 1], ['sine', 2, 0.28], ['sine', 3, 0.09]], gain: 0.014, attack: 0.22, release: 4.25, cutoff: 2100 };
    case 'organbass': return { waves: [['sine', 1, 1], ['triangle', 0.5, 0.2]], gain: 0.022, attack: 0.18, release: 4.0, cutoff: 580 };
    case 'tremolo': return { waves: [['triangle', 1, 1], ['sawtooth', 1, 0.09]], gain: 0.019, attack: 0.02, release: 1.9, cutoff: 2100, tremolo: 7.0 };
    case 'guitar2': return { waves: [['triangle', 1, 1], ['sawtooth', 2, 0.07]], gain: 0.018, attack: 0.004, release: 0.82, cutoff: 2300 };
    case 'arp': return { waves: [['square', 1, 0.45], ['sawtooth', 1, 1]], gain: 0.014, attack: 0.004, release: 0.28, cutoff: 1800 };
    case 'marimba': return { waves: [['sine', 1, 1], ['sine', 4, 0.2], ['triangle', 2, 0.08]], gain: 0.025, attack: 0.003, release: 0.72, cutoff: 4200 };
    case 'glass': return { waves: [['sine', 1, 1], ['sine', 2.7, 0.2], ['sine', 5.4, 0.08]], gain: 0.017, attack: 0.018, release: 3.2, cutoff: 7600, tremolo: 3.1 };
    case 'bandoneon': return { waves: [['sawtooth', 1, 0.72], ['square', 2, 0.16], ['sine', 1, 0.3]], gain: 0.016, attack: 0.045, release: 0.9, cutoff: 1850 };
    case 'choir': return { waves: [['sine', 1, 1], ['triangle', 1, 0.24], ['sine', 2, 0.12]], gain: 0.013, attack: 0.38, release: 4.4, cutoff: 1550, tremolo: 4.2 };
    case 'pulse': return { waves: [['square', 1, 0.5], ['sine', 1, 0.5]], gain: 0.015, attack: 0.003, release: 0.22, cutoff: 2400 };
    case 'metallic': return { waves: [['square', 1, 0.42], ['sine', 2.41, 0.34], ['sine', 4.83, 0.12]], gain: 0.014, attack: 0.004, release: 0.48, cutoff: 3200 };
    default: return { waves: [['sine', 1, 1]], gain: 0.02, attack: 0.01, release: 0.8, cutoff: 2500 };
  }
}

function playStructuredVoice(kind, midiNote, volumeScale = 1, durationOverride = null) {
  if (isMusicMuted() || midiNote == null) return;
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const preset = voicePreset(kind);
  const freq = midiToFreq(midiNote);
  const start = ctx.currentTime;
  const release = durationOverride || preset.release;
  const filter = ctx.createBiquadFilter();
  const gainNode = ctx.createGain();
  filter.type = 'lowpass';
  filter.frequency.value = preset.cutoff;
  filter.Q.value = kind === 'synth' || kind === 'arp' ? 1.4 : 0.55;

  const peak = preset.gain * volumeScale;
  gainNode.gain.setValueAtTime(0.0001, start);
  gainNode.gain.linearRampToValueAtTime(peak, start + preset.attack);
  if (kind === 'organ' || kind === 'organbass' || kind === 'pad') {
    gainNode.gain.setValueAtTime(peak * 0.82, start + Math.max(preset.attack + 0.05, release * 0.7));
  }
  gainNode.gain.exponentialRampToValueAtTime(0.0001, start + release);

  filter.connect(gainNode);
  gainNode.connect(ctx.destination);

  const oscillators = preset.waves.map(([type, ratio, mix], index) => {
    const osc = ctx.createOscillator();
    const mixGain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq * ratio;
    // Un desafinado microscópico evita que acordes de osciladores idénticos
    // se conviertan en una onda clínica sin vida.
    osc.detune.value = index === 0 ? -2 : 2 + index;
    mixGain.gain.value = mix;
    osc.connect(mixGain);
    mixGain.connect(filter);
    return osc;
  });

  let lfo = null;
  let lfoGain = null;
  if (preset.tremolo) {
    lfo = ctx.createOscillator();
    lfoGain = ctx.createGain();
    lfo.frequency.value = preset.tremolo;
    lfoGain.gain.value = peak * 0.2;
    lfo.connect(lfoGain);
    lfoGain.connect(gainNode.gain);
    lfo.start(start);
    lfo.stop(start + release + 0.05);
  }

  oscillators.forEach((osc) => {
    osc.start(start);
    osc.stop(start + release + 0.05);
  });
}

function playStructuredChord(kind, notes, duration = null) {
  if (!Array.isArray(notes)) return;
  const scale = Math.max(0.42, 1 / Math.sqrt(notes.length));
  notes.forEach((note) => playStructuredVoice(kind, note, scale, duration));
}

function playNoiseHit(kind, volume = 0.03) {
  if (isMusicMuted()) return;
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const duration = kind === 'brush' ? 0.18 : 0.085;
  const size = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = kind === 'brush' || kind === 'hat' ? 'highpass' : 'bandpass';
  filter.frequency.value = kind === 'brush' ? 1900 : kind === 'hat' ? 4800 : 1500;
  filter.Q.value = kind === 'snare' ? 1.0 : 0.5;
  const gain = ctx.createGain();
  const start = ctx.currentTime;
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(start);
}

function playWoodblock() {
  if (isMusicMuted()) return;
  const ctx = getContext();
  if (!ctx) return;
  const start = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(780, start);
  osc.frequency.exponentialRampToValueAtTime(520, start + 0.055);
  gain.gain.setValueAtTime(0.028, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.08);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + 0.09);
}

function playMetalHit() {
  if (isMusicMuted()) return;
  const ctx = getContext();
  if (!ctx) return;
  const start = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.024, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.34);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1180;
  filter.Q.value = 2.8;
  filter.connect(gain);
  gain.connect(ctx.destination);
  [1, 1.47, 2.17].forEach((ratio, i) => {
    const osc = ctx.createOscillator();
    const mix = ctx.createGain();
    osc.type = i === 0 ? 'triangle' : 'sine';
    osc.frequency.value = 430 * ratio;
    mix.gain.value = i === 0 ? 0.7 : 0.34;
    osc.connect(mix);
    mix.connect(filter);
    osc.start(start);
    osc.stop(start + 0.36);
  });
}

function playStructuredDrum(code) {
  if (code === 'K') playSoftPercussion(0.055);
  else if (code === 'S') playNoiseHit('snare', 0.028);
  else if (code === 'H') playNoiseHit('hat', 0.014);
  else if (code === 'B') playNoiseHit('brush', 0.012);
  else if (code === 'W') playWoodblock();
  else if (code === 'M') playMetalHit();
}

function startStructuredMusic(theme) {
  let step = 0;
  const stepsPerSection = Math.max(1, theme.stepsPerSection || 32);

  function tick() {
    if (isMusicMuted()) {
      stepTimer = null;
      return;
    }
    const sectionIndex = Math.floor(step / stepsPerSection) % theme.sections.length;
    const localStep = step % stepsPerSection;
    const section = theme.sections[sectionIndex];

    const lead = section.lead?.[localStep];
    const bass = section.bass?.[localStep];
    const chord = section.chords?.[localStep];
    const drum = section.drums?.[localStep];

    if (lead != null) playStructuredVoice(theme.leadInstrument, lead, 1);
    if (bass != null) playStructuredVoice(theme.bassInstrument, bass, 0.9);
    if (chord) {
      const longChord = ['organ', 'pad'].includes(theme.chordInstrument);
      const duration = longChord ? (theme.stepMs * 15.5) / 1000 : null;
      playStructuredChord(theme.chordInstrument, chord, duration);
    }
    if (drum) playStructuredDrum(drum);

    step += 1;
    stepTimer = setTimeout(tick, theme.stepMs);
  }

  tick();
}

export function startAmbientMusic() {
  if (isMusicMuted()) return;
  if (stepTimer) return; // ya está sonando, no duplicar el loop

  const theme = getActiveAmbientTheme();
  if (theme.engine === 'structured') {
    startStructuredMusic(theme);
    return;
  }
  // Al-Ándalus cae por aquí y conserva el generador original intacto.
  const bassScale = theme.scale.map((f) => f / 2);
  const keyChangeSteps = STEPS_PER_BAR * theme.keyChangeBars;
  let step = 0;
  let phraseIndex = 0;
  let saxPhraseIndex = 0;
  let percussionIndex = 0;
  let currentPercussionPattern = theme.percussionPatterns[0];

  function tick() {
    const barStep = step % STEPS_PER_BAR;

    if (barStep === 0) {
      currentPercussionPattern = theme.sequenceMode === 'cycle'
        ? theme.percussionPatterns[percussionIndex++ % theme.percussionPatterns.length]
        : theme.percussionPatterns[Math.floor(Math.random() * theme.percussionPatterns.length)];
    }
    const percStep = currentPercussionPattern[barStep];
    if (percStep) {
      const [type, volume] = percStep;
      if (type === 'dum') playSoftPercussion(volume);
      else playHighTak(volume);
    }

    if (barStep % BASS_STEP_GAP === 0) {
      const bassIndex = theme.bassPattern[Math.floor(barStep / BASS_STEP_GAP) % theme.bassPattern.length];
      playBass(transpose(bassScale[bassIndex], currentOffset(theme)));
    }

    if (step % PAD_GAP_STEPS === 0) {
      playPadNote(transpose(theme.padNotes[padIndex % theme.padNotes.length], currentOffset(theme)));
      padIndex += 1;
    }

    if (step % theme.pluckGapSteps === 0 && Math.random() < theme.pluckChance) {
      const phrase = theme.sequenceMode === 'cycle'
        ? theme.phrases[phraseIndex++ % theme.phrases.length]
        : theme.phrases[Math.floor(Math.random() * theme.phrases.length)];
      const instrument = theme.sequenceMode === 'cycle'
        ? theme.instruments[(phraseIndex - 1) % theme.instruments.length]
        : theme.instruments[Math.floor(Math.random() * theme.instruments.length)];
      playPhrase(phrase, instrument, theme.scale, currentOffset(theme), theme.phraseNoteGapMs);
    }

    if (step % theme.saxGapSteps === 0 && Math.random() < theme.saxChance) {
      const phrase = theme.sequenceMode === 'cycle'
        ? theme.saxPhrases[saxPhraseIndex++ % theme.saxPhrases.length]
        : theme.saxPhrases[Math.floor(Math.random() * theme.saxPhrases.length)];
      playSaxPhrase(phrase, theme.scale, currentOffset(theme), theme.saxNoteGapMs);
    }

    if (step > 0 && step % keyChangeSteps === 0) {
      keyCenterIndex += 1;
    }

    step += 1;
    stepTimer = setTimeout(tick, theme.stepMs);
  }

  tick();
}

export function stopAmbientMusic() {
  if (stepTimer) {
    clearTimeout(stepTimer);
    stepTimer = null;
  }
  keyCenterIndex = 0; // vuelve a empezar en la tónica la próxima vez, no donde quedó
  padIndex = 0;
}
