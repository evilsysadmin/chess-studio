import {
  chroniclesMapContentPosition,
  chroniclesMapForState,
} from './chroniclesMapCatalog.js';
import {
  chroniclesContentEntries,
  chroniclesContentVisible,
} from './chroniclesContentRuntime.js';

const PERSISTENT_VISUAL_KINDS = new Set(['trigger', 'lever', 'exit']);

function authoredSetEffects(entry) {
  return (entry?.action?.effects || []).filter((effect) => effect?.type === 'set' && effect.key);
}

function controlledRequirementKeys(entry) {
  return new Set((entry?.when || []).map((requirement) => requirement?.key).filter(Boolean));
}

export function chroniclesContentActivated(state, entry) {
  if (!state || !entry) return false;
  const controlledKeys = controlledRequirementKeys(entry);
  if (!controlledKeys.size) return false;

  return authoredSetEffects(entry).some((effect) => (
    controlledKeys.has(effect.key)
    && state?.[effect.key] === effect.value
  ));
}

export function chroniclesContentVisualVisible(state, entry) {
  if (!entry) return false;
  if (PERSISTENT_VISUAL_KINDS.has(entry.kind)) return true;
  return chroniclesContentVisible(state, entry);
}

export function chroniclesContentVisualStates(state, mapOrState = state) {
  const map = mapOrState?.grid ? mapOrState : chroniclesMapForState(mapOrState || state);
  return Object.freeze(chroniclesContentEntries(map).map((entry) => Object.freeze({
    id: entry.id,
    kind: entry.kind,
    visualType: entry.visualType || entry.kind,
    position: chroniclesMapContentPosition(map, entry),
    available: chroniclesContentVisible(state, entry),
    activated: chroniclesContentActivated(state, entry),
    visible: chroniclesContentVisualVisible(state, entry),
  })));
}

export function chroniclesContentVisualStateById(state, id, mapOrState = state) {
  if (!id) return null;
  return chroniclesContentVisualStates(state, mapOrState).find((entry) => entry.id === id) || null;
}
