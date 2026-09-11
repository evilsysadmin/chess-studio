import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { login, mockApi } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual';
const VIEWPORTS = [
  { label:'desktop-1440x900', width:1440, height:900 },
  { label:'mobile-390x844', width:390, height:844 },
];

async function openCanonicalHome(page) {
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
    },
  });
  await login(page);
  const home = page.getByRole('region', { name:'Modos principales' });
  await expect(home).toBeVisible();
  await expect(home.locator('.illustrated-home__stage')).toBeVisible();
  return home;
}

async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(200);
}

async function captureHealth(page, label) {
  return page.evaluate((captureLabel) => {
    const root = document.documentElement;
    const body = document.body;
    const visibleElements = [...document.querySelectorAll('button, a, [role="button"]')]
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      });
    const outOfViewport = visibleElements
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          text:(node.getAttribute('aria-label') || node.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
          left:Number(rect.left.toFixed(1)),
          right:Number(rect.right.toFixed(1)),
          top:Number(rect.top.toFixed(1)),
          bottom:Number(rect.bottom.toFixed(1)),
        };
      })
      .filter((rect) => rect.right < 0 || rect.left > window.innerWidth || rect.bottom < 0 || rect.top > window.innerHeight)
      .slice(0, 20);

    return {
      label:captureLabel,
      viewport:{ width:window.innerWidth, height:window.innerHeight, dpr:window.devicePixelRatio },
      document:{
        clientWidth:root.clientWidth,
        scrollWidth:root.scrollWidth,
        clientHeight:root.clientHeight,
        scrollHeight:root.scrollHeight,
        bodyScrollWidth:body?.scrollWidth || 0,
      },
      horizontalOverflow:root.scrollWidth > root.clientWidth + 1,
      offscreenInteractiveCount:outOfViewport.length,
      offscreenInteractive:outOfViewport,
    };
  }, label);
}

test('App · captura visual canónica desktop + Android sin overflow horizontal', async ({ page }) => {
  test.setTimeout(90_000);
  await mkdir(ARTIFACT_DIR, { recursive:true });

  const captures = [];
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width:viewport.width, height:viewport.height });
    await openCanonicalHome(page);
    await settle(page);

    const health = await captureHealth(page, viewport.label);
    captures.push(health);
    await page.screenshot({
      path:`${ARTIFACT_DIR}/home-${viewport.label}.png`,
      fullPage:false,
      animations:'disabled',
    });

    expect(health.horizontalOverflow).toBe(false);
    await page.context().clearCookies();
    await page.goto('about:blank');
  }

  await writeFile(
    `${ARTIFACT_DIR}/visual-health.json`,
    `${JSON.stringify({ schema:1, captures }, null, 2)}\n`,
    'utf8',
  );
});
