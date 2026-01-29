import { Injectable, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap, catchError, throwError, of, map } from 'rxjs';
import { ApiService } from './api.service';
import { StorageService } from './storage.service';
import { ToastService } from './toast.service';
import {
  LoginRequest,
  LoginResponse,
  CurrentUser,
  mapAuthUserToCurrentUser,
  AuthUser
} from '../models/auth.model';
import { UserRole, RoleUtils } from '../models/user.model';

const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const USER_KEY = 'current_user';
const OTP_SESSION_KEY = 'otp_session';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private api = inject(ApiService);
  private storage = inject(StorageService);
  private router = inject(Router);
  private toast = inject(ToastService);

  // Auth state using signals
  private _currentUser = signal<CurrentUser | null>(this.loadUserFromStorage());
  private _token = signal<string | null>(this.storage.getString(TOKEN_KEY));
  private _isLoading = signal<boolean>(false);
  private _otpSessionId = signal<string | null>(this.storage.getString(OTP_SESSION_KEY));
  private _awaitingOtp = signal<boolean>(!!this.storage.getString(OTP_SESSION_KEY));

  // Public computed signals
  readonly currentUser = this._currentUser.asReadonly();
  readonly token = this._token.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly awaitingOtp = this._awaitingOtp.asReadonly();

  readonly isAuthenticated = computed(() => {
    return !!this._token() && !!this._currentUser();
  });

  readonly userRole = computed(() => {
    return this._currentUser()?.role ?? null;
  });

  readonly isAdmin = computed(() => {
    const role = this.userRole();
    return role !== null && RoleUtils.isAdmin(role);
  });

  readonly isSuperAdmin = computed(() => {
    const role = this.userRole();
    return role !== null && RoleUtils.isSuperAdmin(role);
  });

  readonly isManager = computed(() => {
    const role = this.userRole();
    return role !== null && RoleUtils.isManager(role);
  });

  readonly isAgent = computed(() => {
    const role = this.userRole();
    return role !== null && RoleUtils.isAgent(role);
  });

  readonly isInternal = computed(() => {
    const role = this.userRole();
    return role !== null && RoleUtils.isInternal(role);
  });

  readonly canManageUsers = computed(() => {
    const role = this.userRole();
    return role !== null && RoleUtils.canManageUsers(role);
  });

  /**
   * Web login with email and password (Stage 1 - Pre-login)
   * Returns response indicating OTP is required
   */
  login(email: string, password: string): Observable<LoginResponse> {
    this._isLoading.set(true);

    return this.api.post<LoginResponse>('/api/v1/web/prelogin', { email, password }).pipe(
      tap(response => {
        if (response.requires_otp) {
          // Store OTP session for verification
          this._otpSessionId.set(response.otp_session_id || email);
          this._awaitingOtp.set(true);
          this.storage.setString(OTP_SESSION_KEY, response.otp_session_id || email);
        } else if (response.token) {
          // Direct login (no OTP required)
          this.handleLoginSuccess(response);
        }
        this._isLoading.set(false);
      }),
      catchError(error => {
        this._isLoading.set(false);
        return throwError(() => error);
      })
    );
  }

  /**
   * Verify OTP code (Stage 2)
   */
  verifyOtp(otp: string): Observable<LoginResponse> {
    this._isLoading.set(true);
    const sessionId = this._otpSessionId();

    return this.api.post<LoginResponse>('/api/v1/web/verify_otp', {
      otpSessionId: sessionId,
      candidateOtp: otp
    }).pipe(
      tap(response => {
        this.clearOtpSession();
        this.handleLoginSuccess(response);
        this._isLoading.set(false);
      }),
      catchError(error => {
        this._isLoading.set(false);
        return throwError(() => error);
      })
    );
  }

  /**
   * Resend OTP code
   */
  resendOtp(): Observable<{ success: boolean }> {
    const sessionId = this._otpSessionId();

    return this.api.post<{ success: boolean }>('/api/v1/web/resend_otp', {
      otpSessionId: sessionId
    });
  }

  /**
   * Cancel OTP verification (go back to login)
   */
  cancelOtpVerification(): void {
    this.clearOtpSession();
  }

  /**
   * Clear OTP session state
   */
  private clearOtpSession(): void {
    this._otpSessionId.set(null);
    this._awaitingOtp.set(false);
    this.storage.remove(OTP_SESSION_KEY);
  }

  /**
   * Request password reset email
   */
  forgotPassword(email: string): Observable<{ success: boolean }> {
    return this.api.post<{ success: boolean }>('/api/v1/password/forgot', { email });
  }

  /**
   * Reset password with token (from email link)
   */
  resetPassword(token: string, password: string, passwordConfirmation: string): Observable<{ success: boolean }> {
    return this.api.post<{ success: boolean }>('/api/v1/password/reset', {
      reset_password_token: token,
      password,
      password_confirmation: passwordConfirmation
    });
  }

  /**
   * Change password (for temporary password flow)
   */
  changePassword(currentPassword: string, password: string, passwordConfirmation: string): Observable<{ success: boolean }> {
    return this.api.put<{ success: boolean }>('/api/v1/password/change', {
      current_password: currentPassword,
      password,
      password_confirmation: passwordConfirmation
    }).pipe(
      tap(() => {
        // Update user to remove temporary password flag
        this.updateCurrentUser({ has_temporary_password: false } as any);
      })
    );
  }

  /**
   * Logout user
   */
  logout(): void {
    // Clear stored data
    this.storage.remove(TOKEN_KEY);
    this.storage.remove(REFRESH_TOKEN_KEY);
    this.storage.remove(USER_KEY);

    // Reset signals
    this._currentUser.set(null);
    this._token.set(null);

    // Navigate to login
    this.router.navigate(['/login']);
    this.toast.info('Sesión cerrada');
  }

  /**
   * Check if user has specific role
   */
  hasRole(role: UserRole): boolean {
    return this._currentUser()?.role === role;
  }

  /**
   * Check if user has any of the specified roles
   */
  hasAnyRole(roles: UserRole[]): boolean {
    const userRole = this._currentUser()?.role;
    return userRole !== undefined && roles.includes(userRole);
  }

  /**
   * Get token for HTTP requests
   */
  getToken(): string | null {
    return this._token();
  }

  /**
   * Refresh the access token
   */
  refreshToken(): Observable<LoginResponse> {
    const refreshToken = this.storage.get<string>(REFRESH_TOKEN_KEY);

    if (!refreshToken) {
      return throwError(() => new Error('No refresh token available'));
    }

    return this.api.post<LoginResponse>('/auth/refresh', { refreshToken }).pipe(
      tap(response => {
        if (response.token) {
          this.storeToken(response.token);
        }
        if (response.refreshToken) {
          this.storage.setString(REFRESH_TOKEN_KEY, response.refreshToken);
        }
      }),
      catchError(error => {
        this.logout();
        return throwError(() => error);
      })
    );
  }

  /**
   * Update current user data
   */
  updateCurrentUser(userData: Partial<CurrentUser>): void {
    const current = this._currentUser();
    if (current) {
      const updated = { ...current, ...userData };
      this._currentUser.set(updated);
      this.storage.set(USER_KEY, updated);
    }
  }

  /**
   * Check authentication status on app init
   */
  checkAuth(): Observable<boolean> {
    const token = this._token();
    const user = this._currentUser();

    if (!token || !user) {
      return of(false);
    }

    // Optionally validate token with backend
    return this.api.get<{ valid: boolean }>('/auth/validate').pipe(
      map(response => {
        if (!response.valid) {
          this.logout();
          return false;
        }
        return true;
      }),
      catchError(() => {
        // Token invalid or expired
        this.logout();
        return of(false);
      })
    );
  }

  /**
   * Handle successful login
   */
  private handleLoginSuccess(response: LoginResponse): void {
    // Validate response has required fields
    if (!response.token || !response.user) {
      console.error('Invalid login response: missing token or user');
      return;
    }

    // Store token
    this.storeToken(response.token);

    if (response.refreshToken) {
      this.storage.setString(REFRESH_TOKEN_KEY, response.refreshToken);
    }

    // Convert and store user
    const currentUser = mapAuthUserToCurrentUser(response.user);
    this._currentUser.set(currentUser);
    this.storage.set(USER_KEY, currentUser);

    // Show success message
    this.toast.success(`Bienvenido, ${currentUser.firstName}`);
  }

  /**
   * Store token (using setString to avoid JSON.stringify adding quotes)
   */
  private storeToken(token: string): void {
    this._token.set(token);
    this.storage.setString(TOKEN_KEY, token);
  }

  /**
   * Update token externally (used by ActiveClientService when switching clients)
   * PARIDAD: Rails set_current_client - stores new token with different clientId
   */
  updateToken(token: string, refreshToken?: string): void {
    this.storeToken(token);
    if (refreshToken) {
      this.storage.setString(REFRESH_TOKEN_KEY, refreshToken);
    }
  }

  /**
   * Load user from storage on init
   */
  private loadUserFromStorage(): CurrentUser | null {
    return this.storage.get<CurrentUser>(USER_KEY);
  }

  /**
   * Handle 401 unauthorized responses
   */
  handleUnauthorized(): void {
    this.logout();
    this.toast.error('Su sesión ha expirado. Por favor inicie sesión nuevamente.');
  }

  /**
   * Get user's sidebar type based on role
   */
  getSidebarType(): string {
    const role = this.userRole();
    return role !== null ? RoleUtils.getSidebarType(role) : 'standard';
  }

  /**
   * Check if user requires password change (temp password)
   */
  requiresPasswordChange(): boolean {
    // This would typically be stored in the user object
    // For now, return false - implement based on your backend response
    return false;
  }
}
