// Controlador puro de la pila global de "volver/cerrar".
// Vive fuera del hook React para que el orden modal -> pantalla sea testeable
// sin montar media aplicación ni depender de jsdom.
export function createBackNavigationStack() {
  const entries = [];

  return {
    push(entry) {
      entries.push(entry);
      return entries.length;
    },
    remove(id) {
      const index = entries.findIndex((candidate) => candidate.id === id);
      if (index >= 0) entries.splice(index, 1);
      return entries.length;
    },
    current() {
      return entries.length ? entries[entries.length - 1] : null;
    },
    size() {
      return entries.length;
    },
    dispatch(event, { editableTarget = false, touchLikeContextMenu = false } = {}) {
      if (event?.type === 'keydown' && event.key !== 'Escape') return false;
      if (event?.type === 'contextmenu' && editableTarget) return false;
      if (event?.type === 'contextmenu' && touchLikeContextMenu) {
        // Android/iOS pueden traducir una pulsación larga a `contextmenu`.
        // Consumimos el menú nativo, pero jamás interpretamos un long-press
        // como "volver": podría cerrar un modal o sacar al jugador de pantalla.
        event.preventDefault?.();
        event.stopPropagation?.();
        return false;
      }

      const entry = entries.length ? entries[entries.length - 1] : null;
      if (!entry) return false;

      if (event?.type === 'contextmenu') event.preventDefault?.();
      event?.stopPropagation?.();
      entry.callbackRef?.current?.();
      return true;
    },
  };
}
