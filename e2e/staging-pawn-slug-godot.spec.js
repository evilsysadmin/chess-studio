import { expect, test } from '@playwright/test';

const STAGING_URL = process.env.STAGING_URL || 'https://staging.chess-studio.shadowops.dpdns.org';
const STAGING_API_URL = process.env.STAGING_API_URL || 'https://api-staging.chess-studio.shadowops.dpdns.org/api';
const EXPECTED_SHA = process.env.DEPLOY_SHA || '';

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Falta ${name} para el smoke visual live de Pawn Slug Godot`);
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

async function seedStableProfile(request, token) {
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

async function browserLogin(page, username, password) {
  await page.goto(STAGING_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  await page.getByLabel('Usuario').fill(username);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Modos principales', exact: true })).toBeVisible({ timeout: 25_000 });
}

async function captureGodot(page, testInfo, filename) {
  const shell = page.locator('.pawn-slug-godot-host__frame-shell');
  await expect(shell).toBeVisible();
  await shell.screenshot({ path: testInfo.outputPath(filename) });
}

async function hasGodotMessage(page, type) {
  return page.evaluate((expectedType) => (
    Array.isArray(window.__pawnSlugGodotVisualMessages)
    && window.__pawnSlugGodotVisualMessages.some(
      (entry) => entry?.data?.source === 'pawn-slug-godot' && entry?.data?.type === expectedType,
    )
  ), type);
}

test('staging visual · Pawn Slug Godot muestra boot, carrera y pickup SMG sin mezclar sprites', async ({ page, request }, testInfo) => {
  test.setTimeout(150_000);
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

  const session = await authenticateOrCreate(request, username, password, inviteCode);
  expect(session.token).toBeTruthy();
  await seedStableProfile(request, session.token);

  await page.addInitScript(() => {
    window.__pawnSlugGodotVisualMessages = [];
    window.addEventListener('message', (event) => {
      const data = event.data;
      if (!data || data.source !== 'pawn-slug-godot') return;
      window.__pawnSlugGodotVisualMessages.push({ data });
      if (window.__pawnSlugGodotVisualMessages.length > 80) {
        window.__pawnSlugGodotVisualMessages.shift();
      }
    });
  });

  await browserLogin(page, username, password);

  const direct = page.getByRole('button', { name: 'Abrir Pawn Slug directamente', exact: true });
  await expect(direct).toBeVisible();
  // Match the canonical Pawn Slug visual proof: keyboard activation avoids
  // coupling this staging smoke to Home's pointer hit-map/stacking context.
  await direct.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'PAWN SLUG GODOT', exact: true })).toBeVisible({ timeout: 20_000 });

  const host = page.locator('.pawn-slug-godot-host');
  const iframe = page.locator('iframe[title="Pawn Slug Godot"]');
  await expect(host).toBeVisible();
  await expect(iframe).toBeVisible();
  await expect(host).toHaveAttribute('data-runtime-ready', 'true', { timeout: 30_000 });
  await expect(page.locator('.pawn-slug-godot-host__header')).toHaveCount(0);

  const frame = page.frameLocator('iframe[title="Pawn Slug Godot"]');
  const canvas = frame.locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 15_000 });

  // Captura inmediata tras ready: protege la regresión del primer frame vacío.
  await captureGodot(page, testInfo, '00-godot-boot.png');

  const hostBox = await host.boundingBox();
  const viewport = page.viewportSize();
  expect(hostBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(hostBox.width).toBeGreaterThanOrEqual(viewport.width - 1);
  expect(hostBox.height).toBeGreaterThanOrEqual(viewport.height - 1);

  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  await canvas.click({ position: { x: canvasBox.width / 2, y: canvasBox.height / 2 } });
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(850);
  await captureGodot(page, testInfo, '01-godot-run.png');

  // Avanza disparando en pulsos hasta el primer pickup de arma. El runtime emite
  // weapon-pickup al padre cuando recoge la SMG, así que no dependemos de OCR/HUD.
  let pickedUp = await hasGodotMessage(page, 'weapon-pickup');
  for (let step = 0; step < 18 && !pickedUp; step += 1) {
    await page.keyboard.press('z');
    if (step === 7 || step === 13) await page.keyboard.press('x');
    await page.waitForTimeout(240);
    pickedUp = await hasGodotMessage(page, 'weapon-pickup');
  }
  await page.keyboard.up('ArrowRight');

  expect(pickedUp, 'Pawn Slug Godot debe alcanzar el primer pickup de arma').toBeTruthy();

  // La SMG se selecciona automáticamente al recogerla; una ráfaga breve hace
  // visible cualquier mezcla de atlas/cambio de arma en la evidencia.
  await page.keyboard.down('z');
  await page.waitForTimeout(160);
  await captureGodot(page, testInfo, '02-godot-smg-fire.png');
  await page.keyboard.up('z');
});
