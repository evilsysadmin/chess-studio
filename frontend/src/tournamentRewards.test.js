import { describe, it, expect, beforeEach } from 'vitest';
import {
  TITLES,
  PIECE_SKINS,
  unlockedTitles,
  unlockedSkins,
  nextTitleToUnlock,
  nextSkinToUnlock,
  loadSelectedTitle,
  saveSelectedTitle,
  loadSelectedSkin,
  saveSelectedSkin,
} from './tournamentRewards.js';

beforeEach(() => localStorage.clear());

describe('unlockedTitles / unlockedSkins', () => {
  it('en nivel 1 solo desbloquea el título y skin de nivel 1', () => {
    expect(unlockedTitles(1)).toHaveLength(1);
    expect(unlockedTitles(1)[0].id).toBe('novato');
    expect(unlockedSkins(1)).toHaveLength(1);
    expect(unlockedSkins(1)[0].id).toBe('default');
  });

  it('los desbloqueos son acumulativos, no se pierden al subir de nivel', () => {
    const titlesAt10 = unlockedTitles(10);
    const idsAt10 = titlesAt10.map((t) => t.id);
    expect(idsAt10).toContain('novato');
    expect(idsAt10).toContain('aprendiz');
    expect(idsAt10).toContain('constante');
  });

  it('en el nivel máximo de título (80) todos están desbloqueados', () => {
    expect(unlockedTitles(80)).toHaveLength(TITLES.length);
  });

  it('nunca desbloquea un título/skin de nivel mayor al actual', () => {
    const titles9 = unlockedTitles(9);
    expect(titles9.some((t) => t.id === 'constante')).toBe(false); // constante es nivel 10
  });
});

describe('nextTitleToUnlock / nextSkinToUnlock', () => {
  it('en nivel 1 el próximo título es el de nivel 5', () => {
    expect(nextTitleToUnlock(1).id).toBe('aprendiz');
  });

  it('devuelve null cuando ya se desbloquearon todos', () => {
    expect(nextTitleToUnlock(999)).toBeNull();
    expect(nextSkinToUnlock(999)).toBeNull();
  });
});

describe('selección persistida', () => {
  it('el título por defecto es "novato" si nunca se eligió nada', () => {
    expect(loadSelectedTitle()).toBe('novato');
  });

  it('el skin por defecto es "default" si nunca se eligió nada', () => {
    expect(loadSelectedSkin()).toBe('default');
  });

  it('guarda y recupera la selección', () => {
    saveSelectedTitle('estratega');
    expect(loadSelectedTitle()).toBe('estratega');
    saveSelectedSkin('azul');
    expect(loadSelectedSkin()).toBe('azul');
  });
});
