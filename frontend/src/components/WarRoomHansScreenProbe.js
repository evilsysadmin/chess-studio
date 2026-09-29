import * as THREE from 'three';
import { applyWarRoomHansScreenDiagnostics } from './WarRoomDomDiagnostics.js';

/**
 * Sonda de pantalla de Hans (diagnóstico de la escena de la chimenea), extraída
 * de Board3DCore. Devuelve `expose(props)`, que proyecta al mayordomo con la
 * cámara real y publica su estado en el canvas/marcador sólo si se pidió.
 */
export function createWarRoomHansScreenProbe({ scene, camera, canvas }) {
  const worldProbe = new THREE.Vector3();
  const screenProbe = new THREE.Vector3();
  let cachedHans = null;

  return function exposeHansScreenDiagnostics(diagnostics) {
    if (!diagnostics?.hansDiagnosticsRequested) return;

    if (!cachedHans) cachedHans = scene.getObjectByName?.('war-room-hans-butler') || null;
    const hans = cachedHans;

    let screenState = 'missing';
    let projected = null;
    if (hans) {
      if (hans.visible !== true) {
        screenState = 'hidden';
      } else {
        hans.getWorldPosition(worldProbe);
        screenProbe.copy(worldProbe).project(camera);
        projected = screenProbe;
        const inFrustum = projected.z >= -1 && projected.z <= 1
          && Math.abs(projected.x) <= 0.96
          && Math.abs(projected.y) <= 0.96;
        screenState = inFrustum ? 'onscreen' : 'offscreen';
      }
    }

    applyWarRoomHansScreenDiagnostics({
      canvas,
      marker: diagnostics.hansDiagnosticsMarkerRef?.current || null,
      screenState,
      projected,
    });
  };
}
