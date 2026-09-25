import { beforeEach, describe, expect, it } from 'vitest';
import {
  acknowledgeLabLaunch,
  clearLabLaunch,
  clearRememberedLabMode,
  consumeLabLaunch,
  loadLabLaunch,
  loadRememberedLabMode,
  rememberLabMode,
  requestLabLaunch,
  subscribeLabLaunch,
} from './labLaunchIntent.js';

describe('labLaunchIntent', () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearLabLaunch();
  });

  it('routes legacy Pawn Slug launch requests to Godot once', () => {
    requestLabLaunch('pawnslug');
    expect(consumeLabLaunch()).toBe('pawnslug-godot');
    expect(consumeLabLaunch()).toBeNull();
  });

  it('keeps the launch readable across repeated render peeks until commit acknowledges it', () => {
    requestLabLaunch('pawnslug');

    expect(loadLabLaunch()).toBe('pawnslug-godot');
    expect(loadLabLaunch()).toBe('pawnslug-godot');
    expect(acknowledgeLabLaunch('pawnslug-godot')).toBe(true);
    expect(loadLabLaunch()).toBeNull();
    expect(acknowledgeLabLaunch('pawnslug-godot')).toBe(false);
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
    expect(loadLabLaunch()).toBeNull();
    expect(consumeLabLaunch()).toBeNull();

    unsubscribe();
  });

  it('can remember Chronicles modes for refresh without widening one-shot launch requests', () => {
    expect(rememberLabMode('chronicles')).toBe('chronicles');
    expect(loadRememberedLabMode()).toBe('chronicles');
    expect(rememberLabMode('chronicles-tactics')).toBe('chronicles-tactics');
    expect(loadRememberedLabMode()).toBe('chronicles-tactics');

    requestLabLaunch('chronicles');
    expect(loadLabLaunch()).toBeNull();
    expect(consumeLabLaunch()).toBeNull();

    clearRememberedLabMode();
    expect(loadRememberedLabMode()).toBeNull();
  });

  it('remembers Chess Football across a browser refresh', () => {
    expect(rememberLabMode('chess-football-godot')).toBe('chess-football-godot');
    expect(loadRememberedLabMode()).toBe('chess-football-godot');
  });

  it('remembers Pawn Slug Godot across a browser refresh without turning it into a one-shot intent', () => {
    expect(rememberLabMode('pawnslug-godot')).toBe('pawnslug-godot');
    expect(loadRememberedLabMode()).toBe('pawnslug-godot');
    expect(loadRememberedLabMode()).toBe('pawnslug-godot');
    clearRememberedLabMode();
    expect(loadRememberedLabMode()).toBeNull();
  });

  it('invalid launch requests clear any stale one-shot intent', () => {
    requestLabLaunch('pawnslug');
    expect(loadLabLaunch()).toBe('pawnslug-godot');

    requestLabLaunch('unknown-mode');
    expect(loadLabLaunch()).toBeNull();
  });
});
