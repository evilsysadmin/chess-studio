import { expect, test } from '@playwright/test';
import { loginAndOpenDeployment } from './helpers.js';

test.describe('Combat Chess · interacción DOM real', () => {
  test('una baja veterana exige confirmar pérdida definitiva y conserva el expediente en el Memorial', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('chess-study-combat-roster', JSON.stringify({
        pieces: { 'n-b': { alive: false, strengthPoints: 4, speedPoints: 2, bankedXp: 3 } },
        identities: { 'n-b': { alias: 'Konrad', identityId: 'unit-konrad', createdAt: '2026-08-20T00:00:00Z' } },
        unitRecords: { 'unit-konrad': { identityId: 'unit-konrad', alias: 'Konrad', slotKey: 'n-b',
          stats: { battles: 11, survivals: 8, kills: 4 }, decorations: [{ id: 'veteran' }] } },
        credits: 60,
      }));
    });
    const deployment = await loginAndOpenDeployment(page);
    const casualties = deployment.getByRole('region', { name: 'Bajas pendientes' });
    await expect(casualties).toBeVisible();
    await expect(casualties.getByText('11 batallas')).toBeVisible();
    await expect(casualties.getByText(/nv.7 → nv.4/)).toBeVisible();
    await expect(casualties.getByText('✦ 1 condecoración')).toBeVisible();
    const mechanics = casualties.locator('details.deployment-casualty-mechanics');
    await expect(mechanics).not.toHaveAttribute('open');
    await expect(mechanics.getByText(/pierde la XP sin gastar/)).toBeHidden();
    await mechanics.locator('summary').click();
    await expect(mechanics.getByText(/pierde la XP sin gastar/)).toBeVisible();

    await casualties.getByRole('button', { name: 'Reemplazar…' }).click();
    await expect(casualties.getByText('¿Archivar definitivamente a Konrad?')).toBeVisible();
    let stored = await page.evaluate(() => JSON.parse(localStorage.getItem('chess-study-combat-roster')));
    expect(stored.identities['n-b'].identityId).toBe('unit-konrad');
    await casualties.getByRole('button', { name: 'Conservar decisión pendiente' }).click();
    await expect(casualties.getByText('¿Archivar definitivamente a Konrad?')).toHaveCount(0);
    await casualties.getByRole('button', { name: 'Reemplazar…' }).click();
    await casualties.getByRole('button', { name: 'Confirmar reemplazo definitivo' }).click();
    await expect(casualties).toHaveCount(0);
    stored = await page.evaluate(() => JSON.parse(localStorage.getItem('chess-study-combat-roster')));
    expect(stored.identities['n-b'].identityId).not.toBe('unit-konrad');
    expect(stored.memorial.some((entry) => entry.identityId === 'unit-konrad')).toBe(true);
  });

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