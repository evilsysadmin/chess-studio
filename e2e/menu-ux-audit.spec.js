import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { buttonWithVisibleText, login, mockApi, openMoreGameModes } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/menu-ux-audit';
const CAPTURES = [
  { label: 'desktop-1440x900', width: 1440, height: 900, hasTouch: false },
  { label: 'mobile-390x844', width: 390, height: 844, hasTouch: true },
];

const COVERAGE = [
  { id: 'home', status: 'captured' },
  { id: 'quick-match', status: 'captured' },
  { id: 'more-modes', status: 'captured' },
  { id: 'settings', status: 'pending' },
  { id: 'profile', status: 'pending' },
  { id: 'pvp-lobby', status: 'pending' },
  { id: 'war-room-overflow', status: 'pending' },
  { id: 'post-game', status: 'pending' },
  { id: 'training', status: 'pending' },
  { id: 'tournament', status: 'pending' },
  { id: 'combat', status: 'pending' },
  { id: 'experiments', status: 'pending' },
];

async function freezeMotion(page) {
  await page.addStyleTag({
    content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}',
  });
}

async function measure(page, surface) {
  return page.evaluate((surfaceId) => {
    const visible = (node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const label = (node) => String(
      node.innerText || node.getAttribute('aria-label') || node.getAttribute('title') || ''
    ).replace(/\s+/g, ' ').trim().slice(0, 140);
    const actionNodes = [...document.querySelectorAll(
      'button,a[href],[role="button"],[role="menuitem"],[role="menuitemradio"],[role="tab"],summary,input,select'
    )].filter(visible);
    const actions = actionNodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        label: label(node),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        top: Math.round(rect.top),
        left: Math.round(rect.left),
      };
    });
    const compactTargets = actions.filter((row) => row.width < 40 || row.height < 40);
    const headings = [...document.querySelectorAll('h1,h2,h3,[role="heading"]')]
      .filter(visible)
      .map(label)
      .filter(Boolean);
    const dialogs = [...document.querySelectorAll('[role="dialog"]')]
      .filter(visible)
      .map(label)
      .filter(Boolean);

    return {
      surface: surfaceId,
      viewport: { width: innerWidth, height: innerHeight },
      document: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      },
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      verticalScreens: Number((document.documentElement.scrollHeight / Math.max(innerHeight, 1)).toFixed(2)),
      headings: headings.slice(0, 20),
      dialogs: dialogs.slice(0, 10),
      visibleActions: actions.length,
      compactTargets: compactTargets.slice(0, 30),
      dashboardCandidate: actions.length >= 14 || headings.length >= 5,
      denseCandidate: actions.length >= 10 && innerWidth <= 430,
    };
  }, surface);
}

async function capture(page, label, report) {
  await freezeMotion(page);
  await page.waitForTimeout(80);
  const metrics = await measure(page, label);
  await page.screenshot({
    path: \`\${ARTIFACT_DIR}/\${label}.png\`,
    fullPage: false,
    animations: 'disabled',
    caret: 'hide',
  });
  report.surfaces.push(metrics);
}

async function openBase(page) {
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
      'chess-study-onboarding-insights-seen-v1': '1',
      'chess-study-reduced-motion': '1',
    },
  });
  await login(page);
  await expect(page.getByRole('region', { name: 'Modos principales', exact: true })).toBeVisible();
  const speech = page.getByRole('region', { name: 'Mensaje de Matthias', exact: true });
  if (await speech.isVisible().catch(() => false)) {
    const close = speech.getByRole('button', { name: 'Cerrar comentario de Matthias', exact: true });
    if (await close.isVisible().catch(() => false)) await close.click({ force: true });
  }
}

for (const profile of CAPTURES) {
  test(\`Menu UX audit · \${profile.label}\`, async ({ browser }) => {
    test.setTimeout(90_000);
    await mkdir(ARTIFACT_DIR, { recursive: true });

    const context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height },
      hasTouch: profile.hasTouch,
      isMobile: profile.hasTouch,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const report = {
      schema: 1,
      profile: profile.label,
      coverage: COVERAGE,
      surfaces: [],
    };

    try {
      await openBase(page);
      await capture(page, \`\${profile.label}__home\`, report);

      await buttonWithVisibleText(page, 'Partida rápida').click();
      const quickMatch = page.getByRole('dialog', { name: 'Configurar partida rápida' });
      await expect(quickMatch).toBeVisible();
      await capture(page, \`\${profile.label}__quick-match\`, report);
      await page.keyboard.press('Escape');
      await expect(quickMatch).toBeHidden();

      await openMoreGameModes(page);
      await expect(page.locator('#illustrated-home-tools')).toBeVisible();
      await capture(page, \`\${profile.label}__more-modes\`, report);

      for (const surface of report.surfaces) {
        expect(surface.horizontalOverflow, \`\${surface.surface}: horizontal overflow\`).toBe(false);
      }
    } finally {
      await writeFile(
        \`\${ARTIFACT_DIR}/menu-ux-\${profile.label}.json\`,
        \`\${JSON.stringify(report, null, 2)}\\n\`,
        'utf8',
      );
      await context.close();
    }
  });
}
