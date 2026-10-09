import { describe, expect, it } from 'vitest';
import { createChroniclesState, chroniclesReduce } from '../chroniclesOfMatthias.js';
import {
  chroniclesInitializeCampaignRoadQuest, chroniclesAdvanceCampaignRoadQuest,
} from './chroniclesCampaignRoadQuest.js';
import { chroniclesApplyContentEffects } from './chroniclesContentRuntime.js';
import { chroniclesRunCheckpointPayload, chroniclesApplyRunCheckpoint } from './chroniclesRunCheckpoint.js';

describe('Chronicles · the first authored road clue is earned, not fabricated', () => {
  const fresh = () => chroniclesInitializeCampaignRoadQuest(createChroniclesState('swordhaven-campaign'), { fresh: true });

  it('starts in campaign Swordhaven only and grants a single persistent letter', () => {
    const started = fresh();
    expect(started.quests['lost-king-road'].objective).toContain('mojón');
    expect(started.inventory['sealed-lady-letter'].quantity).toBe(1);
    expect(chroniclesInitializeCampaignRoadQuest(started, { fresh: true })).toBe(started);
    expect(chroniclesInitializeCampaignRoadQuest(createChroniclesState('swordhaven-square'), { fresh: true }).quests).toBeUndefined();
    expect(chroniclesInitializeCampaignRoadQuest(createChroniclesState('swordhaven-campaign'))).not.toHaveProperty('quests');
  });

  it('reads the real POI, reports only after travelling back and keeps report idempotent', () => {
    const start = fresh();
    const road = chroniclesApplyContentEffects(start, [{ type: 'transition-map', mapId: 'banner-road' }]);
    expect(road.quests['lost-king-road'].objective).toContain('mojón');
    const clue = chroniclesReduce({ ...road, x: 8, y: 5, direction: 0 }, 'interact');
    expect(clue['milestone-erased']).toBe(true);
    expect(clue.quests['lost-king-road'].objective).toContain('Regresa');
    expect(clue.consumedContentIds.filter(x => x.endsWith('road-milestone-read'))).toHaveLength(1);
    const reported = chroniclesReduce({ ...clue, x: 10, y: 1 }, 'interact');
    expect(reported.mapId).toBe('swordhaven-campaign');
    expect(reported.quests['lost-king-road'].objective).toContain('quién');
    expect(reported.consumedContentIds.filter(x => x.endsWith('road-milestone-reported'))).toHaveLength(1);
    expect(chroniclesAdvanceCampaignRoadQuest(clue, reported)).toBe(reported);
    expect(reported.inventory['sealed-lady-letter'].quantity).toBe(1);
  });

  it('persists evidence and letter through the canonical CAS/F5 checkpoint', () => {
    const clue = chroniclesReduce({
      ...chroniclesApplyContentEffects(fresh(), [{ type: 'transition-map', mapId: 'banner-road' }]),
      x: 8, y: 5,
    }, 'interact');
    const payload = chroniclesRunCheckpointPayload(clue, 0);
    expect(payload.worldFlags['milestone-erased']).toBe(true);
    expect(payload.consumedContentIds).toContain('chronicles:lost-king-road:road-milestone-read');
    const resumed = chroniclesApplyRunCheckpoint(createChroniclesState('banner-road'), {
      ...payload, status: 'active', worldVersion: 1,
    });
    expect(resumed.quests['lost-king-road'].objective).toContain('Regresa');
    expect(resumed.inventory['sealed-lady-letter'].quantity).toBe(1);
    expect(chroniclesInitializeCampaignRoadQuest(resumed, { fresh: true })).toBe(resumed);
  });
});
