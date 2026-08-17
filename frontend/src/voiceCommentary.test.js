import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isVoiceEnabled,
  setVoiceEnabled,
  announceCpuCapture,
  announceHumanCapture,
  announceCheck,
  announceCheckmate,
} from './voiceCommentary.js';

function installSpeechMock() {
  const spoken = [];
  let cancelCalls = 0;
  global.window.speechSynthesis = {
    speak: (utterance) => spoken.push(utterance),
    cancel: () => { cancelCalls += 1; },
  };
  global.SpeechSynthesisUtterance = function (text) {
    this.text = text;
    this.lang = '';
    this.rate = 1;
    this.pitch = 1;
  };
  return { spoken, getCancelCalls: () => cancelCalls };
}

beforeEach(() => {
  localStorage.clear();
  global.window = global.window || {};
});

describe('isVoiceEnabled / setVoiceEnabled', () => {
  it('apagado por defecto (opt-in, no opt-out)', () => {
    expect(isVoiceEnabled()).toBe(false);
  });

  it('se prende y persiste', () => {
    setVoiceEnabled(true);
    expect(isVoiceEnabled()).toBe(true);
    setVoiceEnabled(false);
    expect(isVoiceEnabled()).toBe(false);
  });
});

describe('anuncios, con la voz activada', () => {
  it('no habla si la voz está apagada, aunque haya speechSynthesis disponible', () => {
    const { spoken } = installSpeechMock();
    setVoiceEnabled(false);
    announceCheck();
    expect(spoken).toHaveLength(0);
  });

  it('no revienta si speechSynthesis no existe en absoluto (navegador viejo/entorno sin soporte)', () => {
    setVoiceEnabled(true);
    delete global.window.speechSynthesis;
    expect(() => announceCheck()).not.toThrow();
  });

  it('anuncia una captura de la CPU, mencionando la pieza', () => {
    const { spoken } = installSpeechMock();
    setVoiceEnabled(true);
    announceCpuCapture('una torre');
    expect(spoken).toHaveLength(1);
    expect(spoken[0].text).toContain('torre');
    expect(spoken[0].lang).toBe('es-ES');
  });

  it('anuncia una captura del humano, mencionando la pieza', () => {
    const { spoken } = installSpeechMock();
    setVoiceEnabled(true);
    announceHumanCapture('un caballo');
    expect(spoken).toHaveLength(1);
    expect(spoken[0].text).toContain('caballo');
  });

  it('anuncia jaque', () => {
    const { spoken } = installSpeechMock();
    setVoiceEnabled(true);
    announceCheck();
    expect(spoken).toHaveLength(1);
    expect(spoken[0].text.toLowerCase()).toContain('jaque');
  });

  it('anuncia jaque mate, con frases distintas según quién ganó', () => {
    const { spoken } = installSpeechMock();
    setVoiceEnabled(true);
    announceCheckmate(true); // gana el humano
    announceCheckmate(false); // gana la CPU
    expect(spoken).toHaveLength(2);
    expect(spoken[0].text.toLowerCase()).toContain('jaque mate');
    expect(spoken[1].text.toLowerCase()).toContain('jaque mate');
  });

  it('cancela cualquier frase pendiente antes de hablar una nueva', () => {
    const { getCancelCalls } = installSpeechMock();
    setVoiceEnabled(true);
    announceCheck();
    announceCheck();
    expect(getCancelCalls()).toBe(2); // una cancelación por cada llamada a speak
  });
});
