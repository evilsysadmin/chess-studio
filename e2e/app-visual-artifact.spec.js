import { chromium, expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { login, mockApi } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual';
const MIN_TOUCH_TARGET = 44;
const CAPTURES = [
  { label:'desktop-1440x900', width:1440, height:900, reducedMotion:'no-preference', forceCores:8, expectCastleReady:true, expectBlenderRuntime:true },
  { label:'android-desktop-site-980x1740', width:980, height:1740, reducedMotion:'no-preference', forceCores:8, hasTouch:true, expectCastleReady:true, expectBlenderRuntime:true, minStageViewportFill:.74 },
  { label:'android-desktop-site-980x1740-quiet', width:980, height:1740, reducedMotion:'no-preference', forceCores:8, hasTouch:true, expectCastleReady:true, expectBlenderRuntime:true, minStageViewportFill:.74, dismissMatthias:true },
  { label:'android-desktop-site-landscape-980x430', width:980, height:430, reducedMotion:'no-preference', forceCores:8, hasTouch:true, expectCastleReady:true, expectBlenderRuntime:true, minStageViewportFill:.98, minStageVisibleWidthFill:.98, minVisibleDestinations:6, expectMatthiasVisible:true },
  { label:'android-360x800', width:360, height:800, reducedMotion:'no-preference' },
  { label:'android-390x844', width:390, height:844, reducedMotion:'no-preference', forceCores:8, expectCastleReady:true, expectBlenderRuntime:true },
  { label:'android-430x932', width:430, height:932, reducedMotion:'no-preference', forceCores:8, expectCastleReady:true, expectBlenderRuntime:true },
  { label:'android-390x844-reduced-motion', width:390, height:844, reducedMotion:'reduce', forceCores:8, expectCastleReady:true, expectBlenderRuntime:true },
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

async function freezeVisualFrame(page) {
  await page.addStyleTag({
    content:'*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }',
  });
  await page.evaluate(() => {
    window.requestAnimationFrame = () => 0;
  });
  // Deja consumir el único RAF que pudiera estar ya encolado; al intentar
  // programar el siguiente encontrará el stub y la escena quedará congelada.
  await page.waitForTimeout(80);
}

async function captureViewportPng(context, page, path) {
  const session = await context.newCDPSession(page);
  try {
    const { data } = await session.send('Page.captureScreenshot', {
      format:'png',
      fromSurface:true,
      captureBeyondViewport:false,
    });
    await writeFile(path, Buffer.from(data, 'base64'));
  } finally {
    await session.detach();
  }
}

async function captureHealth(page, label) {
  return page.evaluate(({ captureLabel, minTouchTarget }) => {
    const root = document.documentElement;
    const body = document.body;
    const viewport = { width:window.innerWidth, height:window.innerHeight };
    const stageNode = document.querySelector('.illustrated-home__stage');
    const stageRect = stageNode?.getBoundingClientRect();
    const stageVisibleWidth = stageRect
      ? Math.max(0, Math.min(stageRect.right, viewport.width) - Math.max(stageRect.left, 0))
      : 0;
    const stage = stageRect ? {
      width:Number(stageRect.width.toFixed(1)),
      height:Number(stageRect.height.toFixed(1)),
      left:Number(stageRect.left.toFixed(1)),
      right:Number(stageRect.right.toFixed(1)),
      top:Number(stageRect.top.toFixed(1)),
      bottom:Number(stageRect.bottom.toFixed(1)),
      viewportFill:Number((Math.max(0, Math.min(stageRect.bottom, viewport.height) - Math.max(stageRect.top, 0)) / viewport.height).toFixed(3)),
      visibleWidthFill:Number((stageVisibleWidth / viewport.width).toFixed(3)),
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
    const outOfViewport = interactive.filter((rect) => !rect.intersectsViewport).slice(0, 20);
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
    const visibleDestinationCount = [...document.querySelectorAll('.illustrated-home__destination')]
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return rect.width > 0
          && rect.height > 0
          && style.visibility !== 'hidden'
          && style.display !== 'none'
          && rect.right > 0
          && rect.left < viewport.width
          && rect.bottom > 0
          && rect.top < viewport.height;
      }).length;
    const castle3d = document.querySelector('.illustrated-home__castle-3d.is-ready');
    const castle3dDiagnostics = castle3d ? {
      compositor:castle3d.getAttribute('data-home-castle-compositor'),
      blenderRuntime:castle3d.getAttribute('data-home-blender-runtime'),
      lod:castle3d.getAttribute('data-home-castle-lod'),
      camera:castle3d.getAttribute('data-home-blender-camera'),
    } : null;
    const matthiasNode = document.querySelector('.illustrated-home__matthias');
    const matthiasRect = matthiasNode?.getBoundingClientRect();
    const matthiasStyle = matthiasNode ? getComputedStyle(matthiasNode) : null;
    const matthiasVisible = Boolean(
      matthiasRect
      && matthiasStyle
      && matthiasStyle.visibility !== 'hidden'
      && matthiasStyle.display !== 'none'
      && matthiasRect.width > 0
      && matthiasRect.height > 0
      && matthiasRect.right > 0
      && matthiasRect.left < viewport.width
      && matthiasRect.bottom > 0
      && matthiasRect.top < viewport.height
    );

    return {
      label:captureLabel,
      viewport:{ ...viewport, dpr:window.devicePixelRatio },
      hardwareConcurrency:navigator.hardwareConcurrency,
      touchPoints:navigator.maxTouchPoints,
      coarsePointer:window.matchMedia('(pointer: coarse)').matches,
      reducedMotion:window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      castle3dReady:castle3d !== null,
      castle3dDiagnostics,
      stage,
      visibleDestinationCount,
      matthiasVisible,
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
  test.setTimeout(210_000);
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
      const context = await visualBrowser.newContext({
        viewport:{ width:capture.width, height:capture.height },
        hasTouch:capture.hasTouch === true,
      });
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
        if (capture.dismissMatthias) {
          const speech = home.locator('.illustrated-home__speech');
          if (await speech.count()) {
            await speech.getByRole('button', { name:'Cerrar comentario de Matthias' }).click();
            await expect(speech).toHaveCount(0);
            await page.waitForTimeout(80);
          }
        }

        const health = await captureHealth(page, capture.label);
        captures.push({
          ...health,
          expectedReducedMotion:capture.reducedMotion === 'reduce',
          expectedCastleReady:capture.expectCastleReady === true,
          expectedBlenderRuntime:capture.expectBlenderRuntime === true,
          expectedCoarsePointer:capture.hasTouch === true,
          minStageViewportFill:capture.minStageViewportFill ?? null,
          minStageVisibleWidthFill:capture.minStageVisibleWidthFill ?? null,
          minVisibleDestinations:capture.minVisibleDestinations ?? null,
          expectMatthiasVisible:capture.expectMatthiasVisible === true,
        });
        await freezeVisualFrame(page);
        await captureViewportPng(
          context,
          page,
          `${ARTIFACT_DIR}/home-${capture.label}.png`,
        );
      } finally {
        await context.close();
      }
    }
  } finally {
    await visualBrowser.close();
  }

  await writeFile(
    `${ARTIFACT_DIR}/visual-health.json`,
    `${JSON.stringify({ schema:9, minimumTouchTarget:MIN_TOUCH_TARGET, captures }, null, 2)}\n`,
    'utf8',
  );

  for (const capture of captures) {
    expect(capture.horizontalOverflow, `${capture.label}: horizontal overflow`).toBe(false);
    expect(capture.clippedInteractiveCount, `${capture.label}: clipped interactive controls`).toBe(0);
    expect(capture.reducedMotion, `${capture.label}: reduced-motion media state`).toBe(capture.expectedReducedMotion);
    if (capture.expectedCastleReady) {
      expect(capture.castle3dReady, `${capture.label}: 3D canvas ready before screenshot`).toBe(true);
    }
    if (capture.expectedBlenderRuntime) {
      expect(capture.castle3dDiagnostics?.compositor, `${capture.label}: Blender compositor`).toBe('blender-runtime');
      expect(capture.castle3dDiagnostics?.blenderRuntime, `${capture.label}: Blender runtime ready`).toBe('ready');
    }
    if (capture.expectedCoarsePointer) {
      expect(capture.coarsePointer, `${capture.label}: coarse pointer emulation`).toBe(true);
      expect(capture.touchPoints, `${capture.label}: touch points`).toBeGreaterThan(0);
    }
    if (capture.minStageViewportFill !== null) {
      expect(capture.stage?.viewportFill, `${capture.label}: Great Hall viewport fill`).toBeGreaterThanOrEqual(capture.minStageViewportFill);
    }
    if (capture.minStageVisibleWidthFill !== null) {
      expect(capture.stage?.visibleWidthFill, `${capture.label}: Great Hall visible width fill`).toBeGreaterThanOrEqual(capture.minStageVisibleWidthFill);
    }
    if (capture.minVisibleDestinations !== null) {
      expect(capture.visibleDestinationCount, `${capture.label}: visible diegetic destinations`).toBeGreaterThanOrEqual(capture.minVisibleDestinations);
    }
    if (capture.expectMatthiasVisible) {
      expect(capture.matthiasVisible, `${capture.label}: Matthias remains inside the visible hall`).toBe(true);
    }
  }
});
