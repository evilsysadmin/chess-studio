import { describe, expect, it } from 'vitest';
import {
  HANS_ESPRESSO_ACTION_MS,
  HANS_ESPRESSO_LINE,
  HANS_WATER_PLANT_ACTION_MS,
  MATTHIAS_ESPRESSO_LINE,
  warRoomHansServiceActionMs,
  warRoomHansServiceDialoguePhase,
} from './WarRoomHansServiceContract.js';

describe('WarRoomHansServiceContract', () => {
  it('keeps espresso dialogue human and ordered', () => {
    expect(HANS_ESPRESSO_LINE).toBe('Su espresso, señor.');
    expect(MATTHIAS_ESPRESSO_LINE).toBe('Danke, Hans. Déjamelo por ahí.');
    expect(warRoomHansServiceDialoguePhase('espresso', 0)).toBe('hans-espresso');
    expect(warRoomHansServiceDialoguePhase('espresso', 5000)).toBe('matthias-espresso');
    expect(warRoomHansServiceDialoguePhase('espresso', 9000)).toBe('');
  });

  it('keeps watering silent and both actions bounded', () => {
    expect(warRoomHansServiceDialoguePhase('water-plant', 1000)).toBe('');
    expect(warRoomHansServiceActionMs('water-plant')).toBe(HANS_WATER_PLANT_ACTION_MS);
    expect(warRoomHansServiceActionMs('espresso')).toBe(HANS_ESPRESSO_ACTION_MS);
  });
});
