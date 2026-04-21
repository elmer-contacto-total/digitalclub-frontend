// Runtime configuration — overwrite this file on each VM deployment
// Example for nginx: copy env.infinance.js or env.mws.js over this file
(function (window) {
  window.__env = window.__env || {};
  // Backend API base URL — leave empty to use relative paths via nginx proxy
  window.__env.apiUrl = '';
  // WebSocket URL — must be absolute
  window.__env.wsUrl = '';
})(window);
