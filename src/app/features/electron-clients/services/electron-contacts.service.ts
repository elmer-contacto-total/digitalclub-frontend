import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, map, catchError } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { StorageService } from '../../../core/services/storage.service';
import {
  LocalContact,
  RegisteredContact,
  CrmContact,
  PersonalLabel,
  PhoneUtils
} from '../../../core/models/crm-contact.model';

/**
 * Storage key for local contacts
 */
const LOCAL_CONTACTS_KEY = 'local_contacts';

/**
 * API response for contact search
 * Matches Spring Boot /app/users/search_by_phone response
 */
interface ContactSearchResponse {
  found: boolean;
  contact?: {
    id: number;
    firstName: string;
    lastName: string;
    fullName: string;
    email?: string;
    phone: string;
    codigo?: string;
    avatarUrl?: string;
    status?: string;
    createdAt?: string;
    issueNotes?: string;
    requireResponse?: boolean;
    managerId?: number;
    managerName?: string;
    hasOpenTicket?: boolean;
  };
}

/**
 * Electron Contacts Service
 * Manages contact lookup from backend API and local storage
 * Used by the Electron clients module for CRM panel
 */
@Injectable({
  providedIn: 'root'
})
export class ElectronContactsService {
  private http = inject(HttpClient);
  private storage = inject(StorageService);
  private baseUrl = `${environment.apiUrl}/app/users`;

  /**
   * Search for a contact by phone number
   * First checks the backend, then falls back to local storage
   */
  searchByPhone(phone: string): Observable<CrmContact | null> {
    const normalizedPhone = PhoneUtils.normalize(phone);

    if (!PhoneUtils.isValid(normalizedPhone)) {
      return of(null);
    }

    // Try to find in backend first
    return this.searchRegisteredContact(normalizedPhone).pipe(
      map(response => {
        if (response.found && response.contact) {
          // Map Spring Boot response to RegisteredContact
          const registered: RegisteredContact = {
            id: response.contact.id,
            phone: response.contact.phone,
            firstName: response.contact.firstName,
            lastName: response.contact.lastName,
            fullName: response.contact.fullName,
            email: response.contact.email,
            codigo: response.contact.codigo,
            avatarUrl: response.contact.avatarUrl,
            managerId: response.contact.managerId,
            managerName: response.contact.managerName,
            issueNotes: response.contact.issueNotes,
            hasOpenTicket: response.contact.hasOpenTicket,
            createdAt: response.contact.createdAt || ''
          };

          return {
            type: 'registered' as const,
            phone: normalizedPhone,
            name: registered.fullName,
            registered
          };
        }

        // Fall back to local contact
        const local = this.getLocalContact(normalizedPhone);
        if (local) {
          return {
            type: 'local' as const,
            phone: normalizedPhone,
            name: local.name || normalizedPhone,
            local
          };
        }

        return null;
      }),
      catchError(error => {
        console.error('[ElectronContactsService] Error searching contact:', error);
        // On error, try local contact
        const local = this.getLocalContact(normalizedPhone);
        if (local) {
          return of({
            type: 'local' as const,
            phone: normalizedPhone,
            name: local.name || normalizedPhone,
            local
          });
        }
        return of(null);
      })
    );
  }

  /**
   * Search for registered contact in backend by phone
   */
  private searchRegisteredContact(phone: string): Observable<ContactSearchResponse> {
    const params = new HttpParams().set('phone', phone);
    return this.http.get<ContactSearchResponse>(`${this.baseUrl}/search_by_phone`, { params });
  }

  /**
   * Search for registered contact in backend by name
   */
  searchByName(name: string): Observable<CrmContact | null> {
    if (!name || name.trim().length < 2) {
      return of(null);
    }

    const params = new HttpParams().set('name', name.trim());

    return this.http.get<ContactSearchResponse>(`${this.baseUrl}/search_by_name`, { params }).pipe(
      map(response => {
        if (response.found && response.contact) {
          const registered: RegisteredContact = {
            id: response.contact.id,
            phone: response.contact.phone,
            firstName: response.contact.firstName,
            lastName: response.contact.lastName,
            fullName: response.contact.fullName,
            email: response.contact.email,
            codigo: response.contact.codigo,
            avatarUrl: response.contact.avatarUrl,
            managerId: response.contact.managerId,
            managerName: response.contact.managerName,
            issueNotes: response.contact.issueNotes,
            hasOpenTicket: response.contact.hasOpenTicket,
            createdAt: response.contact.createdAt || ''
          };

          return {
            type: 'registered' as const,
            phone: registered.phone,
            name: registered.fullName,
            registered
          };
        }
        return null;
      }),
      catchError(error => {
        console.error('[ElectronContactsService] Error searching by name:', error);
        return of(null);
      })
    );
  }

  /**
   * Get all local contacts from storage
   */
  getLocalContacts(): Record<string, LocalContact> {
    return this.storage.get<Record<string, LocalContact>>(LOCAL_CONTACTS_KEY) || {};
  }

  /**
   * Get a local contact by phone
   */
  getLocalContact(phone: string): LocalContact | null {
    const normalized = PhoneUtils.normalize(phone);
    const contacts = this.getLocalContacts();
    return contacts[normalized] || null;
  }

  /**
   * Save or update a local contact
   */
  saveLocalContact(phone: string, data: Partial<LocalContact>): LocalContact {
    const normalized = PhoneUtils.normalize(phone);
    const contacts = this.getLocalContacts();
    const existing = contacts[normalized];
    const now = new Date().toISOString();

    const contact: LocalContact = {
      phone: normalized,
      name: data.name ?? existing?.name,
      label: data.label ?? existing?.label,
      notes: data.notes ?? existing?.notes,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };

    contacts[normalized] = contact;
    this.storage.set(LOCAL_CONTACTS_KEY, contacts);

    return contact;
  }

  /**
   * Update local contact label
   */
  updateLabel(phone: string, label: PersonalLabel | undefined): LocalContact {
    return this.saveLocalContact(phone, { label });
  }

  /**
   * Update local contact name
   */
  updateName(phone: string, name: string): LocalContact {
    return this.saveLocalContact(phone, { name });
  }

  /**
   * Update local contact notes
   */
  updateNotes(phone: string, notes: string): LocalContact {
    return this.saveLocalContact(phone, { notes });
  }

  /**
   * Delete a local contact
   */
  deleteLocalContact(phone: string): void {
    const normalized = PhoneUtils.normalize(phone);
    const contacts = this.getLocalContacts();
    delete contacts[normalized];
    this.storage.set(LOCAL_CONTACTS_KEY, contacts);
  }

  /**
   * Update issue notes for a registered contact (saves to backend)
   */
  updateIssueNotes(userId: number, notes: string): Observable<{ success: boolean }> {
    return this.http.patch<{ success: boolean }>(`${this.baseUrl}/${userId}/issue_notes`, { notes });
  }

  /**
   * Get contact details including manager history
   */
  getContactDetails(userId: number): Observable<{
    user: RegisteredContact;
    managerHistory: { id: number; managerName: string; createdAt: string }[];
  }> {
    const params = new HttpParams().set('user_id', userId.toString());
    return this.http.get<{
      user: RegisteredContact;
      managerHistory: { id: number; managerName: string; createdAt: string }[];
    }>(`${this.baseUrl}/client_details`, { params });
  }

  /**
   * Export local contacts count
   */
  getLocalContactsCount(): number {
    return Object.keys(this.getLocalContacts()).length;
  }

  /**
   * Clear all local contacts
   */
  clearLocalContacts(): void {
    this.storage.remove(LOCAL_CONTACTS_KEY);
  }
}
