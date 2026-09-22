
const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };

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

export function IconBook(props) {
  return (
    <svg {...common} {...props}>
      <path d="M12 6c-1.5-1-4-1.5-7-1v13c3-.5 5.5 0 7 1 1.5-1 4-1.5 7-1V5c-3-.5-5.5 0-7 1z" />
      <path d="M12 6v13" />
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
