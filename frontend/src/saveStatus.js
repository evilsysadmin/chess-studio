export const SAVE_STATUS = Object.freeze({
  SAVED: 'saved',
  SAVING: 'saving',
  ERROR: 'error',
});

const COPY = Object.freeze({
  [SAVE_STATUS.SAVED]: {
    label: 'Guardado',
    title: 'La última posición confirmada está guardada.',
    tone: 'saved',
  },
  [SAVE_STATUS.SAVING]: {
    label: 'Guardando…',
    title: 'Esperando confirmación del servidor antes de dar la posición por guardada.',
    tone: 'saving',
  },
  [SAVE_STATUS.ERROR]: {
    label: 'Error al guardar',
    title: 'La última escritura falló. La posición confirmada anterior sigue intacta; reintenta cuando vuelva la conexión.',
    tone: 'error',
  },
  offline: {
    label: 'Sin conexión',
    title: 'El navegador está sin conexión. La última posición confirmada sigue guardada.',
    tone: 'offline',
  },
});

export function resolveSaveStatus(state = SAVE_STATUS.SAVED, online = true) {
  if (!online) return COPY.offline;
  return COPY[state] || COPY[SAVE_STATUS.SAVED];
}
