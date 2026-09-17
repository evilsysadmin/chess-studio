import { describe, expect, it } from 'vitest';
import { consumeLabLaunch, requestLabLaunch } from './labLaunchIntent.js';

describe('labLaunchIntent', () => {
  it('routes legacy Pawn Slug launch requests to Godot once', () => {
    requestLabLaunch('pawnslug');
    expect(consumeLabLaunch()).toBe('pawnslug-godot');
    expect(consumeLabLaunch()).toBeNull();
  });

  it('accepts the canonical Godot launch mode directly', () => {
    requestLabLaunch('pawnslug-godot');
    expect(consumeLabLaunch()).toBe('pawnslug-godot');
    expect(consumeLabLaunch()).toBeNull();
  });

  it('ignores unsupported modes', () => {
    requestLabLaunch('unknown-mode');
    expect(consumeLabLaunch()).toBeNull();
  });
});
