// Runtime config para mws.digitalclub.com.pe
// Se copia a /var/www/holape-angular/env.js en cada deploy.
(function (window) {
  window.__env = window.__env || {};
  window.__env.apiUrl = '';
  window.__env.wsUrl = 'wss://mws.digitalclub.com.pe/websocket';
  window.__env.logoPath = null;
  window.__env.appName = 'MWS';
  window.__env.title = 'MWS Desktop';
})(window);
