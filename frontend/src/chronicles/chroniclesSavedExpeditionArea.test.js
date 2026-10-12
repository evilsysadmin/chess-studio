import { describe, expect, it } from 'vitest';
import { chroniclesSavedExpeditionArea } from './chroniclesSavedExpeditionArea.js';

describe('Chronicles · geograf\u00eda legible en partidas guardadas', () => {
  it('names the actual Terra area instead of hiding it as a generic expedition', () => {
    expect(chroniclesSavedExpeditionArea({ currentMapId: 'terra-f5' }))
      .toBe('F5 · Desierto de Ceniza');
    expect(chroniclesSavedExpeditionArea({ currentMapId: 'vado-de-sal' }))
      .toBe('C5 · Vado de Sal');
  });

  it('prioritizes authoritative current region over original entry, even cross-device', () => {
    expect(chroniclesSavedExpeditionArea({
      entryMapId: 'swordhaven-first-book',
      currentMapId: 'terra-a1',
    })).toBe('A1 · Glaciar del Cuervo');
  });

  it('falls back to a known entry when an old remote current location is gone', () => {
    expect(chroniclesSavedExpeditionArea({
      entryMapId: 'terra-f5',
      currentMapId: 'deleted-region',
    })).toBe('F5 · Desierto de Ceniza');
  });

  it('does not disguise unknown or missing maps as another default dungeon', () => {
    expect(chroniclesSavedExpeditionArea({ currentMapId: 'deleted-region' }))
      .toBe('Expedición en curso');
    expect(chroniclesSavedExpeditionArea(null)).toBe('Expedición en curso');
  });
});
