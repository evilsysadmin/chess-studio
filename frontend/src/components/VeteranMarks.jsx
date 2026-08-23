import React from 'react';

/**
 * Marcas mínimas de veteranía para Combat Chess.
 * Máximo dos visibles: la tercera queda sólo en el tooltip para no saturar la casilla.
 */
export default function VeteranMarks({ marks = [], className = '' }) {
  const normalized = (Array.isArray(marks) ? marks : []).filter(Boolean);
  if (normalized.length === 0) return null;
  const visible = normalized.slice(0, 2);
  const title = normalized.map((mark) => mark.label).join(' · ');
  return (
    <span className={`piece-veteran-marks ${className}`.trim()} title={title} aria-label={title}>
      {visible.map((mark) => (
        <span key={mark.id} className={`piece-veteran-mark mark-${mark.id}`} aria-hidden="true">{mark.glyph}</span>
      ))}
    </span>
  );
}
