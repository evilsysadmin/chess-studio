import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import InsightsCareerArchiveSection from './InsightsCareerArchiveSection.jsx';

const base = {
  career: { byTimeControl: {}, milestones: [] },
  run: null, themes: [{ id: 'classic' }], theme: 'classic', cemetery: [],
  onStartRun: () => {}, onContinueRun: () => {},
  onOpenRecord: () => {}, onMovie: () => {}, onThemeChange: () => {},
};

describe('Career archive extraction', () => {
  it('keeps archived runs, locked board themes and truthful empty cemetery', () => {
    const html = renderToStaticMarkup(<InsightsCareerArchiveSection {...base} />);
    expect(html).toContain('Modos de presión y campeonatos');
    expect(html).not.toContain('Rivalidad por ritmo');
    expect(html).toContain('Tableros desbloqueables');
    expect(html).toContain('Cementerio de partidas');
    expect(html).toContain('Vacío. Sospechosamente saludable');
    expect(html).toContain('disabled');
  });

  it('keeps board theme changes wired to the owning CareerScreen callback', () => {
    const onThemeChange = vi.fn();
    const root = InsightsCareerArchiveSection({
      ...base,
      themes: [{ id: 'classic' }, { id: 'midnight' }],
      onThemeChange,
    });
    const visit = (element) => React.isValidElement(element)
      ? [element, ...React.Children.toArray(element.props.children).flatMap(visit)]
      : [];
    const themeButton = visit(root).find((element) =>
      element.type === 'button' && element.props.children === 'Medianoche');
    expect(themeButton).toBeDefined();
    expect(themeButton.props.disabled).toBe(false);
    themeButton.props.onClick();
    expect(onThemeChange).toHaveBeenCalledOnce();
    expect(onThemeChange).toHaveBeenCalledWith('midnight');
  });

  it('routes special-run start and resume actions to the parent without owning session state', () => {
    const onStartRun = vi.fn();
    const onContinueRun = vi.fn();
    const savedRun = { active: true, mode: 'cup', difficulty: 55, completedStages: 2, points: 1 };
    const root = InsightsCareerArchiveSection({
      ...base, run: savedRun, onStartRun, onContinueRun,
    });
    const visit = (element) => React.isValidElement(element)
      ? [element, ...React.Children.toArray(element.props.children).flatMap(visit)]
      : [];
    const buttons = visit(root).filter((element) => element.type === 'button');
    const pressure = buttons.filter((element) => element.props.className === 'career-action danger');
    expect(pressure).toHaveLength(2);
    pressure[0].props.onClick();
    pressure[1].props.onClick();
    expect(onStartRun.mock.calls).toEqual([['streak'], ['boss']]);
    const resume = buttons.find((element) => element.props.className === 'career-action active');
    expect(resume).toBeDefined();
    resume.props.onClick();
    expect(onContinueRun).toHaveBeenCalledExactlyOnceWith(savedRun);
  });

  it('keeps real saved runs, records, modes and milestones visible', () => {
    const html = renderToStaticMarkup(<InsightsCareerArchiveSection {...base}
      career={{
        byTimeControl: { '3+2': { wins: 2, draws: 1, losses: 0, games: 3 } },
        milestones: [{ id: 'm1', type: 'contract-win', text: 'Victoria registrada', date: '2026-10-01T00:00:00Z' }],
      }}
      run={{ active: true, mode: 'cup', difficulty: 55, completedStages: 3, points: 2.5 }}
      cemetery={[{
        id: 'loss1', date: '2026-10-02T00:00:00Z', difficulty: 70,
        opening: 'Italiana', moves: ['e4', 'e5', 'Nf3', 'Nc6'],
      }]}
    />);
    expect(html).toContain('3+2 Blitz');
    expect(html).toContain('2V · 1T · 0D');
    expect(html).toContain('Continuar Copa');
    expect(html).toContain('3/8');
    expect(html).toContain('Italiana');
    expect(html).toContain('Revisar');
    expect(html).toContain('Película');
    expect(html).toContain('Victoria registrada');
  });
});
