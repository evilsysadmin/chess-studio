let fallbackCounter = 0;

export function createOperationId(scope = 'op') {
  const cleanScope = String(scope || 'op').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 20) || 'op';
  const uuid = globalThis?.crypto?.randomUUID?.();
  if (uuid) return `${cleanScope}:${uuid}`;
  fallbackCounter = (fallbackCounter + 1) % 1_000_000;
  return `${cleanScope}:${Date.now().toString(36)}-${fallbackCounter.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function operationFingerprint(parts = []) {
  return (Array.isArray(parts) ? parts : [parts]).map((part) => {
    if (part == null) return '';
    if (typeof part === 'object') {
      try { return JSON.stringify(part, Object.keys(part).sort()); } catch { return String(part); }
    }
    return String(part);
  }).join('|');
}
