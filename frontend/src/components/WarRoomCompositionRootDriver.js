import { applyWarRoomCompositionPolish } from './WarRoomCompositionPolish.js';
import { registerWarRoomDeferredFinalizer } from './WarRoomDeferredFinalizer.js';

export function attachWarRoomCompositionRootDriver(group, {
  wallZ,
  towardBoard,
  coarsePointer = false,
} = {}) {
  if (!group || coarsePointer || !Number.isFinite(wallZ) || !Number.isFinite(towardBoard)) return false;
  const driver = group.getObjectByName?.('war-room-premium-painting-canvas');
  if (!driver || driver.userData.warRoomCompositionRootDriver) return false;

  const registered = registerWarRoomDeferredFinalizer(group, {
    key: 'composition-root-v1',
    coarsePointer,
    run: (root) => {
      if (!root || root === group) return 0;
      return applyWarRoomCompositionPolish(root, { wallZ, towardBoard, coarsePointer: false });
    },
  });
  if (!registered) return false;

  driver.userData.warRoomCompositionRootDriver = true;
  return true;
}
