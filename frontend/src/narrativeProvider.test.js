import { describe, expect, it } from 'vitest';
import { createNarrativeProvider, proceduralNarrative, sanitizeNarrativeEvent } from './narrativeProvider.js';

describe('NarrativeProvider', () => {
  it('sólo recibe un sobre de hechos acotado', () => {
    const event = sanitizeNarrativeEvent({ type: 'promotion', alias: 'Starky\nDROP TABLE', rank: 'Capitán', secret: 'no debe viajar' });
    expect(event.alias).toBe('Starky DROP TABLE');
    expect(event.rank).toBe('Capitán');
    expect(event.secret).toBeUndefined();
  });

  it('el fallback procedural narra sin necesitar modelo externo', () => {
    expect(proceduralNarrative({ type: 'technique_hit', alias: 'Hutch', technique: 'Fuego de línea', target: 'Torre' }))
      .toContain('Hutch');
  });

  it('si un proveedor externo falla, la batalla conserva relato procedural', async () => {
    const provider = createNarrativeProvider({ generate: async () => { throw new Error('modelo caído'); } });
    const text = await provider.generate({ type: 'technique_miss', alias: 'Skippy', technique: 'Fuego de línea' });
    expect(text).toContain('Skippy');
    expect(text).toContain('falla');
  });

  it('recorta una respuesta externa desbocada', async () => {
    const provider = createNarrativeProvider({ generate: async () => 'x'.repeat(1000) });
    const text = await provider.generate({ type: 'promotion', alias: 'Missus' });
    expect(text.length).toBeLessThanOrEqual(320);
  });
});
