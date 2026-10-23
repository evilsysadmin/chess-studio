import { expect, test } from '@playwright/test';
import { login, mockApi, openFeedback } from './helpers.js';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000000020001e221bc330000000049454e44ae426082', 'hex');

test('Feedback · red caída conserva descripción, no promete conservar adjuntos ni falsifica éxito', async ({ page }) => {
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
  await confirmed.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await openFeedback(page);
  dialog = page.getByRole('dialog', { name: 'Dinos qué mejorar' });
  await expect(dialog.getByLabel('¿Qué pasó o qué cambiarías?')).toHaveValue('');
  await expect(dialog.getByLabel('Tipo')).toHaveValue('general');
});
