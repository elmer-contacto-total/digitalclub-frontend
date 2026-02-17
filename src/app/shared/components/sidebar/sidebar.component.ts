import { Component, inject, input, output, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { ActiveClientService, ActiveClient } from '../../../core/services/active-client.service';
import { NavSection, getNavigationForRole } from '../../../core/models/navigation.model';
import { getInitials, RoleUtils, UserRole } from '../../../core/models/user.model';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss'
})
export class SidebarComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private activeClientService = inject(ActiveClientService);
  private destroy$ = new Subject<void>();

  // Inputs
  collapsed = input<boolean>(false);
  mobileOpen = input<boolean>(false);

  // Outputs
  close = output<void>();
  toggleCollapse = output<void>();

  // State
  expandedSections = signal<Set<string>>(new Set(['dashboard', 'tables', 'messages']));

  // User data
  currentUser = this.authService.currentUser;

  userInitials = computed(() => {
    const user = this.currentUser();
    if (!user) return '??';
    return getInitials({ firstName: user.firstName, lastName: user.lastName });
  });

  roleDisplayName = computed(() => {
    const user = this.currentUser();
    if (!user) return '';
    return RoleUtils.getDisplayName(user.role);
  });

  // Check if user is super admin (for showing active organization selector)
  isSuperAdmin = computed(() => {
    const user = this.currentUser();
    return user?.role === UserRole.SUPER_ADMIN;
  });

  // Active client data
  activeClient = this.activeClientService.activeClient;
  availableClients = this.activeClientService.availableClients;
  loadingClients = this.activeClientService.loading;

  // Navigation
  navigation = computed<NavSection[]>(() => {
    const user = this.currentUser();
    if (!user) return [];

    // PARIDAD RAILS: @current_client.whatsapp_business?
    // Super admin: uses activeClient (can switch clients via selector)
    // Other roles: uses currentUser.clientType (from auth response)
    const isWhatsAppBusiness = this.isSuperAdmin()
      ? this.activeClient()?.clientType === 'whatsapp_business'
      : user.clientType === 'whatsapp_business';

    return getNavigationForRole(user.role, isWhatsAppBusiness);
  });

  // App info
  appName = 'MWS';
  appVersion = 'v. 1.0.2';

  ngOnInit(): void {
    // Load available clients if super admin
    if (this.isSuperAdmin()) {
      this.activeClientService.loadAvailableClients()
        .pipe(takeUntil(this.destroy$))
        .subscribe();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleSection(sectionId: string): void {
    this.expandedSections.update(sections => {
      const newSections = new Set(sections);
      if (newSections.has(sectionId)) {
        newSections.delete(sectionId);
      } else {
        newSections.add(sectionId);
      }
      return newSections;
    });
  }

  isSectionExpanded(sectionId: string): boolean {
    return this.expandedSections().has(sectionId);
  }

  onClose(): void {
    this.close.emit();
  }

  onToggleCollapse(): void {
    this.toggleCollapse.emit();
  }

  onNavItemClick(): void {
    // Close mobile sidebar on navigation
    if (this.mobileOpen()) {
      this.close.emit();
    }
  }

  /**
   * Handle active client change
   * PARIDAD: Rails select_current_client_controller.js
   */
  onActiveClientChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const clientId = parseInt(select.value, 10);
    const client = this.availableClients().find(c => c.id === clientId);

    if (client) {
      this.activeClientService.setActiveClient(client, true)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          error: () => {
            // Restaurar el valor del select al cliente activo actual
            const currentClient = this.activeClient();
            if (currentClient) {
              select.value = currentClient.id.toString();
            }
          }
        });
    }
  }
}
