import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.resolve('src/components/HomeIllustrated.jsx'), 'utf8');
const css = fs.readFileSync(path.resolve('src/components/HomeCastleLife.css'), 'utf8');

describe('Home castle life integration contract', () => {
  it('keeps ambient state attached to the canonical illustrated stage', () => {
    expect(source).toContain('data-home-castle-ambient={castleLife.ambient}');
    expect(source).toContain("data-home-castle-memory={memory?.kind || 'none'}");
  });

  it('keeps the memory object optional, factual and routed to history', () => {
    expect(source).toContain('{memory && (');
    expect(source).toContain('onClick={onHistory}');
    expect(source).toContain('memory.detail');
  });

  it('does not add motion on reduced-motion or force the object onto mobile', () => {
    expect(css).toContain('@media (max-width: 999px)');
    expect(css).toContain('.illustrated-home__memory-object { display: none; }');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('transition: none;');
  });
});
