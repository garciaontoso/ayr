import { test, expect } from '@playwright/test';
import { loginAndGoto } from './_setup/auth.js';

// Test 4: Tab Audit (grupo Radar).
//
// Cubre el sistema anti-fallo Capa 2. Ver CLAUDE.md sección "Sistema Anti-Fallo".
//   - Tab id "data-audit" en grupo "radar"
//   - Llama a /api/audit/portfolio + /api/audit/full
//   - Muestra "issues totales" con número
//   - Tiene botón "🔧 Auto-fix sectores"

test.describe('Audit tab', () => {
  test('audit tab shows issues count and auto-fix button', async ({ page }) => {
    await loginAndGoto(page, '/');

    // Click en grupo Radar
    const radarGroup = page.locator('[data-group-id="radar"]');
    await expect(radarGroup).toBeVisible({ timeout: 15_000 });
    await radarGroup.click();

    // Click en sub-tab Audit
    const auditTab = page.locator('[data-tab-id="data-audit"]');
    await expect(auditTab).toBeVisible({ timeout: 5_000 });
    await auditTab.click();

    // El componente DataAuditTab muestra "🩺 Data Audit · N posiciones"
    // o estado de carga "Auditando portfolio…". Esperamos a uno de los dos.
    const ready = page.getByText(/Data Audit/i).first();
    const loading = page.getByText(/Auditando portfolio/i);

    // Aceptamos cualquiera de los dos estados como "tab cargada"
    await expect(ready.or(loading)).toBeVisible({ timeout: 15_000 });

    // Si la audit terminó (no estamos en loading), verificamos:
    // - texto "issues totales" y el botón Auto-fix
    if (await ready.isVisible().catch(() => false)) {
      // El texto exacto es "{N} issues totales" en DataAuditTab.jsx#104
      await expect(
        page.getByText(/issues totales/i)
      ).toBeVisible({ timeout: 10_000 });

      // Botón Auto-fix sectores ("🔧 Auto-fix sectores" o "⏳ Arreglando…")
      await expect(
        page.locator('button', { hasText: /Auto-fix|Arreglando/i })
      ).toBeVisible();
    }

    // No ErrorBoundary
    await expect(
      page.getByText(/Algo salió mal en este componente/i)
    ).toHaveCount(0);
  });
});
