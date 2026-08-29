function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function printableDate(value) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Sin fecha' : date.toLocaleString('es-ES');
}

function incidentRows(report) {
  return (report?.topMistakes || [])
    .filter((move) => safeNumber(move?.loss) > 15)
    .map((move) => `
      <tr>
        <td>${escapeHtml(move.moveNumber ?? '—')}</td>
        <td><strong>${escapeHtml(move.played || '—')}</strong></td>
        <td>${escapeHtml(move.suggested || '—')}</td>
        <td>−${safeNumber(move.loss)} cp</td>
      </tr>`)
    .join('');
}

function keyMomentCards(keyMoments = []) {
  return keyMoments.map((item) => `
    <article class="moment">
      <span class="moment-icon">${escapeHtml(item.icon || '•')}</span>
      <div>
        <strong>${escapeHtml(item.label || 'Momento clave')}</strong>
        <small>Jugada ${escapeHtml(item.move?.moveNumber ?? '—')} · ${escapeHtml(item.move?.played || '—')}</small>
        <p>${escapeHtml(item.detail || '')}</p>
      </div>
    </article>`).join('');
}

export function buildGameAutopsyHtml({ report, meta = {}, humanColor = 'w', verdict = '', keyMoments = [] } = {}) {
  if (!report) return null;
  const accuracy = Math.max(0, Math.min(100, Math.round(100 - safeNumber(report.averageLoss))));
  const titleBits = [meta.opening, meta.mode].filter(Boolean).map(escapeHtml);
  const title = titleBits.length ? titleBits.join(' · ') : 'Partida de Chess Studio';
  const mistakes = incidentRows(report);
  const moments = keyMomentCards(keyMoments);
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Autopsia · ${title}</title>
<style>
:root{color-scheme:dark;--bg:#101317;--panel:#191e24;--line:#3a3426;--gold:#c6a45d;--text:#eee7d8;--muted:#a9a49a;--danger:#d88478}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 system-ui,-apple-system,sans-serif}.wrap{max-width:920px;margin:auto;padding:40px 20px 72px}header{border-bottom:1px solid var(--line);padding-bottom:22px;margin-bottom:24px}.eyebrow{font:700 11px/1.3 ui-monospace,monospace;letter-spacing:.18em;color:var(--gold);text-transform:uppercase}h1{font:700 clamp(30px,6vw,48px)/1.05 Georgia,serif;margin:8px 0}h2{font:700 24px/1.15 Georgia,serif}.muted,small{color:var(--muted)}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.metric,.moment,.verdict,table{background:var(--panel);border:1px solid #2c3239;border-radius:12px}.metric{padding:16px}.metric b{display:block;font-size:24px;color:var(--gold)}.moments{display:grid;gap:10px}.moment{display:flex;gap:12px;padding:14px}.moment-icon{font-size:22px}.moment p{margin:.25rem 0 0}.verdict{padding:18px;border-color:var(--line)}table{width:100%;border-collapse:collapse;overflow:hidden}th,td{padding:11px 12px;text-align:left;border-bottom:1px solid #2b3036}th{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--gold)}tr:last-child td{border-bottom:0}.footer{margin-top:28px;padding-top:16px;border-top:1px solid #292e34;color:var(--muted);font-size:12px}@media(max-width:650px){.grid{grid-template-columns:1fr}.wrap{padding:24px 12px 50px}table{font-size:13px}th,td{padding:8px}}
</style>
</head>
<body>
<main class="wrap">
<header>
  <span class="eyebrow">Chess Studio · Autopsia</span>
  <h1>${title}</h1>
  <p class="muted">${escapeHtml(printableDate(meta.date))} · Juegas con ${humanColor === 'b' ? 'negras' : 'blancas'}.</p>
</header>
<section class="grid" aria-label="Resumen">
  <div class="metric"><span>Precisión estimada</span><b>${accuracy}%</b></div>
  <div class="metric"><span>Error medio</span><b>−${safeNumber(report.averageLoss)} cp</b></div>
  <div class="metric"><span>Jugadas revisadas</span><b>${safeNumber(report.analyzedCount)}</b></div>
</section>
${moments ? `<section><h2>Momentos clave</h2><div class="moments">${moments}</div></section>` : ''}
<section>
  <h2>Incidentes</h2>
  ${mistakes ? `<table><thead><tr><th>Jugada</th><th>Jugaste</th><th>Preferible</th><th>Pérdida</th></tr></thead><tbody>${mistakes}</tbody></table>` : '<p class="muted">Sin incidentes tácticos relevantes en el análisis guardado.</p>'}
</section>
${verdict ? `<section><h2>Dictamen</h2><div class="verdict">${escapeHtml(verdict)}</div></section>` : ''}
<p class="footer">Informe generado localmente por Chess Studio a partir del análisis de esta partida. No contiene credenciales, tokens ni datos de cuenta.</p>
</main>
</body>
</html>`;
}

export function gameAutopsyFilename(meta = {}) {
  const date = new Date(meta.date || Date.now());
  const day = Number.isNaN(date.getTime()) ? 'partida' : date.toISOString().slice(0, 10);
  return `chess-studio-autopsia-${day}.html`;
}

export function downloadGameAutopsyHtml(payload, documentRef = globalThis.document, urlApi = globalThis.URL) {
  const html = buildGameAutopsyHtml(payload);
  if (!html || !documentRef || !urlApi?.createObjectURL) return false;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const href = urlApi.createObjectURL(blob);
  const link = documentRef.createElement('a');
  link.href = href;
  link.download = gameAutopsyFilename(payload?.meta);
  link.rel = 'noopener';
  documentRef.body.appendChild(link);
  link.click();
  link.remove();
  urlApi.revokeObjectURL(href);
  return true;
}
