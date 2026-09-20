import { beforeEach, describe, expect, it } from 'vitest';
import { clearRememberedLabMode, consumeLabLaunch, loadRememberedLabMode, rememberLabMode, requestLabLaunch } from './labLaunchIntent.js';

describe('labLaunchIntent', () => {
  beforeEach(() => sessionStorage.clear());
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

  it('can remember Chronicles modes for refresh without widening one-shot launch requests', () => {
    expect(rememberLabMode('chronicles')).toBe('chronicles');
    expect(loadRememberedLabMode()).toBe('chronicles');
    expect(rememberLabMode('chronicles-tactics')).toBe('chronicles-tactics');
    expect(loadRememberedLabMode()).toBe('chronicles-tactics');

    requestLabLaunch('chronicles');
    expect(consumeLabLaunch()).toBeNull();

    clearRememberedLabMode();
    expect(loadRememberedLabMode()).toBeNull();
  });

  it('remembers Pawn Slug Godot across a browser refresh without turning it into a one-shot intent', () => {
    expect(rememberLabMode('pawnslug-godot')).toBe('pawnslug-godot');
    expect(loadRememberedLabMode()).toBe('pawnslug-godot');
    expect(loadRememberedLabMode()).toBe('pawnslug-godot');
    clearRememberedLabMode();
    expect(loadRememberedLabMode()).toBeNull();
  });

  it('ignores unsupported modes', () => {
    requestLabLaunch('unknown-mode');
    expect(consumeLabLaunch()).toBeNull();
  });
});
