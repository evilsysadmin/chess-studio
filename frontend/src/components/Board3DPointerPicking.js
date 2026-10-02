import { resolveBoard3DPointerSquare } from './Board3DTileInstances.js';

export function pickBoard3DSquare({
  event,
  canvas,
  pointer,
  raycaster,
  camera,
  pickTargets,
  latestProps,
  preferLegalTargets = false,
}) {
  const rect = canvas.getBoundingClientRect();
  pointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(pointer, camera);
  return resolveBoard3DPointerSquare(
    raycaster.intersectObjects(pickTargets, true),
    {
      selectedSquare: latestProps?.selectedSquare,
      legalTargets: latestProps?.legalTargets,
      preferLegalTargets,
    },
  );
}
