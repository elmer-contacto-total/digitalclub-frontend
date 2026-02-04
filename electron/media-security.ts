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

  function getCurrentChatPhone() {
    try {
      const chatHeader = document.querySelector('[data-testid="conversation-header"]');
      if (chatHeader) {
        const phoneSpan = chatHeader.querySelector('span[title]');
        if (phoneSpan) {
          const title = phoneSpan.getAttribute('title');
          const phoneMatch = title?.match(/\\+?[0-9\\s-]{10,}/);
          if (phoneMatch) return phoneMatch[0].replace(/[\\s-]/g, '');
        }
      }

      const hash = window.location.hash;
      const phoneMatch = hash.match(/@([0-9]+)/);
      if (phoneMatch) return phoneMatch[1];

      const chatContainer = document.querySelector('[data-id*="@c.us"]');
      if (chatContainer) {
        const dataId = chatContainer.getAttribute('data-id');
        const phoneFromId = dataId?.split('@')[0];
        if (phoneFromId) return phoneFromId;
      }

      return 'unknown';
    } catch (err) {
      return 'unknown';
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

      if (!messageEl) return { messageSentAt: null, whatsappMessageId: null };

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
          return { messageSentAt, whatsappMessageId };
        }
      }

      // Fallback: look for time in metadata spans
      const timeSpans = messageEl.querySelectorAll('span[dir="auto"]');
      for (const span of timeSpans) {
        const text = span.textContent?.trim() || '';
        // Match time format like "10:30" or "10:30 a. m."
        if (/^\\d{1,2}:\\d{2}(\\s*(a\\.?\\s*m\\.?|p\\.?\\s*m\\.?))?$/i.test(text)) {
          // We have time but not date - use today
          const today = new Date();
          const [hours, minutes] = text.split(':');
          const messageSentAt = today.toISOString().split('T')[0] + 'T' + hours.padStart(2, '0') + ':' + minutes.substring(0, 2) + ':00';
          return { messageSentAt, whatsappMessageId };
        }
      }

      return { messageSentAt: null, whatsappMessageId };
    } catch (err) {
      return { messageSentAt: null, whatsappMessageId: null };
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

      if (!imageData || imageData.length < 1000) return;

      // Extract message timestamp
      const { messageSentAt, whatsappMessageId } = extractMessageTimestamp(element);

      window.__hablapeMediaQueue.push({
        data: imageData,
        type: mimeType,
        size: size,
        chatPhone: getCurrentChatPhone(),
        timestamp: new Date().toISOString(),
        messageSentAt: messageSentAt,
        whatsappMessageId: whatsappMessageId,
        source: source,
        mediaType: 'IMAGE'
      });
    } catch (err) {
      // Silently ignore capture errors
    }
  }

  // ===== OBSERVER PARA IMÁGENES =====
  const imageObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;

        // Visor de medios fullscreen
        const mediaViewer = node.querySelector?.('[data-testid="media-viewer"]') ||
                           node.querySelector?.('[data-testid="image-viewer"]') ||
                           node.querySelector?.('[data-testid="gallery-viewer"]') ||
                           node.querySelector?.('[data-testid="media-viewer-modal"]') ||
                           node.querySelector?.('[data-testid="lightbox"]') ||
                           node.matches?.('[data-testid="media-viewer"]') ||
                           node.matches?.('[data-testid="lightbox"]');

        if (mediaViewer || node.matches?.('[data-testid="media-viewer"]') || node.matches?.('[data-testid="lightbox"]')) {
          // Only capture the MAIN visible image, not all images in the gallery
          // The srcObserver will capture other images when user navigates with < >
          const target = node.querySelector?.('[data-testid="media-canvas"]') ||
                        node.querySelector?.('canvas');

          if (target) {
            setTimeout(() => captureImage(target, 'PREVIEW'), 500);
          } else {
            // Fallback: find the main visible image with delay for loading
            const findAndCaptureMainImage = () => {
              const allImages = Array.from(node.querySelectorAll?.('img[src^="blob:"], img[src^="data:"]') || []);

              if (allImages.length === 0) return;

              // If only one image, capture it
              if (allImages.length === 1) {
                captureImage(allImages[0], 'PREVIEW');
                return;
              }

              // Find the largest loaded image
              let mainImage = null;
              let maxSize = 0;

              for (const img of allImages) {
                const w = img.naturalWidth || img.width || img.offsetWidth || 0;
                const h = img.naturalHeight || img.height || img.offsetHeight || 0;
                const size = w * h;

                // Accept images that are reasonably sized (> 100px in any dimension)
                if (size > maxSize && (w > 100 || h > 100)) {
                  maxSize = size;
                  mainImage = img;
                }
              }

              if (mainImage) {
                captureImage(mainImage, 'PREVIEW');
              } else {
                // Fallback: just capture the first blob image
                const firstBlob = allImages.find(img => img.src?.startsWith('blob:'));
                if (firstBlob) captureImage(firstBlob, 'PREVIEW');
              }
            };

            // Wait for images to load
            setTimeout(findAndCaptureMainImage, 800);
          }
        }

        // Stickers
        const stickers = node.querySelectorAll?.('[data-testid="sticker"] img, [data-testid="sticker"] canvas') || [];
        if (node.matches?.('[data-testid="sticker"]')) {
          const stickerImg = node.querySelector('img') || node.querySelector('canvas');
          if (stickerImg) setTimeout(() => captureImage(stickerImg, 'PREVIEW'), 300);
        }
        stickers.forEach((sticker) => setTimeout(() => captureImage(sticker, 'PREVIEW'), 300));

        // GIFs
        const gifs = node.querySelectorAll?.('[data-testid="gif"] img, [data-testid="gif"] canvas') || [];
        if (node.matches?.('[data-testid="gif"]')) {
          const gifImg = node.querySelector('img') || node.querySelector('canvas');
          if (gifImg) setTimeout(() => captureImage(gifImg, 'PREVIEW'), 300);
        }
        gifs.forEach((gif) => setTimeout(() => captureImage(gif, 'PREVIEW'), 300));

        // Fallback: overlay/modal con imagen grande
        // Only capture the MAIN visible image, not all images
        const isOverlay = node.style?.position === 'fixed' ||
                         node.style?.position === 'absolute' ||
                         node.classList?.contains('overlay') ||
                         node.getAttribute?.('role') === 'dialog' ||
                         node.getAttribute?.('aria-modal') === 'true';

        if (isOverlay) {
          // Find the largest/main image only
          const findMainImage = () => {
            const overlayImages = Array.from(node.querySelectorAll?.('img[src^="blob:"], img[src^="data:"]') || []);
            let mainImage = null;
            let maxSize = 0;

            for (const img of overlayImages) {
              const w = img.naturalWidth || img.width || img.offsetWidth || 0;
              const h = img.naturalHeight || img.height || img.offsetHeight || 0;
              const size = w * h;

              if (size > maxSize && w > 200) {
                maxSize = size;
                mainImage = img;
              }
            }

            if (mainImage) {
              captureImage(mainImage, 'PREVIEW');
            } else if (overlayImages.length === 1) {
              captureImage(overlayImages[0], 'PREVIEW');
            }
          };

          // Wait for images to load
          setTimeout(findMainImage, 800);
        }
      });
    });
  });

  imageObserver.observe(document.body, { childList: true, subtree: true });

  // Observer para cambio de src en galería
  const srcObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
        const img = mutation.target;
        if (img.tagName === 'IMG' && img.src?.startsWith('blob:')) {
          if (img.closest('[data-testid="media-viewer"]') ||
              img.closest('[data-testid="image-viewer"]') ||
              img.closest('[data-testid="gallery-viewer"]')) {
            setTimeout(() => captureImage(img, 'PREVIEW'), 300);
          }
        }
      }
    });
  });

  srcObserver.observe(document.body, { attributes: true, attributeFilter: ['src'], subtree: true });

  // Fallback: click en imágenes - only capture the main visible image
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (target.tagName === 'IMG' && target.src) {
      setTimeout(() => {
        const viewer = document.querySelector('[data-testid="media-viewer"]') ||
                      document.querySelector('[data-testid="image-viewer"]') ||
                      document.querySelector('[data-testid="lightbox"]') ||
                      document.querySelector('[role="dialog"]') ||
                      document.querySelector('[aria-modal="true"]');

        if (viewer) {
          // Find the main/largest image in the viewer
          const canvas = viewer.querySelector?.('canvas');
          if (canvas) {
            captureImage(canvas, 'PREVIEW');
            return;
          }

          const images = Array.from(viewer.querySelectorAll?.('img[src^="blob:"], img[src^="data:"]') || []);

          if (images.length === 1) {
            captureImage(images[0], 'PREVIEW');
            return;
          }

          let mainImage = null;
          let maxSize = 0;

          for (const img of images) {
            const w = img.naturalWidth || img.width || img.offsetWidth || 0;
            const h = img.naturalHeight || img.height || img.offsetHeight || 0;
            const size = w * h;

            if (size > maxSize && w > 100) {
              maxSize = size;
              mainImage = img;
            }
          }

          if (mainImage) {
            captureImage(mainImage, 'PREVIEW');
          } else if (images.length > 0) {
            // Fallback: capture first blob image
            const firstBlob = images.find(img => img.src?.startsWith('blob:'));
            if (firstBlob) captureImage(firstBlob, 'PREVIEW');
          }
        }
      }, 1000);
    }
  }, true);

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

export function setupMediaCapture(
  view: BrowserView,
  userId: string,
  onMediaCaptured: (payload: MediaCapturePayload) => void,
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
          const payload: MediaCapturePayload = {
            mediaId: generateMediaId(),
            userId: userId,
            chatPhone: item.chatPhone || 'unknown',
            chatName: null,
            mediaType: item.mediaType,
            mimeType: item.type,
            data: item.data,
            size: item.size,
            duration: item.duration,
            capturedAt: item.timestamp,
            messageSentAt: item.messageSentAt || undefined,
            whatsappMessageId: item.whatsappMessageId || undefined,
            source: item.source
          };

          onMediaCaptured(payload);
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
    onMediaCaptured: (payload: MediaCapturePayload) => void;
    onAuditLog: (payload: AuditLogPayload) => void;
  }
): void {
  setupDownloadBlocking(view, mainWindow, userId, callbacks.onAuditLog);
  injectSecurityScripts(view);
  setupMediaCapture(view, userId, callbacks.onMediaCaptured, callbacks.onAuditLog);
}
