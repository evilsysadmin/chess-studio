import { describe, expect, it, vi } from 'vitest';
import { buildGameAutopsyHtml, downloadGameAutopsyHtml, gameAutopsyFilename } from './gameAutopsyHtml.js';

const REPORT = {
  averageLoss: 18,
  analyzedCount: 12,
  topMistakes: [
    { moveNumber: 9, played: 'Qh5?', suggested: 'Nf3', loss: 230 },
  ],
};

describe('HTML de autopsia', () => {
  it('genera un informe autocontenido con resumen, momentos e incidentes', () => {
    const html = buildGameAutopsyHtml({
      report: REPORT,
      meta: { opening: 'Italiana', mode: 'casual', date: '2026-08-30T10:00:00Z' },
      humanColor: 'w',
      verdict: 'Hubo daños evitables.',
      keyMoments: [{ icon: '☠', label: 'Punto de inflexión', detail: 'La dama quedó expuesta.', move: { moveNumber: 9, played: 'Qh5?' } }],
    });
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Italiana · casual');
    expect(html).toContain('Qh5?');
    expect(html).toContain('Nf3');
    expect(html).toContain('Punto de inflexión');
    expect(html).toContain('Hubo daños evitables.');
  });

  it('escapa texto de partida para que el archivo exportado no ejecute HTML inyectado', () => {
    const html = buildGameAutopsyHtml({
      report: { ...REPORT, topMistakes: [{ moveNumber: 1, played: '<img src=x onerror=alert(1)>', suggested: '<script>x</script>', loss: 99 }] },
      meta: { opening: '<script>mal()</script>' },
      verdict: '<svg onload=boom()>',
    });
    expect(html).not.toContain('<script>mal()');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<svg onload');
    expect(html).toContain('&lt;script&gt;mal()&lt;/script&gt;');
  });

  it('usa un nombre estable basado en la fecha cuando existe', () => {
    expect(gameAutopsyFilename({ date: '2026-08-30T10:00:00Z' })).toBe('chess-studio-autopsia-2026-08-30.html');
  });

  it('descarga mediante Blob y revoca la URL temporal', () => {
    const click = vi.fn();
    const remove = vi.fn();
    const appendChild = vi.fn();
    const link = { click, remove, href: '', download: '', rel: '' };
    const documentRef = { createElement: vi.fn(() => link), body: { appendChild } };
    const urlApi = { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() };

    expect(downloadGameAutopsyHtml({ report: REPORT, meta: { date: '2026-08-30T10:00:00Z' } }, documentRef, urlApi)).toBe(true);
    expect(link.download).toBe('chess-studio-autopsia-2026-08-30.html');
    expect(appendChild).toHaveBeenCalledWith(link);
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(urlApi.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });
});
