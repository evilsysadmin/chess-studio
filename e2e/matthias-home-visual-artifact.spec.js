import { chromium, expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { login, mockApi } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual';
const FIXED_LOCAL_TIME = { year:2026, monthIndex:8, day:14, hour:20, minute:0, second:0 };
const CAPTURES = [
  { label:'desktop-1440x900', width:1440, height:900, expectCopy:true },
  { label:'android-390x844', width:390, height:844, hasTouch:true, expectCopy:false },
];

async function freezeClockAtCampaignDinner(context) {
  await context.addInitScript((fixed) => {
    const OriginalDate = Date;
    const timestamp = new OriginalDate(
      fixed.year,
      fixed.monthIndex,
      fixed.day,
      fixed.hour,
      fixed.minute,
      fixed.second,
      0,
    ).getTime();

    class FixedDate extends OriginalDate {
      constructor(...args) {
        super(...(args.length ? args : [timestamp]));
      }

      static now() {
        return timestamp;
      }
    }

    Object.setPrototypeOf(FixedDate, OriginalDate);
    globalThis.Date = FixedDate;
  }, FIXED_LOCAL_TIME);
}

async function forceCanonicalHomeCapabilities(context) {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      configurable:true,
      get:() => 8,
    });
  });
}

async function expectLiveMatthiasCanvas(home) {
  const avatar = home.locator('[data-home-matthias-3d="ready"]');
  const canvas = avatar.locator('canvas');
  await expect(avatar).toHaveCount(1, { timeout:15_000 });
  await expect(avatar).toHaveAttribute('data-home-matthias-3d', 'ready', { timeout:15_000 });
  await expect(canvas).toHaveAttribute('data-matthias-identity', 'canonical-officer-avatar', { timeout:15_000 });
  return { avatar, canvas };
}

async function openDeterministicHome(page) {
  await page.emulateMedia({ reducedMotion:'no-preference' });
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
  await expect(home.locator('.illustrated-home__castle-3d.is-ready')).toBeVisible({ timeout:15_000 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(250);
  return home;
}

async function freezeForScreenshot(page) {
  await page.addStyleTag({
    content:`
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
      .illustrated-home__speech,
      .ambient-player,
      .toast,
      [role='alert'] {
        display: none !important;
      }
    `,
  });
  await page.evaluate(() => {
    window.requestAnimationFrame = () => 0;
  });
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

test('App visual artifact · Matthias Home deterministic full + crop', async () => {
  test.setTimeout(100_000);
  await mkdir(ARTIFACT_DIR, { recursive:true });

  const visualBrowser = await chromium.launch({
    headless:true,
    args:[
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });

  try {
    for (const capture of CAPTURES) {
      const context = await visualBrowser.newContext({
        viewport:{ width:capture.width, height:capture.height },
        hasTouch:capture.hasTouch === true,
      });
      await forceCanonicalHomeCapabilities(context);
      await freezeClockAtCampaignDinner(context);
      const page = await context.newPage();

      try {
        const home = await openDeterministicHome(page);
        const matthias = home.locator('.illustrated-home__matthias');
        const copy = matthias.locator('.illustrated-home__matthias-copy');

        await expect(matthias).toBeVisible();
        const { canvas } = await expectLiveMatthiasCanvas(home);
        await expect(canvas).toBeVisible({ timeout:15_000 });
        await expect(canvas).toHaveAttribute('data-matthias-identity', 'canonical-officer-avatar');
        await expect(matthias.locator('[data-matthias-layered-art="true"]')).toHaveCount(0);

        if (capture.expectCopy) {
          await expect(copy).toBeVisible();
          await expect(copy.locator('strong')).toHaveText('MATTHIAS');
          await expect(copy.locator('span')).toHaveText('Cena de campaña');
        } else {
          await expect(copy).toBeHidden();
        }

        await freezeForScreenshot(page);
        await captureViewportPng(
          context,
          page,
          `${ARTIFACT_DIR}/home-matthias-${capture.label}-full.png`,
        );
        await matthias.screenshot({
          path:`${ARTIFACT_DIR}/home-matthias-${capture.label}-crop.png`,
          animations:'disabled',
        });
      } finally {
        await context.close();
      }
    }
  } finally {
    await visualBrowser.close();
  }
});
