import { describe, expect, it } from 'vitest';
import { serviceWorkerRegistrationUrl } from './pwaInstall.js';

describe('PWA service worker registration', () => {
  it('versiona la URL con el build para forzar una instalación nueva tras deploy', () => {
    expect(serviceWorkerRegistrationUrl('/chess-studio/', '5987dc1979f0')).toBe('/chess-studio/sw.js?build=5987dc1979f0');
    expect(serviceWorkerRegistrationUrl('./', 'v16.6dm46zfrp')).toBe('./sw.js?build=v16.6dm46zfrp');
  });

  it('normaliza una base sin slash final y escapa el identificador', () => {
    expect(serviceWorkerRegistrationUrl('/staging', 'build con espacios')).toBe('/staging/sw.js?build=build%20con%20espacios');
  });
});
