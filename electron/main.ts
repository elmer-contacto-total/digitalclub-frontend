import {
  app,
  BrowserWindow,
  BrowserView,
  globalShortcut,
  clipboard,
  ipcMain,
  session
} from 'electron';
import * as path from 'path';
import { getOrCreateFingerprint, generateEvasionScript, UserFingerprint } from './fingerprint-generator';
import {
  initializeMediaSecurity,
  MediaCapturePayload,
  AuditLogPayload,
  RawMediaCaptureData,
  generateMediaId
} from './media-security';

// Fingerprint único para esta instalación
let userFingerprint: UserFingerprint;

let mainWindow: BrowserWindow | null = null;
let whatsappView: BrowserView | null = null;
let lastClipboard = '';
let lastScannedMessages: Set<string> = new Set();

// Estado de visibilidad de WhatsApp
let whatsappVisible = false;
let whatsappInitialized = false;

// Usuario logueado en Angular (para asociar medios capturados)
let loggedInUserId: number | null = null;
let loggedInUserName: string | null = null;

// Cliente activo en el chat (para asociar medios al cliente)
let activeClientUserId: number | null = null;
let activeClientPhone: string | null = null;
let activeClientName: string | null = null;

// Estado del bloqueo de chat (sistema robusto con verificación)
interface ChatBlockState {
  isBlocked: boolean;
  expectedPhone: string | null;  // Teléfono que esperamos que Angular cargue
  waitingForManualExtraction: boolean; // True si estamos esperando que el usuario extraiga el número manualmente
  timeoutHandle: NodeJS.Timeout | null;
}
const chatBlockState: ChatBlockState = {
  isBlocked: false,
  expectedPhone: null,
  waitingForManualExtraction: false,
  timeoutHandle: null
};
const CHAT_BLOCK_TIMEOUT = 10000; // 10 segundos máximo de bloqueo

// Configuración de dimensiones (debe coincidir con CSS variables en styles.scss)
const SIDEBAR_WIDTH = 220;
const SIDEBAR_COLLAPSED = 56;

// URL del backend para medios y auditoría
const MEDIA_API_URL = process.env.MEDIA_API_URL || 'http://digitalclub.contactototal.com.pe/api/v1/media';

// Estado dinámico del layout
let sidebarCollapsed = false;


// ==================== FUNCIONES DE ENVÍO AL BACKEND ====================

/**
 * Envía un log de auditoría al backend
 */
async function sendAuditLog(payload: AuditLogPayload): Promise<void> {
  try {
    const response = await fetch(`${MEDIA_API_URL}/audit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error('[HablaPe Audit] Error enviando log:', response.status);
    } else {
      console.log('[HablaPe Audit] Log registrado:', payload.action);
    }
  } catch (err) {
    console.error('[HablaPe Audit] Error de conexión:', err);
    // TODO: Implementar cola offline para reintentos
  }
}

/**
 * Envía un medio capturado al backend
 */
async function sendMediaToServer(payload: MediaCapturePayload): Promise<void> {
  try {
    const response = await fetch(`${MEDIA_API_URL}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error('[HablaPe Media] Error enviando medio:', response.status);
    } else {
      console.log('[HablaPe Media] Medio guardado:', payload.mediaType, payload.size, 'bytes');

      // Registrar en auditoría
      sendAuditLog({
        action: 'MEDIA_CAPTURED',
        userId: payload.userId,
        agentId: payload.agentId,
        mimeType: payload.mimeType,
        size: payload.size,
        chatPhone: payload.chatPhone,
        timestamp: payload.capturedAt,
        description: `${payload.mediaType} capturado del chat ${payload.chatPhone}`,
        filename: `${payload.mediaId}.${payload.mimeType?.split('/')[1] || 'bin'}`,
        metadata: {
          mediaId: payload.mediaId,
          source: payload.source,
          chatName: payload.chatName,
          whatsappMessageId: payload.whatsappMessageId,
          messageSentAt: payload.messageSentAt,
          duration: payload.duration
        }
      });
    }
  } catch (err) {
    console.error('[HablaPe Media] Error de conexión:', err);
    // TODO: Implementar cola offline para reintentos
  }
}

/**
 * Callback para manejar medios capturados desde el BrowserView
 * Agrega agentId, clientUserId, y usa datos del cliente activo de Angular
 *
 * IMPORTANTE: Prioridad de datos para evitar cruce de chats:
 * 1. data.chatPhone (del script, capturado al momento de la captura) - MÁS CONFIABLE
 * 2. activeClientPhone (de Angular) - solo si coincide con el script
 * 3. lastDetectedPhone (del chat scanner) - fallback
 */
function handleMediaCaptured(data: RawMediaCaptureData): void {
  console.log('[HablaPe Media] ========== MEDIA CAPTURE START ==========');
  console.log('[HablaPe Media] Estado actual de loggedInUserId:', loggedInUserId);
  console.log('[HablaPe Media] Datos recibidos del script:');
  console.log('[HablaPe Media]   chatPhone:', data.chatPhone);
  console.log('[HablaPe Media]   chatName:', data.chatName);
  console.log('[HablaPe Media]   messageSentAt:', data.messageSentAt);
  console.log('[HablaPe Media]   whatsappMessageId:', data.whatsappMessageId);
  console.log('[HablaPe Media]   type:', data.type);
  console.log('[HablaPe Media]   size:', data.size);

  const isImage = data.type.startsWith('image/');
  const isAudio = data.type.startsWith('audio/');

  if (!isImage && !isAudio) {
    console.log('[HablaPe Media] Tipo no soportado ignorado:', data.type);
    return;
  }

  // PRIORIDAD CORREGIDA: Script > Angular > Chat Scanner
  // El script captura el teléfono al momento exacto de la captura, evitando cruces de chat
  const scriptPhone = data.chatPhone && data.chatPhone !== 'unknown' ? data.chatPhone : null;
  const effectiveChatPhone = scriptPhone || activeClientPhone || lastDetectedPhone || 'unknown';

  // Lo mismo para el nombre
  const scriptName = data.chatName || null;
  const effectiveChatName = scriptName || activeClientName || lastDetectedName || null;

  // Normalizar teléfonos para comparación (quitar + y espacios)
  const normalizePhone = (p: string | null) => p ? p.replace(/[^\d]/g, '') : null;
  const normalizedScriptPhone = normalizePhone(scriptPhone);
  const normalizedActivePhone = normalizePhone(activeClientPhone);

  // SOLO enviar clientUserId si el teléfono del script coincide con el teléfono de Angular
  // Esto evita asignar un clientUserId de otro chat
  let effectiveClientUserId: number | null = null;
  if (activeClientUserId && normalizedScriptPhone && normalizedActivePhone) {
    // Comparar últimos 9 dígitos (para ignorar código de país)
    const scriptLast9 = normalizedScriptPhone.slice(-9);
    const activeLast9 = normalizedActivePhone.slice(-9);

    if (scriptLast9 === activeLast9) {
      effectiveClientUserId = activeClientUserId;
      console.log('[HablaPe Media] clientUserId CONFIRMADO - teléfonos coinciden:', scriptLast9);
    } else {
      console.log('[HablaPe Media] clientUserId DESCARTADO - teléfonos NO coinciden:');
      console.log('[HablaPe Media]   script:', scriptLast9, 'vs angular:', activeLast9);
    }
  }

  const payload: MediaCapturePayload = {
    mediaId: generateMediaId(),
    userId: userFingerprint.odaId,
    agentId: loggedInUserId, // Include logged-in agent ID
    clientUserId: effectiveClientUserId, // Solo si coinciden los teléfonos
    chatPhone: effectiveChatPhone,
    chatName: effectiveChatName,
    mediaType: isImage ? 'IMAGE' : 'AUDIO',
    mimeType: data.type,
    data: data.data,
    size: data.size,
    duration: data.duration,
    capturedAt: data.timestamp,
    messageSentAt: data.messageSentAt,
    whatsappMessageId: data.whatsappMessageId,
    source: data.source as 'PREVIEW' | 'PLAYBACK'
  };

  console.log('[HablaPe Media] Active client state (from Angular):');
  console.log('[HablaPe Media]   activeClientUserId:', activeClientUserId);
  console.log('[HablaPe Media]   activeClientPhone:', activeClientPhone);
  console.log('[HablaPe Media]   activeClientName:', activeClientName);
  console.log('[HablaPe Media] Chat scanner state:');
  console.log('[HablaPe Media]   lastDetectedPhone:', lastDetectedPhone);
  console.log('[HablaPe Media]   lastDetectedName:', lastDetectedName);
  console.log('[HablaPe Media] Payload FINAL a enviar:');
  console.log('[HablaPe Media]   agentId:', payload.agentId);
  console.log('[HablaPe Media]   clientUserId:', payload.clientUserId);
  console.log('[HablaPe Media]   chatPhone:', payload.chatPhone);
  console.log('[HablaPe Media]   chatName:', payload.chatName);
  console.log('[HablaPe Media]   messageSentAt:', payload.messageSentAt);
  console.log('[HablaPe Media] ========== SENDING TO SERVER ==========');
  sendMediaToServer(payload);
}

// Estado para animación suave
let currentBounds = { x: SIDEBAR_WIDTH, width: 0 };
let animationFrame: NodeJS.Timeout | null = null;
const ANIMATION_DURATION = 200; // ms - debe coincidir con CSS transition
const ANIMATION_STEPS = 12; // frames para la animación

function createWindow(): void {
  // Crear ventana principal
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1400,
    minHeight: 700,
    frame: false, // Frameless para custom titlebar
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 15, y: 15 },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false,  // Deshabilitado para permitir módulos ES6 de Angular
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: path.join(__dirname, 'preload.js')
    },
    backgroundColor: '#09090b'
  });

  // Cargar la UI de Angular desde URL (producción por defecto)
  const ANGULAR_URL = process.env.ANGULAR_URL || 'http://digitalclub.contactototal.com.pe/';

  // Flag para evitar mostrar overlays duplicados
  let appLoadedSuccessfully = false;
  let errorOverlayShown = false;

  // Manejar errores de carga - SOLO para la página principal, no recursos secundarios
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    // Solo mostrar error si es el frame principal y no es un error de sub-recurso
    if (!isMainFrame) {
      console.warn(`[HablaPe] Error cargando recurso secundario: ${errorCode} - ${errorDescription} - ${validatedURL}`);
      return;
    }

    // Ignorar errores de cancelación (usuario navegó a otra página)
    if (errorCode === -3) { // ERR_ABORTED
      console.log('[HablaPe] Carga cancelada (navegación)');
      return;
    }

    console.error(`[HablaPe] Error cargando página principal: ${errorCode} - ${errorDescription}`);
    errorOverlayShown = true;

    // Mostrar página de error con opción de reintentar
    const errorHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            background: #09090b;
            color: #fafafa;
            font-family: system-ui, -apple-system, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
          }
          h1 { color: #ef4444; margin-bottom: 1rem; }
          p { color: #a1a1aa; margin-bottom: 2rem; text-align: center; }
          button {
            background: #22c55e;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
          }
          button:hover { background: #16a34a; }
          .error-code { font-size: 12px; color: #71717a; margin-top: 1rem; }
        </style>
      </head>
      <body>
        <h1>No se pudo conectar</h1>
        <p>Verifica tu conexión a internet y que el servidor esté disponible.</p>
        <button onclick="location.href='${ANGULAR_URL}'">Reintentar</button>
        <p class="error-code">Error: ${errorCode} - ${errorDescription}</p>
      </body>
      </html>
    `;
    mainWindow?.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHTML)}`);
  });

  mainWindow.loadURL(ANGULAR_URL);

  // DevTools solo en desarrollo o con variable de entorno
  if (ANGULAR_URL.includes('localhost') || process.env.HOLAPE_DEBUG) {
    mainWindow.webContents.openDevTools();
  }

  // Log cuando termine de cargar y verificar si la página está en blanco
  mainWindow.webContents.on('did-finish-load', () => {
    const loadedURL = mainWindow?.webContents.getURL();
    console.log('[HolaPe] Página cargada:', loadedURL);
    console.log('[HolaPe] URL esperada:', ANGULAR_URL);

    // No verificar si ya mostramos un error o si es una página de error
    if (errorOverlayShown || loadedURL?.startsWith('data:')) {
      console.log('[HolaPe] Saltando verificación (error overlay activo o página de error)');
      return;
    }

    // Verificar el contenido en múltiples intentos para detectar pantalla gris
    let checkCount = 0;
    const maxChecks = 3;
    const checkInterval = 2000; // 2 segundos entre checks

    const checkPageContent = async () => {
      // Cancelar si ya cargó exitosamente o si se mostró un error
      if (!mainWindow || appLoadedSuccessfully || errorOverlayShown) return;
      checkCount++;

      try {
        const pageInfo = await mainWindow.webContents.executeJavaScript(`
          (function() {
            const bodyLen = document.body.innerHTML.length;
            const hasAppRoot = !!document.querySelector('app-root');
            const hasRouterOutlet = !!document.querySelector('router-outlet');
            const hasVisibleContent = document.body.innerText.trim().length > 50;
            const hasLoginForm = !!document.querySelector('form[class*="login"], input[type="password"]');
            const hasDashboard = !!document.querySelector('[class*="dashboard"], [class*="sidebar"]');
            const hasHeader = !!document.querySelector('[class*="header"], header');
            const hasAngularComponent = !!document.querySelector('[_ngcontent], [ng-version]');
            return {
              bodyLen,
              hasAppRoot,
              hasRouterOutlet,
              hasVisibleContent,
              hasLoginForm,
              hasDashboard,
              hasHeader,
              hasAngularComponent,
              isLoaded: hasLoginForm || hasDashboard || hasHeader || (hasAppRoot && hasAngularComponent && bodyLen > 1000)
            };
          })()
        `);

        console.log('[HolaPe Debug] Page check #' + checkCount + ':', pageInfo);

        // Si Angular cargó correctamente, marcar como exitoso
        if (pageInfo.isLoaded) {
          console.log('[HolaPe] Angular cargado correctamente');
          appLoadedSuccessfully = true;
          return;
        }

        // Si aún no cargó y tenemos más intentos, seguir esperando
        if (checkCount < maxChecks) {
          setTimeout(checkPageContent, checkInterval);
          return;
        }

        // Después de todos los intentos, si no hay contenido visible, mostrar recovery
        // Pero solo si no se mostró ya un error
        if (!errorOverlayShown && (!pageInfo.hasVisibleContent || !pageInfo.hasAppRoot)) {
          console.log('[HolaPe] Página sin contenido después de ' + (checkCount * checkInterval / 1000) + 's, mostrando recovery');
          showRecoveryOverlay();
        }
      } catch (err) {
        console.error('[HolaPe] Error verificando página:', err);
        if (checkCount < maxChecks && !errorOverlayShown) {
          setTimeout(checkPageContent, checkInterval);
        } else if (!errorOverlayShown) {
          showRecoveryOverlay();
        }
      }
    };

    // Iniciar verificación después de 2 segundos
    setTimeout(checkPageContent, checkInterval);
  });

  // Log de errores de consola
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[HolaPe Console] ${message}`);
  });

  // NO crear WhatsApp view automáticamente - se crea bajo demanda
  // createWhatsAppView();

  // Maximizar cuando esté listo
  mainWindow.once('ready-to-show', () => {
    mainWindow?.maximize();
    mainWindow?.show();
  });

  // Manejar resize - solo actualizar si WhatsApp está visible
  mainWindow.on('resize', () => {
    if (whatsappVisible) {
      updateWhatsAppViewBounds();
    }
  });

  // Manejar maximize/unmaximize
  mainWindow.on('maximize', () => {
    if (whatsappVisible) {
      updateWhatsAppViewBounds();
    }
  });

  mainWindow.on('unmaximize', () => {
    if (whatsappVisible) {
      updateWhatsAppViewBounds();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    whatsappView = null;
    whatsappVisible = false;
    whatsappInitialized = false;
  });
}

/**
 * Muestra un overlay de recuperación cuando la página está en blanco o hay error de auth
 */
function showRecoveryOverlay(): void {
  if (!mainWindow) return;

  const recoveryHTML = `
    (function() {
      // Evitar duplicados
      if (document.getElementById('holape-recovery-overlay')) return;

      const overlay = document.createElement('div');
      overlay.id = 'holape-recovery-overlay';
      overlay.innerHTML = \`
        <style>
          #holape-recovery-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: #09090b;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 999999;
            font-family: system-ui, -apple-system, sans-serif;
          }
          #holape-recovery-overlay .logo {
            font-size: 48px;
            margin-bottom: 24px;
          }
          #holape-recovery-overlay h1 {
            color: #fafafa;
            font-size: 24px;
            margin-bottom: 8px;
          }
          #holape-recovery-overlay p {
            color: #a1a1aa;
            margin-bottom: 24px;
            text-align: center;
            max-width: 400px;
            line-height: 1.5;
          }
          #holape-recovery-overlay .buttons {
            display: flex;
            flex-direction: column;
            gap: 12px;
            width: 280px;
          }
          #holape-recovery-overlay button {
            padding: 14px 28px;
            border-radius: 8px;
            font-size: 15px;
            font-weight: 500;
            cursor: pointer;
            border: none;
            transition: all 0.2s;
            width: 100%;
          }
          #holape-recovery-overlay .btn-primary {
            background: #22c55e;
            color: white;
          }
          #holape-recovery-overlay .btn-primary:hover {
            background: #16a34a;
          }
          #holape-recovery-overlay .btn-secondary {
            background: #27272a;
            color: #fafafa;
            border: 1px solid #3f3f46;
          }
          #holape-recovery-overlay .btn-secondary:hover {
            background: #3f3f46;
          }
          #holape-recovery-overlay .btn-danger {
            background: transparent;
            color: #f87171;
            border: 1px solid #7f1d1d;
            font-size: 13px;
            padding: 10px 20px;
          }
          #holape-recovery-overlay .btn-danger:hover {
            background: #7f1d1d;
            color: white;
          }
          #holape-recovery-overlay .hint {
            margin-top: 20px;
            font-size: 12px;
            color: #71717a;
            text-align: center;
          }
          #holape-recovery-overlay .divider {
            margin: 16px 0;
            border-top: 1px solid #27272a;
            width: 100%;
          }
        </style>
        <div class="logo">⚠️</div>
        <h1>La aplicación no cargó</h1>
        <p>Esto puede ocurrir por datos de sesión corruptos o problemas de conexión con el servidor.</p>
        <div class="buttons">
          <button class="btn-primary" onclick="window.holapeRecoveryReload()">
            Reintentar
          </button>
          <button class="btn-secondary" onclick="window.holapeRecoveryClearSession()">
            Limpiar sesión y reintentar
          </button>
          <div class="divider"></div>
          <button class="btn-danger" onclick="window.holapeRecoveryFullReset()">
            Restablecer completamente
          </button>
        </div>
        <p class="hint">El restablecimiento completo borra todos los datos<br>incluyendo la sesión de WhatsApp</p>
      \`;
      document.body.appendChild(overlay);

      // Funciones globales para los botones
      window.holapeRecoveryReload = function() {
        location.reload();
      };

      window.holapeRecoveryClearSession = function() {
        // Limpiar solo datos de sesión de Angular
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('holape_')) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
        sessionStorage.clear();
        location.reload();
      };

      window.holapeRecoveryFullReset = function() {
        if (confirm('¿Estás seguro? Esto borrará TODOS los datos incluyendo la sesión de WhatsApp.')) {
          // Limpiar todo el localStorage
          localStorage.clear();
          sessionStorage.clear();
          // Notificar a Electron para limpiar datos de particiones
          if (window.electronAPI && window.electronAPI.fullReset) {
            window.electronAPI.fullReset();
          } else {
            location.reload();
          }
        }
      };
    })()
  `;

  mainWindow.webContents.executeJavaScript(recoveryHTML);
}

function createWhatsAppView(): void {
  if (!mainWindow || whatsappView) return;

  console.log('[HablaPe] Creando WhatsApp BrowserView...');

  // Usar partición persistente para guardar sesión
  const whatsappSession = session.fromPartition('persist:whatsapp');

  // Extraer versión de Chrome del fingerprint
  const chromeVersion = userFingerprint.chromeVersion.split('.')[0]; // "120"

  // Spoofear headers HTTP con versión dinámica
  whatsappSession.webRequest.onBeforeSendHeaders((details, callback) => {
    // Client Hints que Chrome envía (versión dinámica)
    details.requestHeaders['Sec-CH-UA'] = `"Chromium";v="${chromeVersion}", "Google Chrome";v="${chromeVersion}", "Not-A.Brand";v="99"`;
    details.requestHeaders['Sec-CH-UA-Mobile'] = '?0';
    details.requestHeaders['Sec-CH-UA-Platform'] = '"Windows"';
    details.requestHeaders['Accept-Language'] = userFingerprint.languages.join(',');

    // Eliminar headers que delatan Electron
    delete details.requestHeaders['X-Electron-Is-Dev'];

    callback({ requestHeaders: details.requestHeaders });
  });

  whatsappView = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      partition: 'persist:whatsapp',
      // Preload vacío - ZERO INJECTION para anti-ban
      preload: path.join(__dirname, 'whatsapp-preload.js')
    }
  });

  mainWindow.addBrowserView(whatsappView);

  // ===== INICIALIZAR SISTEMA DE SEGURIDAD DE MEDIOS =====
  initializeMediaSecurity(whatsappView, mainWindow, userFingerprint.odaId, {
    onMediaCaptured: (data) => {
      // Pasar los datos crudos a handleMediaCaptured que agrega agentId, clientUserId, etc.
      handleMediaCaptured(data);
    },
    onAuditLog: (payload) => {
      // Add agent ID to audit log
      sendAuditLog({
        ...payload,
        agentId: loggedInUserId
      });
    }
  });

  // User-Agent dinámico basado en fingerprint único
  whatsappView.webContents.setUserAgent(userFingerprint.userAgent);

  // Inyectar anti-fingerprinting único ANTES de que cargue cualquier script de WhatsApp
  const evasionScript = generateEvasionScript(userFingerprint);

  // CSS para ocultar el botón de adjuntar archivos (+) en WhatsApp Web
  const hideAttachButtonCSS = `
    (function() {
      const style = document.createElement('style');
      style.textContent = \`
        /* Ocultar botón de adjuntar archivos (+) */
        [data-testid="clip"],
        [data-testid="attach-button"],
        button[aria-label*="Adjuntar"],
        button[aria-label*="Attach"],
        span[data-testid="clip"],
        div[data-testid="clip"] {
          display: none !important;
        }
      \`;
      document.head.appendChild(style);
      console.log('[HablaPe] Botón de adjuntar ocultado');
    })();
  `;

  whatsappView.webContents.on('dom-ready', () => {
    // Aplicar anti-fingerprinting
    whatsappView?.webContents.executeJavaScript(evasionScript, true)
      .catch(err => console.error('[HablaPe] Error aplicando anti-fingerprinting:', err));

    // Ocultar botón de adjuntar
    whatsappView?.webContents.executeJavaScript(hideAttachButtonCSS, true)
      .catch(err => console.error('[HablaPe] Error ocultando botón adjuntar:', err));
  });

  // Aplicar zoom cuando cargue
  whatsappView.webContents.on('did-finish-load', () => {
    whatsappView?.webContents.setZoomFactor(0.80);
  });

  whatsappView.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[HablaPe] Error cargando WhatsApp:', errorCode, errorDescription);
  });

  // Cargar WhatsApp Web
  whatsappView.webContents.loadURL('https://web.whatsapp.com');

  // Marcar como inicializado
  whatsappInitialized = true;

  // Iniciar escaneo de chat activo después de que cargue
  whatsappView.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      if (whatsappVisible) {
        startChatScanner();
        startSessionMonitor(); // Iniciar monitor de sesión
      }
    }, 5000); // Esperar 5 segundos para que WhatsApp cargue
  });

  // Escuchar mensajes de consola de WhatsApp para detectar eventos
  whatsappView.webContents.on('console-message', (event, level, message) => {
    // Teléfono extraído del panel de contacto
    if (message.startsWith('[HABLAPE_PHONE_EXTRACTED]')) {
      const rawPhone = message.replace('[HABLAPE_PHONE_EXTRACTED]', '').trim();
      // Sanitizar: solo mantener dígitos (9-15 caracteres)
      const phone = rawPhone.replace(/[^\d]/g, '');
      if (phone && phone.length >= 9 && phone.length <= 15 && chatBlockState.isBlocked) {
        console.log('[HablaPe] ✓ Teléfono extraído via console-message:', phone);
        handlePhoneExtracted(phone);
      } else if (rawPhone && rawPhone !== phone) {
        console.log('[HablaPe] Teléfono rechazado (inválido):', rawPhone, '->', phone);
      }
    }
    // Chat bloqueado por click en sidebar - sincronizar estado
    else if (message === '[HABLAPE_CHAT_BLOCKED]') {
      // Sincronizar estado: marcar como bloqueado antes de que el scanner lo detecte
      // Esto evita race conditions donde Angular responde antes que el scanner
      if (!chatBlockState.isBlocked) {
        chatBlockState.isBlocked = true;
        chatBlockState.expectedPhone = null; // Se establecerá cuando el scanner detecte el teléfono
        chatBlockState.waitingForManualExtraction = false; // El scanner determinará si necesita extracción manual
        console.log('[HablaPe] Chat bloqueado via sidebar click (pre-sync)');

        // Timeout de seguridad por si el scanner no detecta nada
        if (chatBlockState.timeoutHandle) {
          clearTimeout(chatBlockState.timeoutHandle);
        }
        chatBlockState.timeoutHandle = setTimeout(() => {
          if (chatBlockState.isBlocked) {
            console.log('[HablaPe] ⚠️ TIMEOUT (sidebar click) - desbloqueando');
            forceUnblockWhatsAppChat();
          }
        }, CHAT_BLOCK_TIMEOUT);
      }
    }
  });

}

/**
 * Muestra el BrowserView de WhatsApp (crea si no existe)
 */
function showWhatsAppView(): void {
  if (!mainWindow) return;

  console.log('[HablaPe] Mostrando WhatsApp view...');

  // Crear si no existe
  if (!whatsappView) {
    createWhatsAppView();
  }

  // Agregar al window si fue removido
  if (whatsappView && !mainWindow.getBrowserViews().includes(whatsappView)) {
    mainWindow.addBrowserView(whatsappView);
  }

  whatsappVisible = true;
  updateWhatsAppViewBounds();

  // Iniciar scanner si WhatsApp ya cargó
  if (whatsappInitialized) {
    startChatScanner();
    startSessionMonitor(); // Monitorear estado de sesión
  }

  // Notificar a Angular
  mainWindow.webContents.send('whatsapp-visibility-changed', { visible: true });
}

/**
 * Oculta el BrowserView de WhatsApp (no lo destruye, solo lo oculta)
 */
function hideWhatsAppView(): void {
  if (!mainWindow || !whatsappView) return;

  console.log('[HablaPe] Ocultando WhatsApp view...');

  // Remover del window pero mantener la instancia
  mainWindow.removeBrowserView(whatsappView);

  whatsappVisible = false;

  // Detener scanner y monitor de sesión
  stopChatScanner();
  stopSessionMonitor();

  // Notificar a Angular
  mainWindow.webContents.send('whatsapp-visibility-changed', { visible: false });
}

// Actualización inmediata (para resize de ventana)
function updateWhatsAppViewBounds(): void {
  if (!mainWindow || !whatsappView || !whatsappVisible) return;

  const [width, height] = mainWindow.getContentSize();
  const headerHeight = 48;

  // WhatsApp ocupa el 50% derecho, debajo del header
  const whatsappWidth = Math.floor(width / 2);
  const targetX = width - whatsappWidth; // Posición derecha (50% del ancho total)

  // Actualizar estado actual
  currentBounds = { x: targetX, width: whatsappWidth };

  whatsappView.setBounds({
    x: targetX,
    y: headerHeight,
    width: whatsappWidth,
    height: height - headerHeight
  });

  // Notificar a Angular del ancho disponible
  mainWindow.webContents.send('whatsapp-bounds-changed', {
    angularWidth: targetX,
    whatsappWidth: whatsappWidth
  });
}

// Actualización animada (para toggle de sidebar/panel)
function animateWhatsAppViewBounds(): void {
  if (!mainWindow || !whatsappView || !whatsappVisible) return;

  // Cancelar animación anterior si existe
  if (animationFrame) {
    clearInterval(animationFrame);
    animationFrame = null;
  }

  const [width, height] = mainWindow.getContentSize();
  const headerHeight = 48;

  // WhatsApp ocupa el 50% derecho, debajo del header
  const targetWidth = Math.floor(width / 2);
  const targetX = width - targetWidth;

  // Punto de inicio
  const startX = currentBounds.x;
  const startWidth = currentBounds.width || targetWidth;

  // Si no hay cambio, no animar
  if (startX === targetX && startWidth === targetWidth) {
    return;
  }

  let step = 0;
  const stepInterval = ANIMATION_DURATION / ANIMATION_STEPS;

  // Función de easing (ease-out cubic)
  const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

  animationFrame = setInterval(() => {
    step++;
    const progress = easeOutCubic(step / ANIMATION_STEPS);

    const newX = Math.round(startX + (targetX - startX) * progress);
    const newWidth = Math.round(startWidth + (targetWidth - startWidth) * progress);

    currentBounds = { x: newX, width: newWidth };

    whatsappView?.setBounds({
      x: newX,
      y: headerHeight,
      width: newWidth,
      height: height - headerHeight
    });

    // Finalizar animación
    if (step >= ANIMATION_STEPS) {
      if (animationFrame) {
        clearInterval(animationFrame);
        animationFrame = null;
      }
      // Asegurar valores finales exactos
      currentBounds = { x: targetX, width: targetWidth };
      whatsappView?.setBounds({
        x: targetX,
        y: headerHeight,
        width: targetWidth,
        height: height - headerHeight
      });
    }
  }, stepInterval);
}

// ============================================================================
// SISTEMA DE DETECCIÓN DE CHAT - VERSIÓN SIMPLIFICADA Y ROBUSTA
// ============================================================================
//
// ESTRATEGIA PRINCIPAL: El sidebar de WhatsApp SIEMPRE tiene el chat seleccionado
// con data-id="NUMERO@c.us". Esta es la fuente más confiable.
//
// Orden de prioridad:
// 1. Sidebar: Buscar elemento con data-id que contenga @c.us (MÁS CONFIABLE)
// 2. Header: Buscar número en el título del chat
// 3. Nombre: Extraer del formato "Nombre - Teléfono"
// ============================================================================

let lastDetectedPhone = '';
let lastDetectedName = '';
let chatScannerInterval: NodeJS.Timeout | null = null;
let chatScannerRunning = false;

// Estado de sesión de WhatsApp (para detectar login/logout)
let whatsappLoggedIn = false;
let sessionCheckInterval: NodeJS.Timeout | null = null;

/**
 * Actualiza el teléfono del chat en el BrowserView de WhatsApp
 * para que el script de captura pueda usarlo
 */
async function updateChatPhoneInWhatsApp(phone: string, name: string): Promise<void> {
  if (!whatsappView) return;
  try {
    await whatsappView.webContents.executeJavaScript(`
      window.__hablapeCurrentChatPhone = '${phone}';
      window.__hablapeCurrentChatName = '${name || ''}';
      console.log('[HablaPe Debug] Chat actualizado desde Electron:', '${phone}', '${name || ''}');
    `, true);
  } catch (err) {
    // Ignorar errores silenciosamente
  }
}

/**
 * Limpia el número extraído del panel de contacto anterior
 * IMPORTANTE: Llamar cuando cambia el chat para evitar usar teléfonos antiguos
 */
async function clearExtractedPhoneInWhatsApp(): Promise<void> {
  if (!whatsappView) return;
  try {
    await whatsappView.webContents.executeJavaScript(`
      if (window.__hablapeClearExtractedPhone) {
        window.__hablapeClearExtractedPhone();
      }
    `, true);
    console.log('[HablaPe] Número extraído limpiado');
  } catch (err) {
    // Ignorar errores silenciosamente
  }
}

/**
 * Establece el nombre del chat actual para verificar panel de contacto
 */
async function setCurrentChatNameInWhatsApp(name: string): Promise<void> {
  if (!whatsappView) return;
  try {
    await whatsappView.webContents.executeJavaScript(`
      if (window.__hablapeSetCurrentChatName) {
        window.__hablapeSetCurrentChatName('${name.replace(/'/g, "\\'")}');
      }
    `, true);
  } catch (err) {
    // Ignorar errores silenciosamente
  }
}

/**
 * Bloquea el chat completo en WhatsApp Web
 * @param expectedPhone - El teléfono que esperamos que Angular cargue
 *
 * SISTEMA ROBUSTO:
 * - Guarda qué teléfono esperamos
 * - Inicia timeout de seguridad
 * - Solo se desbloquea si Angular confirma el mismo teléfono
 */
async function blockWhatsAppChat(expectedPhone: string): Promise<void> {
  if (!whatsappView) return;

  // Cancelar timeout anterior si existe
  if (chatBlockState.timeoutHandle) {
    clearTimeout(chatBlockState.timeoutHandle);
  }

  // Actualizar estado - bloqueo normal (no extracción manual)
  chatBlockState.isBlocked = true;
  chatBlockState.expectedPhone = expectedPhone;
  chatBlockState.waitingForManualExtraction = false;

  console.log('[HablaPe] ⏳ BLOQUEANDO chat - esperando CRM para:', expectedPhone);

  try {
    await whatsappView.webContents.executeJavaScript(`
      if (window.__hablapeShowChatBlocker) {
        window.__hablapeShowChatBlocker();
      }
    `, true);
  } catch (err) {
    // Ignorar errores
  }

  // Timeout de seguridad: desbloquear automáticamente si Angular no responde
  chatBlockState.timeoutHandle = setTimeout(() => {
    if (chatBlockState.isBlocked) {
      console.log('[HablaPe] ⚠️ TIMEOUT - Desbloqueando automáticamente (CRM no respondió)');
      forceUnblockWhatsAppChat();
    }
  }, CHAT_BLOCK_TIMEOUT);
}

/**
 * Intenta desbloquear el chat - solo si el teléfono coincide
 * @param processedPhone - El teléfono que Angular procesó
 * @returns true si se desbloqueó, false si se ignoró
 */
async function tryUnblockWhatsAppChat(processedPhone: string): Promise<boolean> {
  if (!chatBlockState.isBlocked) {
    console.log('[HablaPe] tryUnblock: No hay bloqueo activo, ignorando');
    return false;
  }

  // Normalizar teléfonos para comparación (últimos 9 dígitos)
  const normalizePhone = (p: string | null) => p ? p.replace(/\D/g, '').slice(-9) : '';
  const expectedNorm = normalizePhone(chatBlockState.expectedPhone);
  const processedNorm = normalizePhone(processedPhone);

  console.log('[HablaPe] tryUnblock: expected=' + expectedNorm + ', processed=' + processedNorm + ', waitingManual=' + chatBlockState.waitingForManualExtraction);

  // Caso especial: Esperando extracción manual (overlay de instrucciones)
  // NO desbloquear con crmClientReady vacío - solo se desbloquea con extracción manual
  if (chatBlockState.waitingForManualExtraction && !processedNorm) {
    console.log('[HablaPe] ⏳ Esperando extracción manual - ignorando crmClientReady vacío');
    return false;
  }

  // Caso 1: expectedPhone es null pero NO estamos esperando extracción manual
  // (bloqueado desde sidebar antes que scanner detectara)
  if (!expectedNorm && !chatBlockState.waitingForManualExtraction) {
    await forceUnblockWhatsAppChat();
    console.log('[HablaPe] ✓ DESBLOQUEADO - CRM respondió (sidebar click, pre-scanner)');
    return true;
  }

  // Caso 2: Hay teléfono procesado - desbloquear si coincide o si no hay expected
  if (processedNorm) {
    if (!expectedNorm || expectedNorm === processedNorm) {
      await forceUnblockWhatsAppChat();
      console.log('[HablaPe] ✓ DESBLOQUEADO - teléfono válido recibido');
      return true;
    } else {
      // El teléfono no coincide - ignorar (es de un chat anterior)
      console.log('[HablaPe] ⚠️ Ignorando desbloqueo - teléfono no coincide');
      return false;
    }
  }

  // Caso 3: Hay expectedPhone pero CRM no envió teléfono
  // Y NO estamos esperando extracción manual
  if (expectedNorm && !processedNorm && !chatBlockState.waitingForManualExtraction) {
    await forceUnblockWhatsAppChat();
    console.log('[HablaPe] ✓ DESBLOQUEADO - CRM procesó (sin teléfono en respuesta)');
    return true;
  }

  console.log('[HablaPe] ⚠️ No se cumplió ninguna condición de desbloqueo');
  return false;
}

/**
 * Fuerza el desbloqueo del chat (sin verificar teléfono)
 * Usado por timeout y casos especiales
 */
async function forceUnblockWhatsAppChat(): Promise<void> {
  console.log('[HablaPe] forceUnblockWhatsAppChat() llamado');

  // Cancelar timeout si existe
  if (chatBlockState.timeoutHandle) {
    clearTimeout(chatBlockState.timeoutHandle);
    chatBlockState.timeoutHandle = null;
  }

  // Actualizar estado - resetear todo
  chatBlockState.isBlocked = false;
  chatBlockState.expectedPhone = null;
  chatBlockState.waitingForManualExtraction = false;

  if (!whatsappView) {
    console.log('[HablaPe] ⚠️ whatsappView es null - no se puede ocultar blocker');
    return;
  }

  console.log('[HablaPe] Ejecutando __hablapeHideChatBlocker en WhatsApp...');
  try {
    const result = await whatsappView.webContents.executeJavaScript(`
      (function() {
        console.log('[HablaPe] Dentro de executeJavaScript para ocultar blocker');
        if (window.__hablapeHideChatBlocker) {
          window.__hablapeHideChatBlocker();
          return 'success';
        } else {
          console.log('[HablaPe] ⚠️ __hablapeHideChatBlocker NO existe');
          return 'function_not_found';
        }
      })()
    `, true);
    console.log('[HablaPe] executeJavaScript resultado:', result);
  } catch (err) {
    console.error('[HablaPe] ERROR en executeJavaScript:', err);
  }
}

/**
 * Muestra el blocker con instrucciones para que el usuario revele el número
 * Se llama cuando el scanner no puede detectar el número automáticamente
 */
async function showPhoneNeededInWhatsApp(): Promise<void> {
  if (!whatsappView) return;

  // Actualizar estado de bloqueo - modo extracción manual
  chatBlockState.isBlocked = true;
  chatBlockState.expectedPhone = null; // No sabemos qué teléfono esperar aún
  chatBlockState.waitingForManualExtraction = true; // NO desbloquear con crmClientReady vacío

  // Cancelar timeout anterior si existe
  if (chatBlockState.timeoutHandle) {
    clearTimeout(chatBlockState.timeoutHandle);
  }

  try {
    await whatsappView.webContents.executeJavaScript(`
      if (window.__hablapeShowPhoneNeeded) {
        window.__hablapeShowPhoneNeeded();
      }
    `, true);
    console.log('[HablaPe] 📱 Mostrando instrucciones para revelar número');
  } catch (err) {
    // Ignorar errores
  }

  // Timeout más largo para este caso (30 segundos) ya que requiere acción del usuario
  chatBlockState.timeoutHandle = setTimeout(() => {
    if (chatBlockState.isBlocked) {
      console.log('[HablaPe] ⚠️ TIMEOUT largo - desbloqueando (usuario no reveló número)');
      forceUnblockWhatsAppChat();
    }
  }, 30000);
}

/**
 * Verifica si el usuario extrajo un número del panel de contacto
 * Método de fallback - el método principal es via console-message
 */
async function checkForExtractedPhone(): Promise<void> {
  if (!whatsappView || !mainWindow || !chatBlockState.isBlocked) return;

  try {
    const result = await whatsappView.webContents.executeJavaScript(`
      (function() {
        if (window.__hablapeExtractedPhone && window.__hablapePhoneExtractedAt) {
          const phone = window.__hablapeExtractedPhone;
          window.__hablapeExtractedPhone = null;
          window.__hablapePhoneExtractedAt = null;
          return { phone };
        }
        return { phone: null };
      })()
    `, true);

    if (result && result.phone) {
      console.log('[HablaPe] ✓ Teléfono extraído (fallback):', result.phone);
      handlePhoneExtracted(result.phone);
    }
  } catch (err) {
    // Silenciar errores - el método principal es console-message
  }
}

/**
 * Maneja cuando se extrae un número del panel de contacto en WhatsApp
 */
function handlePhoneExtracted(phone: string): void {
  if (!phone || !mainWindow) return;

  console.log('[HablaPe] ✓ Número extraído por usuario:', phone);

  // Actualizar estado
  lastDetectedPhone = phone;
  chatBlockState.expectedPhone = phone;

  // Actualizar el teléfono en el BrowserView para el script de captura
  updateChatPhoneInWhatsApp(phone, lastDetectedName || '');

  // El chat ya está bloqueado con el mensaje "necesita número"
  // Ahora lo actualizamos al estado normal de "cargando"
  blockWhatsAppChat(phone);

  // Enviar evento a Angular con el número encontrado
  mainWindow.webContents.send('chat-selected', {
    phone,
    name: lastDetectedName || null,
    isPhone: true
  });
}

// Intervalo de escaneo: 1.5-2.5 segundos
function getRandomScanInterval(): number {
  return 1500 + Math.random() * 1000;
}

async function scanChat(): Promise<void> {
  if (!whatsappView || !mainWindow || !chatScannerRunning || !whatsappVisible) return;

  try {
    const result = await whatsappView.webContents.executeJavaScript(`
      (function() {
        // =========================================
        // PASO 1: Obtener el nombre del chat actual
        // =========================================
        let chatName = null;
        const header = document.querySelector('[data-testid="conversation-header"]') ||
                      document.querySelector('#main header');

        // Función para validar que un nombre de chat es válido (no es placeholder/status)
        function isValidChatName(name) {
          if (!name || name.length === 0 || name.length > 50) return false;
          const lower = name.toLowerCase();
          // Lista de placeholders y textos de estado a ignorar
          const invalidPatterns = [
            'escribiendo', 'typing', 'en línea', 'online',
            'últ.', 'última', 'last seen', 'click here', 'click para',
            'contact info', 'info del contacto', 'tap here', 'toca aquí',
            'business info', 'info de empresa', 'see more', 'ver más'
          ];
          for (const pattern of invalidPatterns) {
            if (lower.includes(pattern)) return false;
          }
          // Ignorar textos que empiezan con hora o número
          if (/^\\d{1,2}:\\d{2}/.test(name)) return false;
          if (/^\\d/.test(name) && name.length < 5) return false;
          // Ignorar "hoy", "ayer" solos
          if (lower === 'hoy' || lower === 'ayer' || lower === 'today' || lower === 'yesterday') return false;
          // Ignorar AM/PM times
          if (/a\\.?\\s?m\\.?|p\\.?\\s?m\\.?/i.test(name) && name.length < 15) return false;
          return true;
        }

        if (header) {
          // Buscar el span con el título (generalmente tiene atributo title)
          const titleSpan = header.querySelector('span[title]');
          if (titleSpan) {
            const rawName = titleSpan.getAttribute('title') || titleSpan.textContent?.trim();
            if (isValidChatName(rawName)) {
              chatName = rawName;
            }
          }

          // Fallback: buscar el primer span con texto válido
          if (!chatName) {
            const spans = header.querySelectorAll('span');
            for (const span of spans) {
              const text = span.textContent?.trim();
              if (isValidChatName(text)) {
                chatName = text;
                break;
              }
            }
          }
        }

        if (!chatName) {
          return { debug: 'no_chat_open' };
        }

        // =========================================
        // PASO 2: ESTRATEGIA PRINCIPAL - SIDEBAR
        // El sidebar SIEMPRE tiene el chat con data-id
        // =========================================
        const sidebar = document.querySelector('#pane-side');
        if (sidebar) {
          // Buscar TODOS los elementos con data-id que contengan @c.us
          const chatItems = sidebar.querySelectorAll('[data-id*="@c.us"]');

          for (const item of chatItems) {
            // Verificar si este chat coincide con el nombre actual
            const itemText = item.textContent || '';

            // El chat seleccionado generalmente tiene el nombre visible
            if (itemText.includes(chatName) ||
                (chatName.length > 3 && itemText.toLowerCase().includes(chatName.toLowerCase().substring(0, chatName.length - 2)))) {
              const dataId = item.getAttribute('data-id');
              if (dataId && dataId.includes('@c.us')) {
                let phone = dataId.split('@')[0];
                phone = phone.replace(/^(true|false)_/, '');
                if (/^\\d{9,15}$/.test(phone)) {
                  return { phone, name: chatName, source: 'sidebar' };
                }
              }
            }
          }

          // Fallback: buscar el chat activo por aria-selected o focus
          const activeItem = sidebar.querySelector('[aria-selected="true"]') ||
                            sidebar.querySelector('[data-testid="cell-frame-container"]:focus-within');
          if (activeItem) {
            // Buscar data-id en el elemento o sus ancestros
            let el = activeItem;
            for (let i = 0; i < 10 && el; i++) {
              const dataId = el.getAttribute?.('data-id');
              if (dataId && dataId.includes('@c.us')) {
                let phone = dataId.split('@')[0];
                phone = phone.replace(/^(true|false)_/, '');
                if (/^\\d{9,15}$/.test(phone)) {
                  return { phone, name: chatName, source: 'sidebar-active' };
                }
              }
              el = el.parentElement;
            }
          }
        }

        // =========================================
        // PASO 3: ESTRATEGIA SECUNDARIA - HEADER
        // Buscar número en atributos del header
        // =========================================
        if (header) {
          // Buscar en span[title] que contenga número
          const titleSpans = header.querySelectorAll('span[title]');
          for (const span of titleSpans) {
            const title = span.getAttribute('title') || '';
            const phoneMatch = title.match(/\\+?(\\d[\\d\\s\\-]{8,}\\d)/);
            if (phoneMatch) {
              const phone = phoneMatch[1].replace(/[\\s\\-]/g, '');
              if (phone.length >= 9 && phone.length <= 15) {
                return { phone, name: chatName, source: 'header-title' };
              }
            }
          }
        }

        // =========================================
        // PASO 4: ESTRATEGIA TERCIARIA - MENSAJES
        // Buscar data-id en mensajes del chat
        // =========================================
        const messages = document.querySelectorAll('[data-id*="@c.us"]');
        for (const msg of messages) {
          const dataId = msg.getAttribute('data-id');
          if (dataId && dataId.includes('@c.us')) {
            let phone = dataId.split('@')[0];
            phone = phone.replace(/^(true|false)_/, '');
            if (/^\\d{9,15}$/.test(phone)) {
              return { phone, name: chatName, source: 'message' };
            }
          }
        }

        // =========================================
        // PASO 5: EXTRAER DEL NOMBRE
        // Formato: "Nombre - Teléfono"
        // =========================================
        // Patrón con separador
        const sepMatch = chatName.match(/^(.+?)[\\s]*[-|:]+[\\s]*\\+?(\\d[\\d\\s]{7,}\\d)$/);
        if (sepMatch) {
          const phone = sepMatch[2].replace(/\\s/g, '');
          if (phone.length >= 9) {
            return { phone, name: sepMatch[1].trim(), source: 'name-separator' };
          }
        }

        // Patrón número al final
        const endMatch = chatName.match(/^(.+?)\\s+(\\d{9,})$/);
        if (endMatch) {
          return { phone: endMatch[2], name: endMatch[1].trim(), source: 'name-end' };
        }

        return { debug: 'no_phone_found', chatName };
      })()
    `, true);

    // Procesar resultado
    if (result.debug) {
      if (result.debug === 'no_chat_open') {
        // Limpiar estado si no hay chat
        if (lastDetectedPhone || lastDetectedName) {
          lastDetectedPhone = '';
          lastDetectedName = '';
          // Limpiar número extraído del panel anterior
          await clearExtractedPhoneInWhatsApp();
        }
      } else if (result.debug === 'no_phone_found' && result.chatName) {
        // Hay un chat abierto pero no se encontró el número
        // Mostrar instrucciones al usuario para que revele el número
        const nameChanged = result.chatName !== lastDetectedName;
        console.log('[HablaPe Debug] no_phone_found - chatName:', result.chatName, 'nameChanged:', nameChanged, 'isBlocked:', chatBlockState.isBlocked);
        if (nameChanged) {
          console.log('[HablaPe] Chat sin número detectado:', result.chatName);
          lastDetectedName = result.chatName;
          lastDetectedPhone = ''; // Limpiar teléfono anterior

          // Limpiar número extraído del panel anterior y establecer nombre actual
          await clearExtractedPhoneInWhatsApp();
          await setCurrentChatNameInWhatsApp(result.chatName);

          // Mostrar blocker con instrucciones
          showPhoneNeededInWhatsApp();

          // Enviar evento a Angular con solo el nombre (sin teléfono)
          mainWindow.webContents.send('chat-selected', {
            phone: null,
            name: result.chatName,
            isPhone: false
          });
        }
      }
      // NO hacer return aquí - continuar para programar siguiente scan
    } else {
      // Tenemos un resultado válido con teléfono
      const { phone, name, source } = result;

      // Verificar si cambió el chat (por teléfono o nombre)
      const phoneChanged = phone !== lastDetectedPhone;
      const nameChanged = name && name !== lastDetectedName;

      if (phoneChanged || nameChanged) {
        console.log(`[HolaPe] Chat detectado via ${source}:`, phone, name);

        // Limpiar número extraído del panel anterior (antes de actualizar el estado)
        await clearExtractedPhoneInWhatsApp();
        await setCurrentChatNameInWhatsApp(name || '');

        lastDetectedPhone = phone;
        lastDetectedName = name || '';

        // BLOQUEAR el chat - pasamos el teléfono esperado para verificación posterior
        blockWhatsAppChat(phone);

        // Actualizar el teléfono en el BrowserView para el script de captura
        updateChatPhoneInWhatsApp(phone, name || '');

        mainWindow.webContents.send('chat-selected', {
          phone,
          name: name || null,
          isPhone: true
        });
      }
    }

  } catch (err) {
    console.error('[HolaPe] Error en scanChat:', err);
  }

  // Verificar si el usuario extrajo un número del panel de contacto
  await checkForExtractedPhone();

  // SIEMPRE programar siguiente escaneo (movido fuera del try-catch)
  if (chatScannerRunning && whatsappVisible) {
    chatScannerInterval = setTimeout(scanChat, getRandomScanInterval());
  }
}

function startChatScanner(): void {
  if (chatScannerRunning || !whatsappVisible) return;

  chatScannerRunning = true;
  console.log('[HablaPe] Chat scanner iniciado');

  // Iniciar primer escaneo después de un delay aleatorio
  chatScannerInterval = setTimeout(scanChat, getRandomScanInterval());
}

function stopChatScanner(): void {
  chatScannerRunning = false;
  if (chatScannerInterval) {
    clearTimeout(chatScannerInterval);
    chatScannerInterval = null;
  }
  console.log('[HablaPe] Chat scanner detenido');
}

// ============================================================================
// DETECTOR DE SESIÓN DE WHATSAPP
// Detecta cuando el usuario hace login o logout de WhatsApp Web
// ============================================================================

/**
 * Verifica si WhatsApp Web está mostrando la pantalla de QR code (no logueado)
 * o si tiene una sesión activa (logueado)
 */
async function checkWhatsAppSessionState(): Promise<void> {
  if (!whatsappView || !mainWindow || !whatsappVisible) return;

  try {
    const sessionState = await whatsappView.webContents.executeJavaScript(`
      (function() {
        // Indicadores de que está LOGUEADO
        const hasConversations = !!document.querySelector('#pane-side');
        const hasMainPanel = !!document.querySelector('#main');
        const hasSearchBox = !!document.querySelector('[data-testid="chat-list-search"]');

        // Indicadores de que NO está logueado (QR code visible)
        const hasQRCode = !!document.querySelector('[data-testid="qrcode"]') ||
                         !!document.querySelector('canvas[aria-label*="QR"]') ||
                         !!document.querySelector('div[data-ref]'); // QR canvas
        const hasLinkingScreen = !!document.querySelector('[data-testid="intro-md-beta-message"]') ||
                                !!document.querySelector('div._al_b'); // Pantalla de "Usa WhatsApp en tu teléfono"
        const hasPhoneLink = document.body.innerText?.includes('Escanea el código') ||
                            document.body.innerText?.includes('Link with phone number');

        // Determinar estado
        const isLoggedIn = (hasConversations || hasMainPanel || hasSearchBox) &&
                          !hasQRCode && !hasLinkingScreen && !hasPhoneLink;

        return {
          isLoggedIn,
          indicators: {
            hasConversations,
            hasMainPanel,
            hasSearchBox,
            hasQRCode,
            hasLinkingScreen,
            hasPhoneLink
          }
        };
      })()
    `, true);

    const wasLoggedIn = whatsappLoggedIn;
    const isNowLoggedIn = sessionState.isLoggedIn;

    // Solo notificar si cambió el estado
    if (wasLoggedIn !== isNowLoggedIn) {
      console.log('[HablaPe] *** CAMBIO DE SESIÓN DETECTADO ***');
      console.log('[HablaPe] Estado anterior:', wasLoggedIn ? 'Logueado' : 'No logueado');
      console.log('[HablaPe] Estado nuevo:', isNowLoggedIn ? 'Logueado' : 'No logueado');
      console.log('[HablaPe] Indicadores:', sessionState.indicators);

      whatsappLoggedIn = isNowLoggedIn;

      // Notificar a Angular del cambio de sesión
      mainWindow.webContents.send('whatsapp-session-change', { loggedIn: isNowLoggedIn });

      // Si cerró sesión, limpiar estado del chat scanner
      if (!isNowLoggedIn) {
        lastDetectedPhone = '';
        lastDetectedName = '';
        // Notificar que no hay chat seleccionado
        mainWindow.webContents.send('chat-selected', {
          phone: null,
          name: null,
          isPhone: false
        });
      }
    }
  } catch (err) {
    // Ignorar errores silenciosamente
  }
}

/**
 * Inicia el monitoreo periódico del estado de sesión de WhatsApp
 */
function startSessionMonitor(): void {
  if (sessionCheckInterval) return;

  console.log('[HablaPe] Iniciando monitor de sesión de WhatsApp');

  // Verificar cada 3 segundos
  sessionCheckInterval = setInterval(checkWhatsAppSessionState, 3000);

  // Verificar inmediatamente
  checkWhatsAppSessionState();
}

/**
 * Detiene el monitoreo de sesión
 */
function stopSessionMonitor(): void {
  if (sessionCheckInterval) {
    clearInterval(sessionCheckInterval);
    sessionCheckInterval = null;
  }
  console.log('[HablaPe] Monitor de sesión detenido');
}

// Sistema de escaneo de mensajes del chat activo
interface ScannedMessage {
  whatsappId: string;
  content: string;
  type: string;
  direction: string;
  timestamp: string;
  senderName?: string;
  hasMedia: boolean;
  mediaType?: string;
}

async function scanChatMessages(telefono: string): Promise<ScannedMessage[]> {
  if (!whatsappView || !mainWindow || !whatsappVisible) return [];

  try {
    const messages = await whatsappView.webContents.executeJavaScript(`
      (function() {
        const messages = [];
        // Buscar todos los mensajes en el chat actual
        const messageElements = document.querySelectorAll('[data-id^="true_"], [data-id^="false_"]');

        messageElements.forEach(el => {
          try {
            const dataId = el.getAttribute('data-id') || '';
            if (!dataId) return;

            // Determinar dirección
            const isOutgoing = el.classList.contains('message-out') ||
                               dataId.startsWith('true_') ||
                               el.closest('[class*="message-out"]') !== null;

            // Obtener texto del mensaje
            const textEl = el.querySelector('.selectable-text span, .copyable-text span, ._ao3e');
            const content = textEl?.innerText || '';

            // Obtener timestamp
            const timeEl = el.querySelector('[data-pre-plain-text]');
            const prePlainText = timeEl?.getAttribute('data-pre-plain-text') || '';
            // Formato: "[HH:mm, DD/MM/YYYY] Nombre: "
            const timeMatch = prePlainText.match(/\\[(\\d{1,2}:\\d{2}),\\s*(\\d{1,2}\\/\\d{1,2}\\/\\d{4})\\]/);
            let timestamp = '';
            let senderName = '';

            if (timeMatch) {
              const [, time, date] = timeMatch;
              const [day, month, year] = date.split('/');
              timestamp = year + '-' + month.padStart(2, '0') + '-' + day.padStart(2, '0') + ' ' + time + ':00';

              // Extraer nombre del remitente
              const nameMatch = prePlainText.match(/\\]\\s*(.+?):\\s*$/);
              if (nameMatch) {
                senderName = nameMatch[1];
              }
            }

            // Detectar tipo de media
            let type = 'TEXT';
            let hasMedia = false;
            let mediaType = undefined;

            if (el.querySelector('img[src*="blob:"]')) {
              type = 'IMAGE';
              hasMedia = true;
              mediaType = 'image';
            } else if (el.querySelector('audio')) {
              type = 'AUDIO';
              hasMedia = true;
              mediaType = 'audio';
            } else if (el.querySelector('video')) {
              type = 'VIDEO';
              hasMedia = true;
              mediaType = 'video';
            } else if (el.querySelector('[data-testid="document-thumb"]')) {
              type = 'DOCUMENT';
              hasMedia = true;
              mediaType = 'document';
            } else if (el.querySelector('[data-testid="sticker"]')) {
              type = 'STICKER';
              hasMedia = true;
              mediaType = 'sticker';
            }

            // Solo agregar si tiene contenido o media
            if (content || hasMedia) {
              messages.push({
                whatsappId: dataId,
                content: content,
                type: type,
                direction: isOutgoing ? 'OUTGOING' : 'INCOMING',
                timestamp: timestamp,
                senderName: senderName || undefined,
                hasMedia: hasMedia,
                mediaType: mediaType
              });
            }
          } catch (e) {
            // Ignorar errores individuales
          }
        });

        return messages;
      })()
    `, true);

    // Filtrar mensajes ya escaneados
    const newMessages = messages.filter((msg: ScannedMessage) => {
      if (lastScannedMessages.has(msg.whatsappId)) {
        return false;
      }
      lastScannedMessages.add(msg.whatsappId);
      return true;
    });

    return newMessages;
  } catch (err) {
    console.error('[HablaPe] Error escaneando mensajes:', err);
    return [];
  }
}

// Limpiar cache de mensajes escaneados cuando cambia el chat
function clearScannedMessages(): void {
  lastScannedMessages.clear();
}

// Sistema Anti-Ban: Detección de clipboard
function startClipboardMonitor(): void {
  setInterval(() => {
    const currentClipboard = clipboard.readText().trim();

    if (currentClipboard !== lastClipboard) {
      // Detectar si es un número de teléfono
      const phoneRegex = /^\+?[\d\s\-()]{10,20}$/;
      const cleanNumber = currentClipboard.replace(/[\s\-()]/g, '');

      if (phoneRegex.test(currentClipboard) && cleanNumber.length >= 10) {
        lastClipboard = currentClipboard;

        // Enviar al renderer
        if (mainWindow) {
          mainWindow.webContents.send('phone-detected', {
            phone: cleanNumber,
            original: currentClipboard
          });
        }
      }
    }
  }, 500);
}

// Registrar hotkeys globales
function registerShortcuts(): void {
  // Ctrl+Shift+C - Captura manual de teléfono
  globalShortcut.register('CommandOrControl+Shift+C', () => {
    const phone = clipboard.readText().trim();
    const cleanNumber = phone.replace(/[\s\-()]/g, '');

    if (mainWindow && cleanNumber.length >= 10) {
      mainWindow.webContents.send('phone-captured', {
        phone: cleanNumber,
        original: phone
      });
    }
  });

  // Ctrl+Shift+T - Toggle panel CRM
  globalShortcut.register('CommandOrControl+Shift+T', () => {
    if (mainWindow) {
      mainWindow.webContents.send('toggle-crm-panel');
    }
  });

  // Ctrl+Shift+R - Forzar recarga limpiando sesión
  globalShortcut.register('CommandOrControl+Shift+R', () => {
    if (mainWindow) {
      console.log('[HolaPe] Forzando recarga con limpieza de sesión');
      mainWindow.webContents.executeJavaScript(`
        localStorage.clear();
        sessionStorage.clear();
        location.reload();
      `);
    }
  });

  // F12 - Abrir DevTools para depuración
  globalShortcut.register('F12', () => {
    if (mainWindow) {
      mainWindow.webContents.toggleDevTools();
    }
  });

  // Ctrl+Shift+D - Mostrar overlay de diagnóstico
  globalShortcut.register('CommandOrControl+Shift+D', () => {
    if (mainWindow) {
      showRecoveryOverlay();
    }
  });

  // F5 - Recargar página
  globalShortcut.register('F5', () => {
    if (mainWindow) {
      mainWindow.webContents.reload();
    }
  });
}

// IPC Handlers
function setupIPC(): void {
  // === User Login/Logout (para asociar medios capturados) ===
  ipcMain.on('set-logged-in-user', (_, data: { userId: number; userName: string }) => {
    loggedInUserId = data.userId;
    loggedInUserName = data.userName;
    console.log('[HablaPe] *** Usuario logueado recibido via IPC ***');
    console.log('[HablaPe] agentId:', loggedInUserId);
    console.log('[HablaPe] userName:', loggedInUserName);
  });

  ipcMain.on('clear-logged-in-user', () => {
    console.log('[HablaPe] Usuario deslogueado:', loggedInUserId);
    loggedInUserId = null;
    loggedInUserName = null;
  });

  // === Active Client (para asociar medios al cliente del chat) ===
  ipcMain.on('set-active-client', (_, data: { clientUserId: number | null; chatPhone: string; chatName: string }) => {
    activeClientUserId = data.clientUserId;
    activeClientPhone = data.chatPhone;
    activeClientName = data.chatName;
    console.log('[HablaPe] *** Cliente activo establecido ***');
    console.log('[HablaPe] clientUserId:', activeClientUserId);
    console.log('[HablaPe] chatPhone:', activeClientPhone);
    console.log('[HablaPe] chatName:', activeClientName);

    // También actualizar en WhatsApp BrowserView
    if (activeClientPhone) {
      updateChatPhoneInWhatsApp(activeClientPhone, activeClientName || '');
    }
  });

  ipcMain.on('clear-active-client', () => {
    console.log('[HablaPe] Cliente activo limpiado');
    activeClientUserId = null;
    activeClientPhone = null;
    activeClientName = null;
    // NO bloquear aquí - el bloqueo solo ocurre cuando se detecta un NUEVO chat
  });

  // === CRM Ready - Intenta desbloquear el chat si el teléfono coincide ===
  ipcMain.on('crm-client-ready', async (_, data: { phone: string }) => {
    const phone = data?.phone || '';
    console.log('[HablaPe] *** CRM terminó de procesar:', phone || '(sin teléfono)');
    await tryUnblockWhatsAppChat(phone);
  });

  // === Controles de ventana ===
  ipcMain.on('window-minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.on('window-close', () => {
    mainWindow?.close();
  });

  ipcMain.handle('window-is-maximized', () => {
    return mainWindow?.isMaximized() ?? false;
  });

  // === Control de WhatsApp View ===
  ipcMain.handle('show-whatsapp', () => {
    showWhatsAppView();
    return whatsappVisible;
  });

  ipcMain.handle('hide-whatsapp', () => {
    hideWhatsAppView();
    return !whatsappVisible;
  });

  ipcMain.handle('get-whatsapp-visible', () => {
    return whatsappVisible;
  });

  // === Overlay Mode (para ocultar WhatsApp cuando hay menús abiertos) ===
  ipcMain.handle('whatsapp:set-overlay-mode', (_, overlayOpen: boolean) => {
    if (!mainWindow || !whatsappView) return false;

    if (overlayOpen) {
      // Ocultar WhatsApp temporalmente (remover del window)
      if (whatsappVisible && mainWindow.getBrowserViews().includes(whatsappView)) {
        mainWindow.removeBrowserView(whatsappView);
        console.log('[HablaPe] WhatsApp ocultado temporalmente (overlay abierto)');
      }
    } else {
      // Restaurar WhatsApp si estaba visible
      if (whatsappVisible && !mainWindow.getBrowserViews().includes(whatsappView)) {
        mainWindow.addBrowserView(whatsappView);
        updateWhatsAppViewBounds();
        console.log('[HablaPe] WhatsApp restaurado (overlay cerrado)');
      }
    }

    return true;
  });

  // Toggle sidebar
  ipcMain.on('toggle-sidebar', () => {
    // Actualizar bounds de WhatsApp view cuando cambia sidebar
    if (whatsappVisible) {
      updateWhatsAppViewBounds();
    }
  });

  // Actualizar bounds cuando cambia el layout
  ipcMain.on('update-layout', (_, data: { sidebarCollapsed?: boolean }) => {
    if (data.sidebarCollapsed !== undefined) {
      sidebarCollapsed = data.sidebarCollapsed;
    }
    if (whatsappVisible) {
      updateWhatsAppViewBounds();
    }
  });

  // Handler específico para sidebar (con animación)
  ipcMain.on('sidebar-toggle', (_, collapsed: boolean) => {
    sidebarCollapsed = collapsed;
    if (whatsappVisible) {
      animateWhatsAppViewBounds();
    }
  });

  // WhatsApp BrowserView - ahora controlado por show/hide
  ipcMain.on('set-view', (_, view: string) => {
    // Ya no hace nada - el control es explícito con show/hide
  });

  // Obtener estado de sesión WhatsApp
  ipcMain.handle('get-whatsapp-status', async () => {
    if (!whatsappView || !whatsappVisible) return { connected: false, visible: whatsappVisible };

    try {
      // Intentar detectar si hay sesión activa
      const url = whatsappView.webContents.getURL();
      return {
        connected: url.includes('web.whatsapp.com'),
        url: url,
        visible: whatsappVisible
      };
    } catch {
      return { connected: false, visible: whatsappVisible };
    }
  });

  // Escanear mensajes del chat actual
  ipcMain.handle('scan-messages', async (_, telefono: string) => {
    clearScannedMessages(); // Limpiar cache al escanear nuevo chat
    const messages = await scanChatMessages(telefono);
    return messages;
  });

  // Escanear nuevos mensajes (sin limpiar cache)
  ipcMain.handle('scan-new-messages', async (_, telefono: string) => {
    const messages = await scanChatMessages(telefono);
    return messages;
  });

  // Obtener ancho disponible para Angular
  ipcMain.handle('get-angular-bounds', () => {
    if (!mainWindow) return null;
    const [width] = mainWindow.getContentSize();
    if (whatsappVisible) {
      const whatsappWidth = Math.floor(width / 2);
      return {
        angularWidth: width - whatsappWidth,
        whatsappVisible: true
      };
    }
    return {
      angularWidth: width,
      whatsappVisible: false
    };
  });

  // Limpiar sesión y recargar (para casos de auth corrupta)
  ipcMain.handle('clear-session-and-reload', async () => {
    console.log('[HolaPe] Limpiando sesión por solicitud de Angular...');
    if (mainWindow) {
      await mainWindow.webContents.executeJavaScript(`
        localStorage.clear();
        sessionStorage.clear();
      `);
      mainWindow.webContents.reload();
    }
    return true;
  });

  // Solo recargar
  ipcMain.handle('reload-app', () => {
    console.log('[HolaPe] Recargando app...');
    mainWindow?.webContents.reload();
    return true;
  });

  // Enviar mensaje a WhatsApp Web (para canned messages / respuestas rápidas)
  ipcMain.handle('whatsapp:send-message', async (_, text: string) => {
    if (!whatsappView || !whatsappVisible) {
      console.log('[HablaPe] No se puede enviar mensaje: WhatsApp no visible');
      return false;
    }

    try {
      // Inyectar el texto en el input de WhatsApp Web
      const result = await whatsappView.webContents.executeJavaScript(`
        (function() {
          // Buscar el input de conversación
          const input = document.querySelector('[data-testid="conversation-compose-box-input"]') ||
                        document.querySelector('div[contenteditable="true"][data-tab="10"]') ||
                        document.querySelector('footer div[contenteditable="true"]');

          if (!input) {
            console.log('[HablaPe] No se encontró el input de mensaje');
            return { success: false, error: 'input_not_found' };
          }

          // Enfocar el input
          input.focus();

          // Insertar el texto
          const text = ${JSON.stringify(text)};

          // Método 1: execCommand (más compatible)
          document.execCommand('insertText', false, text);

          // Disparar eventos para que WhatsApp detecte el cambio
          input.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));

          return { success: true };
        })()
      `, true);

      console.log('[HablaPe] Mensaje insertado:', result);
      return result.success;
    } catch (err) {
      console.error('[HablaPe] Error enviando mensaje a WhatsApp:', err);
      return false;
    }
  });

  // Restablecimiento completo - limpia TODOS los datos y reinicia
  ipcMain.handle('full-reset', async () => {
    console.log('[HolaPe] Ejecutando restablecimiento completo...');

    try {
      // 1. Limpiar localStorage y sessionStorage del renderer
      if (mainWindow) {
        await mainWindow.webContents.executeJavaScript(`
          localStorage.clear();
          sessionStorage.clear();
        `);
      }

      // 2. Limpiar la sesión de la partición de WhatsApp
      const whatsappSession = session.fromPartition('persist:whatsapp');
      await whatsappSession.clearStorageData();
      await whatsappSession.clearCache();
      console.log('[HolaPe] Sesión de WhatsApp limpiada');

      // 3. Limpiar la sesión principal
      const defaultSession = session.defaultSession;
      await defaultSession.clearStorageData();
      await defaultSession.clearCache();
      console.log('[HolaPe] Sesión principal limpiada');

      // 4. Destruir WhatsApp view si existe
      if (whatsappView && mainWindow) {
        mainWindow.removeBrowserView(whatsappView);
        whatsappView = null;
        whatsappVisible = false;
        whatsappInitialized = false;
      }

      // 5. Recargar la aplicación
      if (mainWindow) {
        mainWindow.webContents.reload();
      }

      return true;
    } catch (error) {
      console.error('[HolaPe] Error en restablecimiento completo:', error);
      // Intentar recargar de todos modos
      mainWindow?.webContents.reload();
      return false;
    }
  });
}

// Deshabilitar aceleración de hardware y cache GPU para evitar errores en Windows
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-software-rasterizer');

// Ignorar errores de certificado SSL
app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('allow-insecure-localhost');

// Configurar path de datos persistente
app.setPath('userData', path.join(app.getPath('appData'), 'HablaPe'));

// Ignorar errores de certificado SSL (para servidores con certificados auto-firmados)
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  // Permitir conexiones a nuestro servidor de producción
  if (url.includes('digitalclub.contactototal.com.pe')) {
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});

// App lifecycle
app.whenReady().then(async () => {
  // Generar o cargar fingerprint único para esta instalación
  userFingerprint = getOrCreateFingerprint();

  // NO limpiar localStorage al iniciar - contiene tokens de autenticación
  // Solo limpiar caché de recursos (no datos de usuario)
  const ses = session.defaultSession;
  await ses.clearCache();
  console.log('[HolaPe] Caché de recursos limpiada');

  createWindow();
  registerShortcuts();
  startClipboardMonitor();
  setupIPC();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  // Limpiar shortcuts
  globalShortcut.unregisterAll();
});

// Manejar cierre de la ventana principal - notificar al renderer
app.on('before-quit', (event) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    // Notificar a Angular que la app se está cerrando
    // Angular puede decidir si hacer logout o no
    mainWindow.webContents.send('app-closing');
  }
});

// Seguridad: Prevenir navegación a URLs externas en la ventana principal
app.on('web-contents-created', (_, contents) => {
  contents.on('will-navigate', (event, url) => {
    const ANGULAR_URL = process.env.ANGULAR_URL || 'http://digitalclub.contactototal.com.pe/';
    // Permitir WhatsApp Web, Angular URL y file://
    const isAllowed = url.includes('web.whatsapp.com') ||
                      url.startsWith(ANGULAR_URL) ||
                      url.startsWith('file://');
    if (!isAllowed) {
      event.preventDefault();
    }
  });
});
