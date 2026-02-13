import { ipcRenderer } from 'electron';

// Interfaz para mensajes escaneados
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

// Interfaces para eventos de seguridad de medios
interface DownloadBlockedEvent {
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  timestamp: string;
}

interface MediaCapturedEvent {
  mediaType: 'IMAGE' | 'AUDIO';
  mimeType: string;
  size: number;
  chatPhone: string;
  timestamp: string;
}

// Update available event from main process
interface UpdateAvailableInfo {
  version: string;
  downloadUrl: string;
  releaseNotes: string | null;
  fileSize: number | null;
  mandatory: boolean;
  publishedAt: string;
}

// API expuesta al renderer (sin contextBridge para contextIsolation: false)
const electronAPI = {
  // === Controles de ventana ===
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  windowIsMaximized: (): Promise<boolean> => ipcRenderer.invoke('window-is-maximized'),

  // Eventos de teléfono detectado
  onPhoneDetected: (callback: (data: { phone: string; original: string }) => void) => {
    ipcRenderer.on('phone-detected', (_, data) => callback(data));
  },

  // Eventos de teléfono capturado manualmente
  onPhoneCaptured: (callback: (data: { phone: string; original: string }) => void) => {
    ipcRenderer.on('phone-captured', (_, data) => callback(data));
  },

  // Evento de chat seleccionado (teléfono o nombre)
  onChatSelected: (callback: (data: { phone: string | null; name: string | null; isPhone: boolean }) => void) => {
    ipcRenderer.on('chat-selected', (_, data) => callback(data));
  },

  // Toggle panel CRM
  onToggleCrmPanel: (callback: () => void) => {
    ipcRenderer.on('toggle-crm-panel', () => callback());
  },

  // ===== EVENTOS DE SEGURIDAD DE MEDIOS =====

  // Evento cuando se bloquea una descarga
  onDownloadBlocked: (callback: (data: DownloadBlockedEvent) => void) => {
    ipcRenderer.on('download-blocked', (_, data) => callback(data));
  },

  // Evento cuando se captura un medio (para notificaciones)
  onMediaCaptured: (callback: (data: MediaCapturedEvent) => void) => {
    ipcRenderer.on('media-captured', (_, data) => callback(data));
  },

  // Obtener estado de WhatsApp
  getWhatsAppStatus: (): Promise<{ connected: boolean; url?: string }> => {
    return ipcRenderer.invoke('get-whatsapp-status');
  },

  // Notificar cambio de sidebar
  toggleSidebar: () => {
    ipcRenderer.send('toggle-sidebar');
  },

  // Notificar sidebar collapsed/expanded
  setSidebarCollapsed: (collapsed: boolean) => {
    ipcRenderer.send('sidebar-toggle', collapsed);
  },

  // Notificar CRM panel collapsed/expanded
  setCrmPanelCollapsed: (collapsed: boolean) => {
    ipcRenderer.send('crm-panel-toggle', collapsed);
  },

  // Actualizar layout
  updateLayout: (data: { sidebarCollapsed?: boolean; crmPanelCollapsed?: boolean }) => {
    ipcRenderer.send('update-layout', data);
  },

  // Cambiar vista activa (mostrar/ocultar WhatsApp)
  setView: (view: string) => {
    ipcRenderer.send('set-view', view);
  },

  // === Control de WhatsApp View ===
  // Mostrar WhatsApp Web view (solo cuando está en Clientes)
  showWhatsApp: (): Promise<boolean> => {
    return ipcRenderer.invoke('show-whatsapp');
  },

  // Ocultar WhatsApp Web view (cuando sale de Clientes)
  hideWhatsApp: (): Promise<boolean> => {
    return ipcRenderer.invoke('hide-whatsapp');
  },

  // Obtener estado de visibilidad de WhatsApp
  isWhatsAppVisible: (): Promise<boolean> => {
    return ipcRenderer.invoke('get-whatsapp-visible');
  },

  // Escanear mensajes del chat actual
  scanMessages: (telefono: string): Promise<ScannedMessage[]> => {
    return ipcRenderer.invoke('scan-messages', telefono);
  },

  // Escanear solo nuevos mensajes
  scanNewMessages: (telefono: string): Promise<ScannedMessage[]> => {
    return ipcRenderer.invoke('scan-new-messages', telefono);
  },

  // Obtener bounds disponibles para Angular
  getAngularBounds: (): Promise<{ angularWidth: number; whatsappVisible: boolean } | null> => {
    return ipcRenderer.invoke('get-angular-bounds');
  },

  // Evento cuando cambian los bounds de WhatsApp
  onWhatsAppBoundsChanged: (callback: (data: { angularWidth: number; whatsappWidth: number }) => void) => {
    ipcRenderer.on('whatsapp-bounds-changed', (_, data) => callback(data));
  },

  // Evento cuando cambia la visibilidad de WhatsApp
  onWhatsAppVisibilityChanged: (callback: (data: { visible: boolean }) => void) => {
    ipcRenderer.on('whatsapp-visibility-changed', (_, data) => callback(data));
  },

  // Evento cuando la app se está cerrando
  onAppClosing: (callback: () => void) => {
    ipcRenderer.on('app-closing', () => callback());
  },

  // Evento cuando cambia la sesión de WhatsApp (login/logout)
  onWhatsAppSessionChange: (callback: (data: { loggedIn: boolean }) => void) => {
    ipcRenderer.on('whatsapp-session-change', (_, data) => callback(data));
  },

  // Evento cuando se detecta un mensaje entrante del cliente
  onIncomingMessageDetected: (callback: (data: { phone: string }) => void) => {
    ipcRenderer.on('incoming-message-detected', (_, data) => callback(data));
  },

  // Evento cuando se detecta un mensaje saliente del agente
  onOutgoingMessageDetected: (callback: (data: { phone: string }) => void) => {
    ipcRenderer.on('outgoing-message-detected', (_, data) => callback(data));
  },

  // Notificar a Electron el usuario logueado
  setLoggedInUser: (userId: number, userName: string, clientId?: number) => {
    ipcRenderer.send('set-logged-in-user', { userId, userName, clientId });
  },

  // Actualizar token de autenticación (para API calls de media)
  setAuthToken: (token: string) => {
    ipcRenderer.send('set-auth-token', token);
  },

  // Limpiar usuario al hacer logout
  clearLoggedInUser: () => {
    ipcRenderer.send('clear-logged-in-user');
  },

  // Notificar a Electron del cliente activo (para asociar medios)
  setActiveClient: (data: { clientUserId: number | null; chatPhone: string; chatName: string }) => {
    ipcRenderer.send('set-active-client', data);
  },

  // Limpiar cliente activo
  clearActiveClient: () => {
    ipcRenderer.send('clear-active-client');
  },

  // Notificar que el CRM terminó de procesar (desbloquea el chat)
  // @param phone - El teléfono que se procesó (para verificar que coincide)
  crmClientReady: (phone: string) => {
    ipcRenderer.send('crm-client-ready', { phone });
  },

  // Restablecimiento completo - limpia todos los datos y reinicia
  fullReset: (): Promise<boolean> => {
    return ipcRenderer.invoke('full-reset');
  },

  // Enviar mensaje a WhatsApp Web (para canned messages / respuestas rápidas)
  sendWhatsAppMessage: (text: string): Promise<boolean> => {
    return ipcRenderer.invoke('whatsapp:send-message', text);
  },

  // Enviar mensaje Y presionar Enter (para envío masivo)
  sendAndSubmitMessage: (text: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('whatsapp:send-and-submit', text);
  },

  // Navegar a un chat por número de teléfono
  navigateToChat: (phone: string): Promise<{ success: boolean; chatName?: string; error?: string }> => {
    return ipcRenderer.invoke('whatsapp:navigate-to-chat', phone);
  },

  // === Bulk Send ===
  bulkSend: {
    start: (bulkSendId: number, authToken: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke('bulk-send:start', bulkSendId, authToken);
    },
    pause: (): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('bulk-send:pause');
    },
    resume: (): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('bulk-send:resume');
    },
    cancel: (): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('bulk-send:cancel');
    },
    getStatus: (): Promise<{ bulkSendId: number | null; state: string; sentCount: number; failedCount: number; totalRecipients: number; currentPhone: string | null; lastError: string | null }> => {
      return ipcRenderer.invoke('bulk-send:status');
    }
  },

  // Bulk send state changes (from main process)
  onBulkSendStateChanged: (callback: (data: { state: string; sentCount: number; failedCount: number; totalRecipients: number; currentPhone: string | null }) => void) => {
    ipcRenderer.on('bulk-send-state-changed', (_, data) => callback(data));
  },

  // Modo overlay: ocultar/mostrar WhatsApp cuando hay menús abiertos
  setWhatsAppOverlayMode: (overlayOpen: boolean): Promise<boolean> => {
    return ipcRenderer.invoke('whatsapp:set-overlay-mode', overlayOpen);
  },

  // Limpiar listeners
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },

  // Enviar número extraído del panel de contacto (usado por media-security.ts)
  sendExtractedPhone: (phone: string) => {
    ipcRenderer.send('phone-extracted-from-panel', { phone });
  },

  // === Update Checker ===
  // Listen for update available notifications from main process
  onUpdateAvailable: (callback: (info: UpdateAvailableInfo) => void) => {
    ipcRenderer.on('update-available', (_, info) => callback(info));
  },

  // Open download URL in browser
  openDownloadUrl: (url: string): Promise<boolean> => {
    return ipcRenderer.invoke('open-download-url', url);
  },

  // Get current app version
  getAppVersion: (): Promise<string> => {
    return ipcRenderer.invoke('get-app-version');
  },

  // Get pending update info (pull model - for when renderer missed the push)
  getPendingUpdate: (): Promise<UpdateAvailableInfo | null> => {
    return ipcRenderer.invoke('get-pending-update');
  },

  // Download and install update automatically
  downloadAndInstallUpdate: (url: string): Promise<boolean> => {
    return ipcRenderer.invoke('download-and-install-update', url);
  },

  // Listen for download progress events
  onUpdateDownloadProgress: (callback: (data: { status: string; percent?: number; error?: string }) => void) => {
    ipcRenderer.on('update-download-progress', (_, data) => callback(data));
  }
};

// Exponer directamente en window (sin contextBridge porque contextIsolation está deshabilitado)
(window as any).electronAPI = electronAPI;

// Tipos para TypeScript
declare global {
  interface Window {
    electronAPI: {
      // Controles de ventana
      windowMinimize: () => void;
      windowMaximize: () => void;
      windowClose: () => void;
      windowIsMaximized: () => Promise<boolean>;
      // Eventos
      onPhoneDetected: (callback: (data: { phone: string; original: string }) => void) => void;
      onPhoneCaptured: (callback: (data: { phone: string; original: string }) => void) => void;
      onChatSelected: (callback: (data: { phone: string | null; name: string | null; isPhone: boolean }) => void) => void;
      onToggleCrmPanel: (callback: () => void) => void;
      // Eventos de seguridad de medios
      onDownloadBlocked: (callback: (data: { filename: string; mimeType: string; size: number; url: string; timestamp: string }) => void) => void;
      onMediaCaptured: (callback: (data: { mediaType: 'IMAGE' | 'AUDIO'; mimeType: string; size: number; chatPhone: string; timestamp: string }) => void) => void;
      getWhatsAppStatus: () => Promise<{ connected: boolean; url?: string }>;
      toggleSidebar: () => void;
      setSidebarCollapsed: (collapsed: boolean) => void;
      setCrmPanelCollapsed: (collapsed: boolean) => void;
      updateLayout: (data: { sidebarCollapsed?: boolean; crmPanelCollapsed?: boolean }) => void;
      setView: (view: string) => void;
      // Control de WhatsApp View
      showWhatsApp: () => Promise<boolean>;
      hideWhatsApp: () => Promise<boolean>;
      isWhatsAppVisible: () => Promise<boolean>;
      scanMessages: (telefono: string) => Promise<ScannedMessage[]>;
      scanNewMessages: (telefono: string) => Promise<ScannedMessage[]>;
      // Bounds de Angular
      getAngularBounds: () => Promise<{ angularWidth: number; whatsappVisible: boolean } | null>;
      onWhatsAppBoundsChanged: (callback: (data: { angularWidth: number; whatsappWidth: number }) => void) => void;
      onWhatsAppVisibilityChanged: (callback: (data: { visible: boolean }) => void) => void;
      onAppClosing: (callback: () => void) => void;
      onWhatsAppSessionChange: (callback: (data: { loggedIn: boolean }) => void) => void;
      fullReset: () => Promise<boolean>;
      sendWhatsAppMessage: (text: string) => Promise<boolean>;
      sendAndSubmitMessage: (text: string) => Promise<{ success: boolean; error?: string }>;
      navigateToChat: (phone: string) => Promise<{ success: boolean; chatName?: string; error?: string }>;
      bulkSend: {
        start: (bulkSendId: number, authToken: string) => Promise<{ success: boolean; error?: string }>;
        pause: () => Promise<{ success: boolean }>;
        resume: () => Promise<{ success: boolean }>;
        cancel: () => Promise<{ success: boolean }>;
        getStatus: () => Promise<{ bulkSendId: number | null; state: string; sentCount: number; failedCount: number; totalRecipients: number; currentPhone: string | null; lastError: string | null }>;
      };
      onBulkSendStateChanged: (callback: (data: { state: string; sentCount: number; failedCount: number; totalRecipients: number; currentPhone: string | null }) => void) => void;
      setWhatsAppOverlayMode: (overlayOpen: boolean) => Promise<boolean>;
      setLoggedInUser: (userId: number, userName: string, clientId?: number) => void;
      onIncomingMessageDetected?: (callback: (data: { phone: string }) => void) => void;
      onOutgoingMessageDetected?: (callback: (data: { phone: string }) => void) => void;
      setAuthToken: (token: string) => void;
      clearLoggedInUser: () => void;
      setActiveClient: (data: { clientUserId: number | null; chatPhone: string; chatName: string }) => void;
      clearActiveClient: () => void;
      crmClientReady: (phone: string) => void;
      removeAllListeners: (channel: string) => void;
      // Update Checker
      onUpdateAvailable: (callback: (info: { version: string; downloadUrl: string; releaseNotes: string | null; fileSize: number | null; mandatory: boolean; publishedAt: string }) => void) => void;
      openDownloadUrl: (url: string) => Promise<boolean>;
      getAppVersion: () => Promise<string>;
      getPendingUpdate: () => Promise<{ version: string; downloadUrl: string; releaseNotes: string | null; fileSize: number | null; mandatory: boolean; publishedAt: string } | null>;
      downloadAndInstallUpdate: (url: string) => Promise<boolean>;
      onUpdateDownloadProgress: (callback: (data: { status: string; percent?: number; error?: string }) => void) => void;
    };
  }
}
