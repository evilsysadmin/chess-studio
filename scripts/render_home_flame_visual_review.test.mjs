import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HOME_FLAME_PNGS } from './verify_home_flame_gpu_evidence.mjs';
import { renderHomeFlameVisualReview } from './render_home_flame_visual_review.mjs';

const valid = {
  checkedScreenshots: 4,
  productionApproved: false,
  visualReviewRequired: true,
};
const report = () => ({
  revision: 'a'.repeat(40),
  benchmarkAmbient: 'night',
  visualEvidence: [...HOME_FLAME_PNGS],
  visits: ['normal', 'single', 'single', 'normal'].map((mode, i) => ({
    gpuMedianMs: 8.5 + i * .15,
    vendor: 'intel',
    drawPass: { mainCalls: 220 - i },
    singlePassMaterials: mode === 'single' ? 12 : 0,
  })),
  drawEvidence: { savedMainDrawCalls: 8 },
  gpuDifferenceMs: 0.22,
  stability: { flags: [] },
  interpretation: { verdict: 'candidate-repeat-and-review-pngs' },
});

describe('Home flame physical visual review HTML (offline only)', () => {
  it('pairs two physical A/B comparisons while preserving original visit provenance', () => {
    const html = renderHomeFlameVisualReview(report(), valid);
    for (const image of HOME_FLAME_PNGS) {
      assert.ok(html.includes('src="' + image + '"'));
      assert.ok(html.includes('href="' + image + '"'));
    }
    assert.ok(html.indexOf('Visita 1 · A') < html.indexOf('Visita 2 · B'));
    assert.ok(html.indexOf('Visita 4 · A') < html.indexOf('Visita 3 · B'));
    assert.match(html, /A1 → B1 → B2 → A2/);
    assert.match(html, /NO APROBADO PARA PRODUCCIÓN/);
    assert.match(html, /no demuestra por sí solo el origen físico/);
  });
  it('escapes report strings, does not load remote images or scripts', () => {
    const input = report();
    input.interpretation.verdict = '<img onerror="alert(1)">&"';
    input.revision = '<script>alert(1)</script>';
    const html = renderHomeFlameVisualReview(input, valid);
    assert.ok(html.includes('&lt;img onerror=&quot;alert(1)&quot;&gt;'));
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('<img onerror='));
    assert.match(html, /default-src &#39;none&#39;/);
    assert.ok(!html.includes('https://'));
  });
  it('rejects incomplete, unvalidated or renamed visual evidence', () => {
    assert.throws(() => renderHomeFlameVisualReview(report(), null), /previously validated/);
    assert.throws(() => renderHomeFlameVisualReview(report(), { ...valid, productionApproved: true }), /previously validated/);
    const missing = report();
    missing.visits.pop();
    assert.throws(() => renderHomeFlameVisualReview(missing, valid), /previously validated/);
    const renamed = report();
    renamed.visualEvidence[1] = 'different.png';
    assert.throws(() => renderHomeFlameVisualReview(renamed, valid), /previously validated/);
  });
});
