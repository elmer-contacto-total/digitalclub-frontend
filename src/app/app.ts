import { Component, inject, effect, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/services/theme.service';
import { StorageService } from './core/services/storage.service';
import { AuthService } from './core/services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  private themeService = inject(ThemeService);
  private storageService = inject(StorageService);
  private authService = inject(AuthService);

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
   */
  private validateAuthentication(): void {
    // Only check if we have a token stored
    const token = this.storageService.getString('auth_token');
    if (!token) {
      return;
    }

    console.log('[App] Validating existing authentication...');
    this.authService.checkAuth().subscribe({
      next: (isValid) => {
        if (isValid) {
          console.log('[App] Authentication valid');
        } else {
          console.log('[App] Authentication invalid or expired');
        }
      },
      error: (err) => {
        console.error('[App] Authentication validation error:', err);
      }
    });
  }
}
