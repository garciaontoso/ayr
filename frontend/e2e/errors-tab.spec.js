import { test, expect } from '@playwright/test';
import { loginAndGoto } from './_setup/auth.js';

// Test 5: Tab Errors (grupo Radar).
//
// La tab Errors es Semana 1 del roadmap (error tracking propio). Ver
// frontend/src/components/home/ErrorsTab.jsx.
//
// Cubre:
//   - Cards "Últimas 24h", "Últimos 7d", "Total 30d" visibles
//   - Filtros de severity (all / error / warn / info)
//   - Tabla de errores O mensaje "Sin errores"

test.describe('Errors tab', () => {
  test('errors tab shows stat cards and severity filter', async ({ page }) => {
    await loginAndGoto(page, '/');

    // Click en grupo Radar
    await page.locator('[data-group-id="radar"]').click();

    // Click en sub-tab Errors
    const errorsTab = page.locator('[data-tab-id="errors"]');
    await expect(errorsTab).toBeVisible({ timeout: 15_000 });
    await errorsTab.click();

    // Cards de stats. ErrorsTab.jsx#202-204
    await expect(page.getByText(/Últimas 24h/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Últimos 7d/i)).toBeVisible();
    await expect(page.getByText(/Total 30d/i)).toBeVisible();

    // Filtros de severity. ErrorsTab.jsx#230 — botones con "Todos" + "error"
    // + "warn" + "info"
    await expect(page.locator('button', { hasText: /^Todos$/ })).toBeVisible();
    await expect(page.locator('button', { hasText: /^error$/ })).toBeVisible();
    await expect(page.locator('button', { hasText: /^warn$/ })).toBeVisible();
    await expect(page.locator('button', { hasText: /^info$/ })).toBeVisible();

    // Tabla de errores O mensaje vacío. Aceptamos ambos como pass.
    const table = page.locator('table tbody tr').first();
    const empty = page.getByText(/Sin errores/i);
    const loading = page.getByText(/Cargando errores/i);

    await expect(table.or(empty).or(loading)).toBeVisible({ timeout: 15_000 });

    // No ErrorBoundary
    await expect(
      page.getByText(/Algo salió mal en este componente/i)
    ).toHaveCount(0);
  });
});
