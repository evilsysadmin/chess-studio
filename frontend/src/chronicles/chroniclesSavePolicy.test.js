import { describe, expect, it } from 'vitest';
import { chroniclesCheckpointReason } from './chroniclesSavePolicy.js';

describe('Chronicles first-person · MM3 save policy', () => {
  it('does not checkpoint ordinary movement, combat, dialogue or other changes within one area', () => {
    for (const map of ['swordhaven-first-book', 'swordhaven-sewers', 'banner-road-first-book']) {
      expect(chroniclesCheckpointReason(map, map)).toBeNull();
    }
  });

  it('does not automatically checkpoint the initial bootstrap', () => {
    expect(chroniclesCheckpointReason(null, 'swordhaven-first-book')).toBeNull();
    expect(chroniclesCheckpointReason('', 'swordhaven-first-book')).toBeNull();
  });

  it('checkpoints a real area transition and never a mere coordinate change', () => {
    expect(chroniclesCheckpointReason('swordhaven-first-book', 'swordhaven-sewers')).toBe('area-change');
    expect(chroniclesCheckpointReason('swordhaven-sewers', 'swordhaven-first-book')).toBe('area-change');
    expect(chroniclesCheckpointReason('swordhaven-first-book', 'swordhaven-first-book')).toBeNull();
  });

  it('honors deliberate Save even when the area is unchanged', () => {
    expect(chroniclesCheckpointReason('swordhaven-first-book', 'swordhaven-first-book', true)).toBe('manual');
  });
});
