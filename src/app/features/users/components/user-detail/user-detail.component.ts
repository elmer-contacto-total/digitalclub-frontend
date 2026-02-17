/**
 * User Detail Component
 * Vista detalle de usuario
 * PARIDAD: Rails admin/users/show.html.erb
 */
import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { UserService, UserDetailResponse } from '../../../../core/services/user.service';
import { AuthService } from '../../../../core/services/auth.service';
import { User, UserRole, UserStatus, RoleUtils, getFullName, getInitials } from '../../../../core/models/user.model';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-user-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    LoadingSpinnerComponent,
    ConfirmDialogComponent
  ],
  template: `
    <div class="user-detail-container">
      @if (isLoading()) {
        <app-loading-spinner [overlay]="true" message="Cargando usuario..." />
      } @else if (user()) {
        <!-- Header -->
        <div class="page-header">
          <a routerLink="/app/users" class="back-link">
            <i class="ph ph-arrow-left"></i>
            Volver a usuarios
          </a>

          <div class="header-content">
            <div class="user-header">
              <div class="user-avatar large">
                @if (user()!.avatarData) {
                  <img [src]="user()!.avatarData" alt="Avatar" />
                } @else {
                  {{ getInitials(user()!) }}
                }
              </div>
              <div class="user-title">
                <h1>{{ getFullName(user()!) }}</h1>
                <div class="user-meta">
                  <span class="role-badge" [class]="'role-' + user()!.role">
                    {{ getRoleDisplayName(user()!.role) }}
                  </span>
                  <span class="status-badge" [class]="'status-' + user()!.status">
                    {{ getStatusDisplayName(user()!.status) }}
                  </span>
                </div>
              </div>
            </div>

            <div class="header-actions">
              @if (canEdit()) {
                <a [routerLink]="['edit']" class="btn btn-secondary">
                  <i class="ph ph-pencil"></i>
                  Editar
                </a>
              }
              @if (canLoginAs()) {
                <button class="btn btn-secondary" (click)="confirmLoginAs()">
                  <i class="ph ph-sign-in"></i>
                  Iniciar como
                </button>
              }
              @if (canSendResetPassword()) {
                <button class="btn btn-secondary" (click)="sendResetPassword()">
                  <i class="ph ph-key"></i>
                  Enviar reset
                </button>
              }
              @if (canDelete()) {
                <button class="btn btn-danger" (click)="confirmDelete()">
                  <i class="ph ph-trash"></i>
                  Eliminar
                </button>
              }
            </div>
          </div>
        </div>

        <!-- Content -->
        <div class="content-grid">
          <!-- Main Info Card -->
          <div class="info-card">
            <h3>Información Personal</h3>
            <div class="info-grid">
              <div class="info-item">
                <label>Email</label>
                <span>{{ user()!.email }}</span>
              </div>
              <div class="info-item">
                <label>Teléfono</label>
                <span>{{ user()!.phone || 'No especificado' }}</span>
              </div>
              <div class="info-item">
                <label>Nombre de usuario</label>
                <span>{{ user()!.username || user()!.email }}</span>
              </div>
              <div class="info-item">
                <label>Código</label>
                <span>{{ user()!.codigo || '-' }}</span>
              </div>
            </div>
          </div>

          <!-- Role Info Card -->
          <div class="info-card">
            <h3>Rol y Permisos</h3>
            <div class="info-grid">
              <div class="info-item">
                <label>Rol</label>
                <span>{{ getRoleDisplayName(user()!.role) }}</span>
              </div>
              <div class="info-item">
                <label>Manager</label>
                <span>{{ managerName() || 'Sin manager asignado' }}</span>
              </div>
              <div class="info-item">
                <label>Puede crear usuarios</label>
                <span>{{ user()!.canCreateUsers ? 'Sí' : 'No' }}</span>
              </div>
              <div class="info-item">
                <label>Contraseña cambiada</label>
                <span>{{ user()!.initialPasswordChanged ? 'Sí' : 'No (temporal)' }}</span>
              </div>
            </div>
          </div>

          <!-- Activity Info Card -->
          <div class="info-card">
            <h3>Actividad</h3>
            <div class="info-grid">
              <div class="info-item">
                <label>Último mensaje</label>
                <span>{{ formatDateTime(user()!.lastMessageAt) }}</span>
              </div>
              <div class="info-item">
                <label>Última actividad</label>
                <span>{{ formatDateTime(user()!.lastHeartbeatAt) }}</span>
              </div>
              <div class="info-item">
                <label>Requiere respuesta</label>
                <span class="badge" [class.badge-warning]="user()!.requireResponse">
                  {{ user()!.requireResponse ? 'Sí' : 'No' }}
                </span>
              </div>
              <div class="info-item">
                <label>Requiere cerrar ticket</label>
                <span class="badge" [class.badge-warning]="user()!.requireCloseTicket">
                  {{ user()!.requireCloseTicket ? 'Sí' : 'No' }}
                </span>
              </div>
            </div>
          </div>

          <!-- System Info Card -->
          <div class="info-card">
            <h3>Información del Sistema</h3>
            <div class="info-grid">
              <div class="info-item">
                <label>ID</label>
                <span class="mono">{{ user()!.id }}</span>
              </div>
              <div class="info-item">
                <label>Cliente ID</label>
                <span class="mono">{{ user()!.clientId }}</span>
              </div>
              <div class="info-item">
                <label>Zona horaria</label>
                <span>{{ user()!.timeZone }}</span>
              </div>
              <div class="info-item">
                <label>Idioma</label>
                <span>{{ user()!.locale }}</span>
              </div>
              <div class="info-item">
                <label>Creado</label>
                <span>{{ formatDateTime(user()!.createdAt) }}</span>
              </div>
              <div class="info-item">
                <label>Actualizado</label>
                <span>{{ formatDateTime(user()!.updatedAt) }}</span>
              </div>
            </div>
          </div>

          <!-- Subordinates Card (if any) -->
          @if (hasSubordinates()) {
            <div class="info-card full-width">
              <h3>Subordinados ({{ subTotalRecords }})</h3>
              <div class="sub-controls">
                <div class="page-size-wrapper">
                  <label>Mostrar</label>
                  <select class="page-size-select" [(ngModel)]="subPageSize" (ngModelChange)="onSubPageSizeChange()">
                    <option [ngValue]="10">10</option>
                    <option [ngValue]="25">25</option>
                    <option [ngValue]="50">50</option>
                    <option [ngValue]="100">100</option>
                  </select>
                  <label>entradas</label>
                </div>
                <div class="sub-search-wrapper">
                  <label>Buscar:</label>
                  <input type="text" class="form-control sub-search-input"
                    [(ngModel)]="subSearchTerm"
                    (ngModelChange)="onSubSearchChange($event)"
                    placeholder="" />
                </div>
              </div>

              @if (isLoadingSubordinates()) {
                <div class="sub-loading">
                  <div class="spinner"></div>
                  <span>Cargando...</span>
                </div>
              } @else {
                <div class="subordinates-list">
                  @for (sub of paginatedSubordinates(); track sub.id) {
                    <a [routerLink]="['/app/users', sub.id]" class="subordinate-item">
                      <div class="sub-avatar">{{ getInitials(sub) }}</div>
                      <div class="sub-info">
                        <span class="sub-name">{{ getFullName(sub) }}</span>
                        <span class="sub-email">{{ sub.email }}</span>
                      </div>
                      <span class="role-badge small" [class]="'role-' + sub.role">
                        {{ getRoleDisplayName(sub.role) }}
                      </span>
                    </a>
                  } @empty {
                    <div class="empty-sub">No se encontraron subordinados</div>
                  }
                </div>
              }

              <!-- Pagination footer -->
              <div class="sub-footer">
                <div class="sub-footer-info">
                  Mostrando {{ paginatedSubordinates().length ? subCurrentPage * subPageSize + 1 : 0 }}
                  a {{ subCurrentPage * subPageSize + paginatedSubordinates().length }}
                  de {{ subTotalRecords }} registros
                </div>
                @if (subTotalPages > 1) {
                  <div class="sub-pagination">
                    <button class="sub-page-btn" [disabled]="subCurrentPage === 0" (click)="goToSubPage(0)">Primera</button>
                    <button class="sub-page-btn" [disabled]="subCurrentPage === 0" (click)="goToSubPage(subCurrentPage - 1)">Anterior</button>
                    <span class="sub-page-info">Página {{ subCurrentPage + 1 }} de {{ subTotalPages }}</span>
                    <button class="sub-page-btn" [disabled]="subCurrentPage >= subTotalPages - 1" (click)="goToSubPage(subCurrentPage + 1)">Siguiente</button>
                    <button class="sub-page-btn" [disabled]="subCurrentPage >= subTotalPages - 1" (click)="goToSubPage(subTotalPages - 1)">Última</button>
                  </div>
                }
              </div>
            </div>
          }
        </div>
      } @else {
        <div class="not-found">
          <i class="ph ph-user-circle"></i>
          <h2>Usuario no encontrado</h2>
          <a routerLink="/app/users" class="btn btn-primary">Volver a usuarios</a>
        </div>
      }

      <!-- Delete Confirmation -->
      @if (showDeleteConfirm()) {
        <app-confirm-dialog
          title="Eliminar Usuario"
          [message]="'¿Estás seguro de eliminar a ' + getFullName(user()!) + '? Esta acción desactivará al usuario.'"
          confirmText="Eliminar"
          confirmClass="btn-danger"
          (confirm)="deleteUser()"
          (cancel)="showDeleteConfirm.set(false)"
        />
      }

      <!-- Login As Confirmation -->
      @if (showLoginAsConfirm()) {
        <app-confirm-dialog
          title="Iniciar sesión como"
          [message]="'¿Deseas iniciar sesión como ' + getFullName(user()!) + '? Podrás volver a tu cuenta después.'"
          confirmText="Iniciar como"
          (confirm)="loginAs()"
          (cancel)="showLoginAsConfirm.set(false)"
        />
      }
    </div>
  `,
  styles: [`
    .user-detail-container {
      padding: 24px;
      background: var(--bg-base);
      min-height: 100%;
    }

    .page-header {
      margin-bottom: 24px;

      .back-link {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        color: var(--fg-muted);
        text-decoration: none;
        font-size: 14px;
        margin-bottom: 16px;

        &:hover { color: var(--accent-default); }
      }
    }

    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
      flex-wrap: wrap;
    }

    .user-header {
      display: flex;
      align-items: center;
      gap: 20px;
    }

    .user-avatar {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: var(--accent-default);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 18px;

      &.large {
        width: 80px;
        height: 80px;
        font-size: 28px;
      }

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 50%;
      }
    }

    .user-title {
      h1 {
        margin: 0 0 8px 0;
        font-size: 28px;
        font-weight: 600;
        color: var(--fg-default);
      }
    }

    .user-meta {
      display: flex;
      gap: 8px;
    }

    .header-actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.2s;
      border: none;

      i { font-size: 18px; }

      &.btn-primary {
        background: var(--accent-default);
        color: white;
        &:hover { background: var(--accent-emphasis); }
      }

      &.btn-secondary {
        background: var(--card-bg);
        color: var(--fg-default);
        border: 1px solid var(--border-default);
        &:hover { background: var(--bg-subtle); }
      }

      &.btn-danger {
        background: var(--error-default);
        color: white;
        &:hover { opacity: 0.9; }
      }
    }

    .content-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 24px;

      @media (max-width: 900px) {
        grid-template-columns: 1fr;
      }
    }

    .info-card {
      background: var(--card-bg);
      border-radius: 12px;
      border: 1px solid var(--card-border);
      padding: 24px;

      &.full-width {
        grid-column: 1 / -1;
      }

      h3 {
        margin: 0 0 20px 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--fg-default);
        padding-bottom: 12px;
        border-bottom: 1px solid var(--border-default);
      }
    }

    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;

      @media (max-width: 600px) {
        grid-template-columns: 1fr;
      }
    }

    .info-item {
      label {
        display: block;
        font-size: 12px;
        font-weight: 500;
        color: var(--fg-muted);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 4px;
      }

      span {
        font-size: 14px;
        color: var(--fg-default);

        &.mono {
          font-family: 'Fira Code', monospace;
          font-size: 13px;
        }
      }
    }

    .role-badge, .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 500;

      &.small {
        padding: 2px 8px;
        font-size: 11px;
      }
    }

    .role-badge {
      background: var(--bg-muted);
      color: var(--fg-default);

      &.role-1 { background: var(--warning-subtle); color: var(--warning-text); }
      &.role-2 { background: var(--info-subtle); color: var(--info-text); }
      &.role-7 { background: var(--success-subtle); color: var(--success-text); }
      &.role-8 { background: var(--accent-subtle); color: var(--accent-default); }
    }

    .status-badge {
      &.status-0 { background: var(--success-subtle); color: var(--success-text); }
      &.status-1 { background: var(--error-subtle); color: var(--error-text); }
      &.status-2 { background: var(--warning-subtle); color: var(--warning-text); }
    }

    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      background: var(--bg-muted);
      color: var(--fg-default);

      &.badge-warning {
        background: var(--warning-subtle);
        color: var(--warning-text);
      }
    }

    .subordinates-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .subordinate-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: var(--bg-subtle);
      border-radius: 8px;
      text-decoration: none;
      transition: background 0.2s;

      &:hover { background: var(--bg-muted); }

      .sub-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: var(--accent-default);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        font-size: 14px;
      }

      .sub-info {
        flex: 1;

        .sub-name {
          display: block;
          font-weight: 500;
          color: var(--fg-default);
        }

        .sub-email {
          font-size: 13px;
          color: var(--fg-muted);
        }
      }
    }

    .sub-controls {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .page-size-wrapper {
      display: flex;
      align-items: center;
      gap: 8px;

      label {
        font-size: 13px;
        color: var(--fg-muted);
      }
    }

    .page-size-select {
      width: auto;
      padding: 6px 10px;
      border: 1px solid var(--input-border);
      border-radius: 6px;
      font-size: 13px;
      background: var(--input-bg);
      color: var(--fg-default);
    }

    .sub-search-wrapper {
      display: flex;
      align-items: center;
      gap: 8px;

      label {
        font-size: 13px;
        color: var(--fg-muted);
      }
    }

    .sub-search-input {
      width: 200px;
      padding: 6px 10px;
      border: 1px solid var(--input-border);
      border-radius: 6px;
      font-size: 13px;
      background: var(--input-bg);
      color: var(--fg-default);
    }

    .sub-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--border-default);
    }

    .sub-footer-info {
      font-size: 13px;
      color: var(--fg-muted);
    }

    .sub-pagination {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .sub-page-info {
      font-size: 13px;
      color: var(--fg-muted);
    }

    .sub-page-btn {
      padding: 4px 10px;
      border: 1px solid var(--border-default);
      border-radius: 6px;
      background: var(--card-bg);
      color: var(--fg-default);
      cursor: pointer;
      font-size: 12px;

      &:hover:not(:disabled) {
        background: var(--bg-muted);
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }

    .sub-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 24px;
      color: var(--fg-muted);
      font-size: 13px;
    }

    .empty-sub {
      text-align: center;
      padding: 24px;
      color: var(--fg-muted);
      font-size: 13px;
    }

    .not-found {
      text-align: center;
      padding: 80px 24px;

      i {
        font-size: 80px;
        color: var(--fg-subtle);
        margin-bottom: 24px;
      }

      h2 {
        margin: 0 0 24px 0;
        color: var(--fg-muted);
      }
    }
  `]
})
export class UserDetailComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private userService = inject(UserService);
  private authService = inject(AuthService);

  // State
  isLoading = signal(true);
  user = signal<User | null>(null);
  subordinates = signal<any[]>([]);
  managerName = signal<string | null>(null);
  showDeleteConfirm = signal(false);
  showLoginAsConfirm = signal(false);

  // Subordinates pagination & search
  hasSubordinates = signal(false);
  subSearchTerm = '';
  subCurrentPage = 0;
  subPageSize = 10;
  subTotalRecords = 0;
  subTotalPages = 0;
  isLoadingSubordinates = signal(false);
  paginatedSubordinates = signal<any[]>([]);
  private subSearchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();

  // Current user
  currentUser = this.authService.currentUser;

  ngOnInit(): void {
    this.subSearchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.subCurrentPage = 0;
      this.loadSubordinates();
    });

    const id = this.route.snapshot.params['id'];
    if (id) {
      this.loadUser(parseInt(id, 10));
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadUser(id: number): void {
    this.isLoading.set(true);
    this.userService.getUser(id).subscribe({
      next: (response: UserDetailResponse) => {
        this.user.set(response.user);
        this.subordinates.set(response.subordinates || []);
        this.hasSubordinates.set((response.subordinates || []).length > 0);
        this.managerName.set(response.manager?.name || null);
        this.isLoading.set(false);
        if ((response.subordinates || []).length > 0) {
          this.loadSubordinates();
        }
      },
      error: (err) => {
        console.error('Error loading user:', err);
        this.isLoading.set(false);
      }
    });
  }

  private loadSubordinates(): void {
    const user = this.user();
    if (!user) return;
    this.isLoadingSubordinates.set(true);
    this.userService.getUserSubordinates(user.id, {
      page: this.subCurrentPage,
      pageSize: this.subPageSize,
      search: this.subSearchTerm || undefined
    }).subscribe({
      next: (response) => {
        this.paginatedSubordinates.set(response.data);
        this.subTotalRecords = response.meta.totalItems;
        this.subTotalPages = response.meta.totalPages;
        this.isLoadingSubordinates.set(false);
      },
      error: () => this.isLoadingSubordinates.set(false)
    });
  }

  onSubSearchChange(term: string): void {
    this.subSearchSubject.next(term);
  }

  onSubPageSizeChange(): void {
    this.subCurrentPage = 0;
    this.loadSubordinates();
  }

  goToSubPage(page: number): void {
    if (page < 0 || page >= this.subTotalPages) return;
    this.subCurrentPage = page;
    this.loadSubordinates();
  }

  canEdit(): boolean {
    const current = this.currentUser();
    const user = this.user();
    if (!current || !user) return false;

    if (current.role === UserRole.SUPER_ADMIN) return true;
    if (current.role === UserRole.ADMIN) return true;
    if (current.role === UserRole.STAFF) return true;
    if (RoleUtils.isManager(current.role) && user.managerId === current.id) return true;

    return false;
  }

  canDelete(): boolean {
    const current = this.currentUser();
    const user = this.user();
    if (!current || !user) return false;
    if (user.id === current.id) return false;

    if (current.role === UserRole.SUPER_ADMIN) return true;
    if (current.role === UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) return true;

    return false;
  }

  canLoginAs(): boolean {
    const current = this.currentUser();
    const user = this.user();
    if (!current || !user) return false;
    if (user.id === current.id) return false;

    return current.role === UserRole.SUPER_ADMIN || current.role === UserRole.ADMIN;
  }

  canSendResetPassword(): boolean {
    const current = this.currentUser();
    if (!current) return false;

    return current.role === UserRole.SUPER_ADMIN || current.role === UserRole.ADMIN;
  }

  confirmDelete(): void {
    this.showDeleteConfirm.set(true);
  }

  confirmLoginAs(): void {
    this.showLoginAsConfirm.set(true);
  }

  deleteUser(): void {
    const user = this.user();
    if (!user) return;

    this.userService.deleteUser(user.id).subscribe({
      next: () => {
        this.router.navigate(['/app/users']);
      },
      error: (err) => {
        console.error('Error deleting user:', err);
        this.showDeleteConfirm.set(false);
      }
    });
  }

  loginAs(): void {
    const user = this.user();
    if (!user) return;

    this.userService.loginAs(user.id).subscribe({
      next: (response) => {
        // Store original user ID and switch to new token
        localStorage.setItem('originalUserId', response.originalUserId.toString());
        localStorage.setItem('token', response.token);
        window.location.reload();
      },
      error: (err) => {
        console.error('Error logging in as user:', err);
        this.showLoginAsConfirm.set(false);
      }
    });
  }

  sendResetPassword(): void {
    const user = this.user();
    if (!user) return;

    this.userService.sendResetPassword(user.id).subscribe({
      next: () => {
        alert('Instrucciones de reset enviadas al usuario');
      },
      error: (err) => {
        console.error('Error sending reset password:', err);
        alert('Error al enviar instrucciones');
      }
    });
  }

  getFullName(user: User): string {
    return getFullName(user);
  }

  getInitials(user: any): string {
    return getInitials(user);
  }

  getRoleDisplayName(role: UserRole): string {
    return RoleUtils.getDisplayName(role);
  }

  getStatusDisplayName(status: UserStatus): string {
    const names: Record<UserStatus, string> = {
      [UserStatus.ACTIVE]: 'Activo',
      [UserStatus.INACTIVE]: 'Inactivo',
      [UserStatus.PENDING]: 'Pendiente'
    };
    return names[status] || 'Desconocido';
  }

  formatDateTime(dateStr: string | undefined): string {
    if (!dateStr) return 'Nunca';
    const date = new Date(dateStr);
    return date.toLocaleString('es-PE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
