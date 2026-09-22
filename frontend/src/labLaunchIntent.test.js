import { beforeEach, describe, expect, it } from 'vitest';
import { clearRememberedLabMode, consumeLabLaunch, loadRememberedLabMode, rememberLabMode, requestLabLaunch, subscribeLabLaunch } from './labLaunchIntent.js';

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

  it('delivers a direct launch immediately when LabScreen is already mounted', () => {
    const launches = [];
    const unsubscribe = subscribeLabLaunch((mode) => launches.push(mode));

    expect(requestLabLaunch('pawnslug')).toBe('pawnslug-godot');
    expect(launches).toEqual(['pawnslug-godot']);
    expect(consumeLabLaunch()).toBeNull();

    unsubscribe();
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
