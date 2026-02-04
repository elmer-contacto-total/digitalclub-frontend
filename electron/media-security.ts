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

const MEDIA_CAPTURE_SCRIPT = `
(function() {
  'use strict';

  if (window.__hablapeMediaCaptureInjected) return;
  window.__hablapeMediaCaptureInjected = true;

  window.__hablapeMediaQueue = window.__hablapeMediaQueue || [];
  const capturedHashes = new Set();

  // =========================================================================
  // Variable global para guardar contexto del último chat/mensaje clickeado
  // IMPORTANTE: Se resetean al detectar un nuevo click en imagen
  // =========================================================================
  let lastKnownChatPhone = 'unknown';
  let lastKnownMessageTimestamp = null;
  let lastKnownWhatsappMessageId = null;
  let lastContextCaptureTime = 0; // Para evitar usar contexto muy antiguo

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
          // Format as ISO timestamp
          const messageSentAt = year + '-' + month.padStart(2, '0') + '-' + day.padStart(2, '0') + 'T' + time + ':00';

          // Guardar en cache para cuando estemos en el visor
          lastKnownMessageTimestamp = messageSentAt;
          lastKnownWhatsappMessageId = whatsappMessageId;
          lastContextCaptureTime = Date.now();
          console.log('[HablaPe Debug] extractMessageTimestamp: encontrado via data-pre-plain-text:', messageSentAt);

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

          // Usar fecha de hoy (en zona horaria local)
          const now = new Date();
          const dateStr = now.getFullYear() + '-' +
                         String(now.getMonth() + 1).padStart(2, '0') + '-' +
                         String(now.getDate()).padStart(2, '0');
          const messageSentAt = dateStr + 'T' + String(hours).padStart(2, '0') + ':' + minutes + ':00';

          // Guardar en cache
          lastKnownMessageTimestamp = messageSentAt;
          lastKnownWhatsappMessageId = whatsappMessageId;
          lastContextCaptureTime = Date.now();
          console.log('[HablaPe Debug] extractMessageTimestamp: encontrado via span:', messageSentAt, '(from:', text, ')');

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
          lastKnownMessageTimestamp = year + '-' + month.padStart(2, '0') + '-' + day.padStart(2, '0') + 'T' + time + ':00';
          console.log('[HablaPe Debug] MÉTODO 1 OK: timestamp=' + lastKnownMessageTimestamp);
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

          // Usar fecha de hoy (en zona horaria local)
          const now = new Date();
          const dateStr = now.getFullYear() + '-' +
                         String(now.getMonth() + 1).padStart(2, '0') + '-' +
                         String(now.getDate()).padStart(2, '0');
          lastKnownMessageTimestamp = dateStr + 'T' + String(hours).padStart(2, '0') + ':' + minutes + ':00';
          console.log('[HablaPe Debug] MÉTODO 2 OK: timestamp=' + lastKnownMessageTimestamp + ' (from span: ' + text + ')');
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
          const dateStr = now.getFullYear() + '-' +
                         String(now.getMonth() + 1).padStart(2, '0') + '-' +
                         String(now.getDate()).padStart(2, '0');
          lastKnownMessageTimestamp = dateStr + 'T' + metaMatch[1].padStart(2, '0') + ':' + metaMatch[2] + ':00';
          console.log('[HablaPe Debug] MÉTODO 4 OK: timestamp=' + lastKnownMessageTimestamp);
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
  // ESTRATEGIA DE CAPTURA SIMPLIFICADA
  // ==========================================================================
  //
  // REGLA PRINCIPAL: Solo capturar imágenes que el usuario EXPLÍCITAMENTE ve
  // en el visor de pantalla completa (lightbox/gallery).
  //
  // NO capturar:
  // - Miniaturas en el chat (filtradas por tamaño < 20KB)
  // - Stickers y GIFs (no son imágenes de conversación)
  // - Fotos de perfil
  // - Imágenes de UI
  //
  // SÍ capturar:
  // - Imagen abierta en visor fullscreen (una por vez)
  // - Cada imagen cuando el usuario navega con < >
  // ==========================================================================

  // Estado para controlar capturas
  let lastCaptureTime = 0;
  const CAPTURE_COOLDOWN = 1500; // Mínimo 1.5 segundos entre capturas
  let captureScheduled = false; // Flag para evitar múltiples capturas programadas
  let srcChangeTimeout = null; // Para debounce del srcObserver
  const capturedBlobUrls = new Set(); // Tracking de URLs de blob ya capturadas

  // ==========================================================================
  // Función MEJORADA para verificar si estamos en el visor de medios
  // Usa 4 métodos diferentes para detectar el visor
  // ==========================================================================
  function isMediaViewerOpen() {
    // Método 1: Selectores específicos de WhatsApp (data-testid)
    const byTestId = document.querySelector('[data-testid="media-viewer"]') ||
                     document.querySelector('[data-testid="image-viewer"]') ||
                     document.querySelector('[data-testid="lightbox"]') ||
                     document.querySelector('[data-testid="media-viewer-modal"]') ||
                     document.querySelector('[data-testid="media-state-layer"]');
    if (byTestId) {
      console.log('[HablaPe Debug] isMediaViewerOpen: encontrado por data-testid');
      return byTestId;
    }

    // Método 2: Buscar overlay/modal con imagen grande
    // WhatsApp usa un div con role="dialog" o similar para el visor
    const dialogs = document.querySelectorAll('[role="dialog"], [role="presentation"]');
    for (const dialog of dialogs) {
      const hasLargeImage = dialog.querySelector('img[src^="blob:"]');
      if (hasLargeImage) {
        console.log('[HablaPe Debug] isMediaViewerOpen: encontrado por role=dialog');
        return dialog;
      }
    }

    // Método 3: Buscar imagen blob grande en overlay de pantalla completa
    // El visor típicamente tiene position:fixed y cubre toda la pantalla
    const allDivs = document.querySelectorAll('div');
    for (const el of allDivs) {
      const style = window.getComputedStyle(el);
      if (style.position === 'fixed' || style.position === 'absolute') {
        const rect = el.getBoundingClientRect();
        // Si cubre más del 70% de la pantalla
        if (rect.width > window.innerWidth * 0.7 && rect.height > window.innerHeight * 0.7) {
          if (el.querySelector('img[src^="blob:"]')) {
            console.log('[HablaPe Debug] isMediaViewerOpen: encontrado por fixed/absolute overlay');
            return el;
          }
        }
      }
    }

    // Método 4: Buscar por estructura típica de lightbox
    // Imagen blob con tamaño de display grande (no naturalWidth)
    const allBlobImages = document.querySelectorAll('img[src^="blob:"]');
    for (const img of allBlobImages) {
      const rect = img.getBoundingClientRect();
      // Si la imagen ocupa más del 50% de la pantalla, es el visor
      if (rect.width > window.innerWidth * 0.5 && rect.height > window.innerHeight * 0.5) {
        console.log('[HablaPe Debug] isMediaViewerOpen: encontrado por imagen grande', rect.width, 'x', rect.height);
        return img.closest('div') || img;
      }
    }

    console.log('[HablaPe Debug] isMediaViewerOpen: NO encontrado');
    return null;
  }

  // ==========================================================================
  // Función MEJORADA para obtener la imagen principal del visor
  // Usa getBoundingClientRect() para detectar dimensiones visibles
  // ==========================================================================
  function getMainViewerImage() {
    const viewer = isMediaViewerOpen();
    if (!viewer) {
      console.log('[HablaPe Debug] getMainViewerImage: visor no abierto');
      return null;
    }

    // Buscar todas las imágenes blob en el visor o documento
    const images = viewer.querySelectorAll?.('img[src^="blob:"]') ||
                   document.querySelectorAll('img[src^="blob:"]');

    console.log('[HablaPe Debug] getMainViewerImage: encontradas', images.length, 'imágenes blob');

    let mainImg = null;
    let maxDisplaySize = 0;

    images.forEach((img, idx) => {
      // Usar getBoundingClientRect() en lugar de naturalWidth
      // Esto funciona incluso si la imagen aún carga
      const rect = img.getBoundingClientRect();
      const displaySize = rect.width * rect.height;

      console.log('[HablaPe Debug] Img[' + idx + ']: display', Math.round(rect.width) + 'x' + Math.round(rect.height), '=', Math.round(displaySize));

      // Umbral más bajo: 200x200 display pixels (no natural)
      if (displaySize > maxDisplaySize && rect.width > 200 && rect.height > 200) {
        maxDisplaySize = displaySize;
        mainImg = img;
      }
    });

    // Fallback: buscar canvas
    if (!mainImg) {
      const canvas = viewer.querySelector?.('canvas') ||
                     document.querySelector('canvas');
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        console.log('[HablaPe Debug] Canvas encontrado:', Math.round(rect.width) + 'x' + Math.round(rect.height));
        if (rect.width > 200 && rect.height > 200) {
          return canvas;
        }
      }
    }

    console.log('[HablaPe Debug] getMainViewerImage: imagen seleccionada:', mainImg ? 'SI' : 'NO');
    return mainImg;
  }

  // ==========================================================================
  // NUEVA función para esperar a que la imagen esté lista
  // ==========================================================================
  async function waitForImageReady(img, maxWait = 2000) {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      // Verificar si tiene dimensiones naturales válidas
      if (img.naturalWidth > 100 && img.naturalHeight > 100) {
        console.log('[HablaPe Debug] waitForImageReady: natural dims OK', img.naturalWidth, 'x', img.naturalHeight);
        return true;
      }
      // Verificar si tiene dimensiones de display válidas
      const rect = img.getBoundingClientRect();
      if (rect.width > 200 && rect.height > 200) {
        console.log('[HablaPe Debug] waitForImageReady: display dims OK', Math.round(rect.width), 'x', Math.round(rect.height));
        return true;
      }
      // Esperar 100ms y reintentar
      await new Promise(r => setTimeout(r, 100));
    }
    console.log('[HablaPe Debug] waitForImageReady: timeout después de', maxWait, 'ms');
    return false;
  }

  // ==========================================================================
  // Función principal de captura MEJORADA (ahora async con waitForImageReady)
  // ==========================================================================
  async function captureViewerImage() {
    console.log('[HablaPe Debug] captureViewerImage() llamada');

    const now = Date.now();
    if (now - lastCaptureTime < CAPTURE_COOLDOWN) {
      console.log('[HablaPe Debug] Bloqueado por cooldown, faltan', CAPTURE_COOLDOWN - (now - lastCaptureTime), 'ms');
      return; // Evitar capturas muy seguidas
    }

    const mainImage = getMainViewerImage();
    console.log('[HablaPe Debug] Imagen principal:', mainImage ? mainImage.tagName : 'null');

    if (mainImage) {
      // Esperar a que esté lista (solo para IMG, no CANVAS)
      if (mainImage.tagName === 'IMG') {
        const ready = await waitForImageReady(mainImage);
        if (!ready) {
          console.log('[HablaPe Debug] Imagen no está lista después de esperar');
          return;
        }
      }

      // Verificar si ya capturamos este blob URL específico (solo para IMG, no CANVAS)
      if (mainImage.tagName === 'IMG' && mainImage.src) {
        console.log('[HablaPe Debug] URL de imagen:', mainImage.src.substring(0, 50) + '...');
        if (capturedBlobUrls.has(mainImage.src)) {
          console.log('[HablaPe Debug] URL ya capturada, saltando');
          return; // Ya capturada esta URL específica
        }
      }

      lastCaptureTime = now;
      await captureImage(mainImage, 'PREVIEW');

      // Agregar al Set DESPUÉS de llamar captureImage (que tiene su propia dedup)
      if (mainImage.tagName === 'IMG' && mainImage.src) {
        capturedBlobUrls.add(mainImage.src);
      }
      console.log('[HablaPe Debug] Captura enviada a cola');
    }
  }

  // ==========================================================================
  // Función para programar una captura única (evita múltiples disparos simultáneos)
  // Tiempos AUMENTADOS para mejor detección (default 800ms)
  // ==========================================================================
  function scheduleCaptureOnce(delay = 800) {
    console.log('[HablaPe Debug] scheduleCaptureOnce() delay:', delay, 'scheduled:', captureScheduled);
    if (captureScheduled) return; // Ya hay una captura programada
    captureScheduled = true;
    setTimeout(async () => {
      await captureViewerImage();
      captureScheduled = false;
    }, delay);
  }

  // ==========================================================================
  // Intentar extraer timestamp de la UI del visor de WhatsApp
  // El timestamp está en el header del visor, debajo del nombre del usuario
  // Formato típico: "hoy a las 17:34" o "4 feb 2026 a las 10:30"
  // ==========================================================================
  function extractTimestampFromViewer() {
    try {
      console.log('[HablaPe Debug] extractTimestampFromViewer: buscando timestamp en visor...');

      const viewer = isMediaViewerOpen();
      if (!viewer) {
        console.log('[HablaPe Debug] extractTimestampFromViewer: visor no abierto');
        return null;
      }

      // Mapa de meses en español
      const monthMap = {
        'ene': 1, 'enero': 1,
        'feb': 2, 'febrero': 2,
        'mar': 3, 'marzo': 3,
        'abr': 4, 'abril': 4,
        'may': 5, 'mayo': 5,
        'jun': 6, 'junio': 6,
        'jul': 7, 'julio': 7,
        'ago': 8, 'agosto': 8,
        'sep': 9, 'sept': 9, 'septiembre': 9,
        'oct': 10, 'octubre': 10,
        'nov': 11, 'noviembre': 11,
        'dic': 12, 'diciembre': 12
      };

      // Función para parsear fecha/hora
      function parseDateTime(text) {
        console.log('[HablaPe Debug] Parseando texto:', text);

        const now = new Date();
        let year = now.getFullYear();
        let month = now.getMonth() + 1;
        let day = now.getDate();
        let hours = null;
        let minutes = null;

        // Detectar "hoy" o "ayer"
        const lowerText = text.toLowerCase();
        if (lowerText.includes('ayer')) {
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          year = yesterday.getFullYear();
          month = yesterday.getMonth() + 1;
          day = yesterday.getDate();
        }

        // Buscar hora: "17:34" o "5:30 p. m." o "a las 17:34"
        const timeMatch = text.match(/(\\d{1,2}):(\\d{2})(?:\\s*([ap])\\.?\\s*m\\.?)?/i);
        if (timeMatch) {
          hours = parseInt(timeMatch[1]);
          minutes = timeMatch[2];
          const ampm = timeMatch[3]?.toLowerCase() || '';

          // Convertir a 24h si es necesario
          if (ampm === 'p' && hours < 12) hours += 12;
          if (ampm === 'a' && hours === 12) hours = 0;

          console.log('[HablaPe Debug] Hora encontrada:', hours + ':' + minutes);
        }

        // Buscar fecha: "4 feb 2026" o "4 de febrero de 2026" o "04/02/2026"
        // Formato con mes en texto
        const dateTextMatch = text.match(/(\\d{1,2})\\s*(?:de\\s*)?(ene|feb|mar|abr|may|jun|jul|ago|sep|sept|oct|nov|dic|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\\s*(?:de\\s*)?(\\d{4}))?/i);
        if (dateTextMatch) {
          day = parseInt(dateTextMatch[1]);
          const monthName = dateTextMatch[2].toLowerCase();
          month = monthMap[monthName] || month;
          if (dateTextMatch[3]) {
            year = parseInt(dateTextMatch[3]);
          }
          console.log('[HablaPe Debug] Fecha texto encontrada:', day + '/' + month + '/' + year);
        }

        // Formato numérico: "04/02/2026" o "4/2/2026"
        const dateNumMatch = text.match(/(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})/);
        if (dateNumMatch) {
          day = parseInt(dateNumMatch[1]);
          month = parseInt(dateNumMatch[2]);
          year = parseInt(dateNumMatch[3]);
          console.log('[HablaPe Debug] Fecha numérica encontrada:', day + '/' + month + '/' + year);
        }

        // Si encontramos hora, construir timestamp
        if (hours !== null && minutes !== null) {
          const timestamp = year + '-' +
                           String(month).padStart(2, '0') + '-' +
                           String(day).padStart(2, '0') + 'T' +
                           String(hours).padStart(2, '0') + ':' + minutes + ':00';
          console.log('[HablaPe Debug] Timestamp construido:', timestamp);
          return timestamp;
        }

        return null;
      }

      // ========== ESTRATEGIA 1: Buscar en el header del visor ==========
      // El header típicamente tiene: [Botón atrás] [Avatar] [Nombre] [Fecha/hora]
      const headerSelectors = [
        '[data-testid="media-viewer"] header',
        '[data-testid="lightbox"] header',
        '[data-testid="image-viewer"] header',
        'header[data-testid]',
        // Buscar divs con position fixed/absolute que podrían ser el header
        'div[style*="position: fixed"] header',
        'div[style*="position:fixed"] header'
      ];

      for (const selector of headerSelectors) {
        const header = document.querySelector(selector);
        if (header) {
          const headerText = header.textContent || '';
          console.log('[HablaPe Debug] Header encontrado (' + selector + '):', headerText.substring(0, 100));
          const timestamp = parseDateTime(headerText);
          if (timestamp) return timestamp;
        }
      }

      // ========== ESTRATEGIA 2: Buscar todos los spans en el visor ==========
      // Buscar spans que contengan patrones de fecha/hora
      const allSpans = document.querySelectorAll('span');
      for (const span of allSpans) {
        const text = span.textContent?.trim() || '';
        if (!text || text.length > 100) continue;

        // Verificar si contiene patrón de hora
        if (/(\\d{1,2}):(\\d{2})/.test(text)) {
          // Verificar que el span esté visible y en posición superior (header)
          const rect = span.getBoundingClientRect();
          if (rect.top < 150 && rect.top > 0) { // En los primeros 150px (header area)
            console.log('[HablaPe Debug] Span con hora en header area:', text, 'top:', rect.top);
            const timestamp = parseDateTime(text);
            if (timestamp) return timestamp;
          }
        }
      }

      // ========== ESTRATEGIA 3: Buscar divs con texto de fecha en área superior ==========
      const allDivs = document.querySelectorAll('div');
      for (const div of allDivs) {
        const rect = div.getBoundingClientRect();
        // Solo divs en el área del header (primeros 150px)
        if (rect.top > 150 || rect.top < 0) continue;
        if (rect.height > 100) continue; // Ignorar contenedores grandes

        const text = div.textContent?.trim() || '';
        if (!text || text.length > 150) continue;

        // Verificar si contiene patrón de fecha/hora
        if (/(\\d{1,2}):(\\d{2})/.test(text) ||
            /(hoy|ayer)/i.test(text) ||
            /(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)/i.test(text)) {
          console.log('[HablaPe Debug] Div con fecha/hora en header:', text.substring(0, 80), 'top:', rect.top);
          const timestamp = parseDateTime(text);
          if (timestamp) return timestamp;
        }
      }

      console.log('[HablaPe Debug] extractTimestampFromViewer: no se encontró timestamp');
      return null;
    } catch (err) {
      console.log('[HablaPe Debug] extractTimestampFromViewer error:', err.message);
      return null;
    }
  }

  // ==========================================================================
  // DETECTOR 1: Click en imagen del chat (abre visor) o botones de navegación
  // ==========================================================================
  document.addEventListener('click', (e) => {
    const target = e.target;

    // CASO A: Click en miniatura de imagen en el chat (abre visor)
    const isImageClick = target.tagName === 'IMG' ||
                        target.closest?.('[data-testid="image-thumb"]') ||
                        target.closest?.('[data-testid="media-thumb"]') ||
                        target.closest?.('img[src^="blob:"]');

    console.log('[HablaPe Debug] Click detectado - isImageClick:', isImageClick, 'viewerOpen:', !!isMediaViewerOpen());

    if (isImageClick && !isMediaViewerOpen()) {
      console.log('[HablaPe Debug] Click en imagen, capturando contexto...');

      // IMPORTANTE: Capturar contexto del mensaje ANTES de que se abra el visor
      captureMessageContext(target);

      // También actualizar el teléfono del chat activo
      getCurrentChatPhone();

      // Esperar más tiempo a que se abra el visor (500ms en lugar de 300ms)
      setTimeout(() => {
        const viewerNow = isMediaViewerOpen();
        console.log('[HablaPe Debug] Después de 500ms, visor abierto:', !!viewerNow);
        if (viewerNow) {
          scheduleCaptureOnce(800); // Aumentado de 500 a 800ms
        }
      }, 500); // Aumentado de 300 a 500ms
      return;
    }

    // CASO B: Click en botones de navegación < > dentro del visor
    if (isMediaViewerOpen()) {
      const isNavButton = target.closest?.('[data-testid*="prev"]') ||
                         target.closest?.('[data-testid*="next"]') ||
                         target.closest?.('[data-testid*="arrow"]') ||
                         target.closest?.('[data-icon="prev"]') ||
                         target.closest?.('[data-icon="next"]') ||
                         target.closest?.('[aria-label*="anterior"]') ||
                         target.closest?.('[aria-label*="siguiente"]') ||
                         target.closest?.('[aria-label*="previous"]') ||
                         target.closest?.('[aria-label*="next"]') ||
                         // Botones genéricos en el visor que no son cerrar
                         (target.tagName === 'BUTTON' && !target.closest?.('[data-testid*="close"]'));

      if (isNavButton) {
        console.log('[HablaPe Debug] Navegación en visor detectada - RESETEANDO contexto');

        // IMPORTANTE: Resetear timestamp y messageId porque estamos viendo una imagen diferente
        // El timestamp cacheado del click inicial NO aplica a esta imagen
        lastKnownMessageTimestamp = null;
        lastKnownWhatsappMessageId = null;

        // Intentar extraer timestamp de la UI del visor
        const viewerTimestamp = extractTimestampFromViewer();
        if (viewerTimestamp) {
          lastKnownMessageTimestamp = viewerTimestamp;
          console.log('[HablaPe Debug] Timestamp extraído del visor:', viewerTimestamp);
        }

        // Esperar a que cambie la imagen
        scheduleCaptureOnce(800);
      }
    }
  }, true);

  // ==========================================================================
  // DETECTOR 2: Navegación en galería - SIN filtro de dimensiones
  // ==========================================================================
  const srcObserver = new MutationObserver((mutations) => {
    // Solo procesar si el visor está abierto
    if (!isMediaViewerOpen()) return;

    // Buscar cualquier cambio de src en imagen blob (sin filtrar por dimensiones)
    let hasRelevantChange = false;
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
        const img = mutation.target;
        if (img.tagName === 'IMG' && img.src?.startsWith('blob:')) {
          hasRelevantChange = true;
          console.log('[HablaPe Debug] srcObserver: cambio de src detectado - RESETEANDO contexto');

          // IMPORTANTE: Resetear timestamp y messageId porque la imagen cambió
          lastKnownMessageTimestamp = null;
          lastKnownWhatsappMessageId = null;
        }
      }
    });

    if (!hasRelevantChange) return;

    // Debounce y esperar más tiempo para que cargue
    if (srcChangeTimeout) clearTimeout(srcChangeTimeout);
    srcChangeTimeout = setTimeout(() => {
      // Intentar extraer timestamp del visor antes de capturar
      const viewerTimestamp = extractTimestampFromViewer();
      if (viewerTimestamp) {
        lastKnownMessageTimestamp = viewerTimestamp;
        console.log('[HablaPe Debug] srcObserver: Timestamp extraído del visor:', viewerTimestamp);
      }
      scheduleCaptureOnce(500);
    }, 300);
  });

  srcObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['src'],
    subtree: true
  });

  // ==========================================================================
  // DETECTOR 3: Teclas de navegación (← →) en el visor
  // Tiempo AUMENTADO a 800ms
  // ==========================================================================
  document.addEventListener('keydown', (e) => {
    if (!isMediaViewerOpen()) return;

    // Detectar flechas izquierda/derecha
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      console.log('[HablaPe Debug] Tecla de navegación:', e.key, '- RESETEANDO contexto');

      // IMPORTANTE: Resetear timestamp y messageId porque estamos navegando a otra imagen
      lastKnownMessageTimestamp = null;
      lastKnownWhatsappMessageId = null;

      // Intentar extraer timestamp de la UI del visor
      const viewerTimestamp = extractTimestampFromViewer();
      if (viewerTimestamp) {
        lastKnownMessageTimestamp = viewerTimestamp;
        console.log('[HablaPe Debug] Timestamp extraído del visor:', viewerTimestamp);
      }

      // Esperar a que cambie la imagen
      scheduleCaptureOnce(800);
    }
  }, true);

  // ==========================================================================
  // NO usar MutationObserver genérico - causa demasiadas capturas falsas
  // ==========================================================================

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
