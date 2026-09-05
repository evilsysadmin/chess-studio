import { BOARD_RENDERER_KEY, getBoardRenderer } from '../userPreferences.js';

export const BOARD_RENDERER_STORAGE_KEY = BOARD_RENDERER_KEY;

export function shouldPrewarmBoard3D() {
  // Keep the idle prewarm policy tied to the same renderer contract used by the
  // UI. In particular, a deliberate 2D choice is persisted as 2d-explicit-v1,
  // while the legacy plain `2d` value intentionally migrates to the 3D default.
  return getBoardRenderer() === '3d';
}
