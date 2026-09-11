import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearStorageMemoryFallback } from '../safeStorage.js';
import { recordNarrativeCall } from '../narrativeCallLedger.js';
import PrivacyDataDisclosure from './PrivacyDataDisclosure.jsx';

describe('PrivacyDataDisclosure', () => {
  beforeEach(() => {
    localStorage.clear();
    clearStorageMemoryFallback();
  });

  it('explains backend, Workers AI and telemetry boundaries from the actual contracts', () => {
    recordNarrativeCall({
      eventType: 'post_game_autopsy',
      requestKind: 'analysis',
      provider: 'cloudflare',
      inputChars: 700,
      outputChars: 240,
      ok: true,
    });

    const html = renderToStaticMarkup(<PrivacyDataDisclosure />);
    expect(html).toContain('data-privacy-data-disclosure="v1"');
    expect(html).toContain('Backend de Chess Studio');
    expect(html).toContain('Workers AI y narrativa');
    expect(html).toContain('Almacenamiento local');
    expect(html).toContain('Telemetría técnica');
    expect(html).toContain('<b>1</b> llamadas recientes registradas localmente');
    expect(html).toContain('última: Workers AI');
    expect(html).toContain('Borrar historial local de llamadas IA');
    expect(html).toContain('no incluye FEN, lista de jugadas, texto narrativo, contraseña ni token');
  });

  it('never renders narrative contents from the local metadata ledger', () => {
    recordNarrativeCall({
      eventType: 'mate',
      provider: 'cloudflare',
      inputChars: 999,
      outputChars: 99,
      ok: true,
      prompt: 'SECRET-PROMPT',
      facts: { fen: 'SECRET-FEN' },
      text: 'SECRET-NARRATIVE',
    });
    localStorage.setItem('unrelated-secret', 'SECRET-JWT');

    const html = renderToStaticMarkup(<PrivacyDataDisclosure />);
    for (const secret of ['SECRET-PROMPT', 'SECRET-FEN', 'SECRET-NARRATIVE', 'SECRET-JWT']) {
      expect(html).not.toContain(secret);
    }
  });
});