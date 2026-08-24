// STATIC CONTRACT: toda persistencia productiva pasa por safeStorage.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = path.dirname(new URL(import.meta.url).pathname);
const DIRECT_STORAGE_CALL = /(?:\b|window\.|globalThis\.)(?:localStorage|sessionStorage)\s*\.\s*(?:getItem|setItem|removeItem)\s*\(/;

function productionSources(dir = SRC_ROOT) {
  const rows = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) rows.push(...productionSources(absolute));
    else if (/\.(?:js|jsx)$/.test(entry.name) && !/\.test\.(?:js|jsx)$/.test(entry.name) && entry.name !== 'test-setup.js') rows.push(absolute);
  }
  return rows;
}

describe('safeStorage · contrato de acceso', () => {
  it('impide volver a introducir Web Storage directo en código productivo', () => {
    const offenders = productionSources()
      .filter((file) => path.basename(file) !== 'safeStorage.js')
      .flatMap((file) => fs.readFileSync(file, 'utf8').split('\n').map((line, index) => ({ file, line, index: index + 1 })))
      .filter(({ line }) => DIRECT_STORAGE_CALL.test(line))
      .map(({ file, line, index }) => `${path.relative(SRC_ROOT, file)}:${index} ${line.trim()}`);

    expect(offenders, 'Usa safeStorage.js: Web Storage puede lanzar incluso al leer').toEqual([]);
  });
});
