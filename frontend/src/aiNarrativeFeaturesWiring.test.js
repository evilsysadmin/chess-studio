import { describe, expect, it } from 'vitest';
import {
  buildCombatBriefingDossier,
  buildCombatDebriefDossier,
  buildObservabilitySummaryDossier,
  buildPostGameAutopsyDossier,
} from './aiNarrativeTasks.js';
import {
  ANALYSIS_MODEL,
  COMMENT_MODEL,
  PLAYER_PORTRAIT_MODEL,
  QWEN_MODEL,
  RICH_ANALYSIS_EVENTS,
  modelFor,
} from '../../infra/cloudflare/worker/index.js';

function serialized(value) {
  return JSON.stringify(value);
}

describe('AI task wiring', () => {
  it('construye autopsias desde resultados deterministas sin FEN ni historial bruto', () => {
    const dossier = buildPostGameAutopsyDossier({ analyzedCount: 4, averageLoss: 61, topMistakes: [] }, { outcome: 'loss', opening: 'Réti' });
    expect(dossier).toMatchObject({ eventType: 'post_game_autopsy', requestKind: 'post_game' });
    expect(serialized(dossier)).not.toMatch(/\bfen\b|\bhistory\b/i);
  });

  it('Combat genera dossiers distintos para briefing y debrief', () => {
    const briefing = buildCombatBriefingDossier({ node: { stage: 2, label: 'Sector 2' }, intel: { threatBand: 'alta', levelLabel: 'II' }, campaign: {}, armySummary: {} });
    const debrief = buildCombatDebriefDossier({ outcome: 'win', topUnits: [], units: [] });
    expect(briefing?.eventType).toBe('combat_briefing');
    expect(debrief?.eventType).toBe('combat_debrief');
  });

  it('observabilidad sólo construye un dossier agregado y excluye identidad', () => {
    const dossier = buildObservabilitySummaryDossier({ runtime: { history: { http: {}, ai: {} }, database: {} }, ai: {} });
    expect(dossier).toMatchObject({ eventType: 'observability_summary', requestKind: 'observability_summary' });
    expect(serialized(dossier)).not.toMatch(/username|email|token|fen/i);
  });

  it('todos los canales remotos enrutan actualmente a Qwen desde una sola fuente de verdad', () => {
    expect(COMMENT_MODEL).toBe(QWEN_MODEL);
    expect(PLAYER_PORTRAIT_MODEL).toBe(QWEN_MODEL);
    expect(ANALYSIS_MODEL).toBe(QWEN_MODEL);
    expect(modelFor('generic')).toBe(QWEN_MODEL);
    expect(modelFor('player_portrait')).toBe(QWEN_MODEL);
    for (const eventType of RICH_ANALYSIS_EVENTS) expect(modelFor(eventType)).toBe(QWEN_MODEL);
  });
});
