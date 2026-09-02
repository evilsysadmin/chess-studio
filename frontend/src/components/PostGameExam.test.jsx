import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PostGameExam from './PostGameExam.jsx';

const history = [
  { san: 'e4', from: 'e2', to: 'e4' },
  { san: 'e5', from: 'e7', to: 'e5' },
  { san: 'Nf3', from: 'g1', to: 'f3' },
];

const report = {
  topMistakes: [{ index: 2, moveNumber: 2, played: 'Nf3', suggested: 'Bc4', loss: 180 }],
};

describe('PostGameExam', () => {
  it('ofrece el examen sin filtrar la jugada original ni la alternativa antes de empezar', () => {
    const html = renderToStaticMarkup(
      <PostGameExam history={history} humanColor="w" report={report} meta={{ gameId: 'g-exam' }} />,
    );

    expect(html).toContain('data-post-game-exam="ready"');
    expect(html).toContain('EXAMEN // SIN PISTAS');
    expect(html).toContain('Hacer examen');
    expect(html).not.toContain('Nf3');
    expect(html).not.toContain('Bc4');
    expect(html).not.toContain('post-game-exam-board');
  });

  it('no mete ruido en partidas sin una posición crítica entrenable', () => {
    const html = renderToStaticMarkup(
      <PostGameExam
        history={history}
        humanColor="w"
        report={{ topMistakes: [{ index: 2, played: 'Nf3', suggested: 'Bc4', loss: 40 }] }}
      />,
    );
    expect(html).toBe('');
  });
});
