import { Component, inject, signal, output, computed, HostListener, ElementRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { Subject, Subscription, debounceTime, distinctUntilChanged, switchMap, of, tap } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';
import { ElectronService } from '../../../core/services/electron.service';
import { SearchService } from '../../../core/services/search.service';
import { getInitials } from '../../../core/models/user.model';
import { GlobalSearchResult, SearchResultItem, SearchResultGroup } from '../../../core/models/search.model';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent implements OnDestroy {
  private authService = inject(AuthService);
  private themeService = inject(ThemeService);
  private electronService = inject(ElectronService);
  private searchService = inject(SearchService);
  private router = inject(Router);
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

  // Search state
  showSearchResults = signal(false);
  searchResults = signal<GlobalSearchResult | null>(null);
  isSearching = signal(false);
  selectedIndex = signal(-1);

  // Search debounce
  private searchSubject = new Subject<string>();
  private searchSubscription: Subscription;

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

  constructor() {
    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      tap(term => {
        if (term.length < 2) {
          this.searchResults.set(null);
          this.showSearchResults.set(false);
          this.isSearching.set(false);
          return;
        }
        this.isSearching.set(true);
        this.showSearchResults.set(true);
        this.updateOverlayMode(true);
      }),
      switchMap(term => term.length < 2 ? of(null) : this.searchService.search(term))
    ).subscribe(result => {
      if (result) {
        this.searchResults.set(result);
        this.isSearching.set(false);
        this.selectedIndex.set(-1);
      }
    });
  }

  ngOnDestroy(): void {
    this.searchSubscription.unsubscribe();
  }

  onToggleSidebar(): void {
    this.toggleSidebar.emit();
  }

  onToggleUserMenu(): void {
    const willOpen = !this.showUserMenu();
    this.showUserMenu.set(willOpen);
    this.showNotifications.set(false);
    this.showLanguageMenu.set(false);
    this.closeSearch();
    this.updateOverlayMode(willOpen);
  }

  onToggleNotifications(): void {
    const willOpen = !this.showNotifications();
    this.showNotifications.set(willOpen);
    this.showUserMenu.set(false);
    this.showLanguageMenu.set(false);
    this.closeSearch();
    this.updateOverlayMode(willOpen);
  }

  onToggleLanguageMenu(): void {
    const willOpen = !this.showLanguageMenu();
    this.showLanguageMenu.set(willOpen);
    this.showUserMenu.set(false);
    this.showNotifications.set(false);
    this.closeSearch();
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

  // --- Search methods ---

  onSearchInput(value: string): void {
    this.searchQuery.set(value);
    this.searchSubject.next(value);
  }

  onSearchFocus(): void {
    if (this.searchQuery().length >= 2 && this.searchResults()) {
      this.showSearchResults.set(true);
      this.updateOverlayMode(true);
    }
  }

  onSearch(): void {
    const idx = this.selectedIndex();
    if (idx >= 0) {
      const allItems = this.getAllResultItems();
      if (allItems[idx]) {
        this.navigateToResult(allItems[idx]);
        return;
      }
    }
    this.closeSearch();
  }

  onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.closeSearch();
      return;
    }

    if (!this.showSearchResults()) return;

    const allItems = this.getAllResultItems();
    const current = this.selectedIndex();

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.selectedIndex.set(Math.min(current + 1, allItems.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.selectedIndex.set(Math.max(current - 1, -1));
    }
  }

  closeSearch(): void {
    this.showSearchResults.set(false);
    this.selectedIndex.set(-1);
  }

  clearSearch(): void {
    this.searchQuery.set('');
    this.searchResults.set(null);
    this.closeSearch();
    this.updateOverlayMode(false);
  }

  navigateToResult(item: SearchResultItem): void {
    this.clearSearch();
    this.router.navigateByUrl(item.route);
  }

  navigateToViewAll(group: SearchResultGroup): void {
    this.clearSearch();
    this.router.navigate([group.viewAllRoute], {
      queryParams: group.viewAllQueryParams
    });
  }

  getGlobalIndex(groupIndex: number, itemIndex: number): number {
    const results = this.searchResults();
    if (!results) return -1;
    let offset = 0;
    for (let i = 0; i < groupIndex; i++) {
      offset += results.groups[i].items.length;
    }
    return offset + itemIndex;
  }

  private getAllResultItems(): SearchResultItem[] {
    const results = this.searchResults();
    if (!results) return [];
    return results.groups.reduce<SearchResultItem[]>((acc, g) => [...acc, ...g.items], []);
  }

  // --- Menus ---

  closeAllMenus(): void {
    const hadOpenMenu = this.showUserMenu() || this.showNotifications() || this.showLanguageMenu() || this.showSearchResults();
    this.showUserMenu.set(false);
    this.showNotifications.set(false);
    this.showLanguageMenu.set(false);
    this.closeSearch();
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
}
