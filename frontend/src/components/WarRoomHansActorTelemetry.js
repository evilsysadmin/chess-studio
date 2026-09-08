import {
  getWarRoomHansActor,
  getWarRoomHansCanvas,
  getWarRoomHansRouteState,
} from './WarRoomHansActor.js';
import { registerWarRoomHansPostRenderStage } from './WarRoomHansPostRenderPipeline.js';

export const WAR_ROOM_HANS_ACTOR_TELEMETRY_VERSION = 'war-room-hans-actor-telemetry-v1';

const POST_RENDER_ORDER = 6;

function setDatasetIfChanged(canvas, key, value) {
  if (!canvas?.dataset) return;
  const next = String(value);
  if (canvas.dataset[key] !== next) canvas.dataset[key] = next;
}

export function installWarRoomHansActorTelemetry(root) {
  const actor = getWarRoomHansActor(root);
  const driver = actor?.driver;
  if (!driver || typeof driver.onBeforeRender !== 'function') return 0;
  if (driver.userData?.warRoomHansActorTelemetry === WAR_ROOM_HANS_ACTOR_TELEMETRY_VERSION) return 0;

  const registered = registerWarRoomHansPostRenderStage(driver, {
    key: WAR_ROOM_HANS_ACTOR_TELEMETRY_VERSION,
    order: POST_RENDER_ORDER,
    run: () => {
      const canvas = getWarRoomHansCanvas(actor);
      if (!canvas) return;
      const state = getWarRoomHansRouteState(actor);
      setDatasetIfChanged(canvas, 'warRoomHansRoute', state.route || 'none');
      setDatasetIfChanged(canvas, 'warRoomHansLogicalX', Number(state.logicalX).toFixed(3));
    },
  });
  if (!registered) return 0;

  driver.userData.warRoomHansActorTelemetry = WAR_ROOM_HANS_ACTOR_TELEMETRY_VERSION;
  return 1;
}
