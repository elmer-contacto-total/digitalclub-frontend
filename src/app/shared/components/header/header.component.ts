import { Component, inject, signal, output, computed, HostListener, ElementRef, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { Subject, Subscription, debounceTime, distinctUntilChanged, switchMap, of, tap } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';
import { ElectronService } from '../../../core/services/electron.service';
import { SearchService } from '../../../core/services/search.service';
import { AlertService } from '../../../core/services/alert.service';
import { WebSocketService } from '../../../core/services/websocket.service';
import { getInitials } from '../../../core/models/user.model';
import { Alert } from '../../../core/models/alert.model';
import { GlobalSearchResult, SearchResultItem, SearchResultGroup } from '../../../core/models/search.model';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private themeService = inject(ThemeService);
  private electronService = inject(ElectronService);
  private searchService = inject(SearchService);
  private alertService = inject(AlertService);
  private webSocketService = inject(WebSocketService);
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

  // Notifications state
  unreadCount = signal(0);
  recentAlerts = signal<Alert[]>([]);
  private alertSubscription?: Subscription;

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

  ngOnInit(): void {
    this.loadInitialAlerts();
    this.subscribeToRealTimeAlerts();
  }

  ngOnDestroy(): void {
    this.searchSubscription.unsubscribe();
    this.alertSubscription?.unsubscribe();
  }

  onToggleSidebar(): void {
    this.toggleSidebar.emit();
  }

  onToggleUserMenu(): void {
    const willOpen = !this.showUserMenu();
    this.showUserMenu.set(willOpen);
    this.showNotifications.set(false);
    this.closeSearch();
    this.updateOverlayMode(willOpen);
  }

  onToggleNotifications(): void {
    const willOpen = !this.showNotifications();
    this.showNotifications.set(willOpen);
    this.showUserMenu.set(false);
    this.closeSearch();
    this.updateOverlayMode(willOpen);
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

  // --- Notification methods ---

  private loadInitialAlerts(): void {
    this.alertService.getUnacknowledgedCount().subscribe({
      next: (res) => this.unreadCount.set(res.count),
      error: () => this.unreadCount.set(0)
    });
    this.alertService.getAlerts({ acknowledged: false, size: 5 }).subscribe({
      next: (res) => this.recentAlerts.set(res.alerts),
      error: () => this.recentAlerts.set([])
    });
  }

  private subscribeToRealTimeAlerts(): void {
    this.alertSubscription = this.webSocketService.alerts$.subscribe(payload => {
      const alert: Alert = {
        id: payload.id,
        type: payload.alertType as any,
        severity: payload.severity as any,
        title: payload.title,
        message: payload.body,
        acknowledged: false,
        created_at: new Date().toISOString(),
        user_id: 0
      };
      this.unreadCount.update(c => c + 1);
      this.recentAlerts.update(list => [alert, ...list].slice(0, 5));
      this.playNotificationSound();
    });
  }

  onMarkAllRead(): void {
    const ids = this.recentAlerts().filter(a => !a.acknowledged).map(a => a.id);
    if (ids.length === 0) return;
    this.alertService.acknowledgeAlerts(ids).subscribe({
      next: () => {
        this.recentAlerts.update(list => list.map(a => ({ ...a, acknowledged: true })));
        this.unreadCount.set(0);
      }
    });
  }

  getAlertIcon(alert: Alert): string {
    switch (alert.type) {
      case 'conversation_response_overdue': return 'ph-clock';
      case 'require_response': return 'ph-chat-circle';
      case 'escalation': return 'ph-warning';
      default: return 'ph-bell';
    }
  }

  getAlertIconBg(alert: Alert): string {
    switch (alert.severity) {
      case 'success': return 'bg-success';
      case 'priority':
      case 'high': return 'bg-danger';
      case 'warning': return 'bg-warning';
      case 'info':
      default: return 'bg-info';
    }
  }

  getTimeAgo(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffMs = now - then;
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return 'Ahora';
    if (minutes < 60) return `Hace ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Hace ${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `Hace ${days}d`;
    return new Date(dateStr).toLocaleDateString('es');
  }

  private playNotificationSound(): void {
    try {
      const ctx = new AudioContext();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.frequency.value = 800;
      gain.gain.value = 0.1;
      oscillator.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      oscillator.stop(ctx.currentTime + 0.3);
    } catch {}
  }

  // --- Menus ---

  closeAllMenus(): void {
    const hadOpenMenu = this.showUserMenu() || this.showNotifications() || this.showSearchResults();
    this.showUserMenu.set(false);
    this.showNotifications.set(false);
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
