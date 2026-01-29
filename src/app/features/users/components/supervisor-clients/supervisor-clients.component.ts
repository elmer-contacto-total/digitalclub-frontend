/**
 * Supervisor Clients Component
 * Clientes asignados a agentes bajo el supervisor
 * PARIDAD: Rails admin/users/supervisor_clients.html.erb
 */
import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { UserService, PaginationParams } from '../../../../core/services/user.service';
import { UserListItem, UserStatus, getFullName } from '../../../../core/models/user.model';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';

@Component({
  selector: 'app-supervisor-clients',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, LoadingSpinnerComponent, EmptyStateComponent, PaginationComponent],
  template: `
    <div class="supervisor-clients-container">
      <div class="page-header">
        <h1>Mis Clientes</h1>
        <p class="subtitle">Clientes asignados a mis agentes</p>
      </div>

      <div class="filters-bar">
        <div class="search-box">
          <i class="ph ph-magnifying-glass"></i>
          <input type="text" placeholder="Buscar cliente..." [(ngModel)]="searchTerm" (input)="onSearch()" />
        </div>
      </div>

      @if (isLoading()) {
        <app-loading-spinner [overlay]="false" message="Cargando clientes..." />
      } @else if (clients().length === 0) {
        <app-empty-state icon="ph-users" title="No hay clientes" description="No hay clientes asignados a tus agentes" />
      } @else {
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Email</th>
                <th>Teléfono</th>
                <th>Estado</th>
                <th>Creado</th>
                <th class="actions-col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              @for (client of clients(); track client.id) {
                <tr>
                  <td>
                    <div class="user-cell">
                      <div class="user-avatar">{{ getInitials(client) }}</div>
                      <span>{{ getFullName(client) }}</span>
                    </div>
                  </td>
                  <td>{{ client.email }}</td>
                  <td>{{ client.phone || '-' }}</td>
                  <td>
                    <span class="status-badge" [class]="'status-' + client.status">
                      {{ getStatusDisplayName(client.status) }}
                    </span>
                  </td>
                  <td>{{ formatDate(client.createdAt) }}</td>
                  <td class="actions-col">
                    <a [routerLink]="['/app/users', client.id]" class="action-btn"><i class="ph ph-eye"></i></a>
                    <a [routerLink]="['/app/chat', client.id]" class="action-btn"><i class="ph ph-chat-circle"></i></a>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="table-footer">
          <span class="records-info">{{ startRecord() }} - {{ endRecord() }} de {{ totalRecords() }}</span>
          <app-pagination [currentPage]="currentPage()" [totalItems]="totalRecords()" [pageSize]="pageSize()" (pageChange)="onPageChange($event)" (pageSizeChange)="onPageSizeChange($event)" />
        </div>
      }
    </div>
  `,
  styles: [`
    .supervisor-clients-container { padding: 24px; }
    .page-header { margin-bottom: 24px; }
    .page-header h1 { margin: 0 0 4px 0; font-size: 24px; font-weight: 600; }
    .subtitle { margin: 0; color: var(--text-secondary); font-size: 14px; }
    .filters-bar { margin-bottom: 24px; }
    .search-box { position: relative; max-width: 400px; }
    .search-box i { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-secondary); }
    .search-box input { width: 100%; padding: 10px 12px 10px 40px; border: 1px solid var(--border-color); border-radius: 8px; }
    .table-container { background: white; border-radius: 12px; border: 1px solid var(--border-color); overflow: hidden; }
    .data-table { width: 100%; border-collapse: collapse; }
    .data-table th, .data-table td { padding: 12px 16px; text-align: left; border-bottom: 1px solid var(--border-color); }
    .data-table th { background: var(--bg-secondary); font-weight: 600; font-size: 13px; color: var(--text-secondary); text-transform: uppercase; }
    .data-table tbody tr:hover { background: var(--bg-hover); }
    .user-cell { display: flex; align-items: center; gap: 12px; }
    .user-avatar { width: 36px; height: 36px; border-radius: 50%; background: var(--primary-color); color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px; }
    .status-badge { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 500; }
    .status-badge.status-0 { background: #d1fae5; color: #065f46; }
    .status-badge.status-1 { background: #fee2e2; color: #991b1b; }
    .actions-col { width: 100px; text-align: center; }
    .action-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 6px; background: var(--bg-secondary); color: var(--text-secondary); text-decoration: none; margin: 0 4px; }
    .action-btn:hover { background: var(--primary-color); color: white; }
    .table-footer { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; background: white; }
    .records-info { font-size: 14px; color: var(--text-secondary); }
  `]
})
export class SupervisorClientsComponent implements OnInit {
  private userService = inject(UserService);

  clients = signal<UserListItem[]>([]);
  totalRecords = signal(0);
  isLoading = signal(false);
  searchTerm = signal('');
  currentPage = signal(1);
  pageSize = signal(25);
  totalPages = computed(() => Math.ceil(this.totalRecords() / this.pageSize()));
  startRecord = computed(() => (this.currentPage() - 1) * this.pageSize() + 1);
  endRecord = computed(() => Math.min(this.currentPage() * this.pageSize(), this.totalRecords()));

  ngOnInit(): void { this.loadClients(); }

  loadClients(): void {
    this.isLoading.set(true);
    const params: PaginationParams = {
      page: this.currentPage(),
      pageSize: this.pageSize(),
      search: this.searchTerm() || undefined
    };
    this.userService.getSupervisorClients(params).subscribe({
      next: (r) => { this.clients.set(r.data); this.totalRecords.set(r.meta.totalItems); this.isLoading.set(false); },
      error: () => this.isLoading.set(false)
    });
  }

  onSearch(): void { this.currentPage.set(1); this.loadClients(); }
  onPageChange(page: number): void { this.currentPage.set(page); this.loadClients(); }
  onPageSizeChange(size: number): void { this.pageSize.set(size); this.currentPage.set(1); this.loadClients(); }

  getFullName(u: UserListItem): string { return getFullName(u); }
  getInitials(u: UserListItem): string { return (u.firstName?.charAt(0) || '') + (u.lastName?.charAt(0) || ''); }
  getStatusDisplayName(s: UserStatus): string { return { [UserStatus.ACTIVE]: 'Activo', [UserStatus.INACTIVE]: 'Inactivo', [UserStatus.PENDING]: 'Pendiente' }[s] || ''; }
  formatDate(d: string): string { return d ? new Date(d).toLocaleDateString('es-PE', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'; }
}
