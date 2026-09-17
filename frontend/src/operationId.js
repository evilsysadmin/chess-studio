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

export function createRetryOperationIdCache({
  scope = 'op',
  ttlMs = 5 * 60_000,
  now = () => Date.now(),
  createId = createOperationId,
} = {}) {
  let retry = null;

  function resolve(parts, current = {}) {
    const operationFingerprintValue = operationFingerprint(parts);
    if (current.operationId && current.operationFingerprint === operationFingerprintValue) {
      return { operationId: current.operationId, operationFingerprint: operationFingerprintValue };
    }

    const timestamp = now();
    const reusable = retry
      && retry.fingerprint === operationFingerprintValue
      && (timestamp - retry.failedAt) < ttlMs;
    const operationId = reusable ? retry.operationId : createId(scope);
    retry = { fingerprint: operationFingerprintValue, operationId, failedAt: timestamp };
    return { operationId, operationFingerprint: operationFingerprintValue };
  }

  function confirm(operationId) {
    if (operationId && retry?.operationId === operationId) retry = null;
  }

  return { resolve, confirm };
}
