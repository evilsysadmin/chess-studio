import { expect, test } from '@playwright/test';
import { login, mockApi, openMoreGameModes } from './helpers.js';

const RELEASE = '0123456789abcdef';
const INDEX_URL = `https://assets.chess-studio.shadowops.dpdns.org/chess-football-godot/releases/${RELEASE}/index.html`;

async function openExperiments(page) {
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
    },
  });
  await page.route('**/chess-football-godot/current.json**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      version: 1,
      release: RELEASE,
      sourceSha: 'a'.repeat(40),
      index: INDEX_URL,
    }),
  }));
  await page.route(INDEX_URL, (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><main>Chess Football mock runtime</main><script>window.parent.postMessage({source:'chess-football-godot',type:'ready'},'*')</script></body></html>',
  }));

  await login(page);
  await openMoreGameModes(page);
  const tools = page.locator('#illustrated-home-tools');
  await tools.getByRole('button').filter({ hasText: 'Experimentos geniales' }).click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
}

async function installMobileImmersiveStubs(page) {
  await page.addInitScript(() => {
    window.__footballFullscreenRequests = 0;
    window.__footballLandscapeLocks = 0;
    window.__footballOrientationUnlocks = 0;
    window.__footballOrientationStubbed = false;

    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      if (query !== '(pointer: coarse)') return nativeMatchMedia(query);
      return {
        matches: true,
        media: query,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() { return true; },
      };
    };

    Element.prototype.requestFullscreen = function requestFullscreen() {
      window.__footballFullscreenRequests += 1;
      return Promise.resolve();
    };

    try {
      Object.defineProperty(Screen.prototype, 'orientation', {
        configurable: true,
        get() {
          return {
            lock(mode) {
              if (mode === 'landscape') window.__footballLandscapeLocks += 1;
              return Promise.resolve();
            },
            unlock() {
              window.__footballOrientationUnlocks += 1;
            },
          };
        },
      });
      window.__footballOrientationStubbed = true;
    } catch {
      // Fullscreen + the portrait escape hatch still cover engines where
      // Screen.prototype.orientation cannot be replaced.
    }
  });
}

test('Chess Football fills the viewport and returns only through the runtime exit', async ({ page }) => {
  await openExperiments(page);
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.locator('.lab-workshop-portal--football').click();
  await expect(page.getByRole('heading', { name: 'Chess Football' })).toBeVisible();
  await expect(page.locator('iframe[title="Chess Football Godot"]')).toHaveCount(0);
  await page.locator('.chess-football-entry__choice--quick').click();

  const host = page.locator('.chess-football-godot-host');
  await expect(host).toBeVisible();
  const frame = page.locator('iframe[title="Chess Football Godot"]');
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute('src', INDEX_URL);
  await expect(page.getByRole('button', { name: 'Salir de Chess Football' })).toBeVisible();
  await expect(host).toHaveAttribute('data-runtime-ready', 'true');
  // A frame load alone is never proof that the actual Godot scene booted.
  await expect(page.locator('.chess-football-godot-host__status')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Volver a Experimentos' })).toHaveCount(0);

  const box = await host.boundingBox();
  expect(box).not.toBeNull();
  expect(box.left).toBeLessThanOrEqual(1);
  expect(box.top).toBeLessThanOrEqual(1);
  expect(box.width).toBeGreaterThanOrEqual(1278);
  expect(box.height).toBeGreaterThanOrEqual(718);
  expect(await page.evaluate(() => document.fullscreenElement === null)).toBe(true);

  // React must not interpret Escape as "volver": while Football owns the mode,
  // Escape belongs to Godot's pause menu.
  await page.keyboard.press('Escape');
  await expect(host).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toHaveCount(0);

  await frame.contentFrame().locator('body').evaluate(() => {
    window.parent.postMessage({ source: 'chess-football-godot', type: 'exit' }, '*');
  });
  await expect(page.getByRole('heading', { name: 'Chess Football' })).toBeVisible();
  await expect(host).toHaveCount(0);
  await page.locator('.chess-football-entry__back').click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
});


test('Chess Football requests landscape immersion from the launch gesture and releases it on exit', async ({ page }) => {
  await installMobileImmersiveStubs(page);

  await openExperiments(page);
  await page.locator('.lab-workshop-portal--football').click();
  await expect(page.getByRole('heading', { name: 'Chess Football' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__footballFullscreenRequests)).toBe(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-chess-football-immersive', 'requested');
  await expect(page.locator('iframe[title="Chess Football Godot"]')).toHaveCount(0);
  await page.locator('.chess-football-entry__choice--quick').click();

  const host = page.locator('.chess-football-godot-host');
  await expect(host).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__footballFullscreenRequests)).toBe(1);
  await expect(page.locator('html')).toHaveAttribute('data-chess-football-immersive', 'requested');

  const orientationWasStubbed = await page.evaluate(() => window.__footballOrientationStubbed === true);
  if (orientationWasStubbed) {
    await expect.poll(() => page.evaluate(() => window.__footballLandscapeLocks)).toBe(1);
  }

  const frame = page.locator('iframe[title="Chess Football Godot"]');
  await frame.contentFrame().locator('body').evaluate(() => {
    window.parent.postMessage({ source: 'chess-football-godot', type: 'exit' }, '*');
  });

  await expect(page.getByRole('heading', { name: 'Chess Football' })).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-chess-football-immersive', 'requested');
  if (orientationWasStubbed) {
    await expect.poll(() => page.evaluate(() => window.__footballOrientationUnlocks)).toBe(1);
  }
});


test('Chess Football mobile portrait never traps the session and retries landscape on demand', async ({ page }) => {
  await installMobileImmersiveStubs(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openExperiments(page);

  await page.locator('.lab-workshop-portal--football').click();
  await expect(page.getByRole('heading', { name: 'Chess Football' })).toBeVisible();
  await expect(page.locator('iframe[title="Chess Football Godot"]')).toHaveCount(0);
  await page.locator('.chess-football-entry__choice--quick').click();

  const host = page.locator('.chess-football-godot-host');
  await expect(host).toBeVisible();
  await expect(host).toHaveAttribute('data-mobile-portrait', 'true');
  await expect(page.getByRole('heading', { name: 'Gira el móvil' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Activar apaisado' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salir de Chess Football' })).toBeVisible();

  const orientationWasStubbed = await page.evaluate(() => window.__footballOrientationStubbed === true);
  if (orientationWasStubbed) {
    const locksBeforeRetry = await page.evaluate(() => window.__footballLandscapeLocks);
    await page.getByRole('button', { name: 'Activar apaisado' }).click();
    await expect.poll(() => page.evaluate(() => window.__footballLandscapeLocks)).toBeGreaterThan(locksBeforeRetry);
  }

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(host).toHaveAttribute('data-mobile-portrait', 'false');
  await expect(page.getByRole('heading', { name: 'Gira el móvil' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Salir de Chess Football' })).toBeVisible();

  await page.getByRole('button', { name: 'Salir de Chess Football' }).click();
  await expect(page.getByRole('heading', { name: 'Chess Football' })).toBeVisible();
  await expect(host).toHaveCount(0);
  await page.locator('.chess-football-entry__back').click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
});

test('Chess Football manager door opens without booting a match', async ({ page }) => {
  await openExperiments(page);
  await page.locator('.lab-workshop-portal--football').click();

  await expect(page.getByRole('heading', { name: 'Chess Football' })).toBeVisible();
  await page.locator('.chess-football-entry__choice--manager').click();
  await expect(page.getByRole('heading', { name: 'El despacho del míster' })).toBeVisible();
  await expect(page.locator('.chess-football-entry__club')).toHaveCount(6);
  await page.getByRole('button', { name: 'Elegir FC Matthias', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'FC Matthias', exact: true })).toBeVisible();
  await expect(page.getByText('La guardamos en el progreso de tu perfil', { exact: false })).toBeVisible();
  await expect(page.locator('iframe[title="Chess Football Godot"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cambiar de club' }).click();
  await expect(page.locator('.chess-football-entry__club')).toHaveCount(6);
  await page.getByRole('button', { name: 'Elegir Peones del Norte', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Peones del Norte', exact: true })).toBeVisible();
  await page.locator('.chess-football-entry__back').click();
  await page.getByRole('button', { name: 'Volver a elegir modo' }).click();
  await expect(page.locator('.chess-football-entry__choice--quick')).toBeVisible();
  await page.locator('.chess-football-entry__back').click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
});

test('Chess Football manager can simulate ten reproducible matchdays without loading Godot', async ({ page }) => {
  await openExperiments(page);
  await page.locator('.lab-workshop-portal--football').click();
  await page.locator('.chess-football-entry__choice--manager').click();
  await page.getByRole('button', { name: 'Elegir FC Matthias', exact: true }).click();
  await page.getByRole('button', { name: 'Empezar temporada de prueba', exact: true }).click();

  const season = page.locator('.chess-football-entry__manager--season');
  await expect(season).toBeVisible();
  await expect(season).toContainText('Jornada 0 de 10');
  await expect(page.getByLabel('Objetivo del club')).toContainText('Conquistar la liga');
  await expect(page.getByLabel('Objetivo del club')).toContainText('En disputa');
  const lineupPanel = page.getByLabel('Alineación del míster');
  await lineupPanel.locator(':scope > details > summary').click();
  await lineupPanel.getByRole('combobox', { name: 'Titular 5 · DEL' }).selectOption('fc-matthias-del-2');
  await expect(lineupPanel.getByRole('combobox', { name: 'Titular 5 · DEL' })).toHaveValue('fc-matthias-del-2');
  const tactics = page.getByRole('group', { name: 'Táctica del siguiente partido' });
  await expect(tactics.getByRole('button', { name: 'Equilibrio' })).toHaveAttribute('aria-pressed', 'true');
  await tactics.getByRole('button', { name: 'Ataque total' }).click();
  await expect(tactics.getByRole('button', { name: 'Ataque total' })).toHaveAttribute('aria-pressed', 'true');
  await expect(season).toContainText('deja espacios atrás');
  await expect(season.locator('tbody tr')).toHaveCount(6);
  await expect(page.locator('iframe[title="Chess Football Godot"]')).toHaveCount(0);

  for (let round = 1; round <= 10; round += 1) {
    if (round === 2) {
      await expect(lineupPanel).toContainText('Fatiga 17%');
      await expect(lineupPanel.locator('.chess-football-entry__slot-fatigue')).toHaveCount(5);
      await expect(lineupPanel.locator('.chess-football-entry__slot-fatigue').first()).toHaveText('Fatiga 17%');
      const training = page.getByLabel('Entrenamiento de la jornada');
      await training.locator('summary').click();
      await page.getByRole('group', { name: 'Plan de entrenamiento' }).getByRole('button', { name: 'Recuperación' }).click();
      await expect(training.locator('summary')).toContainText('Recuperación');
      await tactics.getByRole('button', { name: 'Bloque bajo' }).click();
      await expect(tactics.getByRole('button', { name: 'Bloque bajo' })).toHaveAttribute('aria-pressed', 'true');
    }
    await page.getByRole('button', { name: 'Simular siguiente jornada', exact: true }).click();
    await expect(season).toContainText(`Jornada ${round} de 10`);
    if (round === 1) {
      await expect(season.getByLabel('Resultados de la última jornada')).toContainText('Plan: Ataque total');
      await expect(season.getByLabel('Resultados de la última jornada')).toContainText('Quinteto alternativo');
    }
    if (round === 2) {
      await expect(season.getByLabel('Resultados de la última jornada')).toContainText('Plan: Bloque bajo');
      await expect(season.getByLabel('Resultados de la última jornada')).toContainText('Entreno: Recuperación');
      await expect(season.getByLabel('Resultados de la última jornada')).toContainText('Fatiga inicial media: 5%');
    }
    if (round === 4) {
      const development = page.getByLabel('Evolución de la plantilla');
      await expect(development.locator('summary')).toContainText('5 mejorados');
      await development.locator('summary').click();
      await expect(development.locator('li')).toHaveCount(9);
      await expect(development).toContainText('(+1)');
      await expect(development).toContainText('titularidades');
    }
  }
  await expect(page.getByRole('button', { name: 'Liga completada', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Objetivo del club')).toContainText('Objetivo');
  await expect(page.getByLabel('Objetivo del club')).not.toContainText('En disputa');
  await expect(season).toContainText('Temporada completada.');
  await expect(season.getByLabel('Plantilla al cierre')).toBeVisible();
  await expect(season.getByLabel('Evolución de la plantilla').locator('summary')).toContainText('5 mejorados');
  await expect(season.locator('[aria-label="Resultados de la última jornada"] p')).toHaveCount(3);
  const completedTable = await season.locator('.chess-football-entry__standings tbody').innerText();
  await page.getByRole('button', { name: 'Comenzar temporada 2', exact: true }).click();
  await expect(season).toContainText('Jornada 0 de 10');
  await expect(season).toContainText('Temporada 2 de 4');
  await expect(season.getByLabel('Historial del club').locator('summary')).toContainText('1 completada');
  await season.getByLabel('Historial del club').locator('summary').click();
  await expect(season.getByLabel('Historial del club')).toContainText('Temporada 1');
  expect(await season.locator('.chess-football-entry__standings tbody').innerText()).not.toBe(completedTable);
  await page.getByLabel('Alineación del míster').locator(':scope > details > summary').click();
  await expect(page.getByLabel('Evolución de la plantilla').locator('summary')).toContainText('5 mejorados');
  await expect(page.getByLabel('Alineación del míster').locator('.chess-football-entry__slot-fatigue').first()).toHaveText('Fatiga 0%');
  await page.getByRole('button', { name: 'Simular siguiente jornada', exact: true }).click();
  await expect(season).toContainText('Jornada 1 de 10');
  await page.locator('.chess-football-entry__back').click();
  await expect(page.getByRole('heading', { name: 'FC Matthias', exact: true })).toBeVisible();
});

test('Chess Football manager restores the authoritative journal after leaving the mode', async ({ page }) => {
  await openExperiments(page);
  await page.locator('.lab-workshop-portal--football').click();
  await page.locator('.chess-football-entry__choice--manager').click();
  await page.getByRole('button', { name: 'Elegir FC Matthias' }).click();
  await page.getByRole('button', { name: 'Empezar temporada de prueba' }).click();
  await page.getByRole('button', { name: 'Ataque total' }).click();
  await page.getByLabel('Entrenamiento de la jornada').locator('summary').click();
  await page.getByRole('group', { name: 'Plan de entrenamiento' }).getByRole('button', { name: 'Remates' }).click();
  await page.getByLabel('Alineación del míster').locator(':scope > details > summary').click();
  await page.getByRole('combobox', { name: 'Titular 5 · DEL' }).selectOption('fc-matthias-del-2');
  await page.getByRole('button', { name: 'Simular siguiente jornada' }).click();
  await expect(page.locator('.chess-football-entry__manager--season')).toContainText('Jornada 1 de 10');
  const baseline = await page.locator('.chess-football-entry__standings tbody').innerText();
  await page.locator('.chess-football-entry__back').click();
  await page.locator('.chess-football-entry__back').click();
  await page.locator('.chess-football-entry__back').click();
  await page.getByRole('button', { name: 'Continuar temporada' }).click();
  await expect(page.locator('.chess-football-entry__manager--season')).toContainText('Jornada 1 de 10');
  expect(await page.locator('.chess-football-entry__standings tbody').innerText()).toBe(baseline);
  await page.getByLabel('Alineación del míster').locator(':scope > details > summary').click();
  await expect(page.getByRole('combobox', { name: 'Titular 5 · DEL' })).toHaveValue('fc-matthias-del-2');
  await expect(page.getByRole('combobox', { name: 'Titular 5 · DEL' })).toContainText('F24%');
  await expect(page.getByRole('button', { name: 'Ataque total' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Entrenamiento de la jornada').locator('summary')).toContainText('Remates');
  await page.locator('.chess-football-entry__back').click();
  await page.locator('.chess-football-entry__back').click();
  await page.locator('.chess-football-entry__back').click();
  await page.locator('.chess-football-entry__choice--manager').click();
  await page.getByRole('button', { name: 'Elegir FC Matthias' }).click();
  await page.getByRole('button', { name: 'Empezar temporada de prueba' }).click();
  await expect(page.getByRole('group', { name: 'Confirmar nueva temporada' })).toBeVisible();
  await page.getByRole('button', { name: 'Conservar la anterior' }).click();
  await page.locator('.chess-football-entry__back').click();
  await page.locator('.chess-football-entry__back').click();
  await page.getByRole('button', { name: 'Continuar temporada' }).click();
  await expect(page.locator('.chess-football-entry__manager--season')).toContainText('Jornada 1 de 10');
});
