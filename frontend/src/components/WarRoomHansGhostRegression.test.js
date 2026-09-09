import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.resolve('src/components/Board3D.jsx'), 'utf8');

describe('Hans cross-game scene reset contract', () => {
  it('keys the 3D core by game id so per-game Hans state cannot leak', () => {
    expect(source).toContain("key={hansGameId || 'war-room'}");
  });
});
