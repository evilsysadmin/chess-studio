import { lazy } from 'react';
import { registerBoard3D } from './boardRendererRegistry.js';

// Register the renderer without downloading it. Home and login must not pay the
// Three/WebGL download + parse cost merely because the browser became idle;
// the first real 3D board mount remains the deliberate loading boundary.
const loadBoard3D = async () => {
  const [renderer, pointerCapture] = await Promise.all([
    import('./Board3D.jsx'),
    import('../warRoomPointerCapture.js'),
  ]);
  pointerCapture.installWarRoomPointerCapture();
  return renderer;
};

let board3DLoadPromise = null;

export function preloadBoard3D() {
  if (!board3DLoadPromise) {
    board3DLoadPromise = loadBoard3D().catch((error) => {
      board3DLoadPromise = null;
      throw error;
    });
  }
  return board3DLoadPromise;
}

registerBoard3D(lazy(preloadBoard3D));
