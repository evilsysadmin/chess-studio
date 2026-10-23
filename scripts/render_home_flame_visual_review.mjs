import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HOME_FLAME_PNGS,
  HOME_FLAME_REPORT,
  validateHomeFlameEvidence,
} from './verify_home_flame_gpu_evidence.mjs';

// Read-only review surface: no browser/GPU spoofing, no automatic approval.
const escapeHtml = (value) => String(value ?? 'n/a').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const number = (value) => Number.isFinite(value) ? value.toFixed(3) : 'n/a';

export function renderHomeFlameVisualReview(report, validated) {
  if (validated?.checkedScreenshots !== 4 || validated.productionApproved !== false
      || validated.visualReviewRequired !== true || !Array.isArray(report?.visits)
      || report.visits.length !== 4 || !Array.isArray(report?.visualEvidence)
      || HOME_FLAME_PNGS.some((name, i) => report.visualEvidence[i] !== name)) {
    throw new Error('Review requires a previously validated four-visit flame evidence report');
  }
  const card = (visitIndex) => {
    const visit = report.visits[visitIndex];
    const name = HOME_FLAME_PNGS[visitIndex]; // Fixed local PNG names, never user URLs.
    const mode = visitIndex === 0 || visitIndex === 3 ? 'A · original' : 'B · single-pass';
    return [
      '<figure>',
      '<a href="' + name + '" title="Abrir PNG original de la visita ' + (visitIndex + 1) + '">',
      '<img src="' + name + '" alt="Visita ' + (visitIndex + 1) + ': ' + mode + '" loading="lazy"></a>',
      '<figcaption><strong>Visita ' + (visitIndex + 1) + ' · ' + mode + '</strong>',
      '<span>GPU: ' + escapeHtml(number(visit.gpuMedianMs)) + ' ms</span>',
      '<span>Draws: ' + escapeHtml(visit.drawPass?.mainCalls) + '</span>',
      '<span>Materiales single-pass: ' + escapeHtml(visit.singlePassMaterials) + '</span>',
      '</figcaption></figure>',
    ].join('');
  };
  const flags = Array.isArray(report.stability?.flags) ? report.stability.flags : [];
  return [
    '<!doctype html><html lang="es"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; img-src &#39;self&#39; file:; style-src &#39;unsafe-inline&#39;; base-uri &#39;none&#39;">',
    '<title>Home 3D · revisión visual A/B/B/A</title>',
    '<style>body{background:#121a22;color:#edf1f5;font:16px system-ui,sans-serif;margin:0;padding:24px}',
    'main{max-width:1520px;margin:auto}h1{font-size:1.6rem}h2{font-size:1.2rem}',
    '.meta{color:#cbd5df;line-height:1.7;overflow-wrap:anywhere}',
    '.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}',
    'figure{margin:0;background:#202d39;border:1px solid #526174;border-radius:8px;overflow:hidden}',
    'figure img{width:100%;height:auto;display:block;object-fit:contain}',
    'figcaption{padding:12px;display:flex;gap:10px;flex-wrap:wrap}',
    'figcaption strong{flex-basis:100%}.warning{border-left:4px solid #e7b15f;padding:8px 14px;background:#302c27}',
    'section{margin:24px 0}@media(max-width:760px){.pair{grid-template-columns:1fr}body{padding:10px}}',
    '</style></head><body><main>',
    '<h1>Home 3D · inspección visual de llamas A/B/B/A</h1>',
    '<p class="warning"><strong>NO APROBADO PARA PRODUCCIÓN.</strong> Informe e imágenes validados solo en integridad local.',
    ' Revisar manualmente alpha, siluetas, parpadeo y diferencias entre originales y single-pass.',
    ' Este HTML no demuestra por sí solo el origen físico de la GPU.</p>',
    '<p class="meta">SHA: <code>' + escapeHtml(report.revision) + '</code>',
    ' · GPU: ' + escapeHtml(report.visits[0].vendor) + ' · Ambiente: ' + escapeHtml(report.benchmarkAmbient),
    ' · Veredicto técnico: ' + escapeHtml(report.interpretation?.verdict),
    ' · Diferencia GPU: ' + escapeHtml(number(report.gpuDifferenceMs)) + ' ms',
    ' · Draws ahorrados: ' + escapeHtml(report.drawEvidence?.savedMainDrawCalls),
    ' · Flags de estabilidad: ' + escapeHtml(flags.length ? flags.join(', ') : 'ninguno'),
    '</p>',
    '<p>Orden cronológico de captura: <strong>A1 → B1 → B2 → A2</strong>.',
    ' Las parejas se colocan juntas para comparar con el mismo ambiente.</p>',
    '<section><h2>Pareja 1 · original A1 frente a single-pass B1</h2><div class="pair">',
    card(0), card(1), '</div></section>',
    '<section><h2>Pareja 2 · original A2 (visita 4) frente a single-pass B2 (visita 3)</h2><div class="pair">',
    card(3), card(2), '</div></section>',
    '<p class="warning">Antes de decidir sobre #5883: repetir la prueba física si hay drift,',
    ' contrastar los cuatro PNG originales y compartirlos para revisión visual.</p>',
    '</main></body></html>\n',
  ].join('');
}

export function writeHomeFlameVisualReview(directory = '.artifacts/home-gpu-benchmark') {
  const root = resolve(directory);
  const report = JSON.parse(readFileSync(join(root, HOME_FLAME_REPORT), 'utf8'));
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const result = validateHomeFlameEvidence(report, (name) => readFileSync(join(root, name)), revision);
  const dest = join(root, 'home-flame-abba-visual-review.html');
  writeFileSync(dest, renderHomeFlameVisualReview(report, result), 'utf8');
  return dest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const output = writeHomeFlameVisualReview(process.argv[2]);
    console.log('Revisión visual local: ' + output);
    console.log('No sustituye revisión manual ni prueba origen físico de GPU.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
