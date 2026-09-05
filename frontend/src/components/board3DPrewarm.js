import { STORAGE_LOCAL, getStorageItem } from '../safeStorage.js';

export const BOARD_RENDERER_STORAGE_KEY = 'chess-study-board-renderer';

export function shouldPrewarmBoard3D() {
  // 3D is the product default, but an explicit 2D choice must remain cheap and
  // isolated. In particular, do not fetch/parse the WebGL chunk behind the
  // user's back after a reload just because the browser happens to be idle.
  return getStorageItem(STORAGE_LOCAL, BOARD_RENDERER_STORAGE_KEY) !== '2d';
}
