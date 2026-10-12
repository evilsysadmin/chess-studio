import { expect, test } from '@playwright/test';
import { login, mockApi, openMoreGameModes } from './helpers.js';

async function dismissGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (!(await guide.isVisible().catch(() => false))) return;

  const dismiss = guide.getByRole('button', { name: 'Ahora no', exact: true });
  if (await dismiss.isVisible().catch(() => false)) {
    await dismiss.click();
    return;
  }

  const close = guide.getByRole('button', { name: 'Cerrar guía rápida', exact: true });
  if (await close.isVisible().catch(() => false)) await close.click();
}

async function openExperimentsHub(page) {
  await mockApi(page);
  await login(page);
  await dismissGuide(page);
  const moreModes = await openMoreGameModes(page);
  await moreModes
    .getByRole('button')
    .filter({ hasText: 'Experimentos geniales' })
    .click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
}

async function openChesscom(page) {
  await openExperimentsHub(page);
  await page.getByRole('button', { name: /Chesscom/ }).click();
  await expect(page.getByRole('heading', { name: 'CHESSCOM', exact: true })).toBeVisible();
}

test('Chesscom · abre la planta 17 con renderer Babylon real y HUD Dust Veil premium', async ({ page }) => {
  // Babylon real + producción Vite puede tardar bastante en un runner frío. El
  // smoke anterior llegaba a validar la escena y volver al Hangar, pero agotaba
  // 75 s justo al final; 120 s sigue siendo un límite finito sin convertir un
  // fallo de arranque en una espera eterna.
  test.setTimeout(120_000);
  await openChesscom(page);

  const mode = page.locator('[data-chesscom-poc="true"][data-chesscom-renderer="babylon"]');
  await expect(mode).toBeVisible();
  await expect(mode).toHaveAttribute('data-chesscom-visual', 'premium-v1');
  await expect(mode.getByText('OPERACIÓN: DUST VEIL', { exact: true })).toBeVisible();
  await expect(mode.getByText('Kharif Outpost', { exact: true })).toBeVisible();
  await expect(mode.getByText('HK416 (Used)', { exact: true })).toBeVisible();
  await expect(mode.locator('.chesscom-economy strong')).toHaveText(/^(?:3400|3[.\u00a0\u202f ]400) cr$/);

  const host = mode.locator('.chesscom-babylon-host');
  const canvas = host.locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect(host).toHaveAttribute('data-chesscom-units', 'mercenary-premium-v2');
  await expect(host).toHaveAttribute('data-chesscom-fire-stance', 'weapon-muzzle-v1');
  await expect(host).toHaveAttribute('data-chesscom-operator', 'character-art-v4');
  await expect(host).toHaveAttribute('data-chesscom-character-mesh', 'custom-lowpoly-v4');
  await expect(host).toHaveAttribute('data-chesscom-character-materials', 'procedural-pbr-v4');
  await expect(host).toHaveAttribute('data-chesscom-environment', 'environment-art-v4');
  await expect(host).toHaveAttribute('data-chesscom-architecture', 'industrial-architecture-v19');
  await expect(host).toHaveAttribute('data-chesscom-loading-bays', 'kharif-loading-bays-v27');
  await expect(host).toHaveAttribute('data-chesscom-vehicle', 'military-truck-v21');
  await expect.poll(() => host.evaluate(() => {
    const B = window.BABYLON;
    const scene = B?.EngineStore?.LastCreatedScene;
    const wheels = scene?.meshes?.filter((mesh) => mesh.name.startsWith('truck-v21-tyre-')) || [];
    const root = scene?.getTransformNodeByName?.('truck-v21-root');
    return Boolean(root && wheels.length === 6 && wheels.every((mesh) => !mesh.isPickable && mesh.parent === root));
  })).toBe(true);
  await expect(host).toHaveAttribute('data-chesscom-camera', 'camera-v25-cinematic-wide');
  await expect(host).toHaveAttribute('data-chesscom-lighting', 'readability-v2');
  await expect(host).toHaveAttribute('data-chesscom-operator-moments', 'operator-moments-v26');
  await expect(host).toHaveAttribute('data-chesscom-focus-unit', 'matthias');
  await expect.poll(() => host.evaluate(() => {
    const scene=window.BABYLON?.EngineStore?.LastCreatedScene;
    const marker=scene?.getMeshByName?.('marker-matthias');
    // Focus reuses a real 3D selection ring; never allocate a second effect.
    return Boolean(marker && !marker.isPickable && marker.metadata?.selectionStyle==='ground-brackets-v28' && marker.alpha<=.55 && marker.getClassName?.()==='LinesMesh' && marker.metadata?.operatorFocus
      && !scene.getMeshByName?.('chesscom-moment-v26-ring')
      && !scene.getLightByName?.('chesscom-moment-v26-fill'));
  })).toBe(true);

  await expect(mode.getByText(/BABYLON\.JS \d+\.\d+\.\d+ · GPU PREMIUM V2 · BALLISTICS · UNIT STANCE · CHARACTER ART V4/)).toBeVisible({ timeout: 30_000 });
  await expect(mode.getByText('BABYLON · ERROR', { exact: true })).toHaveCount(0);

  const dieterArt = mode.locator('.chesscom-portrait-art.is-dieter');
  await expect(dieterArt).toBeVisible();
  await expect.poll(() => dieterArt.evaluate((node) => getComputedStyle(node).backgroundImage)).toMatch(/dieter-portrait\.svg/i);
  await expect(mode.locator('.chesscom-weapon-art')).toBeVisible();

  await expect(mode.getByRole('button', { name: 'Mover', exact: true })).toBeVisible();
  await expect(mode.getByRole('button', { name: 'Disparar', exact: true })).toBeVisible();
  await expect(mode.getByRole('button', { name: 'Vigilancia', exact: true })).toBeVisible();
  await expect(mode.getByRole('button', { name: 'Fin de turno', exact: true })).toBeVisible();

  await mode.getByText(/Detalles del arma/).click();
  const fireModes = mode.getByRole('group', { name: 'Modo de disparo' });
  await expect(fireModes.getByRole('button', { name: 'SA', exact: true })).toBeVisible();
  await expect(fireModes.getByRole('button', { name: 'Ráfaga', exact: true })).toBeVisible();
  await expect(fireModes.getByRole('button', { name: 'Auto', exact: true })).toBeVisible();
  await fireModes.getByRole('button', { name: 'Ráfaga', exact: true }).click();
  await expect(fireModes.getByRole('button', { name: 'Ráfaga', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(mode.locator('.chesscom-mission-badge strong')).toHaveText('DISPARAR');

  await mode.locator('.chesscom-squad-card').filter({ hasText: 'Sven' }).click();
  await expect(host).toHaveAttribute('data-chesscom-focus-unit', 'sven');

  await expect(mode.getByRole('group', { name: 'Modo de disparo' }).getByRole('button', { name: 'Ráfaga', exact: true })).toHaveCount(0);
  await expect(mode.getByRole('group', { name: 'Modo de disparo' }).getByRole('button', { name: 'Auto', exact: true })).toBeVisible();

  // El PNG canónico Dust Veil convierte los laterales en overlays y deja
  // Babylon como protagonista sin perder el acceso a las acciones existentes.
  await page.setViewportSize({ width:1600, height:900 });
  await expect(host).toHaveAttribute('data-chesscom-camera-framing', 'cinematic');
  // V25's numeric beta/ortho invariants have their dedicated unit tests.
  // Browser acceptance checks the real responsive profile and HUD geometry
  // without synchronously interrogating the hot software WebGL render loop.

  await expect(mode).toHaveAttribute('data-chesscom-layout', 'dust-veil-canonical-v1');
  // All 8 desktop geometric invariants are enforced in the required
  // visual-runtime artifact test at this exact SHA, alongside real screenshots.
  // This interactive smoke must focus on gameplay and navigation, not repeat
  // expensive DOM geometry reads while Babylon renders under SwiftShader.
  await expect(mode.getByText('Informe de campo', { exact:true })).toBeVisible();
  await expect(mode.locator('.chesscom-weapon-ammo')).toHaveText('30/30');
  // El renderer ya está caliente: aprovechamos el mismo boot para verificar la
  // arista móvil que el artifact visual detectó (390px de viewport vs 491px de
  // canvas CSS). El scroll interno de la actionbar es válido; el documento no.
  await page.setViewportSize({ width:390, height:844 });
  // Resize must restore the overview without a scene remount.
  await expect(host).toHaveAttribute('data-chesscom-camera-framing', 'overview');
  // Camera V25 numeric overview restoration is covered by unit tests;
  // this live test still asserts the actual mobile profile and input layout.

  // The visual gate checks mobile document overflow, canvas width/pixel ratio, and header gap.
  await expect(mode.locator('.chesscom-operation')).toBeVisible();
  // Compact branding must fit beside the exit, not be clipped by it.
  await expect(page.getByRole('button', { name: '← Experimentos', exact: true })).toBeVisible();

  // Reutilizamos el Babylon ya arrancado para comprobar también la salida. El
  // contrato es el mismo que el antiguo tercer test, sin otro login + boot 3D.
  await page.getByRole('button', { name: '← Experimentos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  await expect(page.locator('.lab-workshop-map-table strong')).toHaveText('Chesscom');
  await expect(page.locator('.lab-workshop-portal--pawnslug-godot strong')).toHaveText('PAWN SLUG GODOT');
  await expect(page.locator('.lab-workshop-portal--trailblazer strong')).toHaveText('Pawn Trailblazer');
});

test('Chesscom · no hereda el scroll del Hangar al entrar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 640 });
  await openExperimentsHub(page);

  const card = page.getByRole('button', { name: /Chesscom/ });
  await card.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  // The immersive Experimentos room now fits the viewport, so there may be no
  // document scroll to inherit. The contract belongs to Chesscom: regardless of
  // the hub's current scrollability, entering the mode must start at the top.
  await card.evaluate((node) => node.click());
  await expect(page.getByRole('heading', { name: 'CHESSCOM', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  const brandTop = await page.getByRole('heading', { name: 'CHESSCOM', exact: true }).evaluate((node) => node.getBoundingClientRect().top);
  expect(brandTop).toBeGreaterThanOrEqual(0);
});
