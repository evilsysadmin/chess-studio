import { applyWarRoomCompositionPolish } from './WarRoomCompositionPolish.js';

function sceneRoot(object) {
  let current = object;
  while (current?.parent) current = current.parent;
  return current;
}

export function attachWarRoomCompositionRootDriver(group, {
  wallZ,
  towardBoard,
  coarsePointer = false,
} = {}) {
  if (!group || coarsePointer || !Number.isFinite(wallZ) || !Number.isFinite(towardBoard)) return false;
  const driver = group.getObjectByName?.('war-room-premium-painting-canvas');
  if (!driver || driver.userData.warRoomCompositionRootDriver) return false;

  driver.userData.warRoomCompositionRootDriver = true;
  const previous = driver.onBeforeRender;
  driver.onBeforeRender = (...args) => {
    previous?.(...args);
    const root = sceneRoot(driver);
    if (!root || root === group) return;
    applyWarRoomCompositionPolish(root, { wallZ, towardBoard, coarsePointer: false });
  };
  return true;
}
