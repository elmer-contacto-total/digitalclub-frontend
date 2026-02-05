import { Injectable, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap, catchError, throwError, of, map, BehaviorSubject, filter, take, switchMap } from 'rxjs';
import { ApiService } from './api.service';
import { StorageService } from './storage.service';
import { ToastService } from './toast.service';
import { ElectronService } from './electron.service';
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
  private electronService = inject(ElectronService);

  // Auth state using signals
  private _currentUser = signal<CurrentUser | null>(this.loadUserFromStorage());
  private _token = signal<string | null>(this.storage.getString(TOKEN_KEY));
  private _isLoading = signal<boolean>(false);
  private _otpSessionId = signal<string | null>(this.storage.getString(OTP_SESSION_KEY));
  private _awaitingOtp = signal<boolean>(!!this.storage.getString(OTP_SESSION_KEY));

  // Token refresh state - prevents multiple simultaneous refresh attempts
  private _isRefreshing = new BehaviorSubject<boolean>(false);
  private _refreshTokenSubject = new BehaviorSubject<string | null>(null);

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
   * Logout user - calls backend then clears local state
   * @param showMessage - Whether to show a toast message (default: true)
   * @param sessionExpired - Whether logout is due to session expiration (default: false)
   */
  logout(showMessage: boolean = true, sessionExpired: boolean = false): void {
    const refreshToken = this.storage.getString(REFRESH_TOKEN_KEY);

    // Call backend logout endpoint if we have a refresh token
    if (refreshToken) {
      this.api.post('/api/v1/auth/logout', { refreshToken }).pipe(
        catchError(error => {
          // Log but don't block logout on backend error
          console.warn('[Auth] Backend logout failed:', error);
          return of(null);
        })
      ).subscribe(() => {
        this.clearLocalAuthState(showMessage, sessionExpired);
      });
    } else {
      // No refresh token, just clear local state
      this.clearLocalAuthState(showMessage, sessionExpired);
    }
  }

  /**
   * Clear local authentication state and redirect to login
   */
  private clearLocalAuthState(showMessage: boolean = true, sessionExpired: boolean = false): void {
    // Clear stored data
    this.storage.remove(TOKEN_KEY);
    this.storage.remove(REFRESH_TOKEN_KEY);
    this.storage.remove(USER_KEY);
    this.storage.remove(OTP_SESSION_KEY);

    // Reset signals
    this._currentUser.set(null);
    this._token.set(null);
    this._otpSessionId.set(null);
    this._awaitingOtp.set(false);

    // Clear user in Electron (for media capture) and trigger CRM reset
    if (this.electronService.isElectron) {
      this.electronService.clearLoggedInUser();
      this.electronService.triggerCrmReset();
    }

    // Navigate to login with optional session expired indicator
    const queryParams = sessionExpired ? { sessionExpired: 'true' } : {};
    this.router.navigate(['/login'], { queryParams });

    // Show appropriate message
    if (showMessage) {
      if (sessionExpired) {
        this.toast.warning('Su sesión ha expirado. Por favor inicie sesión nuevamente.');
      } else {
        this.toast.info('Sesión cerrada');
      }
    }
  }

  /**
   * Force logout without calling backend (for use when tokens are invalid)
   */
  forceLogout(sessionExpired: boolean = false): void {
    this.clearLocalAuthState(true, sessionExpired);
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
   * Check if a token refresh is currently in progress
   */
  get isRefreshing(): boolean {
    return this._isRefreshing.value;
  }

  /**
   * Get the refresh token subject for interceptor coordination
   */
  get refreshTokenSubject(): BehaviorSubject<string | null> {
    return this._refreshTokenSubject;
  }

  /**
   * Wait for an ongoing refresh to complete
   */
  waitForRefresh(): Observable<string | null> {
    return this._refreshTokenSubject.pipe(
      filter(token => token !== null),
      take(1)
    );
  }

  /**
   * Refresh the access token
   * @returns Observable<boolean> - true if refresh succeeded, false otherwise
   */
  refreshToken(): Observable<boolean> {
    const storedRefreshToken = this.storage.getString(REFRESH_TOKEN_KEY);

    if (!storedRefreshToken) {
      console.warn('[Auth] No refresh token available');
      return of(false);
    }

    // If already refreshing, wait for that refresh to complete
    if (this._isRefreshing.value) {
      return this._refreshTokenSubject.pipe(
        filter(token => token !== null),
        take(1),
        map(token => !!token)
      );
    }

    // Start refresh
    this._isRefreshing.next(true);
    this._refreshTokenSubject.next(null);

    return this.api.post<LoginResponse>('/api/v1/auth/refresh', { refreshToken: storedRefreshToken }).pipe(
      tap(response => {
        if (response.token) {
          this.storeToken(response.token);
          this._refreshTokenSubject.next(response.token);
        }
        if (response.refreshToken) {
          this.storage.setString(REFRESH_TOKEN_KEY, response.refreshToken);
        }
        this._isRefreshing.next(false);
      }),
      map(response => !!response.token),
      catchError(error => {
        console.error('[Auth] Token refresh failed:', error);
        this._isRefreshing.next(false);
        this._refreshTokenSubject.next('');
        // Do NOT logout here - let the interceptor handle it
        return of(false);
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
   * Validates the current token with backend and attempts refresh if invalid
   */
  checkAuth(): Observable<boolean> {
    const token = this._token();
    const user = this._currentUser();

    // No token or user - not authenticated
    if (!token || !user) {
      return of(false);
    }

    // Validate token with backend
    return this.api.get<{ valid: boolean; user?: AuthUser }>('/api/v1/auth/validate').pipe(
      map(response => {
        if (!response.valid) {
          // Token invalid, try to refresh
          return false;
        }
        // Update user data if returned
        if (response.user) {
          const currentUser = mapAuthUserToCurrentUser(response.user);
          this._currentUser.set(currentUser);
          this.storage.set(USER_KEY, currentUser);
        }
        return true;
      }),
      catchError(error => {
        // If 401, attempt token refresh
        if (error.status === 401) {
          return this.refreshToken().pipe(
            map(refreshed => {
              if (!refreshed) {
                // Refresh failed - clear auth state silently (no duplicate logout)
                this.clearLocalAuthState(false, false);
              }
              return refreshed;
            })
          );
        }
        // Other errors - log but assume authenticated to avoid unnecessary logouts
        console.warn('[Auth] Token validation error:', error);
        return of(true);
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

    // Notify Electron of logged-in user (for media capture association)
    if (this.electronService.isElectron) {
      this.electronService.setLoggedInUser(currentUser.id, currentUser.fullName);
    }

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
    try {
      const user = this.storage.get<CurrentUser>(USER_KEY);

      // Validate user object has required fields
      if (user && user.id && user.email && user.role !== undefined) {
        // Notify Electron of existing logged-in user (deferred to avoid injection issues)
        setTimeout(() => {
          if (this.electronService.isElectron) {
            this.electronService.setLoggedInUser(user.id, user.fullName);
          }
        }, 100);
        return user;
      }

      // Invalid user data - clear it
      if (user) {
        console.warn('[Auth] Invalid user data in storage, clearing...');
        this.storage.remove(USER_KEY);
        this.storage.remove(TOKEN_KEY);
      }

      return null;
    } catch (e) {
      console.error('[Auth] Error loading user from storage:', e);
      this.storage.remove(USER_KEY);
      this.storage.remove(TOKEN_KEY);
      return null;
    }
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
