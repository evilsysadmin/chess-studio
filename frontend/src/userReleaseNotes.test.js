import { describe, expect, it } from 'vitest';
import { APP_RELEASE } from './release.js';
import { USER_RELEASE_NOTES, currentUserReleaseNotes } from './userReleaseNotes.js';

describe('novedades para jugadores', () => {
  it('publica la release actual y omite jerga interna', () => {
    const current = currentUserReleaseNotes();
    expect(current.release).toBe(APP_RELEASE);
    const copy = USER_RELEASE_NOTES.flatMap((entry) => entry.highlights).join(' ');
    expect(copy).not.toMatch(/\bsha(?:-?256)?\b|\bhash(?:es)?\b|pipeline|vitest|pytest|worker fallback/i);
    expect(copy).toMatch(/piezas|mercenarios|solución/i);
  });
});
