import { describe, expect, it } from 'vitest';
import { HOME_CASTLE_TORCH_ANCHORS, createHomeCastleTorchProps } from './HomeCastle3DProps.js';

describe('HomeCastle3DProps', () => {
  it('keeps the canonical torches mirrored around the hall center', () => {
    expect(HOME_CASTLE_TORCH_ANCHORS).toHaveLength(2);
    const [left, right] = HOME_CASTLE_TORCH_ANCHORS;
    expect(left.x).toBe(-right.x);
    expect(left.y).toBe(right.y);
    expect(left.z).toBe(right.z);
  });

  it('keeps both torch anchors on the inner wall sconces, away from menu copy', () => {
    for (const anchor of HOME_CASTLE_TORCH_ANCHORS) {
      expect(Math.abs(anchor.x)).toBeGreaterThan(0.65);
      expect(Math.abs(anchor.x)).toBeLessThan(0.8);
      expect(anchor.y).toBeGreaterThan(0.18);
      expect(anchor.y).toBeLessThan(0.3);
      expect(anchor.z).toBeGreaterThan(0);
      expect(anchor.z).toBeLessThan(0.3);
    }
  });

  it('builds one three-part prop and flame handle per anchor', () => {
    const props = createHomeCastleTorchProps();
    expect(props.group.children).toHaveLength(HOME_CASTLE_TORCH_ANCHORS.length);
    expect(props.flames).toHaveLength(HOME_CASTLE_TORCH_ANCHORS.length);
    for (const torch of props.group.children) expect(torch.children).toHaveLength(3);
    for (const flame of props.flames) expect(flame?.name).toBe('home-castle-flame');
    props.dispose();
  });
});
