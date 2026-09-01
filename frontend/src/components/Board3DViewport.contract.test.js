import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = fs.readFileSync(fileURLToPath(new URL('./Board3D.css', import.meta.url)), 'utf8');

describe('Board3D viewport contract', () => {
  it('prioriza altura de viewport en desktop y mantiene una variante compacta para portátiles', () => {
    expect(css).toMatch(/@media \(min-width: 1081px\)[\s\S]*?calc\(100dvh - 19rem\)/);
    expect(css).toMatch(/@media \(min-width: 1081px\) and \(max-height: 900px\)[\s\S]*?aspect-ratio: 1\.42 \/ 1/);
    expect(css).toMatch(/@media \(min-width: 1081px\) and \(max-height: 780px\)[\s\S]*?calc\(100dvh - 18\.4rem\)/);
  });
});
