/**
 * Electron Clients Component
 * CRM Panel that displays alongside WhatsApp Web in Electron
 * Shows contact information when a chat is selected in WhatsApp
 *
 * Layout: Single column (full width) since WhatsApp Web is in a separate Electron BrowserView
 */
import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, switchMap, of } from 'rxjs';
import { ElectronService } from '../../core/services/electron.service';
import { ElectronContactsService } from './services/electron-contacts.service';
import { WebSocketService, WsNewMessagePayload } from '../../core/services/websocket.service';
import { MessageDirection } from '../../core/models/message.model';
import {
  CrmContact,
  LocalContact,
  PersonalLabel,
  PERSONAL_LABELS,
  PhoneUtils,
  getContactInitials,
  getLabelConfig,
  ChatSelectedEvent,
  UserActionHistory
} from '../../core/models/crm-contact.model';
import { TicketCloseType } from '../../core/models/ticket.model';
import { CannedMessageService, CannedMessage } from '../../core/services/canned-message.service';

type ViewState = 'empty' | 'loading' | 'contact';

@Component({
  selector: 'app-electron-clients',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './electron-clients.component.html',
  styleUrl: './electron-clients.component.scss'
})
export class ElectronClientsComponent implements OnInit, OnDestroy {
  private electronService = inject(ElectronService);
  private contactsService = inject(ElectronContactsService);
  private cannedMessageService = inject(CannedMessageService);
  private wsService = inject(WebSocketService);
  private destroy$ = new Subject<void>();

  // State
  viewState = signal<ViewState>('empty');
  currentPhone = signal<string | null>(null);
  currentName = signal<string | null>(null);
  contact = signal<CrmContact | null>(null);
  isElectron = signal(false);

  // Form fields
  selectedLabel = signal<PersonalLabel | undefined>(undefined);
  notesField = signal('');
  isSavingNotes = signal(false);

  // Ticket state
  isClosingTicket = signal(false);
  showTicketConfirmation = signal<TicketCloseType | null>(null);

  // Close types (dynamic per organization, from client_settings)
  closeTypes = computed(() => this.contactsService.closeTypes());

  // Canned messages state
  showCannedMessages = signal(false);
  cannedMessages = signal<CannedMessage[]>([]);
  loadingCannedMessages = signal(false);

  // Action history state
  actionHistory = signal<UserActionHistory[]>([]);
  loadingHistory = signal(false);
  showHistoryPanel = signal(false);

  // Require response state (last message was from client → disable close buttons)
  requiresResponse = signal(false);
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  // Label options
  readonly labelOptions = PERSONAL_LABELS;

  // Computed
  isRegistered = computed(() => this.contact()?.type === 'registered');
  isLocal = computed(() => this.contact()?.type === 'local');
  displayName = computed(() => {
    const c = this.contact();
    if (c) return c.name;
    return this.currentName() || this.formatPhone(this.currentPhone());
  });
  displayPhone = computed(() => this.formatPhone(this.currentPhone()));
  initials = computed(() => getContactInitials(this.displayName()));
  currentLabelConfig = computed(() => getLabelConfig(this.selectedLabel()));
  canCloseTicket = computed(() => this.hasOpenTicket() && !this.requiresResponse());

  ngOnInit(): void {
    // Check if running in Electron
    this.isElectron.set(this.electronService.isElectron);

    // Show WhatsApp Web view when entering this module
    if (this.electronService.isElectron) {
      this.electronService.showWhatsApp();
    }

    // Connect to WebSocket (so the agent has a session for real-time notifications)
    this.wsService.connect();

    // Listen for CRM reset events (logout, WhatsApp logout, etc.)
    this.electronService.crmReset$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(() => {
      console.log('[CRM] Reset triggered - clearing all state');
      this.fullReset();
    });

    // Listen for WebSocket messages to detect incoming/outgoing and ticket reopening
    this.wsService.messages$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(payload => {
      this.handleWsMessage(payload);
    });

    // Listen for incoming messages detected by Electron (immediate UI update)
    this.electronService.incomingMessage$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(data => {
      const currentPhone = this.currentPhone();
      if (currentPhone && PhoneUtils.normalize(currentPhone) === PhoneUtils.normalize(data.phone)) {
        this.requiresResponse.set(true);
        if (!this.hasOpenTicket()) {
          this.refreshContactAfterDelay();
        }
      }
    });

    // Listen for outgoing messages detected by Electron (agent responded → enable close buttons)
    this.electronService.outgoingMessage$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(data => {
      const currentPhone = this.currentPhone();
      if (currentPhone && PhoneUtils.normalize(currentPhone) === PhoneUtils.normalize(data.phone)) {
        this.requiresResponse.set(false);
      }
    });

    // Listen for chat selection from Electron
    // FLUJO ROBUSTO:
    // 1. Electron bloquea el chat y envía el teléfono esperado
    // 2. Angular procesa (busca cliente, etc.)
    // 3. Angular SIEMPRE notifica al terminar con el teléfono procesado
    // 4. Electron solo desbloquea si el teléfono coincide
    this.electronService.chatSelected$.pipe(
      takeUntil(this.destroy$),
      switchMap((event: ChatSelectedEvent | null) => {
        if (!event) {
          this.resetState();
          return of({ event: null, result: null });
        }

        this.currentName.set(event.name);

        // Sin teléfono = estado vacío, limpiar todo
        if (!event.phone) {
          this.currentPhone.set(null);
          this.contact.set(null);
          this.selectedLabel.set(undefined);
          this.notesField.set('');
          this.viewState.set('empty');
          return of({ event, result: null });
        }

        this.viewState.set('loading');
        this.currentPhone.set(event.phone);
        return this.contactsService.searchByPhone(event.phone).pipe(
          switchMap(result => of({ event, result }))
        );
      })
    ).subscribe(({ event, result }) => {
      // Determinar el teléfono que procesamos
      const processedPhone = event?.phone || '';

      if (result) {
        this.contact.set(result);
        this.viewState.set('contact');

        // Initialize form fields
        if (result.type === 'local' && result.local) {
          this.selectedLabel.set(result.local.label);
          this.notesField.set(result.local.notes || '');
        } else if (result.type === 'registered' && result.registered) {
          this.notesField.set(result.registered.issueNotes || '');
          this.selectedLabel.set(undefined);
          this.requiresResponse.set(result.registered.requireResponse === true);
        }

        // Notificar a Electron del cliente activo (para captura de medios)
        this.notifyElectronOfActiveClient(result);

        // Auto-load action history for registered contacts
        if (result.type === 'registered' && result.registered?.id) {
          this.loadActionHistoryAuto(result.registered.id);
        }
      } else if (processedPhone) {
        // No contact found in backend, but we have a phone - show local contact state
        this.contact.set(null);
        this.viewState.set('contact');
        this.selectedLabel.set(undefined);
        this.notesField.set('');

        // Notificar a Electron con solo el teléfono (sin clientUserId)
        this.electronService.setActiveClient(
          null,
          processedPhone,
          this.currentName() || ''
        );
      } else {
        // No phone - show empty state and clear all contact data
        this.contact.set(null);
        this.viewState.set('empty');
        this.selectedLabel.set(undefined);
        this.notesField.set('');
        this.electronService.clearActiveClient();
      }

      // SIEMPRE notificar al terminar de procesar (con el teléfono que procesamos)
      // Electron verificará si coincide con el chat que está esperando
      this.electronService.notifyCrmClientReady(processedPhone);
    });
  }

  ngOnDestroy(): void {
    // Hide WhatsApp Web view when leaving this module (but not during bulk send)
    if (this.electronService.isElectron && !this.electronService.bulkSendActive) {
      this.electronService.hideWhatsApp();
    }

    this.cancelRefreshTimer();
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Format phone number for display
   */
  formatPhone(phone: string | null): string {
    if (!phone) return '';
    return PhoneUtils.formatDisplay(phone);
  }

  /**
   * Handle label selection change
   */
  onLabelChange(labelValue: string): void {
    const label = labelValue as PersonalLabel || undefined;
    this.selectedLabel.set(label);

    const phone = this.currentPhone();
    if (phone) {
      // Save to local storage
      this.contactsService.saveLocalContact(phone, {
        name: this.currentName() || undefined,
        label
      });

      // Update local contact in state if applicable
      const current = this.contact();
      if (!current || current.type === 'local') {
        const local = this.contactsService.getLocalContact(phone);
        if (local) {
          this.contact.set({
            type: 'local',
            phone,
            name: local.name || phone,
            local
          });
        }
      }
    }
  }

  /**
   * Save notes (local or to backend)
   */
  saveNotes(): void {
    const phone = this.currentPhone();
    const notes = this.notesField();
    const c = this.contact();

    if (!phone) return;

    this.isSavingNotes.set(true);

    if (c?.type === 'registered' && c.registered) {
      // Save to backend
      this.contactsService.updateIssueNotes(c.registered.id, notes).subscribe({
        next: () => {
          this.isSavingNotes.set(false);
          // Update local state
          if (c.registered) {
            c.registered.issueNotes = notes;
          }
        },
        error: (err) => {
          console.error('Error saving notes:', err);
          this.isSavingNotes.set(false);
        }
      });
    } else {
      // Save to local storage
      this.contactsService.saveLocalContact(phone, { notes });
      this.isSavingNotes.set(false);

      // Update local contact in state
      const local = this.contactsService.getLocalContact(phone);
      if (local) {
        this.contact.set({
          type: 'local',
          phone,
          name: local.name || phone,
          local
        });
      }
    }
  }

  /**
   * Notify Electron of the active client for media capture association
   */
  private notifyElectronOfActiveClient(contact: CrmContact): void {
    if (!this.electronService.isElectron) return;

    const phone = contact.phone || this.currentPhone() || '';
    const name = contact.name || this.currentName() || '';

    if (contact.type === 'registered' && contact.registered) {
      // Registered contact - pass the client user ID
      this.electronService.setActiveClient(
        contact.registered.id,
        phone,
        name
      );
      console.log('[CRM] Active client set:', contact.registered.id, phone, name);
    } else {
      // Local contact - no client user ID
      this.electronService.setActiveClient(null, phone, name);
      console.log('[CRM] Active client set (local):', phone, name);
    }
  }

  /**
   * Reset component state (partial - keeps some UI state)
   */
  private resetState(): void {
    this.viewState.set('empty');
    this.currentPhone.set(null);
    this.currentName.set(null);
    this.contact.set(null);
    this.selectedLabel.set(undefined);
    this.notesField.set('');
    this.requiresResponse.set(false);
    this.cancelRefreshTimer();

    // Clear active client in Electron
    this.electronService.clearActiveClient();
  }

  /**
   * Full reset - clears ALL state including history and UI
   * Used when logging out or WhatsApp session ends
   */
  private fullReset(): void {
    // Reset basic state
    this.viewState.set('empty');
    this.currentPhone.set(null);
    this.currentName.set(null);
    this.contact.set(null);
    this.selectedLabel.set(undefined);
    this.notesField.set('');
    this.isSavingNotes.set(false);

    // Reset ticket state
    this.isClosingTicket.set(false);
    this.showTicketConfirmation.set(null);
    this.requiresResponse.set(false);
    this.cancelRefreshTimer();

    // Reset canned messages
    this.showCannedMessages.set(false);
    this.cannedMessages.set([]);
    this.loadingCannedMessages.set(false);

    // Reset action history
    this.actionHistory.set([]);
    this.loadingHistory.set(false);
    this.showHistoryPanel.set(false);

    // Clear active client in Electron
    this.electronService.clearActiveClient();

    console.log('[CRM] Full reset completed - all state cleared');
  }

  /**
   * Get avatar URL or null
   */
  getAvatarUrl(): string | null {
    const c = this.contact();
    if (c?.type === 'registered' && c.registered?.avatarUrl) {
      return c.registered.avatarUrl;
    }
    return null;
  }

  /**
   * Get manager name if available
   */
  getManagerName(): string | null {
    const c = this.contact();
    if (c?.type === 'registered' && c.registered?.managerName) {
      return c.registered.managerName;
    }
    return null;
  }

  /**
   * Get codigo if available
   */
  getCodigo(): string | null {
    const c = this.contact();
    if (c?.type === 'registered' && c.registered?.codigo) {
      return c.registered.codigo;
    }
    return null;
  }

  /**
   * Get email if available
   */
  getEmail(): string | null {
    const c = this.contact();
    if (c?.type === 'registered' && c.registered?.email) {
      return c.registered.email;
    }
    return null;
  }

  /**
   * Check if contact has open ticket
   */
  hasOpenTicket(): boolean {
    const c = this.contact();
    return c?.type === 'registered' && c.registered?.hasOpenTicket === true;
  }

  /**
   * Format date for display
   */
  formatDate(dateStr: string | undefined): string {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  // ==================== WEBSOCKET MESSAGE HANDLING ====================

  /**
   * Handle incoming WebSocket message to update requiresResponse and detect ticket reopening
   */
  private handleWsMessage(payload: WsNewMessagePayload): void {
    const c = this.contact();
    if (!c?.registered?.id) return;

    // Check if message involves the current contact
    const contactId = c.registered.id;
    if (payload.senderId !== contactId && payload.recipientId !== contactId) return;

    const isIncoming = payload.message.direction === MessageDirection.INCOMING;

    if (isIncoming) {
      // Client sent a message → disable close buttons
      this.requiresResponse.set(true);

      // If no open ticket, the backend will create one after ~5 sec delay
      if (!this.hasOpenTicket()) {
        this.refreshContactAfterDelay();
      }
    } else {
      // Agent sent a message → enable close buttons
      this.requiresResponse.set(false);
    }
  }

  /**
   * Re-query contact after delay to detect backend-created ticket
   * Debounced: cancels previous timer if multiple messages arrive quickly
   */
  private refreshContactAfterDelay(): void {
    this.cancelRefreshTimer();

    const phone = this.currentPhone();
    if (!phone) return;

    this.refreshTimer = setTimeout(() => {
      // Verify we're still on the same contact
      if (this.currentPhone() !== phone) return;

      this.contactsService.searchByPhone(phone).subscribe(result => {
        // Verify still on the same contact after async response
        if (this.currentPhone() !== phone) return;

        if (result?.type === 'registered' && result.registered) {
          // Update ticket state from fresh API data
          const current = this.contact();
          if (current?.registered) {
            current.registered.hasOpenTicket = result.registered.hasOpenTicket;
            current.registered.openTicketId = result.registered.openTicketId;
            current.registered.requireResponse = result.registered.requireResponse;
            // Re-set the signal to trigger change detection
            this.contact.set({ ...current });
            this.requiresResponse.set(result.registered.requireResponse === true);

            // Reload action history if a new ticket appeared
            if (result.registered.hasOpenTicket && result.registered.id) {
              this.loadActionHistoryAuto(result.registered.id);
            }
          }
        }
      });
    }, 6000);
  }

  /**
   * Cancel pending refresh timer
   */
  private cancelRefreshTimer(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  // ==================== TICKET ACTIONS ====================

  /**
   * Initiate ticket close process with a specific close type
   */
  initiateCloseTicket(closeType: TicketCloseType): void {
    this.showTicketConfirmation.set(closeType);
    this.electronService.setWhatsAppOverlayMode(true);
  }

  /**
   * Initiate generic ticket close (when no close types are configured)
   */
  initiateCloseTicketGeneric(): void {
    this.showTicketConfirmation.set({ name: 'Finalizar', kpiName: '' });
    this.electronService.setWhatsAppOverlayMode(true);
  }

  /**
   * Confirm and close ticket
   */
  confirmCloseTicket(): void {
    const c = this.contact();
    const closeType = this.showTicketConfirmation();

    if (!c?.registered?.openTicketId || !closeType) return;

    this.isClosingTicket.set(true);

    this.contactsService.closeTicket(c.registered.openTicketId, closeType.kpiName).subscribe({
      next: () => {
        this.isClosingTicket.set(false);
        this.showTicketConfirmation.set(null);
        this.electronService.setWhatsAppOverlayMode(false);

        // Update local state
        if (c.registered) {
          c.registered.hasOpenTicket = false;
          c.registered.openTicketId = undefined;
          this.contact.set({ ...c });          // trigger signal change detection
          this.requiresResponse.set(false);     // no ticket = no response needed

          // Reload action history to show the close audit
          this.loadActionHistoryAuto(c.registered.id);
        }
      },
      error: (err) => {
        console.error('Error closing ticket:', err);
        this.isClosingTicket.set(false);
        this.electronService.setWhatsAppOverlayMode(false);
      }
    });
  }

  /**
   * Cancel ticket close
   */
  cancelCloseTicket(): void {
    this.showTicketConfirmation.set(null);
    this.electronService.setWhatsAppOverlayMode(false);
  }

  // ==================== CANNED MESSAGES ====================

  /**
   * Load canned messages
   */
  loadCannedMessages(): void {
    if (this.cannedMessages().length > 0) {
      this.showCannedMessages.set(true);
      return;
    }

    this.loadingCannedMessages.set(true);
    this.cannedMessageService.getCannedMessages().subscribe({
      next: (response) => {
        this.cannedMessages.set(response.canned_messages || []);
        this.loadingCannedMessages.set(false);
        this.showCannedMessages.set(true);
      },
      error: (err) => {
        console.error('Error loading canned messages:', err);
        this.loadingCannedMessages.set(false);
      }
    });
  }

  /**
   * Select canned message and send via Electron
   */
  onCannedMessageSelect(message: CannedMessage): void {
    this.showCannedMessages.set(false);

    // Send message via Electron IPC
    if (this.electronService.isElectron) {
      this.sendMessageViaWhatsApp(message.message);
    }
  }

  /**
   * Send message to WhatsApp Web via Electron IPC
   */
  private sendMessageViaWhatsApp(text: string): void {
    // Access Electron API if available
    const electronAPI = (window as unknown as { electronAPI?: { sendWhatsAppMessage?: (text: string) => Promise<boolean> } }).electronAPI;
    if (electronAPI?.sendWhatsAppMessage) {
      electronAPI.sendWhatsAppMessage(text);
    }
  }

  /**
   * Close canned messages dropdown
   */
  closeCannedMessages(): void {
    this.showCannedMessages.set(false);
  }

  // ==================== ACTION HISTORY ====================

  /**
   * Load action history for current contact
   */
  loadActionHistory(): void {
    const c = this.contact();
    if (!c?.registered?.id) return;

    this.loadingHistory.set(true);
    this.contactsService.getActionHistory(c.registered.id).subscribe({
      next: (response) => {
        this.actionHistory.set(response.history);
        this.loadingHistory.set(false);
        this.showHistoryPanel.set(true);
      },
      error: (err) => {
        console.error('Error loading history:', err);
        this.loadingHistory.set(false);
      }
    });
  }

  /**
   * Load action history automatically (called when contact loads)
   */
  private loadActionHistoryAuto(userId: number): void {
    this.loadingHistory.set(true);
    this.actionHistory.set([]); // Clear previous history

    this.contactsService.getActionHistory(userId).subscribe({
      next: (response) => {
        this.actionHistory.set(response.history);
        this.loadingHistory.set(false);
      },
      error: (err) => {
        console.error('Error loading history:', err);
        this.loadingHistory.set(false);
      }
    });
  }

  /**
   * Close history panel
   */
  closeHistoryPanel(): void {
    this.showHistoryPanel.set(false);
  }

  /**
   * Get formatted action for display
   */
  formatAction(action: string, auditableType?: string): string {
    if (auditableType === 'Ticket') {
      return action === 'update' ? 'Cerró ticket' : action === 'create' ? 'Abrió ticket' : action;
    }
    const actions: Record<string, string> = {
      'create': 'Creó',
      'update': 'Actualizó',
      'destroy': 'Eliminó'
    };
    return actions[action] || action;
  }

  /**
   * Get summary of audit changes for display
   */
  getChangesSummary(changes: Record<string, unknown>, auditableType?: string): string[] {
    if (!changes) return [];
    if (auditableType === 'Ticket') {
      const summary: string[] = [];
      if (changes['close_type']) {
        const ct = (changes['close_type'] as unknown[])?.[1];
        if (ct) summary.push(this.formatCloseTypeLabel(String(ct)));
      }
      return summary.length > 0 ? summary : ['status'];
    }
    return Object.keys(changes).slice(0, 3).map(key => this.formatFieldLabel(key));
  }

  /**
   * Format close type to human-readable label
   */
  private formatCloseTypeLabel(closeType: string): string {
    const labels: Record<string, string> = {
      'closed_con_acuerdo': 'Con Acuerdo',
      'closed_sin_acuerdo': 'Sin Acuerdo',
      'closed_interesado': 'Interesado',
      'auto_closed': 'Auto-cerrado',
      'manual': 'Manual'
    };
    return labels[closeType] || closeType;
  }

  // ==================== CUSTOM FIELDS ====================

  /**
   * Get custom fields as array of entries for iteration
   */
  getCustomFieldsEntries(): { key: string; value: unknown }[] {
    const fields = this.contact()?.registered?.customFields;
    if (!fields) return [];
    return Object.entries(fields).map(([key, value]) => ({ key, value }));
  }

  /**
   * Check if contact has custom fields
   */
  hasCustomFields(): boolean {
    const fields = this.contact()?.registered?.customFields;
    return fields != null && Object.keys(fields).length > 0;
  }

  /**
   * Format field label from snake_case or camelCase to Title Case
   */
  formatFieldLabel(key: string): string {
    return key
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  /**
   * Format field value for display
   */
  formatFieldValue(value: unknown): string {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }
}
