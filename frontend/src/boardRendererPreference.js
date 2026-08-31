import { getStorageItem, setStorageItem, STORAGE_LOCAL } from './safeStorage.js';

const BOARD_RENDERER_KEY = 'chess-board-renderer';
const BOARD_RENDERER_EVENT = 'chess-board-renderer-change';
const VALID_RENDERERS = new Set(['2d', '3d']);

export function normalizeBoardRenderer(value) {
  return VALID_RENDERERS.has(value) ? value : '2d';
}

export function loadBoardRenderer() {
  return normalizeBoardRenderer(getStorageItem(STORAGE_LOCAL, BOARD_RENDERER_KEY));
}

export function saveBoardRenderer(value) {
  const renderer = normalizeBoardRenderer(value);
  setStorageItem(STORAGE_LOCAL, BOARD_RENDERER_KEY, renderer);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(BOARD_RENDERER_EVENT, { detail: renderer }));
  }
  return renderer;
}

export function subscribeBoardRenderer(listener) {
  if (typeof window === 'undefined') return () => {};
  const handler = (event) => listener(normalizeBoardRenderer(event?.detail));
  window.addEventListener(BOARD_RENDERER_EVENT, handler);
  return () => window.removeEventListener(BOARD_RENDERER_EVENT, handler);
}
