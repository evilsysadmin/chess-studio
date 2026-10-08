import { describe, expect, it } from 'vitest';
import {
  createChroniclesCampaign,
  chroniclesCampaignDiscover,
  chroniclesCampaignObjective,
  chroniclesCampaignTravel,
  CHRONICLES_QUEST_EVENTS as E,
} from './chroniclesCampaign.js';

describe('Chronicles missing king intro', () => {
  it('requires actual locations and prerequisite clues', () => {
    let c = createChroniclesCampaign();
    expect(chroniclesCampaignDiscover(c, E.tracks)).toBeNull();
    c = chroniclesCampaignDiscover(c, E.audience);
    expect(c.clues).toEqual([E.audience]);
    c = chroniclesCampaignDiscover(c, E.rumor);
    expect(chroniclesCampaignObjective(c)).toContain('Bosque');
    expect(chroniclesCampaignTravel(c, 'ruin-entrance')).toBeNull();
    c = chroniclesCampaignTravel(c, 'east-road');
    c = chroniclesCampaignDiscover(c, E.tracks);
    c = chroniclesCampaignTravel(c, 'ruin-entrance');
    c = chroniclesCampaignDiscover(c, E.clue);
    expect(chroniclesCampaignObjective(c)).toContain('Regresa');
    c = chroniclesCampaignTravel(c, 'ruin-exit');
    c = chroniclesCampaignTravel(c, 'west-gate');
    expect(c.locationId).toBe('royal-capital');
    expect(c.visited).toEqual(['royal-capital', 'old-forest-road', 'old-crypt']);
  });

  it('is idempotent for duplicate narrative events', () => {
    const c = chroniclesCampaignDiscover(createChroniclesCampaign(), E.audience);
    expect(chroniclesCampaignDiscover(c, E.audience)).toBe(c);
    expect(chroniclesCampaignDiscover(c, 'invented-clue')).toBeNull();
  });
});
