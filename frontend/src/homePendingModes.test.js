import { describe, expect, it } from 'vitest';
import { COMBAT_CAMPAIGN_STORAGE_KEY, buildPendingModes, loadPendingCampaignFlag } from './homePendingModes.js';

const go = () => {};

describe('homePendingModes', () => {
  it('lists nothing on a normal day', () => {
    expect(buildPendingModes({})).toEqual([]);
    expect(buildPendingModes({ campaign: { active: false }, specialRun: { active: false }, onContinueCampaign: go, onContinueRun: go })).toEqual([]);
  });

  it('lists an active Combat campaign with its resume action', () => {
    const items = buildPendingModes({ campaign: { active: true }, onContinueCampaign: go });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ key: 'campaign', title: 'Campaña de Combat', action: go });
  });

  it('describes each special run in plain words', () => {
    const cup = buildPendingModes({ specialRun: { active: true, mode: 'cup', totalGames: 8, completedStages: 2 }, onContinueRun: go })[0];
    expect(cup.title).toBe('Modo especial · Copa');
    expect(cup.detail).toBe('Partida 3 de 8');
    const cupEnd = buildPendingModes({ specialRun: { active: true, mode: 'cup', totalGames: 8, completedStages: 9 }, onContinueRun: go })[0];
    expect(cupEnd.detail).toBe('Partida 8 de 8');
    const streak = buildPendingModes({ specialRun: { active: true, mode: 'streak', wins: 1 }, onContinueRun: go })[0];
    expect(streak.detail).toBe('1 victoria seguida');
    expect(buildPendingModes({ specialRun: { active: true, mode: 'streak', wins: 3 }, onContinueRun: go })[0].detail).toBe('3 victorias seguidas');
    expect(buildPendingModes({ specialRun: { active: true, mode: 'streak' }, onContinueRun: go })[0].detail).toBe('Sin victorias todavía');
    expect(buildPendingModes({ specialRun: { active: true, mode: 'boss' }, onContinueRun: go })[0].title).toBe('Modo especial · Jefe');
  });

  it('never lists something it cannot resume', () => {
    expect(buildPendingModes({ campaign: { active: true }, specialRun: { active: true, mode: 'cup' } })).toEqual([]);
  });

  it('reads the campaign flag from storage without importing the campaign engine', () => {
    expect(COMBAT_CAMPAIGN_STORAGE_KEY).toBe('chess-study-combat-campaign-v1');
    expect(loadPendingCampaignFlag()).toEqual({ active: false });
  });

  it('keeps the campaign before the special run', () => {
    const items = buildPendingModes({ campaign: { active: true }, specialRun: { active: true, mode: 'boss' }, onContinueCampaign: go, onContinueRun: go });
    expect(items.map((item) => item.key)).toEqual(['campaign', 'run']);
  });
});
