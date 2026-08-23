import React from 'react';
import { pieceRankInsignia, pieceRankTooltip } from '../combatRanks.js';

function RankGlyph({ icon }) {
  switch (icon) {
    case 'diamond':
      return <path d="M12 3.5 20.5 12 12 20.5 3.5 12Z" />;
    case 'chevron':
      return <path d="M3.5 15.5 12 7l8.5 8.5-2.8 2.8L12 12.6l-5.7 5.7Z" />;
    case 'shield':
      return <path d="M12 2.8 20 6v5.4c0 5.1-3.2 8.4-8 10.8-4.8-2.4-8-5.7-8-10.8V6Zm-4.6 7.4 4.6 4.1 4.6-4.1-1.8-2-2.8 2.5-2.8-2.5Z" />;
    case 'bar':
      return <rect x="8.5" y="3.5" width="7" height="17" rx="1.3" />;
    case 'double-bar':
      return <>
        <rect x="4.5" y="3.5" width="6" height="17" rx="1.2" />
        <rect x="13.5" y="3.5" width="6" height="17" rx="1.2" />
      </>;
    case 'leaf':
      return <>
        <path d="M4 18.6C5.8 9 11.2 3.6 20 4c.2 8.7-5.1 14.1-14.7 16.1Z" />
        <path className="rank-insignia-cut" d="M6.7 17.2 17.2 6.8" />
      </>;
    case 'eagle':
      return <path d="M2.5 8.1 8.8 10l3.2-5.7 3.2 5.7 6.3-1.9-2.9 7.4-4.2-.4L12 20l-2.4-4.9-4.2.4Z" />;
    case 'star':
      return <path d="m12 2.6 2.7 5.7 6.2.8-4.5 4.3 1.1 6.1-5.5-3-5.5 3 1.1-6.1-4.5-4.3 6.2-.8Z" />;
    default:
      return null;
  }
}

export default function RankInsignia({ rankOrLevel, className = '', decorative = false, onClick, onDoubleClick, draggable = false, onDragStart, onDragEnd }) {
  const insignia = pieceRankInsignia(rankOrLevel);
  const tooltip = pieceRankTooltip(rankOrLevel);
  if (!insignia.icon || insignia.icon === 'none') return null;

  return (
    <span
      className={`${className} rank-insignia family-${insignia.family} icon-${insignia.icon}`.trim()}
      title={tooltip.replace(/\n/g, ' · ')}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? 'true' : undefined}
      aria-label={decorative ? undefined : `Rango ${insignia.label}. ${tooltip.replace(/\n/g, ' ')}`}
      data-rank-icon={insignia.icon}
      data-rank-tooltip={tooltip}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <svg className="rank-insignia-svg" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <RankGlyph icon={insignia.icon} />
      </svg>
    </span>
  );
}
