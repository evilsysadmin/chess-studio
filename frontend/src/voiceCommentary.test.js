import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isVoiceEnabled,
  isVoiceSupported,
  previewCpuVoice,
  selectProfessorVoice,
  setVoiceEnabled,
  speakCpuComment,
  stopCpuSpeech,
} from './voiceCommentary.js';

function installSpeechMock(voices = []) {
  const spoken = [];
  let cancelCalls = 0;
  let resumeCalls = 0;
  const listeners = {};

  window.speechSynthesis = {
    speak: (utterance) => spoken.push(utterance),
    cancel: () => { cancelCalls += 1; },
    resume: () => { resumeCalls += 1; },
    getVoices: () => voices,
    addEventListener: (name, callback) => { listeners[name] = callback; },
    removeEventListener: (name) => { delete listeners[name]; },
  };

  window.SpeechSynthesisUtterance = function SpeechSynthesisUtterance(text) {
    this.text = text;
    this.lang = '';
    this.rate = 1;
    this.pitch = 1;
    this.volume = 1;
    this.voice = null;
    this.onstart = null;
    this.onend = null;
    this.onerror = null;
  };

  return {
    spoken,
    listeners,
    getCancelCalls: () => cancelCalls,
    getResumeCalls: () => resumeCalls,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  global.window = global.window || {};
  delete window.speechSynthesis;
  delete window.SpeechSynthesisUtterance;
});

afterEach(() => {
  stopCpuSpeech();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('VOICE opt-in', () => {
  it('está apagada por defecto', () => {
    expect(isVoiceEnabled()).toBe(false);
  });

  it('persiste ON/OFF', () => {
    installSpeechMock();
    setVoiceEnabled(true);
    expect(isVoiceEnabled()).toBe(true);
    setVoiceEnabled(false);
    expect(isVoiceEnabled()).toBe(false);
  });

  it('detecta navegadores con síntesis de voz', () => {
    installSpeechMock();
    expect(isVoiceSupported()).toBe(true);
  });
});

describe('voz del Game Chat', () => {
  it('no habla si VOICE está OFF', () => {
    const { spoken } = installSpeechMock();
    expect(speakCpuComment('La dama era cara.')).toBe(false);
    vi.advanceTimersByTime(100);
    expect(spoken).toHaveLength(0);
  });

  it('pronuncia exactamente el comentario con perfil sobrio tras el pequeño desbloqueo', () => {
    const professor = { name: 'Microsoft Alvaro Online (Natural)', lang: 'es-ES', default: false };
    const fallback = { name: 'English Voice', lang: 'en-US', default: true };
    const { spoken, getResumeCalls } = installSpeechMock([fallback, professor]);
    setVoiceEnabled(true);

    expect(speakCpuComment('La dama era cara. Espero que conservaras el recibo.')).toBe(true);
    expect(spoken).toHaveLength(0); // evita cancel()+speak() en el mismo tick de Chromium
    vi.advanceTimersByTime(80);

    expect(spoken).toHaveLength(1);
    expect(spoken[0].text).toBe('La dama era cara. Espero que conservaras el recibo.');
    expect(spoken[0].lang).toBe('es-ES');
    expect(spoken[0].rate).toBeLessThan(1);
    expect(spoken[0].pitch).toBeLessThan(1);
    expect(spoken[0].voice).toBe(professor);
    expect(getResumeCalls()).toBeGreaterThan(0);
  });

  it('prioriza español de España y voces naturales', () => {
    const voices = [
      { name: 'Default English', lang: 'en-US', default: true },
      { name: 'Spanish Generic', lang: 'es-MX', default: false },
      { name: 'Alvaro Natural', lang: 'es-ES', default: false },
    ];
    expect(selectProfessorVoice(voices)).toBe(voices[2]);
  });

  it('VOICE ON hace una prueba audible inmediata por gesto del usuario', () => {
    const { spoken } = installSpeechMock([{ name: 'Alvaro Natural', lang: 'es-ES', default: true }]);
    setVoiceEnabled(true);
    expect(previewCpuVoice()).toBe(true);
    // Debe ocurrir dentro del propio gesto: si se difiere, Safari/iOS puede
    // perder la autorización de speechSynthesis.
    expect(spoken).toHaveLength(1);
    expect(spoken[0].text).toMatch(/vocalizar/i);
  });

  it('si Chromium acepta el preview pero no dispara onstart, reintenta el canal', () => {
    const { spoken, getCancelCalls, getResumeCalls } = installSpeechMock([
      { name: 'Alvaro Natural', lang: 'es-ES', default: true },
    ]);
    setVoiceEnabled(true);

    expect(previewCpuVoice()).toBe(true);
    expect(spoken).toHaveLength(1);
    // Simulamos el fallo real observado: speak() acepta la utterance pero
    // el motor del SO nunca lanza onstart. El watchdog debe despertar el
    // sintetizador y entregar la frase a la cola robusta.
    vi.advanceTimersByTime(1600);
    expect(getCancelCalls()).toBeGreaterThan(0);
    expect(getResumeCalls()).toBeGreaterThan(0);
    vi.advanceTimersByTime(100);
    expect(spoken.length).toBeGreaterThanOrEqual(2);
    expect(spoken.at(-1).text).toMatch(/vocalizar/i);
  });

  it('cancela la frase anterior antes de una nueva', () => {
    const { getCancelCalls } = installSpeechMock();
    setVoiceEnabled(true);
    speakCpuComment('Primera sentencia.');
    speakCpuComment('Segunda sentencia.');
    expect(getCancelCalls()).toBe(2);
  });

  it('no revienta sin soporte del navegador', () => {
    localStorage.setItem('chess-study-voice-enabled', '1');
    expect(() => speakCpuComment('Silencio.')).not.toThrow();
    expect(speakCpuComment('Silencio.')).toBe(false);
    expect(() => stopCpuSpeech()).not.toThrow();
  });
});
