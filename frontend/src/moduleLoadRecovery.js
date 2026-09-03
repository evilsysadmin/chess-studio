const MODULE_FAILURE_PATTERNS = [
  /cannot read properties of undefined \(reading ['"]default['"]\)/i,
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /chunkloaderror/i,
  /loading chunk\s+\S+\s+failed/i,
];

export function isLikelyModuleLoadError(error) {
  const name = String(error?.name || '');
  const message = String(error?.message || error || '');
  const text = `${name}: ${message}`;
  return MODULE_FAILURE_PATTERNS.some((pattern) => pattern.test(text));
}

export function reloadClientRuntime(reload = null) {
  const action = reload || globalThis?.location?.reload?.bind(globalThis.location);
  if (typeof action !== 'function') return false;
  action();
  return true;
}
