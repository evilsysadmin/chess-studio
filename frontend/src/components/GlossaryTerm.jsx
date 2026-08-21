import React, { useId, useState } from 'react';
import { glossaryEntry } from '../chessGlossary.js';

// Ayuda contextual reutilizable. Hover en escritorio; focus/Enter/tap en
// teclado y móvil. La definición larga sigue viviendo en el Glosario.
export default function GlossaryTerm({ term, children, className = '' }) {
  const entry = glossaryEntry(term);
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  if (!entry) return <>{children ?? term}</>;

  const label = children ?? entry.term;
  return (
    <span
      className={`glossary-term ${open ? 'is-open' : ''} ${className}`.trim()}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      aria-describedby={tooltipId}
      onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }}
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setOpen((value) => !value);
        }
        if (event.key === 'Escape') setOpen(false);
      }}
    >
      <span className="glossary-term-label">{label}</span>
      <span className="glossary-tooltip" id={tooltipId} role="tooltip">
        <strong>{entry.term}</strong>
        <span>{entry.tooltip || entry.definition}</span>
        <small>Aprendizaje → Glosario para la definición completa.</small>
      </span>
    </span>
  );
}
