/**
 * WhatsApp Preload - Anti-Fingerprinting
 *
 * Este archivo contiene código para hacer que Electron
 * parezca un Chrome real. NO interactúa con WhatsApp Web.
 */

// Este código se ejecutará en el contexto del navegador
// TypeScript solo lo compila, no valida tipos de DOM
/* eslint-disable @typescript-eslint/no-explicit-any */

const applyFingerPrintEvasion = `
(function() {
  // 1. Simular window.chrome (Chrome real lo tiene)
  if (!window.chrome) {
    const chrome = {
      app: {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }
      },
      runtime: {
        OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' },
        OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
        PlatformArch: { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
        PlatformNaclArch: { ARM: 'arm', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
        PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' },
        RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' },
        connect: function() {},
        sendMessage: function() {},
        id: undefined
      },
      csi: function() {},
      loadTimes: function() {
        return {
          requestTime: Date.now() / 1000,
          startLoadTime: Date.now() / 1000,
          commitLoadTime: Date.now() / 1000,
          finishDocumentLoadTime: Date.now() / 1000,
          finishLoadTime: Date.now() / 1000,
          firstPaintTime: Date.now() / 1000,
          firstPaintAfterLoadTime: 0,
          navigationType: 'Other',
          wasFetchedViaSpdy: false,
          wasNpnNegotiated: true,
          npnNegotiatedProtocol: 'http/1.1',
          wasAlternateProtocolAvailable: false,
          connectionInfo: 'http/1.1'
        };
      }
    };

    Object.defineProperty(window, 'chrome', {
      value: chrome,
      writable: false,
      configurable: false
    });
  }

  // 2. Ocultar navigator.webdriver (indica automatización)
  Object.defineProperty(navigator, 'webdriver', {
    get: function() { return undefined; },
    configurable: true
  });

  // 3. Simular navigator.plugins (Chrome real tiene plugins)
  try {
    const mockPlugins = {
      0: { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 1 },
      1: { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '', length: 1 },
      2: { name: 'Native Client', filename: 'internal-nacl-plugin', description: '', length: 1 },
      length: 3,
      item: function(i) { return this[i] || null; },
      namedItem: function(name) {
        for (var i = 0; i < this.length; i++) {
          if (this[i].name === name) return this[i];
        }
        return null;
      },
      refresh: function() {}
    };

    Object.defineProperty(navigator, 'plugins', {
      get: function() { return mockPlugins; },
      configurable: true
    });
  } catch (e) {
    // Ignorar si no se puede modificar
  }

  // 4. Simular navigator.languages
  try {
    Object.defineProperty(navigator, 'languages', {
      get: function() { return ['es-ES', 'es', 'en-US', 'en']; },
      configurable: true
    });
  } catch (e) {
    // Ignorar si no se puede modificar
  }

  // 5. Ocultar que las funciones son mock
  var originalToString = Function.prototype.toString;
  Function.prototype.toString = function() {
    if (this === window.chrome || this.name === 'loadTimes' || this.name === 'csi') {
      return 'function ' + (this.name || '') + '() { [native code] }';
    }
    return originalToString.call(this);
  };

  console.log('[MWS] Anti-fingerprinting applied');
})();
`;

// Inyectar el código usando contextBridge no es posible aquí
// porque necesitamos modificar el contexto de la página antes de que cargue.
// En su lugar, usamos un script que se ejecuta al inicio.

// Para que esto funcione, necesitamos inyectarlo desde main.ts
// usando executeJavaScript en 'dom-ready'

export const FINGERPRINT_EVASION_SCRIPT = applyFingerPrintEvasion;
