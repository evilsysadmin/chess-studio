import { describe, expect, it } from 'vitest';
import { consumeLabLaunch, requestLabLaunch } from './labLaunchIntent.js';

describe('labLaunchIntent', () => {
  it('hands Pawn Slug to Lab once and then returns to the hub default', () => {
    requestLabLaunch('pawnslug');
    expect(consumeLabLaunch()).toBe('pawnslug');
    expect(consumeLabLaunch()).toBeNull();
  });

  it('ignores unsupported modes', () => {
    requestLabLaunch('unknown-mode');
    expect(consumeLabLaunch()).toBeNull();
  });
});
