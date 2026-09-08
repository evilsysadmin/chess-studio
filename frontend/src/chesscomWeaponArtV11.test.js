import { describe, expect, it } from 'vitest';
import { CHESSCOM_WEAPON_ART_V11, chesscomWeaponArtKey } from './chesscomWeaponArtV11.js';

describe('Chesscom weapon art v11',()=>{
  it('maps the three operative weapons to dedicated art keys',()=>{
    expect(CHESSCOM_WEAPON_ART_V11.identity).toBe('weapon-art-v11');
    expect(chesscomWeaponArtKey('HK416 (Used)')).toBe('hk416');
    expect(chesscomWeaponArtKey('G36C')).toBe('g36c');
    expect(chesscomWeaponArtKey('MP5SD')).toBe('mp5sd');
    expect(chesscomWeaponArtKey('unknown')).toBe('');
  });
});
