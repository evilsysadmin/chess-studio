export const WAR_ROOM_HANS_POST_RENDER_PIPELINE_VERSION = 'hans-post-render-pipeline-v2-no-rest';

const PIPELINE_STATES = new WeakMap();

function orderedStages(state) {
  return [...state.stages.values()].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.key.localeCompare(b.key);
  });
}

function markDriver(driver, state) {
  if (!driver?.userData) return;
  driver.userData.warRoomHansPostRenderPipeline = WAR_ROOM_HANS_POST_RENDER_PIPELINE_VERSION;
  driver.userData.warRoomHansPostRenderStageCount = state.stages.size;
  driver.userData.warRoomHansPostRenderStages = state.ordered.map((stage) => stage.key);
  driver.userData.warRoomHansPostRenderHotPath = 'direct-args-v2';
}

function ensurePipeline(driver) {
  let state = PIPELINE_STATES.get(driver);
  if (state) return state;
  if (!driver || typeof driver.onBeforeRender !== 'function') return null;

  const base = driver.onBeforeRender;
  state = {
    base,
    stages: new Map(),
    ordered: [],
  };
  PIPELINE_STATES.set(driver, state);

  // THREE.Object3D.onBeforeRender has a stable six-argument signature. Keep
  // those arguments explicit so this hot path does not allocate a rest array
  // and then spread it again for the base hook and every registered stage.
  driver.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
    state.base(renderer, scene, camera, geometry, material, group);
    for (const stage of state.ordered) {
      stage.run(renderer, scene, camera, geometry, material, group);
    }
  };
  markDriver(driver, state);
  return state;
}

export function registerWarRoomHansPostRenderStage(driver, {
  key,
  order = 0,
  run,
} = {}) {
  if (!driver || typeof key !== 'string' || !key || typeof run !== 'function') return 0;
  const state = ensurePipeline(driver);
  if (!state || state.stages.has(key)) return 0;

  state.stages.set(key, {
    key,
    order: Number.isFinite(Number(order)) ? Number(order) : 0,
    run,
  });
  state.ordered = orderedStages(state);
  markDriver(driver, state);
  return 1;
}

export function getWarRoomHansPostRenderStageKeys(driver) {
  const state = PIPELINE_STATES.get(driver);
  return state ? state.ordered.map((stage) => stage.key) : [];
}
