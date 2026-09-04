import { describe, expect, it } from 'vitest';
import { USER_RELEASE_NOTES, currentUserReleaseNotes } from './userReleaseNotesData.js';

describe('dm46w · product polish contracts', () => {
  it('Novedades publica sólo cambios comprensibles y útiles para jugadores', () => {
    const payload = JSON.stringify(USER_RELEASE_NOTES);
    expect(payload).not.toMatch(/\bE2E\b|Playwright|Grafana|\bTempo\b|Terraform|telemetr[ií]a|pipeline|CI\/CD|quality gate/i);
    const current = currentUserReleaseNotes('v16.6dm46x');
    expect(current?.highlights?.length).toBeGreaterThanOrEqual(3);
    expect(current?.highlights?.some((item) => /partida|estad[ií]stic|desaf[ií]o/i.test(item))).toBe(true);
  });
});
