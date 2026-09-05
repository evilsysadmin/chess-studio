import { devices, expect, test } from '@playwright/test';
import { buttonWithVisibleText, gameTurn, login, mockApi } from './helpers.js';

test.use({ ...devices['Pixel 5'] });

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const KING_MOVED_FEN = 'rnbq1bnr/ppppkppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQ - 1 2';

async function open3DFromAppearance(page) {
  const board3d = page.locator('[data-board3d-war-room="true"]');
  if (await board3d.isVisible().catch(() => false)) return;

  // Quick games default to 3D, but the lazy Three/WebGL mount may lag the rest
  // of the game chrome for a few seconds on CI/Android. Give the real War Room
  // a chance to appear before assuming we need the explicit renderer fallback.
  await board3d.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => null);
  if (await board3d.isVisible().catch(() => false)) return;

  const appearanceButton = page.getByRole('button', {
    name: /^(?:Apariencia|Cambiar apariencia y piezas del tablero)$/,
  });
  await expect(appearanceButton).toBeVisible({ timeout: 12_000 });
  await appearanceButton.click();
  const dialog = page.getByRole('dialog', { name: 'Ajustes' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: /3D$/ }).click();
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(board3d).toBeVisible({ timeout: 30_000 });
}

async function installKingMoveReply(page, calls) {
  await page.route('http://localhost:4000/api/games/*/move', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const url = new URL(route.request().url());
    const id = url.pathname.match(/\/games\/([^/]+)\/move$/)?.[1] || '1';
    const payload = route.request().postDataJSON?.() ?? {};
    calls.push(`${payload.from || '?'}-${payload.to || '?'}`);

    const humanMove = { from: 'e2', to: 'e4', san: 'e4', piece: 'p', captured: false, by: 'human' };
    const cpuMove = { from: 'e8', to: 'e7', san: 'Ke7', piece: 'k', captured: false, by: 'cpu' };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id,
        fen: KING_MOVED_FEN,
        turn: 'w',
        humanColor: 'w',
        difficulty: 50,
        status: 'playing',
        insufficientMatingMaterial: { w: false, b: false },
        isGameOver: false,
        history: [humanMove, cpuMove],
        lastMove: cpuMove,
        initialFen: START_FEN,
        ghostStyle: null,
      }),
    });
  });
}

test('War Room · Android mantiene a Matthias vivo con Three.js y fallback corporal', async ({ page }) => {
  test.setTimeout(75_000);
  await page.addInitScript(() => {
    // The regression is about compact rendering, not an OS accessibility
    // preference. Force motion allowed so a CI runner cannot hide the bug.
    localStorage.setItem('chess-study-reduced-motion', '0');
  });

  await mockApi(page);
  await login(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameTurn(page)).toBeVisible();
  await open3DFromAppearance(page);

  const board3d = page.locator('[data-board3d-war-room="true"]');
  const wrap = page.locator('.game-3d-matthias-portrait-wrap');
  const portrait = wrap.locator('.game-3d-matthias-portrait');
  const three = wrap.locator('[data-matthias-three-avatar="true"]');

  await expect(board3d).toBeVisible({ timeout: 30_000 });
  await expect(wrap).toBeVisible({ timeout: 30_000 });
  await expect(wrap).toHaveAttribute('data-matthias-motion-version', 'v4-android');
  await expect(wrap).toHaveAttribute('data-matthias-compact-motion', 'true');
  await expect(three).toHaveAttribute('data-three-motion', 'active');
  await expect(three).toHaveAttribute('data-three-motion-intensity', '1.35');

  // The 50–58 px command portrait must not pay desktop mesh/render cost.
  await expect(three).toHaveAttribute('data-three-render-tier', 'compact');
  await expect(three).toHaveAttribute('data-three-segments', '14x16');
  await expect(three).toHaveAttribute('data-three-max-fps', '30');

  // Primary path: the optional portrait Three.js context must actually paint
  // and keep advancing alongside the main War Room renderer on a Pixel profile.
  await expect(three).toHaveAttribute('data-three-ready', 'true', { timeout: 30_000 });
  await expect(three).toHaveAttribute('data-three-failed', 'false');
  const firstFrame = Number(await three.getAttribute('data-three-frame'));
  await expect.poll(async () => Number(await three.getAttribute('data-three-frame')), { timeout: 12_000 })
    .toBeGreaterThan(firstFrame + 5);

  // Fallback path: compact Matthias must still visibly breathe as one canonical
  // portrait even if a real Android GPU later refuses the optional WebGL context.
  await expect.poll(async () => portrait.evaluate((node) => getComputedStyle(node).animationName))
    .toContain('matthias-warroom-mobile-portrait-breathe');
  const transformA = await portrait.evaluate((node) => getComputedStyle(node).transform);
  await page.waitForTimeout(650);
  const transformB = await portrait.evaluate((node) => getComputedStyle(node).transform);
  expect(transformA).not.toBe('none');
  expect(transformB).not.toBe(transformA);
});

test('War Room · el bocadillo de Matthias sigue al rey si cambia de casilla', async ({ page }) => {
  test.setTimeout(75_000);
  const moveCalls = [];

  // Opening banter is intentionally sparse in production (40% + anti-repeat).
  // This regression needs the bubble to exist so it can test ownership/motion,
  // therefore only this isolated browser context makes its two random rolls
  // deterministic. Production probability remains untouched.
  await page.addInitScript(() => {
    sessionStorage.setItem('chess-study-matthias-3d-opening-banter-v1', JSON.stringify({
      seenGameIds: [],
      lastEligibleStartShowed: false,
    }));
    Math.random = () => 0.1;
  });

  await mockApi(page);
  await installKingMoveReply(page, moveCalls);
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameTurn(page)).toBeVisible();
  await open3DFromAppearance(page);

  const board3d = page.locator('[data-board3d-war-room="true"]');
  const canvas = page.locator('.board3d-main-canvas');
  await expect(board3d).toBeVisible({ timeout: 30_000 });
  await expect(canvas).toBeVisible({ timeout: 30_000 });

  const bubble = page.getByRole('status', { name: 'Bravuconada de Matthias al iniciar la partida' });
  await expect(bubble).toBeVisible({ timeout: 10_000 });
  await expect(bubble).toHaveAttribute('data-matthias-square', 'e8');
  const before = await bubble.evaluate((element) => ({ left: element.style.left, top: element.style.top }));
  expect(before.left).not.toBe('');
  expect(before.top).not.toBe('');

  // The banter is intentionally short-lived (4.7 s). Exercise the actual move
  // immediately: this contract is specifically "if Matthias moves while he is
  // speaking, the speech bubble follows the king", not a keyboard timing test.
  await canvas.focus();
  await canvas.press('ArrowUp');
  await canvas.press('Enter');
  await canvas.press('ArrowUp');
  await canvas.press('ArrowUp');
  await canvas.press('Enter');

  await expect.poll(() => moveCalls.length, { timeout: 3_000 }).toBe(1);
  await expect(bubble).toHaveAttribute('data-matthias-square', 'e7', { timeout: 3_000 });
  const after = await bubble.evaluate((element) => ({ left: element.style.left, top: element.style.top }));
  expect(after.top).not.toBe(before.top);
});
