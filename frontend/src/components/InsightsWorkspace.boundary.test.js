import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.join(here, 'InsightsWorkspace.css'), 'utf8');

describe('Así juegas · frontera Ahora / Errores', () => {
  it('Ahora no repite el bloque autobiográfico de Errores', () => {
    expect(css).toMatch(/insights-workspace-view-now[\s\S]*personal-training-spotlight[\s\S]*display:\s*none\s*!important/);
  });

  it('Errores no repite la prioridad principal ya mostrada en Ahora', () => {
    expect(css).toMatch(/insights-workspace-view-errors \.training-now-card[\s\S]*display:\s*none\s*!important/);
    expect(css).toContain('Patrones que se repiten');
  });
});
