import { useEffect } from 'react';

// Flechas del teclado para navegar jugada por jugada, en pantallas que ya
// tienen un `goTo(paso)` — Anterior/Siguiente sin soltar el mouse. No
// dispara si hay un campo de texto enfocado (defensivo; hoy ninguna de
// estas pantallas tiene inputs, pero evita sorpresas si algún día suman uno).
export function useArrowKeyNav(onPrev, onNext) {
  useEffect(() => {
    function handleKeyDown(e) {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onNext();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onPrev, onNext]);
}
