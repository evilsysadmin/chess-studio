import { attachPawnSlugReactiveSetpieces } from './pawnSlugScenarioSetpieces.js';

const TAU = Math.PI * 2;
const AMBIENT_NAMES = new Set([
  'pawn-slug-forest-fireflies',
  'pawn-slug-ruins-dust',
  'pawn-slug-dungeon-chain',
]);

function stablePhase(index, offset = 0) {
  return ((index * 1.61803398875 + offset) % 1) * TAU;
}

function captureNode(node) {
  if (!node) return null;
  return {
    node,
    baseX: node.position.x,
    baseY: node.position.y,
    baseZ: node.position.z,
    baseRz: node.rotation.z,
    baseScaleX: node.scale.x,
    baseScaleY: node.scale.y,
    baseScaleZ: node.scale.z,
  };
}

function restore(entry) {
  const { node } = entry;
  node.position.set(entry.baseX, entry.baseY, entry.baseZ);
  node.rotation.z = entry.baseRz;
  node.scale.set(entry.baseScaleX, entry.baseScaleY, entry.baseScaleZ);
}

function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function firstRenderable(node) {
  if (node?.isMesh) return node;
  let found = null;
  node?.traverse?.((child) => {
    if (!found && child.isMesh) found = child;
  });
  return found;
}

export function createPawnSlugScenarioAmbience(root, { reducedMotion = false } = {}) {
  if (!root) throw new Error('Pawn Slug scenario ambience requires a root');

  const fireflies = [];
  const dust = [];
  const chains = [];
  root.traverse((node) => {
    if (node.name === 'pawn-slug-forest-fireflies') fireflies.push(captureNode(node));
    else if (node.name === 'pawn-slug-ruins-dust') dust.push(captureNode(node));
    else if (node.name === 'pawn-slug-dungeon-chain') chains.push(captureNode(node));
  });

  const registry = [...fireflies, ...dust, ...chains].filter(Boolean);
  const enabled = !reducedMotion && registry.length > 0;

  return Object.freeze({
    enabled,
    counts: Object.freeze({ fireflies: fireflies.length, dust: dust.length, chains: chains.length }),
    update(time = 0) {
      if (!enabled) return;
      const t = Number(time) || 0;

      fireflies.forEach((entry, index) => {
        const phase = stablePhase(index, 0.17);
        entry.node.position.y = entry.baseY + Math.sin(t * 1.35 + phase) * 0.14;
        entry.node.position.x = entry.baseX + Math.sin(t * 0.72 + phase * 0.7) * 0.08;
        const pulse = 0.94 + Math.sin(t * 2.15 + phase) * 0.06;
        entry.node.scale.set(entry.baseScaleX * pulse, entry.baseScaleY * pulse, entry.baseScaleZ * pulse);
      });

      dust.forEach((entry, index) => {
        const phase = stablePhase(index, 0.43);
        entry.node.position.x = entry.baseX + Math.sin(t * 0.24 + phase) * 0.32;
        entry.node.position.y = entry.baseY + Math.sin(t * 0.31 + phase * 0.8) * 0.08;
        entry.node.rotation.z = entry.baseRz + Math.sin(t * 0.18 + phase) * 0.025;
      });

      chains.forEach((entry, index) => {
        const phase = stablePhase(index, 0.71);
        entry.node.rotation.z = entry.baseRz + Math.sin(t * 0.62 + phase) * 0.055;
      });
    },
    reset() {
      registry.forEach(restore);
    },
  });
}

export function attachPawnSlugScenarioAmbience(root, { reducedMotion = prefersReducedMotion() } = {}) {
  const controller = createPawnSlugScenarioAmbience(root, { reducedMotion });
  root.userData.pawnSlugScenarioAmbience = controller;
  attachPawnSlugReactiveSetpieces(root, { reducedMotion });
  if (!controller.enabled) return controller;

  let lastFrame = -1;
  root.traverse((node) => {
    if (!AMBIENT_NAMES.has(node.name)) return;
    const proxy = firstRenderable(node);
    if (!proxy) return;
    const previous = proxy.onBeforeRender;
    proxy.onBeforeRender = function ambientOnBeforeRender(renderer, ...args) {
      previous?.call(this, renderer, ...args);
      const frame = Number(renderer?.info?.render?.frame);
      if (Number.isFinite(frame) && frame === lastFrame) return;
      if (Number.isFinite(frame)) lastFrame = frame;
      const now = typeof performance !== 'undefined' ? performance.now() / 1000 : 0;
      controller.update(now);
    };
  });
  return controller;
}
