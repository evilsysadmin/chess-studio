import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PostGameFeedbackPrompt from './PostGameFeedbackPrompt.jsx';

describe('PostGameFeedbackPrompt', () => {
  it('empieza como un nudge compacto y no despliega la encuesta completa', () => {
    const html = renderToStaticMarkup(<PostGameFeedbackPrompt onDone={() => {}} />);

    expect(html).toContain('FEEDBACK OPCIONAL');
    expect(html).toContain('Responder');
    expect(html).toContain('Ahora no');
    expect(html).toContain('is-compact');
    expect(html).not.toContain('👍 Sí');
    expect(html).not.toContain('😐 Más o menos');
    expect(html).not.toContain('👎 No mucho');
    expect(html).not.toContain('Contar más');
  });
});
