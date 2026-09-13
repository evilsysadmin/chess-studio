export const PAWN_SLUG_RENDER_BUDGET = Object.freeze({
  version: 'desktop-fill-rate-v1',
  desktopPixelRatioCap: 1.35,
});

const configuredRenderers = new WeakSet();

export function pawnSlugCappedPixelRatio(
  currentPixelRatio,
  cap = PAWN_SLUG_RENDER_BUDGET.desktopPixelRatioCap,
) {
  const current = Math.max(0.5, Number(currentPixelRatio) || 1);
  const safeCap = Math.max(1, Number(cap) || PAWN_SLUG_RENDER_BUDGET.desktopPixelRatioCap);
  return Math.min(current, safeCap);
}

function deferAfterRender(task) {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(task);
    return;
  }
  Promise.resolve().then(task);
}

export function applyPawnSlugRenderBudget(renderer, {
  pixelRatioCap = PAWN_SLUG_RENDER_BUDGET.desktopPixelRatioCap,
} = {}) {
  if (!renderer || configuredRenderers.has(renderer)) {
    return Object.freeze({ configured: false, changed: false, scheduled: false });
  }
  configuredRenderers.add(renderer);

  const current = Math.max(0.5, Number(renderer.getPixelRatio?.()) || 1);
  const target = pawnSlugCappedPixelRatio(current, pixelRatioCap);
  const dataset = renderer.domElement?.dataset;
  if (dataset) dataset.pawnSlugRenderBudget = `dpr<=${target.toFixed(2)}`;

  if (target >= current - 0.001 || typeof renderer.setPixelRatio !== 'function') {
    return Object.freeze({ configured: true, changed: false, scheduled: false, current, target });
  }

  // The hook is reached from an object's onBeforeRender. Resizing the drawing
  // buffer there would mutate the active render pass, so apply once in a
  // microtask after renderer.render() has unwound. Mobile is already capped at
  // 1.25 by the runtime and therefore never enters this branch.
  deferAfterRender(() => {
    if (renderer.domElement?.isConnected === false) return;
    const latest = Math.max(0.5, Number(renderer.getPixelRatio?.()) || current);
    if (latest > target + 0.001) renderer.setPixelRatio(target);
  });

  return Object.freeze({ configured: true, changed: true, scheduled: true, current, target });
}

function firstRenderable(root) {
  if (!root) return null;
  let found = null;
  root.traverse?.((node) => {
    if (!found && (node?.isMesh || node?.isSprite || node?.isPoints)) found = node;
  });
  return found;
}

export function installPawnSlugRenderBudget(root, options = {}) {
  if (!root) return null;
  root.userData ||= {};
  root.userData.pawnSlugRenderBudget = PAWN_SLUG_RENDER_BUDGET.version;

  const proxy = firstRenderable(root);
  if (!proxy) return null;
  const previous = proxy.onBeforeRender;
  proxy.onBeforeRender = function pawnSlugRenderBudgetBeforeRender(renderer, ...args) {
    previous?.call(this, renderer, ...args);
    applyPawnSlugRenderBudget(renderer, options);
    // One real render is enough to discover/configure the renderer. Restore the
    // original callback immediately so the budget has zero steady-state CPU cost.
    proxy.onBeforeRender = previous || (() => {});
  };
  return proxy;
}
