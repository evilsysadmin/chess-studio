import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InsightsOptionalPlans } from './InsightsScreen.jsx';

describe('InsightsOptionalPlans', () => {
  it('no monta los planes secundarios mientras la divulgación está cerrada', () => {
    const html = renderToStaticMarkup(
      <InsightsOptionalPlans>
        <section data-plan="campaign">Campaña personal</section>
        <section data-plan="weekly">Objetivos semanales</section>
      </InsightsOptionalPlans>,
    );

    expect(html).toContain('<details class="friendly-disclosure insights-optional-plans">');
    expect(html).toContain('<summary>Más planes personales</summary>');
    expect(html).not.toContain('<details open');
    expect(html).not.toContain('Campaña personal');
    expect(html).not.toContain('Objetivos semanales');
  });

  it('monta los planes sólo cuando la divulgación está abierta', () => {
    const html = renderToStaticMarkup(
      <InsightsOptionalPlans defaultOpen>
        <section data-plan="campaign">Campaña personal</section>
        <section data-plan="weekly">Objetivos semanales</section>
      </InsightsOptionalPlans>,
    );

    expect(html).toContain('<details class="friendly-disclosure insights-optional-plans" open="">');
    expect(html).toContain('Campaña personal');
    expect(html).toContain('Objetivos semanales');
  });
});
