// STATIC CONTRACT: retrato AI y tono común del proveedor narrativo.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const insights = readFileSync(new URL('./components/InsightsScreen.jsx', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../../infra/cloudflare/worker/index.js', import.meta.url), 'utf8');

describe('AI portrait + shared narrative voice', () => {
  it('usa el mismo provider remoto y mantiene fallback local instantáneo', () => {
    expect(insights).toContain("eventType: 'player_portrait'");
    expect(insights).toContain("tone: 'friendly_sarcastic'");
    expect(insights).toContain('portraitText || localPortrait');
    expect(insights).toContain('loadCachedPlayerPortrait');
    expect(insights).toContain('cada 3 partidas');
  });

  it('el contrato del Worker exige tuteo y sarcasmo de buen rollo también durante partida', () => {
    expect(worker).toContain('Tutea siempre');
    expect(worker).toContain('Sarcasmo juguetón');
    expect(worker).toContain('no insultes su');
    expect(worker).toContain('Para player_portrait');
    expect(worker).toContain('Para comentarios de partida');
  });
});
