// Mazmorras used to be one flat list of nine equal buttons. This groups the same actions by
// what the player wants to do, puts one personal suggestion on top, and keeps anything it
// does not know about (a future tool) in a catch-all group so nothing silently disappears.

export const DUNGEON_GROUPS = Object.freeze([
  { id: 'train', title: 'Entrenar', labels: ['Puzzles personales', 'Puzzles clásicos', 'Aperturas', 'Partida de práctica'] },
  { id: 'free', title: 'Modos libres', labels: ['Combat Chess libre'] },
  { id: 'lab', title: 'Laboratorio', labels: ['Experimentos geniales', 'Pawn Slug'] },
]);

export const DUNGEON_LINK_LABELS = Object.freeze(['Espectador', 'Mi progreso']);

const DETAILS = Object.freeze({
  'Puzzles personales': 'Tus puntos débiles, en táctica',
  'Puzzles clásicos': 'Colección de problemas',
  Aperturas: 'Repasa y memoriza líneas',
  'Partida de práctica': 'Sin jugarte el rating',
  'Combat Chess libre': 'Recluta y despliega tu ejército',
  'Experimentos geniales': 'Prototipos y curiosidades',
  'Pawn Slug': 'Mini-juego arcade',
});

// Accessible names the existing e2e specs (and screen readers) already rely on.
const ARIA_LABELS = Object.freeze({
  'Pawn Slug': 'Abrir Pawn Slug directamente',
});

function toItem([label, action]) {
  return { key: label, label, ariaLabel: ARIA_LABELS[label] || label, detail: DETAILS[label] || '', action };
}

// One suggestion, chosen from real signals: an unfinished daily challenge first, then the
// personal-puzzle nudge Matthias is already giving. Returns null when nothing is honest to say.
export function dungeonFeatured({ dailyBrief = null, matthiasAction = null, items = [], onDaily = null } = {}) {
  if (dailyBrief && !dailyBrief.full && onDaily) {
    return {
      key: 'daily',
      eyebrow: 'HOY TE TOCA',
      title: dailyBrief.solved ? 'Completa el pleno diario' : 'Desafío diario',
      detail: dailyBrief.headline,
      action: onDaily,
    };
  }
  if (matthiasAction === 'train') {
    const personal = items.find((item) => item.label === 'Puzzles personales');
    if (personal) {
      return {
        key: 'train-personal',
        eyebrow: 'HOY TE TOCA',
        title: 'Puzzles personales',
        detail: 'Matthias te ha visto flojear: refuerza esos puntos',
        action: personal.action,
      };
    }
  }
  return null;
}

export function buildDungeonMenu({ tools = [], extras = [], dailyBrief = null, matthiasAction = null, onDaily = null } = {}) {
  const items = [...tools, ...extras].map(toItem);
  const byLabel = new Map(items.map((item) => [item.label, item]));
  const used = new Set();

  const groups = DUNGEON_GROUPS.map((group) => {
    const groupItems = group.labels.map((label) => byLabel.get(label)).filter(Boolean);
    groupItems.forEach((item) => used.add(item.label));
    return { id: group.id, title: group.title, items: groupItems };
  }).filter((group) => group.items.length > 0);

  const links = DUNGEON_LINK_LABELS.map((label) => byLabel.get(label)).filter(Boolean);
  links.forEach((item) => used.add(item.label));

  const other = items.filter((item) => !used.has(item.label));
  if (other.length) groups.push({ id: 'more', title: 'Más', items: other });

  return { featured: dungeonFeatured({ dailyBrief, matthiasAction, items, onDaily }), groups, links };
}
