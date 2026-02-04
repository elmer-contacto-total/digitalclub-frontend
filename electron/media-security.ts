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
  source: 'PREVIEW' | 'PLAYBACK';
}

export interface AuditLogPayload {
  action: 'DOWNLOAD_BLOCKED' | 'MEDIA_CAPTURED' | 'BLOCKED_FILE_ATTEMPT';
  userId: string;
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

      window.__hablapeMediaQueue.push({
        data: imageData,
        type: mimeType,
        size: size,
        chatPhone: getCurrentChatPhone(),
        timestamp: new Date().toISOString(),
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
          const target = node.querySelector?.('[data-testid="media-canvas"]') ||
                        node.querySelector?.('img[src^="blob:"]') ||
                        node.querySelector?.('img[src^="data:"]') ||
                        node.querySelector?.('canvas');

          if (target) {
            setTimeout(() => captureImage(target, 'PREVIEW'), 500);
          }

          const galleryImages = node.querySelectorAll?.('img[src^="blob:"]') || [];
          galleryImages.forEach((img, index) => {
            setTimeout(() => captureImage(img, 'PREVIEW'), 500 + (index * 200));
          });
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
        const isOverlay = node.style?.position === 'fixed' ||
                         node.style?.position === 'absolute' ||
                         node.classList?.contains('overlay') ||
                         node.getAttribute?.('role') === 'dialog' ||
                         node.getAttribute?.('aria-modal') === 'true';

        if (isOverlay) {
          const overlayImages = node.querySelectorAll?.('img') || [];
          overlayImages.forEach((img) => {
            const checkSize = () => {
              if (img.naturalWidth > 400 || img.width > 400) {
                captureImage(img, 'PREVIEW');
              }
            };
            if (img.complete) setTimeout(checkSize, 300);
            else img.addEventListener('load', checkSize, { once: true });
          });
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

  // Fallback: click en imágenes
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (target.tagName === 'IMG' && target.src) {
      setTimeout(() => {
        const viewer = document.querySelector('[data-testid="media-viewer"]') ||
                      document.querySelector('[data-testid="image-viewer"]') ||
                      document.querySelector('[data-testid="lightbox"]') ||
                      document.querySelector('[role="dialog"] img') ||
                      document.querySelector('[aria-modal="true"] img');

        if (viewer) {
          const bigImg = viewer.querySelector?.('img[src^="blob:"]') ||
                        viewer.querySelector?.('img[src^="data:"]') ||
                        viewer.querySelector?.('canvas') ||
                        (viewer.tagName === 'IMG' ? viewer : null);
          if (bigImg) captureImage(bigImg, 'PREVIEW');
        }

        const allBigImages = document.querySelectorAll('img');
        allBigImages.forEach((img) => {
          if ((img.naturalWidth > 500 || img.width > 500) &&
              (img.src?.startsWith('blob:') || img.src?.startsWith('data:'))) {
            captureImage(img, 'PREVIEW');
          }
        });
      }, 800);
    }
  }, true);

  // ===== INTERCEPTAR REPRODUCCIÓN DE AUDIO =====
  const originalAudioPlay = HTMLAudioElement.prototype.play;

  HTMLAudioElement.prototype.play = async function() {
    const audioSrc = this.src || this.currentSrc;

    if (audioSrc && audioSrc.startsWith('blob:')) {
      const hash = await simpleHash(audioSrc);
      if (!capturedHashes.has(hash)) {
        capturedHashes.add(hash);

        try {
          const response = await fetch(audioSrc);
          const blob = await response.blob();

          const reader = new FileReader();
          reader.onloadend = () => {
            window.__hablapeMediaQueue.push({
              data: reader.result,
              type: blob.type || 'audio/ogg',
              size: blob.size,
              duration: this.duration || 0,
              chatPhone: getCurrentChatPhone(),
              timestamp: new Date().toISOString(),
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
