import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from './auth.js';
import { deleteAdminUser, fetchAdminMatthiasMemory, fetchAdminMatthiasStatus, previewAdminMatthiasPersonality, resetAdminMatthiasMemory } from './admin.js';

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

describe('admin player reanalysis', () => {
  it('usa endpoint admin y no el narrative público para saltarse cooldowns', async () => {
    const { reanalyzeAdminUser } = await import('./admin.js');
    global.fetch.mockResolvedValue(response(200, { username: 'bob', text: 'lectura', provider: 'cloudflare' }));
    const result = await reanalyzeAdminUser('bob', { total_games: 12 });
    expect(result.text).toBe('lectura');
    const [url, options] = global.fetch.mock.calls.at(-1);
    expect(url).toContain('/admin/player-portrait');
    expect(JSON.parse(options.body)).toEqual({ username: 'bob', facts: { total_games: 12 } });
    expect(options.headers.Authorization).toBe('Bearer admin-token');
  });
});


describe('admin Matthias status', () => {
  it('lee métricas persistentes de Matthias con auth', async () => {
    global.fetch.mockResolvedValue(response(200, { consultations: 7, usersWithMemory: 3, topQuestionKind: 'tactics' }));
    const result = await fetchAdminMatthiasStatus();
    expect(result.consultations).toBe(7);
    const [url, options] = global.fetch.mock.calls.at(-1);
    expect(url).toContain('/admin/matthias-status');
    expect(options.headers.Authorization).toBe('Bearer admin-token');
  });
});


describe('admin Matthias memory inspector', () => {
  it('lee el expediente estructurado de un usuario sin usar el endpoint público', async () => {
    global.fetch.mockResolvedValue(response(200, { username: 'bob', memory: { consultations: 4, activeGoals: [{ id: 'g1', label: 'Mates' }] } }));
    const result = await fetchAdminMatthiasMemory('bob');
    expect(result.memory.consultations).toBe(4);
    const [url, options] = global.fetch.mock.calls.at(-1);
    expect(url).toContain('/admin/matthias/memory');
    expect(JSON.parse(options.body)).toEqual({ username: 'bob' });
    expect(options.headers.Authorization).toBe('Bearer admin-token');
  });
});


describe('admin Matthias memory reset', () => {
  it('borra sólo la memoria de Matthias del usuario elegido', async () => {
    global.fetch.mockResolvedValue(response(200, { reset: true, username: 'bob' }));
    const result = await resetAdminMatthiasMemory('bob');
    expect(result).toEqual({ reset: true, username: 'bob' });
    const [url, options] = global.fetch.mock.calls.at(-1);
    expect(url).toContain('/admin/matthias/reset-memory');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ username: 'bob' });
    expect(options.headers.Authorization).toBe('Bearer admin-token');
  });
});


describe('admin Matthias personality preview', () => {
  it('usa un sandbox sintético separado de la memoria de jugadores', async () => {
    global.fetch.mockResolvedValue(response(200, { preset: 'veteran', text: 'Eso ha sido bueno. No te emociones.', provider: 'cloudflare', synthetic: true }));
    const result = await previewAdminMatthiasPersonality('veteran');
    expect(result.synthetic).toBe(true);
    const [url, options] = global.fetch.mock.calls.at(-1);
    expect(url).toContain('/admin/matthias/personality-preview');
    expect(JSON.parse(options.body)).toEqual({ preset: 'veteran' });
    expect(options.headers.Authorization).toBe('Bearer admin-token');
  });
});
