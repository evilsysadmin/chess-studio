import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import InsightsCareerSummarySection from './InsightsCareerSummarySection.jsx';

vi.mock('./CareerChronicle.jsx', () => ({ default: () => null }));
vi.mock('./CareerHallOfFame.jsx', () => ({ default: () => null }));
vi.mock('./RivalryDossier.jsx', () => ({ default: () => null }));
vi.mock('./MechanicTutorialHelp.jsx', () => ({ default: () => null }));

const props = {
  personalSeasons: [], history: [], hall: {}, rivalry: {},
  rec: { bestStreakRun: 0 }, survivalRun: null, conflictingRun: false,
  run: null,
  weekly: { current: { games: 0, winPct: 0, accuracy: null }, winDelta: null, accuracyDelta: null },
  topIncident: null, personal: [], daily: { streak: 0, bestStreak: 0 },
  nemesis: { opening: null, tactic: null }, nemesisPersonalCount: 0,
  onOpenRecord: () => {}, onMovie: () => {}, onStartRun: () => {},
  onContinueRun: () => {}, onOpenPuzzles: () => {}, onPlayFromHere: () => {},
};

describe('Career summary extraction', () => {
  it('shows weekly facts and no invented nemesis when no history exists', () => {
    const html = renderToStaticMarkup(<InsightsCareerSummarySection {...props} />);
    expect(html).toContain('Supervivencia');
    expect(html).toContain('Informe semanal');
    expect(html).toContain('Entrenamiento personalizado');
    expect(html).toContain('Todavía no hay una apertura');
    expect(html).toContain('0 posiciones reales');
    expect(html).toContain('—');
    expect(html).not.toContain('Entrenar desde mi posición');
  });

  it('retains a real active streak and blocks a competing run', () => {
    const active = { active: true, mode: 'streak', wins: 2, difficulty: 44 };
    const html = renderToStaticMarkup(<InsightsCareerSummarySection {...props} run={active} survivalRun={active} />);
    expect(html).toContain('Continuar supervivencia');
    expect(html).toContain('44');
    const conflict = renderToStaticMarkup(<InsightsCareerSummarySection {...props}
      run={{ active: true, mode: 'cup' }} conflictingRun />);
    expect(conflict).toContain('disabled');
    expect(conflict).toContain('Copa');
  });

  it('dispatches puzzle training and survival actions to the owning screen', () => {
    const onOpenPuzzles = vi.fn();
    const onStartRun = vi.fn();
    const onContinueRun = vi.fn();
    const root = InsightsCareerSummarySection({
      ...props, onOpenPuzzles, onStartRun, onContinueRun,
    });
    const visit = (element) => React.isValidElement(element)
      ? [element, ...React.Children.toArray(element.props.children).flatMap(visit)]
      : [];
    const buttons = visit(root).filter((element) => element.type === 'button');
    const training = buttons.filter((element) => element.props.className === 'career-action');
    expect(training).toHaveLength(4);
    training.forEach((button) => button.props.onClick());
    expect(onOpenPuzzles.mock.calls).toEqual([
      ['personal', false], ['personal', true], ['daily', false], ['curated', true],
    ]);
    const survival = buttons.find((element) => element.props.className === 'primary-btn');
    survival.props.onClick();
    expect(onStartRun.mock.calls).toEqual([['streak']]);

    const saved = { active: true, mode: 'streak', wins: 2, difficulty: 44 };
    const resumed = InsightsCareerSummarySection({
      ...props, survivalRun: saved, run: saved, onContinueRun,
    });
    const resume = visit(resumed).find((element) =>
      element.type === 'button' && element.props.className === 'primary-btn');
    resume.props.onClick();
    expect(onContinueRun.mock.calls).toEqual([[saved]]);
  });

  it('shows measured weekly changes instead of inventing trends', () => {
    const html = renderToStaticMarkup(<InsightsCareerSummarySection {...props}
      weekly={{ current: { games: 7, winPct: 57, accuracy: 70 }, winDelta: 12, accuracyDelta: 5 }}
      topIncident={{ count: 3, label: 'Horquilla' }} />);
    expect(html).toContain('7');
    expect(html).toContain('57%');
    expect(html).toContain('70%');
    expect(html).toContain('Horquilla');
    expect(html).toContain('Mejora clara');
  });
});
