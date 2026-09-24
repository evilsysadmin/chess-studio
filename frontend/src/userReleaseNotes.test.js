import { describe, expect, it } from 'vitest';
import { LATEST_USER_NOTE_ID } from './userReleaseNotes.js';
import { USER_RELEASE_NOTES } from './userReleaseNotesData.js';

const JARGON = /\bsha(?:-?256)?\b|\bhash(?:es)?\b|\bE2E\b|Playwright|Vitest|Pytest|Grafana|\bTempo\b|Terraform|telemetr[ií]a|pipeline|CI\/CD|quality gate|workflow|\bCSS\b|bundle|runtime|GLB|shader/i;
const ACTIONS = ['close', 'daily', 'history', 'progress'];

describe('novedades para jugadores', () => {
  it('el aviso «Nuevo» sigue a la entrada más reciente', () => {
    expect(USER_RELEASE_NOTES[0].id).toBe(LATEST_USER_NOTE_ID);
  });

  it('cada entrada tiene id único, fecha, y de 2 a 4 puntos cortos', () => {
    const ids = USER_RELEASE_NOTES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of USER_RELEASE_NOTES) {
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.title.length).toBeGreaterThan(5);
      expect(entry.highlights.length).toBeGreaterThanOrEqual(2);
      expect(entry.highlights.length).toBeLessThanOrEqual(4);
      for (const line of entry.highlights) expect(line.length).toBeLessThanOrEqual(260);
    }
  });

  it('están ordenadas de más nueva a más antigua', () => {
    const dates = USER_RELEASE_NOTES.map((entry) => entry.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('sólo usan acciones que la app sabe atender', () => {
    for (const entry of USER_RELEASE_NOTES) {
      if (!entry.action) continue;
      expect(entry.action.label.length).toBeGreaterThan(2);
      expect(ACTIONS).toContain(entry.action.to);
    }
  });

  it('están escritas para jugadores: sin jerga interna', () => {
    const copy = USER_RELEASE_NOTES.flatMap((entry) => [entry.title, ...entry.highlights]).join(' ');
    expect(copy).not.toMatch(JARGON);
  });
});

describe('atajos de novedades', () => {
  it('cada acción navega a su destino y cerrar no navega', async () => {
    const { openReleaseNoteTarget } = await import('./userReleaseNotes.js');
    const calls = [];
    const helpers = { navigateTo: (to) => calls.push(['nav', to]), setInsightsLandingSection: (s) => calls.push(['section', s]) };
    openReleaseNoteTarget('daily', helpers);
    openReleaseNoteTarget('history', helpers);
    openReleaseNoteTarget('progress', helpers);
    openReleaseNoteTarget('close', helpers);
    openReleaseNoteTarget(undefined, helpers);
    expect(calls).toEqual([['nav', 'dailyChallenges'], ['nav', 'history'], ['section', 'career'], ['nav', 'insights']]);
  });
});
