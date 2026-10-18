import { expect, test } from '@playwright/test';
import { loginAndOpenDeployment } from './helpers.js';

test.describe('Combat Chess · interacción DOM real', () => {
  test('las piezas interactivas reciben pointer events reales en Mesa de Guerra', async ({ page }) => {
    const deployment = await loginAndOpenDeployment(page);
    const pawn = deployment.getByRole('button', { name: /Casilla a2,/ }).locator('img.piece.piece-event-target');
    await expect(pawn).toBeVisible();
    await expect(pawn).toHaveCSS('pointer-events', 'auto');
  });

  test('la reserva se despliega con un botón, sin dobles clics ni arrastrar', async ({ page }) => {
    const deployment = await loginAndOpenDeployment(page);
    const pawnSquare = deployment.getByRole('button', { name: /Casilla a2,/ });
    await pawnSquare.locator('img.piece.piece-event-target').dblclick();
    await expect(deployment.getByText('Banquillo · 1', { exact: true })).toBeVisible();
    const add = deployment.getByRole('button', { name: /Desplegar .* en primer puesto libre/ });
    await expect(add).toBeEnabled();
    await add.click();
    await expect(pawnSquare.locator('img.piece.piece-event-target')).toBeVisible();
    await expect(deployment.getByText('Banquillo · 0', { exact: true })).toBeVisible();
    await expect(deployment.getByRole('button', { name: 'CONFIRMAR DESPLIEGUE' })).toBeEnabled();
  });

  test('móvil permite rehacer una formación incompleta', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const deployment = await loginAndOpenDeployment(page);
    const pawnSquare = deployment.getByRole('button', { name: /Casilla a2,/ });
    await pawnSquare.locator('img.piece.piece-event-target').dblclick();
    await expect(pawnSquare.locator('img.piece.piece-event-target')).toHaveCount(0);
    const auto = deployment.getByRole('button', { name: 'Rehacer formación automática priorizando veteranos' });
    await expect(auto).toBeVisible();
    await auto.click();
    await expect(pawnSquare.locator('img.piece.piece-event-target')).toBeVisible();
    await expect(deployment.getByRole('button', { name: 'CONFIRMAR DESPLIEGUE' })).toBeEnabled();
  });

  test('focus de teclado sobre una reserva abre la ficha rápida sin ratón', async ({ page }) => {
    const deployment = await loginAndOpenDeployment(page);
    const pawnSquare = deployment.getByRole('button', { name: /Casilla a2,/ });
    await pawnSquare.locator('img.piece.piece-event-target').dblclick();

    const reserve = deployment.locator('.deployment-reserve-list .deployment-unit-card').first();
    await expect(reserve).toBeVisible();
    await reserve.focus();

    const dossier = page.getByRole('dialog', { name: /Ficha de unidad de/i });
    await expect(dossier).toBeVisible();
    await expect(dossier.getByText(/Vista rápida/i)).toBeVisible();
  });

  test('Escape cierra primero la ficha fijada sin abandonar Preparar despliegue', async ({ page }) => {
    const deployment = await loginAndOpenDeployment(page);
    const pawn = deployment.getByRole('button', { name: /Casilla a2,/ }).locator('img.piece.piece-event-target');
    await pawn.click();
    await expect(page.getByRole('dialog', { name: /Ficha de unidad de/i })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: /Ficha de unidad de/i })).toHaveCount(0);
    await expect(deployment).toBeVisible();
  });

  test('hover de pieza no altera despliegue ni selección del Banquillo', async ({ page }) => {
    const deployment = await loginAndOpenDeployment(page);
    const pawnSquare = deployment.getByRole('button', { name: /Casilla a2,/ });
    const pawn = pawnSquare.locator('img.piece.piece-event-target');

    await pawn.hover();
    await expect(page.getByRole('dialog', { name: /Ficha de unidad de/i })).toBeVisible();
    await expect(deployment.getByText('Banquillo · 0', { exact: true })).toBeVisible();
    await expect(pawnSquare.locator('img.piece.piece-event-target')).toBeVisible();
  });
});