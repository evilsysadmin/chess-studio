import { chromium, expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { login, mockApi } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual';
const MIN_TOUCH_TARGET = 44;
const CAPTURES = [
  { label:'desktop-1440x900', width:1440, height:900, reducedMotion:'no-preference', forceCores:8, expectCastleReady:true },
  { label:'android-desktop-site-980x1740', width:980, height:1740, reducedMotion:'no-preference', forceCores:8, expectCastleReady:true },
  { label:'android-360x800', width:360, height:800, reducedMotion:'no-preference' },
  { label:'android-390x844', width:390, height:844, reducedMotion:'no-preference', forceCores:8, expectCastleReady:true },
  { label:'android-430x932', width:430, height:932, reducedMotion:'no-preference', forceCores:8, expectCastleReady:true },
  { label:'android-390x844-reduced-motion', width:390, height:844, reducedMotion:'reduce', forceCores:8, expectCastleReady:true },
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

async function settle(page, home, { expectCastleReady = false } = {}) {
  if (expectCastleReady) {
    await expect(home.locator('.illustrated-home__castle-3d.is-ready')).toBeVisible({ timeout:15_000 });
  }
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(250);
}

async function captureHealth(page, label) {
  return page.evaluate(({ captureLabel, minTouchTarget }) => {
    const root = document.documentElement;
    const body = document.body;
    const viewport = { width:window.innerWidth, height:window.innerHeight };
    const stageNode = document.querySelector('.illustrated-home__stage');
    const stageRect = stageNode?.getBoundingClientRect();
    const stage = stageRect ? {
      width:Number(stageRect.width.toFixed(1)),
      height:Number(stageRect.height.toFixed(1)),
      top:Number(stageRect.top.toFixed(1)),
      bottom:Number(stageRect.bottom.toFixed(1)),
      viewportFill:Number((Math.max(0, Math.min(stageRect.bottom, viewport.height) - Math.max(stageRect.top, 0)) / viewport.height).toFixed(3)),
      blankBelowPx:Number(Math.max(0, viewport.height - stageRect.bottom).toFixed(1)),
    } : null;
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
      hardwareConcurrency:navigator.hardwareConcurrency,
      reducedMotion:window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      castle3dReady:document.querySelector('.illustrated-home__castle-3d.is-ready') !== null,
      stage,
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

test('App · captura visual canónica desktop + Android normal/desktop-site', async () => {
  test.setTimeout(180_000);
  await mkdir(ARTIFACT_DIR, { recursive:true });

  const visualBrowser = await chromium.launch({
    headless:true,
    args:[
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });

  const captures = [];
  try {
    for (const capture of CAPTURES) {
      const context = await visualBrowser.newContext({ viewport:{ width:capture.width, height:capture.height } });
      if (capture.forceCores) {
        await context.addInitScript((cores) => {
          Object.defineProperty(navigator, 'hardwareConcurrency', {
            configurable:true,
            get:() => cores,
          });
        }, capture.forceCores);
      }
      const page = await context.newPage();
      try {
        const home = await openCanonicalHome(page, { reducedMotion:capture.reducedMotion });
        await settle(page, home, { expectCastleReady:capture.expectCastleReady });

        const health = await captureHealth(page, capture.label);
        captures.push({
          ...health,
          expectedReducedMotion:capture.reducedMotion === 'reduce',
          expectedCastleReady:capture.expectCastleReady === true,
        });
        await page.screenshot({
          path:`${ARTIFACT_DIR}/home-${capture.label}.png`,
          fullPage:false,
          animations:'disabled',
        });
      } finally {
        await context.close();
      }
    }
  } finally {
    await visualBrowser.close();
  }

  await writeFile(
    `${ARTIFACT_DIR}/visual-health.json`,
    `${JSON.stringify({ schema:4, minimumTouchTarget:MIN_TOUCH_TARGET, captures }, null, 2)}\n`,
    'utf8',
  );

  for (const capture of captures) {
    expect(capture.horizontalOverflow, `${capture.label}: horizontal overflow`).toBe(false);
    expect(capture.reducedMotion, `${capture.label}: reduced-motion media state`).toBe(capture.expectedReducedMotion);
    if (capture.expectedCastleReady) {
      expect(capture.castle3dReady, `${capture.label}: 3D canvas ready before screenshot`).toBe(true);
    }
  }
});
