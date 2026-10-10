import { describe,expect,it } from 'vitest';
import {
  CHESSCOM_CENTER_AISLE_BOUNCE_V25,
  chesscomCenterAisleBounceV25Profile,
} from './chesscomEnvironmentArtV4.js';

describe('CHESSCOM Dust Veil center aisle bounce V25',()=>{
  it('lifts only the neutral battlefield aisle within conservative tier budgets',()=>{
    const balanced=chesscomCenterAisleBounceV25Profile('balanced');
    const high=chesscomCenterAisleBounceV25Profile('high');
    const ultra=chesscomCenterAisleBounceV25Profile('ultra');
    expect(CHESSCOM_CENTER_AISLE_BOUNCE_V25.identity).toBe('center-aisle-bounce-v25');
    expect(balanced.intensity).toBeLessThan(high.intensity);
    expect(high.intensity).toBeLessThan(ultra.intensity);
    expect(ultra.intensity).toBeLessThan(.8);
    expect(ultra.range).toBeGreaterThan(7);
    expect(ultra.range).toBeLessThan(9);
    for(const profile of [balanced,high,ultra]){
      expect(profile.color).toEqual(CHESSCOM_CENTER_AISLE_BOUNCE_V25.color);
      expect(profile.specular).toEqual(CHESSCOM_CENTER_AISLE_BOUNCE_V25.specular);
      expect(profile.color.every(x=>x>=.4 && x<=.65)).toBe(true);
      expect(profile.specular.every(x=>x>=0 && x<.12)).toBe(true);
    }
  });
});