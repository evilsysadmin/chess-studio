import { applyWarRoomCompositionPolish } from './WarRoomCompositionPolish.js';
import { registerWarRoomDeferredFinalizer } from './WarRoomDeferredFinalizer.js';
import { pruneWarRoomRetiredSceneObjects } from './WarRoomScenePruning.js';

const NOOP_RENDER_HOOK = () => {};

function attachCanonicalScenePrune(driver) {
  if (!driver || driver.userData.warRoomCanonicalPruneDriver) return;

  const previousAfterRender = driver.onAfterRender;
  let completed = false;
  driver.userData.warRoomCanonicalPruneDriver = true;

  driver.onAfterRender = (...args) => {
    previousAfterRender?.(...args);
    if (completed) return;
    completed = true;

    const stats = pruneWarRoomRetiredSceneObjects(driver);
    driver.userData.warRoomCanonicalPruneCompleted = true;
    driver.userData.warRoomCanonicalPrunedRoots = stats.removedRoots;
    driver.userData.warRoomCanonicalPrunedNodes = stats.removedNodes;
    driver.onAfterRender = previousAfterRender || NOOP_RENDER_HOOK;
  };
}

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

  attachCanonicalScenePrune(driver);
  driver.userData.warRoomCompositionRootDriver = true;
  return true;
}
