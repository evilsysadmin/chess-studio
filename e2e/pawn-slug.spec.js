import { expect, test } from '@playwright/test';
import { login, mockApi, openMoreGameModes } from './helpers.js';

async function dismissHomeOverlays(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    const dismiss = guide.getByRole('button', { name: 'Ahora no', exact: true });
    const close = guide.getByRole('button', { name: 'Cerrar guía rápida', exact: true });
    if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
    else if (await close.isVisible().catch(() => false)) await close.click();
  }

  const speech = page.getByRole('region', { name: 'Mensaje de Matthias', exact: true });
  if (await speech.isVisible().catch(() => false)) {
    const close = speech.getByRole('button', { name: 'Cerrar comentario de Matthias', exact: true });
    if (await close.isVisible().catch(() => false)) await close.click({ force: true });
  }
}

async function authenticate(page) {
  await mockApi(page);
  await login(page);
  await dismissHomeOverlays(page);
}

async function openExperiments(page) {
  const moreModes = await openMoreGameModes(page);
  const experiments = moreModes
    .getByRole('button')
    .filter({ hasText: 'Experimentos geniales' });
  await expect(experiments).toBeVisible();
  await experiments.click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
}

async function expectGodotHost(page) {
  const host = page.locator('.pawn-slug-godot-host');
  const frame = page.locator('iframe[title="Pawn Slug Godot"]');
  await expect(host).toBeVisible();
  await expect(frame).toBeVisible();
  await expect(page.locator('.pawn-slug-godot-host__header')).toHaveCount(0);
  await expect(page.locator('[data-pawn-slug-renderer="three"]')).toHaveCount(0);

  const [hostBox, viewport] = await Promise.all([
    host.boundingBox(),
    Promise.resolve(page.viewportSize()),
  ]);
  expect(hostBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(hostBox.x).toBeGreaterThanOrEqual(-1);
  expect(hostBox.y).toBeGreaterThanOrEqual(-1);
  expect(hostBox.width).toBeGreaterThanOrEqual(viewport.width - 1);
  expect(hostBox.height).toBeGreaterThanOrEqual(viewport.height - 1);
  expect(hostBox.x + hostBox.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(hostBox.y + hostBox.height).toBeLessThanOrEqual(viewport.height + 1);

  const overflow = await page.evaluate(() => ({
    html: getComputedStyle(document.documentElement).overflow,
    body: getComputedStyle(document.body).overflow,
  }));
  expect(overflow).toEqual({ html: 'hidden', body: 'hidden' });
}

async function requestGodotExit(page) {
  const handle = await page.locator('iframe[title="Pawn Slug Godot"]').elementHandle();
  expect(handle).not.toBeNull();
  const child = await handle.contentFrame();
  expect(child).not.toBeNull();
  await child.evaluate(() => {
    window.parent.postMessage({ source: 'pawn-slug-godot', type: 'exit' }, '*');
  });
}

test('Pawn Slug · el hub expone únicamente la puerta Godot y permite volver', async ({ page }) => {
  await authenticate(page);
  await openExperiments(page);

  const godotPortal = page.getByRole('button', { name: /PAWN SLUG GODOT/i });
  await expect(godotPortal).toBeVisible();
  await godotPortal.click();
  await expectGodotHost(page);

  await requestGodotExit(page);
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /PAWN SLUG GODOT/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Pawn Slug$/ })).toHaveCount(0);

  // Re-entry must create exactly one new canonical Godot host, never a zombie
  // iframe left behind by the previous experiment mount.
  await page.getByRole('button', { name: /PAWN SLUG GODOT/i }).click();
  await expectGodotHost(page);
  await expect(page.locator('iframe[title="Pawn Slug Godot"]')).toHaveCount(1);
});

test('Pawn Slug · el host Godot móvil no introduce overflow horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await authenticate(page);
  await openExperiments(page);
  await page.getByRole('button', { name: /PAWN SLUG GODOT/i }).click();
  await expectGodotHost(page);

  const frame = page.locator('iframe[title="Pawn Slug Godot"]');
  const box = await frame.boundingBox();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(391);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('Pawn Slug · landscape compacto mantiene el runtime dentro del viewport', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await authenticate(page);
  await openExperiments(page);
  await page.getByRole('button', { name: /PAWN SLUG GODOT/i }).click();
  await expectGodotHost(page);

  const shell = page.locator('.pawn-slug-godot-host__frame-shell');
  const frame = page.locator('iframe[title="Pawn Slug Godot"]');
  const [shellBox, frameBox] = await Promise.all([shell.boundingBox(), frame.boundingBox()]);
  expect(shellBox).not.toBeNull();
  expect(frameBox).not.toBeNull();
  expect(shellBox.x).toBeGreaterThanOrEqual(-1);
  expect(shellBox.x + shellBox.width).toBeLessThanOrEqual(845);
  expect(frameBox.x).toBeGreaterThanOrEqual(-1);
  expect(frameBox.x + frameBox.width).toBeLessThanOrEqual(845);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
