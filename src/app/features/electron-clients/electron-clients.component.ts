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
  ChatSelectedEvent
} from '../../core/models/crm-contact.model';

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
      this.electronService.showWhatsApp().then(shown => {
        if (shown) {
          console.log('[ElectronClients] WhatsApp Web view activated');
        }
      });
    }

    // Listen for chat selection from Electron
    this.electronService.chatSelected$.pipe(
      takeUntil(this.destroy$),
      switchMap((event: ChatSelectedEvent | null) => {
        console.log('[ElectronClients] Chat event received:', event);

        if (!event) {
          this.resetState();
          return of(null);
        }

        this.viewState.set('loading');
        this.currentName.set(event.name);

        // Si no hay teléfono pero hay nombre, buscar por nombre en el backend
        if (!event.phone) {
          console.log('[ElectronClients] No phone in event, searching by name:', event.name);
          this.currentPhone.set(null);

          if (event.name && event.name.trim().length >= 2) {
            return this.contactsService.searchByName(event.name);
          }

          this.viewState.set('empty');
          return of(null);
        }

        this.currentPhone.set(event.phone);

        console.log('[ElectronClients] Searching for phone:', event.phone);
        return this.contactsService.searchByPhone(event.phone);
      })
    ).subscribe(result => {
      console.log('[ElectronClients] Search result:', result);
      if (result) {
        this.contact.set(result);
        this.viewState.set('contact');

        // Update currentPhone if we found contact by name and it has a phone
        if (!this.currentPhone() && result.phone) {
          this.currentPhone.set(result.phone);
        }

        // Initialize form fields
        if (result.type === 'local' && result.local) {
          this.selectedLabel.set(result.local.label);
          this.notesField.set(result.local.notes || '');
        } else if (result.type === 'registered' && result.registered) {
          this.notesField.set(result.registered.issueNotes || '');
          this.selectedLabel.set(undefined);
        }
      } else if (this.currentPhone()) {
        // No contact found, but we have a phone - show empty local state
        this.contact.set(null);
        this.viewState.set('contact');
        this.selectedLabel.set(undefined);
        this.notesField.set('');
      } else {
        // No contact found and no phone - show empty state
        this.viewState.set('empty');
      }
    });
  }

  ngOnDestroy(): void {
    // Hide WhatsApp Web view when leaving this module
    if (this.electronService.isElectron) {
      this.electronService.hideWhatsApp().then(hidden => {
        if (hidden) {
          console.log('[ElectronClients] WhatsApp Web view hidden');
        }
      });
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
   * Reset component state
   */
  private resetState(): void {
    this.viewState.set('empty');
    this.currentPhone.set(null);
    this.currentName.set(null);
    this.contact.set(null);
    this.selectedLabel.set(undefined);
    this.notesField.set('');
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
}
