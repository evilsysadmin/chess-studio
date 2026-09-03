import { expect, test } from '@playwright/test';
import { buttonWithHeading, buttonWithVisibleText, clickBoardMove, gameStatus } from './helpers.js';

const STAGING_URL = process.env.STAGING_URL || 'https://staging.chess-studio.shadowops.dpdns.org';
const STAGING_API_URL = process.env.STAGING_API_URL || 'https://api-staging.chess-studio.shadowops.dpdns.org/api';
const EXPECTED_SHA = process.env.DEPLOY_SHA || '';

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Falta ${name} para el smoke live de staging`);
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function frontendEntryAssets(html) {
  const assets = new Set();
  const pattern = /(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/gi;
  for (const match of String(html || '').matchAll(pattern)) {
    try {
      assets.add(new URL(match[1], STAGING_URL).toString());
    } catch {
      // Una referencia inválida se reflejará como ausencia de assets válidos y
      // hará fallar el gate con un mensaje más útil que la excepción de URL.
    }
  }
  return [...assets];
}

function assetMimeIsValid(url, contentType) {
  const pathname = new URL(url).pathname.toLowerCase();
  const mime = String(contentType || '').toLowerCase();
  if (pathname.endsWith('.css')) return mime.includes('text/css');
  if (pathname.endsWith('.js')) return mime.includes('javascript');
  return false;
}

async function waitForFrontendAssetPropagation(request) {
  let lastProblem = 'sin respuesta del custom domain';

  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      const rootUrl = new URL(STAGING_URL);
      rootUrl.searchParams.set('staging-asset-gate', `${Date.now()}-${attempt}`);
      const root = await request.get(rootUrl.toString(), {
        headers: {
          'Cache-Control': 'no-cache, no-store',
          Pragma: 'no-cache',
        },
      });

      if (!root.ok()) {
        lastProblem = `raíz HTTP ${root.status()}`;
      } else {
        const html = await root.text();
        const assets = frontendEntryAssets(html);
        if (!assets.length) {
          lastProblem = 'index.html no contiene JS/CSS versionados';
        } else {
          const failures = [];
          for (const assetUrl of assets) {
            const cacheBusted = new URL(assetUrl);
            cacheBusted.searchParams.set('staging-asset-gate', `${Date.now()}-${attempt}`);
            const response = await request.get(cacheBusted.toString(), {
              headers: {
                'Cache-Control': 'no-cache, no-store',
                Pragma: 'no-cache',
              },
            });
            const contentType = response.headers()['content-type'] || '';
            if (!response.ok() || !assetMimeIsValid(assetUrl, contentType)) {
              failures.push(`${new URL(assetUrl).pathname}: HTTP ${response.status()} · ${contentType || 'sin content-type'}`);
            }
          }

          if (!failures.length) return;
          lastProblem = failures.join(' | ');
        }
      }
    } catch (error) {
      lastProblem = error instanceof Error ? error.message : String(error);
    }

    if (attempt < 20) await sleep(2_000);
  }

  throw new Error(`Pages staging no propagó index + assets ejecutables tras 40s: ${lastProblem}`);
}

async function assertRegistrationIsGated(request, username, password) {
  const blocked = await request.post(`${STAGING_API_URL}/auth/register`, {
    data: {
      username,
      password,
      email: `${username}@example.invalid`,
    },
    headers: { 'Cache-Control': 'no-cache' },
  });
  expect(blocked.status(), `staging debe rechazar altas sin invitación: ${await blocked.text()}`).toBe(403);
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

  // Dos jobs jamás deberían compartir staging por concurrency, pero si una
  // reconciliación manual cruza justo la creación, el 409 puede ser una carrera
  // inocua. Reintentar login distingue eso de una contraseña realmente rota.
  if (register.status() === 409) {
    const retry = await request.post(`${STAGING_API_URL}/auth/login`, {
      data: { username, password },
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (retry.ok()) return retry.json();
  }

  throw new Error(`No se pudo preparar usuario técnico staging: register HTTP ${register.status()} · ${await register.text()}`);
}

async function seedStableSmokeProfile(request, token) {
  const tutorialProgress = {
    'combat-basics': { seen: true },
    'combat-campaign': { seen: true },
    'combat-intelligence': { seen: true },
    'combat-deployment': { seen: true },
    'quick-match-rules': { seen: true },
    tournament: { seen: true },
    practice: { seen: true },
    puzzles: { seen: true },
    spectator: { seen: true },
    lab: { seen: true },
    'rival-ghost': { seen: true },
  };
  const response = await request.put(`${STAGING_API_URL}/profile`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      data: {
        'chess-study-mechanic-tutorial-progress-v1': JSON.stringify(tutorialProgress),
        'chess-study-home-guide-dismissed-v1': '1',
        'matthias.onboarded': '2',
        'chess-study-onboarding-insights-seen-v1': '1',
        'chess-study-reduced-motion': '1',
        'chess-study-ui-language': 'es',
      },
    },
  });
  expect(response.status(), `seed de perfil staging: ${await response.text()}`).toBe(200);
}

test('staging live · login real → War Room → F5 recupera → chunk 3D fallido recupera → jugada real', async ({ page, request }) => {
  const username = requiredEnv('STAGING_E2E_USERNAME');
  const password = requiredEnv('STAGING_E2E_PASSWORD');
  const inviteCode = requiredEnv('STAGING_INVITE_CODE');

  if (EXPECTED_SHA) {
    const releaseResponse = await request.get(`${STAGING_API_URL}/release?sha=${encodeURIComponent(EXPECTED_SHA)}`, {
      headers: { 'Cache-Control': 'no-cache' },
    });
    expect(releaseResponse.status()).toBe(200);
    const release = await releaseResponse.json();
    expect(String(release.build || '').toLowerCase()).toBe(EXPECTED_SHA.toLowerCase());
  }

  // Pages puede acreditar release.json unos segundos antes de que todos los
  // assets hashed del nuevo index estén disponibles a través del custom domain.
  // En esa ventana el fallback SPA devuelve text/html para un .js y Chromium
  // deja la aplicación en blanco por MIME estricto. Esperamos únicamente esa
  // propagación concreta; cualquier asset roto de forma persistente sigue
  // haciendo fallar staging con diagnóstico explícito.
  await waitForFrontendAssetPropagation(request);

  // Guardarraíl de producto: el endpoint sigue disponible para CI, pero nunca
  // debe aceptar una cuenta pública sin el secreto generado por el bootstrap.
  await assertRegistrationIsGated(request, username, password);

  const session = await authenticateOrCreate(request, username, password, inviteCode);
  expect(session.token).toBeTruthy();
  await seedStableSmokeProfile(request, session.token);

  let gameId = null;
  try {
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
    await expect(page.getByRole('complementary', { name: 'Rincón de Matthias' })).toBeVisible({ timeout: 10_000 });

    // La Escuela sirve de canario del rollout 3D antes de crear una partida real.
    await buttonWithHeading(page, 'Escuela de Matthias').click();
    const schoolBoard = page.locator('.matthias-school-board');
    await expect(schoolBoard).toHaveAttribute('data-school-renderer', '3d', { timeout: 30_000 });
    await expect(schoolBoard.locator('[data-board3d-war-room="true"]')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /Volver al menú/ }).click();
    await expect(page.getByRole('region', { name: 'Hoy en Chess Studio' })).toBeVisible();

    await expect(buttonWithVisibleText(page, 'Partida rápida')).toBeVisible();
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
    await expect(page.locator('.game-layout-3d .status-line')).toBeHidden();
    await expect(warRoomStatus).toBeVisible();
    await expect(warRoomStatus.getByText('SITUACIÓN', { exact: true })).toBeVisible();
    await expect(warRoomStatus.locator('strong')).not.toHaveText('');

    // Incidente zfrp: una partida 3D ya activa debe sobrevivir un runtime nuevo.
    // Exigimos un GET real de Mongo/API y después la misma War Room, no sólo que
    // el snapshot local conserve una ruta visual.
    const restoreAfterReload = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === 'GET'
        && Boolean(gameId)
        && url.origin + url.pathname === `${STAGING_API_URL}/games/${gameId}`;
    }, { timeout: 60_000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    expect((await restoreAfterReload).status()).toBe(200);
    await expect(warRoom3d).toBeVisible({ timeout: 30_000 });
    await expect(warRoomStatus).toBeVisible();
    await expect(page.locator('.error-boundary-screen')).toHaveCount(0);

    // Para sabotear de verdad el primer import de Board3D necesitamos un runtime
    // donde ese módulo todavía no exista. Bajamos a 2D, persistimos la preferencia
    // y recargamos: la sesión sigue siendo la misma, pero el nuevo runtime no pide
    // Board3D hasta que volvamos a elegir 3D explícitamente.
    await page.getByRole('button', { name: 'Apariencia', exact: true }).click();
    let appearanceDialog = page.getByRole('dialog', { name: 'Ajustes' });
    await expect(appearanceDialog).toBeVisible();
    await appearanceDialog.getByRole('radio', { name: /2D$/ }).click();
    await appearanceDialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(page.locator('.square[aria-label^="Casilla e2,"]')).toBeVisible({ timeout: 30_000 });

    const board3dChunkPattern = /\/assets\/Board3D-[^/]+\.js(?:\?.*)?$/;
    let failedBoard3DChunkOnce = false;
    await page.route(board3dChunkPattern, async (route) => {
      if (!failedBoard3DChunkOnce) {
        failedBoard3DChunkOnce = true;
        await route.abort('failed');
        return;
      }
      await route.continue();
    });

    const restoreFresh2D = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === 'GET'
        && Boolean(gameId)
        && url.origin + url.pathname === `${STAGING_API_URL}/games/${gameId}`;
    }, { timeout: 60_000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    expect((await restoreFresh2D).status()).toBe(200);
    await expect(page.locator('.square[aria-label^="Casilla e2,"]')).toBeVisible({ timeout: 30_000 });
    expect(failedBoard3DChunkOnce, '2D no debe cargar Board3D durante el reload fresco').toBe(false);

    // Guardarraíl directo para #286: ahora sí provocamos el primer import lazy
    // de Board3D y lo fallamos una sola vez. ErrorBoundary debe ofrecer reload
    // controlado; como la preferencia 3D ya quedó persistida, el segundo runtime
    // reintenta el chunk, lo dejamos pasar y debe reconstruir la War Room.
    await page.getByRole('button', { name: 'Cambiar apariencia y piezas del tablero', exact: true }).click();
    appearanceDialog = page.getByRole('dialog', { name: 'Ajustes' });
    await expect(appearanceDialog).toBeVisible();
    await appearanceDialog.getByRole('radio', { name: /3D$/ }).click();

    await expect(page.getByRole('heading', { name: 'La pantalla ha tropezado', exact: true })).toBeVisible({ timeout: 30_000 });
    expect(failedBoard3DChunkOnce).toBe(true);
    const recoverRuntime = page.getByRole('button', { name: 'Recargar y recuperar sesión', exact: true });
    await expect(recoverRuntime).toBeVisible();
    await recoverRuntime.click();
    await expect(warRoom3d).toBeVisible({ timeout: 30_000 });
    await expect(warRoomStatus).toBeVisible();
    await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
    await page.unroute(board3dChunkPattern);

    // Finalmente volvemos a 2D sólo para usar el helper accesible/determinista
    // de casillas y acreditar que la misma partida todavía acepta una jugada real.
    await page.getByRole('button', { name: 'Apariencia', exact: true }).click();
    appearanceDialog = page.getByRole('dialog', { name: 'Ajustes' });
    await expect(appearanceDialog).toBeVisible();
    await expect(appearanceDialog.getByRole('radiogroup', { name: 'Representación del tablero' })).toBeVisible();
    await expect(appearanceDialog.getByRole('radio', { name: /3D$/ })).toHaveAttribute('aria-checked', 'true');
    await appearanceDialog.getByRole('radio', { name: /2D$/ }).click();
    await appearanceDialog.getByRole('button', { name: 'Cerrar', exact: true }).click();

    await expect(page.getByRole('button', { name: 'Cambiar apariencia y piezas del tablero', exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.square[aria-label^="Casilla e2,"]')).toBeVisible();

    const moveResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === 'POST'
        && Boolean(gameId)
        && url.origin + url.pathname === `${STAGING_API_URL}/games/${gameId}/move`;
    }, { timeout: 60_000 });
    await clickBoardMove(page, 'e2', 'e4');
    const moveResponse = await moveResponsePromise;
    expect(moveResponse.status()).toBe(200);
    const moved = await moveResponse.json();
    expect(Array.isArray(moved.history)).toBe(true);
    expect(moved.history.length).toBeGreaterThanOrEqual(1);
    await expect(gameStatus(page)).toBeVisible();
  } finally {
    if (gameId && session.token) {
      const cleanup = await request.delete(`${STAGING_API_URL}/games/${encodeURIComponent(gameId)}`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (![204, 404].includes(cleanup.status())) {
        throw new Error(`Cleanup de partida smoke devolvió HTTP ${cleanup.status()}: ${await cleanup.text()}`);
      }
    }
  }
});
