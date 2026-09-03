import { describe, expect, it, vi } from 'vitest';
import { isLikelyModuleLoadError, reloadClientRuntime } from './moduleLoadRecovery.js';

describe('recuperación de módulos lazy', () => {
  it('reconoce errores típicos de chunks y el undefined.default de React.lazy', () => {
    expect(isLikelyModuleLoadError(new TypeError("Cannot read properties of undefined (reading 'default')"))).toBe(true);
    expect(isLikelyModuleLoadError(new TypeError('Failed to fetch dynamically imported module: /assets/GameScreen-abc.js'))).toBe(true);
    expect(isLikelyModuleLoadError(new Error('ChunkLoadError: Loading chunk Board3D failed'))).toBe(true);
  });

  it('no convierte errores normales de la pantalla en reloads', () => {
    expect(isLikelyModuleLoadError(new Error('Illegal move'))).toBe(false);
    expect(isLikelyModuleLoadError(new Error('La API devolvió 500'))).toBe(false);
  });

  it('recarga el runtime sólo cuando existe una acción de reload', () => {
    const reload = vi.fn();
    expect(reloadClientRuntime(reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reloadClientRuntime(42)).toBe(false);
  });
});
