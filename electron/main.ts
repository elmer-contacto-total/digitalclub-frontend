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
        mimeType: payload.mimeType,
        size: payload.size,
        chatPhone: payload.chatPhone,
        timestamp: payload.capturedAt,
        description: `${payload.mediaType} capturado del chat ${payload.chatPhone}`
      });
    }
  } catch (err) {
    console.error('[HablaPe Media] Error de conexión:', err);
    // TODO: Implementar cola offline para reintentos
  }
}

/**
 * Callback para manejar medios capturados desde el BrowserView
 */
function handleMediaCaptured(data: { data: string; type: string; size: number; chatPhone: string; timestamp: string; source: string; duration?: number }): void {
  const isImage = data.type.startsWith('image/');
  const isAudio = data.type.startsWith('audio/');

  if (!isImage && !isAudio) {
    console.log('[HablaPe Media] Tipo no soportado ignorado:', data.type);
    return;
  }

  const payload: MediaCapturePayload = {
    mediaId: generateMediaId(),
    userId: userFingerprint.odaId,
    chatPhone: data.chatPhone,
    chatName: null,
    mediaType: isImage ? 'IMAGE' : 'AUDIO',
    mimeType: data.type,
    data: data.data,
    size: data.size,
    duration: data.duration,
    capturedAt: data.timestamp,
    source: data.source as 'PREVIEW' | 'PLAYBACK'
  };

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

  // Manejar errores de carga
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`[HablaPe] Error cargando Angular: ${errorCode} - ${errorDescription}`);

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
          p { color: #a1a1aa; margin-bottom: 2rem; }
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
        <p>Asegúrate de que Angular esté corriendo en ${ANGULAR_URL}</p>
        <button onclick="location.reload()">Reintentar</button>
        <p class="error-code">Error: ${errorCode} - ${errorDescription}</p>
      </body>
      </html>
    `;
    mainWindow?.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHTML)}`);
  });

  mainWindow.loadURL(ANGULAR_URL);

  // DevTools en desarrollo o con variable de entorno
  if (ANGULAR_URL.includes('localhost') || process.env.HOLAPE_DEBUG) {
    mainWindow.webContents.openDevTools();
  }

  // Log cuando termine de cargar y verificar si la página está en blanco
  mainWindow.webContents.on('did-finish-load', () => {
    const loadedURL = mainWindow?.webContents.getURL();
    console.log('[HolaPe] Página cargada:', loadedURL);
    console.log('[HolaPe] URL esperada:', ANGULAR_URL);

    // Verificar el contenido en múltiples intentos para detectar pantalla gris
    let checkCount = 0;
    const maxChecks = 3;
    const checkInterval = 2000; // 2 segundos entre checks

    const checkPageContent = async () => {
      if (!mainWindow) return;
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
            return {
              bodyLen,
              hasAppRoot,
              hasRouterOutlet,
              hasVisibleContent,
              hasLoginForm,
              hasDashboard,
              isLoaded: hasLoginForm || hasDashboard || (hasAppRoot && hasRouterOutlet && hasVisibleContent)
            };
          })()
        `);

        console.log('[HolaPe Debug] Page check #' + checkCount + ':', pageInfo);

        // Si Angular cargó correctamente, no hacer nada
        if (pageInfo.isLoaded) {
          console.log('[HolaPe] Angular cargado correctamente');
          return;
        }

        // Si aún no cargó y tenemos más intentos, seguir esperando
        if (checkCount < maxChecks) {
          setTimeout(checkPageContent, checkInterval);
          return;
        }

        // Después de todos los intentos, si no hay contenido visible, mostrar recovery
        if (!pageInfo.hasVisibleContent || !pageInfo.hasAppRoot) {
          console.log('[HolaPe] Página sin contenido después de ' + (checkCount * checkInterval / 1000) + 's, mostrando recovery');
          showRecoveryOverlay();
        }
      } catch (err) {
        console.error('[HolaPe] Error verificando página:', err);
        if (checkCount < maxChecks) {
          setTimeout(checkPageContent, checkInterval);
        } else {
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
    onMediaCaptured: (payload) => {
      sendMediaToServer(payload);
    },
    onAuditLog: (payload) => {
      sendAuditLog(payload);
    }
  });

  // User-Agent dinámico basado en fingerprint único
  whatsappView.webContents.setUserAgent(userFingerprint.userAgent);

  // Inyectar anti-fingerprinting único ANTES de que cargue cualquier script de WhatsApp
  const evasionScript = generateEvasionScript(userFingerprint);
  whatsappView.webContents.on('dom-ready', () => {
    whatsappView?.webContents.executeJavaScript(evasionScript, true)
      .catch(err => console.error('[HablaPe] Error aplicando anti-fingerprinting:', err));
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
      }
    }, 5000); // Esperar 5 segundos para que WhatsApp cargue
  });

  // Abrir DevTools para debug (quitar en producción)
  // whatsappView.webContents.openDevTools({ mode: 'detach' });
  // mainWindow.webContents.openDevTools({ mode: 'detach' });
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

  // Detener scanner
  stopChatScanner();

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

// Sistema de escaneo de chat activo (lee el header del chat sin inyectar)
let lastDetectedChat = '';
let chatScannerInterval: NodeJS.Timeout | null = null;
let chatScannerRunning = false;

// Generar intervalo aleatorio entre 2-4 segundos (parece más humano)
function getRandomScanInterval(): number {
  return 2000 + Math.random() * 2000; // 2000-4000ms
}

async function scanChat(): Promise<void> {
  if (!whatsappView || !mainWindow || !chatScannerRunning || !whatsappVisible) return;

  try {
      // Leer el número de teléfono Y nombre del chat actual
      const result = await whatsappView.webContents.executeJavaScript(`
        (function() {
          // Buscar el área de conversación con múltiples selectores
          let mainArea = document.querySelector('#main');

          // Selectores alternativos si #main no existe
          if (!mainArea) {
            mainArea = document.querySelector('[data-testid="conversation-panel-wrapper"]');
          }
          if (!mainArea) {
            mainArea = document.querySelector('[data-testid="conversation-panel"]');
          }
          if (!mainArea) {
            // Buscar cualquier panel que tenga header con info del chat
            const panels = document.querySelectorAll('div[tabindex="-1"]');
            for (const panel of panels) {
              if (panel.querySelector('header') && panel.querySelector('[data-testid="conversation-header"]')) {
                mainArea = panel;
                break;
              }
            }
          }

          if (!mainArea) {
            // Debug más detallado
            const conversationHeader = document.querySelector('[data-testid="conversation-header"]');
            return {
              debug: 'no main area found',
              hasConversationHeader: !!conversationHeader,
              hasApp: !!document.querySelector('#app'),
              hasPane: !!document.querySelector('#pane-side')
            };
          }

          // Buscar header del chat
          let header = mainArea.querySelector('header');
          if (!header) {
            header = document.querySelector('[data-testid="conversation-header"]');
          }
          if (!header) return { debug: 'no header found' };

          // Primero extraer el nombre del header (siempre intentar)
          let chatName = null;
          const allSpans = header.querySelectorAll('span');
          for (const span of allSpans) {
            const text = span.textContent?.trim();
            if (!text || text.length === 0) continue;
            if (text.length > 50) continue;

            const lower = text.toLowerCase();
            if (lower.includes('clic') || lower.includes('click') ||
                lower.includes('escribiendo') || lower.includes('typing') ||
                lower.includes('últ.') || lower.includes('última') ||
                lower.includes('last seen') || lower.includes('en línea') ||
                lower.includes('online') || lower === 'hoy' || lower === 'ayer' ||
                /^\\d/.test(text) || /a\\. ?m\\.|p\\. ?m\\./i.test(text)) {
              continue;
            }
            chatName = text;
            break;
          }

          // Estrategia 1: Buscar en el título/header del chat (más confiable)
          // El título a veces muestra el número directamente
          const titleSpans = header.querySelectorAll('span[title]');
          for (const span of titleSpans) {
            const title = span.getAttribute('title') || '';
            // Buscar patrón de teléfono en el título
            const phoneInTitle = title.match(/\\+?(\\d[\\d\\s\\-]{8,}\\d)/);
            if (phoneInTitle) {
              const phone = phoneInTitle[1].replace(/[\\s\\-]/g, '');
              if (phone.length >= 9) {
                return { phone, name: chatName, source: 'title-attr' };
              }
            }
          }

          // Estrategia 2: Buscar data-id en mensajes del chat
          const messageElements = document.querySelectorAll('[data-id*="@c.us"]');
          for (const el of messageElements) {
            const dataId = el.getAttribute('data-id');
            if (dataId && dataId.includes('@c.us')) {
              let phone = dataId.split('@')[0];
              phone = phone.replace(/^(true|false)_/, '');
              // Validar que sea un número
              if (/^\\d{9,15}$/.test(phone)) {
                return { phone, name: chatName, source: 'message-data-id' };
              }
            }
          }

          // Estrategia 3: Buscar el data-id en el panel de conversación
          const conversationPanel = document.querySelector('[data-id]');
          if (conversationPanel) {
            const dataId = conversationPanel.getAttribute('data-id');
            if (dataId && dataId.includes('@c.us')) {
              let phone = dataId.split('@')[0];
              phone = phone.replace(/^(true|false)_/, '');
              if (/^\\d{9,15}$/.test(phone)) {
                return { phone, name: chatName, source: 'data-id' };
              }
            }
          }

          // Estrategia 4: Buscar en la URL o hash
          const hash = window.location.hash;
          const phoneMatch = hash.match(/(\\d{10,15})@c\\.us/);
          if (phoneMatch) {
            return { phone: phoneMatch[1], name: chatName, source: 'url-hash' };
          }

          // Estrategia 5: Buscar aria-label con número de teléfono
          const ariaElements = header.querySelectorAll('[aria-label]');
          for (const el of ariaElements) {
            const label = el.getAttribute('aria-label') || '';
            const phoneInLabel = label.match(/\\+?(\\d[\\d\\s\\-]{8,}\\d)/);
            if (phoneInLabel) {
              const phone = phoneInLabel[1].replace(/[\\s\\-]/g, '');
              if (phone.length >= 9) {
                return { phone, name: chatName, source: 'aria-label' };
              }
            }
          }

          // Estrategia 6: Buscar en la lista de chats del sidebar (chat activo)
          const sidePanel = document.querySelector('#pane-side');
          if (sidePanel && chatName) {
            // Buscar el chat activo (tiene aria-selected o está resaltado)
            const activeChat = sidePanel.querySelector('[aria-selected="true"]') ||
                              sidePanel.querySelector('[data-testid="cell-frame-container"][tabindex="-1"]') ||
                              sidePanel.querySelector('div[style*="background"]');

            if (activeChat) {
              // Buscar data-id en el chat activo o sus padres
              let parent = activeChat;
              for (let i = 0; i < 5 && parent; i++) {
                const dataId = parent.getAttribute && parent.getAttribute('data-id');
                if (dataId && dataId.includes('@c.us')) {
                  let phone = dataId.split('@')[0];
                  phone = phone.replace(/^(true|false)_/, '');
                  if (/^\\d{9,15}$/.test(phone)) {
                    return { phone, name: chatName, source: 'sidebar-active' };
                  }
                }
                parent = parent.parentElement;
              }
            }

            // Buscar por el nombre del chat en el sidebar
            const chatRows = sidePanel.querySelectorAll('[data-id*="@c.us"]');
            for (const row of chatRows) {
              const rowText = row.textContent || '';
              if (rowText.includes(chatName)) {
                const dataId = row.getAttribute('data-id');
                if (dataId) {
                  let phone = dataId.split('@')[0];
                  phone = phone.replace(/^(true|false)_/, '');
                  if (/^\\d{9,15}$/.test(phone)) {
                    return { phone, name: chatName, source: 'sidebar-match' };
                  }
                }
              }
            }
          }

          // Estrategia 7: Buscar en cualquier elemento visible con el teléfono
          const allText = mainArea.innerText || '';
          const phonePatterns = allText.match(/\\+?51\\s?9\\d{2}\\s?\\d{3}\\s?\\d{3}/g) ||
                               allText.match(/\\+?\\d{2,3}\\s?\\d{9,}/g);
          if (phonePatterns && phonePatterns.length > 0) {
            const phone = phonePatterns[0].replace(/[\\s\\+]/g, '');
            if (phone.length >= 9) {
              return { phone, name: chatName, source: 'text-pattern' };
            }
          }

          // Si no hay teléfono pero hay nombre, devolver solo el nombre
          if (chatName) {
            return { name: chatName, source: 'name-only' };
          }

          return { debug: 'no phone or name found' };
        })()
      `, true);

      // Si no hay datos válidos, salir
      if (result.debug) {
        return;
      }

      const identifier = result.phone || result.name;
      const isPhone = !!result.phone;

      if (identifier && identifier !== lastDetectedChat) {
        lastDetectedChat = identifier;

        // Enviar al renderer con la info de si es teléfono o nombre
        mainWindow.webContents.send('chat-selected', {
          phone: result.phone || null,
          name: result.name || null,
          isPhone
        });
      }
  } catch (err) {
    // Ignorar errores silenciosamente
  }

  // Programar siguiente escaneo con intervalo aleatorio
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
