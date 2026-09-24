import { describe, expect, it } from 'vitest';
import { buildDungeonMenu, dungeonFeatured } from './homeDungeonMenu.js';

const noop = () => {};
const TOOLS = [
  ['Puzzles personales', noop], ['Puzzles clásicos', noop], ['Aperturas', noop], ['Partida de práctica', noop],
  ['Combat Chess libre', noop], ['Espectador', noop], ['Mi progreso', noop], ['Experimentos geniales', noop],
];

describe('homeDungeonMenu', () => {
  it('groups the tools by intent and keeps every action exactly once', () => {
    const menu = buildDungeonMenu({ tools: TOOLS, extras: [['Pawn Slug', noop]] });
    expect(menu.groups.map((group) => group.id)).toEqual(['train', 'free', 'lab']);
    expect(menu.groups[0].items.map((item) => item.label)).toEqual(['Puzzles personales', 'Puzzles clásicos', 'Aperturas', 'Partida de práctica']);
    expect(menu.groups[2].items.map((item) => item.label)).toEqual(['Experimentos geniales', 'Pawn Slug']);
    expect(menu.links.map((item) => item.label)).toEqual(['Espectador', 'Mi progreso']);
    const all = [...menu.groups.flatMap((group) => group.items), ...menu.links].map((item) => item.label).sort();
    expect(all).toEqual([...TOOLS.map(([label]) => label), 'Pawn Slug'].sort());
  });

  it('keeps accessible names stable and never loses an unknown tool', () => {
    const menu = buildDungeonMenu({ tools: [...TOOLS, ['Herramienta futura', noop]], extras: [['Pawn Slug', noop]] });
    const pawn = menu.groups.flatMap((group) => group.items).find((item) => item.label === 'Pawn Slug');
    expect(pawn.ariaLabel).toBe('Abrir Pawn Slug directamente');
    const more = menu.groups.find((group) => group.id === 'more');
    expect(more.items.map((item) => item.label)).toEqual(['Herramienta futura']);
  });

  it('omits groups that have no tools instead of rendering empty cards', () => {
    const menu = buildDungeonMenu({ tools: [['Aperturas', noop]] });
    expect(menu.groups.map((group) => group.id)).toEqual(['train']);
    expect(menu.links).toEqual([]);
  });

  it('suggests the unfinished daily challenge first, with its real progress', () => {
    const onDaily = () => 'daily';
    const featured = dungeonFeatured({
      dailyBrief: { solved: false, full: false, headline: '3 días seguidos. Falta hoy.' },
      matthiasAction: 'train', items: [], onDaily,
    });
    expect(featured.title).toBe('Desafío diario');
    expect(featured.detail).toBe('3 días seguidos. Falta hoy.');
    expect(featured.action).toBe(onDaily);
    const partial = dungeonFeatured({ dailyBrief: { solved: true, full: false, headline: 'Hoy · 1/3' }, onDaily });
    expect(partial.title).toBe('Completa el pleno diario');
  });

  it('falls back to the personal-puzzle nudge, and to nothing when there is nothing honest to say', () => {
    const items = buildDungeonMenu({ tools: TOOLS }).groups[0].items;
    const nudge = dungeonFeatured({ dailyBrief: { full: true }, matthiasAction: 'train', items, onDaily: noop });
    expect(nudge.key).toBe('train-personal');
    expect(dungeonFeatured({ dailyBrief: { full: true }, matthiasAction: 'insights', items, onDaily: noop })).toBeNull();
    expect(dungeonFeatured({ matthiasAction: 'train', items: [] })).toBeNull();
  });
});
