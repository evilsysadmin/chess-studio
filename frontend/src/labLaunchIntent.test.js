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

  it('no longer remembers Chronicles modes: they open their own site', () => {
    expect(rememberLabMode('chronicles')).toBeNull();
    expect(loadRememberedLabMode()).toBeNull();
    expect(rememberLabMode('chronicles-tactics')).toBeNull();
    expect(loadRememberedLabMode()).toBeNull();

    requestLabLaunch('chronicles');
    expect(loadLabLaunch()).toBeNull();
    expect(consumeLabLaunch()).toBeNull();
  });

  it('restores each game mode after a reload, and clears it when leaving to the hub', () => {
    for (const mode of ['chess-football-godot', 'chesscom']) {
      expect(rememberLabMode(mode)).toBe(mode);
      expect(loadRememberedLabMode()).toBe(mode);
    }
    expect(rememberLabMode('hub')).toBeNull();
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
