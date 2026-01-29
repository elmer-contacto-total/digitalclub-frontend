/**
 * User List Component
 * Lista de usuarios con DataTable server-side
 * PARIDAD: Rails admin/users/index.html.erb
 */
import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { UserService, PaginationParams } from '../../../../core/services/user.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../core/services/toast.service';
import { UserListItem, UserRole, UserStatus, RoleUtils, getFullName } from '../../../../core/models/user.model';

// Expose UserStatus to template

import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FormsModule,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    PaginationComponent,
    ConfirmDialogComponent
  ],
  template: `
    <div class="user-list-container">
      <!-- Header - PARIDAD: Rails admin/users/index.html.erb -->
      <div class="page-header">
        <h1>Lista de usuarios</h1>
        <div class="header-actions">
          @if (canCreateUsers()) {
            <a routerLink="new" class="btn btn-primary">
              <i class="bi bi-plus"></i>
              Crear usuario
            </a>
            <a routerLink="import" class="btn btn-secondary">
              <i class="bi bi-upload"></i>
              Importar usuarios
            </a>
          }
        </div>
      </div>

      <!-- Filters -->
      <div class="filters-bar">
        <div class="search-box">
          <i class="ph ph-magnifying-glass"></i>
          <input
            type="text"
            placeholder="Buscar por nombre, email, teléfono..."
            [(ngModel)]="searchTerm"
            (input)="onSearch()"
          />
          @if (searchTerm()) {
            <button class="clear-search" (click)="clearSearch()">
              <i class="ph ph-x"></i>
            </button>
          }
        </div>

        <div class="filter-group">
          <select [(ngModel)]="roleFilter" (change)="onFilterChange()">
            <option value="">Todos los roles</option>
            @for (role of availableRoles; track role.value) {
              <option [value]="role.value">{{ role.label }}</option>
            }
          </select>

          <select [(ngModel)]="statusFilter" (change)="onFilterChange()">
            <option value="">Todos los estados</option>
            <option value="0">Activo</option>
            <option value="1">Inactivo</option>
            <option value="2">Pendiente</option>
          </select>
        </div>
      </div>

      <!-- Content -->
      @if (isLoading()) {
        <app-loading-spinner [overlay]="false" message="Cargando usuarios..." />
      } @else if (users().length === 0) {
        <app-empty-state
          icon="ph-users"
          title="No hay usuarios"
          [description]="searchTerm() ? 'No se encontraron usuarios con ese criterio' : 'Aún no hay usuarios registrados'"
        >
          @if (canCreateUsers() && !searchTerm()) {
            <a routerLink="new" class="btn btn-primary">
              <i class="ph ph-plus"></i>
              Crear primer usuario
            </a>
          }
        </app-empty-state>
      } @else {
        <!-- Table -->
        <div class="table-container">
          <table class="data-table">
            <!-- PARIDAD: Rails DataTable columns -->
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Teléfono</th>
                <th>Rol</th>
                <th>Manager</th>
                <th>Estado</th>
                <th class="actions-col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              @for (user of users(); track user.id) {
                <tr>
                  <td>{{ getFullName(user) }}</td>
                  <td>{{ user.email }}</td>
                  <td>{{ user.phone || '-' }}</td>
                  <td>{{ getRoleDisplayName(user.role) }}</td>
                  <td>{{ user.managerName || '-' }}</td>
                  <td>
                    <span class="status-badge" [class.active]="user.status === UserStatus.ACTIVE">
                      {{ getStatusDisplayName(user.status) }}
                    </span>
                  </td>
                  <td class="actions-col">
                    <div class="action-buttons">
                      <a [routerLink]="[user.id]" class="btn btn-sm btn-secondary" title="Ver">
                        <i class="bi bi-eye"></i>
                      </a>
                      @if (canEditUser(user)) {
                        <a [routerLink]="[user.id, 'edit']" class="btn btn-sm btn-secondary" title="Editar">
                          <i class="bi bi-pencil"></i>
                        </a>
                      }
                      @if (canDeleteUser(user)) {
                        <button class="btn btn-sm btn-danger" (click)="confirmDelete(user)" title="Eliminar">
                          <i class="bi bi-trash"></i>
                        </button>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div class="table-footer">
          <div class="records-info">
            Mostrando {{ startRecord() }} - {{ endRecord() }} de {{ totalRecords() }} usuarios
          </div>
          <app-pagination
            [currentPage]="currentPage()"
            [totalItems]="totalRecords()"
            [pageSize]="pageSize()"
            [pageSizeOptions]="[10, 25, 50, 100]"
            (pageChange)="onPageChange($event)"
            (pageSizeChange)="onPageSizeChange($event)"
          />
        </div>
      }

      <!-- Delete Confirmation Dialog -->
      @if (userToDelete()) {
        <app-confirm-dialog
          title="Eliminar Usuario"
          [message]="'¿Estás seguro de eliminar a ' + getFullName(userToDelete()!) + '? Esta acción desactivará al usuario.'"
          confirmText="Eliminar"
          confirmClass="btn-danger"
          (confirm)="deleteUser()"
          (cancel)="userToDelete.set(null)"
        />
      }
    </div>
  `,
  styles: [`
    .user-list-container {
      padding: 24px;
    }

    /* Page Header - PARIDAD: Rails page-header */
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;

      h1 {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 500;
        color: var(--text-primary, #212529);
      }
    }

    .header-actions {
      display: flex;
      gap: 8px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border: 1px solid transparent;
      border-radius: 4px;
      font-size: 14px;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.15s;

      &:disabled {
        opacity: 0.65;
        cursor: not-allowed;
      }
    }

    .btn-primary {
      background-color: var(--primary-color, #0d6efd);
      border-color: var(--primary-color, #0d6efd);
      color: white;

      &:hover {
        background-color: var(--primary-dark, #0b5ed7);
        border-color: var(--primary-dark, #0b5ed7);
      }
    }

    .btn-secondary {
      background-color: var(--secondary-color, #6c757d);
      border-color: var(--secondary-color, #6c757d);
      color: white;

      &:hover {
        background-color: #5c636a;
        border-color: #565e64;
      }
    }

    .btn-danger {
      background-color: var(--danger-color, #dc3545);
      border-color: var(--danger-color, #dc3545);
      color: white;

      &:hover {
        background-color: #bb2d3b;
        border-color: #b02a37;
      }
    }

    .btn-sm {
      padding: 4px 8px;
      font-size: 12px;
    }

    /* DataTable Header */
    .datatable-header {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 16px;
    }

    .search-wrapper {
      display: flex;
      align-items: center;
      gap: 8px;

      label {
        font-size: 14px;
        color: var(--text-secondary, #6c757d);
      }
    }

    .search-input {
      width: 200px;
      padding: 6px 12px;
      border: 1px solid var(--border-color, #ced4da);
      border-radius: 4px;
      font-size: 14px;

      &:focus {
        outline: none;
        border-color: var(--primary-color, #86b7fe);
        box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.25);
      }
    }

    .filters-bar {
      display: flex;
      gap: 16px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }

    .search-box {
      flex: 1;
      min-width: 200px;
      position: relative;

      i {
        position: absolute;
        left: 12px;
        top: 50%;
        transform: translateY(-50%);
        color: var(--text-secondary);
        font-size: 18px;
      }

      input {
        width: 100%;
        padding: 6px 36px 6px 40px;
        border: 1px solid var(--border-color, #ced4da);
        border-radius: 4px;
        font-size: 14px;

        &:focus {
          outline: none;
          border-color: var(--primary-color, #86b7fe);
          box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.25);
        }
      }

      .clear-search {
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        background: none;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        padding: 4px;

        &:hover { color: var(--text-primary); }
      }
    }

    .filter-group {
      display: flex;
      gap: 12px;

      select {
        padding: 6px 12px;
        border: 1px solid var(--border-color, #ced4da);
        border-radius: 4px;
        font-size: 14px;
        background: white;
        cursor: pointer;

        &:focus {
          outline: none;
          border-color: var(--primary-color, #86b7fe);
        }
      }
    }

    /* Table - PARIDAD: Rails DataTable */
    .table-container {
      background: white;
      border-radius: 4px;
      overflow: auto;
    }

    .data-table {
      width: 100%;
      margin: 0;
      border-collapse: collapse;
      font-size: 14px;
    }

    .data-table th,
    .data-table td {
      padding: 12px;
      border: 1px solid var(--border-color, #dee2e6);
      vertical-align: middle;
    }

    .data-table thead th {
      background: var(--bg-light, #f8f9fa);
      font-weight: 600;
      color: var(--text-primary, #212529);
      text-align: left;
      white-space: nowrap;
    }

    .data-table tbody tr:nth-of-type(odd) {
      background: rgba(0, 0, 0, 0.02);
    }

    .data-table tbody tr:hover {
      background: rgba(0, 0, 0, 0.05);
    }

    /* Status Badge */
    .status-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      background: #fee2e2;
      color: #991b1b;

      &.active {
        background: #d1fae5;
        color: #065f46;
      }
    }

    /* Actions Column */
    .actions-col {
      width: 140px;
      text-align: center;
    }

    .action-buttons {
      display: flex;
      gap: 4px;
      justify-content: center;
      flex-wrap: wrap;
    }

    /* Table Footer */
    .table-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: white;
      border: 1px solid var(--border-color, #dee2e6);
      border-top: none;
      font-size: 13px;
    }

    .records-info {
      color: var(--text-secondary, #6c757d);
    }

    @media (max-width: 768px) {
      .user-list-container { padding: 16px; }
      .page-header { flex-direction: column; gap: 16px; align-items: flex-start; }
      .header-actions { flex-wrap: wrap; }
      .filters-bar { flex-direction: column; }
      .search-box { min-width: 100%; }
      .filter-group { width: 100%; flex-wrap: wrap; }
      .filter-group select { flex: 1; }
      .table-container { overflow-x: auto; }
      .data-table { min-width: 700px; }
    }
  `]
})
export class UserListComponent implements OnInit, OnDestroy {
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);
  private destroy$ = new Subject<void>();

  // Expose enum to template
  UserStatus = UserStatus;

  // Data
  users = signal<UserListItem[]>([]);
  totalRecords = signal(0);
  isLoading = signal(false);
  userToDelete = signal<UserListItem | null>(null);

  // Filters
  searchTerm = signal('');
  roleFilter = '';
  statusFilter = '';

  // Pagination
  currentPage = signal(1);
  pageSize = signal(25);
  totalPages = computed(() => Math.ceil(this.totalRecords() / this.pageSize()));

  // Sorting
  sortColumn = signal('createdAt');
  sortDirection = signal<'asc' | 'desc'>('desc');

  // Computed
  startRecord = computed(() => (this.currentPage() - 1) * this.pageSize() + 1);
  endRecord = computed(() => Math.min(this.currentPage() * this.pageSize(), this.totalRecords()));

  // Current user
  currentUser = this.authService.currentUser;

  // Role options
  availableRoles = [
    { value: UserRole.STANDARD, label: 'Estándar' },
    { value: UserRole.SUPER_ADMIN, label: 'Super Admin' },
    { value: UserRole.ADMIN, label: 'Administrador' },
    { value: UserRole.MANAGER_LEVEL_1, label: 'Manager Nivel 1' },
    { value: UserRole.MANAGER_LEVEL_2, label: 'Manager Nivel 2' },
    { value: UserRole.MANAGER_LEVEL_3, label: 'Manager Nivel 3' },
    { value: UserRole.MANAGER_LEVEL_4, label: 'Manager Nivel 4' },
    { value: UserRole.AGENT, label: 'Agente' },
    { value: UserRole.STAFF, label: 'Staff' },
    { value: UserRole.WHATSAPP_BUSINESS, label: 'WhatsApp Business' }
  ];

  private searchTimeout: ReturnType<typeof setTimeout> | null = null;
  private drawCounter = 0;

  ngOnInit(): void {
    this.loadUsers();
  }

  ngOnDestroy(): void {
    // Clean up timeout
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
    // Complete all subscriptions
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadUsers(): void {
    this.isLoading.set(true);

    const params: PaginationParams = {
      page: this.currentPage(),
      pageSize: this.pageSize(),
      search: this.searchTerm() || undefined,
      sortBy: this.sortColumn(),
      sortDir: this.sortDirection()
    };

    this.userService.getUsers(params).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        this.users.set(response.data);
        this.totalRecords.set(response.meta.totalItems);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading users:', err);
        this.toast.error('Error al cargar usuarios');
        this.isLoading.set(false);
      }
    });
  }

  onSearch(): void {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
    this.searchTimeout = setTimeout(() => {
      this.currentPage.set(1);
      this.loadUsers();
    }, 300);
  }

  clearSearch(): void {
    this.searchTerm.set('');
    this.currentPage.set(1);
    this.loadUsers();
  }

  onFilterChange(): void {
    this.currentPage.set(1);
    this.loadUsers();
  }

  onSort(column: string): void {
    if (this.sortColumn() === column) {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set('asc');
    }
    this.loadUsers();
  }

  onPageChange(page: number): void {
    this.currentPage.set(page);
    this.loadUsers();
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
    this.loadUsers();
  }

  canCreateUsers(): boolean {
    const user = this.currentUser();
    if (!user) return false;
    return RoleUtils.canManageUsers(user.role);
  }

  canEditUser(user: UserListItem): boolean {
    const current = this.currentUser();
    if (!current) return false;

    // Super admin can edit anyone
    if (current.role === UserRole.SUPER_ADMIN) return true;

    // Admin can edit users in same client
    if (current.role === UserRole.ADMIN) return true;

    // Staff can edit
    if (current.role === UserRole.STAFF) return true;

    // Managers can edit their subordinates
    if (RoleUtils.isManager(current.role)) {
      return user.managerId === current.id;
    }

    return false;
  }

  canDeleteUser(user: UserListItem): boolean {
    const current = this.currentUser();
    if (!current) return false;

    // Can't delete yourself
    if (user.id === current.id) return false;

    // Super admin can delete anyone
    if (current.role === UserRole.SUPER_ADMIN) return true;

    // Admin can delete users in same client (except other admins)
    if (current.role === UserRole.ADMIN) {
      return user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN;
    }

    return false;
  }

  confirmDelete(user: UserListItem): void {
    this.userToDelete.set(user);
  }

  deleteUser(): void {
    const user = this.userToDelete();
    if (!user) return;

    this.userService.deleteUser(user.id).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.userToDelete.set(null);
        this.toast.success('Usuario eliminado correctamente');
        this.loadUsers();
      },
      error: (err) => {
        console.error('Error deleting user:', err);
        this.toast.error('Error al eliminar usuario');
        this.userToDelete.set(null);
      }
    });
  }

  getFullName(user: UserListItem): string {
    return getFullName(user);
  }

  getInitials(user: UserListItem): string {
    const first = user.firstName?.charAt(0) || '';
    const last = user.lastName?.charAt(0) || '';
    return (first + last).toUpperCase();
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

  formatDate(dateStr: string): string {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-PE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
}
