export const MATTHIAS_MEMORY_UPDATED_EVENT = 'chess-study-matthias-memory-updated';

export function emitMatthiasMemoryUpdated(memory) {
  if (
    typeof globalThis?.dispatchEvent !== 'function'
    || typeof globalThis?.CustomEvent !== 'function'
  ) return false;
  globalThis.dispatchEvent(new CustomEvent(MATTHIAS_MEMORY_UPDATED_EVENT, { detail: memory ?? null }));
  return true;
}
