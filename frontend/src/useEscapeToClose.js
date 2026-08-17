import { useEffect } from 'react';

// Llama a `onClose` con la tecla ESC. Se usa tanto para cerrar modales (info
// de pieza, confirmar ataque, logros...) como para volver al menú desde
// pantallas completas (Torneo, Combate) — el mismo patrón en los dos casos:
// "ESC te saca de donde estás".
export function useEscapeToClose(onClose) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
}
