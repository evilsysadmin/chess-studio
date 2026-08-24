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
    expect(insights).toContain('cada 6 h');
    expect(insights).toContain('↻ Analizarme de nuevo');
    expect(insights.indexOf('↻ Analizarme de nuevo')).toBeLessThan(insights.indexOf('<details className="friendly-disclosure ai-player-portrait-details">'));
    expect(insights).toContain("requestKind,");
    expect(insights).toContain("'portrait_manual'");
    const manualSuccess = insights.indexOf("if (requestKind === 'portrait_manual')");
    const cooldownCommit = insights.indexOf('markPlayerPortraitManualRefresh()', manualSuccess);
    const freshHandler = insights.indexOf('function requestFreshPortrait()');
    expect(manualSuccess).toBeGreaterThan(-1);
    expect(cooldownCommit).toBeGreaterThan(manualSuccess);
    expect(insights.slice(freshHandler, insights.indexOf('const coaching', freshHandler))).not.toContain('markPlayerPortraitManualRefresh()');
  });

  it('el contrato del Worker exige tuteo y sarcasmo de buen rollo también durante partida', () => {
    expect(worker).toContain('Tutea siempre');
    expect(worker).toContain('Sarcasmo juguetón');
    expect(worker).toContain('no insultes su');
    expect(worker).toContain('Para player_portrait');
    expect(worker).toContain('Para comentarios de partida');
    expect(worker).toContain('PLAYER_PORTRAIT_MAX_OUTPUT_CHARS = 900');
    expect(worker).toContain('PLAYER_PORTRAIT_GENERATION');
    expect(worker).toContain('PLAYER_PORTRAIT_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8"');
    expect(worker).toContain('modelFor(eventType)');
    expect(worker).toContain('firstChoice?.message?.content');
    expect(worker).toContain('error_name: errorName');
    expect(worker).toContain('temperature: 0.60');
    expect(worker).toContain('max_tokens: 180');
    expect(worker).toContain('exactamente 3 frases compactas');
    expect(worker).toContain('usa una o dos cifras');
    expect(worker).toContain('recomendación práctica');
    expect(worker).toContain('una sola');
    expect(worker).toContain('copia literalmente su nombre');
  });
});
