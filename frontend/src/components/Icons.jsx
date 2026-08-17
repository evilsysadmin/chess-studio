import React from 'react';

const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };

export function IconBookmark(props) {
  return (
    <svg {...common} {...props}>
      <path d="M6 3h12v18l-6-4-6 4V3z" />
    </svg>
  );
}

export function IconTrophy(props) {
  return (
    <svg {...common} {...props}>
      <path d="M8 3h8v4a4 4 0 0 1-8 0V3z" />
      <path d="M6 4H4a2 2 0 0 0 0 4c.5 1.5 1.5 2.5 3 3" />
      <path d="M18 4h2a2 2 0 0 1 0 4c-.5 1.5-1.5 2.5-3 3" />
      <path d="M12 11v4" />
      <path d="M8 20h8" />
      <path d="M9 20c0-2 1.3-3 3-3s3 1 3 3" />
    </svg>
  );
}

export function IconBulb(props) {
  return (
    <svg {...common} {...props}>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.9V17h5v-1.2c0-.8.4-1.5 1-1.9A6 6 0 0 0 12 3z" />
    </svg>
  );
}

export function IconBook(props) {
  return (
    <svg {...common} {...props}>
      <path d="M12 6c-1.5-1-4-1.5-7-1v13c3-.5 5.5 0 7 1 1.5-1 4-1.5 7-1V5c-3-.5-5.5 0-7 1z" />
      <path d="M12 6v13" />
    </svg>
  );
}

export function IconVolume(props) {
  return (
    <svg {...common} {...props}>
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7" />
      <path d="M19 6a8 8 0 0 1 0 12" />
    </svg>
  );
}

export function IconVolumeMuted(props) {
  return (
    <svg {...common} {...props}>
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      <path d="M16 9l5 6" />
      <path d="M21 9l-5 6" />
    </svg>
  );
}

export function IconPuzzle(props) {
  return (
    <svg {...common} {...props}>
      <path d="M9 4h4v2a2 2 0 1 0 0 4v2H4v-3a2 2 0 1 0 0-4V4h5V2.5A1.5 1.5 0 0 1 10.5 1v0A1.5 1.5 0 0 1 12 2.5V4" />
      <path d="M13 10h7v5h-2.5a1.5 1.5 0 0 0 0 3H20v6h-7v-3a2 2 0 1 0-4 0v3H4v-7h3a2 2 0 1 0 0-4H4v-2h9" />
    </svg>
  );
}

export function IconStar(props) {
  return (
    <svg {...common} {...props}>
      <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7L12 3z" />
    </svg>
  );
}

export function IconEye(props) {
  return (
    <svg {...common} {...props}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconPawn(props) {
  return (
    <svg {...common} {...props}>
      <circle cx="12" cy="6" r="3" />
      <path d="M9 11c0 1.5 1 2.5 1 3.5S8 17 8 19h8c0-2-2-3-2-4.5s1-2 1-3.5" />
      <path d="M6 19h12v2H6z" />
    </svg>
  );
}

export function IconSword(props) {
  return (
    <svg {...common} {...props}>
      <path d="M14.5 2.5l7 7-2 2-7-7z" />
      <path d="M17.5 7.5l-11 11" />
      <path d="M3 21l3-1 1-3" />
      <path d="M13 5l-2 2" />
      <path d="M19 11l-2 2" />
    </svg>
  );
}
