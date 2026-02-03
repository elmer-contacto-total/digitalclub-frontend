import { Component, inject, signal, output, computed, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';
import { ElectronService } from '../../../core/services/electron.service';
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
  private electronService = inject(ElectronService);
  private elementRef = inject(ElementRef);

  // Close dropdowns when clicking outside
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!this.elementRef.nativeElement.contains(target)) {
      this.closeAllMenus();
    }
  }

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
    const willOpen = !this.showUserMenu();
    this.showUserMenu.set(willOpen);
    this.showNotifications.set(false);
    this.showLanguageMenu.set(false);
    this.updateOverlayMode(willOpen);
  }

  onToggleNotifications(): void {
    const willOpen = !this.showNotifications();
    this.showNotifications.set(willOpen);
    this.showUserMenu.set(false);
    this.showLanguageMenu.set(false);
    this.updateOverlayMode(willOpen);
  }

  onToggleLanguageMenu(): void {
    const willOpen = !this.showLanguageMenu();
    this.showLanguageMenu.set(willOpen);
    this.showUserMenu.set(false);
    this.showNotifications.set(false);
    this.updateOverlayMode(willOpen);
  }

  onSelectLanguage(lang: typeof this.languages[0]): void {
    this.currentLanguage.set(lang);
    this.showLanguageMenu.set(false);
    this.updateOverlayMode(false);
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
    const hadOpenMenu = this.showUserMenu() || this.showNotifications() || this.showLanguageMenu();
    this.showUserMenu.set(false);
    this.showNotifications.set(false);
    this.showLanguageMenu.set(false);
    if (hadOpenMenu) {
      this.updateOverlayMode(false);
    }
  }

  /**
   * Update WhatsApp overlay mode based on menu state
   * Hides WhatsApp BrowserView when menus are open to prevent z-index issues
   */
  private updateOverlayMode(overlayOpen: boolean): void {
    if (this.electronService.isElectron) {
      this.electronService.setWhatsAppOverlayMode(overlayOpen);
    }
  }

  // Electron window controls
  get isElectron(): boolean {
    return this.electronService.isElectron;
  }

  isMaximized = signal(false);

  onMinimize(): void {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.windowMinimize) {
      (window as any).electronAPI.windowMinimize();
    }
  }

  onMaximize(): void {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.windowMaximize) {
      (window as any).electronAPI.windowMaximize();
      this.checkMaximized();
    }
  }

  onClose(): void {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.windowClose) {
      (window as any).electronAPI.windowClose();
    }
  }

  private async checkMaximized(): Promise<void> {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.windowIsMaximized) {
      const maximized = await (window as any).electronAPI.windowIsMaximized();
      this.isMaximized.set(maximized);
    }
  }
}
