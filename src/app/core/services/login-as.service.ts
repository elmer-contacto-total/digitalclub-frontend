/**
 * Login As (Impersonation) Service
 * PARIDAD: Rails UsersController login_as methods
 */
import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ImpersonationState, LoginAsUser } from '../models/login-as.model';
import { StorageService } from './storage.service';
import { UserRole } from '../models/user.model';
import { CurrentUser } from '../models/auth.model';

/**
 * Response from login_as endpoint
 * Backend returns camelCase fields
 */
interface LoginAsApiResponse {
  result: 'success' | 'error';
  token?: string;
  user?: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
    fullName: string;
    phone?: string;
    role: number;
    status: number;
    clientId?: number;
    clientName?: string;
    timeZone?: string;
    locale?: string;
    countryId?: number;
    avatarData?: string;
    uuidToken?: string;
  };
  original_user_id?: number;
  error?: string;
}

const ORIGINAL_USER_KEY = 'original_user';
const ORIGINAL_TOKEN_KEY = 'original_token';

@Injectable({
  providedIn: 'root'
})
export class LoginAsService {
  private http = inject(HttpClient);
  private storage = inject(StorageService);
  private baseUrl = `${environment.apiUrl}/app/users`;

  // Impersonation state signal
  private _impersonationState = signal<ImpersonationState>({
    isImpersonating: false,
    originalUserId: null,
    originalUserName: null,
    currentUserName: null
  });

  // Public readonly signal
  impersonationState = this._impersonationState.asReadonly();

  // Computed for easy template checks
  isImpersonating = computed(() => this._impersonationState().isImpersonating);

  constructor() {
    // Check if we're currently impersonating on init
    this.checkImpersonationState();
  }

  /**
   * Get list of users that can be impersonated
   * Uses the existing users API with proper filtering
   */
  getImpersonatableUsers(): Observable<{ users: LoginAsUser[] }> {
    // The backend will filter based on current user's role
    return this.http.get<{ users: LoginAsUser[] }>(`${this.baseUrl}/impersonatable`);
  }

  /**
   * Login as another user (impersonate)
   */
  loginAs(userId: number): Observable<LoginAsApiResponse> {
    // Store current user/token before switching
    const currentToken = this.storage.getString('auth_token');
    const currentUserStr = this.storage.getString('current_user');

    if (currentToken && currentUserStr) {
      this.storage.setString(ORIGINAL_TOKEN_KEY, currentToken);
      this.storage.setString(ORIGINAL_USER_KEY, currentUserStr);
    }

    return this.http.post<LoginAsApiResponse>(`${this.baseUrl}/${userId}/login_as`, {}).pipe(
      tap(response => {
        if (response.result === 'success' && response.token && response.user) {
          // Map response user to CurrentUser format expected by AuthService
          const currentUser: CurrentUser = {
            id: response.user.id,
            email: response.user.email,
            firstName: response.user.firstName || '',
            lastName: response.user.lastName || '',
            fullName: response.user.fullName || `${response.user.firstName} ${response.user.lastName}`.trim(),
            phone: response.user.phone || '',
            role: response.user.role,
            status: response.user.status,
            clientId: response.user.clientId || 0,
            countryId: response.user.countryId || null,
            timeZone: response.user.timeZone || 'America/Lima',
            locale: response.user.locale || 'es',
            avatarData: response.user.avatarData,
            uuidToken: response.user.uuidToken || ''
          };

          // Update token and user
          this.storage.setString('auth_token', response.token);
          this.storage.set('current_user', currentUser);

          console.log('[LoginAs] Impersonation successful, new user:', currentUser.email, 'role:', currentUser.role);

          // Update impersonation state
          const originalUser = currentUserStr ? JSON.parse(currentUserStr) : null;
          const originalName = originalUser?.firstName && originalUser?.lastName
            ? `${originalUser.firstName} ${originalUser.lastName}`
            : originalUser?.email || null;

          this._impersonationState.set({
            isImpersonating: true,
            originalUserId: response.original_user_id || null,
            originalUserName: originalName,
            currentUserName: currentUser.fullName
          });
        }
      })
    );
  }

  /**
   * Return from impersonation to original user
   */
  returnFromImpersonation(): Observable<LoginAsApiResponse> {
    const originalUserId = this._impersonationState().originalUserId;

    if (!originalUserId) {
      throw new Error('No original user ID found');
    }

    const params = new HttpParams().set('originalUserId', originalUserId.toString());

    return this.http.post<LoginAsApiResponse>(
      `${this.baseUrl}/return_from_impersonation`,
      {},
      { params }
    ).pipe(
      tap(response => {
        if (response.result === 'success' && response.token && response.user) {
          // Map response user to CurrentUser format expected by AuthService
          const currentUser: CurrentUser = {
            id: response.user.id,
            email: response.user.email,
            firstName: response.user.firstName || '',
            lastName: response.user.lastName || '',
            fullName: response.user.fullName || `${response.user.firstName} ${response.user.lastName}`.trim(),
            phone: response.user.phone || '',
            role: response.user.role,
            status: response.user.status,
            clientId: response.user.clientId || 0,
            countryId: response.user.countryId || null,
            timeZone: response.user.timeZone || 'America/Lima',
            locale: response.user.locale || 'es',
            avatarData: response.user.avatarData,
            uuidToken: response.user.uuidToken || ''
          };

          // Restore original token and user
          this.storage.setString('auth_token', response.token);
          this.storage.set('current_user', currentUser);

          console.log('[LoginAs] Returned to original user:', currentUser.email);

          // Clear stored original values
          this.storage.remove(ORIGINAL_TOKEN_KEY);
          this.storage.remove(ORIGINAL_USER_KEY);

          // Reset impersonation state
          this._impersonationState.set({
            isImpersonating: false,
            originalUserId: null,
            originalUserName: null,
            currentUserName: null
          });
        }
      })
    );
  }

  /**
   * Check if user can use Login As feature
   */
  canUseLoginAs(user: { role: UserRole } | null): boolean {
    if (!user) return false;
    // Convert role to number for reliable comparison (API may return string)
    const roleNum = Number(user.role);
    return roleNum === UserRole.SUPER_ADMIN || roleNum === UserRole.ADMIN;
  }

  /**
   * Check impersonation state from storage
   */
  private checkImpersonationState(): void {
    const originalUserStr = this.storage.getString(ORIGINAL_USER_KEY);
    const currentUserStr = this.storage.getString('current_user');

    if (originalUserStr && currentUserStr) {
      try {
        const original = JSON.parse(originalUserStr);
        const current = JSON.parse(currentUserStr);

        // Only show impersonation if current user is DIFFERENT from original
        if (original.id === current.id) {
          // Same user - not impersonating, clear stale state
          this.clearImpersonationState();
          return;
        }

        const originalName = original.firstName && original.lastName
          ? `${original.firstName} ${original.lastName}`
          : original.email;
        const currentName = current.firstName && current.lastName
          ? `${current.firstName} ${current.lastName}`
          : current.email;

        this._impersonationState.set({
          isImpersonating: true,
          originalUserId: original.id,
          originalUserName: originalName,
          currentUserName: currentName
        });
      } catch {
        // Invalid JSON, clear state
        this.clearImpersonationState();
      }
    }
  }

  /**
   * Clear impersonation state (on logout, etc.)
   */
  clearImpersonationState(): void {
    this.storage.remove(ORIGINAL_TOKEN_KEY);
    this.storage.remove(ORIGINAL_USER_KEY);
    this._impersonationState.set({
      isImpersonating: false,
      originalUserId: null,
      originalUserName: null,
      currentUserName: null
    });
  }
}
