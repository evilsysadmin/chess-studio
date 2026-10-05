import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { INSIGHTS_TRAINING_ROOM_STILL_SIZE } from './InsightsTrainingRoomStage.js';

const repo = resolve(__dirname, '../../..');
const manifest = JSON.parse(readFileSync(resolve(__dirname, '../assets/insights/training-room-still.json'), 'utf8'));

describe('Así juegas Training Room still (software WebGL)', () => {
  it('was rendered from the current room sources', () => {
    const hash = createHash('sha256');
    for (const source of manifest.sources) hash.update(readFileSync(resolve(repo, source)));
    // Changed the room? Re-render: node scripts/render_insights_training_room_still.mjs
    expect(hash.digest('hex')).toBe(manifest.sourceSha256);
    expect(manifest.sources).toEqual([
      'frontend/src/components/InsightsTrainingRoomShell.js',
      'frontend/src/components/InsightsTrainingRoomStage.js',
    ]);
  });

  it('keeps the widest stage aspect so cover-cropping matches the live camera', () => {
    expect([manifest.width, manifest.height]).toEqual([
      INSIGHTS_TRAINING_ROOM_STILL_SIZE.width,
      INSIGHTS_TRAINING_ROOM_STILL_SIZE.height,
    ]);
    expect(manifest.width / manifest.height).toBeCloseTo(1658 / 788, 2);
    const webp = readFileSync(resolve(__dirname, '../assets/insights/training-room-still.webp'));
    expect(webp.subarray(0, 4).toString('latin1')).toBe('RIFF');
    expect(webp.subarray(8, 12).toString('latin1')).toBe('WEBP');
    expect(webp.length).toBeLessThan(200 * 1024);
  });
});
