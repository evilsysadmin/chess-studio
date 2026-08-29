import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from './auth.js';
import { deleteAdminFeedback, deleteMyFeedback, fetchAdminFeedback, fetchAdminFeedbackSummary, submitFeedback, updateAdminFeedbackStatus } from './feedback.js';

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

  it('usa General por defecto para reducir fricción', async () => {
    global.fetch.mockResolvedValue(response(201, { feedback: { id: 'f0', status: 'new' } }));
    await submitFeedback({ message: 'Comentario sin clasificar.', context: 'Home' });
    const [, options] = global.fetch.mock.calls[0];
    expect(JSON.parse(options.body).category).toBe('general');
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

  it('propaga la cancelación del AbortSignal al envío de feedback', async () => {
    let fetchSignal = null;
    global.fetch = vi.fn().mockImplementation((_url, options = {}) => new Promise((_resolve, reject) => {
      fetchSignal = options.signal;
      options.signal?.addEventListener('abort', () => reject(options.signal.reason || new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    const controller = new AbortController();
    const pending = submitFeedback({ category: 'bug', message: 'Se ha quedado tieso.', context: 'Partida', signal: controller.signal });
    controller.abort(new DOMException('Modal closed', 'AbortError'));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchSignal?.aborted).toBe(true);
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

  it('lee un resumen ligero para el sobre de feedback admin', async () => {
    global.fetch.mockResolvedValueOnce(response(200, { newCount: 3, pendingCount: 4 }));
    const summary = await fetchAdminFeedbackSummary();
    expect(summary).toEqual({ newCount: 3, pendingCount: 4 });
    expect(global.fetch.mock.calls[0][0]).toContain('/admin/feedback/summary');
  });

  it('borra el feedback propio con el endpoint de autoservicio', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, status: 204, json: async () => ({}) });
    await expect(deleteMyFeedback('mine-1')).resolves.toBe(true);
    expect(global.fetch.mock.calls[0][0]).toContain('/feedback/mine-1');
    expect(global.fetch.mock.calls[0][0]).not.toContain('/admin/');
    expect(global.fetch.mock.calls[0][1].method).toBe('DELETE');
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer session-token');
  });

  it('borra feedback admin con DELETE explícito', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, status: 204, json: async () => ({}) });
    await expect(deleteAdminFeedback('f-test')).resolves.toBe(true);
    expect(global.fetch.mock.calls[0][0]).toContain('/admin/feedback/f-test');
    expect(global.fetch.mock.calls[0][1].method).toBe('DELETE');
  });
});
