import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  createCanonicalChroniclesCharacterBuild,
  createSeededChroniclesCharacterBuild,
} from '../chronicles/chroniclesCharacterBuilds.js';
import { CHRONICLES_PARTY } from '../chroniclesOfMatthias.js';
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
  it('keeps the canonical party as the obvious one-click path', () => {
    const html = render(createCanonicalChroniclesCharacterBuild(CHRONICLES_PARTY));

    expect(html).toContain('¿Con quién bajamos ahí?');
    expect(html).toContain('Entrar con grupo canónico');
    expect(html).toContain('Crear PJs');
    expect(html).not.toContain('COMPAÑÍA GUARDADA');
  });

  it('surfaces a persisted custom party without hiding the canonical fallback', () => {
    const html = render(createSeededChroniclesCharacterBuild('vault-7', CHRONICLES_PARTY));

    expect(html).toContain('COMPAÑÍA GUARDADA');
    expect(html).toContain('Continuar con mi compañía');
    expect(html).toContain('Editar PJs');
    expect(html).toContain('Volver al grupo canónico');
  });
});
