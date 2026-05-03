// Auth helper para tests E2E.
//
// AuthGate (frontend/src/AuthGate.jsx) almacena un timestamp en localStorage
// bajo la key `ayr_auth`. Si ese timestamp es < 15 min de antigüedad, considera
// la sesión válida y deja pasar al usuario sin pedir password.
//
// Para los E2E inyectamos el timestamp ANTES de cargar la app. Así no tocamos
// el password real (hash hardcoded en AuthGate.jsx) ni dependemos del SSO.
//
// Patrón:
//   1. page.addInitScript(...) — registra el setItem antes de cualquier
//      script de la app, para que ya esté presente cuando AuthGate.useEffect
//      hace el check inicial.
//   2. page.goto(path) — navega ya autenticado.
//
// Nota: el AYR token (X-AYR-Auth header) es algo distinto — es para que el
// worker acepte llamadas a api.onto-so.com. Se inyecta en runtime vía
// VITE_AYR_TOKEN. En tests contra dev local quedan API calls sin token, lo
// cual significa que algunas tabs verán 401 en su backend pero la UI sigue
// renderizando con datos cacheados / fallback. Es OK para los smoke tests.

const SESSION_KEY = 'ayr_auth';

/**
 * Inyecta una sesión válida en localStorage antes de cargar la app.
 * Llama esto ANTES de page.goto().
 *
 * @param {import('@playwright/test').Page} page
 */
export async function seedAuthSession(page) {
  await page.addInitScript((key) => {
    try {
      window.localStorage.setItem(key, Date.now().toString());
    } catch (e) {
      // Some browsers in incognito mode block localStorage — tests would fail
      // anyway, so we surface the error.
      // eslint-disable-next-line no-console
      console.warn('[E2E auth] localStorage seed failed', e);
    }
  }, SESSION_KEY);
}

/**
 * Atajo: seed + goto + esperar a que el AuthGate haya hecho su check.
 * Si la sesión está viva, AuthGate.checking pasa a false y muestra children.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} path - relativo a baseURL, default '/'
 */
export async function loginAndGoto(page, path = '/') {
  await seedAuthSession(page);
  await page.goto(path);
  // AuthGate hace checks async (SSO + sesión). Esperar a que el form de
  // password DESAPAREZCA es la señal más fiable de que entramos.
  // Si nunca aparece el form (sesión válida desde el inicio), también pasa.
  await page.waitForLoadState('domcontentloaded');
  // Pequeña pausa para que el primer useEffect del gate corra.
  await page.waitForTimeout(150);
}
