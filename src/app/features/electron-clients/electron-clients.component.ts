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
  showTicketConfirmation = signal<'con_acuerdo' | 'sin_acuerdo' | null>(null);

  // Canned messages state
  showCannedMessages = signal(false);
  cannedMessages = signal<CannedMessage[]>([]);
  loadingCannedMessages = signal(false);

  // Action history state
  actionHistory = signal<UserActionHistory[]>([]);
  loadingHistory = signal(false);
  showHistoryPanel = signal(false);

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

  ngOnInit(): void {
    // Check if running in Electron
    this.isElectron.set(this.electronService.isElectron);

    // Show WhatsApp Web view when entering this module
    if (this.electronService.isElectron) {
      this.electronService.showWhatsApp();
    }

    // Listen for chat selection from Electron
    // Solo busca por teléfono - el teléfono debe extraerse del DOM o del nombre del contacto
    this.electronService.chatSelected$.pipe(
      takeUntil(this.destroy$),
      switchMap((event: ChatSelectedEvent | null) => {
        if (!event) {
          this.resetState();
          return of(null);
        }

        this.currentName.set(event.name);

        // Sin teléfono = estado vacío (el teléfono debe venir de Electron)
        if (!event.phone) {
          this.currentPhone.set(null);
          this.viewState.set('empty');
          return of(null);
        }

        this.viewState.set('loading');
        this.currentPhone.set(event.phone);
        return this.contactsService.searchByPhone(event.phone);
      })
    ).subscribe(result => {
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
        }

        // Notificar a Electron del cliente activo (para captura de medios)
        this.notifyElectronOfActiveClient(result);

        // Auto-load action history for registered contacts
        if (result.type === 'registered' && result.registered?.id) {
          this.loadActionHistoryAuto(result.registered.id);
        }
      } else if (this.currentPhone()) {
        // No contact found in backend, but we have a phone - show local contact state
        this.contact.set(null);
        this.viewState.set('contact');
        this.selectedLabel.set(undefined);
        this.notesField.set('');

        // Notificar a Electron con solo el teléfono (sin clientUserId)
        this.electronService.setActiveClient(
          null,
          this.currentPhone() || '',
          this.currentName() || ''
        );
      } else {
        // No phone - show empty state
        this.viewState.set('empty');

        // Limpiar cliente activo en Electron
        this.electronService.clearActiveClient();
      }
    });
  }

  ngOnDestroy(): void {
    // Hide WhatsApp Web view when leaving this module
    if (this.electronService.isElectron) {
      this.electronService.hideWhatsApp();
    }

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
   * Reset component state
   */
  private resetState(): void {
    this.viewState.set('empty');
    this.currentPhone.set(null);
    this.currentName.set(null);
    this.contact.set(null);
    this.selectedLabel.set(undefined);
    this.notesField.set('');

    // Clear active client in Electron
    this.electronService.clearActiveClient();
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

  // ==================== TICKET ACTIONS ====================

  /**
   * Handle "Cerrar con Acuerdo" button click
   * TODO: Implement actual functionality
   */
  onCloseWithAgreement(): void {
    console.log('[CRM] Cerrar con Acuerdo clicked');
    // TODO: Implement functionality
  }

  /**
   * Handle "Cerrar sin Acuerdo" button click
   * TODO: Implement actual functionality
   */
  onCloseWithoutAgreement(): void {
    console.log('[CRM] Cerrar sin Acuerdo clicked');
    // TODO: Implement functionality
  }

  /**
   * Initiate ticket close process
   */
  initiateCloseTicket(closeType: 'con_acuerdo' | 'sin_acuerdo'): void {
    this.showTicketConfirmation.set(closeType);
  }

  /**
   * Confirm and close ticket
   */
  confirmCloseTicket(): void {
    const c = this.contact();
    const closeType = this.showTicketConfirmation();

    if (!c?.registered?.openTicketId || !closeType) return;

    this.isClosingTicket.set(true);

    this.contactsService.closeTicket(c.registered.openTicketId, closeType).subscribe({
      next: () => {
        this.isClosingTicket.set(false);
        this.showTicketConfirmation.set(null);

        // Update local state
        if (c.registered) {
          c.registered.hasOpenTicket = false;
          c.registered.openTicketId = undefined;
        }
      },
      error: (err) => {
        console.error('Error closing ticket:', err);
        this.isClosingTicket.set(false);
      }
    });
  }

  /**
   * Cancel ticket close
   */
  cancelCloseTicket(): void {
    this.showTicketConfirmation.set(null);
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
  formatAction(action: string): string {
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
  getChangesSummary(changes: Record<string, unknown>): string[] {
    if (!changes) return [];
    return Object.keys(changes).slice(0, 3).map(key => this.formatFieldLabel(key));
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
