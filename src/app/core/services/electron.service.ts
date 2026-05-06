import { Injectable, NgZone, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { ChatSelectedEvent, PhoneDetectedEvent } from '../models/crm-contact.model';

/**
 * State of the bulk send process, pushed from Electron main process
 */
export interface BulkSendState {
  state: 'idle' | 'running' | 'pausing' | 'paused' | 'completed' | 'cancelled' | 'error';
  sentCount: number;
  failedCount: number;
  totalRecipients: number;
  currentPhone: string | null;
  periodicPauseRemaining?: number;
}

/**
 * Bounds data from Electron
 */
interface WhatsAppBounds {
  angularWidth: number;
  whatsappWidth: number;
}

/**
 * Electron API interface exposed via preload script
 */
interface ElectronAPI {
  // Events that Angular listens to
  onChatSelected(callback: (data: ChatSelectedEvent) => void): void;
  onPhoneDetected(callback: (data: PhoneDetectedEvent) => void): void;
  onWhatsAppBoundsChanged(callback: (data: WhatsAppBounds) => void): void;
  onWhatsAppVisibilityChanged(callback: (data: { visible: boolean }) => void): void;
  onWhatsAppSessionChange?(callback: (data: { loggedIn: boolean }) => void): void;
  onAppClosing?(callback: () => void): void;
  removeAllListeners(channel: string): void;

  // Methods that Angular can call
  setSidebarCollapsed?(collapsed: boolean): void;
  setView?(view: string): void;
  sendNotification?(title: string, body: string): void;

  // WhatsApp View control
  showWhatsApp?(): Promise<boolean>;
  hideWhatsApp?(): Promise<boolean>;
  isWhatsAppVisible?(): Promise<boolean>;
  setWhatsAppOverlayMode?(overlayOpen: boolean): Promise<boolean>;

  // User login/logout (for media capture association)
  setLoggedInUser?(userId: number, userName: string, clientId?: number): void;
  onIncomingMessageDetected?(callback: (data: { phone: string }) => void): void;
  onOutgoingMessageDetected?(callback: (data: { phone: string }) => void): void;
  onAuthIncomplete?(callback: (data: { missing: string[]; droppedSignal: string; phone?: string }) => void): void;
  onPhoneExtractionTimeout?(callback: () => void): void;
  onBulkDiagLog?(callback: (data: unknown) => void): void;
  onBulkResumedFromPause?(callback: () => void): void;
  setAuthToken?(token: string): void;
  clearLoggedInUser?(): void;

  // Active client (for media capture association with CRM contact)
  setActiveClient?(data: { clientUserId: number | null; chatPhone: string; chatName: string }): void;
  clearActiveClient?(): void;
  crmClientReady?(): void;

  // Bulk send state changes
  onBulkSendStateChanged?(callback: (data: { state: string; sentCount: number; failedCount: number; totalRecipients: number; currentPhone: string | null; periodicPauseRemaining?: number }) => void): void;

  // Angular bounds
  getAngularBounds?(): Promise<{ angularWidth: number; whatsappVisible: boolean } | null>;

  // Update checker
  onUpdateAvailable?(callback: (info: {
    version: string;
    downloadUrl: string;
    releaseNotes: string | null;
    fileSize: number | null;
    mandatory: boolean;
    publishedAt: string;
  }) => void): void;
  openDownloadUrl?(url: string): Promise<boolean>;
  getAppVersion?(): Promise<string>;
  getPendingUpdate?(): Promise<{ version: string; downloadUrl: string; releaseNotes: string | null; fileSize: number | null; mandatory: boolean; publishedAt: string } | null>;
  downloadAndInstallUpdate?(url: string): Promise<boolean>;
  onUpdateDownloadProgress?(callback: (data: { status: string; percent?: number; error?: string }) => void): void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

/**
 * Electron Service
 * Handles communication between Angular and Electron's main process
 * When running in Electron, WhatsApp Web is displayed in a BrowserView and
 * this service receives events when a chat is selected
 */
@Injectable({
  providedIn: 'root'
})
export class ElectronService {
  private ngZone = inject(NgZone);
  private router = inject(Router);

  // State subjects
  private chatSelectedSubject = new BehaviorSubject<ChatSelectedEvent | null>(null);
  private phoneDetectedSubject = new BehaviorSubject<PhoneDetectedEvent | null>(null);
  private isElectronSubject = new BehaviorSubject<boolean>(false);
  private whatsappVisibleSubject = new BehaviorSubject<boolean>(false);
  private whatsappBoundsSubject = new BehaviorSubject<WhatsAppBounds | null>(null);
  private whatsappSessionSubject = new BehaviorSubject<boolean>(false); // WhatsApp logged in state
  private appClosingSubject = new BehaviorSubject<boolean>(false);
  private crmResetSubject = new Subject<void>(); // CRM reset trigger (Subject — must NOT emit on subscribe)
  private incomingMessageSubject = new Subject<{ phone: string }>();
  private outgoingMessageSubject = new Subject<{ phone: string }>();
  private bulkSendStateSubject = new BehaviorSubject<BulkSendState>({
    state: 'idle', sentCount: 0, failedCount: 0, totalRecipients: 0, currentPhone: null
  });

  // Public observables
  readonly chatSelected$: Observable<ChatSelectedEvent | null> = this.chatSelectedSubject.asObservable();
  readonly phoneDetected$: Observable<PhoneDetectedEvent | null> = this.phoneDetectedSubject.asObservable();
  readonly isElectron$: Observable<boolean> = this.isElectronSubject.asObservable();
  readonly whatsappVisible$: Observable<boolean> = this.whatsappVisibleSubject.asObservable();
  readonly whatsappBounds$: Observable<WhatsAppBounds | null> = this.whatsappBoundsSubject.asObservable();
  readonly whatsappSession$: Observable<boolean> = this.whatsappSessionSubject.asObservable();
  readonly appClosing$: Observable<boolean> = this.appClosingSubject.asObservable();
  readonly crmReset$: Observable<void> = this.crmResetSubject.asObservable();
  readonly incomingMessage$: Observable<{ phone: string }> = this.incomingMessageSubject.asObservable();
  readonly outgoingMessage$: Observable<{ phone: string }> = this.outgoingMessageSubject.asObservable();
  readonly bulkSendState$: Observable<BulkSendState> = this.bulkSendStateSubject.asObservable();

  constructor() {
    this.detectElectron();
    this.setupListeners();
  }

  /**
   * Check if running in Electron environment
   */
  get isElectron(): boolean {
    return this.isElectronSubject.value;
  }

  /**
   * Get current selected chat
   */
  get currentChat(): ChatSelectedEvent | null {
    return this.chatSelectedSubject.value;
  }

  /**
   * Whether a bulk send is currently sending messages (running + NOT in
   * periodic pause). Durante la "Pausa anti-ban" (state==='running' con
   * periodicPauseRemaining > 0) el bulk no envía nada y la WhatsApp
   * BrowserView puede ocultarse si el agente sale del módulo Clientes.
   * Cuando la pausa termine y el bulk vuelva a enviar, el agente puede
   * volver a la página y la BrowserView se vuelve a mostrar.
   */
  get bulkSendActive(): boolean {
    const s = this.bulkSendStateSubject.value;
    return s.state === 'running' && (s.periodicPauseRemaining ?? 0) === 0;
  }

  /**
   * Detect if running in Electron
   */
  private detectElectron(): void {
    // Check for Electron-specific objects
    // We check for electronAPI which is exposed by the preload script
    // We also check for electron in navigator.userAgent as a fallback
    const hasElectronAPI = typeof window !== 'undefined' && !!window.electronAPI;
    const hasElectronUserAgent = typeof navigator !== 'undefined' &&
      navigator.userAgent.toLowerCase().includes('electron');

    const isElectron = hasElectronAPI || hasElectronUserAgent;
    this.isElectronSubject.next(isElectron);

    // Add class to body for CSS targeting (e.g. header padding for titlebar overlay)
    if (isElectron) {
      document.body.classList.add('electron');
    }
  }

  /**
   * Setup event listeners for Electron IPC
   */
  private setupListeners(): void {
    if (!window.electronAPI) {
      return;
    }

    // Listen for chat selection events
    window.electronAPI.onChatSelected((data: ChatSelectedEvent) => {
      this.ngZone.run(() => {
        this.chatSelectedSubject.next(data);
      });
    });

    // Listen for phone detection events
    window.electronAPI.onPhoneDetected((data: PhoneDetectedEvent) => {
      this.ngZone.run(() => {
        this.phoneDetectedSubject.next(data);
      });
    });

    // Listen for WhatsApp visibility changes
    window.electronAPI.onWhatsAppVisibilityChanged((data: { visible: boolean }) => {
      this.ngZone.run(() => {
        this.whatsappVisibleSubject.next(data.visible);
      });
    });

    // Listen for WhatsApp bounds changes
    window.electronAPI.onWhatsAppBoundsChanged((data: WhatsAppBounds) => {
      this.ngZone.run(() => {
        this.whatsappBoundsSubject.next(data);
      });
    });

    // Listen for WhatsApp session changes (login/logout)
    if (window.electronAPI.onWhatsAppSessionChange) {
      window.electronAPI.onWhatsAppSessionChange((data: { loggedIn: boolean }) => {
        this.ngZone.run(() => {
          console.log('[ElectronService] WhatsApp session change:', data.loggedIn ? 'logged in' : 'logged out');
          const wasLoggedIn = this.whatsappSessionSubject.value;
          this.whatsappSessionSubject.next(data.loggedIn);

          // If WhatsApp logged out, trigger CRM reset
          if (wasLoggedIn && !data.loggedIn) {
            console.log('[ElectronService] WhatsApp logged out - triggering CRM reset');
            this.triggerCrmReset();
          }
        });
      });
    }

    // Listen for incoming message detection from Electron
    if (window.electronAPI.onIncomingMessageDetected) {
      window.electronAPI.onIncomingMessageDetected((data: { phone: string }) => {
        this.ngZone.run(() => {
          this.incomingMessageSubject.next(data);
        });
      });
    }

    // Listen for outgoing message detection from Electron
    if (window.electronAPI.onOutgoingMessageDetected) {
      window.electronAPI.onOutgoingMessageDetected((data: { phone: string }) => {
        this.ngZone.run(() => {
          this.outgoingMessageSubject.next(data);
        });
      });
    }

    // Auth incomplete: una señal (incoming/outgoing/etc.) se descartó por
    // falta de credenciales. Lo dejamos visible en consola para que el agente
    // sepa que tiene que reloguearse — antes era fallo silencioso.
    if (window.electronAPI.onAuthIncomplete) {
      window.electronAPI.onAuthIncomplete((data) => {
        this.ngZone.run(() => {
          console.warn(
            '[ElectronService] ⚠️ Señal "' + data.droppedSignal +
            '" descartada — faltan credenciales: ' + data.missing.join(', ') +
            (data.phone ? ' (phone=' + data.phone + ')' : '') +
            '. Vuelve a iniciar sesión.'
          );
        });
      });
    }

    // Phone extraction timeout: el overlay manual expiró sin que el usuario
    // pueda revelar el teléfono. Ya se desbloqueó en Electron.
    if (window.electronAPI.onPhoneExtractionTimeout) {
      window.electronAPI.onPhoneExtractionTimeout(() => {
        this.ngZone.run(() => {
          console.warn('[ElectronService] ⚠️ Timeout (30s) extrayendo teléfono — overlay desbloqueado.');
        });
      });
    }

    // Diagnóstico del bulk sender: cuando el filter de búsqueda no aplica,
    // el main process volcará el estado del DOM. Lo logueamos para que sea
    // visible en DevTools (F12 / Ctrl+Shift+I).
    if (window.electronAPI.onBulkDiagLog) {
      window.electronAPI.onBulkDiagLog((data) => {
        this.ngZone.run(() => {
          console.log('[BulkSender Diag]', data);
        });
      });
    }

    // Bulk reanudó tras pausa anti-ban: si el agente está en otra ruta,
    // redirigirlo a /app/electron_clients para que ElectronClientsComponent
    // se monte de nuevo. Esto restablece el ciclo show/hide de WA cuando
    // se entra/sale del módulo, que de otra forma queda "atrapado" mostrando
    // WA flotante sobre cualquier página hasta que el agente vuelva manual
    // a Clientes (new).
    if (window.electronAPI.onBulkResumedFromPause) {
      window.electronAPI.onBulkResumedFromPause(() => {
        this.ngZone.run(() => {
          const currentUrl = this.router.url;
          if (!currentUrl.startsWith('/app/electron_clients')) {
            console.log('[ElectronService] Pausa anti-ban terminó — redirigiendo a Clientes (new) desde', currentUrl);
            this.router.navigateByUrl('/app/electron_clients');
          }
        });
      });
    }

    // Listen for bulk send state changes
    if (window.electronAPI.onBulkSendStateChanged) {
      window.electronAPI.onBulkSendStateChanged((data) => {
        this.ngZone.run(() => {
          this.bulkSendStateSubject.next(data as BulkSendState);
        });
      });
    }

    // Listen for app closing event
    if (window.electronAPI.onAppClosing) {
      window.electronAPI.onAppClosing(() => {
        this.ngZone.run(() => {
          console.log('[ElectronService] App is closing - saving state');
          this.appClosingSubject.next(true);
          // Note: We do NOT logout here - session is preserved
          // The auth tokens remain in localStorage for next app launch
        });
      });
    }
  }

  /**
   * Set sidebar collapsed state (communicates to Electron)
   */
  setSidebarCollapsed(collapsed: boolean): void {
    if (window.electronAPI?.setSidebarCollapsed) {
      window.electronAPI.setSidebarCollapsed(collapsed);
    }
  }

  /**
   * Set current view (communicates to Electron)
   */
  setView(view: string): void {
    if (window.electronAPI?.setView) {
      window.electronAPI.setView(view);
    }
  }

  /**
   * Send desktop notification via Electron
   */
  sendNotification(title: string, body: string): void {
    if (window.electronAPI?.sendNotification) {
      window.electronAPI.sendNotification(title, body);
    }
  }

  /**
   * Clear current chat selection
   */
  clearChat(): void {
    this.chatSelectedSubject.next(null);
  }

  /**
   * Trigger CRM reset (clears all CRM state)
   * Called when WhatsApp logs out or user logs out of Angular
   */
  triggerCrmReset(): void {
    console.log('[ElectronService] Triggering CRM reset');
    this.chatSelectedSubject.next(null);
    this.crmResetSubject.next();
  }

  /**
   * Get WhatsApp session state
   */
  get whatsappLoggedIn(): boolean {
    return this.whatsappSessionSubject.value;
  }

  /**
   * Show WhatsApp Web view (call when entering Clientes module)
   * @returns Promise resolving to true if WhatsApp was shown successfully
   */
  async showWhatsApp(): Promise<boolean> {
    if (window.electronAPI?.showWhatsApp) {
      try {
        return await window.electronAPI.showWhatsApp();
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Hide WhatsApp Web view (call when leaving Clientes module)
   * @returns Promise resolving to true if WhatsApp was hidden successfully
   */
  async hideWhatsApp(): Promise<boolean> {
    if (window.electronAPI?.hideWhatsApp) {
      try {
        return await window.electronAPI.hideWhatsApp();
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Check if WhatsApp Web view is currently visible
   * @returns Promise resolving to visibility state
   */
  async isWhatsAppVisible(): Promise<boolean> {
    if (window.electronAPI?.isWhatsAppVisible) {
      try {
        return await window.electronAPI.isWhatsAppVisible();
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Get current WhatsApp visibility state (synchronous)
   */
  get whatsappVisible(): boolean {
    return this.whatsappVisibleSubject.value;
  }

  /**
   * Get current angular bounds (synchronous)
   */
  get currentBounds(): WhatsAppBounds | null {
    return this.whatsappBoundsSubject.value;
  }

  /**
   * Get Angular bounds from Electron
   */
  async getAngularBounds(): Promise<{ angularWidth: number; whatsappVisible: boolean } | null> {
    if (window.electronAPI?.getAngularBounds) {
      try {
        return await window.electronAPI.getAngularBounds();
      } catch (error) {
        console.error('[ElectronService] Error getting Angular bounds:', error);
        return null;
      }
    }
    return null;
  }

  /**
   * Check if app is currently closing
   */
  get isAppClosing(): boolean {
    return this.appClosingSubject.value;
  }

  /**
   * Set overlay mode - temporarily hides WhatsApp when menus/modals are open
   * This prevents WhatsApp BrowserView from covering Angular overlays
   * @param overlayOpen true to hide WhatsApp, false to restore it
   */
  async setWhatsAppOverlayMode(overlayOpen: boolean): Promise<boolean> {
    if (window.electronAPI?.setWhatsAppOverlayMode) {
      try {
        return await window.electronAPI.setWhatsAppOverlayMode(overlayOpen);
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Notify Electron of the logged-in user (for media capture association)
   * Should be called after successful login
   */
  setLoggedInUser(userId: number, userName: string, clientId?: number): void {
    if (window.electronAPI?.setLoggedInUser) {
      window.electronAPI.setLoggedInUser(userId, userName, clientId);
    }
  }

  /**
   * Send auth token to Electron for media API calls
   */
  setAuthToken(token: string): void {
    if (window.electronAPI?.setAuthToken) {
      window.electronAPI.setAuthToken(token);
    }
  }

  /**
   * Clear logged-in user info in Electron (for logout)
   */
  clearLoggedInUser(): void {
    if (window.electronAPI?.clearLoggedInUser) {
      window.electronAPI.clearLoggedInUser();
    }
  }

  /**
   * Set active client info in Electron (for media capture association)
   * Should be called when a contact is found/selected in the CRM panel
   */
  setActiveClient(clientUserId: number | null, chatPhone: string, chatName: string): void {
    if ((window as any).electronAPI?.setActiveClient) {
      // Normalizar a 9 dígitos (formato consistente con backend y con
      // el script inyectado en WA). Si el caller pasa "+51 999 111 222",
      // backend recibe "999111222". Si pasa "999111222", queda igual.
      const normalizedPhone = (chatPhone || '').replace(/\D/g, '').slice(-9);
      (window as any).electronAPI.setActiveClient({
        clientUserId,
        chatPhone: normalizedPhone || chatPhone, // fallback si no quedan dígitos
        chatName
      });
    }
  }

  /**
   * Clear active client info in Electron
   */
  clearActiveClient(): void {
    if ((window as any).electronAPI?.clearActiveClient) {
      (window as any).electronAPI.clearActiveClient();
    }
  }

  /**
   * Notify Electron that CRM finished processing a chat
   * @param phone - The phone number that was processed (for verification)
   *
   * Electron will only unblock the chat if this phone matches
   * the one it's waiting for (prevents race conditions)
   */
  notifyCrmClientReady(phone: string): void {
    if ((window as any).electronAPI?.crmClientReady) {
      (window as any).electronAPI.crmClientReady(phone);
      console.log('[ElectronService] CRM ready notified for:', phone || '(no phone)');
    }
  }

  // === Bulk Send ===

  /**
   * Start bulk send campaign via Electron
   */
  async startBulkSend(bulkSendId: number, authToken: string): Promise<boolean> {
    if ((window as any).electronAPI?.bulkSend?.start) {
      try {
        const result = await (window as any).electronAPI.bulkSend.start(bulkSendId, authToken);
        return result.success;
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Pause bulk send campaign
   */
  async pauseBulkSend(): Promise<boolean> {
    if ((window as any).electronAPI?.bulkSend?.pause) {
      const result = await (window as any).electronAPI.bulkSend.pause();
      return result.success;
    }
    return false;
  }

  /**
   * Resume bulk send campaign
   */
  async resumeBulkSend(): Promise<boolean> {
    if ((window as any).electronAPI?.bulkSend?.resume) {
      const result = await (window as any).electronAPI.bulkSend.resume();
      return result.success;
    }
    return false;
  }

  /**
   * Cancel bulk send campaign
   */
  async cancelBulkSend(): Promise<boolean> {
    if ((window as any).electronAPI?.bulkSend?.cancel) {
      const result = await (window as any).electronAPI.bulkSend.cancel();
      return result.success;
    }
    return false;
  }

  /**
   * Get bulk send status
   */
  async getBulkSendStatus(): Promise<{ campaignId: number | null; state: string; sentCount: number; failedCount: number; currentPhone: string | null; lastError: string | null } | null> {
    if ((window as any).electronAPI?.bulkSend?.getStatus) {
      return await (window as any).electronAPI.bulkSend.getStatus();
    }
    return null;
  }

  /**
   * Check for pending bulk send from previous session (persisted state)
   */
  async checkPendingBulkSend(): Promise<any> {
    if ((window as any).electronAPI?.bulkSend?.checkPending) {
      return await (window as any).electronAPI.bulkSend.checkPending();
    }
    return null;
  }

  /**
   * Dismiss the WhatsApp BrowserView overlay (used when closing the Angular overlay while paused)
   */
  async dismissBulkSendOverlay(): Promise<boolean> {
    if ((window as any).electronAPI?.bulkSend?.dismissOverlay) {
      const result = await (window as any).electronAPI.bulkSend.dismissOverlay();
      return result.success;
    }
    return false;
  }

  /**
   * Cleanup listeners on service destroy
   */
  destroy(): void {
    if (window.electronAPI?.removeAllListeners) {
      window.electronAPI.removeAllListeners('chat-selected');
      window.electronAPI.removeAllListeners('phone-detected');
      window.electronAPI.removeAllListeners('whatsapp-visibility-changed');
      window.electronAPI.removeAllListeners('whatsapp-bounds-changed');
      window.electronAPI.removeAllListeners('app-closing');
      window.electronAPI.removeAllListeners('bulk-send-state-changed');
    }
  }
}
