import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  STORAGE_LOCAL,
  clearStorageMemoryFallback,
  setStorageItem,
  storageHealthSnapshot,
} from './safeStorage.js';
import PrivacyDataDisclosure from './components/PrivacyDataDisclosure.jsx';

const originalLocalStorage = global.localStorage;

beforeEach(() => {
  global.localStorage = originalLocalStorage;
  originalLocalStorage.clear();
  clearStorageMemoryFallback();
});

afterEach(() => {
  global.localStorage = originalLocalStorage;
  clearStorageMemoryFallback();
});

describe('storage health', () => {
  it('reports healthy native storage without enumerating application data', () => {
    const health = storageHealthSnapshot();
    expect(health.local.readable).toBe(true);
    expect(health.local.memoryFallbackActive).toBe(false);
    expect(health.local.pendingOverrides).toBe(0);
    expect(Object.keys(health.local).sort()).toEqual(['memoryFallbackActive', 'nativeAvailable', 'pendingOverrides', 'readable']);
  });

  it('reports the in-memory fallback after a failed native write and exposes it in Datos y servicios', () => {
    global.localStorage = {
      getItem() { throw new DOMException('blocked', 'SecurityError'); },
      setItem() { throw new DOMException('full', 'QuotaExceededError'); },
      removeItem() { throw new DOMException('blocked', 'SecurityError'); },
      key() { throw new DOMException('blocked', 'SecurityError'); },
      get length() { throw new DOMException('blocked', 'SecurityError'); },
    };

    expect(setStorageItem(STORAGE_LOCAL, 'private-value', 'DO-NOT-RENDER')).toBe(false);
    const health = storageHealthSnapshot();
    expect(health.local.readable).toBe(false);
    expect(health.local.memoryFallbackActive).toBe(true);
    expect(health.local.pendingOverrides).toBe(1);

    const html = renderToStaticMarkup(<PrivacyDataDisclosure />);
    expect(html).toContain('Almacenamiento local');
    expect(html).toContain('fallback de memoria activo');
    expect(html).toContain('1 cambio sin confirmar en Web Storage');
    expect(html).not.toContain('private-value');
    expect(html).not.toContain('DO-NOT-RENDER');
  });
});
