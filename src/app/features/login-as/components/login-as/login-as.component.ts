/**
 * LoginAsComponent
 * PARIDAD: Rails admin/users/get_login_as.html.erb
 *
 * Allows SUPER_ADMIN and ADMIN users to impersonate other users.
 * Uses a searchable dropdown to select user.
 */
import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { LoginAsService } from '../../../../core/services/login-as.service';
import { UserService } from '../../../../core/services/user.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../core/services/toast.service';
import { UserRole, RoleUtils } from '../../../../core/models/user.model';

interface SelectableUser {
  id: number;
  displayName: string;
  role: string;
  roleName: string;
}

@Component({
  selector: 'app-login-as',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="login-as-page">
      <!-- Page Header -->
      <div class="page-header">
        <div class="header-left">
          <a routerLink="/app/dashboard" class="back-link">
            <i class="ph ph-arrow-left"></i>
          </a>
          <div class="header-title">
            <h1>Iniciar Sesión Como</h1>
            <span class="subtitle">Suplantación de usuario para soporte</span>
          </div>
        </div>
      </div>

      <!-- Main Content -->
      <div class="content-wrapper">
        <!-- Left: Selection Form -->
        <main class="main-content">
          <div class="form-card">
            <div class="card-header">
              <h3>
                <i class="ph ph-user-switch"></i>
                Seleccionar Usuario
              </h3>
            </div>

            <div class="card-body">
              @if (isLoading()) {
                <div class="loading-state">
                  <div class="spinner"></div>
                  <span>Cargando usuarios...</span>
                </div>
              } @else {
                <!-- Search Filter -->
                <div class="form-group">
                  <label for="search">
                    <i class="ph ph-magnifying-glass"></i>
                    Buscar usuario
                  </label>
                  <div class="search-wrapper">
                    <i class="ph ph-magnifying-glass search-icon"></i>
                    <input
                      type="text"
                      id="search"
                      class="search-input"
                      placeholder="Filtrar por nombre, email o cliente..."
                      [(ngModel)]="searchTerm"
                      (input)="filterUsers()">
                    @if (searchTerm) {
                      <button class="clear-btn" (click)="clearSearch()">
                        <i class="ph ph-x"></i>
                      </button>
                    }
                  </div>
                </div>

                <!-- User Dropdown -->
                <div class="form-group">
                  <label for="user-select">
                    <i class="ph ph-user"></i>
                    Usuario a suplantar
                  </label>
                  <select
                    id="user-select"
                    class="form-select"
                    [(ngModel)]="selectedUserId"
                    [disabled]="isProcessing()">
                    <option [ngValue]="null">-- Seleccione un usuario --</option>
                    @for (user of filteredUsers(); track user.id) {
                      <option [ngValue]="user.id">
                        {{ user.displayName }} ({{ user.roleName }})
                      </option>
                    }
                  </select>
                  <span class="hint">{{ filteredUsers().length }} usuario(s) disponible(s)</span>
                </div>

                <!-- Selected User Preview -->
                @if (selectedUser()) {
                  <div class="selected-user-preview">
                    <div class="preview-avatar">
                      {{ getInitials(selectedUser()!) }}
                    </div>
                    <div class="preview-info">
                      <span class="preview-name">{{ selectedUser()!.displayName }}</span>
                      <span class="preview-role">{{ selectedUser()!.roleName }}</span>
                    </div>
                  </div>
                }

                <!-- Error Message -->
                @if (errorMessage()) {
                  <div class="alert alert-error">
                    <i class="ph ph-warning-circle"></i>
                    <span>{{ errorMessage() }}</span>
                  </div>
                }

                <!-- Submit Button -->
                <div class="form-actions">
                  <button
                    type="button"
                    class="btn btn-primary btn-lg"
                    (click)="loginAs()"
                    [disabled]="!selectedUserId || isProcessing()">
                    @if (isProcessing()) {
                      <i class="ph ph-spinner spinning"></i>
                      Iniciando sesión...
                    } @else {
                      <i class="ph ph-sign-in"></i>
                      Iniciar Sesión como Usuario
                    }
                  </button>
                </div>
              }
            </div>
          </div>
        </main>

        <!-- Right: Info Panel -->
        <aside class="sidebar-card">
          <div class="info-card">
            <div class="info-header">
              <i class="ph ph-info"></i>
              <h4>Información</h4>
            </div>
            <div class="info-content">
              <p>
                Esta función le permite iniciar sesión como otro usuario para
                propósitos de <strong>soporte y depuración</strong>.
              </p>
              <p>
                Una vez iniciada la sesión como otro usuario, verá una
                <span class="highlight">barra roja</span> en la parte superior
                indicando que está en modo de suplantación.
              </p>
              <p class="mb-0">
                Puede volver a su sesión original en cualquier momento
                haciendo clic en el botón <strong>"Volver"</strong>.
              </p>
            </div>
          </div>

          <div class="warning-card">
            <div class="warning-header">
              <i class="ph ph-warning"></i>
              <h4>Precaución</h4>
            </div>
            <div class="warning-content">
              <p class="mb-0">
                Las acciones realizadas mientras suplanta a otro usuario
                quedarán registradas en el sistema de auditoría.
              </p>
            </div>
          </div>

          <div class="current-user-card">
            <div class="current-header">
              <i class="ph ph-user-circle"></i>
              <h4>Sesión Actual</h4>
            </div>
            <div class="current-content">
              <div class="current-avatar">
                {{ getCurrentUserInitials() }}
              </div>
              <div class="current-info">
                <span class="current-name">{{ getCurrentUserName() }}</span>
                <span class="current-role">{{ getCurrentUserRole() }}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  `,
  styles: [`
    .login-as-page {
      min-height: 100%;
      background: var(--bg-base);
      padding: 24px;
    }

    /* Page Header */
    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 32px;
      max-width: 1000px;
      margin-left: auto;
      margin-right: auto;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .back-link {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      color: var(--fg-muted);
      text-decoration: none;
      transition: all 0.2s;

      &:hover {
        color: var(--accent-default);
        border-color: var(--accent-default);
      }

      i { font-size: 20px; }
    }

    .header-title {
      h1 {
        margin: 0;
        font-size: 22px;
        font-weight: 600;
        color: var(--fg-default);
      }

      .subtitle {
        font-size: 13px;
        color: var(--fg-muted);
      }
    }

    /* Content Layout */
    .content-wrapper {
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 32px;
      max-width: 1000px;
      margin: 0 auto;

      @media (max-width: 900px) {
        grid-template-columns: 1fr;
      }
    }

    /* Main Content */
    .main-content {
      min-width: 0;
    }

    .form-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      overflow: hidden;
    }

    .card-header {
      padding: 20px 24px;
      border-bottom: 1px solid var(--border-default);

      h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--fg-default);
        display: flex;
        align-items: center;
        gap: 10px;

        i {
          font-size: 20px;
          color: var(--accent-default);
        }
      }
    }

    .card-body {
      padding: 24px;
    }

    /* Loading State */
    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 24px;
      gap: 16px;
      color: var(--fg-muted);
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--border-default);
      border-top-color: var(--accent-default);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    /* Form Styles */
    .form-group {
      margin-bottom: 20px;

      label {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
        font-size: 13px;
        font-weight: 500;
        color: var(--fg-default);

        i {
          font-size: 16px;
          color: var(--fg-muted);
        }
      }

      .hint {
        display: block;
        margin-top: 6px;
        font-size: 12px;
        color: var(--fg-subtle);
      }
    }

    .search-wrapper {
      position: relative;

      .search-icon {
        position: absolute;
        left: 14px;
        top: 50%;
        transform: translateY(-50%);
        color: var(--fg-muted);
        font-size: 16px;
        pointer-events: none;
      }

      .search-input {
        width: 100%;
        padding: 12px 40px 12px 42px;
        background: var(--input-bg);
        border: 1px solid var(--input-border);
        border-radius: 8px;
        font-size: 14px;
        color: var(--fg-default);
        transition: all 0.15s;

        &:focus {
          outline: none;
          border-color: var(--accent-default);
          box-shadow: 0 0 0 3px var(--accent-subtle);
        }

        &::placeholder {
          color: var(--fg-subtle);
        }
      }

      .clear-btn {
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border: none;
        border-radius: 4px;
        background: var(--bg-subtle);
        color: var(--fg-muted);
        cursor: pointer;

        &:hover {
          background: var(--bg-muted);
          color: var(--fg-default);
        }
      }
    }

    .form-select {
      width: 100%;
      padding: 12px 14px;
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      border-radius: 8px;
      font-size: 14px;
      color: var(--fg-default);
      cursor: pointer;
      transition: all 0.15s;

      &:focus {
        outline: none;
        border-color: var(--accent-default);
        box-shadow: 0 0 0 3px var(--accent-subtle);
      }

      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    }

    /* Selected User Preview */
    .selected-user-preview {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 16px;
      background: var(--accent-subtle);
      border: 1px solid var(--accent-muted);
      border-radius: 10px;
      margin-bottom: 20px;
    }

    .preview-avatar {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: var(--accent-default);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      font-weight: 600;
      flex-shrink: 0;
    }

    .preview-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;

      .preview-name {
        font-size: 15px;
        font-weight: 600;
        color: var(--fg-default);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .preview-role {
        font-size: 13px;
        color: var(--accent-default);
        font-weight: 500;
      }
    }

    /* Alert */
    .alert {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 20px;
      font-size: 14px;

      i { font-size: 18px; }

      &.alert-error {
        background: var(--error-subtle);
        color: var(--error-text);
      }
    }

    /* Form Actions */
    .form-actions {
      padding-top: 8px;
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: all 0.2s;

      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      i { font-size: 18px; }
    }

    .btn-lg {
      padding: 14px 28px;
      font-size: 15px;
      width: 100%;
    }

    .btn-primary {
      background: var(--accent-default);
      color: white;

      &:hover:not(:disabled) {
        background: var(--accent-emphasis);
      }
    }

    /* Sidebar Cards */
    .sidebar-card {
      display: flex;
      flex-direction: column;
      gap: 20px;

      @media (max-width: 900px) {
        order: -1;
      }
    }

    .info-card, .warning-card, .current-user-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      overflow: hidden;
    }

    .info-header, .warning-header, .current-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 18px;
      border-bottom: 1px solid var(--border-default);

      i {
        font-size: 18px;
      }

      h4 {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        color: var(--fg-default);
      }
    }

    .info-header i { color: var(--accent-default); }
    .warning-header i { color: var(--warning-default); }
    .current-header i { color: var(--fg-muted); }

    .info-content, .warning-content {
      padding: 16px 18px;

      p {
        margin: 0 0 12px 0;
        font-size: 13px;
        color: var(--fg-muted);
        line-height: 1.6;

        &.mb-0 { margin-bottom: 0; }

        strong {
          color: var(--fg-default);
        }
      }

      .highlight {
        display: inline-block;
        padding: 2px 8px;
        background: #F74747;
        color: white;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 500;
      }
    }

    .warning-card {
      border-color: var(--warning-muted);
      background: var(--warning-subtle);

      .warning-content p {
        color: var(--warning-text);
      }
    }

    .current-content {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 18px;
    }

    .current-avatar {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: var(--bg-muted);
      color: var(--fg-muted);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 600;
      flex-shrink: 0;
    }

    .current-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;

      .current-name {
        font-size: 14px;
        font-weight: 500;
        color: var(--fg-default);
      }

      .current-role {
        font-size: 12px;
        color: var(--fg-muted);
      }
    }

    /* Animations */
    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .spinning {
      animation: spin 1s linear infinite;
    }

    /* Responsive */
    @media (max-width: 600px) {
      .login-as-page {
        padding: 16px;
      }

      .page-header {
        margin-bottom: 24px;
      }

      .header-title h1 {
        font-size: 18px;
      }
    }
  `]
})
export class LoginAsComponent implements OnInit, OnDestroy {
  private loginAsService = inject(LoginAsService);
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  private router = inject(Router);
  private destroy$ = new Subject<void>();

  // State signals
  allUsers = signal<SelectableUser[]>([]);
  filteredUsers = signal<SelectableUser[]>([]);
  isLoading = signal(true);
  isProcessing = signal(false);
  errorMessage = signal<string>('');

  // Form
  selectedUserId: number | null = null;
  searchTerm = '';

  // Computed
  selectedUser = computed(() => {
    if (!this.selectedUserId) return null;
    return this.allUsers().find(u => u.id === this.selectedUserId) || null;
  });

  ngOnInit(): void {
    // Check if user has permission
    const currentUser = this.authService.currentUser();
    if (!this.loginAsService.canUseLoginAs(currentUser)) {
      this.router.navigate(['/app/dashboard']);
      return;
    }

    this.loadUsers();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadUsers(): void {
    this.isLoading.set(true);
    const currentUser = this.authService.currentUser();

    // Get all users with larger page size
    this.userService.getUsers({ pageSize: 500 })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          const users = (response.data || []) as any[];

          // Filter users based on current user role
          // PARIDAD: Rails filtering logic
          const filtered = users
            .filter(u => {
              // Exclude current user
              if (u.id === currentUser?.id) return false;

              // Exclude standard and whatsapp_business users
              if (u.role === UserRole.STANDARD || u.role === UserRole.WHATSAPP_BUSINESS) return false;

              // If admin (not super_admin), exclude super_admin and other admins
              if (currentUser?.role === UserRole.ADMIN) {
                if (u.role === UserRole.SUPER_ADMIN || u.role === UserRole.ADMIN) return false;
              }

              return true;
            })
            .map(u => ({
              id: u.id,
              displayName: this.buildDisplayName(u),
              role: String(u.role),
              roleName: u.friendlyRole || RoleUtils.getDisplayName(u.role)
            }))
            .sort((a, b) => this.getRolePriority(a.role) - this.getRolePriority(b.role));

          this.allUsers.set(filtered);
          this.filteredUsers.set(filtered);
          this.isLoading.set(false);
        },
        error: (error) => {
          console.error('Error loading users:', error);
          this.toastService.error('Error al cargar usuarios');
          this.isLoading.set(false);
        }
      });
  }

  private buildDisplayName(user: any): string {
    const clientName = user.clientName || 'Sin cliente';
    const firstName = user.firstName || '';
    const lastName = user.lastName || '';
    const fullName = `${firstName} ${lastName}`.trim();
    const name = fullName || user.email || `Usuario #${user.id}`;
    return `${clientName} | ${name}`;
  }

  filterUsers(): void {
    if (!this.searchTerm.trim()) {
      this.filteredUsers.set(this.allUsers());
      return;
    }

    const term = this.searchTerm.toLowerCase();
    this.filteredUsers.set(
      this.allUsers().filter(u =>
        u.displayName.toLowerCase().includes(term) ||
        u.roleName.toLowerCase().includes(term)
      )
    );
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.filteredUsers.set(this.allUsers());
  }

  loginAs(): void {
    if (!this.selectedUserId) return;

    this.errorMessage.set('');
    this.isProcessing.set(true);

    this.loginAsService.loginAs(this.selectedUserId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.result === 'success') {
            this.toastService.success('Sesión iniciada correctamente');
            // Reload the page to apply new session
            window.location.href = '/app/dashboard';
          } else {
            this.errorMessage.set(response.error || 'Error al iniciar sesión');
            this.isProcessing.set(false);
          }
        },
        error: (error) => {
          console.error('Error logging in as user:', error);
          this.errorMessage.set(error.error?.error || 'Error al iniciar sesión como usuario');
          this.isProcessing.set(false);
        }
      });
  }

  getInitials(user: SelectableUser): string {
    const parts = user.displayName.split('|');
    const namePart = parts.length > 1 ? parts[1].trim() : parts[0].trim();
    const words = namePart.split(' ').filter(w => w.length > 0);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return namePart.substring(0, 2).toUpperCase();
  }

  getCurrentUserInitials(): string {
    const user = this.authService.currentUser();
    if (!user) return '??';
    const first = user.firstName?.charAt(0) || '';
    const last = user.lastName?.charAt(0) || '';
    return (first + last).toUpperCase() || '??';
  }

  getCurrentUserName(): string {
    const user = this.authService.currentUser();
    if (!user) return 'Usuario';
    return `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Usuario';
  }

  getCurrentUserRole(): string {
    const user = this.authService.currentUser();
    if (!user) return '';
    return RoleUtils.getDisplayName(user.role);
  }

  /**
   * Role priority for sorting
   * PARIDAD: Rails role_priority helper
   */
  private getRolePriority(role: string): number {
    const roleNum = parseInt(role, 10);
    switch (roleNum) {
      case UserRole.SUPER_ADMIN:
        return 0;
      case UserRole.ADMIN:
        return 1;
      case UserRole.STAFF:
        return 2;
      case UserRole.MANAGER_LEVEL_4:
        return 3;
      case UserRole.AGENT:
        return 4;
      default:
        return 99;
    }
  }
}
