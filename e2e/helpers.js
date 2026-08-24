import { expect } from '@playwright/test';

export async function mockApi(page, { isAdmin = false } = {}) {
  // These E2E specs exercise navigation/gameplay, not tutorial onboarding.
  // Seed Combat tutorials as already seen so modal overlays cannot intercept
  // unrelated clicks and burn Playwright's 30 s action timeout.
  let profileData = {
    'chess-study-mechanic-tutorial-progress-v1': JSON.stringify({
      'combat-campaign': { seen: true },
      'combat-intelligence': { seen: true },
      'combat-deployment': { seen: true },
    }),
  };
  let profileRevisions = {};
  let nextGameId = 1;
  const games = new Map();
  await page.route('http://localhost:4000/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (path.endsWith('/auth/login') && method === 'POST') return json({ token: 'e2e-token', username: 'e2e' });
    if (path.endsWith('/auth/me')) return json({ username: 'e2e', isAdmin });
    if (path.endsWith('/profile') && method === 'GET') {
      return json({ app: 'estudio-de-ajedrez', version: 2, data: profileData, revisions: profileRevisions });
    }
    if (path.endsWith('/profile') && method === 'PUT') {
      const payload = route.request().postDataJSON?.() ?? {};
      const nextData = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
      const keys = new Set([...Object.keys(profileData), ...Object.keys(nextData)]);
      for (const key of keys) {
        if (profileData[key] !== nextData[key] || (key in profileData) !== (key in nextData)) {
          profileRevisions[key] = Number(profileRevisions[key] || 0) + 1;
        }
      }
      profileData = { ...nextData };
      return json({ ...payload, data: profileData, revisions: profileRevisions });
    }
    if (path.endsWith('/profile') && method === 'PATCH') {
      const payload = route.request().postDataJSON?.() ?? {};
      const changes = payload?.data && typeof payload.data === 'object' ? payload.data : {};
      const expected = payload?.revisions && typeof payload.revisions === 'object' ? payload.revisions : {};
      const conflicts = {};
      for (const key of Object.keys(changes)) {
        const actual = Number(profileRevisions[key] || 0);
        const wanted = Number(expected[key] || 0);
        if (actual !== wanted) conflicts[key] = { expected: wanted, actual };
      }
      if (Object.keys(conflicts).length) {
        return json({
          detail: {
            message: 'Conflicto E2E de perfil',
            conflicts,
            profile: { app: 'estudio-de-ajedrez', version: 2, data: profileData, revisions: profileRevisions },
            revisions: profileRevisions,
          },
        }, 409);
      }
      const nextData = { ...profileData };
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) delete nextData[key];
        else nextData[key] = value;
        profileRevisions[key] = Number(profileRevisions[key] || 0) + 1;
      }
      profileData = nextData;
      return json({ app: 'estudio-de-ajedrez', version: 2, data: profileData, revisions: profileRevisions });
    }
    if (path.endsWith('/admin/users')) return json({ users: [] });
    if (path.endsWith('/admin/feedback')) return json({ feedback: [] });
    if (path.endsWith('/admin/ai-metrics')) return json({ samples: 0, enabled: true, circuit: { open: false } });
    if (path.endsWith('/status')) return json({ onlineUsers: 2, presenceAvailable: true });
    if (path.endsWith('/auth/activity')) return json({ ok: true });
    if (path.endsWith('/health')) return json({ ok: true });
    if (path.endsWith('/games') && method === 'POST') {
      const payload = route.request().postDataJSON?.() ?? {};
      const id = `e2e-game-${nextGameId++}`;
      const game = {
        id,
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'w',
        humanColor: payload.color === 'b' ? 'b' : 'w',
        difficulty: Math.round(Number(payload.difficulty ?? 50)),
        status: 'playing',
        insufficientMatingMaterial: { w: false, b: false },
        isGameOver: false,
        history: [],
        lastMove: null,
        initialFen: payload.startingFen || null,
        ghostStyle: payload.ghostStyle || null,
      };
      games.set(id, game);
      return json(game, 201);
    }
    const gameMatch = path.match(/\/games\/([^/]+)$/);
    if (gameMatch && method === 'GET') {
      const game = games.get(gameMatch[1]);
      return game ? json(game) : json({ detail: 'Partida no encontrada' }, 404);
    }
    if (gameMatch && method === 'DELETE') {
      games.delete(gameMatch[1]);
      return route.fulfill({ status: 204, body: '' });
    }
    return json({ detail: `E2E route no simulada: ${method} ${path}` }, 404);
  });
}

export async function login(page) {
  await page.goto('./');
  await page.getByLabel('Usuario').fill('e2e');
  await page.getByLabel('Contraseña').fill('clave123456');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('region', { name: 'Hoy en Chess Studio' })).toBeVisible();
}


export function buttonWithVisibleText(scope, text) {
  // Prefer the visible copy rendered inside the action button, not a broad
  // accessible-name regex. Tutorial help buttons intentionally include the
  // mode name in aria-label (e.g. "Ayuda de Partida rápida"), so regex
  // role selectors can become ambiguous as the UI gains contextual help.
  const visibleLabel = scope.getByText(text, { exact: true });
  return scope.getByRole('button').filter({ has: visibleLabel });
}

export async function dismissTutorialIfVisible(page) {
  // Defensive fallback: close every visible mechanic tutorial. A strict
  // getByRole('button', { name: 'Saltar' }) can throw when two overlays are
  // briefly mounted at once; swallowing that error left the backdrop in place
  // and the *next* click waited the full 30 s action timeout.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const dialog = page.locator('.mechanic-tutorial-card:visible').last();
    if (await dialog.count() === 0) return;
    const skip = dialog.getByRole('button', { name: 'Saltar', exact: true });
    await expect(skip).toBeVisible({ timeout: 2_000 });
    await skip.click({ timeout: 2_000 });
    await expect(dialog).toBeHidden({ timeout: 2_000 });
  }

  await expect(page.locator('.mechanic-tutorial-card:visible')).toHaveCount(0, { timeout: 2_000 });
}

export async function openCampaignMap(page) {
  await buttonWithVisibleText(page, 'Combat Chess · Campaña').click();

  // The campaign landing is deliberately simple: start first, then the
  // strategic map appears. Keep this flow centralized so UI copy changes do
  // not leave half the E2E suite waiting for a retired button label.
  const startCampaign = page.getByRole('button', { name: /Empezar campaña/i });
  await expect(startCampaign).toBeVisible();
  await startCampaign.click();
  await dismissTutorialIfVisible(page);

  const map = page.getByRole('region', { name: 'Mapa completo de campaña Combat Chess' });
  await expect(map).toBeVisible();
  return map;
}

export async function openCampaignBriefing(page) {
  const map = await openCampaignMap(page);
  const availableRoute = map.getByRole('button', { name: /Elegir esta ruta/ }).first();
  await expect(availableRoute).toBeVisible();
  await availableRoute.click();
  await dismissTutorialIfVisible(page);

  const briefing = page.getByLabel('Resumen táctico');
  await expect(briefing).toBeVisible();
  return briefing;
}

export async function openDeployment(page) {
  const deployment = page.getByRole('region', { name: 'Preparar despliegue de Combat Chess' });

  // Current campaign UX opens Mesa de Guerra automatically as soon as the
  // briefing accepts "PREPARAR EJÉRCITO". Older UX stopped first on the
  // preparation screen and required a second "PREPARAR DESPLIEGUE" click.
  // Support both transitions, but never click a button hidden *behind* the
  // deployment overlay: Playwright correctly waits for that occlusion and the
  // whole test used to die on the global timeout.
  if (await deployment.isVisible().catch(() => false)) return deployment;

  const enterPreparation = page.getByRole('button', { name: /PREPARAR EJÉRCITO/i });
  if (await enterPreparation.isVisible().catch(() => false)) {
    await enterPreparation.click();
    await dismissTutorialIfVisible(page);

    // React mounts CombatScreen and currently opens deployment immediately.
    // Give that direct transition a short chance before falling back to the
    // legacy/intermediate preparation-screen path.
    try {
      await deployment.waitFor({ state: 'visible', timeout: 1_500 });
      return deployment;
    } catch {
      await expect(page.getByLabel('Resumen de preparación')).toBeVisible();
    }
  }

  const reviewDeployment = page.getByRole('button', { name: /PREPARAR DESPLIEGUE|REVISAR Y CONFIRMAR/i });
  await expect(reviewDeployment).toBeVisible();
  await reviewDeployment.click();
  await dismissTutorialIfVisible(page);

  await expect(deployment).toBeVisible();
  return deployment;
}

export async function loginAndOpenDeployment(page) {
  await mockApi(page);
  await login(page);
  await openCampaignBriefing(page);
  return openDeployment(page);
}
