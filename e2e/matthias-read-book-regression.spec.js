import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

async function openReadingHome(page) {
  await page.addInitScript(() => {
    Math.random = () => 0;
    Date.prototype.getHours = () => 22;
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await mockApi(page);
  await login(page);

  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
  }

  const corner = page.getByRole('complementary', { name: 'Rincón de Matthias' });
  await expect(corner).toBeVisible();
  const dismiss = corner.getByRole('button', { name: 'Cerrar comentario de Matthias', exact: true });
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click();

  const rig = corner.locator('[data-matthias-layered-art="true"]');
  await expect(rig).toHaveAttribute('data-gesture', 'read-book');
  await expect.poll(async () => Number(await rig.getAttribute('data-gesture-count')) || 0, { timeout: 2_000 }).toBeGreaterThan(0);
  return rig;
}

async function sampleReadingEyes(eyes) {
  return eyes.evaluate(async (node) => {
    const animations = node.getAnimations();
    const reading = animations.find((animation) => animation.animationName === 'matthias-read-book-eye-scan');
    if (!reading) return null;

    animations.forEach((animation) => animation.pause());
    const timing = reading.effect?.getTiming?.() || {};
    const duration = Number(timing.duration) || 0;
    const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const measure = () => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        width: rect.width,
        height: rect.height,
        transform: style.transform,
        translate: style.translate,
      };
    };

    reading.currentTime = 0;
    await settle();
    const rest = measure();
    reading.currentTime = duration * .28;
    await settle();
    const active = measure();

    return {
      rest,
      active,
      dx: active.x - rest.x,
      dy: active.y - rest.y,
      heightRatio: rest.height ? active.height / rest.height : 1,
    };
  });
}

test('Leyendo estrategia · los ojos recorren la línea sin caer ni comprimirse', async ({ page }) => {
  const rig = await openReadingHome(page);
  const eyes = rig.locator('[data-matthias-art-part="eyes"]');
  const head = rig.locator('[data-matthias-art-part="head"]');
  const leftArm = rig.locator('[data-matthias-art-part="left-arm"]');
  const rightArm = rig.locator('[data-matthias-art-part="right-arm"]');
  const prop = rig.locator('[data-matthias-art-part="prop"]');

  await expect.poll(() => eyes.evaluate((node) => node.getAnimations().some((animation) => animation.animationName === 'matthias-read-book-eye-scan'))).toBe(true);
  expect(await head.evaluate((node) => node.getAnimations().length)).toBe(0);
  expect(await leftArm.evaluate((node) => node.getAnimations().length)).toBe(0);
  expect(await rightArm.evaluate((node) => node.getAnimations().length)).toBe(0);
  expect(await prop.evaluate((node) => node.getAnimations().length)).toBe(0);

  const motion = await sampleReadingEyes(eyes);
  expect(motion).not.toBeNull();
  expect(Math.abs(motion.dx), 'la lectura debe conservar un barrido horizontal perceptible').toBeGreaterThan(1);
  expect(Math.abs(motion.dy), 'los ojos no pueden deslizarse verticalmente por la cara').toBeLessThan(.25);
  expect(Math.abs(1 - motion.heightRatio), 'la capa de ojos no puede comprimirse para fingir un parpadeo').toBeLessThan(.01);
  expect(motion.active.transform, 'el transform WAAPI deformante debe quedar neutralizado').toBe('none');
});
