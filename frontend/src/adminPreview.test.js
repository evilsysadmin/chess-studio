import { afterEach, describe, expect, it } from 'vitest';
import { hasAdminPreviewAccess, setAdminPreviewAccess } from './adminPreview.js';

afterEach(() => setAdminPreviewAccess(false));

describe('vista de prueba para administradores', () => {
  it('vive sólo en la sesión activa y se puede revocar al cerrar sesión', () => {
    expect(hasAdminPreviewAccess()).toBe(false);
    setAdminPreviewAccess(true);
    expect(hasAdminPreviewAccess()).toBe(true);
    setAdminPreviewAccess(false);
    expect(hasAdminPreviewAccess()).toBe(false);
  });
});
