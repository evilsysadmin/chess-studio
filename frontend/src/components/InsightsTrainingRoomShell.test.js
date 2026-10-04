import { describe, expect, it } from 'vitest';
import {
  buildInsightsTrainingRoomLayer,
  INSIGHTS_TRAINING_ROOM_SCENE_VERSION,
} from './InsightsTrainingRoomShell.js';

describe('Así juegas Training Room 3D shell', () => {
  it('builds the canonical empty analysis study', () => {
    const room = buildInsightsTrainingRoomLayer({ coarsePointer: false });

    expect(room.name).toBe('insights-training-room-layer');
    expect(room.userData.canonical).toBe(true);
    expect(room.userData.sceneVersion).toBe(INSIGHTS_TRAINING_ROOM_SCENE_VERSION);
    expect(room.userData.noHumanFigures).toBe(true);
    expect(room.getObjectByName('insights-training-room-bookcase')).toBeTruthy();
    expect(room.getObjectByName('insights-training-room-window')).toBeTruthy();
    expect(room.getObjectByName('insights-training-room-empty-chair')).toBeTruthy();
    expect(room.getObjectByName('insights-training-room-desk')).toBeTruthy();
    expect(room.getObjectByName('insights-training-room-bankers-lamp')).toBeTruthy();
    expect(room.getObjectByName('insights-training-room-armillary')).toBeTruthy();
    expect(room.getObjectByName('insights-training-room-wall-panels')).toBeTruthy();
    expect(room.getObjectByName('window-arch')).toBeTruthy();
    expect(room.getObjectByName('training-room-rug')).toBeTruthy();
    expect(room.getObjectByName('training-room-hearth')).toBeTruthy();
    expect(room.getObjectByName('training-room-moon-glow')).toBeTruthy();
    expect(room.getObjectByName('window-castle-spire')).toBeTruthy();
    expect(room.getObjectByName('desk-quill')).toBeTruthy();
    expect(room.getObjectByName('training-room-crown-moulding')).toBeTruthy();
    expect(room.getObjectByName('desk-drawer-front')).toBeTruthy();
    expect(room.getObjectByName('desk-drawer-pull')).toBeTruthy();
    expect(room.getObjectByName('chair-crest')).toBeTruthy();
    expect(room.getObjectByName('chair-left-wing')).toBeTruthy();
  });

  it('keeps the room identity in its lighter geometry profile', () => {
    const room = buildInsightsTrainingRoomLayer({ coarsePointer: true });

    expect(room.userData.noHumanFigures).toBe(true);
    expect(room.getObjectByName('training-room-moon')).toBeTruthy();
    expect(room.getObjectByName('insights-training-room-empty-chair')).toBeTruthy();
    expect(room.getObjectByName('desk-dossier')).toBeTruthy();
  });
});
