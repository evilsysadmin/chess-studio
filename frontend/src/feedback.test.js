import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from './auth.js';
import { fetchAdminFeedback, submitFeedback, updateAdminFeedbackStatus } from './feedback.js';

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  };
}

describe('feedback API client', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(TOKEN_KEY, 'session-token');
    global.fetch = vi.fn();
  });

  it('envía feedback autenticado con categoría y contexto', async () => {
    global.fetch.mockResolvedValue(response(201, { feedback: { id: 'f1', status: 'new' } }));
    await submitFeedback({ category: 'ux', message: 'Demasiadas cosas.', context: 'Home' });

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/feedback');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer session-token');
    expect(options.headers['X-Request-ID']).toBeTruthy();
    expect(JSON.parse(options.body)).toEqual({ category: 'ux', message: 'Demasiadas cosas.', context: 'Home', attachments: [] });
  });



  it('propaga AbortSignal para poder cancelar un envío al cerrar el modal', async () => {
    global.fetch.mockResolvedValue(response(201, { feedback: { id: 'f2', status: 'new' } }));
    const controller = new AbortController();
    await submitFeedback({ category: 'bug', message: 'Se ha quedado tieso.', context: 'Partida', signal: controller.signal });
    expect(global.fetch.mock.calls[0][1].signal).toBe(controller.signal);
  });
  it('lee feedback admin y actualiza estado', async () => {
    global.fetch
      .mockResolvedValueOnce(response(200, { feedback: [{ id: 'f1', status: 'new' }], newCount: 1 }))
      .mockResolvedValueOnce(response(200, { feedback: { id: 'f1', status: 'resolved' } }));

    const list = await fetchAdminFeedback();
    const updated = await updateAdminFeedbackStatus('f1', 'resolved');

    expect(list.newCount).toBe(1);
    expect(updated.feedback.status).toBe('resolved');
    expect(global.fetch.mock.calls[1][0]).toContain('/admin/feedback/f1/status');
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ status: 'resolved' });
  });
});
