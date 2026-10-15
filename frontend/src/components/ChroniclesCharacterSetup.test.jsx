import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createCanonicalChroniclesCharacterBuild,
  createSeededChroniclesCharacterBuild,
} from '../chronicles/chroniclesCharacterBuilds.js';
import { CHRONICLES_PARTY } from '../chroniclesOfMatthias.js';
import { saveChroniclesCharacterDraft, clearChroniclesCharacterDraft } from '../chronicles/chroniclesCharacterDraft.js';
import ChroniclesCharacterSetup from './ChroniclesCharacterSetup.jsx';

function render(build) {
  return renderToStaticMarkup(
    <ChroniclesCharacterSetup
      currentBuild={build}
      onConfirm={() => {}}
      onExit={() => {}}
    />,
  );
}

describe('ChroniclesCharacterSetup', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('keeps the canonical party as the obvious one-click path', () => {
    const html = render(createCanonicalChroniclesCharacterBuild(CHRONICLES_PARTY));

    expect(html).toContain('Elige tus personajes');
    expect(html).toContain('chronicles-character-setup__hero-grid');
    expect((html.match(/chronicles-character-setup__hero-plaque/g) || []).length).toBe(4);
    expect(html).toContain('matthias-chronicles-canonical-v3');
    expect(html).toContain('Entrar con grupo canónico');
    expect(html).toContain('Crear PJs');
    expect(html).not.toContain('COMPAÑÍA GUARDADA');
  });

  it('offers the full MM3-inspired identity, dice and class editor from a recovered draft', () => {
    localStorage.setItem('chess-study-auth-username', 'chronicles-editor-test');
    const build = createSeededChroniclesCharacterBuild('creator-ui', CHRONICLES_PARTY);
    expect(saveChroniclesCharacterDraft({ activeSlot: 'bishop', build }, CHRONICLES_PARTY)).toBe(true);
    try {
      const html = render(build);
      expect(html).toContain('data-chronicles-character-setup="editor"');
      expect(html).toContain('Forja tu compañía');
      expect(html).toContain('Identidad del aventurero');
      expect(html).toContain('data-editor-step="identity"');
      expect(html).toContain('role="tablist"');
      expect(html).toContain('aria-controls="chronicles-step-panel-stats"');
      expect(html).toContain('Siguiente: atributos');
      expect(html).toContain('chronicles-character-setup__mobile-overview');
      expect(html).toContain('Raza');
      expect(html).toContain('Semiorco');
      expect(html).toContain('Alineamiento');
      expect(html).toContain('Tirar dados');
      expect((html.match(/data-class-id=/g) || []).length).toBe(10);
      expect(html).toContain('Hechizos');
      expect(html).toContain('Confirmar compañía');
    } finally {
      clearChroniclesCharacterDraft();
      localStorage.removeItem('chess-study-auth-username');
    }
  });

  it('surfaces a persisted custom party without hiding the canonical fallback', () => {
    const html = render(createSeededChroniclesCharacterBuild('vault-7', CHRONICLES_PARTY));

    expect(html).toContain('COMPAÑÍA GUARDADA');
    expect(html).toContain('Continuar con mi compañía');
    expect(html).toContain('Editar PJs');
    expect(html).toContain('Volver al grupo canónico');
  });
});
