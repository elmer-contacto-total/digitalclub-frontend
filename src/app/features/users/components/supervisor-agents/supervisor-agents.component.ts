/**
 * Supervisor Agents Component
 * Agentes bajo supervisión
 * PARIDAD: Rails admin/users/supervisor_agents.html.erb
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
  selector: 'app-supervisor-agents',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, LoadingSpinnerComponent, EmptyStateComponent, PaginationComponent],
  template: `
    <div class="supervisor-agents-container">
      <div class="page-header">
        <h1>Mis Agentes</h1>
        <p class="subtitle">Agentes bajo mi supervisión</p>
      </div>

      <div class="filters-bar">
        <div class="search-box">
          <i class="ph ph-magnifying-glass"></i>
          <input type="text" placeholder="Buscar agente..." [(ngModel)]="searchTerm" (input)="onSearch()" />
        </div>
      </div>

      @if (isLoading()) {
        <app-loading-spinner [overlay]="false" message="Cargando agentes..." />
      } @else if (agents().length === 0) {
        <app-empty-state icon="ph-users-three" title="No hay agentes" description="No tienes agentes asignados" />
      } @else {
        <div class="agents-grid">
          @for (agent of agents(); track agent.id) {
            <div class="agent-card">
              <div class="agent-header">
                <div class="agent-avatar">{{ getInitials(agent) }}</div>
                <div class="agent-info">
                  <h3>{{ getFullName(agent) }}</h3>
                  <span class="agent-email">{{ agent.email }}</span>
                </div>
                <span class="status-badge" [class]="'status-' + agent.status">
                  {{ getStatusDisplayName(agent.status) }}
                </span>
              </div>
              <div class="agent-meta">
                <div class="meta-item">
                  <i class="ph ph-phone"></i>
                  <span>{{ agent.phone || 'Sin teléfono' }}</span>
                </div>
                <div class="meta-item">
                  <i class="ph ph-identification-badge"></i>
                  <span>{{ getRoleDisplayName(agent.role) }}</span>
                </div>
              </div>
              <div class="agent-actions">
                <a [routerLink]="['/app/users', agent.id]" class="btn btn-sm">Ver perfil</a>
                <a [routerLink]="['/app/chat']" [queryParams]="{agentId: agent.id}" class="btn btn-sm btn-outline">Ver clientes</a>
              </div>
            </div>
          }
        </div>

        <div class="table-footer">
          <span class="records-info">{{ startRecord() }} - {{ endRecord() }} de {{ totalRecords() }}</span>
          <app-pagination [currentPage]="currentPage()" [totalItems]="totalRecords()" [pageSize]="pageSize()" (pageChange)="onPageChange($event)" (pageSizeChange)="onPageSizeChange($event)" />
        </div>
      }
    </div>
  `,
  styles: [`
    .supervisor-agents-container { padding: 24px; }
    .page-header { margin-bottom: 24px; }
    .page-header h1 { margin: 0 0 4px 0; font-size: 24px; font-weight: 600; }
    .subtitle { margin: 0; color: var(--text-secondary); font-size: 14px; }
    .filters-bar { margin-bottom: 24px; }
    .search-box { position: relative; max-width: 400px; }
    .search-box i { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-secondary); }
    .search-box input { width: 100%; padding: 10px 12px 10px 40px; border: 1px solid var(--border-color); border-radius: 8px; }

    .agents-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px; }

    .agent-card {
      background: white;
      border-radius: 12px;
      border: 1px solid var(--border-color);
      padding: 20px;
    }

    .agent-header { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 16px; }
    .agent-avatar { width: 48px; height: 48px; border-radius: 50%; background: var(--primary-color); color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 18px; flex-shrink: 0; }
    .agent-info { flex: 1; min-width: 0; }
    .agent-info h3 { margin: 0 0 4px 0; font-size: 16px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .agent-email { font-size: 13px; color: var(--text-secondary); display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    .status-badge { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 500; flex-shrink: 0; }
    .status-badge.status-0 { background: #d1fae5; color: #065f46; }
    .status-badge.status-1 { background: #fee2e2; color: #991b1b; }

    .agent-meta { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; padding-top: 16px; border-top: 1px solid var(--border-color); }
    .meta-item { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-secondary); }
    .meta-item i { font-size: 16px; }

    .agent-actions { display: flex; gap: 8px; }
    .btn { display: inline-flex; align-items: center; justify-content: center; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 500; text-decoration: none; cursor: pointer; border: none; }
    .btn-sm { padding: 6px 12px; font-size: 12px; }
    .btn:not(.btn-outline) { background: var(--primary-color); color: white; }
    .btn-outline { background: white; border: 1px solid var(--border-color); color: var(--text-primary); }
    .btn:hover { opacity: 0.9; }

    .table-footer { display: flex; justify-content: space-between; align-items: center; padding: 16px 0; margin-top: 24px; }
    .records-info { font-size: 14px; color: var(--text-secondary); }
  `]
})
export class SupervisorAgentsComponent implements OnInit {
  private userService = inject(UserService);

  agents = signal<UserListItem[]>([]);
  totalRecords = signal(0);
  isLoading = signal(false);
  searchTerm = signal('');
  currentPage = signal(1);
  pageSize = signal(12);
  totalPages = computed(() => Math.ceil(this.totalRecords() / this.pageSize()));
  startRecord = computed(() => (this.currentPage() - 1) * this.pageSize() + 1);
  endRecord = computed(() => Math.min(this.currentPage() * this.pageSize(), this.totalRecords()));

  ngOnInit(): void { this.loadAgents(); }

  loadAgents(): void {
    this.isLoading.set(true);
    const params: PaginationParams = {
      page: this.currentPage(),
      pageSize: this.pageSize(),
      search: this.searchTerm() || undefined
    };
    this.userService.getSupervisorAgents(params).subscribe({
      next: (r) => { this.agents.set(r.data); this.totalRecords.set(r.meta.totalItems); this.isLoading.set(false); },
      error: () => this.isLoading.set(false)
    });
  }

  onSearch(): void { this.currentPage.set(1); this.loadAgents(); }
  onPageChange(page: number): void { this.currentPage.set(page); this.loadAgents(); }
  onPageSizeChange(size: number): void { this.pageSize.set(size); this.currentPage.set(1); this.loadAgents(); }

  getFullName(u: UserListItem): string { return getFullName(u); }
  getInitials(u: UserListItem): string { return (u.firstName?.charAt(0) || '') + (u.lastName?.charAt(0) || ''); }
  getRoleDisplayName(r: UserRole): string { return RoleUtils.getDisplayName(r); }
  getStatusDisplayName(s: UserStatus): string { return { [UserStatus.ACTIVE]: 'Activo', [UserStatus.INACTIVE]: 'Inactivo', [UserStatus.PENDING]: 'Pendiente' }[s] || ''; }
}
