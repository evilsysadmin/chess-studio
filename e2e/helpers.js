import { expect } from '@playwright/test';

export async function mockApi(page, { isAdmin = false } = {}) {
  let profileData = {};
  let nextGameId = 1;
  const games = new Map();
  await page.route('http://localhost:4000/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (path.endsWith('/auth/login') && method === 'POST') return json({ token: 'e2e-token', username: 'e2e' });
    if (path.endsWith('/auth/me')) return json({ username: 'e2e', isAdmin });
    if (path.endsWith('/profile') && method === 'GET') return json({ app: 'estudio-de-ajedrez', version: 2, data: profileData });
    if (path.endsWith('/profile') && method === 'PUT') {
      const payload = route.request().postDataJSON?.() ?? {};
      profileData = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
      return json({ ok: true });
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

export async function dismissTutorialIfVisible(page) {
  const skip = page.getByRole('button', { name: 'Saltar', exact: true });
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

export async function openCampaignMap(page) {
  await page.getByRole('button', { name: /Combat Chess · Campaña/ }).click();

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
  const enterPreparation = page.getByRole('button', { name: /PREPARAR EJÉRCITO/i });
  if (await enterPreparation.isVisible().catch(() => false)) {
    await enterPreparation.click();
    await dismissTutorialIfVisible(page);
    await expect(page.getByLabel('Resumen de preparación')).toBeVisible();
  }

  const reviewDeployment = page.getByRole('button', { name: /PREPARAR DESPLIEGUE|REVISAR Y CONFIRMAR/i });
  await expect(reviewDeployment).toBeVisible();
  await reviewDeployment.click();
  await dismissTutorialIfVisible(page);

  const deployment = page.getByRole('region', { name: 'Preparar despliegue de Combat Chess' });
  await expect(deployment).toBeVisible();
  return deployment;
}

export async function loginAndOpenDeployment(page) {
  await mockApi(page);
  await login(page);
  await openCampaignBriefing(page);
  return openDeployment(page);
}
