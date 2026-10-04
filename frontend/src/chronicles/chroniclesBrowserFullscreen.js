function fullscreenElement(doc) {
  return doc?.fullscreenElement || doc?.webkitFullscreenElement || null;
}

export function requestChroniclesBrowserFullscreen(doc = globalThis.document) {
  const root = doc?.documentElement;
  const request = root?.requestFullscreen || root?.webkitRequestFullscreen;
  if (!root || typeof request !== 'function' || fullscreenElement(doc)) {
    return Promise.resolve(false);
  }

  try {
    return Promise.resolve(request.call(root)).then(
      () => true,
      () => false,
    );
  } catch {
    return Promise.resolve(false);
  }
}

export function exitChroniclesBrowserFullscreen(doc = globalThis.document) {
  const root = doc?.documentElement;
  if (!doc || !root || fullscreenElement(doc) !== root) {
    return Promise.resolve(false);
  }

  const exit = doc.exitFullscreen || doc.webkitExitFullscreen;
  if (typeof exit !== 'function') return Promise.resolve(false);

  try {
    return Promise.resolve(exit.call(doc)).then(
      () => true,
      () => false,
    );
  } catch {
    return Promise.resolve(false);
  }
}
