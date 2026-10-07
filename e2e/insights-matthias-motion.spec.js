import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

const INSIGHTS_HISTORY = Array.from({ length: 4 }, (_, index) => ({
  id: `insights-motion-${index}`,
  sourceGameId: `insights-motion-${index}`,
  date: new Date(Date.UTC(2026, 8, 20 + index)).toISOString(),
  outcome: index % 2 ? 'loss' : 'win',
  mode: 'casual',
  difficulty: 10,
  humanColor: 'w',
  moves: ['e4', 'e5', 'Nf3', 'Nc6'],
  captured: [],
}));

async function openInsights(page, { hour = 17 } = {}) {
  await page.addInitScript((fixedHour) => {
    Math.random = () => 0;
    Date.prototype.getHours = () => fixedHour;
  }, hour);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await mockApi(page, {
    profileSeed: {
      'chess-study-game-history': JSON.stringify(INSIGHTS_HISTORY),
      'chess-study-reduced-motion': '0',
    },
  });
  await login(page);
  await expect.poll(() => page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('chess-study-game-history') || '[]').length; }
    catch { return 0; }
  })).toBe(INSIGHTS_HISTORY.length);
  await page.locator('.illustrated-home__matthias').click();
  await expect(page.getByRole('heading', { name: 'Así juegas', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Expediente', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Expediente', exact: true })).toBeVisible();
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

  // Congelamos el balanceo global del retrato: estas medidas demuestran que
  // las capas reales del puppet se mueven por separado incluso a 48×48.
  await portrait.evaluate((node) => node.getAnimations().forEach((animation) => animation.pause()));
  const headTravel = await maxAnimatedDisplacement(head);
  const eyeTravel = await maxAnimatedDisplacement(eyes);
  const armTravel = await maxAnimatedDisplacement(rightArm);

  expect(headTravel, 'Auditoría táctica: la cabeza debe acompañar la inspección').toBeGreaterThan(1);
  // 2.5 px en un retrato de 48 px es >5% de su anchura: claramente visible,
  // pero sin exigir un desplazamiento que rompa la máscara ocular.
  expect(eyeTravel, 'Auditoría táctica: los ojos deben escanear el dossier').toBeGreaterThan(2.5);
  expect(armTravel, 'Auditoría táctica: el brazo derecho debe moverse de forma perceptible').toBeGreaterThan(4);
});
