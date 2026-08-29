import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcDir = path.dirname(fileURLToPath(import.meta.url));

function importedAssetPaths(sourceFile) {
  const source = fs.readFileSync(path.join(srcDir, sourceFile), 'utf8');
  return [...source.matchAll(/from\s+['"](\.\/assets\/matthias(?:-scenes\/[^'"]+|-brand\.(?:svg|png)))['"]/g)]
    .map((match) => match[1]);
}

function assertImageSignature(relativeImport) {
  const absolute = path.resolve(srcDir, relativeImport);
  expect(fs.existsSync(absolute), `${relativeImport} debe existir`).toBe(true);

  const data = fs.readFileSync(absolute);
  expect(data.length, `${relativeImport} parece truncado`).toBeGreaterThan(1024);

  if (relativeImport.endsWith('.webp')) {
    expect(data.subarray(0, 4).toString('ascii'), `${relativeImport}: cabecera RIFF inválida`).toBe('RIFF');
    expect(data.subarray(8, 12).toString('ascii'), `${relativeImport}: firma WEBP inválida`).toBe('WEBP');
    return;
  }

  if (relativeImport.endsWith('.png')) {
    expect([...data.subarray(0, 8)], `${relativeImport}: firma PNG inválida`).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    return;
  }

  if (relativeImport.endsWith('.svg')) {
    expect(data.toString('utf8'), `${relativeImport}: SVG inválido`).toMatch(/<svg\b/i);
  }
}

describe('Matthias · integridad de assets visuales', () => {
  it('todos los assets importados existen y conservan una firma de imagen válida', () => {
    const imports = [
      ...importedAssetPaths('matthiasVisuals.js'),
      ...importedAssetPaths('cpuIdentity.js'),
    ];

    expect(imports.length).toBeGreaterThanOrEqual(10);
    expect(new Set(imports).size).toBe(imports.length);

    for (const relativeImport of imports) assertImageSignature(relativeImport);
  });
});
