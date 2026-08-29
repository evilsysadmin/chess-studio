import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const sceneDir = path.join(srcDir, 'assets', 'matthias-scenes');
const brandSvg = path.join(srcDir, 'assets', 'matthias-brand.svg');

function readPrefix(file, length = 512) {
  const buffer = Buffer.alloc(length);
  const fd = fs.openSync(file, 'r');
  try {
    const bytesRead = fs.readSync(fd, buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    fs.closeSync(fd);
  }
}

function assertWebp(file) {
  const relative = path.relative(srcDir, file);
  const stat = fs.statSync(file);
  expect(stat.size, `${relative} parece truncado`).toBeGreaterThan(1024);

  const header = readPrefix(file, 16);
  expect(header.subarray(0, 4).toString('ascii'), `${relative}: cabecera RIFF inválida`).toBe('RIFF');
  expect(header.subarray(8, 12).toString('ascii'), `${relative}: firma WEBP inválida`).toBe('WEBP');
}

function assertSvg(file) {
  const relative = path.relative(srcDir, file);
  const stat = fs.statSync(file);
  expect(stat.size, `${relative} parece truncado`).toBeGreaterThan(100);
  expect(readPrefix(file).toString('utf8'), `${relative}: SVG inválido`).toMatch(/<svg\b/i);
}

describe('Matthias · integridad de assets visuales', () => {
  it('todas sus escenas WebP conservan una firma de imagen válida', () => {
    const scenes = fs.readdirSync(sceneDir)
      .filter((name) => name.endsWith('.webp'))
      .map((name) => path.join(sceneDir, name));

    expect(scenes.length, 'Matthias debe conservar un catálogo visual real').toBeGreaterThanOrEqual(10);
    for (const scene of scenes) assertWebp(scene);
  });

  it('su marca conserva un SVG válido', () => {
    expect(fs.existsSync(brandSvg), 'la marca de Matthias debe existir').toBe(true);
    assertSvg(brandSvg);
  });
});
