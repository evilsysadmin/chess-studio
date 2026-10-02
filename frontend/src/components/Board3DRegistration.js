import { lazy } from 'react';
import { registerBoard3D } from './boardRendererRegistry.js';

let board3DLoadPromise = null;

export function preloadBoard3DRenderer() {
  if (!board3DLoadPromise) {
    board3DLoadPromise = Promise.all([
      import('./Board3D.jsx'),
      import('../warRoomPointerCapture.js'),
    ])
      .then(([renderer, pointerCapture]) => {
        pointerCapture.installWarRoomPointerCapture();
        return renderer;
      })
      .catch((error) => {
        // A speculative Home preload must never poison the real lazy boundary.
        // Clear the cached rejection so the actual War Room mount can retry.
        board3DLoadPromise = null;
        throw error;
      });
  }
  return board3DLoadPromise;
}

// Registration stays lazy. Home/login never download Three merely because this
// module was imported; authenticated Home may opt in explicitly when the device
// and network policy says the War Room is the likely next action.
registerBoard3D(lazy(preloadBoard3DRenderer));
