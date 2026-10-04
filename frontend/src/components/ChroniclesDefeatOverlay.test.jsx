import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ChroniclesDefeatOverlay from './ChroniclesDefeatOverlay.jsx';

describe('ChroniclesDefeatOverlay', () => {
  it('presents party wipe as a terminal state with explicit next actions', () => {
    const html = renderToStaticMarkup(
      <ChroniclesDefeatOverlay onRestart={() => {}} onExit={() => {}} />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Expedición terminada"');
    expect(html).toContain('La compañía ha caído.');
    expect(html).toContain('Nueva expedición');
    expect(html).toContain('Salir');
    expect(html).toContain('ya no admite más acciones');
  });
});
