import { describe, expect, it } from 'vitest';
import {
  normalizeWarRoomVariant,
  WAR_ROOM_VARIANTS,
  warRoomVariantDefinition,
} from './WarRoomVariant.js';
import {
  PVP_DUEL_ROOM_RUNTIME_MODEL_URL,
  pvpDuelRoomModelUrl,
} from './PvpDuelRoomShell.js';

describe('PvP Duel Room runtime variant', () => {
  it('uses its isolated stable runtime alias', () => {
    expect(PVP_DUEL_ROOM_RUNTIME_MODEL_URL).toBe(
      'https://assets.chess-studio.shadowops.dpdns.org/pvp/duel-room/runtime/current.glb',
    );
    expect(pvpDuelRoomModelUrl({ buildSha: 'abc123' })).toBe(
      PVP_DUEL_ROOM_RUNTIME_MODEL_URL + '?build=abc123',
    );
  });

  it('is addressable internally but never enters the normal War Room selector', () => {
    expect(WAR_ROOM_VARIANTS.map(({ id }) => id)).not.toContain('duel');
    expect(normalizeWarRoomVariant('duel')).toBe('duel');
    expect(warRoomVariantDefinition('duel')).toMatchObject({
      id: 'duel',
      shell: 'blender',
      runtimeModelUrl: PVP_DUEL_ROOM_RUNTIME_MODEL_URL,
    });
  });
});
