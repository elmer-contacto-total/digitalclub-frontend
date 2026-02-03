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

  // Limpiar listeners
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
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
      removeAllListeners: (channel: string) => void;
    };
  }
}
