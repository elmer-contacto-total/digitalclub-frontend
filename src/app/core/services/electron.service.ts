import { Injectable, NgZone, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ChatSelectedEvent, PhoneDetectedEvent } from '../models/crm-contact.model';

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

  // Angular bounds
  getAngularBounds?(): Promise<{ angularWidth: number; whatsappVisible: boolean } | null>;
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

  // State subjects
  private chatSelectedSubject = new BehaviorSubject<ChatSelectedEvent | null>(null);
  private phoneDetectedSubject = new BehaviorSubject<PhoneDetectedEvent | null>(null);
  private isElectronSubject = new BehaviorSubject<boolean>(false);
  private whatsappVisibleSubject = new BehaviorSubject<boolean>(false);
  private whatsappBoundsSubject = new BehaviorSubject<WhatsAppBounds | null>(null);
  private appClosingSubject = new BehaviorSubject<boolean>(false);

  // Public observables
  readonly chatSelected$: Observable<ChatSelectedEvent | null> = this.chatSelectedSubject.asObservable();
  readonly phoneDetected$: Observable<PhoneDetectedEvent | null> = this.phoneDetectedSubject.asObservable();
  readonly isElectron$: Observable<boolean> = this.isElectronSubject.asObservable();
  readonly whatsappVisible$: Observable<boolean> = this.whatsappVisibleSubject.asObservable();
  readonly whatsappBounds$: Observable<WhatsAppBounds | null> = this.whatsappBoundsSubject.asObservable();
  readonly appClosing$: Observable<boolean> = this.appClosingSubject.asObservable();

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
   * Cleanup listeners on service destroy
   */
  destroy(): void {
    if (window.electronAPI?.removeAllListeners) {
      window.electronAPI.removeAllListeners('chat-selected');
      window.electronAPI.removeAllListeners('phone-detected');
      window.electronAPI.removeAllListeners('whatsapp-visibility-changed');
      window.electronAPI.removeAllListeners('whatsapp-bounds-changed');
      window.electronAPI.removeAllListeners('app-closing');
    }
  }
}
