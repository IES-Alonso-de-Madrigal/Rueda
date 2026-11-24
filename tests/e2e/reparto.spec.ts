import { expect, test } from '@playwright/test';

test('endpoint /health responde ok y / redirige a /acceso sin sesión', async ({
  page,
  request
}) => {
  const health = await request.get('/health');
  expect(health.ok()).toBeTruthy();
  const json = await health.json();
  expect(json).toMatchObject({ status: 'ok', db: 'ok' });

  await page.goto('/');
  await expect(page).toHaveURL(/\/acceso/);
  await expect(page.getByRole('heading', { name: 'Acceso al reparto' })).toBeVisible();
});
