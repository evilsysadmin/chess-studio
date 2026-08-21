import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from './auth.js';
import { deleteAdminUser } from './admin.js';

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  };
}

describe('admin account deletion', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(TOKEN_KEY, 'admin-token');
    global.fetch = vi.fn();
  });

  it('manda el username por JSON y conserva auth + request id', async () => {
    global.fetch.mockResolvedValue(response(200, { deleted: true, username: 'bob', deletedGames: 2 }));

    const result = await deleteAdminUser('bob');

    expect(result).toEqual({ deleted: true, username: 'bob', deletedGames: 2 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/admin/delete-user');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ username: 'bob' });
    expect(options.headers.Authorization).toBe('Bearer admin-token');
    expect(options.headers['X-Request-ID']).toBeTruthy();
  });

  it('propaga el error seguro del backend', async () => {
    global.fetch.mockResolvedValue(response(409, { detail: 'No puedes borrar tu propia cuenta.' }));
    await expect(deleteAdminUser('admin')).rejects.toThrow('No puedes borrar tu propia cuenta.');
  });
});
