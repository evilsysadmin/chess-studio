import { STORAGE_LOCAL, getStorageItem } from './safeStorage.js';
import { setProfileStorageItem } from './profileKeys.js';
import { duckAmbientMusic } from './sound.js';

// V16.5 — TTS del Game Chat. Opt-in y OFF por defecto.
//
// Chrome/Edge tienen dos rarezas frecuentes: la lista de voces llega tarde y
// `cancel(); speak()` en el mismo tick puede tragarse la primera frase. Por eso
// conservamos la utterance viva, hacemos resume(), esperamos un tick después
// de cancelar y reintentamos una vez si `onstart` nunca llega.
const VOICE_KEY = 'chess-study-voice-enabled';
let speechGeneration = 0;
let duckSafetyTimer = null;
let startWatchdog = null;
let queuedTimer = null;
let activeUtterance = null;
let cachedVoices = [];
let voicesListenerInstalled = false;

const PROFESSOR_NAME_HINTS = [
  'alvaro', 'álvaro', 'jorge', 'pablo', 'diego', 'enrique', 'carlos',
  'miguel', 'antonio', 'raul', 'raúl', 'sergio', 'juan', 'david', 'javier',
];

export function isVoiceEnabled() {
  return getStorageItem(STORAGE_LOCAL, VOICE_KEY) === '1';
}

export function isVoiceSupported() {
  return typeof window !== 'undefined'
    && !!window.speechSynthesis
    && typeof window.SpeechSynthesisUtterance === 'function';
}

export function setVoiceEnabled(enabled) {
  setProfileStorageItem(VOICE_KEY, enabled ? '1' : '0');
  if (!enabled) stopCpuSpeech();
}

function scoreVoice(voice) {
  const name = String(voice?.name || '').toLowerCase();
  const lang = String(voice?.lang || '').toLowerCase();
  let score = 0;
  if (lang === 'es-es') score += 120;
  else if (lang.startsWith('es-es')) score += 115;
  else if (lang.startsWith('es')) score += 75;
  if (/(natural|neural|premium|enhanced|online)/.test(name)) score += 28;
  if (PROFESSOR_NAME_HINTS.some((hint) => name.includes(hint))) score += 18;
  // Evitamos, cuando el nombre lo delata, voces infantiles o explícitamente
  // festivas. Es una heurística suave: nunca dejamos al usuario sin voz.
  if (/(kid|child|niñ|comic|funny|whisper)/.test(name)) score -= 30;
  if (voice?.default) score += 3;
  return score;
}

export function selectProfessorVoice(voices = []) {
  const usable = Array.from(voices || []).filter(Boolean);
  const spanish = usable.filter((voice) => String(voice?.lang || '').toLowerCase().startsWith('es'));
  if (!spanish.length) return null;
  return [...spanish].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] || null;
}

function refreshVoices() {
  if (!isVoiceSupported() || typeof window.speechSynthesis.getVoices !== 'function') return [];
  try {
    const voices = window.speechSynthesis.getVoices() || [];
    if (voices.length) cachedVoices = voices;
  } catch {
    // dejamos la cache anterior
  }
  return cachedVoices;
}

function ensureVoiceListener() {
  if (!isVoiceSupported() || voicesListenerInstalled) return;
  voicesListenerInstalled = true;
  refreshVoices();
  try {
    window.speechSynthesis.addEventListener?.('voiceschanged', refreshVoices);
  } catch {
    window.speechSynthesis.onvoiceschanged = refreshVoices;
  }
}

function clearSpeechTimers() {
  if (duckSafetyTimer) clearTimeout(duckSafetyTimer);
  if (startWatchdog) clearTimeout(startWatchdog);
  if (queuedTimer) clearTimeout(queuedTimer);
  duckSafetyTimer = null;
  startWatchdog = null;
  queuedTimer = null;
}

export function stopCpuSpeech() {
  speechGeneration += 1;
  clearSpeechTimers();
  activeUtterance = null;
  if (isVoiceSupported()) {
    try { window.speechSynthesis.cancel(); } catch { /* navegador raro */ }
  }
  duckAmbientMusic(false);
}

function buildUtterance(clean) {
  const utterance = new window.SpeechSynthesisUtterance(clean);
  utterance.lang = 'es-ES';
  // Catedrático con pipa: sobrio, seguro, un poco afectado; no caricaturesco.
  utterance.rate = 0.84;
  utterance.pitch = 0.80;
  utterance.volume = 0.96;
  const selected = selectProfessorVoice(refreshVoices());
  if (selected) utterance.voice = selected;
  return utterance;
}

function queueSpeech(clean, generation, retry = false) {
  if (generation !== speechGeneration || !isVoiceEnabled() || !isVoiceSupported()) return;
  const synth = window.speechSynthesis;
  const utterance = buildUtterance(clean);
  activeUtterance = utterance; // evita GC prematuro en algunos WebKit/Chromium
  let started = false;

  const finish = () => {
    if (generation !== speechGeneration) return;
    clearSpeechTimers();
    activeUtterance = null;
    duckAmbientMusic(false);
  };

  utterance.onstart = () => {
    if (generation !== speechGeneration) return;
    started = true;
    if (startWatchdog) { clearTimeout(startWatchdog); startWatchdog = null; }
    duckAmbientMusic(true);
  };
  utterance.onend = finish;
  utterance.onerror = finish;

  try { synth.resume?.(); } catch { /* nada */ }
  duckAmbientMusic(true);

  // Si el motor acepta speak() pero no arranca (bug típico tras cancel),
  // reintentamos una sola vez SIN voz seleccionada después de reanudar.
  startWatchdog = setTimeout(() => {
    if (generation !== speechGeneration || started) return;
    try { synth.cancel(); synth.resume?.(); } catch { /* nada */ }
    if (!retry) {
      queuedTimer = setTimeout(() => queueSpeech(clean, generation, true), 120);
    } else {
      finish();
    }
  }, 1400);

  duckSafetyTimer = setTimeout(finish, Math.min(26000, Math.max(7500, clean.length * 105)));

  try {
    if (retry) utterance.voice = null;
    synth.speak(utterance);
  } catch {
    finish();
  }
}

export function speakCpuComment(text) {
  const clean = String(text || '').trim();
  if (!clean || !isVoiceEnabled() || !isVoiceSupported()) return false;
  ensureVoiceListener();

  speechGeneration += 1;
  const generation = speechGeneration;
  clearSpeechTimers();
  try { window.speechSynthesis.cancel(); } catch { /* ignore */ }

  // Darle un pequeño respiro al cancel es la diferencia entre "botón ON" y
  // silencio absoluto en determinadas versiones de Chromium.
  queuedTimer = setTimeout(() => queueSpeech(clean, generation, false), 70);
  return true;
}

// Se invoca desde el click que activa VOICE. Ese gesto de usuario desbloquea
// los navegadores más estrictos y, además, da feedback inmediato de que la voz
// funciona. No se guarda en el transcript: es una prueba de canal, no una
// observación sobre la partida.
export function previewCpuVoice() {
  if (!isVoiceEnabled() || !isVoiceSupported()) return false;
  ensureVoiceListener();

  // IMPORTANTE: esta primera frase se lanza SIN setTimeout. Safari/iOS y
  // algunos Chromium conservan el permiso de audio sólo durante el gesto de
  // usuario que pulsó VOICE ON. En Linux/Chromium, en cambio, a veces speak()
  // acepta la utterance pero no la arranca hasta que el motor de voces termina
  // de despertar. Hacemos un segundo intento si `onstart` no llega.
  const previewText = 'Perfectamente. Procuraré vocalizar, para que no se pierda usted ningún detalle.';
  speechGeneration += 1;
  const generation = speechGeneration;
  clearSpeechTimers();
  const synth = window.speechSynthesis;
  const utterance = buildUtterance(previewText);
  activeUtterance = utterance;
  let started = false;
  let handedOffToRetry = false;

  const finish = () => {
    if (generation !== speechGeneration || handedOffToRetry) return;
    clearSpeechTimers();
    activeUtterance = null;
    duckAmbientMusic(false);
  };
  utterance.onstart = () => {
    if (generation !== speechGeneration) return;
    started = true;
    if (startWatchdog) { clearTimeout(startWatchdog); startWatchdog = null; }
    duckAmbientMusic(true);
  };
  utterance.onend = finish;
  utterance.onerror = finish;

  try {
    synth.resume?.();
    // Al activar VOICE venimos de estado OFF, por lo que no debería existir
    // otra frase. Evitamos cancel() ANTES del primer speak para no disparar el
    // bug cancel+speak del mismo tick durante el gesto de desbloqueo.
    synth.speak(utterance);
    duckSafetyTimer = setTimeout(finish, 12000);
    startWatchdog = setTimeout(() => {
      if (generation !== speechGeneration || started) return;
      // Primer intento aceptado pero mudo: ahora sí cancelamos/reanudamos y
      // reutilizamos la cola normal, que además prueba una vez sin voz fijada.
      handedOffToRetry = true;
      try { synth.cancel(); synth.resume?.(); } catch { /* motor raro */ }
      activeUtterance = null;
      duckAmbientMusic(false);
      queuedTimer = setTimeout(() => queueSpeech(previewText, generation, false), 90);
    }, 1500);
    return true;
  } catch {
    finish();
    return false;
  }
}

ensureVoiceListener();
