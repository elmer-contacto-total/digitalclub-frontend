import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, map, catchError } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  RegisteredContact,
  CrmContact,
  PhoneUtils,
  UserActionHistory
} from '../../../core/models/crm-contact.model';
import { TicketCloseType } from '../../../core/models/ticket.model';

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
    openTicketId?: number;
    customFields?: Record<string, unknown>;
  };
  closeTypes?: TicketCloseType[];
}

/**
 * Electron Contacts Service
 * Manages contact lookup from backend API for the CRM panel.
 */
@Injectable({
  providedIn: 'root'
})
export class ElectronContactsService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/app/users`;

  /** Ticket close types configured for the current client (cached after first fetch) */
  readonly closeTypes = signal<TicketCloseType[]>([]);
  private closeTypesFetched = false;

  /**
   * Search for a contact by phone number in the backend.
   * Returns null if not registered.
   */
  searchByPhone(phone: string): Observable<CrmContact | null> {
    const normalizedPhone = PhoneUtils.normalize(phone);
    console.log('[ContactsService] searchByPhone input=', phone, 'normalized=', normalizedPhone);

    if (!PhoneUtils.isValid(normalizedPhone)) {
      console.warn('[ContactsService] Phone inválido (length fuera de [9,15]):', normalizedPhone);
      return of(null);
    }

    return this.searchRegisteredContact(normalizedPhone).pipe(
      map(response => {
        console.log('[ContactsService] HTTP response:', response);
        if (!this.closeTypesFetched && response.closeTypes) {
          this.closeTypes.set(response.closeTypes);
          this.closeTypesFetched = true;
        }

        if (response.found && response.contact) {
          console.log('[ContactsService] ✓ Contacto encontrado, mapeando a RegisteredContact');
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
            openTicketId: response.contact.openTicketId,
            requireResponse: response.contact.requireResponse,
            customFields: response.contact.customFields,
            createdAt: response.contact.createdAt || ''
          };

          return {
            type: 'registered' as const,
            phone: normalizedPhone,
            name: registered.fullName,
            registered
          };
        }

        console.log('[ContactsService] No registrado en backend → null');
        return null;
      }),
      catchError(error => {
        console.error('[ContactsService] HTTP error: status=', error?.status, 'message=', error?.message, error);
        return of(null);
      })
    );
  }

  /**
   * Search for registered contact in backend by phone
   */
  private searchRegisteredContact(phone: string): Observable<ContactSearchResponse> {
    const url = `${this.baseUrl}/search_by_phone`;
    console.log('[ContactsService] HTTP GET', url, '?phone=', phone);
    const params = new HttpParams().set('phone', phone);
    return this.http.get<ContactSearchResponse>(url, { params });
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
   * Close a ticket with a specific close type
   * @param ticketId ID of the ticket to close
   * @param closeType 'con_acuerdo' | 'sin_acuerdo'
   */
  closeTicket(ticketId: number, closeType: string, notes?: string): Observable<{ result: string; ticket: unknown }> {
    return this.http.post<{ result: string; ticket: unknown }>(
      `${environment.apiUrl}/app/tickets/${ticketId}/close`,
      { close_type: closeType, notes: notes || null }
    );
  }

  /**
   * Get action history (audit log) for a user
   */
  getActionHistory(userId: number, page = 0, size = 20): Observable<{ history: UserActionHistory[]; total: number }> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString());
    return this.http.get<{ history: UserActionHistory[]; total: number }>(
      `${this.baseUrl}/${userId}/action_history`,
      { params }
    );
  }
}
