import { describe, expect, it } from 'vitest';
import { createChroniclesState } from '../chroniclesOfMatthias.js';
import { chroniclesTacticsUse } from '../chroniclesOfMatthiasTactics.js';
import { chroniclesGoldBalance } from './chroniclesContentRuntime.js';
import { chroniclesMapById, chroniclesMapIds } from './chroniclesMapCatalog.js';
import { chroniclesRegionHudLocation } from './chroniclesRegionHud.js';

const COLS = 'ABCDEF';
const codes = [...COLS].flatMap((col) => [1, 2, 3, 4, 5, 6].map((row) => `${col}${row}`));
const areaFor = (code) => chroniclesMapIds().map(chroniclesMapById)
  .find((map) => map.areaCode === code && map.regionKind === 'wilderness');
const use = (state, entry) => chroniclesTacticsUse({ ...state, x: entry.x, y: entry.y }, entry.id);

describe('Chronicles · Terra, areas A1–F6', () => {
  it('has one outdoor area for every square of the 6×6 grid, C3 and D3 included', () => {
    codes.forEach((code) => expect(areaFor(code), code).toBeTruthy());
    expect(areaFor('C3').id).toBe('banner-road-first-book');
    expect(areaFor('D3').id).toBe('rookwood-first-book');
  });

  it('joins each area to its neighbours both ways', () => {
    codes.forEach((code) => {
      const col = COLS.indexOf(code[0]);
      const row = Number(code[1]);
      const neighbours = [[col, row - 1], [col, row + 1], [col - 1, row], [col + 1, row]]
        .filter(([c, r]) => c >= 0 && c < 6 && r >= 1 && r <= 6)
        .map(([c, r]) => `${COLS[c]}${r}`);
      const map = areaFor(code);
      neighbours.forEach((other) => {
        const target = areaFor(other);
        const gate = map.exits.find((exit) => exit.action.effects.some((effect) => effect.mapId === target.id));
        expect(gate, `${code} → ${other}`).toBeTruthy();
        const landed = use(createChroniclesState(map.id), gate);
        expect(landed.mapId, `${code} → ${other}`).toBe(target.id);
        expect(landed.phase).not.toBe('escaped');
      });
    });
  });

  it('opens every town and dungeon from its area and back', () => {
    ['puerto-de-hollin', 'vado-de-sal', 'ascuafria', 'vigilia-del-norte', 'corte-de-bronce',
      'salinas-hundidas', 'cueva-contrabandistas', 'minas-de-escoria', 'tumulos-primer-pacto', 'cienaga-negra']
      .forEach((id) => {
        const inner = chroniclesMapById(id);
        const area = areaFor(inner.areaCode);
        const door = area.exits.find((exit) => exit.action.effects.some((effect) => effect.mapId === id));
        const inside = use(createChroniclesState(area.id), door);
        expect(inside.mapId, id).toBe(id);
        const out = use(inside, inner.exits[0]);
        expect(out.mapId, id).toBe(area.id);
        expect({ x: out.x, y: out.y }).toEqual({ x: door.x, y: door.y });
      });
  });

  it('names the area on the HUD plaque, MM3 style', () => {
    expect(chroniclesRegionHudLocation(areaFor('C4'))).toEqual({ kind: 'ÁREA C4', value: 'ENCRUCIJADA DEL AHORCADO' });
  });

  it('walks the whole main story from Vado de Sal to the Dama', () => {
    let state = { ...createChroniclesState('vado-de-sal'), swordhavenRouteReported: true };
    const talk = (mapId, id) => {
      state = chroniclesTacticsUse({ ...state, mapId, ...pick(mapId, id) }, id);
    };
    const pick = (mapId, id) => {
      const entry = chroniclesMapById(mapId).interactables.find((item) => item.id === id);
      return { x: entry.x, y: entry.y };
    };
    const steps = [
      ['vado-de-sal', 'nela', 'salinas_hundidas', /Salinas Hundidas \(C6\)/, /Puerto de Hollín \(A3\)/],
      ['puerto-de-hollin', 'ulric', 'cueva_contrabandistas', /Contrabandistas \(A4\)/, /Ascuafría \(F2\)/],
      ['ascuafria', 'hilde', 'minas_de_escoria', /Minas de Escoria \(E3\)/, /Vigilia del Norte \(C1\)/],
      ['vigilia-del-norte', 'osric', 'tumulos_primer_pacto', /Túmulos del Primer Pacto \(D1\)/, /Corte de Bronce \(D6\)/],
    ];
    let gold = 0;
    for (const [mapId, giver, boss, brief, next] of steps) {
      talk(mapId, `${giver}-brief`);
      expect(state.quests['lost-king'].objective).toMatch(brief);
      const early = chroniclesGoldBalance(state);
      talk(mapId, `${giver}-report`);
      expect(chroniclesGoldBalance(state), `${giver} pays only after the dungeon`).toBe(early);
      state = { ...state, [`${boss}BossDefeated`]: true };
      talk(mapId, `${giver}-report`);
      expect(chroniclesGoldBalance(state)).toBeGreaterThan(early);
      expect(state.quests['lost-king'].objective).toMatch(next);
      gold = chroniclesGoldBalance(state);
    }
    talk('corte-de-bronce', 'dama-audience');
    expect(state.lostKingFinalActOpen).toBe(true);
    expect(chroniclesGoldBalance(state)).toBe(gold + 100);
    expect(state.quests['lost-king'].objective).toMatch(/Templo Bajo la Corona \(F6\)/);
  });

  it('gives every town at least two side quests and every area something to find', () => {
    ['puerto-de-hollin', 'vado-de-sal', 'ascuafria', 'vigilia-del-norte', 'corte-de-bronce'].forEach((id) => {
      const starts = chroniclesMapById(id).interactables
        .flatMap((entry) => entry.action.effects)
        .filter((effect) => effect.type === 'start-quest');
      expect(starts.length, id).toBeGreaterThanOrEqual(2);
    });
    codes.filter((code) => !['C3', 'D3'].includes(code)).forEach((code) => {
      const map = areaFor(code);
      expect(map.treasures.length + map.interactables.length, code).toBeGreaterThan(0);
      expect(map.enemies.length, code).toBeGreaterThanOrEqual(2);
    });
  });
});
