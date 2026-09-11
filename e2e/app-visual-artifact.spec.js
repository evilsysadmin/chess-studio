import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { login, mockApi } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual';
const CAPTURES = [
  { label:'desktop-1440x900', width:1440, height:900, reducedMotion:'no-preference' },
  { label:'android-360x800', width:360, height:800, reducedMotion:'no-preference' },
  { label:'android-390x844', width:390, height:844, reducedMotion:'no-preference' },
  { label:'android-430x932', width:430, height:932, reducedMotion:'no-preference' },
  { label:'android-390x844-reduced-motion', width:390, height:844, reducedMotion:'reduce' },
];

async function openCanonicalHome(page, { reducedMotion = 'no-preference' } = {}) {
  await page.emulateMedia({ reducedMotion });
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
      reducedMotion:window.matchMedia('(prefers-reduced-motion: reduce)').matches,
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

test('App · captura visual canónica desktop + matriz Android sin overflow horizontal', async ({ page }) => {
  test.setTimeout(120_000);
  await mkdir(ARTIFACT_DIR, { recursive:true });

  const captures = [];
  for (const capture of CAPTURES) {
    await page.setViewportSize({ width:capture.width, height:capture.height });
    await openCanonicalHome(page, { reducedMotion:capture.reducedMotion });
    await settle(page);

    const health = await captureHealth(page, capture.label);
    captures.push(health);
    await page.screenshot({
      path:`${ARTIFACT_DIR}/home-${capture.label}.png`,
      fullPage:false,
      animations:'disabled',
    });

    expect(health.horizontalOverflow).toBe(false);
    expect(health.reducedMotion).toBe(capture.reducedMotion === 'reduce');
    await page.context().clearCookies();
    await page.goto('about:blank');
  }

  await writeFile(
    `${ARTIFACT_DIR}/visual-health.json`,
    `${JSON.stringify({ schema:2, captures }, null, 2)}\n`,
    'utf8',
  );
});
