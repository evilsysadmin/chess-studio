import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InsightsOptionalPlans } from './InsightsScreen.jsx';

describe('InsightsOptionalPlans', () => {
  it('mantiene los planes secundarios bajo una divulgación explícita', () => {
    const html = renderToStaticMarkup(
      <InsightsOptionalPlans>
        <section data-plan="campaign">Campaña personal</section>
        <section data-plan="weekly">Objetivos semanales</section>
      </InsightsOptionalPlans>,
    );

    expect(html).toContain('<details class="friendly-disclosure insights-optional-plans">');
    expect(html).toContain('<summary>Más planes personales</summary>');
    expect(html).not.toContain('<details open');
    expect(html).toContain('Campaña personal');
    expect(html).toContain('Objetivos semanales');
  });
});
