import { describe, expect, it } from 'vitest';
import weaponAtlas from './assets/pawnSlug/weapon_atlas.svg?raw';

describe('Pawn Slug P99 sidearm art', () => {
  it('keeps the premium compact-service-pistol cues in the live atlas', () => {
    expect(weaponAtlas).toContain('Walther P99-inspired compact service pistol');
    expect(weaponAtlas).toContain('url(#polymer)');
    expect(weaponAtlas).toContain('rear serrations');
    expect(weaponAtlas).not.toContain('fill="url(#wood)" stroke-width="6"/>\n    <path d="M86 58');
  });
});
