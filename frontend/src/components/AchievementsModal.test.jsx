import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import AchievementsModal from './AchievementsModal.jsx';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('chess-study-achievements', JSON.stringify(['feat_mate', 'feat_pawn_queen']));
});

function render() {
  return renderToStaticMarkup(<AchievementsModal onClose={() => {}} />);
}

describe('AchievementsModal · Logros 2.0', () => {
  it('identifica logros antiguos como legado sin inventar su historia', () => {
    const html = render();
    expect(html).toContain('EXPEDIENTE DE HAZAÑAS');
    expect(html).toContain('Registro legado · el origen exacto no se reconstruye.');
  });

  it('muestra la vitrina y refleja favoritos ya persistidos', () => {
    localStorage.setItem('chess-study-achievement-favorites-v1', JSON.stringify(['feat_mate']));
    const html = render();
    expect(html).toContain('Tu vitrina · 1/3');
    expect(html).toContain('Quitar Cierre por derribo de favoritos');
    expect(html).toContain('aria-pressed="true"');
  });
});
