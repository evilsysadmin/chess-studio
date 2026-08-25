import { beforeEach, describe, expect, it } from 'vitest';
import {
  VIEW_STORAGE_KEY,
  VIEW_HISTORY_STORAGE_KEY,
  clearSessionView,
  loadSessionView,
  loadSessionViewHistory,
  rememberSessionView,
  rememberSessionViewHistory,
} from './viewState.js';

describe('navegación resistente a refresh', () => {
  beforeEach(() => sessionStorage.clear());

  it('restaura una pantalla reconstruible como Admin', () => {
    rememberSessionView('admin');
    expect(loadSessionView({ isAdminUser: true })).toBe('admin');
  });

  it('restaura el hub de Desafíos diarios después de refresh', () => {
    rememberSessionView('dailyChallenges');
    expect(loadSessionView()).toBe('dailyChallenges');
  });

  it('no restaura Admin para un usuario que no es admin', () => {
    sessionStorage.setItem(VIEW_STORAGE_KEY, 'admin');
    expect(loadSessionView({ isAdminUser: false })).toBe('menu');
  });

  it('una vista efímera no pisa la última pantalla segura', () => {
    rememberSessionView('history');
    rememberSessionView('replay');
    expect(loadSessionView()).toBe('history');
  });

  it('un valor desconocido cae de forma segura al menú', () => {
    sessionStorage.setItem(VIEW_STORAGE_KEY, 'pantalla-mutante');
    expect(loadSessionView()).toBe('menu');
  });


  it('conserva una pila de vuelta entre refreshes', () => {
    rememberSessionViewHistory(['menu', 'tournament', 'history']);
    expect(loadSessionViewHistory()).toEqual(['menu', 'tournament', 'history']);
  });

  it('el historial persistido descarta vistas efímeras y Admin si no corresponde', () => {
    rememberSessionViewHistory(['menu', 'game', 'admin', 'replay', 'history']);
    expect(loadSessionViewHistory({ isAdminUser: false })).toEqual(['menu', 'history']);
    expect(loadSessionViewHistory({ isAdminUser: true })).toEqual(['menu', 'admin', 'history']);
  });

  it('puede limpiar la vista al cambiar de identidad', () => {
    rememberSessionView('insights');
    rememberSessionViewHistory(['menu', 'insights']);
    clearSessionView();
    expect(loadSessionView()).toBe('menu');
    expect(sessionStorage.getItem(VIEW_HISTORY_STORAGE_KEY)).toBeNull();
  });
});
