// STATIC CONTRACT: Workers AI interpreta hechos existentes; nunca sustituye al motor.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const autopsy = readFileSync(new URL('./components/GameReportModal.jsx', import.meta.url), 'utf8');
const briefing = readFileSync(new URL('./components/CampaignBriefing.jsx', import.meta.url), 'utf8');
const debrief = readFileSync(new URL('./components/CombatDebrief.jsx', import.meta.url), 'utf8');
const observability = readFileSync(new URL('./components/ObservabilityPanel.jsx', import.meta.url), 'utf8');
const tasks = readFileSync(new URL('./aiNarrativeTasks.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../../infra/cloudflare/worker/index.js', import.meta.url), 'utf8');

describe('AI task wiring', () => {
  it('autopsia se construye después del análisis determinista y sin historial/FEN bruto', () => {
    expect(autopsy).toContain('buildPostGameAutopsyDossier(report');
    expect(tasks).toContain("eventType: 'post_game_autopsy'");
    expect(autopsy.indexOf('await analyzeGame')).toBeLessThan(autopsy.indexOf('buildPostGameAutopsyDossier(report'));
    expect(tasks).not.toContain('fen:');
    expect(tasks).not.toContain('history:');
  });

  it('Combat usa hechos de inteligencia y debrief ya calculados', () => {
    expect(briefing).toContain('buildCombatBriefingDossier');
    expect(debrief).toContain('buildCombatDebriefDossier');
    expect(tasks).toContain("eventType: 'combat_briefing'");
    expect(tasks).toContain("eventType: 'combat_debrief'");
  });

  it('observabilidad sólo envía agregados y la explicación es explícitamente a demanda', () => {
    expect(observability).toContain('¿Qué está pasando?');
    expect(observability).toContain('buildObservabilitySummaryDossier');
    expect(tasks).toContain("eventType: 'observability_summary'");
    expect(tasks).not.toContain('username');
  });

  it('las tareas analíticas usan Qwen y un contrato factual específico', () => {
    expect(worker).toContain('RICH_ANALYSIS_EVENTS');
    expect(worker).toContain('const QWEN_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8"');
    expect(worker).toContain('const COMMENT_MODEL = QWEN_MODEL;');
    expect(worker).toContain('const PLAYER_PORTRAIT_MODEL = QWEN_MODEL;');
    expect(worker).toContain('const ANALYSIS_MODEL = QWEN_MODEL;');
    expect(worker).toContain('Para post_game_autopsy');
    expect(worker).toContain('Para combat_briefing');
    expect(worker).toContain('Para combat_debrief');
    expect(worker).toContain('Para observability_summary');
  });
});
