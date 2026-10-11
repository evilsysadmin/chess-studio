import { describe, expect, it } from 'vitest';
import { chroniclesMapById } from './chroniclesMapCatalog.js';
import { chroniclesShopRoom } from './chroniclesShopRooms.js';

describe('Chronicles shop rooms', () => {
  it('shows each Swordhaven shopkeeper in their own room', () => {
    const town = chroniclesMapById('swordhaven-first-book');
    const room = (id) => chroniclesShopRoom(town.interactables.find((entry) => entry.id === id))?.id;
    expect(room('first-book-armorer')).toBe('odo-forge');
    expect(room('first-book-weaponsmith')).toBe('brunna-armory');
    expect(room('first-book-guild')).toBe('guild-sanctum');
  });

  it('has no room for counters without a building', () => {
    expect(chroniclesShopRoom({ id: 'stall' })).toBeNull();
    expect(chroniclesShopRoom(null)).toBeNull();
  });
});
