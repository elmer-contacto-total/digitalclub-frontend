import { Component, inject, effect } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/services/theme.service';
import { StorageService } from './core/services/storage.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  private themeService = inject(ThemeService);
  private storageService = inject(StorageService);

  constructor() {
    // Validate storage on app start
    this.validateStorage();

    // Apply initial theme to body
    effect(() => {
      document.body.setAttribute('data-theme', this.themeService.theme());
    });
  }

  /**
   * Validate critical storage items on startup
   */
  private validateStorage(): void {
    try {
      // Try to read critical data to trigger cleanup of corrupted entries
      this.storageService.get('auth_token');
      this.storageService.get('current_user');
    } catch (e) {
      console.error('[App] Storage validation failed, clearing...', e);
      this.storageService.clear();
    }
  }
}
