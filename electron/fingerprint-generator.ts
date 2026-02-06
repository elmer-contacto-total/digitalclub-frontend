/**
 * Generador de Fingerprint Único por Instalación
 *
 * Cada instalación genera y guarda su propio fingerprint
 * para parecer una instancia única de Chrome.
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';

interface UserFingerprint {
  odaId: string;
  chromeVersion: string;
  userAgent: string;
  plugins: Array<{ name: string; filename: string; description: string }>;
  languages: string[];
  platform: string;
  createdAt: string;
}

// Versiones de Chrome realistas (actualizar periódicamente)
const CHROME_VERSIONS = [
  '120.0.0.0', '121.0.0.0', '122.0.0.0', '123.0.0.0', '124.0.0.0'
];

// Plugins que Chrome real puede tener
const POSSIBLE_PLUGINS = [
  { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
  { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
  { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
];

// Obtener idiomas reales del sistema operativo
function getSystemLanguages(): string[] {
  try {
    // Obtener locale del sistema
    const systemLocale = app.getLocale(); // ej: "es-PE", "en-US"
    const lang = systemLocale.split('-')[0]; // ej: "es", "en"

    // Construir lista realista basada en el sistema real
    const languages = [systemLocale];

    // Agregar variante sin región si es diferente
    if (!languages.includes(lang)) {
      languages.push(lang);
    }

    // Agregar inglés como fallback (muy común)
    if (lang !== 'en') {
      languages.push('en-US', 'en');
    }

    return languages;
  } catch (err) {
    // Fallback seguro
    return ['es', 'en-US', 'en'];
  }
}

// Obtener plataforma real del sistema
function getSystemPlatform(): string {
  const platform = os.platform();
  if (platform === 'win32') return 'Win32';
  if (platform === 'darwin') return 'MacIntel';
  if (platform === 'linux') return 'Linux x86_64';
  return 'Win32';
}

function generateUniqueId(): string {
  return crypto.randomBytes(16).toString('hex');
}

function selectRandom<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function selectRandomSubset<T>(array: T[], min: number, max: number): T[] {
  const count = min + Math.floor(Math.random() * (max - min + 1));
  const shuffled = [...array].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function generateFingerprint(): UserFingerprint {
  const chromeVersion = selectRandom(CHROME_VERSIONS);
  const plugins = selectRandomSubset(POSSIBLE_PLUGINS, 2, 3);
  const languages = getSystemLanguages(); // Usar idioma REAL del sistema
  const platform = getSystemPlatform(); // Usar plataforma REAL

  // User-Agent basado en plataforma real
  let userAgent: string;
  if (platform === 'MacIntel') {
    userAgent = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
  } else if (platform === 'Linux x86_64') {
    userAgent = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
  } else {
    userAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
  }

  return {
    odaId: generateUniqueId(),
    chromeVersion,
    userAgent,
    plugins,
    languages,
    platform,
    createdAt: new Date().toISOString()
  };
}

function getFingerprintPath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'device-fingerprint.json');
}

export function getOrCreateFingerprint(): UserFingerprint {
  const fingerprintPath = getFingerprintPath();

  // Intentar cargar fingerprint existente
  if (fs.existsSync(fingerprintPath)) {
    try {
      const data = fs.readFileSync(fingerprintPath, 'utf-8');
      const fingerprint = JSON.parse(data) as UserFingerprint;
      console.log('[MWS] Fingerprint cargado:', fingerprint.odaId.substring(0, 8) + '...');
      return fingerprint;
    } catch (err) {
      console.error('[MWS] Error cargando fingerprint, generando nuevo...');
    }
  }

  // Generar nuevo fingerprint
  const fingerprint = generateFingerprint();

  try {
    // Asegurar que el directorio existe
    const dir = path.dirname(fingerprintPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fingerprintPath, JSON.stringify(fingerprint, null, 2));
    console.log('[MWS] Nuevo fingerprint generado:', fingerprint.odaId.substring(0, 8) + '...');
  } catch (err) {
    console.error('[MWS] Error guardando fingerprint:', err);
  }

  return fingerprint;
}

export function generateEvasionScript(fingerprint: UserFingerprint): string {
  const pluginsJson = JSON.stringify(fingerprint.plugins);
  const languagesJson = JSON.stringify(fingerprint.languages);

  return `
(function() {
  // Fingerprint único para esta instalación: ${fingerprint.odaId.substring(0, 8)}...

  // 1. Simular window.chrome
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
          npnNegotiatedProtocol: 'h2',
          wasAlternateProtocolAvailable: false,
          connectionInfo: 'h2'
        };
      }
    };

    Object.defineProperty(window, 'chrome', {
      value: chrome,
      writable: false,
      configurable: false
    });
  }

  // 2. Ocultar navigator.webdriver
  Object.defineProperty(navigator, 'webdriver', {
    get: function() { return undefined; },
    configurable: true
  });

  // 3. Simular navigator.plugins (único por instalación)
  try {
    const pluginData = ${pluginsJson};
    const mockPlugins = {
      length: pluginData.length,
      item: function(i) { return this[i] || null; },
      namedItem: function(name) {
        for (var i = 0; i < this.length; i++) {
          if (this[i] && this[i].name === name) return this[i];
        }
        return null;
      },
      refresh: function() {}
    };

    pluginData.forEach(function(p, i) {
      mockPlugins[i] = {
        name: p.name,
        filename: p.filename,
        description: p.description,
        length: 1
      };
    });

    Object.defineProperty(navigator, 'plugins', {
      get: function() { return mockPlugins; },
      configurable: true
    });
  } catch (e) {}

  // 4. Simular navigator.languages (único por instalación)
  try {
    Object.defineProperty(navigator, 'languages', {
      get: function() { return ${languagesJson}; },
      configurable: true
    });
  } catch (e) {}

  // 5. Simular navigator.platform
  try {
    Object.defineProperty(navigator, 'platform', {
      get: function() { return '${fingerprint.platform}'; },
      configurable: true
    });
  } catch (e) {}

  // 6. Ocultar que las funciones son mock
  var originalToString = Function.prototype.toString;
  Function.prototype.toString = function() {
    if (this === window.chrome || this.name === 'loadTimes' || this.name === 'csi') {
      return 'function ' + (this.name || '') + '() { [native code] }';
    }
    return originalToString.call(this);
  };

  console.log('[MWS] Fingerprint aplicado');
})();
`;
}

export { UserFingerprint };
