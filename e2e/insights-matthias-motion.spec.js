import { expect, test } from '@playwright/test';
import { buttonWithHeading, login, mockApi } from './helpers.js';

const PLAYED_GAME = {
  id: 'e2e-insights-motion-game',
  sourceGameId: 'e2e-insights-motion-game',
  date: '2026-08-30T20:00:00Z',
  mode: 'casual',
  outcome: 'loss',
  humanColor: 'w',
  initialFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  moves: [
    { san: 'e4', from: 'e2', to: 'e4' },
    { san: 'e5', from: 'e7', to: 'e5' },
  ],
};

async function openInsights(page, { hour = 17 } = {}) {
  await page.addInitScript((fixedHour) => {
    Math.random = () => 0;
    Date.prototype.getHours = () => fixedHour;
  }, hour);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await mockApi(page, {
    profileSeed: {
      'chess-study-game-history': JSON.stringify([PLAYED_GAME]),
      'chess-study-reduced-motion': '0',
    },
  });
  await login(page);
  await buttonWithHeading(page, 'Así juegas').click();
  await expect(page.getByRole('heading', { name: 'Así juegas', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Consulta diaria con Matthias' })).toBeVisible();
}

async function maxAnimatedDisplacement(locator) {
  return locator.evaluate(async (node) => {
    const animation = node.getAnimations()[0];
    if (!animation) return 0;
    animation.pause();
    const timing = animation.effect?.getTiming?.() || {};
    const duration = Number(timing.duration) || 3500;
    const delay = Number(timing.delay) || 0;
    const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const center = () => {
      const rect = node.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    };

    animation.currentTime = delay;
    await settle();
    const rest = center();
    let maximum = 0;
    for (const fraction of [.16, .28, .46, .62, .76]) {
      animation.currentTime = delay + duration * fraction;
      await settle();
      const sample = center();
      maximum = Math.max(maximum, Math.hypot(sample.x - rest.x, sample.y - rest.y));
    }
    return maximum;
  });
}

test('Así juegas · el retrato pequeño de Matthias tiene movimiento visible propio', async ({ page }) => {
  await openInsights(page);

  const portrait = page.locator('[data-insights-matthias-motion="true"]');
  await expect(portrait).toBeVisible({ timeout: 8_000 });
  await expect(portrait).toHaveAttribute('data-insights-motion-profile', 'portrait-breathe-v2');
  await expect(portrait).toHaveAttribute('data-insights-motion-state', 'active');
  await expect(portrait.locator('[data-matthias-layered-art="true"]')).toBeVisible();

  await expect.poll(() => portrait.evaluate((node) => node.getAnimations().length)).toBeGreaterThan(0);
  const motion = await portrait.evaluate(async (node) => {
    const animation = node.getAnimations()[0];
    animation.pause();
    const duration = Number(animation.effect?.getTiming?.().duration) || 4200;
    const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const center = () => {
      const rect = node.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, transform: getComputedStyle(node).transform };
    };
    animation.currentTime = 0;
    await settle();
    const rest = center();
    animation.currentTime = duration * .46;
    await settle();
    const active = center();
    return {
      dx: active.x - rest.x,
      dy: active.y - rest.y,
      transform: active.transform,
    };
  });

  expect(Math.hypot(motion.dx, motion.dy), 'el retrato debe desplazarse de forma claramente perceptible').toBeGreaterThan(1.5);
  expect(motion.transform).not.toBe('none');
});

test('Así juegas · Auditoría táctica mueve cabeza, ojos y brazo con el rig de dossier', async ({ page }) => {
  await openInsights(page, { hour: 17 });

  const portrait = page.locator('[data-insights-matthias-motion="true"]');
  const rig = portrait.locator('[data-matthias-layered-art="true"]');
  const head = rig.locator('[data-matthias-art-part="head"]');
  const eyes = rig.locator('[data-matthias-art-part="eyes"]');
  const rightArm = rig.locator('[data-matthias-art-part="right-arm"]');

  await expect(portrait).toBeVisible({ timeout: 8_000 });
  await expect(portrait).toHaveAttribute('data-insights-motion-scene', 'dossier');
  await expect(rig).toHaveAttribute('data-rig-scene', 'dossier');
  await expect(rig).toHaveAttribute('data-rig-family', 'reading');
  await expect(rig).toHaveAttribute('data-rig-activity', 'Auditoría táctica');
  await expect(rig).toHaveAttribute('data-gesture', 'audit-dossier');
  await expect(rig).toHaveAttribute('data-gesture-profile', 'expressive-v2');
  await expect.poll(
    async () => Number(await rig.getAttribute('data-gesture-count')) || 0,
    { timeout: 2_000, message: 'Auditoría táctica debe iniciar el gesto del puppet' },
  ).toBeGreaterThan(0);
  await expect(rig).toHaveAttribute('data-gesture-state', 'acting');
  await expect.poll(() => head.evaluate((node) => node.getAnimations().length)).toBeGreaterThan(0);
  await expect.poll(() => eyes.evaluate((node) => node.getAnimations().length)).toBeGreaterThan(0);
  await expect.poll(() => rightArm.evaluate((node) => node.getAnimations().length)).toBeGreaterThan(0);

  // Freeze the portrait-level breathing so these measurements prove that the
  // actual puppet layers move independently at the real 48×48 Insights size.
  await portrait.evaluate((node) => node.getAnimations().forEach((animation) => animation.pause()));
  const headTravel = await maxAnimatedDisplacement(head);
  const eyeTravel = await maxAnimatedDisplacement(eyes);
  const armTravel = await maxAnimatedDisplacement(rightArm);

  expect(headTravel, 'Auditoría táctica: la cabeza debe acompañar la inspección').toBeGreaterThan(1);
  expect(eyeTravel, 'Auditoría táctica: los ojos deben escanear el dossier').toBeGreaterThan(3);
  expect(armTravel, 'Auditoría táctica: el brazo derecho debe moverse de forma perceptible').toBeGreaterThan(4);
});
