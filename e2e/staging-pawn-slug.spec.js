import { expect, test } from '@playwright/test';

const STAGING_URL = process.env.STAGING_URL || 'https://staging.chess-studio.shadowops.dpdns.org';
const STAGING_API_URL = process.env.STAGING_API_URL || 'https://api-staging.chess-studio.shadowops.dpdns.org/api';
const EXPECTED_SHA = process.env.DEPLOY_SHA || '';

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Falta ${name} para el smoke visual live de Pawn Slug`);
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

async function missionProgress(page) {
  const label = await page.locator('.pawn-slug-mission-progress').getAttribute('aria-label');
  const match = String(label || '').match(/(\d+)%/);
  return Number(match?.[1] || 0);
}

async function captureCabinet(page, testInfo, filename) {
  const cabinet = page.locator('.pawn-slug-cabinet');
  await expect(cabinet).toBeVisible();
  await cabinet.screenshot({ path: testInfo.outputPath(filename) });
}

async function fireAndCapture(page, testInfo, filename) {
  await page.keyboard.down('Space');
  await page.waitForTimeout(28);
  await captureCabinet(page, testInfo, filename);
  await page.keyboard.up('Space');
  await page.waitForTimeout(90);
}

async function advanceUntilWeapon(page, weaponButton, { targetPercent, timeoutMs = 45_000 }) {
  const deadline = Date.now() + timeoutMs;
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('Space');
  try {
    while (Date.now() < deadline) {
      if (await weaponButton.isEnabled().catch(() => false)) {
        await expect(weaponButton).toHaveAttribute('aria-pressed', 'true');
        return;
      }
      if ((await missionProgress(page)) >= targetPercent) {
        throw new Error(`Pawn Slug superó ${targetPercent}% sin desbloquear ${await weaponButton.getAttribute('aria-label')}`);
      }
      await page.keyboard.press('ShiftLeft');
      await page.waitForTimeout(520);
    }
  } finally {
    await page.keyboard.up('Space');
    await page.keyboard.up('ArrowRight');
  }
  throw new Error(`Timeout esperando arma; progreso=${await missionProgress(page)}%`);
}

async function returnToPistol(arsenal) {
  const pistol = arsenal.getByRole('button').nth(0);
  await pistol.click();
  await expect(pistol).toHaveAttribute('aria-pressed', 'true');
}

test('staging visual · Pawn Slug mueve, dispara y renderiza todo el arsenal real', async ({ page, request }, testInfo) => {
  test.setTimeout(210_000);
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
  await browserLogin(page, username, password);

  const pawnSlugEntry = page.getByRole('button', { name: 'Abrir Pawn Slug directamente', exact: true });
  await expect(pawnSlugEntry).toBeVisible();
  await pawnSlugEntry.click();
  await expect(page.getByRole('heading', { name: 'Pawn Slug', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'INICIAR OPERACIÓN', exact: true }).click();

  const stage = page.locator('[data-pawn-slug-renderer="three"]');
  const canvas = stage.locator('canvas');
  await expect(canvas).toHaveCount(1, { timeout: 30_000 });
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect(stage).toHaveAttribute('data-pawn-slug-matthias-visual', /^premium-body:canonical-head:identity-locked:attached$/, { timeout: 30_000 });
  await expect(stage).toHaveAttribute('data-pawn-slug-enemy-visual', /^(premium-raster|premium-fallback):visible:mapped:readable:attached$/, { timeout: 30_000 });

  const arsenal = page.getByRole('group', { name: 'Seleccionar arma' });
  await expect(arsenal).toBeVisible();
  const pistol = arsenal.getByRole('button').nth(0);
  const machinegun = arsenal.getByRole('button').nth(1);
  const shotgun = arsenal.getByRole('button').nth(2);
  const panzerfaust = arsenal.getByRole('button').nth(3);
  await expect(pistol).toHaveAttribute('aria-pressed', 'true');

  const startProgress = await missionProgress(page);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(650);
  await captureCabinet(page, testInfo, '00-movement-right.png');
  await page.keyboard.up('ArrowRight');
  expect(await missionProgress(page)).toBeGreaterThan(startProgress);

  await fireAndCapture(page, testInfo, '01-pistol-fire.png');

  await advanceUntilWeapon(page, machinegun, { targetPercent: 24 });
  await expect(page.getByText('MG-42', { exact: true })).toBeVisible();
  await fireAndCapture(page, testInfo, '02-mg42-fire.png');
  await returnToPistol(arsenal);

  await advanceUntilWeapon(page, shotgun, { targetPercent: 56 });
  await expect(page.getByText('Benelli M3', { exact: true })).toBeVisible();
  await fireAndCapture(page, testInfo, '03-benelli-m3-fire.png');
  await returnToPistol(arsenal);

  await advanceUntilWeapon(page, panzerfaust, { targetPercent: 76 });
  await expect(page.getByText('Panzerfaust', { exact: true })).toBeVisible();
  await fireAndCapture(page, testInfo, '04-panzerfaust-fire.png');

  expect(await missionProgress(page)).toBeGreaterThanOrEqual(65);
  await captureCabinet(page, testInfo, '05-arsenal-live.png');
});
