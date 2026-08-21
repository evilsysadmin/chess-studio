import { setProfileStorageItem } from './profileKeys.js';

// sound.js — Efectos de sonido cortitos generados con la Web Audio API. Nada
// de archivos de audio: son un par de "beeps" sintetizados al vuelo, así que
// no suman peso ni dependen de una CDN. El estado de silencio se guarda en
// localStorage para que se recuerde entre sesiones.

const LEGACY_MUTE_KEY = 'chess-study-muted';
const MUSIC_MUTED_KEY = 'chess-study-music-muted';
const FX_MUTED_KEY = 'chess-study-fx-muted';
const MUSIC_VOLUME_KEY = 'chess-study-music-volume';
const LEGACY_AMBIENT_THEME_KEY = 'chess-study-ambient-theme';
const AMBIENT_THEME_SESSION_KEY = 'chess-study-ambient-theme-session';
const DEFAULT_AMBIENT_THEME = 'andalus';
// La radio de sesión deja un pequeño hueco real entre piezas. No encadenamos
// los finales como si fueran jingles publicitarios: termina el tema, respira,
// y entra otro distinto.
export const AMBIENT_INTER_TRACK_SILENCE_MS = 2400;
const ANDALUS_TRACK_DURATION_MS = 240000;

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
  // Mute y transporte son cosas distintas: silenciar no reinicia ni pausa el
  // tema. Los secuenciadores siguen avanzando en silencio y al desmutear se
  // recupera exactamente el punto musical de esa sesión. Si la música estaba
  // detenida, desmutearla no inventa un Play implícito.
  notifyAmbientTransport();
}

export function setFxMuted(muted) {
  setProfileStorageItem(FX_MUTED_KEY, muted ? '1' : '0');
}


export function getAmbientVolume() {
  if (typeof localStorage === 'undefined') return 1;
  const raw = Number.parseFloat(localStorage.getItem(MUSIC_VOLUME_KEY) || '1');
  if (!Number.isFinite(raw)) return 1;
  return Math.min(1, Math.max(0, raw));
}

export function setAmbientVolume(value) {
  const normalized = Math.min(1, Math.max(0, Number(value) || 0));
  setProfileStorageItem(MUSIC_VOLUME_KEY, String(normalized));
  applyAmbientMasterGain(0.08);
  notifyAmbientTransport();
  return normalized;
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

// BEEP seco para un intento de movimiento ilegal que dejaría al rey en jaque.
// Deliberadamente desagradable, corto y sin convertirse en una alarma de coche.
export function playIllegalMoveSound() {
  beep({ freq: 980, duration: 0.055, type: 'square', gain: 0.032 });
  beep({ freq: 720, duration: 0.075, type: 'square', gain: 0.03, delay: 0.065 });
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
    description: 'Clarinete, qanun y piano eléctrico en compás quebrado: elegante, nocturno y con una inquietud que nunca termina de sentarse.',
    stepMs: 132, stepsPerSection: 56, longFormMs: 300000, leadInstrument: 'clarinet', counterInstrument: 'qanun', chordInstrument: 'epiano', bassInstrument: 'bass',
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
    description: 'Clarinete, qanun y bajo saltarín: una mesa de tavla al fondo, conversación alta y todavía queda noche.',
    stepMs: 110, stepsPerSection: 72, longFormMs: 340000, leadInstrument: 'clarinet', counterInstrument: 'qanun', chordInstrument: 'epiano', bassInstrument: 'bass',
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

// V16.6 — otro bloque menos contemplativo: costa andalusí (oud + guitarra)
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


// V16.6ac — segundo bloque de estilos: deliberadamente NO mediterráneo.
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

export const AMBIENT_THEME_OPTIONS = Object.values(AMBIENT_THEMES).map(({ id, label, description }) => ({
  id, label, description,
}));


// V16.6m — identidad de mezcla/arreglo para el bloque de jazz mediterráneo.
// Antes todos estos temas pasaban por la misma "máquina de variación": misma
// ruta armónica, misma forma de mover secciones y el mismo pulso básico. Eso
// evitaba loops cortos pero homogeneizaba demasiado el catálogo y podía romper
// el arco A→B→C escrito en cada pieza. Los perfiles conservan la composición
// original y cambian feel, sustain, timbre de base y micro-groove por escena.
const STRUCTURED_FEELS = Object.freeze({
  // V16.6aa: identidad por AUSENCIA además de timbre. Cada familia decide
  // qué capas existen; no todo tema necesita lead+counter+chords+bass+drums.
  // El objetivo es que la silueta se reconozca antes que el preset.
  alexandriaLounge: Object.freeze({
    family: 'alexandria-minimal-piano-trio', preserveSectionOrder: true,
    harmonyPath: [0, 0, -2, 0, 3, 0],
    swing: 0.16, warmth: 0.98, releaseScale: 1.22, space: 0.13, delayMs: 165,
    leadInstrument: 'felt', chordInstrument: 'felt', bassInstrument: 'uprightBass',
    chordHoldSteps: 16, bassHoldSteps: 4.2,
    layers: { lead: false, counter: false, chords: true, bass: true, drums: true, signature: true },
    mix: { lead: 0, counter: 0, bass: 0.9, chord: 0.58 },
    percussion: { period: 16, kit: 'brush-jazz', punch: 0.82, pattern: { 0: 'B', 8: 'H' } },
    signature: { instrument: 'felt', sections: [0, 1, 2, 3], everyCycles: 1, repeatPeriod: 32,
      durationSteps: 6.5, volume: 0.56, motif: { 2: 74, 10: 69, 18: 72, 27: 67 } },
  }),
  cairoAfterHours: Object.freeze({
    family: 'cairo-rhodes-horn-noir', preserveSectionOrder: true,
    harmonyPath: [0, -2, 0, 0, -5, 0],
    swing: 0.035, warmth: 0.74, releaseScale: 1.48, space: 0.24, delayMs: 285,
    leadInstrument: 'mutedHorn', chordInstrument: 'rhodesWarm', bassInstrument: 'uprightBass',
    chordHoldSteps: 22, bassHoldSteps: 7,
    layers: { lead: false, counter: false, chords: true, bass: true, drums: true, signature: true },
    mix: { lead: 0, counter: 0, bass: 1.08, chord: 0.86 },
    percussion: { period: 32, kit: 'brush-jazz', punch: 0.72, pattern: { 0: 'B', 24: 'H' } },
    signature: { instrument: 'mutedHorn', sections: [0, 1, 2, 3], everyCycles: 1, repeatPeriod: 40,
      durationSteps: 10, volume: 0.62, motif: { 5: 69, 17: 65.5, 29: 62, 37: 60.5 } },
  }),
  beirutSixEight: Object.freeze({
    family: 'beirut-buzuq-darbuka-6-8', preserveSectionOrder: true,
    harmonyPath: [0, 0, 0, -2, 0, 5],
    swing: 0, warmth: 0.86, releaseScale: 0.96, space: 0.07, delayMs: 105,
    bassInstrument: 'uprightBass', bassHoldSteps: 3.2,
    layers: { lead: false, counter: false, chords: false, bass: true, drums: true, signature: true },
    mix: { lead: 0, counter: 0, bass: 0.72, chord: 0 },
    percussion: { period: 12, kit: 'darbuka', punch: 1.42, pattern: { 0: 'K', 3: 'H', 5: 'W', 6: 'S', 9: 'H', 11: 'W' } },
    signature: { instrument: 'buzuq', sections: [0, 1, 2, 3], everyCycles: 1, repeatPeriod: 24,
      durationSteps: 2.4, volume: 0.9, motif: { 0: 64, 3: 68, 6: 71, 10: 69, 15: 65, 21: 62.5 } },
  }),
  damascusDrone: Object.freeze({
    family: 'damascus-cello-ney-drone', preserveSectionOrder: true,
    harmonyPath: [0, 0, -2, -2, 0, 0],
    swing: 0, warmth: 0.6, releaseScale: 1.78, space: 0.34, delayMs: 380,
    chordInstrument: 'pad', bassInstrument: 'cello', chordHoldSteps: 40, bassHoldSteps: 16,
    drumMode: 'none',
    layers: { lead: false, counter: false, chords: true, bass: true, drums: false, signature: true },
    mix: { lead: 0, counter: 0, bass: 0.56, chord: 0.52 },
    percussion: { period: 64, kit: 'none', punch: 0, pattern: {} },
    signature: { instrument: 'ney', sections: [0, 1, 2, 3], everyCycles: 1, repeatPeriod: 64,
      durationSteps: 15, volume: 0.54, motif: { 9: 74, 31: 69, 53: 66 } },
  }),
  istanbulBroken: Object.freeze({
    family: 'istanbul-clarinet-frame-9-8', preserveSectionOrder: true,
    harmonyPath: [0, 0, 2, 0, -2, 0],
    swing: 0, warmth: 0.82, releaseScale: 0.94, space: 0.075, delayMs: 92,
    bassInstrument: 'uprightBass', bassHoldSteps: 5.0,
    layers: { lead: false, counter: false, chords: false, bass: true, drums: true, signature: true },
    mix: { lead: 0, counter: 0, bass: 0.68, chord: 0 },
    // 18 pasos = 9/8. Acentos 2+2+2+3; nada de batería de jazz debajo.
    percussion: { period: 18, kit: 'istanbul-frame', punch: 1.18, pattern: { 0: 'W', 4: 'H', 8: 'W', 12: 'H', 16: 'S' } },
    signature: { instrument: 'clarinet', sections: [0, 1, 2, 3], everyCycles: 1, repeatPeriod: 18,
      durationSteps: 3.4, volume: 0.76, motif: { 0: 67, 4: 68, 8: 71, 12: 65, 16: 67 } },
  }),
  tangierWalking: Object.freeze({
    family: 'tangier-dry-walking-club', preserveSectionOrder: true,
    harmonyPath: [0, -2, 0, 5, 0, -2],
    swing: 0.11, warmth: 0.76, releaseScale: 0.9, space: 0.045, delayMs: 78,
    bassInstrument: 'uprightBass', bassHoldSteps: 2.4,
    layers: { lead: false, counter: false, chords: false, bass: true, drums: true, signature: true },
    mix: { lead: 0, counter: 0, bass: 1.26, chord: 0 },
    percussion: { period: 12, kit: 'maghreb-hand', punch: 1.22, pattern: { 0: 'K', 5: 'W', 6: 'S', 11: 'W' } },
    signature: { instrument: 'mutedHorn', sections: [0, 1, 2, 3], everyCycles: 1, repeatPeriod: 24,
      durationSteps: 4.8, volume: 0.58, motif: { 3: 65, 11: 63, 19: 70 } },
  }),
  granadaChamber: Object.freeze({
    family: 'granada-guitar-chamber', preserveSectionOrder: true,
    harmonyPath: [0, 0, 5, 3, 0, 0],
    swing: 0, warmth: 1.0, releaseScale: 1.1, space: 0.2, delayMs: 210,
    chordInstrument: 'felt', bassInstrument: 'pizz', chordHoldSteps: 18, bassHoldSteps: 3.0,
    drumMode: 'none',
    layers: { lead: false, counter: false, chords: true, bass: true, drums: false, signature: true },
    mix: { lead: 0, counter: 0, bass: 0.5, chord: 0.48 },
    percussion: { period: 32, kit: 'none', punch: 0, pattern: {} },
    signature: { instrument: 'guitar2', sections: [0, 1, 2, 3], everyCycles: 1, repeatPeriod: 48,
      durationSteps: 3.1, volume: 0.72, motif: { 0: 64, 7: 65, 15: 68, 23: 63, 30: 64, 39: 61, 46: 64 } },
  }),

  // Familias secundarias conservan el refactor anterior hasta que las siete
  // siluetas principales estén validadas al oído.
  beirutRooftop: Object.freeze({
    family: 'beirut-rooftop', preserveSectionOrder: true,
    harmonyPath: [0, 0, -2, 0, 0, 5, 0, -2, 0],
    swing: 0.17, warmth: 0.84, releaseScale: 1.12,
    chordInstrument: 'rhodesWarm', bassInstrument: 'uprightBass',
    chordHoldSteps: 11, bassHoldSteps: 3.8,
    percussion: { period: 16, kit: 'rooftop-jazz', punch: 1.14, pattern: { 0: 'B', 4: 'H', 8: 'S', 12: 'H' } },
  }),
  levantBlue: Object.freeze({
    family: 'levant-blue', preserveSectionOrder: true,
    harmonyPath: [0, 0, 0, -2, -2, 0, 0, 3, 0],
    swing: 0.06, warmth: 0.72, releaseScale: 1.34,
    bassInstrument: 'uprightBass', chordHoldSteps: 16, bassHoldSteps: 5.5,
    percussion: { period: 16, kit: 'frame-drum', punch: 1.1, pattern: { 0: 'K', 8: 'B', 12: 'H' } },
  }),
  maghrebVelvet: Object.freeze({
    family: 'maghreb-velvet', preserveSectionOrder: true,
    harmonyPath: [0, 0, 0, -2, 0, 0, 5, 0],
    swing: 0.12, warmth: 0.74, releaseScale: 1.26,
    chordInstrument: 'rhodesWarm', bassInstrument: 'uprightBass',
    chordHoldSteps: 14, bassHoldSteps: 4.4,
    percussion: { period: 16, kit: 'maghreb-hand', punch: 1.12, pattern: { 0: 'K', 4: 'H', 8: 'B', 12: 'H' } },
  }),
  andalusWarm: Object.freeze({
    family: 'andalus-warm', preserveSectionOrder: true,
    harmonyPath: [0, 0, 5, 5, 0, 0, -2, 0],
    swing: 0.09, warmth: 0.9, releaseScale: 1.08,
    bassInstrument: 'uprightBass', chordHoldSteps: 10, bassHoldSteps: 3.5,
    percussion: { period: 16, kit: 'andalus-hand', punch: 1.16, pattern: { 0: 'K', 4: 'H', 8: 'S', 12: 'H' } },
  }),

  zugzwangWaltz: Object.freeze({
    family: 'viennese-waltz-chamber', preserveSectionOrder: true,
    harmonyPath: [0, 0, 5, 0, -2, 0], swing: 0, warmth: 0.96, releaseScale: 1.2, space: 0.16, delayMs: 185,
    chordInstrument: 'felt', bassInstrument: 'cello', chordHoldSteps: 8, bassHoldSteps: 7,
    layers: { lead: true, counter: false, chords: true, bass: true, drums: true, signature: false },
    mix: { lead: 0.72, counter: 0, bass: 0.58, chord: 0.52 },
    percussion: { period: 24, kit: 'legacy', punch: 0.42, pattern: {0:'W',8:'W',16:'W'} },
  }),
  bishopBlues: Object.freeze({
    family: 'late-night-blues-12-8', preserveSectionOrder: true,
    harmonyPath: [0, 0, 5, 0, 7, 5], swing: 0.24, warmth: 0.82, releaseScale: 1.18, space: 0.11, delayMs: 145,
    chordInstrument: 'rhodesWarm', bassInstrument: 'uprightBass', chordHoldSteps: 12, bassHoldSteps: 3,
    layers: { lead: true, counter: false, chords: true, bass: true, drums: true, signature: false },
    mix: { lead: 0.67, counter: 0, bass: 1.05, chord: 0.55 },
    percussion: { period: 12, kit: 'brush-jazz', punch: 0.92, pattern: {0:'B',6:'H'} },
  }),
  winterLibrary: Object.freeze({
    family: 'snow-library-minimal', preserveSectionOrder: true,
    harmonyPath: [0, 0, -2, 0], swing: 0, warmth: 0.72, releaseScale: 1.72, space: 0.3, delayMs: 360,
    chordInstrument: 'felt', bassInstrument: 'cello', chordHoldSteps: 18, bassHoldSteps: 16, drumMode: 'none',
    layers: { lead: true, counter: false, chords: true, bass: true, drums: false, signature: true },
    mix: { lead: 0.42, counter: 0, bass: 0.42, chord: 0.38 },
    percussion: { period: 32, kit: 'none', punch: 0, pattern: {} },
    signature: { instrument: 'bell', sections: [0,1], everyCycles: 2, repeatPeriod: 64, durationSteps: 9, volume: 0.22, motif: {15:79,47:76} },
  }),
  analogBunker: Object.freeze({
    family: 'cold-analog-sequencer', preserveSectionOrder: true,
    harmonyPath: [0, 0, 1, 0, -1, 0], swing: 0, warmth: 0.58, releaseScale: 0.72, space: 0.025, delayMs: 70,
    bassInstrument: 'synthbass', bassHoldSteps: 2,
    layers: { lead: true, counter: false, chords: false, bass: true, drums: true, signature: false },
    mix: { lead: 0.72, counter: 0, bass: 1.2, chord: 0 },
    percussion: { period: 20, kit: 'legacy', punch: 1.2, pattern: {0:'K',5:'H',10:'S',15:'H'} },
  }),
  queenRequiem: Object.freeze({
    family: 'organ-choir-requiem', preserveSectionOrder: true,
    harmonyPath: [0, 0, -2, -5, 0], swing: 0, warmth: 0.66, releaseScale: 1.85, space: 0.32, delayMs: 410,
    chordInstrument: 'organ', bassInstrument: 'organbass', chordHoldSteps: 24, bassHoldSteps: 18, drumMode: 'none',
    layers: { lead: true, counter: false, chords: true, bass: true, drums: false, signature: false },
    mix: { lead: 0.42, counter: 0, bass: 0.52, chord: 0.56 },
    percussion: { period: 32, kit: 'none', punch: 0, pattern: {} },
  }),
  nightFreight: Object.freeze({
    family: 'motorik-night-freight', preserveSectionOrder: true,
    harmonyPath: [0, 0, -1, 0, 2, 0], swing: 0, warmth: 0.68, releaseScale: 0.82, space: 0.06, delayMs: 105,
    bassInstrument: 'synthbass', chordInstrument: 'pad', chordHoldSteps: 24, bassHoldSteps: 3,
    layers: { lead: true, counter: false, chords: true, bass: true, drums: true, signature: false },
    mix: { lead: 0.44, counter: 0, bass: 1.08, chord: 0.32 },
    percussion: { period: 24, kit: 'legacy', punch: 1.05, pattern: {0:'K',6:'H',12:'W',18:'H'} },
  }),
});
const STRUCTURED_FEEL_BY_THEME = Object.freeze({
  zugzwangWaltz: 'zugzwangWaltz', bishopBlues: 'bishopBlues', winterLibrary: 'winterLibrary',
  analogBunker: 'analogBunker', queenRequiem: 'queenRequiem', nightFreight: 'nightFreight',
  alexandria241: 'alexandriaLounge',
  cairo0047: 'cairoAfterHours', cairoQuietHours: 'cairoAfterHours', cairoRedLantern: 'cairoAfterHours', nileBalcony0152: 'cairoAfterHours',
  beirut0113: 'beirutSixEight', beirutRooftop0412: 'beirutRooftop', beirutNightTaxi: 'beirutRooftop',
  damascusBlueHour: 'damascusDrone', aleppoAfterRain: 'levantBlue', ammanVelvetRoom: 'levantBlue',
  istanbul0326: 'istanbulBroken', bosphorusRain: 'levantBlue', istanbulBackgammon: 'istanbulBroken',
  tangierSmoke: 'tangierWalking', tangierRedTable: 'tangierWalking', casablancaLastCall: 'maghrebVelvet', medinaBlueSmoke: 'maghrebVelvet',
  andalusianCoast: 'andalusWarm', granadaPatio: 'granadaChamber', cadizLanterns: 'andalusWarm',
});

function structuredFeel(theme) {
  const key = STRUCTURED_FEEL_BY_THEME[theme?.id];
  return (key && STRUCTURED_FEELS[key]) || null;
}

// Diagnóstico estable para tests/UI de desarrollo. No expone las partituras,
// sólo los parámetros que hacen que cada familia tenga una identidad distinta.
export function getAmbientThemeSoundProfile(themeId) {
  const theme = AMBIENT_THEMES[themeId];
  const feel = structuredFeel(theme);
  if (!theme || theme.engine !== 'structured') return null;
  return feel ? {
    family: feel.family,
    preserveSectionOrder: !!feel.preserveSectionOrder,
    swing: feel.swing || 0,
    warmth: feel.warmth || 1,
    groovePeriod: feel.percussion?.period || null,
    percussionPeriod: feel.percussion?.period || null,
    percussionKit: feel.percussion?.kit || 'legacy',
    percussionPunch: feel.percussion?.punch || 1,
    drumMode: feel.drumMode || 'dynamic',
    signatureInstrument: feel.signature?.instrument || null,
    signatureSteps: Object.keys(feel.signature?.motif || {}).length,
    signatureRepeatPeriod: feel.signature?.repeatPeriod || null,
    enabledLayers: Object.entries(feel.layers || {}).filter(([, enabled]) => enabled !== false).map(([name]) => name),
    space: feel.space || 0,
    chordInstrument: feel.chordInstrument || theme.chordInstrument,
    bassInstrument: feel.bassInstrument || theme.bassInstrument,
  } : {
    family: 'legacy-structured', preserveSectionOrder: false, swing: 0, warmth: 1,
    groovePeriod: null, percussionPeriod: null, percussionKit: 'legacy', percussionPunch: 1,
    chordInstrument: theme.chordInstrument, bassInstrument: theme.bassInstrument,
  };
}

// Útil para tests y para futuras UIs: duración mínima antes de que un tema
// estructurado vuelva al principio de su forma larga. Al-Ándalus es
// estocástico y no tiene un bucle exacto equivalente.
export function getAmbientThemeVariationDurationMs(themeId) {
  const theme = AMBIENT_THEMES[themeId];
  if (!theme || theme.engine !== 'structured') return null;
  const sections = Math.max(1, theme.sections?.length || 1);
  const steps = Math.max(1, theme.stepsPerSection || 32);
  const cycleMs = sections * steps * theme.stepMs;
  const span = Math.max(8, Math.ceil((theme.longFormMs || STRUCTURED_LONG_FORM_MS) / cycleMs));
  return cycleMs * span;
}

// Duración de reproducción de una "pista" antes de pasar a otra. Los temas
// estructurados usan su forma larga completa; Al-Ándalus es estocástico y no
// tiene cierre natural, así que le damos una ventana de cuatro minutos.
export function getAmbientTrackDurationMs(themeId) {
  return getAmbientThemeVariationDurationMs(themeId) || ANDALUS_TRACK_DURATION_MS;
}

export function pickRandomAmbientThemeId(excludeId = null) {
  const allIds = Object.keys(AMBIENT_THEMES);
  const ids = allIds.length > 1 && excludeId
    ? allIds.filter((id) => id !== excludeId)
    : allIds;
  if (!ids.length) return DEFAULT_AMBIENT_THEME;
  let index = 0;
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    index = value[0] % ids.length;
  } else {
    index = Math.floor(Math.random() * ids.length);
  }
  return ids[index] || DEFAULT_AMBIENT_THEME;
}

export function resetAmbientThemeForSession() {
  const nextId = pickRandomAmbientThemeId();
  if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(AMBIENT_THEME_SESSION_KEY, nextId);
  // V15.4: el tema ya NO forma parte del perfil persistente. Borramos la
  // preferencia histórica local para que un login nuevo no herede la pista
  // que eligió el usuario en una sesión anterior.
  if (typeof localStorage !== 'undefined') localStorage.removeItem(LEGACY_AMBIENT_THEME_KEY);
  return nextId;
}

export function clearAmbientThemeSession() {
  if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(AMBIENT_THEME_SESSION_KEY);
}

export function getAmbientThemeId() {
  if (typeof sessionStorage === 'undefined') return DEFAULT_AMBIENT_THEME;
  const saved = sessionStorage.getItem(AMBIENT_THEME_SESSION_KEY);
  if (AMBIENT_THEMES[saved]) return saved;
  return resetAmbientThemeForSession();
}

function getActiveAmbientTheme() {
  return AMBIENT_THEMES[getAmbientThemeId()] || AMBIENT_THEMES[DEFAULT_AMBIENT_THEME];
}

function transportNowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now();
  return Date.now();
}

let stepTimer = null;
let ambientTrackEndTimer = null;
let ambientTransitionTimer = null;
let queuedAmbientThemeId = null;
let ambientResumeFn = null;
const ambientTransport = {
  status: 'stopped', // playing | paused | gap | stopped
  themeId: null,
  positionMs: 0,
  startedAtMs: 0,
};

function transportElapsedMs() {
  const live = ambientTransport.status === 'playing'
    ? Math.max(0, transportNowMs() - ambientTransport.startedAtMs)
    : 0;
  return Math.max(0, ambientTransport.positionMs + live);
}

function notifyAmbientTransport() {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent('chess-ambient-transport'));
}

export function getAmbientPlaybackState() {
  const themeId = ambientTransport.themeId || getAmbientThemeId();
  const durationMs = getAmbientTrackDurationMs(themeId);
  const elapsedMs = transportElapsedMs();
  const visualCycleMs = durationMs || 180000;
  const cyclePositionMs = ambientTransport.status === 'gap' && durationMs
    ? durationMs
    : visualCycleMs ? elapsedMs % visualCycleMs : elapsedMs;
  return {
    status: ambientTransport.status,
    themeId,
    elapsedMs,
    durationMs,
    cyclePositionMs,
    visualCycleMs,
    muted: isMusicMuted(),
    volume: getAmbientVolume(),
  };
}

export function setAmbientTheme(themeId) {
  const nextId = AMBIENT_THEMES[themeId] ? themeId : DEFAULT_AMBIENT_THEME;
  const previousStatus = ambientTransport.status;
  stopAmbientMusic();
  if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(AMBIENT_THEME_SESSION_KEY, nextId);
  ambientTransport.themeId = nextId;

  if (previousStatus === 'playing' || previousStatus === 'gap') {
    startAmbientMusic();
  } else if (previousStatus === 'paused') {
    // Cambiar de pista mientras está pausada deja la nueva al principio,
    // también pausada. Play arrancará esa pista desde 00:00.
    ambientTransport.status = 'paused';
    notifyAmbientTransport();
  } else {
    notifyAmbientTransport();
  }
  return nextId;
}

export function selectRelativeAmbientTheme(delta) {
  const ids = AMBIENT_THEME_OPTIONS.map((theme) => theme.id);
  const current = getAmbientThemeId();
  const index = Math.max(0, ids.indexOf(current));
  const next = ids[(index + delta + ids.length) % ids.length] || DEFAULT_AMBIENT_THEME;
  return setAmbientTheme(next);
}

let ambientOutputNode = null;
let ambientPercussionBus = null;
let ambientDuckFactor = 1;

function clearAmbientTrackEndTimer() {
  if (!ambientTrackEndTimer) return;
  clearTimeout(ambientTrackEndTimer);
  ambientTrackEndTimer = null;
}

function clearAmbientTransitionTimer() {
  if (!ambientTransitionTimer) return;
  clearTimeout(ambientTransitionTimer);
  ambientTransitionTimer = null;
}

function ambientMasterTarget() {
  return getAmbientVolume() * ambientDuckFactor;
}

function applyAmbientMasterGain(rampSeconds = 0.12) {
  const ctx = audioCtx;
  if (!ctx || !ambientOutputNode) return;
  const now = ctx.currentTime;
  const gain = ambientOutputNode.gain;
  const target = ambientMasterTarget();
  try {
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(Math.max(0.0001, gain.value), now);
    gain.linearRampToValueAtTime(target, now + rampSeconds);
  } catch {
    gain.value = target;
  }
}

function getAmbientOutput(ctx) {
  if (!ctx) return null;
  if (!ambientOutputNode || ambientOutputNode.context !== ctx) {
    ambientOutputNode = ctx.createGain();
    ambientOutputNode.gain.value = ambientMasterTarget();
    ambientOutputNode.connect(ctx.destination);
  }
  return ambientOutputNode;
}

function getAmbientPercussionOutput(ctx) {
  if (!ctx) return null;
  if (!ambientPercussionBus || ambientPercussionBus.context !== ctx) {
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -22;
    compressor.knee.value = 14;
    compressor.ratio.value = 3.2;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.11;

    ambientPercussionBus = ctx.createGain();
    ambientPercussionBus.gain.value = 1.08;
    ambientPercussionBus.connect(compressor);
    compressor.connect(getAmbientOutput(ctx));
  }
  return ambientPercussionBus;
}

function scheduleAmbientTrackEnd() {
  clearAmbientTrackEndTimer();
  if (ambientTransport.status !== 'playing') return;
  const durationMs = getAmbientTrackDurationMs(ambientTransport.themeId || getAmbientThemeId());
  const remainingMs = Math.max(0, durationMs - transportElapsedMs());
  ambientTrackEndTimer = setTimeout(finishAmbientTrackNaturally, remainingMs);
}

function finishAmbientTrackNaturally() {
  ambientTrackEndTimer = null;
  if (ambientTransport.status !== 'playing') return;

  const finishedThemeId = ambientTransport.themeId || getAmbientThemeId();
  const durationMs = getAmbientTrackDurationMs(finishedThemeId);
  queuedAmbientThemeId = pickRandomAmbientThemeId(finishedThemeId);

  if (stepTimer) {
    clearTimeout(stepTimer);
    stepTimer = null;
  }
  ambientResumeFn = null;
  ambientTransport.status = 'gap';
  ambientTransport.positionMs = durationMs;
  ambientTransport.startedAtMs = 0;

  // Apagado corto para cortar limpiamente cualquier cola de pad/acorde. El
  // resto del intervalo sí es silencio completo antes de la siguiente pista.
  if (ambientOutputNode) {
    const ctx = ambientOutputNode.context;
    const gain = ambientOutputNode.gain;
    const now = ctx.currentTime;
    try {
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(Math.max(0.0001, gain.value), now);
      gain.linearRampToValueAtTime(0, now + 0.28);
    } catch {
      gain.value = 0;
    }
  }
  notifyAmbientTransport();

  clearAmbientTransitionTimer();
  ambientTransitionTimer = setTimeout(() => {
    ambientTransitionTimer = null;
    if (ambientTransport.status !== 'gap') return;
    const nextId = queuedAmbientThemeId || pickRandomAmbientThemeId(finishedThemeId);
    queuedAmbientThemeId = null;
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(AMBIENT_THEME_SESSION_KEY, nextId);
    ambientTransport.status = 'stopped';
    ambientTransport.themeId = nextId;
    ambientTransport.positionMs = 0;
    ambientTransport.startedAtMs = 0;
    startAmbientMusic();
  }, AMBIENT_INTER_TRACK_SILENCE_MS);
}

// Cuando habla el Game Chat, el ducking se multiplica por el volumen elegido
// por el usuario. Si estaba al 35 %, baja sobre ESE 35 %, no salta a otro nivel.
export function duckAmbientMusic(ducked) {
  ambientDuckFactor = ducked ? 0.24 : 1;
  applyAmbientMasterGain(ducked ? 0.08 : 0.28);
}

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
  gainNode.connect(getAmbientOutput(ctx));
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
  bodyGain.connect(getAmbientOutput(ctx));

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
  edgeGain.connect(getAmbientOutput(ctx));

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
  gainNode.connect(getAmbientOutput(ctx));
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
  gainNode.connect(getAmbientOutput(ctx));

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
  gainNode.connect(getAmbientOutput(ctx));

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
  oscGain.connect(getAmbientOutput(ctx));
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
  noiseGain.connect(getAmbientPercussionOutput(ctx));
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
  gainNode.connect(getAmbientOutput(ctx));
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
    case 'rhodesWarm': return { waves: [['sine', 1, 1], ['triangle', 2, 0.16], ['sine', 0.5, 0.1]], gain: 0.020, attack: 0.028, release: 2.15, cutoff: 1950, tremolo: 3.1 };
    case 'cello': return { waves: [['sawtooth', 1, 1], ['triangle', 0.5, 0.18]], gain: 0.017, attack: 0.09, release: 2.1, cutoff: 920 };
    case 'pizz': return { waves: [['triangle', 1, 1], ['sine', 2, 0.12]], gain: 0.026, attack: 0.004, release: 0.52, cutoff: 1700 };
    case 'bass': return { waves: [['triangle', 1, 1], ['sine', 0.5, 0.18]], gain: 0.029, attack: 0.008, release: 0.72, cutoff: 760 };
    case 'uprightBass': return { waves: [['triangle', 1, 0.88], ['sine', 0.5, 0.34], ['sine', 2, 0.06]], gain: 0.027, attack: 0.014, release: 1.08, cutoff: 680 };
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
    // V15.3: timbres dedicados al jazz árabe nocturno. El ney prioriza aire y vibrato;
    // el oud estructurado es más seco y oscuro que la guitarra genérica.
    case 'ney': return { waves: [['sine', 1, 1], ['triangle', 2, 0.11], ['sine', 3, 0.035]], gain: 0.021, attack: 0.075, release: 1.45, cutoff: 1850, tremolo: 5.0 };
    case 'oudJazz': return { waves: [['sawtooth', 1, 0.48], ['triangle', 1, 0.72], ['sine', 2, 0.08]], gain: 0.019, attack: 0.004, release: 0.62, cutoff: 1750 };
    case 'qanun': return { waves: [['triangle', 1, 0.82], ['sine', 2, 0.22], ['sine', 3, 0.09]], gain: 0.018, attack: 0.003, release: 0.88, cutoff: 3650 };
    case 'mutedHorn': return { waves: [['triangle', 1, 0.76], ['sawtooth', 1, 0.16], ['sine', 0.5, 0.12]], gain: 0.017, attack: 0.085, release: 1.75, cutoff: 1180, tremolo: 4.4 };
    case 'buzuq': return { waves: [['triangle', 1, 0.72], ['sawtooth', 2, 0.11], ['sine', 3, 0.06]], gain: 0.019, attack: 0.003, release: 0.74, cutoff: 2450 };
    case 'clarinet': return { waves: [['square', 1, 0.19], ['sine', 1, 0.76], ['sine', 3, 0.09]], gain: 0.016, attack: 0.07, release: 1.85, cutoff: 1480, tremolo: 4.0 };
    case 'metallic': return { waves: [['square', 1, 0.42], ['sine', 2.41, 0.34], ['sine', 4.83, 0.12]], gain: 0.014, attack: 0.004, release: 0.48, cutoff: 3200 };
    default: return { waves: [['sine', 1, 1]], gain: 0.02, attack: 0.01, release: 0.8, cutoff: 2500 };
  }
}

function playStructuredVoice(kind, midiNote, volumeScale = 1, durationOverride = null, tone = null) {
  if (isMusicMuted() || midiNote == null) return;
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const preset = voicePreset(kind);
  const freq = midiToFreq(midiNote);
  const start = ctx.currentTime;
  const release = durationOverride || preset.release * (tone?.releaseScale || 1);
  const filter = ctx.createBiquadFilter();
  const gainNode = ctx.createGain();
  filter.type = 'lowpass';
  filter.frequency.value = Math.max(260, preset.cutoff * (tone?.warmth || 1));
  filter.Q.value = kind === 'synth' || kind === 'arp' ? 1.4 : 0.55;

  const peak = preset.gain * volumeScale;
  gainNode.gain.setValueAtTime(0.0001, start);
  gainNode.gain.linearRampToValueAtTime(peak, start + preset.attack);
  if (kind === 'organ' || kind === 'organbass' || kind === 'pad') {
    gainNode.gain.setValueAtTime(peak * 0.82, start + Math.max(preset.attack + 0.05, release * 0.7));
  }
  gainNode.gain.exponentialRampToValueAtTime(0.0001, start + release);

  filter.connect(gainNode);
  const output = getAmbientOutput(ctx);
  gainNode.connect(output);
  // Un eco único y muy bajo da profundidad sin convertir el generador en una
  // sopa reverberante. Cada familia decide cuánto espacio necesita.
  if (tone?.space > 0 && typeof ctx.createDelay === 'function') {
    const delay = ctx.createDelay(0.6);
    const wet = ctx.createGain();
    delay.delayTime.value = Math.min(0.55, Math.max(0.06, (tone.delayMs || 180) / 1000));
    wet.gain.value = Math.min(0.3, Math.max(0, tone.space));
    gainNode.connect(delay);
    delay.connect(wet);
    wet.connect(output);
  }

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

function playStructuredChord(kind, notes, duration = null, volumeScale = 1, tone = null) {
  if (!Array.isArray(notes)) return;
  const scale = Math.max(0.42, 1 / Math.sqrt(notes.length)) * volumeScale;
  notes.forEach((note) => playStructuredVoice(kind, note, scale, duration, tone));
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
  gain.connect(getAmbientPercussionOutput(ctx));
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
  gain.connect(getAmbientPercussionOutput(ctx));
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
  gain.connect(getAmbientPercussionOutput(ctx));
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

function deterministicPercussionVelocity(feel, localStep, code) {
  const period = Math.max(1, feel?.percussion?.period || 16);
  const pos = ((localStep % period) + period) % period;
  const half = Math.floor(period / 2);
  let accent = pos === 0 ? 1.18 : pos === half ? 1.08 : 1;
  if (code === 'H') accent *= 0.82;
  if (code === 'B') accent *= 0.9;
  const seed = stableThemeSeed(`${feel?.family || 'legacy'}:${localStep}:${code}`);
  const microDynamics = 0.95 + ((seed % 11) / 100); // 0.95 .. 1.05, timing stays quantized
  return accent * microDynamics * (feel?.percussion?.punch || 1);
}

function playMembraneHit(kind, volume = 0.04) {
  if (isMusicMuted() || volume <= 0) return;
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const start = ctx.currentTime;
  const isDum = kind === 'dum';
  const bodyDuration = isDum ? 0.34 : 0.115;
  const body = ctx.createOscillator();
  const overtone = ctx.createOscillator();
  const bodyGain = ctx.createGain();
  const overtoneGain = ctx.createGain();

  body.type = 'sine';
  overtone.type = 'triangle';
  body.frequency.setValueAtTime(isDum ? 185 : 410, start);
  body.frequency.exponentialRampToValueAtTime(isDum ? 58 : 205, start + (isDum ? 0.09 : 0.035));
  overtone.frequency.setValueAtTime(isDum ? 310 : 980, start);
  overtone.frequency.exponentialRampToValueAtTime(isDum ? 170 : 620, start + bodyDuration * 0.55);

  bodyGain.gain.setValueAtTime(volume * (isDum ? 1.35 : 0.78), start);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, start + bodyDuration);
  overtoneGain.gain.setValueAtTime(volume * (isDum ? 0.34 : 0.58), start);
  overtoneGain.gain.exponentialRampToValueAtTime(0.0001, start + bodyDuration * 0.72);

  body.connect(bodyGain);
  overtone.connect(overtoneGain);
  bodyGain.connect(getAmbientPercussionOutput(ctx));
  overtoneGain.connect(getAmbientPercussionOutput(ctx));
  body.start(start);
  overtone.start(start);
  body.stop(start + bodyDuration + 0.03);
  overtone.stop(start + bodyDuration + 0.03);

  // Ataque de piel/dedos: ruido muy corto, filtrado distinto para dum/tak.
  const clickDuration = isDum ? 0.038 : 0.026;
  const size = Math.max(1, Math.floor(ctx.sampleRate * clickDuration));
  const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < size; i += 1) {
    const envelope = Math.pow(1 - (i / size), 2.2);
    data[i] = (Math.random() * 2 - 1) * envelope;
  }
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const clickGain = ctx.createGain();
  source.buffer = buffer;
  filter.type = 'bandpass';
  filter.frequency.value = isDum ? 720 : 2450;
  filter.Q.value = isDum ? 0.8 : 1.5;
  clickGain.gain.setValueAtTime(volume * (isDum ? 0.38 : 0.72), start);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, start + clickDuration);
  source.connect(filter);
  filter.connect(clickGain);
  clickGain.connect(getAmbientPercussionOutput(ctx));
  source.start(start);
}

function playStructuredDrum(code, feel = null, localStep = 0) {
  const kit = feel?.percussion?.kit || 'legacy';
  const velocity = deterministicPercussionVelocity(feel, localStep, code);
  const handKit = ['darbuka', 'cairo-hand', 'frame-drum', 'istanbul-frame', 'maghreb-hand', 'andalus-hand'].includes(kit);
  const brushKit = ['brush-jazz', 'rooftop-jazz', 'walking-brush'].includes(kit);

  if (handKit) {
    if (code === 'K') playMembraneHit('dum', 0.052 * velocity);
    else if (code === 'S') playMembraneHit('tak', 0.042 * velocity);
    else if (code === 'H') playMembraneHit('tak', 0.021 * velocity);
    else if (code === 'B') playNoiseHit('brush', 0.012 * velocity);
    else if (code === 'W') playWoodblock();
    else if (code === 'M') playMetalHit();
    return;
  }

  if (brushKit) {
    if (code === 'K') playSoftPercussion(0.05 * velocity);
    else if (code === 'S') playNoiseHit('snare', 0.028 * velocity);
    else if (code === 'H') playNoiseHit('hat', 0.011 * velocity);
    else if (code === 'B') playNoiseHit('brush', 0.016 * velocity);
    else if (code === 'W') playWoodblock();
    else if (code === 'M') playMetalHit();
    return;
  }

  if (code === 'K') playSoftPercussion(0.055 * velocity);
  else if (code === 'S') playNoiseHit('snare', 0.028 * velocity);
  else if (code === 'H') playNoiseHit('hat', 0.014 * velocity);
  else if (code === 'B') playNoiseHit('brush', 0.012 * velocity);
  else if (code === 'W') playWoodblock();
  else if (code === 'M') playMetalHit();
}

// Los temas estructurados nacieron como miniaturas de 1–3 secciones. Eso
// funcionaba bien para probar timbres, pero algunos daban una vuelta completa
// en 4–15 segundos y el oído detectaba el bucle enseguida. En V15.2 la
// composición base NO cambia: añadimos una capa de arreglo largo y
// determinista. La misma pieza respira, modula y cambia de registro durante
// ~2 minutos antes de volver exactamente al mismo estado. Al-Ándalus no pasa
// por este motor y conserva intacto su generador estocástico original.
const STRUCTURED_LONG_FORM_MS = 120000;
const STRUCTURED_HARMONY_PATH = [0, 0, 5, 5, 0, -2, -2, 0, 7, 7, 3, 0];

function stableThemeSeed(id = '') {
  let seed = 0;
  for (let i = 0; i < id.length; i += 1) seed = ((seed * 31) + id.charCodeAt(i)) >>> 0;
  return seed;
}

function structuredArrangement(theme, cycleIndex) {
  const sections = Math.max(1, theme.sections?.length || 1);
  const stepsPerSection = Math.max(1, theme.stepsPerSection || 32);
  const cycleMs = Math.max(1, sections * stepsPerSection * theme.stepMs);
  const span = Math.max(8, Math.ceil((theme.longFormMs || STRUCTURED_LONG_FORM_MS) / cycleMs));
  const phase = cycleIndex % span;
  const seed = stableThemeSeed(theme.id);
  const feel = structuredFeel(theme);
  const harmonyPath = feel?.harmonyPath || STRUCTURED_HARMONY_PATH;
  const harmonicIndex = Math.floor((phase / span) * harmonyPath.length);
  // Las escenas nuevas priorizan continuidad tonal: empiezan siempre en su
  // centro escrito y modulan sólo siguiendo su propia ruta. Los temas legacy
  // conservan el offset histórico derivado de la seed.
  const pathOffset = feel ? 0 : (seed % 3);
  const transpose = harmonyPath[(harmonicIndex + pathOffset) % harmonyPath.length];
  const texture = (phase + (seed % 7)) % 9;

  return {
    span,
    transpose,
    feel,
    // Cambios de registro puntuales, no una octava arriba cada dos vueltas.
    leadOctave: texture === 3 ? 12 : texture === 7 ? -12 : 0,
    leadVolume: (texture === 1 ? 0.72 : texture === 6 ? 0.86 : 1) * (feel?.mix?.lead || 1),
    bassVolume: (texture === 4 ? 0.68 : 0.9) * (feel?.mix?.bass || 1),
    chordVolume: (texture === 5 ? 0.72 : 1) * (feel?.mix?.chord || 1),
    counterVolume: (texture === 3 ? 0.34 : texture === 7 ? 0.46 : 0.4) * (feel?.mix?.counter || 1),
    counterOctave: texture === 6 ? -12 : 0,
    // Unas vueltas dejan respirar la melodía o la batería. La forma base
    // sigue reconocible, pero no tenemos la misma pared de sonido cada 4 s.
    leadMode: feel
      ? (texture === 8 ? 'sparse' : 'full')
      : (texture === 2 ? 'late' : texture === 8 ? 'sparse' : 'full'),
    drumMode: feel?.drumMode || (feel
      ? (texture === 6 ? 'sparse' : 'full')
      : (texture === 0 ? 'full' : texture === 4 ? 'sparse' : texture === 6 ? 'none' : 'full')),
    sectionShift: feel?.preserveSectionOrder ? 0 : (sections > 1 ? Math.floor(phase / 2 + (seed % sections)) % sections : 0),
  };
}

function shouldPlayStructuredLead(mode, localStep, stepsPerSection) {
  if (mode === 'late') return localStep >= Math.floor(stepsPerSection / 2);
  if (mode === 'sparse') return localStep % 4 !== 0;
  return true;
}

function shouldPlayStructuredDrum(mode, code) {
  if (mode === 'none') return false;
  // En las vueltas con menos batería quitamos sobre todo hats/ornamentos,
  // pero conservamos los golpes que definen el pulso. Antes se filtraba por
  // el número absoluto de step y eso podía destruir una métrica 6/8 o 7/8.
  if (mode === 'sparse') return code !== 'H';
  return true;
}

function structuredDrumAtStep(section, feel, localStep) {
  if (!feel?.percussion) return section.drums?.[localStep] || null;
  const { period, pattern } = feel.percussion;
  if (!period || !pattern) return null;
  return pattern[localStep % period] || null;
}

function structuredSignatureAtStep(feel, localStep, sectionIndex, cycleIndex) {
  const signature = feel?.signature;
  if (!signature?.motif) return null;
  if (Array.isArray(signature.sections) && !signature.sections.includes(sectionIndex)) return null;
  const every = Math.max(1, signature.everyCycles || 1);
  if (cycleIndex % every !== 0) return null;
  const motifStep = signature.repeatPeriod ? (localStep % signature.repeatPeriod) : localStep;
  const note = signature.motif[motifStep];
  return note == null ? null : { ...signature, note };
}

function startStructuredMusic(theme) {
  let step = 0;
  let nextTickAtMs = transportNowMs();
  const stepsPerSection = Math.max(1, theme.stepsPerSection || 32);
  const sectionCount = Math.max(1, theme.sections?.length || 1);
  const cycleSteps = stepsPerSection * sectionCount;

  function tick() {
    if (ambientTransport.status !== 'playing') {
      stepTimer = null;
      return;
    }

    const cycleIndex = Math.floor(step / cycleSteps);
    const arrangement = structuredArrangement(theme, cycleIndex);
    const stepInsideCycle = step % cycleSteps;
    const rawSectionIndex = Math.floor(stepInsideCycle / stepsPerSection) % sectionCount;
    const sectionIndex = (rawSectionIndex + arrangement.sectionShift) % sectionCount;
    const localStep = stepInsideCycle % stepsPerSection;
    const section = theme.sections[sectionIndex];

    const lead = section.lead?.[localStep];
    const counter = section.counter?.[localStep];
    const bass = section.bass?.[localStep];
    const chord = section.chords?.[localStep];
    const t = arrangement.transpose;

    const feel = arrangement.feel;
    const layers = feel?.layers || {};
    const layerEnabled = (name) => layers[name] !== false;
    const drum = structuredDrumAtStep(section, feel, localStep);
    const signature = structuredSignatureAtStep(feel, localStep, rawSectionIndex, cycleIndex);
    const tone = feel ? {
      warmth: feel.warmth,
      releaseScale: feel.releaseScale,
      space: feel.space || 0,
      delayMs: feel.delayMs || 180,
    } : null;

    if (signature && layerEnabled('signature')) {
      const signatureDuration = (theme.stepMs * (signature.durationSteps || 3)) / 1000;
      playStructuredVoice(signature.instrument || theme.leadInstrument, signature.note + t, signature.volume || 0.55, signatureDuration, tone);
    }

    if (lead != null && layerEnabled('lead') && shouldPlayStructuredLead(arrangement.leadMode, localStep, stepsPerSection)) {
      playStructuredVoice(feel?.leadInstrument || section.leadInstrument || theme.leadInstrument, lead + t + arrangement.leadOctave, arrangement.leadVolume, null, tone);
    }
    if (counter != null && layerEnabled('counter') && arrangement.leadMode !== 'sparse') {
      playStructuredVoice(
        feel?.counterInstrument || section.counterInstrument || theme.counterInstrument || theme.leadInstrument,
        counter + t + arrangement.counterOctave,
        arrangement.counterVolume,
        null,
        tone,
      );
    }
    if (bass != null && layerEnabled('bass')) {
      const bassInstrument = feel?.bassInstrument || section.bassInstrument || theme.bassInstrument;
      const bassDuration = feel?.bassHoldSteps ? (theme.stepMs * feel.bassHoldSteps) / 1000 : null;
      playStructuredVoice(bassInstrument, bass + t, arrangement.bassVolume, bassDuration, tone);
    }
    if (chord && layerEnabled('chords')) {
      const chordInstrument = feel?.chordInstrument || section.chordInstrument || theme.chordInstrument;
      const longChord = ['organ', 'pad'].includes(chordInstrument);
      const chordHoldSteps = feel?.chordHoldSteps || (longChord ? 15.5 : null);
      const duration = chordHoldSteps ? (theme.stepMs * chordHoldSteps) / 1000 : null;
      playStructuredChord(chordInstrument, chord.map((note) => note + t), duration, arrangement.chordVolume, tone);
    }
    if (drum && layerEnabled('drums') && shouldPlayStructuredDrum(arrangement.drumMode, drum)) playStructuredDrum(drum, feel, localStep);

    step += 1;
    // Reloj absoluto: setTimeout puede llegar tarde, pero el retraso ya no se
    // acumula compás tras compás. Esto mantiene percusión, bajo y melodía
    // agarrados al mismo pulso durante pistas largas.
    const swing = feel?.swing || 0;
    const swingFactor = swing ? (step % 2 === 0 ? 1 - swing : 1 + swing) : 1;
    const intervalMs = Math.max(45, theme.stepMs * swingFactor);
    const now = transportNowMs();
    if (nextTickAtMs < now - (theme.stepMs * 2)) nextTickAtMs = now;
    nextTickAtMs += intervalMs;
    stepTimer = setTimeout(tick, Math.max(12, Math.round(nextTickAtMs - transportNowMs())));
  }

  ambientResumeFn = tick;
  tick();
}

export function startAmbientMusic() {
  // V16.2: Play/Stop sustituyen al antiguo mute general de música. Un perfil
  // viejo puede traer el flag MUSIC_MUTED_KEY; al pulsar Play (o arrancar la
  // sesión) lo limpiamos para que nunca exista un estado 'playing pero mudo'.
  if (isMusicMuted()) setMusicMuted(false);
  if (ambientTransport.status === 'playing' && stepTimer) return;

  // Si el usuario pulsa Play durante la pausa automática entre pistas,
  // adelantamos la siguiente en vez de reiniciar la que acaba de terminar.
  if (ambientTransport.status === 'gap') {
    clearAmbientTransitionTimer();
    const previousThemeId = ambientTransport.themeId || getAmbientThemeId();
    const nextId = queuedAmbientThemeId || pickRandomAmbientThemeId(previousThemeId);
    queuedAmbientThemeId = null;
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(AMBIENT_THEME_SESSION_KEY, nextId);
    ambientTransport.status = 'stopped';
    ambientTransport.themeId = nextId;
    ambientTransport.positionMs = 0;
    ambientTransport.startedAtMs = 0;
  }

  // Resume real: conserva el closure/contador del secuenciador. No reinicia la
  // composición como haría Stop + Play.
  if (ambientTransport.status === 'paused' && ambientResumeFn) {
    ambientTransport.status = 'playing';
    ambientTransport.startedAtMs = transportNowMs();
    applyAmbientMasterGain(0.18);
    scheduleAmbientTrackEnd();
    notifyAmbientTransport();
    ambientResumeFn();
    return;
  }

  // Si se seleccionó otra pista estando pausado no existe closure que reanudar:
  // Play comienza esa pista desde el principio.
  if (ambientTransport.status === 'paused' && !ambientResumeFn) {
    ambientTransport.status = 'stopped';
    ambientTransport.positionMs = 0;
  }

  const theme = getActiveAmbientTheme();
  ambientTransport.status = 'playing';
  ambientTransport.themeId = theme.id;
  ambientTransport.positionMs = 0;
  ambientTransport.startedAtMs = transportNowMs();
  applyAmbientMasterGain(0.32);
  scheduleAmbientTrackEnd();
  notifyAmbientTransport();

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
    if (ambientTransport.status !== 'playing') {
      stepTimer = null;
      return;
    }
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

  ambientResumeFn = tick;
  tick();
}

export function pauseAmbientMusic() {
  if (ambientTransport.status === 'gap') {
    clearAmbientTransitionTimer();
    const previousThemeId = ambientTransport.themeId || getAmbientThemeId();
    const nextId = queuedAmbientThemeId || pickRandomAmbientThemeId(previousThemeId);
    queuedAmbientThemeId = null;
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(AMBIENT_THEME_SESSION_KEY, nextId);
    ambientTransport.status = 'paused';
    ambientTransport.themeId = nextId;
    ambientTransport.positionMs = 0;
    ambientTransport.startedAtMs = 0;
    notifyAmbientTransport();
    return;
  }
  if (ambientTransport.status !== 'playing') return;
  clearAmbientTrackEndTimer();
  ambientTransport.positionMs = transportElapsedMs();
  ambientTransport.startedAtMs = 0;
  ambientTransport.status = 'paused';
  if (stepTimer) {
    clearTimeout(stepTimer);
    stepTimer = null;
  }
  notifyAmbientTransport();
}

export function stopAmbientMusic() {
  const wasGap = ambientTransport.status === 'gap';
  const queuedTheme = queuedAmbientThemeId;
  clearAmbientTrackEndTimer();
  clearAmbientTransitionTimer();
  queuedAmbientThemeId = null;
  if (stepTimer) {
    clearTimeout(stepTimer);
    stepTimer = null;
  }
  ambientResumeFn = null;
  ambientTransport.status = 'stopped';
  ambientTransport.positionMs = 0;
  ambientTransport.startedAtMs = 0;
  if (wasGap && queuedTheme && typeof sessionStorage !== 'undefined') {
    // Si se pulsa Stop justo durante el silencio, dejamos preparada la pista
    // que ya estaba sorteada. El siguiente Play no repite la recién terminada.
    sessionStorage.setItem(AMBIENT_THEME_SESSION_KEY, queuedTheme);
  }
  ambientTransport.themeId = getAmbientThemeId();
  keyCenterIndex = 0; // vuelve a empezar en la tónica la próxima vez, no donde quedó
  padIndex = 0;
  if (ambientOutputNode) {
    const ctx = ambientOutputNode.context;
    const gain = ambientOutputNode.gain;
    const now = ctx.currentTime;
    try {
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(Math.max(0.0001, gain.value), now);
      gain.linearRampToValueAtTime(0, now + 0.08);
    } catch {
      gain.value = 0;
    }
  }
  notifyAmbientTransport();
}
