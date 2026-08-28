import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

test('Feedback · admin responde RESUELTO y el usuario ve la respuesta después', async ({ page }) => {
  await mockApi(page, {
    isAdmin: true,
    initialFeedback: [{ id: 'freeze-1', category: 'bug', message: 'Entrena tus grandes cagadas se queda congelado.', status: 'new' }],
  });
  await login(page);

  await page.getByRole('button', { name: '2 usuarios online', exact: true }).click();
  const feedbackSection = page.getByRole('region', { name: 'Feedback de usuarios' });
  await expect(feedbackSection).toBeVisible();
  await expect(feedbackSection.getByText('Entrena tus grandes cagadas se queda congelado.', { exact: true })).toBeVisible();

  const reply = feedbackSection.getByLabel('Responder a e2e');
  await reply.fill('RESUELTO: corregido y protegido con watchdog.');
  await feedbackSection.getByRole('button', { name: 'Responder + resolver', exact: true }).click();
  await expect(feedbackSection.getByText('No queda feedback pendiente. Milagro administrativo.', { exact: true })).toBeVisible();
  const resolved = feedbackSection.locator('details.admin-feedback-resolved');
  await resolved.locator('summary').click();
  await expect(resolved.getByText('RESUELTO: corregido y protegido con watchdog.', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '← Volver al menú', exact: true }).click();
  await page.getByRole('button', { name: 'Enviar feedback', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Dinos qué mejorar' });
  const history = dialog.locator('details.feedback-thread-history');
  await expect(history).toBeVisible();
  await history.locator('summary').click();
  await expect(history.getByText('RESUELTO: corregido y protegido con watchdog.', { exact: true })).toBeVisible();
  await expect(history.getByText(/Resuelto/)).toBeVisible();
});

test('Feedback · adjunta PNG y envía sin deformar ni romper la cabecera', async ({ page }) => {
  await mockApi(page);
  await login(page);
  const trigger = page.getByRole('button', { name: 'Enviar feedback', exact: true });
  const before = await trigger.boundingBox();
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: 'Dinos qué mejorar' });
  const input = dialog.locator('input[type="file"]');
  await input.setInputFiles({
    name: 'captura.png',
    mimeType: 'image/png',
    buffer: Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000000020001e221bc330000000049454e44ae426082', 'hex'),
  });
  await expect(dialog.getByLabel('Imágenes seleccionadas').getByText('captura.png', { exact: true })).toBeVisible();
  await dialog.getByLabel('¿Qué pasó o qué cambiarías?').fill('Bug con captura adjunta.');
  await dialog.getByRole('button', { name: 'Enviar feedback', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Feedback enviado. Gracias.' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();

  const after = await trigger.boundingBox();
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(Math.abs(after.width - before.width)).toBeLessThan(1);
  expect(Math.abs(after.height - before.height)).toBeLessThan(1);
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
});


test('Feedback · admin puede borrar un mensaje de prueba', async ({ page }) => {
  await mockApi(page, {
    isAdmin: true,
    initialFeedback: [{ id: 'test-delete-1', category: 'general', message: 'Mensaje de prueba para borrar.', status: 'new' }],
  });
  await login(page);
  await page.getByRole('button', { name: '2 usuarios online', exact: true }).click();
  const feedbackSection = page.getByRole('region', { name: 'Feedback de usuarios' });
  await expect(feedbackSection.getByText('Mensaje de prueba para borrar.', { exact: true })).toBeVisible();
  await feedbackSection.getByRole('button', { name: 'Borrar feedback', exact: true }).click();
  const deleteDialog = page.getByRole('dialog', { name: '¿Borrar este feedback?' });
  await expect(deleteDialog).toBeVisible();
  await deleteDialog.getByRole('button', { name: 'Borrar definitivamente', exact: true }).click();
  await expect(feedbackSection.getByText('Mensaje de prueba para borrar.', { exact: true })).toHaveCount(0);
});

test('Feedback · resuelto mantiene Reabrir y Borrar feedback visibles', async ({ page }) => {
  await mockApi(page, {
    isAdmin: true,
    initialFeedback: [{ id: 'resolved-delete-1', category: 'general', message: 'Mensaje resuelto de prueba.', status: 'resolved' }],
  });
  await login(page);
  await page.getByRole('button', { name: '2 usuarios online', exact: true }).click();
  const feedbackSection = page.getByRole('region', { name: 'Feedback de usuarios' });
  const resolved = feedbackSection.locator('details.admin-feedback-resolved');
  await resolved.locator('summary').click();
  await expect(resolved.getByRole('button', { name: 'Reabrir', exact: true })).toBeVisible();
  await expect(resolved.getByRole('button', { name: 'Borrar feedback', exact: true })).toBeVisible();
  await resolved.getByRole('button', { name: 'Borrar feedback', exact: true }).click();
  const deleteDialog = page.getByRole('dialog', { name: '¿Borrar este feedback?' });
  await expect(deleteDialog).toBeVisible();
  await deleteDialog.getByRole('button', { name: 'Borrar definitivamente', exact: true }).click();
  await expect(resolved.getByText('Mensaje resuelto de prueba.', { exact: true })).toHaveCount(0);
});

test('Feedback · admin ve un sobre en Home cuando hay mensajes nuevos', async ({ page }) => {
  await mockApi(page, {
    isAdmin: true,
    initialFeedback: [{ id: 'inbox-1', category: 'ux', message: 'Feedback recién llegado.', status: 'new' }],
  });
  await login(page);
  const inbox = page.getByRole('button', { name: '1 feedback nuevo', exact: true });
  await expect(inbox).toBeVisible();
  await inbox.click();
  const feedbackSection = page.getByRole('region', { name: 'Feedback de usuarios' });
  await expect(feedbackSection).toBeVisible();
  await expect(feedbackSection.getByText('Feedback recién llegado.', { exact: true })).toBeVisible();
});


test('Feedback · admin puede crear una prueba real y borrarla desde la misma bandeja', async ({ page }) => {
  await mockApi(page, { isAdmin: true, initialFeedback: [] });
  await login(page);
  await page.getByRole('button', { name: '2 usuarios online', exact: true }).click();
  const feedbackSection = page.getByRole('region', { name: 'Feedback de usuarios' });
  await feedbackSection.getByRole('button', { name: 'Crear feedback de prueba', exact: true }).click();
  await expect(feedbackSection.getByText('Feedback de prueba generado desde Admin.', { exact: true })).toBeVisible();
  await feedbackSection.getByRole('button', { name: 'Borrar feedback', exact: true }).click();
  const deleteDialog = page.getByRole('dialog', { name: '¿Borrar este feedback?' });
  await expect(deleteDialog).toBeVisible();
  await deleteDialog.getByRole('button', { name: 'Borrar definitivamente', exact: true }).click();
  await expect(feedbackSection.getByText('Feedback de prueba generado desde Admin.', { exact: true })).toHaveCount(0);
});
