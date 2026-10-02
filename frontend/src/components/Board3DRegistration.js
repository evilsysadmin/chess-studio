import { lazy } from 'react';
import { registerBoard3D } from './boardRendererRegistry.js';

let board3DPreloadPromise = null;

export function preloadBoard3DRenderer() {
  if (!board3DPreloadPromise) {
    board3DPreloadPromise = import('./Board3D.jsx').catch((error) => {
      // A speculative Home preload must never poison the real lazy boundary.
      // Clear the cached rejection so the actual War Room mount can retry.
      board3DPreloadPromise = null;
      throw error;
    });
  }
  return board3DPreloadPromise;
}

const loadBoard3D = async () => {
  const [renderer, pointerCapture] = await Promise.all([
    preloadBoard3DRenderer(),
    import('../warRoomPointerCapture.js'),
  ]);
  pointerCapture.installWarRoomPointerCapture();
  return renderer;
};

// Registration stays lazy. Home/login never download Three merely because this
// module was imported; authenticated Home may opt in explicitly when the device
// and network policy says the War Room is the likely next action.
registerBoard3D(lazy(loadBoard3D));
