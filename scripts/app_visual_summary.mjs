#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const WAR_ROOM_PROFILES = [
  ['Android portrait 390×844', 'war-room-android-390x844'],
  ['Android landscape 844×390', 'war-room-android-landscape-844x390'],
  ['Desktop 1440×900', 'war-room-desktop-1440x900'],
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function renderVisualSummary(artifactDir) {
  const lines = ['## App · visual health'];
  const reportPath = path.join(artifactDir, 'visual-health.json');

  if (!fs.existsSync(reportPath)) {
    lines.push('', '_No se generó `visual-health.json`; revisa el paso de captura._');
  } else {
    const report = readJson(reportPath);
    const captures = Array.isArray(report.captures) ? report.captures : [];
    lines.push(
      '',
      '| Captura | Overflow X | Recortados | Targets <44 px | Reduced motion |',
      '| --- | ---: | ---: | ---: | --- |',
    );
    for (const capture of captures) {
      lines.push(`| ${capture.label} | ${capture.horizontalOverflow ? 'sí' : 'no'} | ${capture.clippedInteractiveCount ?? '—'} | ${capture.smallTouchTargetCount ?? '—'} | ${capture.reducedMotion ? 'sí' : 'no'} |`);
    }

    const mobile = captures.filter((capture) => capture.viewport?.width <= 600);
    const worst = mobile.reduce((current, capture) => (
      !current || (capture.smallTouchTargetCount || 0) > (current.smallTouchTargetCount || 0) ? capture : current
    ), null);
    if (worst?.smallTouchTargets?.length) {
      lines.push('', `**Peores targets en ${worst.label}:**`);
      for (const target of worst.smallTouchTargets.slice(0, 6)) {
        const label = target.text || target.tag || 'sin etiqueta';
        lines.push(`- ${label}: ${target.width}×${target.height}px`);
      }
    }
  }

  lines.push(
    '',
    '### War Room · canonical views',
    '',
    '| Captura | Overflow X | Escena/ancho | Escena visible/alto | Puntero | Artefacto |',
    '| --- | ---: | ---: | ---: | --- | --- |',
  );

  for (const [label, slug] of WAR_ROOM_PROFILES) {
    const healthPath = path.join(artifactDir, `${slug}-health.json`);
    if (!fs.existsSync(healthPath)) {
      lines.push(`| ${label} | — | — | — | no generado | \`${slug}.png\` |`);
      continue;
    }
    const { capture = {} } = readJson(healthPath);
    const sceneWidth = capture.boardWidthFill != null ? `${Math.round(capture.boardWidthFill * 100)}%` : '—';
    const sceneHeight = capture.boardViewportFill != null ? `${Math.round(capture.boardViewportFill * 100)}%` : '—';
    const pointer = capture.coarsePointer ? 'coarse' : 'fine';
    lines.push(`| ${label} | ${capture.horizontalOverflowPx ?? '—'} px | ${sceneWidth} | ${sceneHeight} | ${pointer} | \`${slug}.png\` |`);
  }

  const hansPath = path.join(artifactDir, 'war-room-hans-desktop-1440x900-health.json');
  if (fs.existsSync(hansPath)) {
    const hans = readJson(hansPath);
    lines.push(
      '',
      '### Hans · visual canary',
      '',
      `Estado: **${hans.screen || '—'}** · NDC ${Number.isFinite(hans.ndcX) ? hans.ndcX.toFixed(3) : '—'}, ${Number.isFinite(hans.ndcY) ? hans.ndcY.toFixed(3) : '—'} · \`war-room-hans-desktop-1440x900.png\``,
    );
  }

  const portraitPath = path.join(artifactDir, 'war-room-android-390x844-health.json');
  if (fs.existsSync(portraitPath)) {
    const { capture = {} } = readJson(portraitPath);
    const quick = capture.quickActions || {};
    lines.push(
      '',
      `Portrait · HUD Matthias ${capture.hud?.height ?? '—'} px · `
        + `Focus ${quick.focus ? `${quick.focus.width}×${quick.focus.height}px` : '—'} · `
        + `Rendirse ${quick.abandon ? `${quick.abandon.width}×${quick.abandon.height}px` : '—'} · `
        + `Menú ${quick.overflow ? `${quick.overflow.width}×${quick.overflow.height}px` : '—'}`,
    );
  }

  return `${lines.join('\n')}\n`;
}

function selfTest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-visual-summary-'));
  try {
    const missing = renderVisualSummary(root);
    if (!missing.includes('No se generó `visual-health.json`')) throw new Error('missing-report contract failed');
    if (!missing.includes('War Room · canonical views')) throw new Error('canonical-view fallback missing');

    fs.writeFileSync(path.join(root, 'visual-health.json'), JSON.stringify({
      captures: [
        {
          label: 'mobile',
          horizontalOverflow: false,
          clippedInteractiveCount: 1,
          smallTouchTargetCount: 2,
          reducedMotion: true,
          viewport: { width: 390, height: 844 },
          smallTouchTargets: [
            { text: 'Focus', width: 32, height: 40 },
            { tag: 'button', width: 38, height: 39 },
          ],
        },
      ],
    }), 'utf8');
    fs.writeFileSync(path.join(root, 'war-room-android-390x844-health.json'), JSON.stringify({
      capture: {
        horizontalOverflowPx: 0,
        boardWidthFill: 0.91,
        boardViewportFill: 0.73,
        coarsePointer: true,
        hud: { height: 44 },
        quickActions: {
          focus: { width: 44, height: 44 },
          abandon: { width: 48, height: 44 },
          overflow: { width: 44, height: 44 },
        },
      },
    }), 'utf8');
    fs.writeFileSync(path.join(root, 'war-room-hans-desktop-1440x900-health.json'), JSON.stringify({
      screen: 'onscreen',
      ndcX: 0.1254,
      ndcY: -0.3336,
    }), 'utf8');

    const report = renderVisualSummary(root);
    for (const expected of [
      '| mobile | no | 1 | 2 | sí |',
      '**Peores targets en mobile:**',
      '- Focus: 32×40px',
      '| Android portrait 390×844 | 0 px | 91% | 73% | coarse |',
      'Estado: **onscreen** · NDC 0.125, -0.334',
      'Portrait · HUD Matthias 44 px · Focus 44×44px · Rendirse 48×44px · Menú 44×44px',
    ]) {
      if (!report.includes(expected)) throw new Error(`summary contract missing: ${expected}`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  process.stdout.write('app visual summary self-test: OK\n');
}

function parseArgs(argv) {
  const args = { artifactDir: '.artifacts/app-visual', summaryPath: process.env.GITHUB_STEP_SUMMARY || '', selfTest: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--self-test') args.selfTest = true;
    else if (value === '--artifact-dir') args.artifactDir = argv[++index];
    else if (value === '--summary') args.summaryPath = argv[++index];
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!args.artifactDir) throw new Error('--artifact-dir requires a value');
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) {
    selfTest();
    return;
  }
  const output = renderVisualSummary(path.resolve(args.artifactDir));
  if (args.summaryPath) fs.appendFileSync(args.summaryPath, output);
  else process.stdout.write(output);
}

main();
