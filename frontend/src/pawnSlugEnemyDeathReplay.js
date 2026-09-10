function defaultNow() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function defaultRaf(callback) {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback);
  return setTimeout(() => callback(defaultNow()), 16);
}

function defaultCancel(frame) {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
  else clearTimeout(frame);
}

export function installPawnSlugEnemyDeathReplay(sprite, {
  type = 'pawn',
  duration = 0.7,
  hold = 0.22,
  reducedMotion = false,
  animate,
  now = defaultNow,
  raf = defaultRaf,
  cancel = defaultCancel,
} = {}) {
  if (!sprite || typeof animate !== 'function') return null;

  const originalTraverse = sprite.traverse.bind(sprite);
  const visibleDescriptor = Object.getOwnPropertyDescriptor(sprite, 'visible');
  let visible = sprite.visible !== false;
  let lastParent = sprite.parent || null;
  let pendingDeath = false;
  let replaying = false;
  let finalizing = false;
  let deferredTraverse = null;
  let frame = 0;
  let startedAt = 0;
  let baseX = 0;
  let baseY = 0;
  let baseZ = 0;
  let baseDirection = 1;

  const restoreTraverse = () => {
    sprite.traverse = originalTraverse;
  };

  const restoreVisibleProperty = () => {
    if (visibleDescriptor) Object.defineProperty(sprite, 'visible', visibleDescriptor);
    else {
      delete sprite.visible;
      sprite.visible = visible;
    }
  };

  const finish = ({ external = false } = {}) => {
    if (!replaying && !pendingDeath) return;
    cancel(frame);
    frame = 0;
    pendingDeath = false;
    replaying = false;
    finalizing = true;
    restoreTraverse();
    restoreVisibleProperty();

    if (!external) {
      const parent = sprite.parent;
      if (parent) parent.remove(sprite);
      if (deferredTraverse) originalTraverse(deferredTraverse);
    }
    deferredTraverse = null;
    finalizing = false;
  };

  const tick = () => {
    if (!replaying) return;
    const elapsed = Math.max(0, (now() - startedAt) / 1000);
    const deathAge = reducedMotion ? 999 : elapsed;
    sprite.position.set(baseX, baseY, baseZ);
    const baseScaleX = Math.abs(sprite.userData?.motionBaseScaleX || sprite.scale.x || 1);
    sprite.scale.x = baseScaleX * baseDirection;
    animate(deathAge);
    if (elapsed >= duration + hold) {
      finish();
      return;
    }
    frame = raf(tick);
  };

  const onAdded = () => {
    if (sprite.parent) lastParent = sprite.parent;
  };

  const onRemoved = () => {
    if (finalizing) return;
    if (pendingDeath && !replaying) {
      pendingDeath = false;
      replaying = true;
      startedAt = now();
      baseX = sprite.position.x;
      baseY = sprite.position.y;
      baseZ = sprite.position.z;
      baseDirection = sprite.scale.x < 0 ? -1 : 1;
      visible = true;
      if (lastParent) lastParent.add(sprite);
      frame = raf(tick);
      return;
    }
    if (replaying) finish({ external: true });
  };

  Object.defineProperty(sprite, 'visible', {
    configurable: true,
    enumerable: true,
    get() {
      return visible;
    },
    set(value) {
      const next = Boolean(value);
      if (!next && !replaying && sprite.parent) {
        pendingDeath = true;
        visible = true;
        return;
      }
      visible = next;
    },
  });

  sprite.traverse = (callback) => {
    if (replaying && !finalizing) {
      deferredTraverse = callback;
      return;
    }
    originalTraverse(callback);
  };
  sprite.addEventListener('added', onAdded);
  sprite.addEventListener('removed', onRemoved);

  return Object.freeze({
    type,
    get active() {
      return replaying || pendingDeath;
    },
    finish,
  });
}
