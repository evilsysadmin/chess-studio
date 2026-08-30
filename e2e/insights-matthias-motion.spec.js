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

async function openInsights(page) {
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

test('Así juegas · el retrato pequeño de Matthias tiene movimiento visible propio', async ({ page }) => {
  await openInsights(page);

  const portrait = page.locator('[data-insights-matthias-motion="true"]');
  await expect(portrait).toBeVisible({ timeout: 8_000 });
  await expect(portrait).toHaveAttribute('data-insights-motion-profile', 'portrait-breathe');
  await expect(portrait).toHaveAttribute('data-insights-motion-state', 'active');
  await expect(portrait.locator('[data-matthias-layered-art="true"]')).toBeVisible();

  await expect.poll(() => portrait.evaluate((node) => node.getAnimations().length)).toBeGreaterThan(0);
  const motion = await portrait.evaluate(async (node) => {
    const animation = node.getAnimations()[0];
    animation.pause();
    const duration = Number(animation.effect?.getTiming?.().duration) || 5200;
    const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const center = () => {
      const rect = node.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, transform: getComputedStyle(node).transform };
    };
    animation.currentTime = 0;
    await settle();
    const rest = center();
    animation.currentTime = duration * .5;
    await settle();
    const active = center();
    return {
      dx: active.x - rest.x,
      dy: active.y - rest.y,
      transform: active.transform,
    };
  });

  expect(Math.hypot(motion.dx, motion.dy), 'el retrato debe desplazarse de forma perceptible').toBeGreaterThan(.8);
  expect(motion.transform).not.toBe('none');
});
