import { describe, expect, it } from 'vitest';
import { WAR_ROOM_HANS_BLENDER_POST_INSTALL_STEPS } from './WarRoomHansBlenderPostInstall.js';

describe('Blender Hans post-install ownership', () => {
  it('keeps v1-only service infrastructure out of Blender rooms', () => {
    expect(WAR_ROOM_HANS_BLENDER_POST_INSTALL_STEPS).toEqual([
      'hans:canonical-butler',
      'hans:board-peek-clock-hold',
      'hans:animator',
      'hans:actor-telemetry',
      'hans:elder-clock',
      'hans:fire-narrative',
      'hans:matthias-reaction',
      'hans:matthias-idle-glances',
      'hans:task-visual-guard',
      'hans:armor-polish-guard',
      'hans:grounding',
      'hans:visible-ground-lock',
    ]);
    expect(WAR_ROOM_HANS_BLENDER_POST_INSTALL_STEPS).not.toEqual(expect.arrayContaining([
      'hans:service-infrastructure',
      'hans:plant',
      'hans:mop-routine',
      'hans:service-routine',
      'hans:ambient-chore-routine',
      'hans:canonical-plant-lock',
    ]));
  });
});
