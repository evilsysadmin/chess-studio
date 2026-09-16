function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function chroniclesEnemyMotionPose(visualType, time, movement = 0, { coarsePointer = false } = {}) {
  const motion = clamp01(movement);
  const detail = coarsePointer ? 0.72 : 1;
  const stride = Math.sin(time * (3.6 + motion * 3.4));
  const counter = Math.sin(time * (3.6 + motion * 3.4) + Math.PI);
  const idle = Math.sin(time * 1.15);
  const breathe = Math.sin(time * 1.75);

  if (visualType === 'scavenger-knight') {
    return {
      primary: (idle * 0.018 + stride * 0.085 * motion) * detail,
      secondary: (breathe * 0.012 + counter * 0.04 * motion) * detail,
      lift: Math.abs(stride) * 0.028 * motion * detail,
      pulse: 1 + Math.sin(time * 4.1) * 0.035,
    };
  }
  if (visualType === 'spectral-bishop') {
    return {
      primary: (Math.sin(time * 1.35) * 0.04 + stride * 0.025 * motion) * detail,
      secondary: (Math.sin(time * 0.82) * 0.055 + counter * 0.018 * motion) * detail,
      lift: (0.025 + Math.sin(time * 1.9) * 0.018) * detail,
      pulse: 1 + Math.sin(time * 2.6) * 0.065,
    };
  }
  if (visualType === 'gate-jailer') {
    return {
      primary: (idle * 0.01 + stride * 0.028 * motion) * detail,
      secondary: (breathe * 0.008 + counter * 0.018 * motion) * detail,
      lift: Math.abs(stride) * 0.018 * motion * detail,
      pulse: 1 + Math.sin(time * 3.2) * 0.028,
    };
  }
  return {
    primary: (idle * 0.018 + stride * 0.052 * motion) * detail,
    secondary: (breathe * 0.012 + counter * 0.032 * motion) * detail,
    lift: Math.abs(stride) * 0.024 * motion * detail,
    pulse: 1 + Math.sin(time * 3.8) * 0.038,
  };
}

function snapshot(node) {
  if (!node) return null;
  return {
    node,
    px: node.position.x,
    py: node.position.y,
    pz: node.position.z,
    rx: node.rotation.x,
    ry: node.rotation.y,
    rz: node.rotation.z,
  };
}

function restore(part) {
  if (!part?.node) return;
  part.node.position.set(part.px, part.py, part.pz);
  part.node.rotation.set(part.rx, part.ry, part.rz);
}

function named(root, name) {
  return snapshot(root.getObjectByName?.(name));
}

function firstRenderable(root) {
  let first = null;
  root.traverse?.((node) => {
    if (!first && node?.isMesh) first = node;
  });
  return first;
}

function partsFor(root, visualType) {
  if (visualType === 'scavenger-knight') {
    return {
      primary: named(root, 'scavenger-knight-neck-rig'),
      secondary: named(root, 'scavenger-knight-loot-satchel'),
      tertiary: named(root, 'scavenger-knight-scrap-pouch'),
    };
  }
  if (visualType === 'spectral-bishop') {
    return {
      primary: named(root, 'spectral-bishop-head-halo'),
      secondary: named(root, 'spectral-bishop-robe'),
      tertiary: named(root, 'spectral-bishop-wisp-left'),
      quaternary: named(root, 'spectral-bishop-wisp-right'),
    };
  }
  if (visualType === 'gate-jailer') {
    return {
      primary: named(root, 'gate-jailer-crown'),
      secondary: named(root, 'gate-jailer-portcullis'),
      tertiary: named(root, 'gate-jailer-key-blade'),
    };
  }
  return {
    primary: named(root, 'corrupted-pawn-head'),
    secondary: named(root, 'corrupted-pawn-broken-collar'),
    tertiary: named(root, 'corrupted-pawn-spike-left'),
    quaternary: named(root, 'corrupted-pawn-spike-right'),
  };
}

function applyPose(parts, visualType, pose) {
  Object.values(parts).forEach(restore);

  if (visualType === 'scavenger-knight') {
    if (parts.primary) {
      parts.primary.node.rotation.x = parts.primary.rx + pose.primary;
      parts.primary.node.rotation.y = parts.primary.ry + pose.secondary;
      parts.primary.node.position.y = parts.primary.py + pose.lift;
    }
    if (parts.secondary) parts.secondary.node.rotation.z = parts.secondary.rz - pose.primary * 0.7;
    if (parts.tertiary) parts.tertiary.node.rotation.z = parts.tertiary.rz + pose.primary * 0.62;
    return;
  }

  if (visualType === 'spectral-bishop') {
    if (parts.primary) parts.primary.node.rotation.z = parts.primary.rz + pose.primary;
    if (parts.secondary) {
      parts.secondary.node.rotation.z = parts.secondary.rz + pose.secondary * 0.28;
      parts.secondary.node.position.y = parts.secondary.py + pose.lift;
    }
    if (parts.tertiary) parts.tertiary.node.rotation.z = parts.tertiary.rz + pose.primary * 1.4;
    if (parts.quaternary) parts.quaternary.node.rotation.z = parts.quaternary.rz - pose.primary * 1.25;
    return;
  }

  if (visualType === 'gate-jailer') {
    if (parts.primary) parts.primary.node.rotation.y = parts.primary.ry + pose.primary;
    if (parts.secondary) parts.secondary.node.position.y = parts.secondary.py + pose.lift;
    if (parts.tertiary) parts.tertiary.node.rotation.z = parts.tertiary.rz + pose.secondary;
    return;
  }

  if (parts.primary) {
    parts.primary.node.rotation.z = parts.primary.rz + pose.primary;
    parts.primary.node.position.y = parts.primary.py + pose.lift;
  }
  if (parts.secondary) parts.secondary.node.rotation.z = parts.secondary.rz - pose.primary * 0.5;
  if (parts.tertiary) parts.tertiary.node.rotation.z = parts.tertiary.rz - pose.secondary;
  if (parts.quaternary) parts.quaternary.node.rotation.z = parts.quaternary.rz + pose.secondary;
}

export function installChroniclesEnemyMotionArt(root, visualType, options = {}) {
  if (!root?.traverse || root.userData?.chroniclesEnemyMotionInstalled) return root;
  const reducedMotion = options.reducedMotion ?? Boolean(
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches,
  );
  root.userData.chroniclesEnemyMotionInstalled = true;
  root.userData.chroniclesEnemyMotionVisualType = visualType;
  if (reducedMotion) return root;

  const sentinel = firstRenderable(root);
  if (!sentinel) return root;
  const parts = partsFor(root, visualType);
  const previousOnBeforeRender = sentinel.onBeforeRender;
  const previousPosition = root.position.clone();
  let smoothedMotion = 0;

  sentinel.onBeforeRender = (...args) => {
    previousOnBeforeRender?.apply(sentinel, args);
    const dx = root.position.x - previousPosition.x;
    const dz = root.position.z - previousPosition.z;
    previousPosition.copy(root.position);
    const frameMotion = clamp01(Math.hypot(dx, dz) * 9);
    smoothedMotion = smoothedMotion * 0.7 + frameMotion * 0.3;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
    applyPose(parts, visualType, chroniclesEnemyMotionPose(visualType, now, smoothedMotion, options));
  };

  const cancel = () => {
    sentinel.onBeforeRender = previousOnBeforeRender || (() => {});
    Object.values(parts).forEach(restore);
  };
  root.userData.chroniclesEnemyMotionCancel = cancel;
  root.userData.chroniclesArtCancel = cancel;
  return root;
}
