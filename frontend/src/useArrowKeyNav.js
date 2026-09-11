import { useEffect } from 'react';

export function shouldIgnoreArrowNavigation(target) {
  const tag = target?.tagName;
  return tag === 'INPUT'
    || tag === 'TEXTAREA'
    || tag === 'SELECT'
    || target?.isContentEditable === true;
}

// Flechas del teclado para navegar jugada por jugada, en pantallas que ya
// tienen un `goTo(paso)` — Anterior/Siguiente sin soltar el mouse. No
// dispara si hay un campo editable enfocado, para no secuestrar el cursor
// dentro de inputs, selects, textareas o editores contenteditable.
export function useArrowKeyNav(onPrev, onNext) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (shouldIgnoreArrowNavigation(document.activeElement)) return;

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
