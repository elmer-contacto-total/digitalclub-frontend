// Runtime configuration — overwrite this file on each VM deployment.
// En cada VM, el deploy script copia deploy/env.<dominio>.js sobre este archivo.
(function (window) {
  window.__env = window.__env || {};
  // Backend API base URL — leave empty to use relative paths via nginx proxy
  window.__env.apiUrl = '';
  // WebSocket URL — must be absolute (wss://...)
  window.__env.wsUrl = '';
  // Logo path opcional. Si null, se usa el SVG embebido por defecto del sidebar.
  window.__env.logoPath = null;
  // Branding por dominio — el deploy script sobrescribe estos valores
  // con deploy/env.<dominio>.js (InFinance, MWS, ...).
  window.__env.appName = 'App';
  window.__env.title = 'App';
})(window);
