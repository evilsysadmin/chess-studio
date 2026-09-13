import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const css = fs.readFileSync(path.resolve('src/components/HomeCleanMaster.css'), 'utf8');

describe('Home clean master contract', () => {
  it('keeps the retired top brand and bottom motto out of the rendered Home', () => {
    expect(css).toMatch(/\.illustrated-home__brand[\s\S]*\.illustrated-home__motto[\s\S]*display:\s*none\s*!important/);
  });

  it('never rebuilds the old Matthias copy card over the room', () => {
    expect(css).toMatch(/\.illustrated-home__matthias-copy[\s\S]*display:\s*none\s*!important/);
  });
});
