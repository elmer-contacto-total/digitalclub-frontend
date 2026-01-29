/**
 * Login As (Impersonation) Service
 * PARIDAD: Rails UsersController login_as methods
 */
import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { LoginAsResponse, ImpersonationState, LoginAsUser } from '../models/login-as.model';
import { StorageService } from './storage.service';
import { UserRole } from '../models/user.model';

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
  loginAs(userId: number): Observable<LoginAsResponse> {
    // Store current user/token before switching
    const currentToken = this.storage.getString('token');
    const currentUserStr = this.storage.getString('user');

    if (currentToken && currentUserStr) {
      this.storage.setString(ORIGINAL_TOKEN_KEY, currentToken);
      this.storage.setString(ORIGINAL_USER_KEY, currentUserStr);
    }

    return this.http.post<LoginAsResponse>(`${this.baseUrl}/${userId}/login_as`, {}).pipe(
      tap(response => {
        if (response.result === 'success' && response.token && response.user) {
          // Update token and user
          this.storage.setString('token', response.token);
          this.storage.setString('user', JSON.stringify(response.user));

          // Update impersonation state
          const originalUser = currentUserStr ? JSON.parse(currentUserStr) : null;
          const originalName = originalUser?.firstName && originalUser?.lastName
            ? `${originalUser.firstName} ${originalUser.lastName}`
            : originalUser?.email || null;
          const currentName = response.user.first_name && response.user.last_name
            ? `${response.user.first_name} ${response.user.last_name}`
            : response.user.email;

          this._impersonationState.set({
            isImpersonating: true,
            originalUserId: response.original_user_id || null,
            originalUserName: originalName,
            currentUserName: currentName
          });
        }
      })
    );
  }

  /**
   * Return from impersonation to original user
   */
  returnFromImpersonation(): Observable<LoginAsResponse> {
    const originalUserId = this._impersonationState().originalUserId;

    if (!originalUserId) {
      throw new Error('No original user ID found');
    }

    const params = new HttpParams().set('originalUserId', originalUserId.toString());

    return this.http.post<LoginAsResponse>(
      `${this.baseUrl}/return_from_impersonation`,
      {},
      { params }
    ).pipe(
      tap(response => {
        if (response.result === 'success' && response.token && response.user) {
          // Restore original token and user
          this.storage.setString('token', response.token);
          this.storage.setString('user', JSON.stringify(response.user));

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
    return user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;
  }

  /**
   * Check impersonation state from storage
   */
  private checkImpersonationState(): void {
    const originalUserStr = this.storage.getString(ORIGINAL_USER_KEY);
    const currentUserStr = this.storage.getString('user');

    if (originalUserStr && currentUserStr) {
      try {
        const original = JSON.parse(originalUserStr);
        const current = JSON.parse(currentUserStr);

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
