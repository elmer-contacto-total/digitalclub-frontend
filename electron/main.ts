import {
  app,
  BrowserWindow,
  BrowserView,
  Menu,
  globalShortcut,
  clipboard,
  ipcMain,
  session
} from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { getOrCreateFingerprint, generateEvasionScript, UserFingerprint } from './fingerprint-generator';
import {
  initializeMediaSecurity,
  MediaCapturePayload,
  AuditLogPayload,
  RawMediaCaptureData,
  DeletedMediaNotification,
  generateMediaId
} from './media-security';
import { checkForUpdates, notifyUpdateAvailable, openDownloadUrl, downloadAndInstallUpdate } from './update-checker';
import { BulkSender } from './bulk-sender';

// App version - read from package.json via Electron's app.getVersion()
// When building with electron-builder, this reflects the version in package.json
const APP_VERSION = app.getVersion();

// Stored update info (so renderer can pull it if it missed the push)
let pendingUpdateInfo: any = null;

// Bulk sender for mass messaging
const BACKEND_BASE_URL = process.env.BACKEND_URL || 'http://digitalclub.contactototal.com.pe';
const bulkSender = new BulkSender(BACKEND_BASE_URL);
const BULK_SEND_STATE_FILE = path.join(app.getPath('userData'), 'bulk-send-state.json');
bulkSender.setStateFile(BULK_SEND_STATE_FILE);

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

// ==================== BACKUP DE MEDIA IDs CAPTURADOS ====================
// Persiste los whatsappMessageId de medias capturadas para sobrevivir cierres de sesión de WhatsApp
// (WhatsApp Web borra localStorage al cerrar sesión, perdiendo el tracking del IIFE)
const CAPTURED_MEDIA_IDS_FILE = path.join(app.getPath('userData'), 'captured-media-ids.json');

interface CapturedMediaEntry {
  chatName: string;
  capturedAt: string;
}

function loadCapturedMediaIds(): Map<string, CapturedMediaEntry> {
  try {
    if (fs.existsSync(CAPTURED_MEDIA_IDS_FILE)) {
      const data = JSON.parse(fs.readFileSync(CAPTURED_MEDIA_IDS_FILE, 'utf-8'));
      const map = new Map<string, CapturedMediaEntry>();
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 días
      for (const [key, value] of Object.entries(data)) {
        const entry = value as CapturedMediaEntry;
        // Podar entradas de más de 30 días
        if (new Date(entry.capturedAt).getTime() >= cutoff) {
          map.set(key, entry);
        }
      }
      console.log(`[MWS Deleted] Cargados ${map.size} media IDs capturados de disco`);
      return map;
    }
  } catch (e) {
    console.error('[MWS Deleted] Error cargando captured media IDs:', e);
  }
  return new Map();
}

function saveCapturedMediaIds(): void {
  try {
    const obj: Record<string, CapturedMediaEntry> = {};
    // Limitar a 500 entradas (las más recientes)
    const entries = Array.from(capturedMediaIds.entries());
    const toSave = entries.length > 500 ? entries.slice(-500) : entries;
    for (const [key, value] of toSave) {
      obj[key] = value;
    }
    fs.writeFileSync(CAPTURED_MEDIA_IDS_FILE, JSON.stringify(obj));
  } catch (e) {
    console.error('[MWS Deleted] Error guardando captured media IDs:', e);
  }
}

const capturedMediaIds: Map<string, CapturedMediaEntry> = loadCapturedMediaIds();

// ==================== BACKUP DE MENSAJES REVELADOS ====================
// Persiste los whatsappMessageId de imágenes ya reveladas (overlay "Presionar para mostrar" removido)
// Evita que el overlay reaparezca tras cierre de sesión de WhatsApp
const REVEALED_MESSAGES_FILE = path.join(app.getPath('userData'), 'revealed-messages.json');

function loadRevealedMessageIds(): Set<string> {
  try {
    if (fs.existsSync(REVEALED_MESSAGES_FILE)) {
      const data = JSON.parse(fs.readFileSync(REVEALED_MESSAGES_FILE, 'utf-8'));
      if (Array.isArray(data)) {
        console.log(`[MWS Overlay] Cargados ${data.length} mensajes revelados de disco`);
        return new Set(data);
      }
    }
  } catch (e) {
    console.error('[MWS Overlay] Error cargando revealed messages:', e);
  }
  return new Set();
}

function saveRevealedMessageIds(): void {
  try {
    // Limitar a 500 entradas (las más recientes)
    const arr = Array.from(revealedMessageIds);
    const toSave = arr.length > 500 ? arr.slice(-500) : arr;
    fs.writeFileSync(REVEALED_MESSAGES_FILE, JSON.stringify(toSave));
  } catch (e) {
    console.error('[MWS Overlay] Error guardando revealed messages:', e);
  }
}

const revealedMessageIds: Set<string> = loadRevealedMessageIds();

// Cola de eliminaciones pendientes por reintentar (si el backend falló)
// Persistida en disco para sobrevivir reinicios de la app
const PENDING_DELETIONS_FILE = path.join(app.getPath('userData'), 'pending-deletions.json');

function loadPendingDeletions(): string[] {
  try {
    if (fs.existsSync(PENDING_DELETIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PENDING_DELETIONS_FILE, 'utf-8'));
      if (Array.isArray(data)) {
        console.log(`[MWS Deleted] Cargadas ${data.length} eliminaciones pendientes de disco`);
        return data;
      }
    }
  } catch (e) {
    console.error('[MWS Deleted] Error cargando eliminaciones pendientes:', e);
  }
  return [];
}

function savePendingDeletions(): void {
  try {
    fs.writeFileSync(PENDING_DELETIONS_FILE, JSON.stringify(pendingDeletions));
  } catch (e) {
    console.error('[MWS Deleted] Error guardando eliminaciones pendientes:', e);
  }
}

const pendingDeletions: string[] = loadPendingDeletions();

// Token JWT para autenticación en API calls de media
let mediaAuthToken: string | null = null;


// ==================== FUNCIONES DE ENVÍO AL BACKEND ====================

/** Build headers for media API calls (includes auth token if available) */
function getMediaApiHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (mediaAuthToken) {
    headers['Authorization'] = `Bearer ${mediaAuthToken}`;
  }
  return headers;
}

/**
 * Envía un log de auditoría al backend
 */
async function sendAuditLog(payload: AuditLogPayload): Promise<void> {
  try {
    const response = await fetch(`${MEDIA_API_URL}/audit`, {
      method: 'POST',
      headers: getMediaApiHeaders(),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error('[MWS Audit] Error enviando log:', response.status);
    } else {
      console.log('[MWS Audit] Log registrado:', payload.action);
    }
  } catch (err) {
    console.error('[MWS Audit] Error de conexión:', err);
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
      headers: getMediaApiHeaders(),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error('[MWS Media] Error enviando medio:', response.status);
    } else {
      console.log('[MWS Media] Medio guardado:', payload.mediaType, payload.size, 'bytes');

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
    console.error('[MWS Media] Error de conexión:', err);
    // TODO: Implementar cola offline para reintentos
  }
}

/**
 * Notifica al backend que un mensaje de WhatsApp fue eliminado
 */
async function sendMediaDeletionToServer(whatsappMessageId: string, isDisappearing: boolean = false): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(`${MEDIA_API_URL}/mark-deleted`, {
        method: 'POST',
        headers: getMediaApiHeaders(),
        body: JSON.stringify({ whatsappMessageId, isDisappearing })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('[MWS Deleted] Eliminación notificada:', whatsappMessageId, 'status:', result.status);
        // Limpiar del backup en disco — ya no necesitamos trackear este mensaje
        capturedMediaIds.delete(whatsappMessageId);
        saveCapturedMediaIds();
        return;
      }
      console.error(`[MWS Deleted] Error notificando eliminación (intento ${attempt}/3):`, response.status);
    } catch (err) {
      console.error(`[MWS Deleted] Error de conexión (intento ${attempt}/3):`, err);
    }
    if (attempt < 3) {
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
    }
  }
  // All retries failed — queue for periodic retry
  console.warn('[MWS Deleted] Todos los reintentos fallaron, agregando a cola pendiente:', whatsappMessageId);
  if (!pendingDeletions.includes(whatsappMessageId)) {
    pendingDeletions.push(whatsappMessageId);
    savePendingDeletions();
  }
}

// Retry pending deletions every 60 seconds
setInterval(async () => {
  if (pendingDeletions.length === 0) return;
  console.log(`[MWS Deleted] Reintentando ${pendingDeletions.length} eliminaciones pendientes`);
  const toRetry = pendingDeletions.splice(0, pendingDeletions.length);
  for (const id of toRetry) {
    try {
      const response = await fetch(`${MEDIA_API_URL}/mark-deleted`, {
        method: 'POST',
        headers: getMediaApiHeaders(),
        body: JSON.stringify({ whatsappMessageId: id })
      });
      if (response.ok) {
        console.log('[MWS Deleted] Reintento exitoso:', id);
        capturedMediaIds.delete(id);
      } else {
        pendingDeletions.push(id);
      }
    } catch {
      pendingDeletions.push(id);
    }
  }
  savePendingDeletions();
  saveCapturedMediaIds();
}, 60000);

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
  console.log('[MWS Media] ========== MEDIA CAPTURE START ==========');
  console.log('[MWS Media] Estado actual de loggedInUserId:', loggedInUserId);
  console.log('[MWS Media] Datos recibidos del script:');
  console.log('[MWS Media]   chatPhone:', data.chatPhone);
  console.log('[MWS Media]   chatName:', data.chatName);
  console.log('[MWS Media]   messageSentAt:', data.messageSentAt);
  console.log('[MWS Media]   whatsappMessageId:', data.whatsappMessageId);
  console.log('[MWS Media]   type:', data.type);
  console.log('[MWS Media]   size:', data.size);

  const isImage = data.type.startsWith('image/');
  const isAudio = data.type.startsWith('audio/');

  if (!isImage && !isAudio) {
    console.log('[MWS Media] Tipo no soportado ignorado:', data.type);
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
      console.log('[MWS Media] clientUserId CONFIRMADO - teléfonos coinciden:', scriptLast9);
    } else {
      console.log('[MWS Media] clientUserId DESCARTADO - teléfonos NO coinciden:');
      console.log('[MWS Media]   script:', scriptLast9, 'vs angular:', activeLast9);
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

  console.log('[MWS Media] Active client state (from Angular):');
  console.log('[MWS Media]   activeClientUserId:', activeClientUserId);
  console.log('[MWS Media]   activeClientPhone:', activeClientPhone);
  console.log('[MWS Media]   activeClientName:', activeClientName);
  console.log('[MWS Media] Chat scanner state:');
  console.log('[MWS Media]   lastDetectedPhone:', lastDetectedPhone);
  console.log('[MWS Media]   lastDetectedName:', lastDetectedName);
  console.log('[MWS Media] Payload FINAL a enviar:');
  console.log('[MWS Media]   agentId:', payload.agentId);
  console.log('[MWS Media]   clientUserId:', payload.clientUserId);
  console.log('[MWS Media]   chatPhone:', payload.chatPhone);
  console.log('[MWS Media]   chatName:', payload.chatName);
  console.log('[MWS Media]   messageSentAt:', payload.messageSentAt);
  console.log('[MWS Media] ========== SENDING TO SERVER ==========');
  sendMediaToServer(payload);

  // Persistir el whatsappMessageId en disco para sobrevivir cierres de sesión de WhatsApp
  if (data.whatsappMessageId) {
    capturedMediaIds.set(data.whatsappMessageId, {
      chatName: effectiveChatName || '',
      capturedAt: new Date().toISOString()
    });
    saveCapturedMediaIds();

    // También marcar como revelado (para que el overlay no reaparezca)
    if (!revealedMessageIds.has(data.whatsappMessageId)) {
      revealedMessageIds.add(data.whatsappMessageId);
      saveRevealedMessageIds();
    }
  }
}

// Estado para animación suave
let currentBounds = { x: SIDEBAR_WIDTH, width: 0 };
let animationFrame: NodeJS.Timeout | null = null;
const ANIMATION_DURATION = 200; // ms - debe coincidir con CSS transition
const ANIMATION_STEPS = 12; // frames para la animación

function createWindow(): void {
  // Quitar menú nativo de Electron (File, Edit, View, Window, Help)
  Menu.setApplicationMenu(null);

  // Crear ventana principal
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1400,
    minHeight: 700,
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
      console.warn(`[MWS] Error cargando recurso secundario: ${errorCode} - ${errorDescription} - ${validatedURL}`);
      return;
    }

    // Ignorar errores de cancelación (usuario navegó a otra página)
    if (errorCode === -3) { // ERR_ABORTED
      console.log('[MWS] Carga cancelada (navegación)');
      return;
    }

    console.error(`[MWS] Error cargando página principal: ${errorCode} - ${errorDescription}`);
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
    console.log('[MWS] Página cargada:', loadedURL);
    console.log('[MWS] URL esperada:', ANGULAR_URL);

    // No verificar si ya mostramos un error o si es una página de error
    if (errorOverlayShown || loadedURL?.startsWith('data:')) {
      console.log('[MWS] Saltando verificación (error overlay activo o página de error)');
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

        console.log('[MWS Debug] Page check #' + checkCount + ':', pageInfo);

        // Si Angular cargó correctamente, marcar como exitoso
        if (pageInfo.isLoaded) {
          console.log('[MWS] Angular cargado correctamente');
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
          console.log('[MWS] Página sin contenido después de ' + (checkCount * checkInterval / 1000) + 's, mostrando recovery');
          showRecoveryOverlay();
        }
      } catch (err) {
        console.error('[MWS] Error verificando página:', err);
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
    console.log(`[MWS Console] ${message}`);
  });

  // NO crear WhatsApp view automáticamente - se crea bajo demanda
  // createWhatsAppView();

  // Maximizar cuando esté listo
  mainWindow.once('ready-to-show', () => {
    mainWindow?.maximize();
    mainWindow?.show();

    // Check for updates after 5 seconds
    setTimeout(async () => {
      try {
        console.log('[MWS] Checking for updates... Current version:', APP_VERSION);
        const updateInfo = await checkForUpdates(APP_VERSION);

        if (updateInfo?.updateAvailable && mainWindow && !mainWindow.isDestroyed()) {
          console.log('[MWS] Update available:', updateInfo.latestVersion?.version);
          pendingUpdateInfo = updateInfo;
          notifyUpdateAvailable(mainWindow, updateInfo);
        } else {
          console.log('[MWS] No update available or app is up to date');
        }
      } catch (error) {
        console.error('[MWS] Error checking for updates:', error);
        // Silently fail - update check is not critical
      }
    }, 5000);
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
      if (document.getElementById('mws-recovery-overlay')) return;

      const overlay = document.createElement('div');
      overlay.id = 'mws-recovery-overlay';
      overlay.innerHTML = \`
        <style>
          #mws-recovery-overlay {
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
          #mws-recovery-overlay .logo {
            font-size: 48px;
            margin-bottom: 24px;
          }
          #mws-recovery-overlay h1 {
            color: #fafafa;
            font-size: 24px;
            margin-bottom: 8px;
          }
          #mws-recovery-overlay p {
            color: #a1a1aa;
            margin-bottom: 24px;
            text-align: center;
            max-width: 400px;
            line-height: 1.5;
          }
          #mws-recovery-overlay .buttons {
            display: flex;
            flex-direction: column;
            gap: 12px;
            width: 280px;
          }
          #mws-recovery-overlay button {
            padding: 14px 28px;
            border-radius: 8px;
            font-size: 15px;
            font-weight: 500;
            cursor: pointer;
            border: none;
            transition: all 0.2s;
            width: 100%;
          }
          #mws-recovery-overlay .btn-primary {
            background: #22c55e;
            color: white;
          }
          #mws-recovery-overlay .btn-primary:hover {
            background: #16a34a;
          }
          #mws-recovery-overlay .btn-secondary {
            background: #27272a;
            color: #fafafa;
            border: 1px solid #3f3f46;
          }
          #mws-recovery-overlay .btn-secondary:hover {
            background: #3f3f46;
          }
          #mws-recovery-overlay .btn-danger {
            background: transparent;
            color: #f87171;
            border: 1px solid #7f1d1d;
            font-size: 13px;
            padding: 10px 20px;
          }
          #mws-recovery-overlay .btn-danger:hover {
            background: #7f1d1d;
            color: white;
          }
          #mws-recovery-overlay .hint {
            margin-top: 20px;
            font-size: 12px;
            color: #71717a;
            text-align: center;
          }
          #mws-recovery-overlay .divider {
            margin: 16px 0;
            border-top: 1px solid #27272a;
            width: 100%;
          }
        </style>
        <div class="logo">⚠️</div>
        <h1>La aplicación no cargó</h1>
        <p>Esto puede ocurrir por datos de sesión corruptos o problemas de conexión con el servidor.</p>
        <div class="buttons">
          <button class="btn-primary" onclick="window.mwsRecoveryReload()">
            Reintentar
          </button>
          <button class="btn-secondary" onclick="window.mwsRecoveryClearSession()">
            Limpiar sesión y reintentar
          </button>
          <div class="divider"></div>
          <button class="btn-danger" onclick="window.mwsRecoveryFullReset()">
            Restablecer completamente
          </button>
        </div>
        <p class="hint">El restablecimiento completo borra todos los datos<br>incluyendo la sesión de WhatsApp</p>
      \`;
      document.body.appendChild(overlay);

      // Funciones globales para los botones
      window.mwsRecoveryReload = function() {
        location.reload();
      };

      window.mwsRecoveryClearSession = function() {
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

      window.mwsRecoveryFullReset = function() {
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

  console.log('[MWS] Creando WhatsApp BrowserView...');

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
    },
    onMediaDeleted: (data) => {
      console.log('[MWS Deleted] Mensaje eliminado detectado:', data.whatsappMessageId, data.isDisappearing ? '(disappearing)' : '');
      sendMediaDeletionToServer(data.whatsappMessageId, data.isDisappearing || false);
    }
  }, capturedMediaIds, revealedMessageIds);

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
      console.log('[MWS] Botón de adjuntar ocultado');
    })();
  `;

  whatsappView.webContents.on('dom-ready', () => {
    // Aplicar anti-fingerprinting
    whatsappView?.webContents.executeJavaScript(evasionScript, true)
      .catch(err => console.error('[MWS] Error aplicando anti-fingerprinting:', err));

    // Ocultar botón de adjuntar
    whatsappView?.webContents.executeJavaScript(hideAttachButtonCSS, true)
      .catch(err => console.error('[MWS] Error ocultando botón adjuntar:', err));
  });

  // Aplicar zoom cuando cargue
  whatsappView.webContents.on('did-finish-load', () => {
    whatsappView?.webContents.setZoomFactor(0.80);
  });

  whatsappView.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[MWS] Error cargando WhatsApp:', errorCode, errorDescription);
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
        console.log('[MWS] ✓ Teléfono extraído via console-message:', phone);
        handlePhoneExtracted(phone);
        // Limpiar variable en IIFE para evitar que checkForExtractedPhone la procese también
        whatsappView?.webContents.executeJavaScript(
          'window.__hablapeExtractedPhone = null; window.__hablapePhoneExtractedAt = null;',
          true
        ).catch(() => {});
      } else if (rawPhone && rawPhone !== phone) {
        console.log('[MWS] Teléfono rechazado (inválido):', rawPhone, '->', phone);
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
        console.log('[MWS] Chat bloqueado via sidebar click (pre-sync)');

        // Timeout de seguridad por si el scanner no detecta nada
        if (chatBlockState.timeoutHandle) {
          clearTimeout(chatBlockState.timeoutHandle);
        }
        chatBlockState.timeoutHandle = setTimeout(() => {
          if (chatBlockState.isBlocked) {
            console.log('[MWS] ⚠️ TIMEOUT (sidebar click) - desbloqueando');
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

  console.log('[MWS] Mostrando WhatsApp view...');

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

  // Notificar al IIFE que la vista es visible (para congelar/descongelar deletion tracking)
  whatsappView?.webContents.executeJavaScript('window.__hablapeViewVisible = true;', true).catch(() => {});

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

  console.log('[MWS] Ocultando WhatsApp view...');

  // Notificar al IIFE que la vista se oculta (para congelar deletion tracking)
  whatsappView.webContents.executeJavaScript('window.__hablapeViewVisible = false;', true).catch(() => {});

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
      console.log('[MWS Debug] Chat actualizado desde Electron:', '${phone}', '${name || ''}');
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
    console.log('[MWS] Número extraído limpiado');
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

  console.log('[MWS] ⏳ BLOQUEANDO chat - esperando CRM para:', expectedPhone);

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
      console.log('[MWS] ⚠️ TIMEOUT - Desbloqueando automáticamente (CRM no respondió)');
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
    console.log('[MWS] tryUnblock: No hay bloqueo activo, ignorando');
    return false;
  }

  // Normalizar teléfonos para comparación (últimos 9 dígitos)
  const normalizePhone = (p: string | null) => p ? p.replace(/\D/g, '').slice(-9) : '';
  const expectedNorm = normalizePhone(chatBlockState.expectedPhone);
  const processedNorm = normalizePhone(processedPhone);

  console.log('[MWS] tryUnblock: expected=' + expectedNorm + ', processed=' + processedNorm + ', waitingManual=' + chatBlockState.waitingForManualExtraction);

  // Caso especial: Esperando extracción manual (overlay de instrucciones)
  // NO desbloquear con crmClientReady vacío - solo se desbloquea con extracción manual
  if (chatBlockState.waitingForManualExtraction && !processedNorm) {
    console.log('[MWS] ⏳ Esperando extracción manual - ignorando crmClientReady vacío');
    return false;
  }

  // Caso 1: expectedPhone es null pero NO estamos esperando extracción manual
  // (bloqueado desde sidebar antes que scanner detectara)
  if (!expectedNorm && !chatBlockState.waitingForManualExtraction) {
    await forceUnblockWhatsAppChat();
    console.log('[MWS] ✓ DESBLOQUEADO - CRM respondió (sidebar click, pre-scanner)');
    return true;
  }

  // Caso 2: Hay teléfono procesado - desbloquear si coincide o si no hay expected
  if (processedNorm) {
    if (!expectedNorm || expectedNorm === processedNorm) {
      await forceUnblockWhatsAppChat();
      console.log('[MWS] ✓ DESBLOQUEADO - teléfono válido recibido');
      return true;
    } else {
      // El teléfono no coincide - ignorar (es de un chat anterior)
      console.log('[MWS] ⚠️ Ignorando desbloqueo - teléfono no coincide');
      return false;
    }
  }

  // Caso 3: Hay expectedPhone pero CRM no envió teléfono
  // Y NO estamos esperando extracción manual
  if (expectedNorm && !processedNorm && !chatBlockState.waitingForManualExtraction) {
    await forceUnblockWhatsAppChat();
    console.log('[MWS] ✓ DESBLOQUEADO - CRM procesó (sin teléfono en respuesta)');
    return true;
  }

  console.log('[MWS] ⚠️ No se cumplió ninguna condición de desbloqueo');
  return false;
}

/**
 * Fuerza el desbloqueo del chat (sin verificar teléfono)
 * Usado por timeout y casos especiales
 */
async function forceUnblockWhatsAppChat(): Promise<void> {
  console.log('[MWS] forceUnblockWhatsAppChat() llamado');

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
    console.log('[MWS] ⚠️ whatsappView es null - no se puede ocultar blocker');
    return;
  }

  console.log('[MWS] Ejecutando __hablapeHideChatBlocker en WhatsApp...');
  try {
    const result = await whatsappView.webContents.executeJavaScript(`
      (function() {
        console.log('[MWS] Dentro de executeJavaScript para ocultar blocker');
        if (window.__hablapeHideChatBlocker) {
          window.__hablapeHideChatBlocker();
          return 'success';
        } else {
          console.log('[MWS] ⚠️ __hablapeHideChatBlocker NO existe');
          return 'function_not_found';
        }
      })()
    `, true);
    console.log('[MWS] executeJavaScript resultado:', result);
  } catch (err) {
    console.error('[MWS] ERROR en executeJavaScript:', err);
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
    console.log('[MWS] 📱 Mostrando instrucciones para revelar número');
  } catch (err) {
    // Ignorar errores
  }

  // Timeout más largo para este caso (30 segundos) ya que requiere acción del usuario
  chatBlockState.timeoutHandle = setTimeout(() => {
    if (chatBlockState.isBlocked) {
      console.log('[MWS] ⚠️ TIMEOUT largo - desbloqueando (usuario no reveló número)');
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
      console.log('[MWS] ✓ Teléfono extraído (fallback):', result.phone);
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

  // Guard: si ya se procesó este teléfono, ignorar duplicados
  if (phone === chatBlockState.expectedPhone) return;

  console.log('[MWS] ✓ Número extraído por usuario:', phone);

  lastDetectedPhone = phone;

  // Solo actualizar estado — NO re-bloquear (el overlay ya está visible)
  chatBlockState.expectedPhone = phone;
  chatBlockState.waitingForManualExtraction = false;

  updateChatPhoneInWhatsApp(phone, lastDetectedName || '');

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

        // PASOS 2-5 ELIMINADOS: Toda extracción automática de teléfono desde
        // sidebar, header, mensajes y nombre causaba el bug del "chat más reciente"
        // (recogía teléfonos de chats anteriores aún en el DOM).
        //
        // ÚNICO MÉTODO: El usuario hace click en el nombre del contacto →
        // Contact Info se abre → extractPhoneFromContactPanel() extrae el número.

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
        console.log('[MWS Debug] no_phone_found - chatName:', result.chatName, 'nameChanged:', nameChanged, 'isBlocked:', chatBlockState.isBlocked);
        if (nameChanged) {
          // Guard 1: Si ya extrajimos el teléfono y esperamos respuesta del CRM,
          // no re-bloquear — solo actualizar el nombre
          if (chatBlockState.expectedPhone) {
            lastDetectedName = result.chatName;
            console.log('[MWS] Nombre actualizado sin re-bloquear (esperando CRM para:', chatBlockState.expectedPhone + ')');
          }
          // Guard 2: Si el ciclo de extracción ya completó (tenemos teléfono, no hay bloqueo),
          // es solo una variación del header — no re-bloquear
          else if (lastDetectedPhone && !chatBlockState.isBlocked) {
            lastDetectedName = result.chatName;
            console.log('[MWS] Nombre actualizado sin re-bloquear (ciclo completado, teléfono:', lastDetectedPhone + ')');
          }
          // Caso normal: chat nuevo sin teléfono → mostrar overlay
          else {
            console.log('[MWS] Chat sin número detectado:', result.chatName);
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
      }
      // NO hacer return aquí - continuar para programar siguiente scan
    } else {
      // Tenemos un resultado válido con teléfono
      const { phone, name, source } = result;

      // Verificar si cambió el chat (por teléfono o nombre)
      const phoneChanged = phone !== lastDetectedPhone;
      const nameChanged = name && name !== lastDetectedName;

      if (phoneChanged || nameChanged) {
        console.log(`[MWS] Chat detectado via ${source}:`, phone, name);

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
    console.error('[MWS] Error en scanChat:', err);
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
  console.log('[MWS] Chat scanner iniciado');

  // Iniciar primer escaneo después de un delay aleatorio
  chatScannerInterval = setTimeout(scanChat, getRandomScanInterval());
}

function stopChatScanner(): void {
  chatScannerRunning = false;
  if (chatScannerInterval) {
    clearTimeout(chatScannerInterval);
    chatScannerInterval = null;
  }
  console.log('[MWS] Chat scanner detenido');
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
      console.log('[MWS] *** CAMBIO DE SESIÓN DETECTADO ***');
      console.log('[MWS] Estado anterior:', wasLoggedIn ? 'Logueado' : 'No logueado');
      console.log('[MWS] Estado nuevo:', isNowLoggedIn ? 'Logueado' : 'No logueado');
      console.log('[MWS] Indicadores:', sessionState.indicators);

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

  console.log('[MWS] Iniciando monitor de sesión de WhatsApp');

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
  console.log('[MWS] Monitor de sesión detenido');
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
    console.error('[MWS] Error escaneando mensajes:', err);
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
      console.log('[MWS] Forzando recarga con limpieza de sesión');
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
    console.log('[MWS] *** Usuario logueado recibido via IPC ***');
    console.log('[MWS] agentId:', loggedInUserId);
    console.log('[MWS] userName:', loggedInUserName);
  });

  ipcMain.on('set-auth-token', (_, token: string) => {
    mediaAuthToken = token;
    bulkSender.setAuthToken(token);
    console.log('[MWS] Auth token actualizado para API de media y bulk sender');
  });

  ipcMain.on('clear-logged-in-user', () => {
    console.log('[MWS] Usuario deslogueado:', loggedInUserId);
    loggedInUserId = null;
    loggedInUserName = null;
    mediaAuthToken = null;
  });

  // === Active Client (para asociar medios al cliente del chat) ===
  ipcMain.on('set-active-client', (_, data: { clientUserId: number | null; chatPhone: string; chatName: string }) => {
    activeClientUserId = data.clientUserId;
    activeClientPhone = data.chatPhone;
    activeClientName = data.chatName;
    console.log('[MWS] *** Cliente activo establecido ***');
    console.log('[MWS] clientUserId:', activeClientUserId);
    console.log('[MWS] chatPhone:', activeClientPhone);
    console.log('[MWS] chatName:', activeClientName);

    // También actualizar en WhatsApp BrowserView
    if (activeClientPhone) {
      updateChatPhoneInWhatsApp(activeClientPhone, activeClientName || '');
    }
  });

  ipcMain.on('clear-active-client', () => {
    console.log('[MWS] Cliente activo limpiado');
    activeClientUserId = null;
    activeClientPhone = null;
    activeClientName = null;
    // NO bloquear aquí - el bloqueo solo ocurre cuando se detecta un NUEVO chat
  });

  // === CRM Ready - Intenta desbloquear el chat si el teléfono coincide ===
  ipcMain.on('crm-client-ready', async (_, data: { phone: string }) => {
    const phone = data?.phone || '';
    console.log('[MWS] *** CRM terminó de procesar:', phone || '(sin teléfono)');
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
        console.log('[MWS] WhatsApp ocultado temporalmente (overlay abierto)');
      }
    } else {
      // Restaurar WhatsApp si estaba visible
      if (whatsappVisible && !mainWindow.getBrowserViews().includes(whatsappView)) {
        mainWindow.addBrowserView(whatsappView);
        updateWhatsAppViewBounds();
        console.log('[MWS] WhatsApp restaurado (overlay cerrado)');
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
    console.log('[MWS] Limpiando sesión por solicitud de Angular...');
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
    console.log('[MWS] Recargando app...');
    mainWindow?.webContents.reload();
    return true;
  });

  // Enviar mensaje a WhatsApp Web (para canned messages / respuestas rápidas)
  ipcMain.handle('whatsapp:send-message', async (_, text: string) => {
    if (!whatsappView || !whatsappVisible) {
      console.log('[MWS] No se puede enviar mensaje: WhatsApp no visible');
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
            console.log('[MWS] No se encontró el input de mensaje');
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

      console.log('[MWS] Mensaje insertado:', result);
      return result.success;
    } catch (err) {
      console.error('[MWS] Error enviando mensaje a WhatsApp:', err);
      return false;
    }
  });

  // === Bulk Send IPC Handlers ===

  // Send message AND press Enter (for bulk send)
  ipcMain.handle('whatsapp:send-and-submit', async (_, text: string) => {
    if (!whatsappView || !whatsappVisible) {
      return { success: false, error: 'whatsapp_not_visible' };
    }

    try {
      const result = await whatsappView.webContents.executeJavaScript(`
        (async function() {
          try {
            const input = document.querySelector('[data-testid="conversation-compose-box-input"]') ||
                          document.querySelector('div[contenteditable="true"][data-tab="10"]') ||
                          document.querySelector('footer div[contenteditable="true"]');

            if (!input) {
              return { success: false, error: 'input_not_found' };
            }

            input.focus();
            input.textContent = '';
            document.execCommand('insertText', false, ${JSON.stringify(text)});
            input.dispatchEvent(new InputEvent('input', { bubbles: true, data: ${JSON.stringify(text)} }));

            // Typing simulation delay
            await new Promise(r => setTimeout(r, ${500 + Math.random() * 1000}));

            // Click send button or press Enter
            const sendBtn = document.querySelector('[data-testid="send"]') ||
                            document.querySelector('button[aria-label="Send"]') ||
                            document.querySelector('span[data-icon="send"]')?.closest('button');

            if (sendBtn) {
              sendBtn.click();
            } else {
              input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
            }

            await new Promise(r => setTimeout(r, 1000));
            return { success: true };
          } catch(e) {
            return { success: false, error: e.message || 'send_error' };
          }
        })()
      `, true);

      console.log('[MWS] Message sent and submitted:', result);
      return result;
    } catch (err: any) {
      console.error('[MWS] Error in send-and-submit:', err);
      return { success: false, error: err.message };
    }
  });

  // Navigate to a chat by phone number
  ipcMain.handle('whatsapp:navigate-to-chat', async (_, phone: string) => {
    if (!whatsappView || !whatsappVisible) {
      return { success: false, error: 'whatsapp_not_visible' };
    }

    try {
      const result = await whatsappView.webContents.executeJavaScript(`
        (async function() {
          try {
            const searchBox = document.querySelector('[data-testid="chat-list-search"]') ||
                              document.querySelector('[data-icon="search"]')?.closest('button') ||
                              document.querySelector('#side [contenteditable="true"]');

            if (!searchBox) {
              return { success: false, error: 'search_not_found' };
            }

            searchBox.click();
            searchBox.focus();
            await new Promise(r => setTimeout(r, 300));

            const searchInput = document.querySelector('[data-testid="chat-list-search-input"]') ||
                                document.querySelector('#side div[contenteditable="true"]') ||
                                document.querySelector('[data-testid="search-input"]');

            if (!searchInput) {
              return { success: false, error: 'search_input_not_found' };
            }

            searchInput.focus();
            searchInput.textContent = '';
            document.execCommand('selectAll');
            document.execCommand('insertText', false, '${phone.replace(/'/g, "\\'")}');
            searchInput.dispatchEvent(new InputEvent('input', { bubbles: true }));

            await new Promise(r => setTimeout(r, 1500));

            const firstResult = document.querySelector('[data-testid="cell-frame-container"]') ||
                                document.querySelector('#pane-side [role="row"]') ||
                                document.querySelector('#pane-side [data-id]');

            if (!firstResult) {
              return { success: false, error: 'no_search_result' };
            }

            firstResult.click();
            await new Promise(r => setTimeout(r, 1000));

            const composeBox = document.querySelector('[data-testid="conversation-compose-box-input"]') ||
                               document.querySelector('footer div[contenteditable="true"]');

            const chatName = document.querySelector('#main header span[title]')?.getAttribute('title') || '';

            return { success: !!composeBox, chatName, error: composeBox ? undefined : 'chat_not_loaded' };
          } catch(e) {
            return { success: false, error: e.message || 'navigate_error' };
          }
        })()
      `, true);

      console.log('[MWS] Navigate to chat result:', result);
      return result;
    } catch (err: any) {
      console.error('[MWS] Error navigating to chat:', err);
      return { success: false, error: err.message };
    }
  });

  // Start bulk send
  ipcMain.handle('bulk-send:start', async (_, bulkSendId: number, authToken: string) => {
    try {
      bulkSender.setWhatsAppView(whatsappView);
      bulkSender.setAuthToken(authToken);
      const result = await bulkSender.start(bulkSendId);
      return result;
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // Pause bulk send
  ipcMain.handle('bulk-send:pause', async () => {
    bulkSender.pause();
    return { success: true };
  });

  // Resume bulk send
  ipcMain.handle('bulk-send:resume', async () => {
    bulkSender.resume();
    return { success: true };
  });

  // Cancel bulk send
  ipcMain.handle('bulk-send:cancel', async () => {
    bulkSender.cancel();
    return { success: true };
  });

  // Get bulk send status
  ipcMain.handle('bulk-send:status', async () => {
    return bulkSender.getStatus();
  });

  // Check for pending bulk send from previous session
  ipcMain.handle('bulk-send:check-pending', async () => {
    const state = bulkSender.getPersistedState();
    if (state && (state.state === 'running' || state.state === 'paused')) {
      return state;
    }
    return null;
  });

  // Restablecimiento completo - limpia TODOS los datos y reinicia
  ipcMain.handle('full-reset', async () => {
    console.log('[MWS] Ejecutando restablecimiento completo...');

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
      console.log('[MWS] Sesión de WhatsApp limpiada');

      // 3. Limpiar la sesión principal
      const defaultSession = session.defaultSession;
      await defaultSession.clearStorageData();
      await defaultSession.clearCache();
      console.log('[MWS] Sesión principal limpiada');

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
      console.error('[MWS] Error en restablecimiento completo:', error);
      // Intentar recargar de todos modos
      mainWindow?.webContents.reload();
      return false;
    }
  });

  // === Update Checker ===
  ipcMain.handle('open-download-url', (_, url: string) => {
    if (url && url.startsWith('http')) {
      openDownloadUrl(url);
      return true;
    }
    return false;
  });

  ipcMain.handle('get-app-version', () => {
    return APP_VERSION;
  });

  // Get pending update info (for when renderer missed the push event)
  ipcMain.handle('get-pending-update', () => {
    if (pendingUpdateInfo?.updateAvailable && pendingUpdateInfo.latestVersion) {
      return {
        version: pendingUpdateInfo.latestVersion.version,
        downloadUrl: pendingUpdateInfo.latestVersion.downloadUrl,
        releaseNotes: pendingUpdateInfo.latestVersion.releaseNotes,
        fileSize: pendingUpdateInfo.latestVersion.fileSize,
        mandatory: pendingUpdateInfo.latestVersion.mandatory,
        publishedAt: pendingUpdateInfo.latestVersion.publishedAt
      };
    }
    return null;
  });

  // Download and install update automatically
  ipcMain.handle('download-and-install-update', async (_, url: string) => {
    if (url && url.startsWith('http')) {
      await downloadAndInstallUpdate(url, mainWindow);
      return true;
    }
    return false;
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
app.setPath('userData', path.join(app.getPath('appData'), 'MWS Desktop'));

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
  console.log('[MWS] Caché de recursos limpiada');

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
