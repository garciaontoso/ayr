import { test, expect } from '@playwright/test';
import { loginAndGoto } from './_setup/auth.js';

// Test 1: Portfolio renderiza sin crashear.
//
// Smoke test del flujo principal. Cubre:
//   - AuthGate skip vía localStorage seed
//   - Carga del bundle React + lazy chunks
//   - Tab "Cartera" → "Portfolio" activa por defecto
//   - Al menos 1 fila de portfolio renderizada (o estado vacío explícito)
//   - Sin ErrorBoundary disparado ("Algo salió mal en este componente")

test.describe('Portfolio loads', () => {
  test('portfolio renders without crashing', async ({ page }) => {
    // Capturamos errores de consola para inspección posterior. Filtramos los
    // 401/403 de endpoints protegidos (audit/positions sin token) que son
    // esperables en local sin VITE_AYR_TOKEN.
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Network 401/403 ruido conocido en local sin token
        if (/\b(401|403)\b/.test(text)) return;
        // ResizeObserver loop: bug benigno del navegador
        if (text.includes('ResizeObserver')) return;
        consoleErrors.push(text);
      }
    });

    await loginAndGoto(page, '/');

    // ErrorBoundary visible ⇒ algo crasheó. Su título es uno de:
    //   - "Algo salió mal en este componente"
    //   - "Nueva versión disponible" (chunk error → auto-recargas)
    //   - "Esta vista no está disponible offline"
    const errorBoundaryTitle = page.getByText(/Algo salió mal en este componente/i);
    await expect(errorBoundaryTitle).toHaveCount(0);

    // El default homeTab es "portfolio" (App.jsx#369), así que debería ya
    // estar pintando filas. Esperamos por la nav superior.
    const radarGroup = page.locator('[data-group-id="cartera"]');
    await expect(radarGroup).toBeVisible({ timeout: 15_000 });

    // Click explícito a Portfolio por si el default cambió.
    const portfolioTab = page.locator('[data-tab-id="portfolio"]');
    await portfolioTab.click({ trial: false });

    // En producción debería haber rows. En local con CORS bloqueado, al menos
    // el contenedor de la tabla debería existir (aunque sin filas).
    // Buscamos con OR: row del portfolio O mensaje de empty/loading.
    const tableRow = page.locator('table tbody tr').first();
    const emptyText = page.getByText(/sin posiciones|cargando|loading|no hay datos/i).first();
    await expect(tableRow.or(emptyText)).toBeVisible({ timeout: 15_000 });

    // Final screenshot para histórico (Playwright lo guarda solo si pasa
    // cuando screenshot:'only-on-failure'; aquí lo hacemos explícito).
    await page.screenshot({ path: 'test-results/portfolio-loads.png', fullPage: false });

    // No debería haber errores raros más allá de los esperados.
    if (consoleErrors.length > 0) {
      // eslint-disable-next-line no-console
      console.log('Console errors detected (informational, not failing):', consoleErrors);
    }
  });
});
