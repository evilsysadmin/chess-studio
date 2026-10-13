import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

import { chroniclesActiveEnemies, createChroniclesState } from '../chroniclesOfMatthias.js';
import { chroniclesStartInitiativeCombat } from '../chronicles/chroniclesInitiative.js';
import ChroniclesCombatRoster, { chroniclesHealthBand } from './ChroniclesCombatRoster.jsx';
import ChroniclesMinimap from './ChroniclesMinimap.jsx';

describe('ChroniclesCombatRoster', () => {
  it('bands health like the MM3 gems: green, yellow, red', () => {
    expect(chroniclesHealthBand(10, 10)).toBe('healthy');
    expect(chroniclesHealthBand(4, 10)).toBe('hurt');
    expect(chroniclesHealthBand(2, 10)).toBe('critical');
    expect(chroniclesHealthBand(0, 0)).toBe('critical');
  });

  it('lists the engaged foes only while initiative runs', () => {
    const exploring = createChroniclesState('banner-road-first-book', null, { rules: 'mm3' });
    expect(renderToStaticMarkup(<ChroniclesCombatRoster state={exploring} />)).toBe('');

    const deserter = chroniclesActiveEnemies(exploring).find((enemy) => enemy.id === 'banner-road-deserter');
    const fighting = chroniclesStartInitiativeCombat(
      { ...exploring, x: 11, y: 6, direction: 0 },
      [deserter],
      { forceEnemyIds: [deserter.id] },
    );
    expect(fighting.initiative).toBeTruthy();
    const hurt = { ...fighting, [deserter.hpKey]: 1 };
    const html = renderToStaticMarkup(<ChroniclesCombatRoster state={hurt} />);
    expect(html).toContain('Combate');
    expect(html).toContain('<details>');
    expect(html).toContain('<summary>');
    expect(html).toContain('1 enemigo');
    expect(html).toContain(`Objetivo: ${deserter.name}`);
    expect(html).toContain('aria-label="Enemigos en combate"');

    expect(html).toContain(deserter.name);
    expect(html).toContain('data-band="critical"');
    expect(html).toContain('data-target="true"');
    // Both widgets remain mounted during initiative: combat does not take over
    // the map's slot or require the minimap to be hidden.
    const together = renderToStaticMarkup(
      <>
        <ChroniclesMinimap state={hurt} visitedCells={[]} />
        <ChroniclesCombatRoster state={hurt} />
      </>,
    );
    expect(together).toContain('data-chronicles-minimap="visible"');
    expect(together).toContain('class="chronicles-combat-roster"');

  });
});
