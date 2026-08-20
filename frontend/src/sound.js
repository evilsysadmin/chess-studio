import { setProfileStorageItem } from './profileKeys.js';

// sound.js — Efectos de sonido cortitos generados con la Web Audio API. Nada
// de archivos de audio: son un par de "beeps" sintetizados al vuelo, así que
// no suman peso ni dependen de una CDN. El estado de silencio se guarda en
// localStorage para que se recuerde entre sesiones.

const MUTE_KEY = 'chess-study-muted';
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

export function isMuted() {
  return localStorage.getItem(MUTE_KEY) === '1';
}

export function setMuted(muted) {
  setProfileStorageItem(MUTE_KEY, muted ? '1' : '0');
}

function beep({ freq, duration, type = 'sine', gain = 0.06, delay = 0 }) {
  if (isMuted()) return;
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
};

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
  if (isMuted()) return;
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
  if (isMuted()) return;
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
  if (isMuted()) return;
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
  if (isMuted()) return;
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
// vuelve a chequear isMuted() por su cuenta al disparar, así que
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
  if (isMuted()) return;
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
  if (isMuted() || volume <= 0) return;
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
  if (isMuted() || volume <= 0) return;
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

export function startAmbientMusic() {
  if (stepTimer) return; // ya está sonando, no duplicar el loop

  const theme = getActiveAmbientTheme();
  const bassScale = theme.scale.map((f) => f / 2);
  const keyChangeSteps = STEPS_PER_BAR * theme.keyChangeBars;
  let step = 0;
  let currentPercussionPattern = theme.percussionPatterns[0];

  function tick() {
    const barStep = step % STEPS_PER_BAR;

    if (barStep === 0) {
      currentPercussionPattern = theme.percussionPatterns[Math.floor(Math.random() * theme.percussionPatterns.length)];
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
      const phrase = theme.phrases[Math.floor(Math.random() * theme.phrases.length)];
      const instrument = theme.instruments[Math.floor(Math.random() * theme.instruments.length)];
      playPhrase(phrase, instrument, theme.scale, currentOffset(theme), theme.phraseNoteGapMs);
    }

    if (step % theme.saxGapSteps === 0 && Math.random() < theme.saxChance) {
      const phrase = theme.saxPhrases[Math.floor(Math.random() * theme.saxPhrases.length)];
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
