import { STORAGE_LOCAL, STORAGE_SESSION, getStorageItem, setStorageItem, removeStorageItem } from './safeStorage.js';
import { setProfileStorageItem } from './profileKeys.js';
import { getAudioContext as getContext } from './audioContext.js';
import { structuredFeel } from './ambientProfiles.js';
import {
  MUSIC_EXCLUDED_KEY,
  MUSIC_FAVORITES_KEY,
  MUSIC_RADIO_MODE_KEY,
  getAmbientVolume,
  isFxMuted,
  isMusicMuted,
  writeAmbientVolume,
  writeFxMuted,
  writeMusicMuted,
} from './soundPreferences.js';
export { getAmbientVolume, isFxMuted, isMusicMuted } from './soundPreferences.js';
export {
  playCaptureSound,
  playIllegalMoveSound,
  playMissSound,
  playMoveSound,
  playNoteworthySound,
  playSuccessSound,
  playTimePressureSound,
} from './soundFx.js';


// sound.js — Efectos de sonido cortitos generados con la Web Audio API. Nada
// de archivos de audio: son un par de "beeps" sintetizados al vuelo, así que
// no suman peso ni dependen de una CDN. El estado de silencio se guarda en
// localStorage para que se recuerde entre sesiones.

import {
  AMBIENT_THEME_SESSION_KEY,
  LEGACY_AMBIENT_THEME_KEY,
  readAmbientPlaybackSession,
  writeAmbientPlaybackSession,
} from './audioSession.js';
import {
  AMBIENT_GENRE_ORDER,
  AMBIENT_THEMES,
  AMBIENT_THEME_GROUPS,
  AMBIENT_THEME_OPTIONS,
  BASS_DURATION_S,
  BASS_STEP_GAP,
  CURATED_HIDDEN_THEME_IDS,
  KEY_CENTERS_SEMITONES,
  OUD_SCALE,
  PAD_ATTACK_S,
  PAD_DURATION_S,
  PAD_GAP_STEPS,
  PHRASE_NOTE_GAP_MS,
  PLUCK_DURATION_S,
  SAX_DURATION_S,
  SAX_NOTE_GAP_MS,
  STEPS_PER_BAR,
} from './ambientCatalog.js';
export { AMBIENT_THEME_GROUPS, AMBIENT_THEME_OPTIONS } from './ambientCatalog.js';

const DEFAULT_AMBIENT_THEME = 'andalus';
// La radio de sesión deja un pequeño hueco real entre piezas. No encadenamos
// los finales como si fueran jingles publicitarios: termina el tema, respira,
// y entra otro distinto.
export const AMBIENT_INTER_TRACK_SILENCE_MS = 700;
const ANDALUS_TRACK_DURATION_MS = 240000;

export function setMusicMuted(muted) {
  writeMusicMuted(muted);
  // Mute y transporte son cosas distintas: silenciar no reinicia ni pausa el
  // tema. Los secuenciadores siguen avanzando en silencio y al desmutear se
  // recupera exactamente el punto musical de esa sesión.
  notifyAmbientTransport();
}

export function setFxMuted(muted) {
  writeFxMuted(muted);
}

export function setAmbientVolume(value) {
  const normalized = writeAmbientVolume(value);
  applyAmbientMasterGain(0.08);
  notifyAmbientTransport();
  return normalized;
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
let keyCenterIndex = 0;

function transpose(freq, semitones) {
  return freq * Math.pow(2, semitones / 12);
}

function currentOffset(theme) {
  const centers = theme?.keyCenters || KEY_CENTERS_SEMITONES;
  return centers[keyCenterIndex % centers.length];
}



function readMusicIdSet(key) {
  try {
    const parsed = JSON.parse(getStorageItem(STORAGE_LOCAL, key) || '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => AMBIENT_THEMES[id]) : []);
  } catch {
    return new Set();
  }
}

function writeMusicIdSet(key, values) {
  const valid = [...values].filter((id) => AMBIENT_THEMES[id]);
  setProfileStorageItem(key, JSON.stringify(valid));
  notifyAmbientTransport();
  return new Set(valid);
}

function getAmbientFavorites() { return readMusicIdSet(MUSIC_FAVORITES_KEY); }
function getAmbientExcluded() { return readMusicIdSet(MUSIC_EXCLUDED_KEY); }
export function isAmbientFavorite(themeId) { return getAmbientFavorites().has(themeId); }
export function isAmbientExcluded(themeId) { return getAmbientExcluded().has(themeId); }

export function toggleAmbientFavorite(themeId) {
  if (!AMBIENT_THEMES[themeId]) return getAmbientFavorites();
  const favorites = getAmbientFavorites();
  const excluded = getAmbientExcluded();
  if (favorites.has(themeId)) favorites.delete(themeId);
  else { favorites.add(themeId); excluded.delete(themeId); }
  writeMusicIdSet(MUSIC_EXCLUDED_KEY, excluded);
  return writeMusicIdSet(MUSIC_FAVORITES_KEY, favorites);
}

export function toggleAmbientExcluded(themeId) {
  if (!AMBIENT_THEMES[themeId]) return getAmbientExcluded();
  const excluded = getAmbientExcluded();
  const favorites = getAmbientFavorites();
  if (excluded.has(themeId)) excluded.delete(themeId);
  else { excluded.add(themeId); favorites.delete(themeId); }
  writeMusicIdSet(MUSIC_FAVORITES_KEY, favorites);
  return writeMusicIdSet(MUSIC_EXCLUDED_KEY, excluded);
}

export function getAmbientRadioMode() {
  const value = getStorageItem(STORAGE_LOCAL, MUSIC_RADIO_MODE_KEY) || 'all';
  if (['all', 'favorites', 'focus'].includes(value)) return value;
  if (value.startsWith('genre:') && AMBIENT_GENRE_ORDER.includes(value.slice(6))) return value;
  return 'all';
}

export function setAmbientRadioMode(mode) {
  const raw = String(mode || 'all');
  const next = ['all', 'favorites', 'focus'].includes(raw) || (raw.startsWith('genre:') && AMBIENT_GENRE_ORDER.includes(raw.slice(6))) ? raw : 'all';
  setProfileStorageItem(MUSIC_RADIO_MODE_KEY, next);
  notifyAmbientTransport();
  return next;
}

function focusFriendlyTheme(theme) {
  if (!theme) return false;
  if (theme.id === 'andalus') return true;
  const profile = getAmbientThemeSoundProfile(theme.id);
  if (!profile) return true;
  if (profile.drumMode === 'none') return true;
  return profile.percussionPunch <= 0.82 && profile.estimatedBpm <= 108;
}

export function ambientRadioThemeIds(mode = getAmbientRadioMode()) {
  const excluded = getAmbientExcluded();
  const base = AMBIENT_THEME_OPTIONS.filter((theme) => !excluded.has(theme.id));
  let filtered = base;
  if (mode === 'favorites') {
    const favorites = getAmbientFavorites();
    filtered = base.filter((theme) => favorites.has(theme.id));
  } else if (mode === 'focus') {
    filtered = base.filter(focusFriendlyTheme);
  } else if (mode.startsWith('genre:')) {
    const genre = mode.slice(6);
    filtered = base.filter((theme) => theme.genre === genre);
  }
  return (filtered.length ? filtered : base.length ? base : AMBIENT_THEME_OPTIONS).map((theme) => theme.id);
}


// V16.6m — identidad de mezcla/arreglo para el bloque de jazz mediterráneo.
// Antes todos estos temas pasaban por la misma "máquina de variación": misma
// ruta armónica, misma forma de mover secciones y el mismo pulso básico. Eso
// evitaba loops cortos pero homogeneizaba demasiado el catálogo y podía romper
// el arco A→B→C escrito en cada pieza. Los perfiles conservan la composición
// original y cambian feel, sustain, timbre de base y micro-groove por escena.

// Diagnóstico estable para tests/UI de desarrollo. No expone las partituras,
// sólo los parámetros que hacen que cada familia tenga una identidad distinta.
export function getAmbientThemeSoundProfile(themeId) {
  const theme = AMBIENT_THEMES[themeId];
  const feel = structuredFeel(theme);
  if (!theme || theme.engine !== 'structured') return null;
  return feel ? {
    family: feel.family,
    stepMs: theme.stepMs,
    estimatedBpm: Math.round((60000 / (theme.stepMs * 4)) * 10) / 10,
    preserveSectionOrder: !!feel.preserveSectionOrder,
    swing: feel.swing || 0,
    warmth: feel.warmth || 1,
    groovePeriod: feel.percussion?.period || null,
    percussionPeriod: feel.percussion?.period || null,
    percussionKit: feel.percussion?.kit || 'legacy',
    percussionPunch: feel.percussion?.punch || 1,
    percussionHumanized: (feel.percussion?.kit || 'legacy') !== 'none',
    percussionMicrotimingMs: (feel.percussion?.kit || 'legacy') === 'none' ? 0 : 12,
    drumMode: feel.drumMode || 'dynamic',
    signatureInstrument: feel.signature?.instrument || null,
    signatureSteps: Object.keys(feel.signature?.motif || {}).length,
    signatureRepeatPeriod: feel.signature?.repeatPeriod || null,
    enabledLayers: Object.entries(feel.layers || {}).filter(([, enabled]) => enabled !== false).map(([name]) => name),
    space: feel.space || 0,
    leadInstrument: feel.leadInstrument || theme.leadInstrument,
    counterInstrument: feel.counterInstrument || theme.counterInstrument || null,
    chordInstrument: feel.chordInstrument || theme.chordInstrument,
    bassInstrument: feel.bassInstrument || theme.bassInstrument,
    masterTrim: Math.round(structuredMasterTrim(feel) * 1000) / 1000,
    personalityFingerprint: structuredPersonalityFingerprint(theme, feel),
  } : {
    family: 'legacy-structured', stepMs: theme.stepMs, estimatedBpm: Math.round((60000 / (theme.stepMs * 4)) * 10) / 10, preserveSectionOrder: false, swing: 0, warmth: 1,
    groovePeriod: null, percussionPeriod: null, percussionKit: 'legacy', percussionPunch: 1,
    percussionHumanized: true, percussionMicrotimingMs: 6,
    leadInstrument: theme.leadInstrument, counterInstrument: theme.counterInstrument || null,
    chordInstrument: theme.chordInstrument, bassInstrument: theme.bassInstrument,
    masterTrim: 1, personalityFingerprint: structuredPersonalityFingerprint(theme, null),
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
  const allIds = ambientRadioThemeIds();
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
  setStorageItem(STORAGE_SESSION, AMBIENT_THEME_SESSION_KEY, nextId);
  // V15.4: el tema ya NO forma parte del perfil persistente. Borramos la
  // preferencia histórica local para que un login nuevo no herede la pista
  // que eligió el usuario en una sesión anterior.
  removeStorageItem(STORAGE_LOCAL, LEGACY_AMBIENT_THEME_KEY);
  return nextId;
}

export function getAmbientThemeId() {
  const saved = getStorageItem(STORAGE_SESSION, AMBIENT_THEME_SESSION_KEY);
  if (AMBIENT_THEMES[saved] && !CURATED_HIDDEN_THEME_IDS.has(saved)) return saved;
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

function persistAmbientTransport() {
  const themeId = ambientTransport.themeId || getAmbientThemeId();
  const status = ambientTransport.status === 'gap' ? 'playing' : ambientTransport.status;
  writeAmbientPlaybackSession({
    status,
    themeId,
    positionMs: status === 'stopped' ? 0 : transportElapsedMs(),
  });
}

function notifyAmbientTransport() {
  persistAmbientTransport();
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
  const nextId = AMBIENT_THEMES[themeId] && !CURATED_HIDDEN_THEME_IDS.has(themeId) ? themeId : DEFAULT_AMBIENT_THEME;
  const previousStatus = ambientTransport.status;
  stopAmbientMusic();
  setStorageItem(STORAGE_SESSION, AMBIENT_THEME_SESSION_KEY, nextId);
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
  const ids = ambientRadioThemeIds();
  const current = getAmbientThemeId();
  const found = ids.indexOf(current);
  const index = found >= 0 ? found : 0;
  const next = ids[(index + delta + ids.length) % ids.length] || DEFAULT_AMBIENT_THEME;
  return setAmbientTheme(next);
}

export function seekAmbientMusic(positionMs) {
  const themeId = ambientTransport.themeId || getAmbientThemeId();
  const durationMs = getAmbientTrackDurationMs(themeId);
  if (!durationMs) return 0;
  const target = Math.min(Math.max(0, Number(positionMs) || 0), Math.max(0, durationMs - 1));
  const previousStatus = ambientTransport.status;

  clearAmbientTrackEndTimer();
  clearAmbientTransitionTimer();
  queuedAmbientThemeId = null;
  if (stepTimer) { clearTimeout(stepTimer); stepTimer = null; }
  ambientResumeFn = null;
  rotateAmbientOutputForSeek();

  ambientTransport.themeId = themeId;
  ambientTransport.positionMs = target;
  ambientTransport.startedAtMs = 0;

  if (previousStatus === 'playing' || previousStatus === 'gap') {
    // startAmbientMusic reconstruye la escena sintética desde la posición
    // solicitada. No intentamos mover osciladores ya creados: se dejan decaer
    // y la nueva frase entra desde el step correspondiente.
    ambientTransport.status = 'paused';
    startAmbientMusic();
  } else {
    ambientTransport.status = previousStatus === 'paused' ? 'paused' : 'stopped';
    notifyAmbientTransport();
  }
  return target;
}

let ambientOutputNode = null;
let ambientPercussionBus = null;
let ambientDuckFactor = 1;

function rotateAmbientOutputForSeek(fadeSeconds = 0.055) {
  const oldOutput = ambientOutputNode;
  // Las voces Web Audio ya disparadas no se pueden "rebobinar". En seek
  // aislamos el bus viejo y creamos uno nuevo para la escena reconstruida.
  ambientOutputNode = null;
  ambientPercussionBus = null;
  if (!oldOutput) return;
  const ctx = oldOutput.context;
  const now = ctx.currentTime;
  try {
    oldOutput.gain.cancelScheduledValues(now);
    oldOutput.gain.setValueAtTime(Math.max(0.0001, oldOutput.gain.value), now);
    oldOutput.gain.linearRampToValueAtTime(0, now + fadeSeconds);
  } catch {
    oldOutput.gain.value = 0;
  }
  setTimeout(() => {
    try { oldOutput.disconnect(); } catch {}
  }, Math.ceil((fadeSeconds + 0.05) * 1000));
}

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
  // No creemos un AudioContext sólo para ajustar ducking/volumen. Si aún no
  // existe salida ambiental, no hay nada que modificar; cuando exista, su
  // propio contexto es la fuente de verdad compartida.
  if (!ambientOutputNode) return;
  const ctx = ambientOutputNode.context;
  if (!ctx) return;
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
    // V16.6bc: la percusión sintetizada tenía demasiado ataque medio/agudo y
    // poco peso. Un low-shelf suave antes del compresor conserva darbukas,
    // brushes y hats, pero deja sitio a un dum/kick que realmente empuje aire.
    const lowShelf = ctx.createBiquadFilter();
    lowShelf.type = 'lowshelf';
    lowShelf.frequency.value = 118;
    lowShelf.gain.value = 3.2;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 12;
    compressor.ratio.value = 4.0;
    compressor.attack.value = 0.006;
    compressor.release.value = 0.14;

    ambientPercussionBus = ctx.createGain();
    ambientPercussionBus.gain.value = 1.06;
    ambientPercussionBus.connect(lowShelf);
    lowShelf.connect(compressor);
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

  // Transición corta de radio: fade-out y una respiración mínima antes del
  // siguiente tema. No hay corte seco ni dos segundos de vacío entre piezas.
  if (ambientOutputNode) {
    const ctx = ambientOutputNode.context;
    const gain = ambientOutputNode.gain;
    const now = ctx.currentTime;
    try {
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(Math.max(0.0001, gain.value), now);
      gain.linearRampToValueAtTime(0, now + 0.42);
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
    setStorageItem(STORAGE_SESSION, AMBIENT_THEME_SESSION_KEY, nextId);
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
function connectPercussionWithPan(ctx, node, pan = 0) {
  const output = getAmbientPercussionOutput(ctx);
  if (!output) return;
  if (typeof ctx.createStereoPanner === 'function' && Math.abs(pan) > 0.001) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-0.22, Math.min(0.22, pan));
    node.connect(panner);
    panner.connect(output);
    return;
  }
  node.connect(output);
}

function playSoftPercussion(volume, options = {}) {
  if (isMusicMuted() || volume <= 0) return;
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const delayS = Math.max(0, Number(options.delayMs) || 0) / 1000;
  const tone = Math.max(-1, Math.min(1, Number(options.tone) || 0));
  const decay = Math.max(0.72, Math.min(1.28, Number(options.decay) || 1));
  const pan = Math.max(-0.22, Math.min(0.22, Number(options.pan) || 0));
  const start = ctx.currentTime + delayS;

  // Cuerpo tonal con una pequeña variación de parche/golpe. No buscamos un
  // bombo distinto cada vez: apenas el cambio que produciría golpear unos mm
  // más cerca del centro o con otra presión de mano.
  const bodyDurationS = 0.32 * decay;
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150 * (1 + tone * 0.055), start);
  osc.frequency.exponentialRampToValueAtTime(45 * (1 + tone * 0.035), start + 0.09 * decay);
  oscGain.gain.setValueAtTime(volume * 1.55, start);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, start + bodyDurationS);
  osc.connect(oscGain);
  connectPercussionWithPan(ctx, oscGain, pan * 0.5);
  osc.start(start);
  osc.stop(start + bodyDurationS + 0.05);

  const noiseDurationS = 0.22 * decay;
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
  filter.frequency.value = 450 * (1 + tone * 0.18);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(volume, start);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, start + noiseDurationS);

  noiseSource.connect(filter);
  filter.connect(noiseGain);
  connectPercussionWithPan(ctx, noiseGain, pan);
  noiseSource.start(start);
}

// "Tak" agudo: mismo mecanismo (ruido blanco filtrado) que el "dum", pero
// genuinamente otro timbre, no la misma nota más floja — más corto
// (0.09s vs 0.22s) y con un filtro pasa-banda centrado bien arriba
// (1400Hz) en vez de pasa-bajos, para un "click" seco tipo borde de
// pandero en vez de un golpe sordo de centro.
function playHighTak(volume, options = {}) {
  if (isMusicMuted() || volume <= 0) return;
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const delayS = Math.max(0, Number(options.delayMs) || 0) / 1000;
  const tone = Math.max(-1, Math.min(1, Number(options.tone) || 0));
  const decay = Math.max(0.72, Math.min(1.28, Number(options.decay) || 1));
  const pan = Math.max(-0.22, Math.min(0.22, Number(options.pan) || 0));
  const durationS = 0.09 * decay;
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
  filter.frequency.value = 1400 * (1 + tone * 0.22);
  filter.Q.value = 1.2;

  const gainNode = ctx.createGain();
  const start = ctx.currentTime + delayS;
  gainNode.gain.setValueAtTime(volume, start);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, start + durationS);

  noiseSource.connect(filter);
  filter.connect(gainNode);
  connectPercussionWithPan(ctx, gainNode, pan);
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
    case 'synth': return { waves: [['sawtooth', 1, 1], ['square', 2, 0.08]], gain: 0.017, attack: 0.018, release: 0.52, cutoff: 1450 };
    case 'synthbass': return { waves: [['square', 1, 0.55], ['triangle', 1, 1]], gain: 0.026, attack: 0.006, release: 0.42, cutoff: 640 };
    case 'pad': return { waves: [['sine', 1, 1], ['triangle', 2, 0.08]], gain: 0.014, attack: 0.28, release: 2.9, cutoff: 1600 };
    case 'organ': return { waves: [['sine', 1, 1], ['sine', 2, 0.28], ['sine', 3, 0.09]], gain: 0.014, attack: 0.22, release: 4.25, cutoff: 2100 };
    case 'organbass': return { waves: [['sine', 1, 1], ['triangle', 0.5, 0.2]], gain: 0.022, attack: 0.18, release: 4.0, cutoff: 580 };
    case 'tremolo': return { waves: [['triangle', 1, 1], ['sawtooth', 1, 0.09]], gain: 0.019, attack: 0.02, release: 1.9, cutoff: 2100, tremolo: 7.0 };
    case 'guitar2': return { waves: [['triangle', 1, 1], ['sawtooth', 2, 0.07]], gain: 0.018, attack: 0.004, release: 0.82, cutoff: 2300 };
    case 'arp': return { waves: [['square', 1, 0.45], ['sawtooth', 1, 1]], gain: 0.014, attack: 0.004, release: 0.28, cutoff: 1800 };
    case 'marimba': return { waves: [['sine', 1, 1], ['sine', 4, 0.14], ['triangle', 2, 0.05]], gain: 0.022, attack: 0.004, release: 0.78, cutoff: 3100 };
    case 'glass': return { waves: [['sine', 1, 1], ['sine', 2.7, 0.12], ['sine', 5.4, 0.025]], gain: 0.013, attack: 0.024, release: 2.7, cutoff: 4700, tremolo: 2.6 };
    case 'bandoneon': return { waves: [['sawtooth', 1, 0.72], ['square', 2, 0.16], ['sine', 1, 0.3]], gain: 0.016, attack: 0.045, release: 0.9, cutoff: 1850 };
    case 'choir': return { waves: [['sine', 1, 1], ['triangle', 1, 0.24], ['sine', 2, 0.12]], gain: 0.013, attack: 0.38, release: 4.4, cutoff: 1550, tremolo: 4.2 };
    case 'pulse': return { waves: [['square', 1, 0.46], ['sine', 1, 0.54]], gain: 0.014, attack: 0.004, release: 0.24, cutoff: 1800 };
    // V15.3: timbres dedicados al jazz árabe nocturno. El ney prioriza aire y vibrato;
    // el oud estructurado es más seco y oscuro que la guitarra genérica.
    case 'ney': return { waves: [['sine', 1, 1], ['triangle', 2, 0.11], ['sine', 3, 0.035]], gain: 0.021, attack: 0.075, release: 1.45, cutoff: 1850, tremolo: 5.0 };
    case 'oudJazz': return { waves: [['sawtooth', 1, 0.48], ['triangle', 1, 0.72], ['sine', 2, 0.08]], gain: 0.019, attack: 0.004, release: 0.62, cutoff: 1750 };
    case 'qanun': return { waves: [['triangle', 1, 0.82], ['sine', 2, 0.22], ['sine', 3, 0.09]], gain: 0.018, attack: 0.003, release: 0.88, cutoff: 3650 };
    case 'mutedHorn': return { waves: [['triangle', 1, 0.76], ['sawtooth', 1, 0.16], ['sine', 0.5, 0.12]], gain: 0.017, attack: 0.085, release: 1.75, cutoff: 1180, tremolo: 4.4 };
    case 'buzuq': return { waves: [['triangle', 1, 0.72], ['sawtooth', 2, 0.11], ['sine', 3, 0.06]], gain: 0.019, attack: 0.003, release: 0.74, cutoff: 2450 };
    case 'clarinet': return { waves: [['square', 1, 0.19], ['sine', 1, 0.76], ['sine', 3, 0.09]], gain: 0.016, attack: 0.07, release: 1.85, cutoff: 1480, tremolo: 4.0 };
    case 'metallic': return { waves: [['square', 1, 0.36], ['sine', 2.41, 0.24], ['sine', 4.83, 0.06]], gain: 0.012, attack: 0.005, release: 0.52, cutoff: 2400 };
    case 'breathFlute': return { waves: [['sine', 1, 1], ['triangle', 2, 0.07], ['sine', 3, 0.025]], gain: 0.016, attack: 0.13, release: 2.65, cutoff: 1450, tremolo: 4.4 };
    case 'singingBowl': return { waves: [['sine', 1, 1], ['sine', 2.39, 0.16], ['sine', 4.71, 0.04]], gain: 0.012, attack: 0.026, release: 4.9, cutoff: 4300, tremolo: 2.0 };
    case 'overdriveGuitar': return { waves: [['sawtooth', 1, 0.68], ['square', 1, 0.18], ['triangle', 0.5, 0.22]], gain: 0.015, attack: 0.006, release: 0.9, cutoff: 1850 };
    case 'strings': return { waves: [['sawtooth', 1, 0.42], ['triangle', 1, 0.62], ['sine', 2, 0.08]], gain: 0.014, attack: 0.18, release: 3.4, cutoff: 1350, tremolo: 5.1 };
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

function playNoiseHit(kind, volume = 0.03, options = {}) {
  if (isMusicMuted()) return;
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const delayS = Math.max(0, Number(options.delayMs) || 0) / 1000;
  const tone = Math.max(-1, Math.min(1, Number(options.tone) || 0));
  const decay = Math.max(0.72, Math.min(1.28, Number(options.decay) || 1));
  const pan = Math.max(-0.22, Math.min(0.22, Number(options.pan) || 0));
  const duration = (kind === 'brush' ? 0.18 : 0.085) * decay;
  const size = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = kind === 'brush' || kind === 'hat' ? 'highpass' : 'bandpass';
  filter.frequency.value = (kind === 'brush' ? 1900 : kind === 'hat' ? 4800 : 1500) * (1 + tone * 0.16);
  filter.Q.value = kind === 'snare' ? 1.0 : 0.5;
  const gain = ctx.createGain();
  const start = ctx.currentTime + delayS;
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter);
  filter.connect(gain);
  connectPercussionWithPan(ctx, gain, pan);
  source.start(start);
}

function playWoodKnock() {
  if (isMusicMuted()) return;
  const ctx = getContext();
  if (!ctx) return;
  const start = ctx.currentTime;
  const duration = 0.055;
  const size = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < size; i += 1) {
    const envelope = Math.pow(1 - (i / size), 3.2);
    data[i] = (Math.random() * 2 - 1) * envelope;
  }
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = buffer;
  filter.type = 'bandpass';
  filter.frequency.value = 540;
  filter.Q.value = 0.72;
  gain.gain.setValueAtTime(0.018, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(getAmbientPercussionOutput(ctx));
  source.start(start);
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

function percussionHumanization(feel, localStep, code) {
  const period = Math.max(1, feel?.percussion?.period || 16);
  const pos = ((localStep % period) + period) % period;
  const half = Math.floor(period / 2);
  const seed = stableThemeSeed(`${feel?.family || 'legacy'}:${localStep}:${code}`);
  const signed = (shift) => (((seed >>> shift) % 2001) / 1000) - 1;
  let accent = (pos === 0 ? 1.18 : pos === half ? 1.08 : 1) * structuredMasterTrim(feel);
  if (code === 'H') accent *= 0.82;
  if (code === 'B') accent *= 0.9;

  // Downbeats remain tight so the ensemble does not drift. Secondary hand
  // strokes sit a few milliseconds behind/ahead perceptually (implemented as
  // tiny positive scheduling offsets) and vary in patch, decay and stereo
  // position like real hands/brushes hitting slightly different spots.
  const anchored = pos === 0 || (code === 'K' && pos === half);
  const handKit = ['darbuka', 'cairo-hand', 'frame-drum', 'istanbul-frame', 'maghreb-hand', 'andalus-hand'].includes(feel?.percussion?.kit);
  const brushKit = ['brush-jazz', 'rooftop-jazz', 'walking-brush'].includes(feel?.percussion?.kit);
  const maxDelayMs = anchored ? 0 : handKit ? 9 : brushKit ? 12 : 6;
  const delayMs = Math.max(0, signed(3) * maxDelayMs + maxDelayMs * 0.45);
  const microDynamics = 0.92 + (((seed >>> 5) % 17) / 100); // 0.92 .. 1.08
  const tone = signed(7) * (handKit ? 0.78 : 0.45);
  const decay = 0.9 + (((seed >>> 9) % 21) / 100); // 0.90 .. 1.10
  const pan = signed(11) * (handKit ? 0.13 : 0.09);
  const ghost = !anchored && (handKit || brushKit) && ((seed >>> 13) % 9 === 0);

  return {
    velocity: accent * microDynamics * (feel?.percussion?.punch || 1),
    delayMs, tone, decay, pan, ghost,
  };
}

export function getPercussionHumanizationPreview(themeId, localStep, code = 'K') {
  const theme = AMBIENT_THEMES[themeId];
  const feel = structuredFeel(theme);
  if (!theme || theme.engine !== 'structured' || !feel?.percussion) return null;
  return percussionHumanization(feel, Number(localStep) || 0, code);
}

function playBassDrum(volume = 0.04, options = {}) {
  if (isMusicMuted() || volume <= 0) return;
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const delayS = Math.max(0, Number(options.delayMs) || 0) / 1000;
  const tone = Math.max(-1, Math.min(1, Number(options.tone) || 0));
  const decay = Math.max(0.72, Math.min(1.28, Number(options.decay) || 1));
  const pan = Math.max(-0.18, Math.min(0.18, Number(options.pan) || 0));
  const start = ctx.currentTime + delayS;
  const duration = 0.38 * decay;

  // El cuerpo es deliberadamente subgrave: una caída rápida 118 -> 48 Hz da
  // el golpe inicial sin ese "chiu" de oscilador agudo. La cola estable en
  // ~48 Hz aporta pecho sin invadir el bajo musical durante medio compás.
  const body = ctx.createOscillator();
  const bodyGain = ctx.createGain();
  body.type = 'sine';
  body.frequency.setValueAtTime(118 * (1 + tone * 0.025), start);
  body.frequency.exponentialRampToValueAtTime(52 * (1 + tone * 0.018), start + 0.055);
  body.frequency.exponentialRampToValueAtTime(46 * (1 + tone * 0.014), start + duration * 0.82);
  bodyGain.gain.setValueAtTime(volume * 1.7, start);
  bodyGain.gain.exponentialRampToValueAtTime(volume * 0.42, start + 0.055);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  body.connect(bodyGain);
  connectPercussionWithPan(ctx, bodyGain, pan * 0.35);

  // Segundo seno muy corto = thump, no click. Mantenerlo por debajo de 150 Hz
  // evita recuperar el carácter de pistola láser que queríamos quitar.
  const thump = ctx.createOscillator();
  const thumpGain = ctx.createGain();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(146, start);
  thump.frequency.exponentialRampToValueAtTime(72, start + 0.032);
  thumpGain.gain.setValueAtTime(volume * 0.72, start);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.075);
  thump.connect(thumpGain);
  connectPercussionWithPan(ctx, thumpGain, pan * 0.2);

  body.start(start);
  thump.start(start);
  body.stop(start + duration + 0.03);
  thump.stop(start + 0.085);
}

function playMembraneHit(kind, volume = 0.04, options = {}) {
  if (isMusicMuted() || volume <= 0) return;
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const delayS = Math.max(0, Number(options.delayMs) || 0) / 1000;
  const tone = Math.max(-1, Math.min(1, Number(options.tone) || 0));
  const decay = Math.max(0.72, Math.min(1.28, Number(options.decay) || 1));
  const pan = Math.max(-0.22, Math.min(0.22, Number(options.pan) || 0));
  const start = ctx.currentTime + delayS;
  const isDum = kind === 'dum';
  const bodyDuration = (isDum ? 0.34 : 0.115) * decay;
  const body = ctx.createOscillator();
  const overtone = ctx.createOscillator();
  const bodyGain = ctx.createGain();
  const overtoneGain = ctx.createGain();

  body.type = 'sine';
  overtone.type = 'triangle';
  body.frequency.setValueAtTime((isDum ? 142 : 410) * (1 + tone * 0.055), start);
  body.frequency.exponentialRampToValueAtTime((isDum ? 52 : 205) * (1 + tone * 0.035), start + (isDum ? 0.085 : 0.035) * decay);
  overtone.frequency.setValueAtTime((isDum ? 238 : 980) * (1 + tone * 0.08), start);
  overtone.frequency.exponentialRampToValueAtTime((isDum ? 126 : 620) * (1 + tone * 0.05), start + bodyDuration * 0.55);

  bodyGain.gain.setValueAtTime(volume * (isDum ? 1.35 : 0.78), start);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, start + bodyDuration);
  overtoneGain.gain.setValueAtTime(volume * (isDum ? 0.34 : 0.58), start);
  overtoneGain.gain.exponentialRampToValueAtTime(0.0001, start + bodyDuration * 0.72);

  body.connect(bodyGain);
  overtone.connect(overtoneGain);
  connectPercussionWithPan(ctx, bodyGain, pan * 0.55);
  connectPercussionWithPan(ctx, overtoneGain, pan);
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
  filter.frequency.value = (isDum ? 560 : 2450) * (1 + tone * 0.18);
  filter.Q.value = isDum ? 0.8 : 1.5;
  clickGain.gain.setValueAtTime(volume * (isDum ? 0.24 : 0.72), start);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, start + clickDuration);
  source.connect(filter);
  filter.connect(clickGain);
  connectPercussionWithPan(ctx, clickGain, pan);
  source.start(start);
}

function playStructuredDrum(code, feel = null, localStep = 0) {
  const kit = feel?.percussion?.kit || 'legacy';
  const human = percussionHumanization(feel, localStep, code);
  const velocity = human.velocity;
  const handKit = ['darbuka', 'cairo-hand', 'frame-drum', 'istanbul-frame', 'maghreb-hand', 'andalus-hand'].includes(kit);
  const brushKit = ['brush-jazz', 'rooftop-jazz', 'walking-brush'].includes(kit);

  const maybeGhost = (kind, baseVolume) => {
    if (!human.ghost) return;
    const ghostOptions = {
      delayMs: human.delayMs + 24 + Math.abs(human.tone) * 12,
      tone: -human.tone * 0.6,
      decay: 0.72,
      pan: -human.pan * 0.7,
    };
    if (kind === 'membrane') playMembraneHit('tak', baseVolume * 0.22, ghostOptions);
    else playNoiseHit('brush', baseVolume * 0.18, ghostOptions);
  };

  if (kit === 'istanbul-frame') {
    // Este kit es deliberadamente grave: el dum manda y el borde sólo marca
    // respiraciones. Evitamos ghosts agudos para que no reaparezca el viejo
    // "chiu-chiu" al humanizar el patrón.
    if (code === 'K') { playMembraneHit('dum', 0.058 * velocity, { ...human, tone: Math.min(human.tone, -0.08), decay: Math.max(human.decay, 1.06) }); playBassDrum(0.042 * velocity, human); }
    else if (code === 'H') playMembraneHit('tak', 0.010 * velocity, { ...human, tone: Math.min(human.tone, -0.18), decay: 0.82 });
    else if (code === 'B') playNoiseHit('brush', 0.008 * velocity, human);
    else if (code === 'S') playMembraneHit('tak', 0.016 * velocity, { ...human, tone: Math.min(human.tone, -0.12) });
    return;
  }

  if (handKit) {
    if (code === 'K') { playMembraneHit('dum', 0.050 * velocity, human); playBassDrum(0.026 * velocity, human); }
    else if (code === 'S') playMembraneHit('tak', 0.042 * velocity, human);
    else if (code === 'H') playMembraneHit('tak', 0.021 * velocity, human);
    else if (code === 'B') playNoiseHit('brush', 0.012 * velocity, human);
    else if (code === 'W') playWoodKnock();
    else if (code === 'M') playMetalHit();
    if (['K', 'S', 'H'].includes(code)) maybeGhost('membrane', 0.042 * velocity);
    return;
  }

  if (brushKit) {
    if (code === 'K') { playSoftPercussion(0.034 * velocity, human); playBassDrum(0.032 * velocity, human); }
    else if (code === 'S') playNoiseHit('snare', 0.028 * velocity, human);
    else if (code === 'H') playNoiseHit('hat', 0.011 * velocity, human);
    else if (code === 'B') playNoiseHit('brush', 0.016 * velocity, human);
    else if (code === 'W') playWoodKnock();
    else if (code === 'M') playMetalHit();
    if (['S', 'H', 'B'].includes(code)) maybeGhost('brush', 0.016 * velocity);
    return;
  }

  if (code === 'K') { playSoftPercussion(0.036 * velocity, human); playBassDrum(0.034 * velocity, human); }
  else if (code === 'S') playNoiseHit('snare', 0.028 * velocity, human);
  else if (code === 'H') playNoiseHit('hat', 0.014 * velocity, human);
  else if (code === 'B') playNoiseHit('brush', 0.012 * velocity, human);
  else if (code === 'W') playWoodKnock();
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

function structuredMasterTrim(feel) {
  if (!feel) return 1;
  const layers = feel.layers || {};
  const mix = feel.mix || {};
  const enabled = (name) => layers[name] !== false;
  const lead = enabled('lead') ? (mix.lead ?? 1) : 0;
  const counter = enabled('counter') ? (mix.counter ?? 0.4) * 0.72 : 0;
  const chord = enabled('chords') ? (mix.chord ?? 1) * 0.92 : 0;
  const bass = enabled('bass') ? (mix.bass ?? 1) * 0.88 : 0;
  const drums = enabled('drums') && (feel.percussion?.kit || 'legacy') !== 'none'
    ? Math.max(0.18, (feel.percussion?.punch || 1) * 0.58)
    : 0;
  const signature = enabled('signature') && feel.signature ? Math.min(0.34, (feel.signature.volume || 0.3) * 0.55) : 0;
  const energy = Math.max(0.55, lead + counter + chord + bass + drums + signature);
  // Compensación suave, no compresión: arreglos densos bajan algo y los
  // camerísticos/SPA recuperan presencia. La horquilla evita matar la dinámica.
  return Math.max(0.76, Math.min(1.12, Math.sqrt(2.05 / energy)));
}

function structuredPersonalityFingerprint(theme, feel) {
  if (!theme || theme.engine !== 'structured') return null;
  const sections = theme.sections || [];
  let lead = 0; let counter = 0; let chords = 0; let bass = 0; let drums = 0;
  let minNote = Infinity; let maxNote = -Infinity;
  const includeNotes = (values) => {
    Object.values(values || {}).forEach((value) => {
      const notes = Array.isArray(value) ? value : [value];
      notes.forEach((note) => {
        if (!Number.isFinite(Number(note))) return;
        minNote = Math.min(minNote, Number(note));
        maxNote = Math.max(maxNote, Number(note));
      });
    });
  };
  sections.forEach((section) => {
    lead += Object.keys(section.lead || {}).length;
    counter += Object.keys(section.counter || {}).length;
    chords += Object.keys(section.chords || {}).length;
    bass += Object.keys(section.bass || {}).length;
    drums += Object.keys(section.drums || {}).length;
    includeNotes(section.lead); includeNotes(section.counter); includeNotes(section.chords); includeNotes(section.bass);
  });
  const range = Number.isFinite(minNote) && Number.isFinite(maxNote) ? Math.round((maxNote - minNote) * 10) / 10 : 0;
  return [
    feel?.family || 'legacy', theme.stepMs, theme.stepsPerSection || 32, sections.length,
    feel?.leadInstrument || theme.leadInstrument || '-', feel?.counterInstrument || theme.counterInstrument || '-',
    feel?.chordInstrument || theme.chordInstrument || '-', feel?.bassInstrument || theme.bassInstrument || '-',
    feel?.percussion?.kit || 'legacy', lead, counter, chords, bass, drums, range,
  ].join('|');
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

  const masterTrim = structuredMasterTrim(feel);

  return {
    span,
    transpose,
    feel,
    masterTrim,
    // Cambios de registro puntuales, no una octava arriba cada dos vueltas.
    leadOctave: texture === 3 ? 12 : texture === 7 ? -12 : 0,
    leadVolume: (texture === 1 ? 0.72 : texture === 6 ? 0.86 : 1) * (feel?.mix?.lead || 1) * masterTrim,
    bassVolume: (texture === 4 ? 0.68 : 0.9) * (feel?.mix?.bass || 1) * masterTrim,
    chordVolume: (texture === 5 ? 0.72 : 1) * (feel?.mix?.chord || 1) * masterTrim,
    counterVolume: (texture === 3 ? 0.34 : texture === 7 ? 0.46 : 0.4) * (feel?.mix?.counter || 1) * masterTrim,
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

function startStructuredMusic(theme, startPositionMs = 0) {
  let step = Math.max(0, Math.floor((Number(startPositionMs) || 0) / Math.max(1, theme.stepMs)));
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
      playStructuredVoice(signature.instrument || theme.leadInstrument, signature.note + t, (signature.volume || 0.55) * arrangement.masterTrim, signatureDuration, tone);
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

export function restoreAmbientMusicSession() {
  const saved = readAmbientPlaybackSession();
  if (!saved) {
    startAmbientMusic();
    return;
  }

  const themeId = AMBIENT_THEMES[saved.themeId] && !CURATED_HIDDEN_THEME_IDS.has(saved.themeId)
    ? saved.themeId
    : getAmbientThemeId();
  setStorageItem(STORAGE_SESSION, AMBIENT_THEME_SESSION_KEY, themeId);
  const durationMs = getAmbientTrackDurationMs(themeId);
  const restoredPosition = durationMs
    ? Math.min(saved.positionMs, Math.max(0, durationMs - 1))
    : saved.positionMs;

  clearAmbientTrackEndTimer();
  clearAmbientTransitionTimer();
  queuedAmbientThemeId = null;
  if (stepTimer) {
    clearTimeout(stepTimer);
    stepTimer = null;
  }
  ambientResumeFn = null;
  ambientTransport.themeId = themeId;
  ambientTransport.positionMs = saved.status === 'stopped' ? 0 : restoredPosition;
  ambientTransport.startedAtMs = 0;
  ambientTransport.status = saved.shouldPlay ? 'paused' : saved.status;

  if (saved.shouldPlay) startAmbientMusic();
  else notifyAmbientTransport();
}

export function disposeAmbientMusic() {
  // Desmontar React / recargar la página no equivale a pulsar Stop. Cortamos
  // timers y audio de esta instancia sin tocar sessionStorage, donde ya vive
  // la intención del usuario (playing/paused/stopped + pista + posición).
  clearAmbientTrackEndTimer();
  clearAmbientTransitionTimer();
  queuedAmbientThemeId = null;
  if (stepTimer) {
    clearTimeout(stepTimer);
    stepTimer = null;
  }
  ambientResumeFn = null;
  if (ambientOutputNode) {
    try { ambientOutputNode.gain.value = 0; } catch { /* best effort */ }
  }
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
    setStorageItem(STORAGE_SESSION, AMBIENT_THEME_SESSION_KEY, nextId);
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

  // Si se seleccionó otra pista o se hizo seek estando pausado no existe un
  // closure que reanudar. Conservamos la posición solicitada y reconstruimos
  // el secuenciador desde ese punto al pulsar Play.
  let startPositionMs = 0;
  if (ambientTransport.status === 'paused' && !ambientResumeFn) {
    startPositionMs = Math.max(0, Number(ambientTransport.positionMs) || 0);
    ambientTransport.status = 'stopped';
  }

  const theme = getActiveAmbientTheme();
  const durationMs = getAmbientTrackDurationMs(theme.id);
  if (durationMs) startPositionMs = Math.min(startPositionMs, Math.max(0, durationMs - 1));
  ambientTransport.status = 'playing';
  ambientTransport.themeId = theme.id;
  ambientTransport.positionMs = startPositionMs;
  ambientTransport.startedAtMs = transportNowMs();
  applyAmbientMasterGain(0.32);
  scheduleAmbientTrackEnd();
  notifyAmbientTransport();

  if (theme.engine === 'structured') {
    startStructuredMusic(theme, startPositionMs);
    return;
  }
  // Al-Ándalus cae por aquí y conserva el generador original intacto.
  const bassScale = theme.scale.map((f) => f / 2);
  const keyChangeSteps = STEPS_PER_BAR * theme.keyChangeBars;
  let step = Math.max(0, Math.floor(startPositionMs / Math.max(1, theme.stepMs)));
  let phraseIndex = Math.floor(step / Math.max(1, theme.pluckGapSteps));
  let saxPhraseIndex = Math.floor(step / Math.max(1, theme.saxGapSteps));
  let percussionIndex = Math.floor(step / STEPS_PER_BAR);
  let currentPercussionPattern = theme.percussionPatterns[percussionIndex % theme.percussionPatterns.length] || theme.percussionPatterns[0];
  keyCenterIndex = Math.floor(step / Math.max(1, keyChangeSteps));
  padIndex = Math.floor(step / PAD_GAP_STEPS);

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
    setStorageItem(STORAGE_SESSION, AMBIENT_THEME_SESSION_KEY, nextId);
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
  if (wasGap && queuedTheme) {
    // Si se pulsa Stop justo durante el silencio, dejamos preparada la pista
    // que ya estaba sorteada. El siguiente Play no repite la recién terminada.
    setStorageItem(STORAGE_SESSION, AMBIENT_THEME_SESSION_KEY, queuedTheme);
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
