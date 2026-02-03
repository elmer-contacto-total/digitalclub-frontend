import { Component, inject, effect, OnInit, AfterViewInit, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { timeout, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { ThemeService } from './core/services/theme.service';
import { StorageService } from './core/services/storage.service';
import { AuthService } from './core/services/auth.service';

// Timeout for authentication validation (in milliseconds)
const AUTH_VALIDATION_TIMEOUT = 10000; // 10 seconds

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit, AfterViewInit {
  private themeService = inject(ThemeService);
  private storageService = inject(StorageService);
  private authService = inject(AuthService);
  private platformId = inject(PLATFORM_ID);

  constructor() {
    // Validate storage on app start
    this.validateStorage();

    // Apply initial theme to body
    effect(() => {
      document.body.setAttribute('data-theme', this.themeService.theme());
    });
  }

  ngOnInit(): void {
    // Validate authentication status on app initialization
    this.validateAuthentication();
  }

  ngAfterViewInit(): void {
    // Hide the initial loading spinner once Angular is ready
    this.hideLoadingSpinner();
  }

  /**
   * Hide the initial loading spinner from index.html
   */
  private hideLoadingSpinner(): void {
    if (isPlatformBrowser(this.platformId)) {
      // Small delay to ensure the view is rendered
      setTimeout(() => {
        const loadingEl = document.getElementById('app-loading');
        if (loadingEl) {
          loadingEl.classList.add('hidden');
          // Remove from DOM after animation
          setTimeout(() => loadingEl.remove(), 300);
        }
      }, 100);
    }
  }

  /**
   * Validate critical storage items on startup
   */
  private validateStorage(): void {
    try {
      // Try to read critical data to trigger cleanup of corrupted entries
      // Note: auth_token is stored as raw string, use getString
      this.storageService.getString('auth_token');
      this.storageService.get('current_user');
    } catch (e) {
      console.error('[App] Storage validation failed, clearing...', e);
      this.storageService.clear();
    }
  }

  /**
   * Validate authentication status on app startup
   * This checks if the existing token is still valid
   * Includes timeout to prevent indefinite waiting
   */
  private validateAuthentication(): void {
    // Only check if we have a token stored
    const token = this.storageService.getString('auth_token');
    if (!token) {
      console.log('[App] No token found, skipping auth validation');
      return;
    }

    console.log('[App] Validating existing authentication...');
    this.authService.checkAuth().pipe(
      // Add timeout to prevent hanging indefinitely
      timeout(AUTH_VALIDATION_TIMEOUT),
      catchError(err => {
        // On timeout or network error, don't force logout
        // Let the user continue with cached credentials
        // The next API call will trigger proper auth handling
        if (err.name === 'TimeoutError') {
          console.warn('[App] Auth validation timed out - continuing with cached session');
        } else {
          console.error('[App] Auth validation error:', err);
        }
        // Return false but don't block the app
        return of(false);
      })
    ).subscribe({
      next: (isValid) => {
        if (isValid) {
          console.log('[App] Authentication valid');
        } else {
          console.log('[App] Authentication could not be validated - will retry on next request');
        }
      }
    });
  }
}
