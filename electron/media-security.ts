/**
 * Media Security Module for HablaPe
 *
 * Implementa seguridad de medios para WhatsApp Web:
 * - Bloquea todas las descargas
 * - Permite solo previsualización de imágenes y reproducción de audios
 * - Captura medios automáticamente hacia el servidor
 * - Registra auditoría de intentos bloqueados
 */

import { BrowserView, BrowserWindow, DownloadItem } from 'electron';

// ==================== INTERFACES ====================

export interface MediaCapturePayload {
  mediaId: string;
  userId: string; // Device fingerprint (for audit)
  agentId?: number | null; // Logged-in user ID in Angular
  clientUserId?: number | null; // Client user ID from CRM lookup
  chatPhone: string;
  chatName: string | null;
  mediaType: 'IMAGE' | 'AUDIO';
  mimeType: string;
  data: string; // Base64
  size: number;
  duration?: number;
  capturedAt: string;
  messageSentAt?: string; // When the WhatsApp message was originally sent
  whatsappMessageId?: string; // WhatsApp message ID (data-id)
  source: 'PREVIEW' | 'PLAYBACK';
}

export interface AuditLogPayload {
  action: 'DOWNLOAD_BLOCKED' | 'MEDIA_CAPTURED' | 'BLOCKED_FILE_ATTEMPT';
  userId: string;
  agentId?: number | null; // Logged-in user ID in Angular
  filename?: string;
  mimeType?: string;
  size?: number;
  url?: string;
  chatPhone?: string;
  timestamp: string;
  description?: string;
}

export interface DownloadBlockedEvent {
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  timestamp: string;
}

// ==================== CSS PARA OCULTAR BOTONES ====================

const HIDE_DOWNLOAD_CSS = `
/* ========== OCULTAR TODOS LOS BOTONES DE DESCARGA ========== */
[data-testid="media-download"],
[data-testid="download-btn"],
[data-testid="download"],
[data-icon="download"],
[data-icon="download-alt"],
[data-icon="audio-download"],
button[aria-label*="Descargar"],
button[aria-label*="Download"],
button[aria-label*="descargar"],
button[aria-label*="download"],
button[aria-label*="Guardar"],
button[aria-label*="Save"],
[data-testid="mi-download"],
[data-testid="media-save"],
[data-testid="document-download"],
[data-testid="doc-download"],
[data-testid="btn-download"],
[data-testid="gallery-download"],
.context-menu [data-testid*="download"],
[data-testid="mi-save"],
[data-testid="mi-star"],
[data-testid="mi-forward"],
[data-testid="forward-menu-item"],
[data-testid="btn-forward"],
[data-icon="forward"],
[data-testid="mi-share"],
[data-icon="share"] {
  display: none !important;
  visibility: hidden !important;
  pointer-events: none !important;
  width: 0 !important;
  height: 0 !important;
  overflow: hidden !important;
}

/* ========== BLOQUEAR DOCUMENTOS COMPLETAMENTE ========== */
[data-testid="document-thumb"],
[data-testid="document-message"],
[data-testid="audio-downloadable"],
[data-testid="ptt-download"],
.message-document,
[class*="document-"] {
  position: relative !important;
}

[data-testid="document-thumb"]::before,
[data-testid="document-message"]::before {
  content: "🚫 Documento bloqueado";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.85);
  color: #f59e0b;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  font-size: 12px;
  border-radius: 8px;
}

/* ========== DESHABILITAR INTERACCIÓN CON MEDIOS ========== */
img,
canvas,
[data-testid="media-canvas"],
[data-testid="image-thumb"],
[data-testid="image"],
[data-testid="sticker"],
[data-testid="gif"] {
  -webkit-user-drag: none !important;
  user-drag: none !important;
  -webkit-user-select: none !important;
  user-select: none !important;
}

/* ========== ESTILOS PARA IMÁGENES PROTEGIDAS (BLUR) ========== */
.hablape-protected-image {
  filter: blur(20px) grayscale(50%) !important;
  transition: filter 0.3s ease !important;
}

.hablape-protected-image.revealed {
  filter: none !important;
}

.hablape-image-overlay {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  background: rgba(0, 0, 0, 0.6) !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  z-index: 100 !important;
  cursor: pointer !important;
  border-radius: 8px !important;
  transition: opacity 0.3s ease !important;
}

.hablape-image-overlay:hover {
  background: rgba(0, 0, 0, 0.5) !important;
}

.hablape-image-overlay.hidden {
  opacity: 0 !important;
  pointer-events: none !important;
}

.hablape-overlay-icon {
  font-size: 32px !important;
  margin-bottom: 8px !important;
}

.hablape-overlay-text {
  color: white !important;
  font-size: 13px !important;
  font-weight: 500 !important;
  text-shadow: 0 1px 3px rgba(0,0,0,0.5) !important;
}

/* ========== OVERLAY DE BLOQUEO DEL CHAT COMPLETO ========== */
/* Cubre el área de chat DEBAJO del header para permitir click en el nombre */
#hablape-chat-blocker {
  position: absolute !important;
  top: 60px !important;  /* Deja visible el header del chat */
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  background: rgba(0, 0, 0, 0.75) !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  z-index: 99999 !important;
  backdrop-filter: blur(4px) !important;
  transition: opacity 0.3s ease !important;
}

#hablape-chat-blocker.hidden {
  opacity: 0 !important;
  pointer-events: none !important;
}

#hablape-chat-blocker .blocker-content {
  background: rgba(30, 30, 30, 0.95) !important;
  padding: 24px 32px !important;
  border-radius: 12px !important;
  text-align: center !important;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5) !important;
}

#hablape-chat-blocker .blocker-icon {
  font-size: 40px !important;
  margin-bottom: 12px !important;
  animation: hablape-spin 1.5s linear infinite;
}

#hablape-chat-blocker .blocker-text {
  color: white !important;
  font-size: 16px !important;
  font-weight: 500 !important;
  margin-bottom: 8px !important;
}

#hablape-chat-blocker .blocker-subtext {
  color: #a0a0a0 !important;
  font-size: 13px !important;
}

#hablape-chat-blocker .blocker-instruction {
  color: #fbbf24 !important;
  font-size: 14px !important;
  margin-top: 12px !important;
  padding: 10px 16px !important;
  background: rgba(251, 191, 36, 0.1) !important;
  border: 1px solid rgba(251, 191, 36, 0.3) !important;
  border-radius: 8px !important;
  max-width: 280px !important;
}

#hablape-chat-blocker .blocker-arrow {
  font-size: 24px !important;
  margin-top: 8px !important;
  animation: hablape-bounce 1s ease-in-out infinite;
}

@keyframes hablape-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes hablape-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}

/* ========== DESHABILITAR SELECCIÓN EN VISORES ========== */
[data-testid="media-viewer"],
[data-testid="image-viewer"],
[data-testid="video-viewer"],
[data-testid="gallery-viewer"],
[data-testid="media-gallery"] {
  -webkit-user-select: none !important;
  user-select: none !important;
}

/* ========== BLOQUEAR VIDEOS COMPLETAMENTE ========== */
video,
[data-testid="video-player"],
[data-testid="video-thumb"],
[data-testid="video"],
[data-testid="video-message"] {
  pointer-events: none !important;
  filter: blur(8px) grayscale(100%) !important;
  opacity: 0.4 !important;
}

[data-testid="video-thumb"]::after,
[data-testid="video-player"]::after,
[data-testid="video"]::after {
  content: "🚫 Video bloqueado - Política de seguridad";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0,0,0,0.9);
  color: #ef4444;
  padding: 12px 20px;
  border-radius: 8px;
  font-size: 13px;
  z-index: 9999;
  white-space: nowrap;
}

/* ========== OCULTAR BOTONES DE PLAY EN VIDEOS ========== */
[data-testid="video-thumb"] [data-icon="play"],
[data-testid="video"] [data-icon="play"],
[data-testid="video-message"] button {
  display: none !important;
}

`;

// ==================== SCRIPTS DE BLOQUEO ====================

const BLOCK_DOWNLOAD_SCRIPT = `
(function() {
  'use strict';

  if (window.__hablapeSecurityInjected) return;
  window.__hablapeSecurityInjected = true;

  // ===== BLOQUEAR MENÚ CONTEXTUAL EN MEDIOS =====
  document.addEventListener('contextmenu', (e) => {
    const target = e.target;
    const isMedia =
      target.tagName === 'IMG' ||
      target.tagName === 'VIDEO' ||
      target.tagName === 'CANVAS' ||
      target.closest('[data-testid*="image"]') ||
      target.closest('[data-testid*="video"]') ||
      target.closest('[data-testid*="media"]') ||
      target.closest('[data-testid*="audio"]');

    if (isMedia) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return false;
    }
  }, true);

  // ===== BLOQUEAR DRAG DE IMÁGENES =====
  document.addEventListener('dragstart', (e) => {
    const target = e.target;
    if (target.tagName === 'IMG' || target.tagName === 'CANVAS') {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, true);

  // ===== BLOQUEAR TECLAS DE GUARDADO =====
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, true);

  // ===== BLOQUEAR CLIPBOARD DE IMÁGENES =====
  document.addEventListener('copy', (e) => {
    const target = e.target;
    if (target.tagName === 'IMG' || target.closest('[data-testid*="image"]')) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, true);

  // ===== BLOQUEAR DOWNLOADS VIA BLOB URL =====
  const originalAppendChild = Element.prototype.appendChild;
  Element.prototype.appendChild = function(child) {
    if (child.tagName === 'A' && child.href?.startsWith('blob:')) {
      return child;
    }
    return originalAppendChild.call(this, child);
  };

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (link && (link.download || link.href?.startsWith('blob:'))) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, true);

  const originalWindowOpen = window.open;
  window.open = function(url, ...args) {
    if (url?.startsWith('blob:')) {
      return null;
    }
    return originalWindowOpen.call(this, url, ...args);
  };

  // ===== BLOQUEAR DOCUMENTOS (PDF, WORD, EXCEL, ETC) =====
  const blockDocument = (element) => {
    if (!element || element.__hablapeDocBlocked) return;
    element.__hablapeDocBlocked = true;

    element.style.pointerEvents = 'none';
    element.style.opacity = '0.5';

    const parent = element.closest('[data-testid="document-message"]') || element.parentElement;
    if (parent && !parent.querySelector('.hablape-doc-blocked')) {
      const overlay = document.createElement('div');
      overlay.className = 'hablape-doc-blocked';
      overlay.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:100;color:#f59e0b;font-size:12px;text-align:center;padding:10px;border-radius:8px;';
      overlay.innerHTML = '🚫 Documento bloqueado<br><small>Política de seguridad</small>';
      parent.style.position = 'relative';
      parent.appendChild(overlay);
    }
  };

  document.querySelectorAll('[data-testid="document-thumb"], [data-testid="document-message"]').forEach(blockDocument);

  const docObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) {
          if (node.matches?.('[data-testid="document-thumb"]') ||
              node.matches?.('[data-testid="document-message"]')) {
            blockDocument(node);
          }
          node.querySelectorAll?.('[data-testid="document-thumb"], [data-testid="document-message"]').forEach(blockDocument);
        }
      });
    });
  });

  docObserver.observe(document.body, { childList: true, subtree: true });

  document.addEventListener('click', (e) => {
    const docElement = e.target.closest('[data-testid="document-thumb"]') ||
                       e.target.closest('[data-testid="document-message"]') ||
                       e.target.closest('[data-testid="audio-downloadable"]');
    if (docElement) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return false;
    }
  }, true);

  // ===== BLOQUEAR FETCH/XHR DE DOCUMENTOS =====
  const originalFetch = window.fetch;
  const docExtensionRegex = /\\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|7z|exe|msi|apk)$/i;
  window.fetch = async function(url, options) {
    const urlStr = url?.toString?.() || url;
    if (urlStr && docExtensionRegex.test(urlStr)) {
      throw new Error('Descarga bloqueada por política de seguridad');
    }
    return originalFetch.call(this, url, options);
  };

  const originalXHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    const urlStr = url?.toString?.() || '';
    if (docExtensionRegex.test(urlStr)) {
      throw new Error('Descarga bloqueada por política de seguridad');
    }
    return originalXHROpen.call(this, method, url, ...args);
  };

  // ===== BLOQUEAR VIDEOS COMPLETAMENTE =====
  const blockVideo = (video) => {
    if (!video || video.__hablapeBlocked) return;
    video.__hablapeBlocked = true;

    video.pause();
    video.muted = true;
    video.volume = 0;
    video.src = '';
    video.removeAttribute('src');
    video.querySelectorAll('source').forEach(s => s.remove());

    video.play = function() {
      return Promise.reject(new Error('Video bloqueado por política de seguridad'));
    };

    video.load = function() {};

    video.controls = false;
    video.style.pointerEvents = 'none';
    video.style.opacity = '0.3';
    video.style.filter = 'blur(5px)';

    const parent = video.parentElement;
    if (parent && !parent.querySelector('.hablape-video-blocked')) {
      const overlay = document.createElement('div');
      overlay.className = 'hablape-video-blocked';
      overlay.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:9999;color:white;font-size:14px;text-align:center;padding:20px;';
      overlay.innerHTML = '<div>🚫<br>Video bloqueado<br><small>Política de seguridad corporativa</small></div>';
      parent.style.position = 'relative';
      parent.appendChild(overlay);
    }
  };

  const originalCreateElement = document.createElement.bind(document);
  document.createElement = function(tagName, options) {
    const element = originalCreateElement(tagName, options);
    if (tagName.toLowerCase() === 'video') {
      setTimeout(() => blockVideo(element), 0);
    }
    return element;
  };

  document.querySelectorAll('video').forEach(blockVideo);

  const videoObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) {
          if (node.tagName === 'VIDEO') {
            blockVideo(node);
          }
          node.querySelectorAll?.('video').forEach(blockVideo);
        }
      });
    });
  });

  videoObserver.observe(document.body, { childList: true, subtree: true });

  // ===== ELIMINAR NOTIFICACIONES DE DESCARGA =====
  const removeNotifications = () => {
    // Buscar cualquier elemento que contenga texto de descarga
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null
    );

    const nodesToRemove = [];
    let node;
    while (node = walker.nextNode()) {
      const text = node.textContent?.toLowerCase() || '';
      // Detectar patrón "[archivo] downloaded" o similares
      if (text.includes('downloaded') ||
          text.includes('descargado') ||
          text.includes('guardado') ||
          (text.includes('.pdf') && text.includes('download')) ||
          (text.includes('.doc') && text.includes('download'))) {
        // Subir al contenedor padre más cercano
        let parent = node.parentElement;
        while (parent && parent !== document.body) {
          // Buscar contenedor de notificación
          if (parent.getAttribute('role') === 'alert' ||
              parent.getAttribute('role') === 'status' ||
              parent.className?.includes?.('toast') ||
              parent.className?.includes?.('notification') ||
              parent.className?.includes?.('snackbar') ||
              parent.getAttribute('data-testid')?.includes?.('toast') ||
              parent.getAttribute('data-testid')?.includes?.('notification')) {
            nodesToRemove.push(parent);
            break;
          }
          // Si es un div pequeño (probablemente notificación), remover
          if (parent.tagName === 'DIV' &&
              parent.offsetWidth < 500 &&
              parent.offsetHeight < 100 &&
              parent.style?.position === 'fixed') {
            nodesToRemove.push(parent);
            break;
          }
          parent = parent.parentElement;
        }
      }
    }

    // Remover nodos encontrados
    nodesToRemove.forEach(n => {
      if (n && n.parentElement) {
        n.style.display = 'none';
        n.style.visibility = 'hidden';
        setTimeout(() => n.remove(), 10);
      }
    });

    // También buscar por selectores específicos
    const selectors = [
      '[data-testid*="toast"]',
      '[data-testid*="notification"]',
      '[role="alert"]',
      '[role="status"]'
    ];

    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        const text = el.textContent?.toLowerCase() || '';
        if (text.includes('downloaded') || text.includes('descargado')) {
          el.style.display = 'none';
          el.remove();
        }
      });
    });
  };

  // Ejecutar inmediatamente
  removeNotifications();

  // Observer más agresivo
  const notificationObserver = new MutationObserver(() => {
    removeNotifications();
    setTimeout(removeNotifications, 50);
    setTimeout(removeNotifications, 150);
  });

  notificationObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

  // Verificar periódicamente
  setInterval(removeNotifications, 500);
})();
`;

// ==================== SCRIPTS DE CAPTURA ====================
// ESTRATEGIA: Capturar imágenes automáticamente cuando aparecen en el chat
// Esto garantiza acceso directo al timestamp del mensaje

const MEDIA_CAPTURE_SCRIPT = `
(function() {
  'use strict';

  if (window.__hablapeMediaCaptureInjected) return;
  window.__hablapeMediaCaptureInjected = true;

  window.__hablapeMediaQueue = window.__hablapeMediaQueue || [];
  const capturedHashes = new Set();      // Para deduplicación por hash
  const capturedBlobUrls = new Set();    // Para deduplicación por URL
  const processedMessageIds = new Set(); // Mensajes ya procesados

  // Configuración
  const MIN_IMAGE_SIZE = 10000;          // Mínimo 10KB para evitar thumbnails
  const CAPTURE_DELAY = 500;             // Delay antes de capturar (para que cargue)

  // =========================================================================
  // BLOQUEO DEL CHAT COMPLETO
  // Bloquea TODA interacción con el chat hasta que el CRM cargue el cliente
  //
  // ESTRATEGIA SIMPLE Y ROBUSTA:
  // - Usar un contador de sesión de bloqueo para evitar condiciones de carrera
  // - Siempre recrear el blocker desde cero al mostrar
  // - Sin MutationObserver (causa problemas de timing)
  // =========================================================================

  // Contador de sesión de bloqueo - solo se desbloquea si coincide
  let blockSessionId = 0;
  let isBlockerVisible = false;

  // Mostrar el blocker (cuando cambia el chat)
  window.__hablapeShowChatBlocker = function() {
    // Incrementar sesión - invalida cualquier desbloqueo pendiente de sesiones anteriores
    blockSessionId++;
    const currentSession = blockSessionId;
    isBlockerVisible = true;

    console.log('[HablaPe] ⏳ CHAT BLOQUEADO - Sesión #' + currentSession);

    function tryShowBlocker(attempt) {
      // Verificar que esta sesión siga siendo válida
      if (blockSessionId !== currentSession) {
        console.log('[HablaPe] Sesión #' + currentSession + ' invalidada, abortando');
        return;
      }

      const mainPane = document.querySelector('#main');
      if (!mainPane) {
        if (attempt < 15) {
          setTimeout(() => tryShowBlocker(attempt + 1), 150);
        }
        return;
      }

      // Eliminar cualquier blocker existente
      const existingBlocker = document.getElementById('hablape-chat-blocker');
      if (existingBlocker) {
        existingBlocker.remove();
      }

      // Crear nuevo blocker
      const blocker = document.createElement('div');
      blocker.id = 'hablape-chat-blocker';
      blocker.setAttribute('data-session', String(currentSession));
      blocker.innerHTML = \`
        <div class="blocker-content">
          <div class="blocker-icon">⏳</div>
          <div class="blocker-text">Cargando información del cliente...</div>
          <div class="blocker-subtext">Por favor espere</div>
        </div>
      \`;

      mainPane.style.position = 'relative';
      mainPane.appendChild(blocker);
      console.log('[HablaPe] Blocker MOSTRADO - Sesión #' + currentSession);
    }

    // Pequeño delay para dar tiempo a WhatsApp de actualizar el DOM
    setTimeout(() => tryShowBlocker(1), 50);
  };

  // Ocultar el blocker (cuando el CRM carga)
  window.__hablapeHideChatBlocker = function() {
    const currentSession = blockSessionId;
    isBlockerVisible = false;

    console.log('[HablaPe] ✓ CHAT DESBLOQUEADO - Sesión #' + currentSession);

    // Eliminar el blocker inmediatamente
    const blocker = document.getElementById('hablape-chat-blocker');
    if (blocker) {
      blocker.remove();
      console.log('[HablaPe] Blocker ELIMINADO');
    }
  };

  // Verificar estado del blocker (para debugging)
  window.__hablapeBlockerStatus = function() {
    return {
      sessionId: blockSessionId,
      isVisible: isBlockerVisible,
      blockerExists: !!document.getElementById('hablape-chat-blocker'),
      mainExists: !!document.querySelector('#main')
    };
  };

  // =========================================================================
  // INTERCEPTAR CLICKS EN EL SIDEBAR
  // Muestra el blocker INMEDIATAMENTE cuando el usuario hace click en un chat
  // Esto evita el delay del scanner (1.5-2.5 segundos)
  // =========================================================================

  let lastClickedChatId = null;

  document.addEventListener('click', (e) => {
    // Buscar si el click fue en un elemento del sidebar (lista de chats)
    const target = e.target;

    // El sidebar tiene id="pane-side" y contiene los chats
    const sidePane = document.querySelector('#pane-side');
    if (!sidePane || !sidePane.contains(target)) return;

    // Buscar el elemento del chat clickeado (tiene data-id o está dentro de uno)
    let chatElement = target.closest('[data-id]');
    if (!chatElement) {
      // Buscar en ancestros hasta 10 niveles
      let el = target;
      for (let i = 0; i < 10 && el; i++) {
        if (el.getAttribute && el.getAttribute('data-id')) {
          chatElement = el;
          break;
        }
        el = el.parentElement;
      }
    }

    // Si encontramos un chat y es diferente al último clickeado
    if (chatElement) {
      const chatId = chatElement.getAttribute('data-id');
      if (chatId && chatId !== lastClickedChatId) {
        lastClickedChatId = chatId;

        // LIMPIAR número extraído del chat anterior para evitar contaminar el nuevo chat
        if (window.__hablapeClearExtractedPhone) {
          window.__hablapeClearExtractedPhone();
        }
        // Limpiar también el nombre actual (se establecerá cuando scanChat detecte el nuevo chat)
        currentChatNameForExtraction = null;

        // Mostrar blocker INMEDIATAMENTE
        console.log('[HablaPe] Click en sidebar detectado - Bloqueando inmediatamente');
        window.__hablapeShowChatBlocker();
      }
    }
  }, true); // Captura en fase de captura para ser más rápido

  console.log('[HablaPe] Interceptor de clicks en sidebar activo');

  // =========================================================================
  // SOLICITAR AL USUARIO QUE HAGA CLICK EN EL NOMBRE DEL CHAT
  // Cuando no se puede detectar el número automáticamente
  // =========================================================================

  // Mostrar blocker con instrucciones para obtener el número
  window.__hablapeShowPhoneNeeded = function() {
    isBlockerVisible = true;
    console.log('[HablaPe] 📱 Solicitando al usuario que revele el número...');

    const mainPane = document.querySelector('#main');
    if (!mainPane) return;

    // Eliminar blocker existente
    const existingBlocker = document.getElementById('hablape-chat-blocker');
    if (existingBlocker) {
      existingBlocker.remove();
    }

    // Crear blocker con instrucciones
    const blocker = document.createElement('div');
    blocker.id = 'hablape-chat-blocker';
    blocker.setAttribute('data-needs-phone', 'true');
    blocker.innerHTML = \`
      <div class="blocker-content">
        <div class="blocker-icon">📱</div>
        <div class="blocker-text">No se detectó el número de teléfono</div>
        <div class="blocker-subtext">Para continuar:</div>
        <div class="blocker-instruction">
          👆 Haga click en el <strong>nombre del contacto</strong> en la parte superior del chat
        </div>
        <div class="blocker-arrow">⬆️</div>
      </div>
    \`;

    mainPane.style.position = 'relative';
    mainPane.appendChild(blocker);
  };

  // =========================================================================
  // DETECTAR PANEL DE DETALLES DEL CONTACTO
  // Cuando el usuario hace click en el header, WhatsApp abre este panel
  // El número SIEMPRE está visible ahí
  // =========================================================================

  let contactPanelObserver = null;
  let lastExtractedPhone = null;
  let currentChatNameForExtraction = null; // Para verificar que el panel corresponde al chat actual

  // Limpiar el número extraído cuando cambia el chat
  window.__hablapeClearExtractedPhone = function() {
    lastExtractedPhone = null;
    window.__hablapeExtractedPhone = null;
    window.__hablapePhoneExtractedAt = null;
    console.log('[HablaPe] 🧹 Número extraído limpiado');
  };

  // Establecer el nombre del chat actual (para verificar el panel)
  window.__hablapeSetCurrentChatName = function(name) {
    currentChatNameForExtraction = name;
    console.log('[HablaPe] Chat actual para extracción:', name);
  };

  function extractPhoneFromContactPanel() {
    console.log('[HablaPe] 🔍 Buscando número en panel de contacto...');

    // MÉTODO 1: Buscar panel por data-testid conocidos
    let contactPanel = document.querySelector('[data-testid="contact-info-drawer"]') ||
                       document.querySelector('[data-testid="drawer_right"]') ||
                       document.querySelector('[data-testid="chat-info-drawer"]');

    // MÉTODO 2: Buscar panel por estructura (div que contiene "Contact info" o "Info del contacto")
    if (!contactPanel) {
      const allDivs = document.querySelectorAll('div');
      for (const div of allDivs) {
        const text = div.textContent || '';
        // Panel de info tiene "Contact info" o similar y un número de teléfono
        if ((text.includes('Contact info') || text.includes('Info') || text.includes('About')) &&
            /\\+\\d{1,3}\\s*\\d/.test(text)) {
          // Verificar que no sea el chat principal
          if (!div.querySelector('#main') && div.offsetWidth > 200) {
            contactPanel = div;
            console.log('[HablaPe] Panel encontrado por contenido');
            break;
          }
        }
      }
    }

    // Si no hay panel abierto, no extraer nada
    if (!contactPanel) {
      console.log('[HablaPe] ❌ No hay panel de contacto abierto');
      return null;
    }

    // VERIFICACIÓN: Si tenemos nombre del chat actual, verificar que el panel corresponde
    // Esto evita extraer el teléfono del panel de un chat anterior
    if (currentChatNameForExtraction) {
      // Buscar el nombre en el panel (generalmente está en un span con title o en un h2)
      const panelName = contactPanel.querySelector('span[title]')?.getAttribute('title') ||
                       contactPanel.querySelector('h2')?.textContent?.trim() ||
                       contactPanel.querySelector('header span')?.textContent?.trim();

      if (panelName) {
        // Comparar nombres (permitir match parcial para variaciones)
        const normalize = (s) => (s || '').toLowerCase().trim().substring(0, 20);
        const normalizedPanelName = normalize(panelName);
        const normalizedChatName = normalize(currentChatNameForExtraction);

        if (normalizedPanelName !== normalizedChatName &&
            !normalizedPanelName.includes(normalizedChatName) &&
            !normalizedChatName.includes(normalizedPanelName)) {
          console.log('[HablaPe] ⚠️ Panel NO coincide con chat actual:');
          console.log('[HablaPe]   Panel:', panelName);
          console.log('[HablaPe]   Chat actual:', currentChatNameForExtraction);
          return null; // No extraer - es de otro chat
        }
        console.log('[HablaPe] ✓ Panel coincide con chat actual:', panelName);
      }
    }

    // MÉTODO 3: Buscar cualquier elemento que tenga el patrón de teléfono con +
    // El número en WhatsApp aparece como "+51 935 374 672"
    const phoneRegex = /\\+\\d{1,3}[\\s]?\\d{3}[\\s]?\\d{3}[\\s]?\\d{3,4}/;

    // Buscar en el panel encontrado
    const searchRoot = contactPanel;

    // Buscar en spans
    const allSpans = searchRoot.querySelectorAll('span');
    for (const span of allSpans) {
      const text = span.textContent?.trim() || '';

      // Buscar patrón exacto de teléfono con código de país
      if (phoneRegex.test(text)) {
        const cleanNumber = text.replace(/[\\s\\-\\(\\)\\+]/g, '');
        if (cleanNumber.length >= 9 && cleanNumber.length <= 15) {
          console.log('[HablaPe] 📱 Número encontrado en span:', text, '→', cleanNumber);
          return cleanNumber;
        }
      }

      // También buscar patrón más genérico
      const cleanNumber = text.replace(/[\\s\\-\\(\\)]/g, '');
      if (/^\\+?\\d{9,15}$/.test(cleanNumber) && cleanNumber.length >= 9) {
        console.log('[HablaPe] 📱 Número encontrado (genérico):', cleanNumber);
        return cleanNumber.replace(/^\\+/, '');
      }
    }

    // Buscar en elementos con role="button" que contengan teléfono (a veces es clickeable)
    const buttons = searchRoot.querySelectorAll('[role="button"], button');
    for (const btn of buttons) {
      const text = btn.textContent?.trim() || '';
      if (phoneRegex.test(text)) {
        const cleanNumber = text.replace(/[\\s\\-\\(\\)\\+]/g, '');
        if (cleanNumber.length >= 9 && cleanNumber.length <= 15) {
          console.log('[HablaPe] 📱 Número encontrado en botón:', cleanNumber);
          return cleanNumber;
        }
      }
    }

    console.log('[HablaPe] ❌ No se encontró número en el panel');
    return null;
  }

  function startContactPanelObserver() {
    if (contactPanelObserver) return;

    contactPanelObserver = new MutationObserver((mutations) => {
      // Verificar si el blocker está esperando el número
      const blocker = document.getElementById('hablape-chat-blocker');
      const needsPhone = blocker && blocker.getAttribute('data-needs-phone');

      // También intentar extraer aunque no haya blocker (por si se abre el panel manualmente)
      const phone = extractPhoneFromContactPanel();

      if (phone && phone !== lastExtractedPhone) {
        lastExtractedPhone = phone;
        console.log('[HablaPe] ✓ Número extraído del panel de contacto:', phone);

        // Guardar en variable global para que Electron lo lea
        window.__hablapeExtractedPhone = phone;
        window.__hablapePhoneExtractedAt = Date.now();
      }
    });

    // Observar cambios en todo el documento para detectar cuando se abre el panel
    contactPanelObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    console.log('[HablaPe] Observer de panel de contacto iniciado');
  }

  // Iniciar el observer después de que WhatsApp cargue
  setTimeout(startContactPanelObserver, 5000);

  // Variables de estado para contexto del mensaje
  let lastKnownChatPhone = 'unknown';
  let lastKnownMessageTimestamp = null;
  let lastKnownWhatsappMessageId = null;
  let lastContextCaptureTime = 0;

  function getCurrentChatPhone() {
    try {
      console.log('[HablaPe Debug] ===== getCurrentChatPhone START =====');
      console.log('[HablaPe Debug] lastKnownChatPhone actual:', lastKnownChatPhone);

      // Método 0: Usar variable global establecida por Electron (MÁS CONFIABLE)
      if (window.__hablapeCurrentChatPhone && window.__hablapeCurrentChatPhone !== 'unknown') {
        lastKnownChatPhone = window.__hablapeCurrentChatPhone;
        console.log('[HablaPe Debug] M0: usando variable de Electron:', window.__hablapeCurrentChatPhone);
        return window.__hablapeCurrentChatPhone;
      }

      // Método 1: Header de conversación
      const chatHeader = document.querySelector('[data-testid="conversation-header"]');
      console.log('[HablaPe Debug] M1: chatHeader encontrado:', !!chatHeader);

      if (chatHeader) {
        // Buscar TODOS los spans con title para debug
        const allSpans = chatHeader.querySelectorAll('span[title]');
        console.log('[HablaPe Debug] M1: spans con title:', allSpans.length);
        allSpans.forEach((s, i) => {
          console.log('[HablaPe Debug] M1: span[' + i + '] title:', s.getAttribute('title'));
        });

        const phoneSpan = chatHeader.querySelector('span[title]');
        if (phoneSpan) {
          const title = phoneSpan.getAttribute('title');
          console.log('[HablaPe Debug] M1: title completo:', title);
          const phoneMatch = title?.match(/\\+?[0-9\\s-]{10,}/);
          if (phoneMatch) {
            const phone = phoneMatch[0].replace(/[\\s-]/g, '');
            lastKnownChatPhone = phone;
            console.log('[HablaPe Debug] M1: teléfono extraído:', phone);
            return phone;
          } else {
            console.log('[HablaPe Debug] M1: no match de teléfono en title');
          }
        }
      }

      // Método 2: URL hash
      const hash = window.location.hash;
      console.log('[HablaPe Debug] M2: hash URL:', hash);
      const hashPhoneMatch = hash.match(/@([0-9]+)/);
      if (hashPhoneMatch) {
        lastKnownChatPhone = hashPhoneMatch[1];
        console.log('[HablaPe Debug] M2: teléfono extraído:', hashPhoneMatch[1]);
        return hashPhoneMatch[1];
      }

      // Método 3: Sidebar - buscar chat activo
      const sidebar = document.querySelector('#pane-side');
      console.log('[HablaPe Debug] M3: sidebar encontrado:', !!sidebar);

      if (sidebar) {
        // Buscar TODOS los elementos con data-id que contengan @c.us
        const allChats = sidebar.querySelectorAll('[data-id*="@c.us"]');
        console.log('[HablaPe Debug] M3: elementos con data-id @c.us:', allChats.length);

        const activeChat = sidebar.querySelector('[aria-selected="true"]') ||
                          sidebar.querySelector('[data-testid="cell-frame-container"]:focus-within');
        console.log('[HablaPe Debug] M3: activeChat encontrado:', !!activeChat);

        if (activeChat) {
          let el = activeChat;
          for (let i = 0; i < 10 && el; i++) {
            const dataId = el.getAttribute?.('data-id');
            if (dataId) {
              console.log('[HablaPe Debug] M3: data-id en nivel ' + i + ':', dataId);
            }
            if (dataId && dataId.includes('@c.us')) {
              let phone = dataId.split('@')[0];
              phone = phone.replace(/^(true|false)_/, '');
              if (/^\\d{9,15}$/.test(phone)) {
                lastKnownChatPhone = phone;
                console.log('[HablaPe Debug] M3: teléfono extraído:', phone);
                return phone;
              }
            }
            el = el.parentElement;
          }
        }
      }

      // Método 4: Mensajes con data-id en el área principal
      const mainPane = document.querySelector('#main');
      console.log('[HablaPe Debug] M4: #main encontrado:', !!mainPane);

      if (mainPane) {
        const messagesWithId = mainPane.querySelectorAll('[data-id*="@c.us"]');
        console.log('[HablaPe Debug] M4: mensajes con data-id @c.us:', messagesWithId.length);

        if (messagesWithId.length > 0) {
          const dataId = messagesWithId[0].getAttribute('data-id');
          console.log('[HablaPe Debug] M4: primer data-id:', dataId);
          let phoneFromId = dataId?.split('@')[0];
          if (phoneFromId) {
            phoneFromId = phoneFromId.replace(/^(true|false)_/, '');
            if (/^\\d{9,15}$/.test(phoneFromId)) {
              lastKnownChatPhone = phoneFromId;
              console.log('[HablaPe Debug] M4: teléfono extraído:', phoneFromId);
              return phoneFromId;
            }
          }
        }
      }

      // Método 5: Buscar en TODO el documento
      const anyMessageWithId = document.querySelector('[data-id*="@c.us"]');
      console.log('[HablaPe Debug] M5: cualquier elemento con @c.us:', !!anyMessageWithId);

      if (anyMessageWithId) {
        const dataId = anyMessageWithId.getAttribute('data-id');
        console.log('[HablaPe Debug] M5: data-id encontrado:', dataId);
        let phoneFromId = dataId?.split('@')[0];
        if (phoneFromId) {
          phoneFromId = phoneFromId.replace(/^(true|false)_/, '');
          if (/^\\d{9,15}$/.test(phoneFromId)) {
            lastKnownChatPhone = phoneFromId;
            console.log('[HablaPe Debug] M5: teléfono extraído:', phoneFromId);
            return phoneFromId;
          }
        }
      }

      // Método 6: Usar caché si existe
      if (lastKnownChatPhone !== 'unknown') {
        console.log('[HablaPe Debug] M6: usando caché:', lastKnownChatPhone);
        return lastKnownChatPhone;
      }

      console.log('[HablaPe Debug] ===== getCurrentChatPhone END: unknown =====');
      return 'unknown';
    } catch (err) {
      console.log('[HablaPe Debug] getCurrentChatPhone error:', err.message);
      return lastKnownChatPhone !== 'unknown' ? lastKnownChatPhone : 'unknown';
    }
  }

  async function simpleHash(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Helper: Convert local datetime to UTC ISO string
  // WhatsApp shows times in local timezone, but we store in UTC
  function localToUtcIso(year, month, day, hours, minutes) {
    // Create Date object with local time (month is 0-indexed)
    const localDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hours), parseInt(minutes), 0);
    // toISOString() converts to UTC and returns format: 2025-01-15T14:30:00.000Z
    // Remove the 'Z' and milliseconds to match expected format: 2025-01-15T14:30:00
    return localDate.toISOString().replace(/\\.\\d{3}Z$/, '');
  }

  // Extract message timestamp from WhatsApp DOM element
  // MEJORADO: Solo usa caché si es reciente (< 30 segundos)
  function extractMessageTimestamp(element) {
    try {
      // Navigate up to find the message container
      let messageEl = element.closest('[data-id]') ||
                      element.closest('[data-testid="msg-container"]');

      if (!messageEl) {
        // Try to find in ancestors
        let parent = element.parentElement;
        for (let i = 0; i < 15 && parent; i++) {
          if (parent.getAttribute('data-id') ||
              parent.getAttribute('data-testid') === 'msg-container') {
            messageEl = parent;
            break;
          }
          parent = parent.parentElement;
        }
      }

      // Si no encontramos el mensaje (estamos en visor), usar cache SOLO si es reciente
      if (!messageEl) {
        const cacheAge = Date.now() - lastContextCaptureTime;
        const isCacheFresh = cacheAge < 30000; // 30 segundos
        console.log('[HablaPe Debug] extractMessageTimestamp: en visor, cache age=' + cacheAge + 'ms, fresh=' + isCacheFresh);

        if (isCacheFresh && lastKnownMessageTimestamp) {
          console.log('[HablaPe Debug] extractMessageTimestamp: usando cache FRESCO:', lastKnownMessageTimestamp);
          return {
            messageSentAt: lastKnownMessageTimestamp,
            whatsappMessageId: lastKnownWhatsappMessageId
          };
        } else {
          console.log('[HablaPe Debug] extractMessageTimestamp: cache VIEJO o vacío, retornando null');
          return {
            messageSentAt: null,
            whatsappMessageId: lastKnownWhatsappMessageId
          };
        }
      }

      // Get WhatsApp message ID
      const whatsappMessageId = messageEl.getAttribute('data-id') || null;

      // Look for timestamp in data-pre-plain-text attribute
      // Format: "[HH:mm, DD/MM/YYYY] Nombre: "
      const timeEl = messageEl.querySelector('[data-pre-plain-text]');
      if (timeEl) {
        const prePlainText = timeEl.getAttribute('data-pre-plain-text') || '';
        const timeMatch = prePlainText.match(/\\[(\\d{1,2}:\\d{2}),\\s*(\\d{1,2}\\/\\d{1,2}\\/\\d{4})\\]/);
        if (timeMatch) {
          const [, time, date] = timeMatch;
          const [day, month, year] = date.split('/');
          const [hours, mins] = time.split(':');
          // Convert local time to UTC
          const messageSentAt = localToUtcIso(year, month, day, hours, mins);

          // Guardar en cache para cuando estemos en el visor
          lastKnownMessageTimestamp = messageSentAt;
          lastKnownWhatsappMessageId = whatsappMessageId;
          lastContextCaptureTime = Date.now();
          console.log('[HablaPe Debug] extractMessageTimestamp: encontrado via data-pre-plain-text (UTC):', messageSentAt);

          return { messageSentAt, whatsappMessageId };
        }
      }

      // Fallback: look for time in metadata spans
      const timeSpans = messageEl.querySelectorAll('span[dir="auto"], span');
      for (const span of timeSpans) {
        const text = span.textContent?.trim() || '';
        // Match time format like "10:30" or "10:30 a. m."
        const hourMatch = text.match(/^(\\d{1,2}):(\\d{2})(\\s*[ap]\\.?\\s*m\\.?)?$/i);
        if (hourMatch) {
          let hours = parseInt(hourMatch[1]);
          const minutes = hourMatch[2];
          const ampm = hourMatch[3]?.toLowerCase() || '';

          // Convertir a 24h si es necesario
          if (ampm.includes('p') && hours < 12) hours += 12;
          if (ampm.includes('a') && hours === 12) hours = 0;

          // Usar fecha de hoy y convertir a UTC
          const now = new Date();
          const messageSentAt = localToUtcIso(
            now.getFullYear(),
            now.getMonth() + 1,
            now.getDate(),
            hours,
            minutes
          );

          // Guardar en cache
          lastKnownMessageTimestamp = messageSentAt;
          lastKnownWhatsappMessageId = whatsappMessageId;
          lastContextCaptureTime = Date.now();
          console.log('[HablaPe Debug] extractMessageTimestamp: encontrado via span (UTC):', messageSentAt, '(from:', text, ')');

          return { messageSentAt, whatsappMessageId };
        }
      }

      // Si no encontramos timestamp pero sí mensaje, guardar el ID
      if (whatsappMessageId) {
        lastKnownWhatsappMessageId = whatsappMessageId;
      }

      console.log('[HablaPe Debug] extractMessageTimestamp: no encontrado en DOM, timestamp será null');
      return {
        messageSentAt: null,
        whatsappMessageId: whatsappMessageId || lastKnownWhatsappMessageId
      };
    } catch (err) {
      console.log('[HablaPe Debug] extractMessageTimestamp error:', err.message);
      return {
        messageSentAt: null,
        whatsappMessageId: lastKnownWhatsappMessageId
      };
    }
  }

  // =========================================================================
  // Capturar contexto del mensaje ANTES de que se abra el visor
  // MEJORADO: Múltiples métodos de extracción de timestamp
  // =========================================================================
  function captureMessageContext(clickTarget) {
    try {
      // IMPORTANTE: Resetear timestamp al inicio para evitar usar datos antiguos
      lastKnownMessageTimestamp = null;
      lastContextCaptureTime = Date.now();

      console.log('[HablaPe Debug] captureMessageContext: iniciando captura...');

      // Buscar el contenedor del mensaje
      let messageEl = clickTarget.closest('[data-id]') ||
                      clickTarget.closest('[data-testid="msg-container"]');

      if (!messageEl) {
        let parent = clickTarget.parentElement;
        for (let i = 0; i < 15 && parent; i++) {
          if (parent.getAttribute('data-id') ||
              parent.getAttribute('data-testid') === 'msg-container') {
            messageEl = parent;
            break;
          }
          parent = parent.parentElement;
        }
      }

      if (!messageEl) {
        console.log('[HablaPe Debug] captureMessageContext: NO se encontró contenedor de mensaje');
        return;
      }

      // Guardar ID del mensaje
      const dataId = messageEl.getAttribute('data-id');
      if (dataId) {
        lastKnownWhatsappMessageId = dataId;
        console.log('[HablaPe Debug] captureMessageContext: data-id=' + dataId);

        // Extraer teléfono del data-id si tiene formato @c.us
        if (dataId.includes('@c.us')) {
          let phone = dataId.split('@')[0];
          phone = phone.replace(/^(true|false)_/, '');
          if (/^\\d{9,15}$/.test(phone)) {
            lastKnownChatPhone = phone;
          }
        }
      }

      // ========== MÉTODO 1: data-pre-plain-text ==========
      // Formato: "[HH:mm, DD/MM/YYYY] Nombre: "
      const timeEl = messageEl.querySelector('[data-pre-plain-text]');
      if (timeEl) {
        const prePlainText = timeEl.getAttribute('data-pre-plain-text') || '';
        console.log('[HablaPe Debug] data-pre-plain-text:', prePlainText);

        const timeMatch = prePlainText.match(/\\[(\\d{1,2}:\\d{2}),\\s*(\\d{1,2}\\/\\d{1,2}\\/\\d{4})\\]/);
        if (timeMatch) {
          const [, time, date] = timeMatch;
          const [day, month, year] = date.split('/');
          const [hours, mins] = time.split(':');
          // Convert local time to UTC
          lastKnownMessageTimestamp = localToUtcIso(year, month, day, hours, mins);
          console.log('[HablaPe Debug] MÉTODO 1 OK: timestamp (UTC)=' + lastKnownMessageTimestamp);
          return;
        }
      }

      // ========== MÉTODO 2: Buscar span con hora visible ==========
      // WhatsApp muestra la hora en un span pequeño
      const allSpans = messageEl.querySelectorAll('span');
      for (const span of allSpans) {
        const text = span.textContent?.trim() || '';
        // Formato: "10:30" o "10:30 a. m." o "10:30 p. m."
        const hourMatch = text.match(/^(\\d{1,2}):(\\d{2})(\\s*[ap]\\.?\\s*m\\.?)?$/i);
        if (hourMatch) {
          let hours = parseInt(hourMatch[1]);
          const minutes = hourMatch[2];
          const ampm = hourMatch[3]?.toLowerCase() || '';

          // Convertir a 24h si es necesario
          if (ampm.includes('p') && hours < 12) hours += 12;
          if (ampm.includes('a') && hours === 12) hours = 0;

          // Usar fecha de hoy y convertir a UTC
          const now = new Date();
          lastKnownMessageTimestamp = localToUtcIso(
            now.getFullYear(),
            now.getMonth() + 1,
            now.getDate(),
            hours,
            minutes
          );
          console.log('[HablaPe Debug] MÉTODO 2 OK: timestamp (UTC)=' + lastKnownMessageTimestamp + ' (from span: ' + text + ')');
          return;
        }
      }

      // ========== MÉTODO 3: Buscar en atributos data-* ==========
      const elementsWithData = messageEl.querySelectorAll('[data-testid*="msg"], [data-testid*="time"]');
      for (const el of elementsWithData) {
        const testId = el.getAttribute('data-testid') || '';
        console.log('[HablaPe Debug] Elemento con data-testid:', testId);
      }

      // ========== MÉTODO 4: Buscar en el footer del mensaje ==========
      const msgMeta = messageEl.querySelector('[data-testid="msg-meta"], .message-meta, ._amk6');
      if (msgMeta) {
        const metaText = msgMeta.textContent?.trim() || '';
        console.log('[HablaPe Debug] msg-meta text:', metaText);
        const metaMatch = metaText.match(/(\\d{1,2}):(\\d{2})/);
        if (metaMatch) {
          const now = new Date();
          lastKnownMessageTimestamp = localToUtcIso(
            now.getFullYear(),
            now.getMonth() + 1,
            now.getDate(),
            metaMatch[1],
            metaMatch[2]
          );
          console.log('[HablaPe Debug] MÉTODO 4 OK: timestamp (UTC)=' + lastKnownMessageTimestamp);
          return;
        }
      }

      console.log('[HablaPe Debug] captureMessageContext: NO se pudo extraer timestamp');
      console.log('[HablaPe Debug] phone=' + lastKnownChatPhone + ', msgId=' + lastKnownWhatsappMessageId);

    } catch (err) {
      console.log('[HablaPe Debug] captureMessageContext error:', err.message);
    }
  }

  async function captureImage(element, source = 'PREVIEW') {
    try {
      let imageData, mimeType, size;

      if (element.tagName === 'CANVAS') {
        imageData = element.toDataURL('image/jpeg', 0.9);
        mimeType = 'image/jpeg';
        size = Math.round((imageData.length * 3) / 4);
      } else if (element.tagName === 'IMG' && element.src) {
        const hash = await simpleHash(element.src + element.naturalWidth);
        if (capturedHashes.has(hash)) return;
        capturedHashes.add(hash);

        if (element.src.startsWith('blob:')) {
          const response = await fetch(element.src);
          const blob = await response.blob();
          mimeType = blob.type || 'image/jpeg';
          size = blob.size;

          const reader = new FileReader();
          imageData = await new Promise((resolve, reject) => {
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } else if (element.src.startsWith('data:')) {
          imageData = element.src;
          mimeType = element.src.split(';')[0].split(':')[1] || 'image/jpeg';
          size = Math.round((imageData.length * 3) / 4);
        } else {
          return;
        }
      } else {
        return;
      }

      // Ignorar imágenes muy pequeñas (thumbnails/miniaturas del chat)
      // Mínimo 10KB - reducido para capturar más imágenes válidas
      if (!imageData || size < 10000) {
        console.log('[HablaPe Debug] Imagen ignorada por tamaño:', size, 'bytes');
        return;
      }
      console.log('[HablaPe Debug] Imagen aceptada, tamaño:', size, 'bytes');

      // Extract message timestamp
      const { messageSentAt, whatsappMessageId } = extractMessageTimestamp(element);

      // Obtener teléfono y nombre del chat
      const chatPhone = getCurrentChatPhone();
      const chatName = window.__hablapeCurrentChatName || null;

      console.log('[HablaPe Debug] Agregando a cola - chatPhone:', chatPhone, 'chatName:', chatName);

      window.__hablapeMediaQueue.push({
        data: imageData,
        type: mimeType,
        size: size,
        chatPhone: chatPhone,
        chatName: chatName,
        timestamp: new Date().toISOString(),
        messageSentAt: messageSentAt,
        whatsappMessageId: whatsappMessageId,
        source: source,
        mediaType: 'IMAGE'
      });
    } catch (err) {
      console.log('[HablaPe Debug] Error en captureImage:', err.message);
    }
  }

  // ==========================================================================
  // NUEVA ESTRATEGIA: Captura automática cuando imágenes llegan al chat
  // ==========================================================================
  //
  // VENTAJAS:
  // - Acceso directo al mensaje con timestamp correcto
  // - No depende de que el usuario abra el visor
  // - Sin problemas de navegación en galería
  //
  // CÓMO FUNCIONA:
  // 1. MutationObserver detecta nuevos mensajes en el chat
  // 2. Para cada mensaje con imagen, extrae contexto (timestamp, messageId)
  // 3. Espera a que la imagen cargue (blob URL disponible)
  // 4. Captura automáticamente
  // ==========================================================================

  console.log('[HablaPe] Iniciando captura automática de imágenes en chat...');

  // ==========================================================================
  // Función para extraer timestamp directamente del elemento del mensaje
  // ==========================================================================
  function extractTimestampFromMessage(messageEl) {
    try {
      // MÉTODO 1: data-pre-plain-text - formato "[HH:mm, DD/MM/YYYY] Nombre:"
      const timeEl = messageEl.querySelector('[data-pre-plain-text]');
      if (timeEl) {
        const prePlainText = timeEl.getAttribute('data-pre-plain-text') || '';
        const timeMatch = prePlainText.match(/\\[(\\d{1,2}:\\d{2}),\\s*(\\d{1,2}\\/(\\d{1,2})\\/(\\d{4}))\\]/);
        if (timeMatch) {
          const [, time, , dayStr, monthStr, yearStr] = timeMatch;
          const fullDate = prePlainText.match(/(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})/);
          if (fullDate) {
            const [, day, month, year] = fullDate;
            const [hours, mins] = time.split(':');
            // Convert local time to UTC
            const timestamp = localToUtcIso(year, month, day, hours, mins);
            console.log('[HablaPe Auto] Timestamp extraído (método 1, UTC):', timestamp);
            return timestamp;
          }
        }
      }

      // MÉTODO 2: Buscar span con hora visible en el mensaje
      const allSpans = messageEl.querySelectorAll('span');
      for (const span of allSpans) {
        const text = span.textContent?.trim() || '';
        const hourMatch = text.match(/^(\\d{1,2}):(\\d{2})(\\s*[ap]\\.?\\s*m\\.?)?$/i);
        if (hourMatch) {
          let hours = parseInt(hourMatch[1]);
          const minutes = hourMatch[2];
          const ampm = hourMatch[3]?.toLowerCase() || '';

          if (ampm.includes('p') && hours < 12) hours += 12;
          if (ampm.includes('a') && hours === 12) hours = 0;

          // Usar fecha de hoy y convertir a UTC
          const now = new Date();
          const timestamp = localToUtcIso(
            now.getFullYear(),
            now.getMonth() + 1,
            now.getDate(),
            hours,
            minutes
          );
          console.log('[HablaPe Auto] Timestamp extraído (método 2, UTC):', timestamp, 'from:', text);
          return timestamp;
        }
      }

      // MÉTODO 3: Buscar en msg-meta
      const msgMeta = messageEl.querySelector('[data-testid="msg-meta"]');
      if (msgMeta) {
        const metaText = msgMeta.textContent?.trim() || '';
        const metaMatch = metaText.match(/(\\d{1,2}):(\\d{2})/);
        if (metaMatch) {
          const now = new Date();
          const timestamp = localToUtcIso(
            now.getFullYear(),
            now.getMonth() + 1,
            now.getDate(),
            metaMatch[1],
            metaMatch[2]
          );
          console.log('[HablaPe Auto] Timestamp extraído (método 3, UTC):', timestamp);
          return timestamp;
        }
      }

      console.log('[HablaPe Auto] No se pudo extraer timestamp del mensaje');
      return null;
    } catch (err) {
      console.log('[HablaPe Auto] Error extrayendo timestamp:', err.message);
      return null;
    }
  }

  // ==========================================================================
  // Función para obtener el teléfono del CONTEXTO del mensaje
  // IMPORTANTE: Busca en el área de chat (#main) donde está la imagen,
  // NO en el sidebar que puede haber cambiado
  // ==========================================================================
  function getPhoneFromChatContext(messageEl) {
    try {
      console.log('[HablaPe Context] ===== Buscando teléfono del contexto del mensaje =====');

      // MÉTODO 1: Buscar en los mensajes del mismo chat (#main)
      // Los mensajes con formato @c.us contienen el teléfono real
      const mainPane = document.querySelector('#main');
      if (mainPane) {
        // Buscar TODOS los mensajes con data-id que contengan @c.us
        const messagesWithPhone = mainPane.querySelectorAll('[data-id*="@c.us"]');
        console.log('[HablaPe Context] Mensajes con @c.us en #main:', messagesWithPhone.length);

        for (const msg of messagesWithPhone) {
          const dataId = msg.getAttribute('data-id');
          if (dataId && dataId.includes('@c.us')) {
            // Formato: true_PHONE@c.us_XXX o false_PHONE@c.us_XXX
            let phone = dataId.split('@')[0];
            phone = phone.replace(/^(true|false)_/, '');
            if (/^\\d{9,15}$/.test(phone)) {
              console.log('[HablaPe Context] ✓ Teléfono encontrado en mensajes del chat:', phone);
              return phone;
            }
          }
        }
      }

      // MÉTODO 2: Extraer del data-id del mensaje mismo si tiene @c.us
      if (messageEl) {
        const msgDataId = messageEl.getAttribute('data-id');
        if (msgDataId && msgDataId.includes('@c.us')) {
          let phone = msgDataId.split('@')[0];
          phone = phone.replace(/^(true|false)_/, '');
          if (/^\\d{9,15}$/.test(phone)) {
            console.log('[HablaPe Context] ✓ Teléfono extraído del mensaje:', phone);
            return phone;
          }
        }
      }

      // MÉTODO 3: Buscar en TODO el documento mensajes con @c.us
      // (por si el #main no está accesible)
      const allMessages = document.querySelectorAll('[data-id*="@c.us"]');
      console.log('[HablaPe Context] Mensajes con @c.us en todo el DOM:', allMessages.length);

      for (const msg of allMessages) {
        const dataId = msg.getAttribute('data-id');
        if (dataId && dataId.includes('@c.us')) {
          let phone = dataId.split('@')[0];
          phone = phone.replace(/^(true|false)_/, '');
          if (/^\\d{9,15}$/.test(phone)) {
            console.log('[HablaPe Context] ✓ Teléfono encontrado en DOM:', phone);
            return phone;
          }
        }
      }

      // MÉTODO 4 (FALLBACK): Header de conversación
      const chatHeader = document.querySelector('[data-testid="conversation-header"]');
      if (chatHeader) {
        const phoneSpan = chatHeader.querySelector('span[title]');
        if (phoneSpan) {
          const title = phoneSpan.getAttribute('title');
          const phoneMatch = title?.match(/\\+?[0-9\\s-]{10,}/);
          if (phoneMatch) {
            const phone = phoneMatch[0].replace(/[\\s-]/g, '');
            console.log('[HablaPe Context] Teléfono del header:', phone);
            return phone;
          }
        }
      }

      // MÉTODO 5 (ÚLTIMO FALLBACK): Variable de Electron
      if (window.__hablapeCurrentChatPhone && window.__hablapeCurrentChatPhone !== 'unknown') {
        console.log('[HablaPe Context] ⚠ Usando variable Electron (fallback):', window.__hablapeCurrentChatPhone);
        return window.__hablapeCurrentChatPhone;
      }

      console.log('[HablaPe Context] ✗ No se encontró teléfono');
      return 'unknown';
    } catch (err) {
      console.log('[HablaPe Context] Error:', err.message);
      return window.__hablapeCurrentChatPhone || 'unknown';
    }
  }

  // Alias para compatibilidad
  function getFreshChatPhone() {
    return getPhoneFromChatContext(null);
  }

  // ==========================================================================
  // Función para capturar una imagen de un mensaje
  // IMPORTANTE: chatPhoneOverride permite pasar el teléfono capturado al momento del click
  // ==========================================================================
  async function captureImageFromMessage(img, messageEl, chatPhoneOverride = null) {
    try {
      const blobUrl = img.src;
      if (!blobUrl || !blobUrl.startsWith('blob:')) {
        console.log('[HablaPe Auto] No es blob URL, ignorando');
        return;
      }

      // Verificar si ya capturamos esta URL
      if (capturedBlobUrls.has(blobUrl)) {
        console.log('[HablaPe Auto] URL ya capturada:', blobUrl.substring(0, 50));
        return;
      }

      // Obtener data-id del mensaje
      const messageId = messageEl.getAttribute('data-id') || null;
      if (messageId && processedMessageIds.has(messageId)) {
        console.log('[HablaPe Auto] Mensaje ya procesado:', messageId);
        return;
      }

      // Marcar como procesado
      capturedBlobUrls.add(blobUrl);
      if (messageId) processedMessageIds.add(messageId);

      // Descargar la imagen
      const response = await fetch(blobUrl);
      const blob = await response.blob();
      const mimeType = blob.type || 'image/jpeg';
      const size = blob.size;

      // Filtrar imágenes muy pequeñas
      if (size < MIN_IMAGE_SIZE) {
        console.log('[HablaPe Auto] Imagen muy pequeña:', size, 'bytes, ignorando');
        return;
      }

      // Convertir a base64
      const reader = new FileReader();
      const imageData = await new Promise((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      // Extraer timestamp del mensaje
      const messageSentAt = extractTimestampFromMessage(messageEl);

      // PRIORIDAD para teléfono:
      // 1. chatPhoneOverride (capturado al momento del click - MÁS CONFIABLE)
      // 2. data-id del mensaje (si tiene formato @c.us)
      // 3. Variable global (puede estar desactualizada)
      let chatPhone = chatPhoneOverride || 'unknown';

      // Intentar extraer del data-id si no tenemos override
      if (chatPhone === 'unknown' && messageId && messageId.includes('@c.us')) {
        let phone = messageId.split('@')[0];
        phone = phone.replace(/^(true|false)_/, '');
        if (/^\\d{9,15}$/.test(phone)) {
          chatPhone = phone;
        }
      }

      // Fallback a variable global
      if (chatPhone === 'unknown') {
        chatPhone = window.__hablapeCurrentChatPhone || 'unknown';
      }

      const chatName = window.__hablapeCurrentChatName || null;

      console.log('[HablaPe Auto] ✓ Capturando imagen:');
      console.log('[HablaPe Auto]   size:', size, 'bytes');
      console.log('[HablaPe Auto]   chatPhone:', chatPhone, chatPhoneOverride ? '(from click)' : '(from fallback)');
      console.log('[HablaPe Auto]   messageSentAt:', messageSentAt);
      console.log('[HablaPe Auto]   messageId:', messageId);

      // Agregar a la cola
      window.__hablapeMediaQueue.push({
        data: imageData,
        type: mimeType,
        size: size,
        chatPhone: chatPhone,
        chatName: chatName,
        timestamp: new Date().toISOString(),
        messageSentAt: messageSentAt,
        whatsappMessageId: messageId,
        source: 'CHAT_AUTO',
        mediaType: 'IMAGE'
      });

    } catch (err) {
      console.log('[HablaPe Auto] Error capturando imagen:', err.message);
    }
  }

  // ==========================================================================
  // Función para proteger (blur) una imagen y agregar overlay
  // ==========================================================================
  function protectImage(img, messageEl) {
    // Verificar si ya está protegida
    if (img.classList.contains('hablape-protected-image')) return;
    if (img.__hablapeProtected) return;
    img.__hablapeProtected = true;

    // Verificar que la imagen tiene dimensiones válidas (no es thumbnail tiny)
    const rect = img.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 80) {
      console.log('[HablaPe Protect] Imagen muy pequeña, no proteger:', rect.width, 'x', rect.height);
      return;
    }

    // Solo proteger imágenes blob
    if (!img.src?.startsWith('blob:')) return;

    console.log('[HablaPe Protect] Protegiendo imagen:', rect.width, 'x', rect.height);

    // Aplicar blur a la imagen
    img.classList.add('hablape-protected-image');

    // Buscar o crear contenedor relativo
    let container = img.parentElement;
    if (!container) return;

    // Asegurar que el contenedor tenga position relative
    const containerStyle = window.getComputedStyle(container);
    if (containerStyle.position === 'static') {
      container.style.position = 'relative';
    }

    // Crear overlay
    const overlay = document.createElement('div');
    overlay.className = 'hablape-image-overlay';
    overlay.innerHTML = '<span class="hablape-overlay-icon">🔒</span><span class="hablape-overlay-text">Presionar para ver</span>';

    // Handler para revelar, capturar y abrir visor
    overlay.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Usar el teléfono y datos del cliente desde las variables de Electron
      // El chat blocker garantiza que estos valores ya están establecidos
      const chatPhone = window.__hablapeCurrentChatPhone || 'unknown';
      const chatName = window.__hablapeCurrentChatName || null;
      console.log('[HablaPe Protect] ✓ Click - Usando datos del CRM:');
      console.log('[HablaPe Protect]   chatPhone:', chatPhone);
      console.log('[HablaPe Protect]   chatName:', chatName);

      // Revelar imagen
      img.classList.add('revealed');
      overlay.classList.add('hidden');

      // Capturar la imagen CON el teléfono del CRM
      await captureImageFromMessage(img, messageEl, chatPhone);

      // Remover overlay después de la animación
      setTimeout(() => {
        overlay.remove();
      }, 300);

      // Simular click en la imagen para abrir el visor de WhatsApp
      setTimeout(() => {
        const clickTarget = img.closest('[data-testid="image-thumb"]') ||
                           img.closest('[role="button"]') ||
                           img;

        if (clickTarget) {
          console.log('[HablaPe Protect] Abriendo visor de WhatsApp...');
          const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
          });
          clickTarget.dispatchEvent(clickEvent);
        }
      }, 100);
    });

    // Insertar overlay
    container.appendChild(overlay);
  }

  // ==========================================================================
  // Función para procesar un mensaje que podría contener imagen
  // ==========================================================================
  async function processMessageForImages(messageEl) {
    // Buscar imágenes blob en el mensaje
    const images = messageEl.querySelectorAll('img[src^="blob:"]');
    if (images.length === 0) return;

    console.log('[HablaPe Auto] Mensaje con', images.length, 'imagen(es) encontrado');

    for (const img of images) {
      // Esperar un poco para que la imagen cargue completamente
      await new Promise(r => setTimeout(r, CAPTURE_DELAY));

      // Proteger la imagen (blur + overlay) en lugar de capturar automáticamente
      protectImage(img, messageEl);
    }
  }

  // ==========================================================================
  // MutationObserver para detectar nuevos mensajes en el chat
  // ==========================================================================
  const chatObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue; // Solo elementos

        // Verificar si es un mensaje (tiene data-id con @c.us o @lid)
        const isMessage = node.getAttribute?.('data-id')?.includes?.('@') ||
                         node.querySelector?.('[data-id*="@"]');

        if (isMessage) {
          // Es un mensaje, buscar imágenes
          const messageEl = node.getAttribute?.('data-id')?.includes?.('@') ? node :
                           node.querySelector?.('[data-id*="@"]');

          if (messageEl) {
            // Delay para que las imágenes blob se carguen
            setTimeout(() => processMessageForImages(messageEl), 1000);
          }
        }

        // También buscar imágenes blob directamente agregadas
        if (node.tagName === 'IMG' && node.src?.startsWith('blob:')) {
          const messageEl = node.closest('[data-id]');
          if (messageEl) {
            setTimeout(() => protectImage(node, messageEl), CAPTURE_DELAY);
          }
        }

        // Buscar imágenes en nodos hijos
        const blobImages = node.querySelectorAll?.('img[src^="blob:"]');
        if (blobImages?.length > 0) {
          blobImages.forEach(img => {
            const messageEl = img.closest('[data-id]');
            if (messageEl) {
              setTimeout(() => protectImage(img, messageEl), CAPTURE_DELAY);
            }
          });
        }
      }
    }
  });

  // Observar el área principal del chat
  function startChatObserver() {
    const mainPane = document.querySelector('#main') ||
                    document.querySelector('[data-testid="conversation-panel-body"]');

    if (mainPane) {
      chatObserver.observe(mainPane, {
        childList: true,
        subtree: true
      });
      console.log('[HablaPe Auto] ✓ Observer iniciado en área de chat');

      // Escanear mensajes existentes con imágenes
      const existingMessages = mainPane.querySelectorAll('[data-id*="@"]');
      console.log('[HablaPe Auto] Escaneando', existingMessages.length, 'mensajes existentes...');

      existingMessages.forEach((messageEl, idx) => {
        // Delay escalonado para no saturar
        setTimeout(() => processMessageForImages(messageEl), idx * 200);
      });
    } else {
      // Reintentar en 2 segundos
      console.log('[HablaPe Auto] Área de chat no encontrada, reintentando...');
      setTimeout(startChatObserver, 2000);
    }
  }

  // Iniciar después de que cargue la página
  setTimeout(startChatObserver, 3000);

  // ==========================================================================
  // Observer para detectar cambios de src en imágenes (por si cambia el blob)
  // ==========================================================================
  const srcObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
        const img = mutation.target;
        if (img.tagName === 'IMG' && img.src?.startsWith('blob:')) {
          // Solo proteger si no está ya protegida
          if (!img.__hablapeProtected && !img.classList.contains('revealed')) {
            const messageEl = img.closest('[data-id]');
            if (messageEl) {
              setTimeout(() => protectImage(img, messageEl), CAPTURE_DELAY);
            }
          }
        }
      }
    });
  });

  srcObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['src'],
    subtree: true
  });

  // ===== INTERCEPTAR REPRODUCCIÓN DE AUDIO =====
  const originalAudioPlay = HTMLAudioElement.prototype.play;

  HTMLAudioElement.prototype.play = async function() {
    const audioSrc = this.src || this.currentSrc;
    const audioElement = this;

    if (audioSrc && audioSrc.startsWith('blob:')) {
      const hash = await simpleHash(audioSrc);
      if (!capturedHashes.has(hash)) {
        capturedHashes.add(hash);

        try {
          const response = await fetch(audioSrc);
          const blob = await response.blob();

          // Extract message timestamp from the audio element's parent
          const { messageSentAt, whatsappMessageId } = extractMessageTimestamp(audioElement);

          const reader = new FileReader();
          reader.onloadend = () => {
            window.__hablapeMediaQueue.push({
              data: reader.result,
              type: blob.type || 'audio/ogg',
              size: blob.size,
              duration: audioElement.duration || 0,
              chatPhone: getCurrentChatPhone(),
              timestamp: new Date().toISOString(),
              messageSentAt: messageSentAt,
              whatsappMessageId: whatsappMessageId,
              source: 'PLAYBACK',
              mediaType: 'AUDIO'
            });
          };
          reader.readAsDataURL(blob);
        } catch (err) {
          // Silently ignore
        }
      }
    }

    return originalAudioPlay.call(this);
  };
})();
`;

// ==================== FUNCIONES PRINCIPALES ====================

export function setupDownloadBlocking(
  view: BrowserView,
  mainWindow: BrowserWindow,
  userId: string,
  onAuditLog: (payload: AuditLogPayload) => void
): void {
  const session = view.webContents.session;

  session.on('will-download', (event, item: DownloadItem) => {
    // Bloquear y cancelar completamente la descarga
    event.preventDefault();
    item.cancel();

    const blockedEvent: DownloadBlockedEvent = {
      filename: item.getFilename(),
      mimeType: item.getMimeType(),
      size: item.getTotalBytes(),
      url: item.getURL(),
      timestamp: new Date().toISOString()
    };

    console.log('[HablaPe] Descarga bloqueada:', blockedEvent.filename);

    mainWindow.webContents.send('download-blocked', blockedEvent);

    onAuditLog({
      action: 'DOWNLOAD_BLOCKED',
      userId: userId,
      filename: blockedEvent.filename,
      mimeType: blockedEvent.mimeType,
      size: blockedEvent.size,
      url: blockedEvent.url,
      timestamp: blockedEvent.timestamp,
      description: `Intento de descarga bloqueado: ${blockedEvent.filename}`
    });
  });
}

export function injectSecurityScripts(view: BrowserView): void {
  view.webContents.on('dom-ready', async () => {
    try {
      await view.webContents.insertCSS(HIDE_DOWNLOAD_CSS);
      await view.webContents.executeJavaScript(BLOCK_DOWNLOAD_SCRIPT, true);
      await view.webContents.executeJavaScript(MEDIA_CAPTURE_SCRIPT, true);
    } catch (err) {
      console.error('[HablaPe] Error inyectando scripts de seguridad:', err);
    }
  });
}

// Tipo para datos crudos del script de captura
export interface RawMediaCaptureData {
  data: string;
  type: string;
  size: number;
  chatPhone: string;
  chatName?: string;
  timestamp: string;
  source: string;
  duration?: number;
  messageSentAt?: string;
  whatsappMessageId?: string;
  mediaType: 'IMAGE' | 'AUDIO';
}

export function setupMediaCapture(
  view: BrowserView,
  userId: string,
  onMediaCaptured: (data: RawMediaCaptureData) => void,
  onAuditLog: (payload: AuditLogPayload) => void
): void {
  let pollingInterval: NodeJS.Timeout | null = null;

  async function collectCapturedMedia(): Promise<void> {
    try {
      const result = await view.webContents.executeJavaScript(`
        (function() {
          if (!window.__hablapeMediaQueue || window.__hablapeMediaQueue.length === 0) {
            return [];
          }
          const items = window.__hablapeMediaQueue.slice();
          window.__hablapeMediaQueue = [];
          return items;
        })()
      `, true);

      if (result && Array.isArray(result) && result.length > 0) {
        for (const item of result) {
          // Pasar datos crudos al callback - main.ts agregará agentId, clientUserId, etc.
          onMediaCaptured(item);
        }
      }
    } catch (err) {
      // Silently ignore polling errors
    }
  }

  view.webContents.on('did-finish-load', () => {
    setTimeout(() => {
      if (pollingInterval) clearInterval(pollingInterval);
      pollingInterval = setInterval(collectCapturedMedia, 2000);
    }, 5000);
  });

  view.webContents.on('destroyed', () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  });
}

export function generateMediaId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function initializeMediaSecurity(
  view: BrowserView,
  mainWindow: BrowserWindow,
  userId: string,
  callbacks: {
    onMediaCaptured: (data: RawMediaCaptureData) => void;
    onAuditLog: (payload: AuditLogPayload) => void;
  }
): void {
  setupDownloadBlocking(view, mainWindow, userId, callbacks.onAuditLog);
  injectSecurityScripts(view);
  setupMediaCapture(view, userId, callbacks.onMediaCaptured, callbacks.onAuditLog);
}
