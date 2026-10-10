import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ChroniclesQuestLog, { chroniclesQuestLogEntries } from './ChroniclesQuestLog.jsx';

const state = {
  quests: {
    'names-in-wood': { id: 'names-in-wood', title: 'Los nombres del bosque', objective: 'Recupera las tres placas.', order: 3, status: 'active' },
    'banner-contract': { id: 'banner-contract', title: 'El estandarte perdido', objective: 'Encargo completado.', order: 2, status: 'completed' },
    'lost-king-prologue': { id: 'lost-king-prologue', title: 'El rey desaparecido', objective: 'Investiga la cripta.', order: 1, status: 'active' },
  },
};

describe('ChroniclesQuestLog', () => {
  it('lists the story first, then open side contracts, then finished ones', () => {
    expect(chroniclesQuestLogEntries(state).map((quest) => quest.id))
      .toEqual(['lost-king-prologue', 'names-in-wood', 'banner-contract']);
  });

  it('labels story and side quests and shows each current objective', () => {
    const html = renderToStaticMarkup(<ChroniclesQuestLog state={state} />);
    expect(html).toContain('Historia');
    expect(html).toContain('Encargo secundario');
    expect(html).toContain('Recupera las tres placas.');
    expect(html).toContain('data-chronicles-quest-status="completed"');
  });

  it('renders nothing before the first quest', () => {
    expect(renderToStaticMarkup(<ChroniclesQuestLog state={{ quests: {} }} />)).toBe('');
  });
});
