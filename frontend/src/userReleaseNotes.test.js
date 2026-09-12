import { describe, expect, it } from 'vitest';
import { APP_RELEASE } from './release.js';
import { USER_RELEASE_NOTES, currentUserReleaseNotes } from './userReleaseNotesData.js';

describe('novedades para jugadores', () => {
  it('publica la release actual con contenido útil y sin jerga interna', () => {
    const current = currentUserReleaseNotes();
    expect(current.release).toBe(APP_RELEASE);
    expect(current.highlights.length).toBeGreaterThanOrEqual(3);

    const copy = USER_RELEASE_NOTES.flatMap((entry) => entry.highlights).join(' ');
    expect(copy).not.toMatch(/\bsha(?:-?256)?\b|\bhash(?:es)?\b|\bE2E\b|Playwright|Vitest|Pytest|Grafana|\bTempo\b|Terraform|telemetr[ií]a|pipeline|CI\/CD|quality gate|worker fallback/i);
    expect(copy).toMatch(/piezas|mercenarios|solución|partida|estad[ií]stic|desaf[ií]o/i);
  });
});
