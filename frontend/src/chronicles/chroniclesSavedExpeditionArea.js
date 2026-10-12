import { chroniclesMapById, chroniclesMapIds } from './chroniclesMapCatalog.js';

// Saved expeditions may come from another device or from a retired map.
// Resolve against the authored atlas rather than an ever-stale UI switch.
export function chroniclesSavedExpeditionArea(save) {
  const known = new Set(chroniclesMapIds());
  const id = [save?.currentMapId, save?.entryMapId]
    .find((candidate) => candidate && known.has(candidate));
  if (!id) return 'Expedición en curso';
  const map = chroniclesMapById(id);
  const title = typeof map?.title === 'string' ? map.title.trim() : '';
  if (!title) return 'Expedición en curso';
  return map.areaCode ? `${map.areaCode} · ${title}` : title;
}
