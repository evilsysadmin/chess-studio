import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { login, mockApi, openFeedback } from './helpers.js';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000000020001e221bc330000000049454e44ae426082', 'hex');

test('Feedback · red caída conserva descripción, no promete conservar adjuntos ni falsifica éxito', async ({ page }, testInfo) => {
  await mockApi(page);
  await login(page);
  await openFeedback(page);

  let dialog = page.getByRole('dialog', { name: 'Dinos qué mejorar' });
  await dialog.getByLabel('¿Qué pasó o qué cambiarías?').fill('Replay / análisis: el escritorio tapa el tablero con negras.');
  await dialog.getByLabel('Tipo').selectOption('bug');
  await dialog.locator('input[type="file"]').setInputFiles({ name: 'tablero.png', mimeType: 'image/png', buffer: PNG });
  await expect(dialog.getByText('tablero.png', { exact: true })).toBeVisible();

  await page.route('**/api/feedback', (route) => route.abort('failed'));
  await dialog.getByRole('button', { name: 'Enviar feedback', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('El texto se conserva en esta pestaña.');
  await expect(dialog.getByRole('alert')).toContainText('volver a adjuntar las capturas');
  await expect(dialog.getByRole('heading', { name: 'Feedback enviado. Gracias.' })).toHaveCount(0);

  // Real runtime proof of the failed-upload state on desktop and touch-size
  // screens, not a static mockup. The long recovery copy must not overflow.
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect(dialog.getByRole('alert')).toContainText('El texto se conserva en esta pestaña.');
    const geometry = await dialog.evaluate((root) => {
      const rect = root.getBoundingClientRect();
      return { left: rect.left, right: rect.right, scroll: root.scrollWidth, client: root.clientWidth };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(-1);
    expect(geometry.right).toBeLessThanOrEqual(viewport.width + 1);
    expect(geometry.scroll).toBeLessThanOrEqual(geometry.client + 1);
    const png = await page.screenshot({ animations: 'disabled', fullPage: false });
    await mkdir('../.artifacts/app-visual', { recursive: true });
    await writeFile(`../.artifacts/app-visual/feedback-offline-${viewport.width}x${viewport.height}.png`, png);
    await testInfo.attach(`feedback-offline-${viewport.width}x${viewport.height}`, { body: png, contentType: 'image/png' });
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await openFeedback(page);
  dialog = page.getByRole('dialog', { name: 'Dinos qué mejorar' });
  await expect(dialog.getByLabel('¿Qué pasó o qué cambiarías?')).toHaveValue('Replay / análisis: el escritorio tapa el tablero con negras.');
  await expect(dialog.getByLabel('Tipo')).toHaveValue('bug');
  await expect(dialog.getByText('tablero.png', { exact: true })).toHaveCount(0);

  // Reload must preserve only the text/category in this tab.
  await page.reload();
  await openFeedback(page);
  dialog = page.getByRole('dialog', { name: 'Dinos qué mejorar' });
  await expect(dialog.getByLabel('¿Qué pasó o qué cambiarías?')).toHaveValue('Replay / análisis: el escritorio tapa el tablero con negras.');
  await expect(dialog.getByLabel('Tipo')).toHaveValue('bug');

  await page.unroute('**/api/feedback');
  await dialog.getByRole('button', { name: 'Enviar feedback', exact: true }).click();
  // Success changes aria-labelledby and therefore the dialog's accessible name.
  // Re-query the confirmed-success dialog rather than a stale name.
  const confirmed = page.getByRole('dialog', { name: 'Feedback enviado. Gracias.' });
  await expect(confirmed.getByRole('heading', { name: 'Feedback enviado. Gracias.' })).toBeVisible();
  // The close X and the primary confirmation both expose the name 'Cerrar'.
  // Explicitly use the visible confirmation CTA; never disable strict mode.
  await confirmed.locator('.feedback-sent .primary-btn').click();
  await openFeedback(page);
  dialog = page.getByRole('dialog', { name: 'Dinos qué mejorar' });
  await expect(dialog.getByLabel('¿Qué pasó o qué cambiarías?')).toHaveValue('');
  await expect(dialog.getByLabel('Tipo')).toHaveValue('general');
});
