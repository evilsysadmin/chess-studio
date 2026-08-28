// audioContext.js — único propietario del AudioContext compartido por música y FX.
let audioContext = null;

export function resumeAudioContext() {
  if (!audioContext || audioContext.state !== 'suspended' || typeof audioContext.resume !== 'function') return Promise.resolve(false);
  return audioContext.resume().then(() => true).catch(() => false);
}

export function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    audioContext = new AudioContextClass();
  }
  return audioContext;
}

export function getAudioContextState() {
  return audioContext?.state || 'uninitialized';
}
