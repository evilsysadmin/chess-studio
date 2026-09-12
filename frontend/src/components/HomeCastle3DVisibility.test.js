import { describe, expect, it } from 'vitest';
import { homeCastleShouldRender } from './HomeCastle3DVisibility.js';

describe('homeCastleShouldRender', () => {
  it('renders only while the document and castle are both visible', () => {
    expect(homeCastleShouldRender()).toBe(true);
    expect(homeCastleShouldRender({ documentHidden: true, intersecting: true })).toBe(false);
    expect(homeCastleShouldRender({ documentHidden: false, intersecting: false })).toBe(false);
  });
});
