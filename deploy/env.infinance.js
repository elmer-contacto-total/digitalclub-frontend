// Runtime config para infinance.innovag.com.pe
// Se copia a /var/www/holape-angular/env.js en cada deploy.
(function (window) {
  window.__env = window.__env || {};
  window.__env.apiUrl = '';
  window.__env.wsUrl = 'wss://infinance.innovag.com.pe/websocket';
  window.__env.logoPath = '/assets/images/logo-sip.png';
  window.__env.appName = 'InFinance';
  window.__env.title = 'InFinance Cobranza';
  window.__env.simplifiedRoles = true;
})(window);
