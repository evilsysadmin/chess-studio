import { describe, expect, it } from 'vitest';
import { warRoomHansPresentationPolicy } from './WarRoomHansPresentationPolicy.js';

describe('Hans presentation policy', () => {
  it('no arma el cameo del fuego con movimiento reducido efectivo', () => {
    expect(warRoomHansPresentationPolicy({
      eventName: 'fire',
      fireplaceEligible: true,
      reducedMotion: false,
    }).fireplaceIteration).toBe(true);

    expect(warRoomHansPresentationPolicy({
      eventName: 'fire',
      fireplaceEligible: true,
      reducedMotion: true,
    }).fireplaceIteration).toBe(false);
  });

  it('cablea sólo el renderer de diálogo que corresponde al evento', () => {
    expect(warRoomHansPresentationPolicy({ eventName: 'mop' })).toMatchObject({
      mopDialogue: true,
      serviceDialogue: false,
    });
    expect(warRoomHansPresentationPolicy({ eventName: 'espresso' })).toMatchObject({
      mopDialogue: false,
      serviceDialogue: true,
    });
    expect(warRoomHansPresentationPolicy({ eventName: 'dust-board' }).serviceDialogue).toBe(true);
    expect(warRoomHansPresentationPolicy({ eventName: 'bring-book' }).serviceDialogue).toBe(true);
    expect(warRoomHansPresentationPolicy({ eventName: 'mail' }).serviceDialogue).toBe(true);
    expect(warRoomHansPresentationPolicy({ eventName: 'water-plant' }).serviceDialogue).toBe(false);
    expect(warRoomHansPresentationPolicy({ eventName: 'fire' }).serviceDialogue).toBe(false);
  });
});
