import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { login, mockApi } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual';
const MIN_TOUCH_TARGET = 44;
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
  return page.evaluate(({ captureLabel, minTouchTarget }) => {
    const root = document.documentElement;
    const body = document.body;
    const viewport = { width:window.innerWidth, height:window.innerHeight };
    const interactive = [...document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])')]
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      })
      .map((node) => {
        const rect = node.getBoundingClientRect();
        const text = (node.getAttribute('aria-label') || node.textContent || node.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 80);
        const intersectsViewport = rect.right > 0 && rect.left < viewport.width && rect.bottom > 0 && rect.top < viewport.height;
        return {
          text,
          tag:node.tagName.toLowerCase(),
          width:Number(rect.width.toFixed(1)),
          height:Number(rect.height.toFixed(1)),
          left:Number(rect.left.toFixed(1)),
          right:Number(rect.right.toFixed(1)),
          top:Number(rect.top.toFixed(1)),
          bottom:Number(rect.bottom.toFixed(1)),
          intersectsViewport,
        };
      });
    const outOfViewport = interactive
      .filter((rect) => !rect.intersectsViewport)
      .slice(0, 20);
    const clippedInteractive = interactive
      .filter((rect) => rect.intersectsViewport && (
        rect.left < -1
        || rect.right > viewport.width + 1
        || rect.top < -1
        || rect.bottom > viewport.height + 1
      ))
      .slice(0, 30);
    const smallTouchTargets = viewport.width <= 600
      ? interactive
        .filter((rect) => rect.intersectsViewport && (rect.width < minTouchTarget || rect.height < minTouchTarget))
        .sort((a, b) => Math.min(a.width, a.height) - Math.min(b.width, b.height))
        .slice(0, 30)
      : [];

    return {
      label:captureLabel,
      viewport:{ ...viewport, dpr:window.devicePixelRatio },
      reducedMotion:window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      document:{
        clientWidth:root.clientWidth,
        scrollWidth:root.scrollWidth,
        clientHeight:root.clientHeight,
        scrollHeight:root.scrollHeight,
        bodyScrollWidth:body?.scrollWidth || 0,
      },
      horizontalOverflow:root.scrollWidth > root.clientWidth + 1,
      interactiveCount:interactive.length,
      offscreenInteractiveCount:outOfViewport.length,
      offscreenInteractive:outOfViewport,
      clippedInteractiveCount:clippedInteractive.length,
      clippedInteractive,
      minimumTouchTarget:minTouchTarget,
      smallTouchTargetCount:smallTouchTargets.length,
      smallTouchTargets,
    };
  }, { captureLabel:label, minTouchTarget:MIN_TOUCH_TARGET });
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
    captures.push({ ...health, expectedReducedMotion:capture.reducedMotion === 'reduce' });
    await page.screenshot({
      path:`${ARTIFACT_DIR}/home-${capture.label}.png`,
      fullPage:false,
      animations:'disabled',
    });

    await page.context().clearCookies();
    await page.goto('about:blank');
  }

  await writeFile(
    `${ARTIFACT_DIR}/visual-health.json`,
    `${JSON.stringify({ schema:3, minimumTouchTarget:MIN_TOUCH_TARGET, captures }, null, 2)}\n`,
    'utf8',
  );

  for (const capture of captures) {
    expect(capture.horizontalOverflow, `${capture.label}: horizontal overflow`).toBe(false);
    expect(capture.reducedMotion, `${capture.label}: reduced-motion media state`).toBe(capture.expectedReducedMotion);
  }
});
