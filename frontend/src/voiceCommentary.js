// voiceCommentary.js — La CPU "habla" en capturas, jaque y jaque mate,
// usando la Web Speech API nativa del navegador (SpeechSynthesisUtterance)
// — sin librerías externas ni archivos de audio, igual criterio que
// sound.js con Web Audio API. Apagado por defecto (opt-in): narrar cada
// jugada puede cansar rápido si no lo pediste tú mismo.

const VOICE_KEY = 'chess-study-voice-enabled';

export function isVoiceEnabled() {
  return localStorage.getItem(VOICE_KEY) === '1';
}

export function setVoiceEnabled(enabled) {
  localStorage.setItem(VOICE_KEY, enabled ? '1' : '0');
}

function speechAvailable() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function speak(text) {
  if (!isVoiceEnabled() || !speechAvailable()) return;
  // Cancelar cualquier frase pendiente antes de la nueva — sin esto, si
  // las jugadas van rápido, las frases se acumulan en cola y la CPU
  // termina hablando de una jugada de hace 30 segundos.
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'es-ES';
  utterance.rate = 1.05;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

const CAPTURE_LINES = [
  (piece) => `Te como ${piece}.`,
  (piece) => `${piece}, fuera del tablero.`,
  (piece) => `Gracias por ${piece}, lo aprovecho bien.`,
  (piece) => `Ahí va ${piece}.`,
];

const CAPTURED_LINES = [
  (piece) => `Me llevaste ${piece}. Bien visto.`,
  (piece) => `Ouch, ${piece} menos.`,
];

const CHECK_LINES = ['¡Jaque!', 'Cuidado, jaque.', 'Jaque al rey.'];

const CHECKMATE_WIN_LINES = ['Jaque mate. Buen intento.', 'Se acabó, jaque mate.', 'Jaque mate, gracias por jugar.'];

const CHECKMATE_LOSS_LINES = ['Jaque mate... me ganaste, bien jugado.', 'Vaya, jaque mate. Enhorabuena.', 'Me diste jaque mate. Buena partida.'];

function randomLine(lines, ...args) {
  const line = lines[Math.floor(Math.random() * lines.length)];
  return typeof line === 'function' ? line(...args) : line;
}

// `pieceName` ya viene en español desde el llamador (p. ej. "una torre") —
// este módulo no sabe de notación FEN ni de mapas de piezas, solo habla.
export function announceCpuCapture(pieceName) {
  speak(randomLine(CAPTURE_LINES, pieceName));
}

export function announceHumanCapture(pieceName) {
  speak(randomLine(CAPTURED_LINES, pieceName));
}

export function announceCheck() {
  speak(randomLine(CHECK_LINES));
}

// `humanWon` = true si el jaque mate lo dio el humano (la CPU "pierde" y
// lo dice con deportividad), false si lo dio la CPU.
export function announceCheckmate(humanWon) {
  speak(randomLine(humanWon ? CHECKMATE_LOSS_LINES : CHECKMATE_WIN_LINES));
}
