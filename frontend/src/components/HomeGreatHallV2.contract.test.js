import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const css = fs.readFileSync(path.resolve('src/components/HomeGreatHall.css'), 'utf8');

describe('Home Great Hall v2 visual contract', () => {
  it('keeps the room architecture visually explicit without runtime decoration', () => {
    expect(css).toContain('Home · Great Hall v2');
    expect(css).toContain('/* heavy burgundy curtain falls, clearly separate from glazing */');
    expect(css).toContain('/* tall cold glazing: now visible rather than implied */');
    expect(css).toContain('/* Front apron makes the table read as furniture, not another panel. */');
    expect(css).toContain('.home-friendly .home-modes-section::after');
    expect(css).toContain('repeating-linear-gradient');
  });

  it('keeps the mobile treatment intentionally simplified', () => {
    expect(css).toContain('@media (max-width: 760px)');
    expect(css).toContain('.home-friendly .home-modes-section::after {\n    display: none;');
  });
});
