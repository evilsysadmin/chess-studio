import { chroniclesMapForState } from './chroniclesMapCatalog.js';

export function chroniclesTacticsLocationLabel(state) {
  const map = chroniclesMapForState(state);
  return map?.title || 'Chronicles of Matthias';
}
