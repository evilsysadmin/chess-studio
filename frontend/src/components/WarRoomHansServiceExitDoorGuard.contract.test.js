import { describe, expect, it } from 'vitest';
import { WAR_ROOM_HANS_SERVICE_EXIT_DOOR_GUARD_VERSION } from './WarRoomHansServiceExitDoorGuard.js';
import { WAR_ROOM_HANS_SERVICE_ROUTE_VERSION } from './WarRoomHansServiceRoute.js';

describe('Hans visible service exit contract', () => {
  it('ships the guarded return-door route versions together', () => {
    expect(WAR_ROOM_HANS_SERVICE_EXIT_DOOR_GUARD_VERSION).toContain('exit-door-guard');
    expect(WAR_ROOM_HANS_SERVICE_ROUTE_VERSION).toContain('visible-exit-door');
  });
});
