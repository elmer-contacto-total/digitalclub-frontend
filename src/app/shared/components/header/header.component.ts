import { Component, inject, signal, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';
import { getInitials } from '../../../core/models/user.model';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent {
  private authService = inject(AuthService);
  private themeService = inject(ThemeService);

  // Outputs
  toggleSidebar = output<void>();

  // State
  showUserMenu = signal(false);
  showNotifications = signal(false);
  showLanguageMenu = signal(false);
  searchQuery = signal('');

  // Computed
  currentUser = this.authService.currentUser;
  isDarkMode = this.themeService.isDarkMode;

  userInitials = computed(() => {
    const user = this.currentUser();
    if (!user) return '??';
    return getInitials({ firstName: user.firstName, lastName: user.lastName });
  });

  // Mock notifications count (replace with real data)
  notificationsCount = signal(3);

  // Language options
  languages = [
    { code: 'es', label: 'Español', flag: 'es' },
    { code: 'en', label: 'English', flag: 'us' }
  ];
  currentLanguage = signal(this.languages[0]);

  onToggleSidebar(): void {
    this.toggleSidebar.emit();
  }

  onToggleUserMenu(): void {
    this.showUserMenu.update(v => !v);
    this.showNotifications.set(false);
    this.showLanguageMenu.set(false);
  }

  onToggleNotifications(): void {
    this.showNotifications.update(v => !v);
    this.showUserMenu.set(false);
    this.showLanguageMenu.set(false);
  }

  onToggleLanguageMenu(): void {
    this.showLanguageMenu.update(v => !v);
    this.showUserMenu.set(false);
    this.showNotifications.set(false);
  }

  onSelectLanguage(lang: typeof this.languages[0]): void {
    this.currentLanguage.set(lang);
    this.showLanguageMenu.set(false);
    // TODO: Implement i18n language change
  }

  onToggleTheme(): void {
    this.themeService.toggleTheme();
  }

  onLogout(): void {
    this.authService.logout();
  }

  onSearch(): void {
    const query = this.searchQuery();
    if (query.trim()) {
      // TODO: Implement global search
      console.log('Search:', query);
    }
  }

  closeAllMenus(): void {
    this.showUserMenu.set(false);
    this.showNotifications.set(false);
    this.showLanguageMenu.set(false);
  }
}
