/**
 * Internal Users Component
 * Lista de usuarios internos (no estándar)
 * PARIDAD: Rails admin/users/internal_users.html.erb
 */
import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { UserService, PaginationParams } from '../../../../core/services/user.service';
import { UserListItem, UserRole, UserStatus, RoleUtils, getFullName } from '../../../../core/models/user.model';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';

@Component({
  selector: 'app-internal-users',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FormsModule,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    PaginationComponent
  ],
  template: `
    <div class="internal-users-container">
      <div class="page-header">
        <div class="header-content">
          <h1>Usuarios Internos</h1>
          <p class="subtitle">Administradores, managers, agentes y staff</p>
        </div>
        <div class="header-actions">
          <a routerLink="/app/users/new" [queryParams]="{ from: 'internal' }" class="btn btn-primary">
            <i class="ph ph-plus"></i>
            Crear Usuario
          </a>
          <a routerLink="/app/imports/new" [queryParams]="{ import_type: 'users' }" class="btn btn-secondary">
            <i class="ph ph-upload-simple"></i>
            Importar
          </a>
        </div>
      </div>

      <div class="filters-bar">
        <div class="search-box">
          <i class="ph ph-magnifying-glass"></i>
          <input
            type="text"
            placeholder="Buscar por nombre, email..."
            [ngModel]="searchTerm()"
            (ngModelChange)="searchTerm.set($event)"
            (input)="onSearch()"
          />
        </div>
      </div>

      @if (isLoading()) {
        <app-loading-spinner [overlay]="false" message="Cargando usuarios..." />
      } @else if (users().length === 0) {
        <app-empty-state
          icon="ph-users-three"
          title="No hay usuarios internos"
          description="No se encontraron usuarios con roles internos"
        />
      } @else {
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Teléfono</th>
                <th>Rol</th>
                <th>Estado</th>
                <th class="actions-col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              @for (user of users(); track user.id) {
                <tr>
                  <td>
                    <div class="user-cell">
                      <div class="user-avatar">{{ getInitials(user) }}</div>
                      <span class="user-name">{{ getFullName(user) }}</span>
                    </div>
                  </td>
                  <td>{{ user.email }}</td>
                  <td>{{ user.phone || '-' }}</td>
                  <td>
                    <span class="role-badge" [class]="'role-' + user.role">
                      {{ getRoleDisplayName(user.role) }}
                    </span>
                  </td>
                  <td>
                    <span class="status-badge" [class]="'status-' + user.status">
                      {{ getStatusDisplayName(user.status) }}
                    </span>
                  </td>
                  <td class="actions-col">
                    <a [routerLink]="['/app/users', user.id]" class="action-btn" title="Ver">
                      <i class="ph ph-eye"></i>
                    </a>
                    <a [routerLink]="['/app/users', user.id, 'edit']" class="action-btn" title="Editar">
                      <i class="ph ph-pencil"></i>
                    </a>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="table-footer">
          <div class="records-info">
            Mostrando {{ startRecord() }} - {{ endRecord() }} de {{ totalRecords() }}
          </div>
          <app-pagination
            [currentPage]="currentPage()"
            [totalItems]="totalRecords()"
            [pageSize]="pageSize()"
            (pageChange)="onPageChange($event)"
            (pageSizeChange)="onPageSizeChange($event)"
          />
        </div>
      }
    </div>
  `,
  styles: [`
    .internal-users-container { padding: 24px; background: var(--bg-base); min-height: 100%; }
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
    .page-header h1 { margin: 0 0 4px 0; font-size: 24px; font-weight: 600; color: var(--fg-default); }
    .subtitle { margin: 0; color: var(--fg-muted); font-size: 14px; }
    .btn { display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 500; text-decoration: none; }
    .btn-primary { background: var(--accent-default); color: white; }
    .btn-primary:hover { background: var(--accent-emphasis); }
    .header-actions { display: flex; gap: 12px; }
    .filters-bar { margin-bottom: 24px; }
    .search-box { position: relative; max-width: 400px; }
    .search-box i { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--fg-muted); }
    .search-box input { width: 100%; padding: 10px 12px 10px 40px; background: var(--input-bg); border: 1px solid var(--input-border); border-radius: 8px; font-size: 14px; color: var(--fg-default); }
    .search-box input:focus { outline: none; border-color: var(--input-border-focus); box-shadow: 0 0 0 3px var(--accent-subtle); }
    .search-box input::placeholder { color: var(--fg-subtle); }
    .table-container { background: var(--card-bg); border-radius: 12px; border: 1px solid var(--card-border); overflow: hidden; }
    .data-table { width: 100%; border-collapse: collapse; }
    .data-table th, .data-table td { padding: 12px 16px; text-align: left; border-bottom: 1px solid var(--table-border); color: var(--fg-default); }
    .data-table th { background: var(--table-header-bg); font-weight: 600; font-size: 13px; color: var(--fg-muted); text-transform: uppercase; }
    .data-table tbody tr:hover { background: var(--table-row-hover); }
    .user-cell { display: flex; align-items: center; gap: 12px; }
    .user-avatar { width: 36px; height: 36px; border-radius: 50%; background: var(--accent-default); color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px; }
    .user-name { font-weight: 500; }
    .role-badge, .status-badge { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 500; }
    .role-badge { background: var(--bg-muted); color: var(--fg-default); }
    .role-badge.role-1 { background: var(--warning-subtle); color: var(--warning-text); }
    .role-badge.role-2 { background: var(--info-subtle); color: var(--info-text); }
    .role-badge.role-7 { background: var(--success-subtle); color: var(--success-text); }
    .role-badge.role-8 { background: var(--accent-subtle); color: var(--accent-default); }
    .status-badge.status-0 { background: var(--success-subtle); color: var(--success-text); }
    .status-badge.status-1 { background: var(--error-subtle); color: var(--error-text); }
    .actions-col { width: 100px; text-align: center; }
    .action-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 6px; background: var(--bg-subtle); color: var(--fg-muted); text-decoration: none; margin: 0 4px; }
    .action-btn:hover { background: var(--accent-default); color: white; }
    .table-footer { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; background: var(--table-header-bg); border-top: 1px solid var(--border-default); }
    .records-info { font-size: 14px; color: var(--fg-muted); }
  `]
})
export class InternalUsersComponent implements OnInit {
  private userService = inject(UserService);

  users = signal<UserListItem[]>([]);
  totalRecords = signal(0);
  isLoading = signal(false);
  searchTerm = signal('');
  currentPage = signal(1);
  pageSize = signal(25);
  totalPages = computed(() => Math.ceil(this.totalRecords() / this.pageSize()));
  startRecord = computed(() => (this.currentPage() - 1) * this.pageSize() + 1);
  endRecord = computed(() => Math.min(this.currentPage() * this.pageSize(), this.totalRecords()));

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    this.isLoading.set(true);

    const params: PaginationParams = {
      page: this.currentPage(),
      pageSize: this.pageSize(),
      search: this.searchTerm() || undefined
    };

    this.userService.getInternalUsers(params).subscribe({
      next: (response) => {
        this.users.set(response.data);
        this.totalRecords.set(response.meta.totalItems);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false)
    });
  }

  onSearch(): void {
    this.currentPage.set(1);
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

  getFullName(user: UserListItem): string { return getFullName(user); }
  getInitials(user: UserListItem): string { return (user.firstName?.charAt(0) || '') + (user.lastName?.charAt(0) || ''); }
  getRoleDisplayName(role: UserRole): string { return RoleUtils.getDisplayName(role); }
  getStatusDisplayName(status: UserStatus): string {
    return { [UserStatus.ACTIVE]: 'Activo', [UserStatus.INACTIVE]: 'Inactivo', [UserStatus.PENDING]: 'Pendiente' }[status] || '';
  }
}
