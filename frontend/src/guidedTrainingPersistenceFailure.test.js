import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GUIDED_TRAINING_SESSION_KEY,
  advanceGuidedTrainingSession,
  clearGuidedTrainingSession,
  loadGuidedTrainingSession,
  startGuidedTrainingSession,
} from './guidedTrainingSessionStore.js';

const NOW = 1_800_000_000_000;
const PLAN = {
  available: true,
  minutes: 5,
  steps: [
    { id: 'focus', kind: 'debt', title: 'Practicar un error real', action: 'personal', minutes: 4 },
    { id: 'review', kind: 'review', title: 'Cierre', action: 'review', minutes: 1 },
  ],
};
function denyNativeWrite() {
  const native = sessionStorage.setItem.bind(sessionStorage);
  return vi.spyOn(sessionStorage, 'setItem').mockImplementation((key, value) => {
    if (key === GUIDED_TRAINING_SESSION_KEY) throw new DOMException('Quota exceeded', 'QuotaExceededError');
    return native(key, value);
  });
}
function denyNativeRemoval() {
  const native = sessionStorage.removeItem.bind(sessionStorage);
  return vi.spyOn(sessionStorage, 'removeItem').mockImplementation((key) => {
    if (key === GUIDED_TRAINING_SESSION_KEY) throw new DOMException('Denied', 'SecurityError');
    return native(key);
  });
}

describe('sesión guiada · durabilidad real tras F5', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clearGuidedTrainingSession();
    sessionStorage.clear();
  });

  it('no anuncia una sesión iniciada si el navegador rechaza guardarla', () => {
    const denied = denyNativeWrite();
    expect(startGuidedTrainingSession(PLAN, { now: NOW })).toBeNull();
    expect(loadGuidedTrainingSession({ now: NOW })).toBeNull();
    expect(sessionStorage.getItem(GUIDED_TRAINING_SESSION_KEY)).toBeNull();
    denied.mockRestore();
  });

  it('conserva el encargo previo cuando un reinicio no se puede persistir', () => {
    const previous = startGuidedTrainingSession(PLAN, { now: NOW });
    const actual = sessionStorage.getItem(GUIDED_TRAINING_SESSION_KEY);
    const denied = denyNativeWrite();
    expect(startGuidedTrainingSession(PLAN, { now: NOW + 1 })).toBeNull();
    expect(sessionStorage.getItem(GUIDED_TRAINING_SESSION_KEY)).toBe(actual);
    expect(loadGuidedTrainingSession({ now: NOW + 1 })).toMatchObject({ id: previous.id, currentIndex: 0 });
    denied.mockRestore();
  });

  it('mantiene el paso anterior hasta confirmar la nueva escritura en Web Storage', () => {
    const started = startGuidedTrainingSession(PLAN, { now: NOW });
    const actual = sessionStorage.getItem(GUIDED_TRAINING_SESSION_KEY);
    const denied = denyNativeWrite();
    const refused = advanceGuidedTrainingSession(started, { now: NOW });
    expect(refused).toMatchObject({ id: started.id, currentIndex: 0 });
    expect(sessionStorage.getItem(GUIDED_TRAINING_SESSION_KEY)).toBe(actual);
    expect(loadGuidedTrainingSession({ now: NOW })).toMatchObject({ currentIndex: 0 });
    denied.mockRestore();
    expect(advanceGuidedTrainingSession(refused, { now: NOW })?.currentIndex).toBe(1);
  });

  it('no acredita el cierre mientras la eliminación del expediente esté bloqueada', () => {
    const started = startGuidedTrainingSession(PLAN, { now: NOW });
    const finalStep = advanceGuidedTrainingSession(started, { now: NOW });
    expect(finalStep?.currentIndex).toBe(1);
    const denied = denyNativeRemoval();
    const refused = advanceGuidedTrainingSession(finalStep, { now: NOW });
    expect(refused?.currentIndex).toBe(1);
    expect(loadGuidedTrainingSession({ now: NOW })?.currentIndex).toBe(1);
    denied.mockRestore();
    expect(advanceGuidedTrainingSession(refused, { now: NOW })).toBeNull();
    expect(loadGuidedTrainingSession({ now: NOW })).toBeNull();
  });
});
