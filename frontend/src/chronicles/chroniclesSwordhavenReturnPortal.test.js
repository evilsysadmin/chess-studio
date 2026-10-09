import { describe, expect, it } from 'vitest';
import {
  chroniclesSwordhavenReturnAvailable,
  chroniclesSwordhavenReturnVisual,
} from './chroniclesSwordhavenReturnPortal.js';

describe('Chronicles legacy Swordhaven return stays isolated from authored campaign', () => {
  const cryptEntry = {
    mapId: 'crypt-eight-squares', x: 1, y: 5,
    phase: 'explore', initiative: null, swordhavenArrived: true,
  };
  it('keeps the legacy virtual entrance for historical first-person expeditions', () => {
    expect(chroniclesSwordhavenReturnAvailable(cryptEntry)).toBe(true);
    expect(chroniclesSwordhavenReturnVisual(cryptEntry)).toHaveLength(1);
  });
  it('never hijacks the new campaign exit back to the authored road', () => {
    const campaign = { ...cryptEntry, campaignRouteV1: true };
    expect(chroniclesSwordhavenReturnAvailable(campaign)).toBe(false);
    expect(chroniclesSwordhavenReturnVisual(campaign)).toEqual([]);
  });
  it('does not expose a virtual return portal in unrelated areas or while fighting', () => {
    expect(chroniclesSwordhavenReturnAvailable({ ...cryptEntry, mapId: 'banner-road' })).toBe(false);
    expect(chroniclesSwordhavenReturnAvailable({ ...cryptEntry, initiative: { round: 1 } })).toBe(false);
  });
});
