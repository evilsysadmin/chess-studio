import { describe, expect, it } from 'vitest';
import { resolveSaveStatus, SAVE_STATUS } from './saveStatus.js';

describe('estado visible de guardado', () => {
  it('distingue guardando, guardado y error de escritura', () => {
    expect(resolveSaveStatus(SAVE_STATUS.SAVING, true)).toMatchObject({ label: 'Guardando…', tone: 'saving' });
    expect(resolveSaveStatus(SAVE_STATUS.SAVED, true)).toMatchObject({ label: 'Guardado', tone: 'saved' });
    expect(resolveSaveStatus(SAVE_STATUS.ERROR, true)).toMatchObject({ label: 'Error al guardar', tone: 'error' });
  });

  it('sin conexión tiene prioridad sobre cualquier estado de escritura', () => {
    expect(resolveSaveStatus(SAVE_STATUS.SAVING, false)).toMatchObject({ label: 'Sin conexión', tone: 'offline' });
    expect(resolveSaveStatus(SAVE_STATUS.ERROR, false).title).toContain('última posición confirmada');
  });

  it('un estado desconocido degrada de forma segura a Guardado', () => {
    expect(resolveSaveStatus('banana-radioactiva', true)).toMatchObject({ label: 'Guardado', tone: 'saved' });
  });
});
