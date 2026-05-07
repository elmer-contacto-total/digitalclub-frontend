/**
 * Safe navigation helpers para casos donde se necesita full page reload
 * (cambio de sesión, login-as, impersonación, cambio de cliente activo).
 *
 * Para navegación normal usar Router.navigate.
 *
 * SECURITY: estos helpers validan que el path destino sea interno antes de
 * hacer `window.location.href = ...` o `window.location.reload()`. Si en el
 * futuro alguien pasa una URL externa (por bug o por input no validado), el
 * helper la bloquea y redirige a /app/dashboard como fallback seguro.
 */

const ALLOWED_INTERNAL_PATHS = [
  '/app/dashboard',
  '/app/clients',
  '/auth/login',
];

/**
 * Recarga la app navegando a una ruta interna. Usar SOLO cuando se necesita
 * forzar reinicialización completa (cambio de sesión, login-as, impersonación).
 *
 * Acepta paths absolutos que empiecen con `/` y estén en la whitelist (o sean
 * sub-paths de `/app/` o `/auth/`). Cualquier otro valor (URL externa, javascript:,
 * data:, protocolo-relativo `//`) es bloqueado y se redirige a /app/dashboard.
 */
export function safeFullReload(internalPath: string): void {
  if (!internalPath.startsWith('/') || internalPath.startsWith('//')) {
    console.error('[Security] Blocked redirect to non-internal path:', internalPath);
    internalPath = '/app/dashboard';
  } else {
    const isWhitelisted = ALLOWED_INTERNAL_PATHS.includes(internalPath) ||
                          internalPath.startsWith('/app/') ||
                          internalPath.startsWith('/auth/');
    if (!isWhitelisted) {
      console.error('[Security] Blocked redirect to non-whitelisted path:', internalPath);
      internalPath = '/app/dashboard';
    }
  }
  window.location.href = internalPath;
}

/**
 * Reload de la página actual. SOLO para cuando el JWT cambió (cambio de cliente
 * activo, etc.) y todo el estado de la app debe reinicializarse.
 */
export function safeReload(): void {
  window.location.reload();
}
