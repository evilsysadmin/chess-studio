import { expect, test } from '@playwright/test';
import { buttonWithVisibleText } from './helpers.js';

const STAGING_URL = process.env.STAGING_URL || 'https://staging.chess-studio.shadowops.dpdns.org';
const STAGING_API_URL = process.env.STAGING_API_URL || 'https://api-staging.chess-studio.shadowops.dpdns.org/api';
const ACTIVE_GAME_SESSION_KEY = 'chess-study-active-game-session-v1';

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Falta ${name} para el smoke live de staging`);
  return value;
}

async function authenticateOrCreate(request, username, password, inviteCode) {
  const login = await request.post(`${STAGING_API_URL}/auth/login`, {
    data: { username, password },
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (login.ok()) return login.json();

  if (![401, 404].includes(login.status())) {
    throw new Error(`Login técnico staging devolvió HTTP ${login.status()}: ${await login.text()}`);
  }

  const register = await request.post(`${STAGING_API_URL}/auth/register`, {
    data: {
      username,
      password,
      email: `${username}@example.invalid`,
      invite_code: inviteCode,
    },
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (register.status() === 201) return register.json();

  if (register.status() === 409) {
    const retry = await request.post(`${STAGING_API_URL}/auth/login`, {
      data: { username, password },
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (retry.ok()) return retry.json();
  }

  throw new Error(`No se pudo preparar usuario técnico staging: register HTTP ${register.status()} · ${await register.text()}`);
}

async function seedRestoreProfile(request, token) {
  const response = await request.put(`${STAGING_API_URL}/profile`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      data: {
        'chess-study-home-guide-dismissed-v1': '1',
        'matthias.onboarded': '2',
        'chess-study-onboarding-insights-seen-v1': '1',
        'chess-study-reduced-motion': '1',
        'chess-study-ui-language': 'es',
        'chess-study-board-renderer': '3d',
      },
    },
  });
  expect(response.status(), `seed restore profile: ${await response.text()}`).toBe(200);
}

async function loginBrowser(page, username, password) {
  await page.goto(STAGING_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  await page.getByLabel('Usuario').fill(username);
  await page.getByLabel('Contraseña').fill(password);

  const browserLogin = page.waitForResponse((response) => (
    response.request().method() === 'POST'
    && response.url().startsWith(`${STAGING_API_URL}/auth/login`)
  ));
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  expect((await browserLogin).status()).toBe(200);
  await expect(page.getByRole('region', { name: 'Hoy en Chess Studio' })).toBeVisible({ timeout: 25_000 });
}

test('staging authority · F5 3D descarta snapshot viejo y rehidrata la partida desde API', async ({ page, request }) => {
  test.setTimeout(120_000);

  const username = requiredEnv('STAGING_E2E_USERNAME');
  const password = requiredEnv('STAGING_E2E_PASSWORD');
  const inviteCode = requiredEnv('STAGING_INVITE_CODE');
  const session = await authenticateOrCreate(request, username, password, inviteCode);
  expect(session.token).toBeTruthy();
  await seedRestoreProfile(request, session.token);

  let gameId = null;
  try {
    await loginBrowser(page, username, password);
    await buttonWithVisibleText(page, 'Partida rápida').click();

    const dialog = page.getByRole('dialog', { name: 'Configurar partida rápida' });
    await expect(dialog).toBeVisible();
    const settings = dialog.locator('details.quick-match-settings');
    if (!(await settings.evaluate((node) => node.open))) await settings.locator(':scope > summary').click();
    await dialog.getByRole('radio', { name: 'Blancas', exact: true }).click();

    const createGame = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === 'POST' && url.origin + url.pathname === `${STAGING_API_URL}/games`;
    }, { timeout: 60_000 });
    await dialog.getByRole('button', { name: 'Empezar partida', exact: true }).click();
    const createdResponse = await createGame;
    expect(createdResponse.status()).toBe(201);
    const created = await createdResponse.json();
    gameId = created.id || null;
    expect(gameId).toBeTruthy();

    const warRoom3d = page.locator('[data-board3d-war-room="true"]');
    const warRoomStatus = page.locator('.game-3d-warroom-status');
    await expect(warRoom3d).toBeVisible({ timeout: 30_000 });
    await expect(warRoomStatus).toBeVisible();

    // Esperamos a que el snapshot local inicial exista; después mutamos Mongo/API
    // por fuera del navegador para crear deliberadamente una divergencia real.
    await expect.poll(async () => page.evaluate((key) => {
      try {
        return JSON.parse(localStorage.getItem(key) || 'null')?.gameSnapshot?.fen || null;
      } catch {
        return null;
      }
    }, ACTIVE_GAME_SESSION_KEY), { timeout: 15_000 }).toBe(created.fen);

    const mutatedResponse = await request.post(`${STAGING_API_URL}/games/${encodeURIComponent(gameId)}/move`, {
      headers: {
        Authorization: `Bearer ${session.token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `staging-restore-authority-${Date.now()}`,
      },
      data: { from: 'e2', to: 'e4', promotion: null },
      timeout: 60_000,
    });
    expect(mutatedResponse.status(), `mutación externa staging: ${await mutatedResponse.text()}`).toBe(200);
    const mutated = await mutatedResponse.json();
    expect(mutated.fen).toBeTruthy();
    expect(mutated.fen).not.toBe(created.fen);
    expect(mutated.turn).toBe('w');

    const staleSnapshotFen = await page.evaluate((key) => {
      try {
        return JSON.parse(localStorage.getItem(key) || 'null')?.gameSnapshot?.fen || null;
      } catch {
        return null;
      }
    }, ACTIVE_GAME_SESSION_KEY);
    expect(staleSnapshotFen).toBe(created.fen);
    expect(staleSnapshotFen).not.toBe(mutated.fen);

    const restoreAfterReload = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === 'GET'
        && url.origin + url.pathname === `${STAGING_API_URL}/games/${gameId}`;
    }, { timeout: 60_000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    const restoredResponse = await restoreAfterReload;
    expect(restoredResponse.status()).toBe(200);
    const restored = await restoredResponse.json();
    expect(restored.fen).toBe(mutated.fen);
    expect(restored.turn).toBe(mutated.turn);

    await expect(warRoom3d).toBeVisible({ timeout: 30_000 });
    await expect(warRoomStatus).toBeVisible();
    await expect(warRoomStatus.locator('strong')).toHaveText(/Tu turno/i);
    await expect(page.locator('.error-boundary-screen')).toHaveCount(0);

    // 2D sólo actúa como sonda accesible del estado común: la posición visible
    // debe corresponder al FEN rehidratado, no al snapshot local deliberadamente viejo.
    const warRoomControls = page.locator('.game-3d-warroom-controls');
    await expect(warRoomControls).toBeVisible();
    await warRoomControls.getByRole('button', { name: '2D', exact: true }).click();
    await expect(page.locator('.square[aria-label^="Casilla e4, peón blanco"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.square[aria-label^="Casilla e2, vacía"]')).toBeVisible();
  } finally {
    if (gameId && session.token) {
      const cleanup = await request.delete(`${STAGING_API_URL}/games/${encodeURIComponent(gameId)}`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (![204, 404].includes(cleanup.status())) {
        throw new Error(`Cleanup restore smoke devolvió HTTP ${cleanup.status()}: ${await cleanup.text()}`);
      }
    }
  }
});
