/**
 * AuditListComponent
 * PARIDAD: Rails admin/audits/index.html.erb
 *
 * DataTable with:
 * - Date range filters (Desde/Hasta)
 * - Export CSV button (blob download with auth)
 * - Client column (only for SUPER_ADMIN)
 * - Columns: ID, Action, Auditable Type, Auditable ID, User, Changes, Created At
 */
import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { AuditService } from '../../../../core/services/audit.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../core/services/toast.service';
import { Audit } from '../../../../core/models/audit.model';
import { UserRole } from '../../../../core/models/user.model';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';

@Component({
  selector: 'app-audit-list',
  standalone: true,
  imports: [CommonModule, FormsModule, LoadingSpinnerComponent, PaginationComponent, ModalComponent],
  template: `
    <div class="audit-list-container">
      <!-- Page Header -->
      <div class="page-header">
        <div class="header-left">
          <h1>Auditorías</h1>
          <p class="subtitle">Registro de cambios del sistema</p>
        </div>
        <div class="export-group">
          <input
            type="date"
            class="date-input"
            [(ngModel)]="fromDate"
            placeholder="Desde...">
          <input
            type="date"
            class="date-input"
            [(ngModel)]="toDate"
            placeholder="Hasta...">
          <button class="btn btn-primary" (click)="exportAudits()" [disabled]="isExporting()">
            <i class="ph ph-download-simple"></i>
            {{ isExporting() ? 'Exportando...' : 'Exportar' }}
          </button>
        </div>
      </div>

      <!-- Quick Date Filters -->
      <div class="filter-bar">
        <button class="filter-btn" [class.active]="selectedQuickFilter() === 'today'"
                (click)="setQuickFilter('today')">Hoy</button>
        <button class="filter-btn" [class.active]="selectedQuickFilter() === 'week'"
                (click)="setQuickFilter('week')">Última semana</button>
        <button class="filter-btn" [class.active]="selectedQuickFilter() === 'month'"
                (click)="setQuickFilter('month')">Último mes</button>
        <button class="filter-btn" [class.active]="selectedQuickFilter() === 'all'"
                (click)="setQuickFilter('all')">Todos</button>
      </div>

      <!-- Loading -->
      @if (isLoading()) {
        <app-loading-spinner message="Cargando auditorías..." />
      } @else if (audits().length === 0) {
        <div class="empty-state">
          <i class="ph ph-clipboard-text"></i>
          <h3>No hay auditorías</h3>
          <p>No se encontraron registros en el período seleccionado</p>
        </div>
      } @else {
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                @if (isSuperAdmin()) {
                  <th>Cliente</th>
                }
                <th class="sortable" (click)="toggleSort('id')">
                  ID
                  @if (sortField() === 'id') {
                    <i class="ph" [class.ph-sort-ascending]="sortDirection() === 'asc'"
                       [class.ph-sort-descending]="sortDirection() === 'desc'"></i>
                  }
                </th>
                <th>Acción</th>
                <th>Tipo</th>
                <th>ID Entidad</th>
                <th>Usuario</th>
                <th>Cambios</th>
                <th class="sortable" (click)="toggleSort('created_at')">
                  Fecha
                  @if (sortField() === 'created_at') {
                    <i class="ph" [class.ph-sort-ascending]="sortDirection() === 'asc'"
                       [class.ph-sort-descending]="sortDirection() === 'desc'"></i>
                  }
                </th>
              </tr>
            </thead>
            <tbody>
              @for (audit of audits(); track audit.id) {
                <tr>
                  @if (isSuperAdmin()) {
                    <td>{{ audit.client_name || '-' }}</td>
                  }
                  <td class="id-cell">{{ audit.id }}</td>
                  <td>
                    <span class="status-badge" [ngClass]="getActionBadgeClass(audit.action)">
                      {{ getActionLabel(audit.action) }}
                    </span>
                  </td>
                  <td>{{ audit.auditable_type }}</td>
                  <td>{{ audit.auditable_id }}</td>
                  <td>{{ audit.username || 'Admin BD' }}</td>
                  <td>
                    @if (hasChanges(audit.audited_changes)) {
                      <button class="action-btn" (click)="showChanges(audit)" title="Ver cambios">
                        <i class="ph ph-eye"></i>
                      </button>
                    } @else {
                      <span class="text-muted">-</span>
                    }
                  </td>
                  <td class="date-cell">{{ formatDate(audit.created_at) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <app-pagination
          [currentPage]="currentPage()"
          [totalItems]="totalCount()"
          [pageSize]="pageSize()"
          [pageSizeOptions]="[20, 50, 100]"
          (pageChange)="onPageChange($event)"
          (pageSizeChange)="onPageSizeChange($event)"
        />
      }

      <!-- Changes Modal -->
      <app-modal
        [isOpen]="showChangesModal()"
        [title]="'Cambios - ' + (selectedAudit()?.auditable_type || '') + ' #' + (selectedAudit()?.auditable_id || '')"
        size="lg"
        [showFooter]="false"
        (closed)="closeChangesModal()"
      >
        <pre class="changes-pre">{{ formatChanges(selectedAudit()?.audited_changes) }}</pre>
      </app-modal>
    </div>
  `,
  styles: [`
    .audit-list-container { padding: var(--space-6); }

    .page-header {
      display: flex; justify-content: space-between; align-items: flex-start;
      margin-bottom: var(--space-5); flex-wrap: wrap; gap: var(--space-3);
    }
    .header-left h1 { font-size: var(--text-2xl); font-weight: var(--font-semibold); margin: 0; color: var(--fg-default); }
    .subtitle { font-size: var(--text-base); color: var(--fg-muted); margin: var(--space-1) 0 0; }

    .export-group {
      display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;
    }
    .date-input {
      padding: 8px 12px; border: 1px solid var(--border-default); border-radius: var(--radius-md);
      background: var(--input-bg); color: var(--fg-default); font-size: var(--text-sm);
      &:focus { outline: none; border-color: var(--accent-default); }
    }

    .filter-bar {
      display: flex; gap: var(--space-1); margin-bottom: var(--space-4); flex-wrap: wrap;
    }
    .filter-btn {
      padding: 6px 14px; border: 1px solid var(--border-default); border-radius: var(--radius-full);
      background: var(--card-bg); color: var(--fg-default); font-size: var(--text-sm); cursor: pointer; transition: all var(--duration-normal);
      &:hover { border-color: var(--accent-default); color: var(--accent-default); }
      &.active { background: var(--accent-default); color: white; border-color: var(--accent-default); }
    }

    .empty-state {
      text-align: center; padding: 60px var(--space-5); background: var(--card-bg); border: 1px solid var(--card-border); border-radius: var(--radius-lg);
      > i { font-size: 48px; color: var(--fg-subtle); }
      h3 { margin: var(--space-4) 0 var(--space-2); font-size: var(--text-xl); color: var(--fg-default); }
      p { color: var(--fg-muted); margin-bottom: var(--space-4); }
    }

    .table-wrapper { overflow-x: auto; }
    .data-table {
      width: 100%; border-collapse: collapse; background: var(--card-bg); border-radius: var(--radius-xl); overflow: hidden;
      border: 1px solid var(--card-border);
      th, td { padding: var(--space-3) var(--space-4); text-align: left; border-bottom: 1px solid var(--border-muted); }
      th { background: var(--table-header-bg); font-size: var(--text-sm); font-weight: var(--font-semibold); text-transform: uppercase; color: var(--fg-muted); letter-spacing: 0.3px; }
      tbody tr:hover td { background: var(--table-row-hover); }
    }

    .sortable {
      cursor: pointer; user-select: none;
      &:hover { color: var(--accent-default); }
      i { margin-left: var(--space-1); font-size: var(--text-xs); }
    }

    .id-cell { font-weight: var(--font-semibold); color: var(--accent-default); font-size: var(--text-sm); }
    .date-cell { font-size: var(--text-sm); color: var(--fg-muted); white-space: nowrap; }
    .text-muted { color: var(--fg-muted); }

    .status-badge {
      display: inline-flex; align-items: center; height: var(--badge-height); padding: 0 var(--space-3);
      border-radius: var(--radius-full); font-size: var(--text-sm); font-weight: var(--font-medium);
    }
    .badge-success { background: var(--success-subtle); color: var(--success-text); }
    .badge-info { background: var(--accent-subtle); color: var(--accent-emphasis); }
    .badge-danger { background: var(--error-subtle); color: var(--error-text); }
    .badge-secondary { background: var(--bg-muted); color: var(--fg-muted); }

    .action-btn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 32px; height: 32px; border-radius: var(--radius-md); border: 1px solid var(--border-default);
      background: var(--card-bg); cursor: pointer; font-size: 16px; color: var(--fg-muted);
      transition: all var(--duration-normal);
      &:hover { border-color: var(--accent-default); color: var(--accent-default); }
    }

    .changes-pre {
      background: var(--bg-muted); color: var(--fg-default); padding: var(--space-4);
      border-radius: var(--radius-md); overflow: auto; max-height: 400px;
      font-size: 0.85rem; white-space: pre-wrap; word-break: break-word;
      border: 1px solid var(--border-muted); margin: 0;
    }

    .btn {
      display: inline-flex; align-items: center; gap: 6px; padding: 10px 20px;
      border: none; border-radius: var(--radius-lg); font-size: var(--text-base); font-weight: var(--font-medium);
      cursor: pointer; transition: all var(--duration-normal);
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }
    .btn-primary { background: var(--accent-default); color: white; &:hover:not(:disabled) { background: var(--accent-emphasis); } }
  `]
})
export class AuditListComponent implements OnInit, OnDestroy {
  private auditService = inject(AuditService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  private destroy$ = new Subject<void>();

  // State signals
  audits = signal<Audit[]>([]);
  isLoading = signal(true);
  isExporting = signal(false);
  currentPage = signal(1);
  pageSize = signal(50);
  totalCount = signal(0);
  totalPages = signal(0);
  sortField = signal<'id' | 'created_at'>('id');
  sortDirection = signal<'asc' | 'desc'>('desc');
  selectedQuickFilter = signal<'today' | 'week' | 'month' | 'all'>('month');

  // Date filters
  fromDate = this.getDefaultFromDate();
  toDate = this.formatDateForInput(new Date());

  // Modal
  showChangesModal = signal(false);
  selectedAudit = signal<Audit | null>(null);

  // Computed
  isSuperAdmin = computed(() => {
    const user = this.authService.currentUser();
    return user?.role === UserRole.SUPER_ADMIN;
  });

  ngOnInit(): void {
    this.loadAudits();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadAudits(): void {
    this.isLoading.set(true);

    this.auditService.getAudits({
      startDate: this.fromDate,
      endDate: this.toDate,
      page: this.currentPage() - 1,
      size: this.pageSize()
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          let audits = response.audits;
          audits = this.sortAudits(audits);
          this.audits.set(audits);
          this.totalCount.set(response.total);
          this.totalPages.set(response.totalPages);
          this.isLoading.set(false);
        },
        error: (error) => {
          console.error('Error loading audits:', error);
          this.toastService.error('Error al cargar las auditorías');
          this.isLoading.set(false);
        }
      });
  }

  sortAudits(audits: Audit[]): Audit[] {
    const field = this.sortField();
    const direction = this.sortDirection();

    return [...audits].sort((a, b) => {
      let valueA: number | string;
      let valueB: number | string;

      if (field === 'id') {
        valueA = a.id;
        valueB = b.id;
      } else {
        valueA = new Date(a.created_at).getTime();
        valueB = new Date(b.created_at).getTime();
      }

      if (direction === 'asc') {
        return valueA < valueB ? -1 : valueA > valueB ? 1 : 0;
      } else {
        return valueA > valueB ? -1 : valueA < valueB ? 1 : 0;
      }
    });
  }

  toggleSort(field: 'id' | 'created_at'): void {
    if (this.sortField() === field) {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortField.set(field);
      this.sortDirection.set('desc');
    }
    this.audits.update(audits => this.sortAudits(audits));
  }

  setQuickFilter(filter: 'today' | 'week' | 'month' | 'all'): void {
    this.selectedQuickFilter.set(filter);
    const today = new Date();

    switch (filter) {
      case 'today':
        this.fromDate = this.formatDateForInput(today);
        this.toDate = this.formatDateForInput(today);
        break;
      case 'week':
        const weekAgo = new Date(today);
        weekAgo.setDate(today.getDate() - 7);
        this.fromDate = this.formatDateForInput(weekAgo);
        this.toDate = this.formatDateForInput(today);
        break;
      case 'month':
        const monthAgo = new Date(today);
        monthAgo.setDate(today.getDate() - 30);
        this.fromDate = this.formatDateForInput(monthAgo);
        this.toDate = this.formatDateForInput(today);
        break;
      case 'all':
        this.fromDate = '2020-01-01';
        this.toDate = this.formatDateForInput(today);
        break;
    }

    this.currentPage.set(1);
    this.loadAudits();
  }

  onPageChange(page: number): void {
    this.currentPage.set(page);
    this.loadAudits();
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
    this.loadAudits();
  }

  exportAudits(): void {
    this.isExporting.set(true);
    this.auditService.exportAuditsCsv(this.fromDate, this.toDate)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `auditorias_${this.fromDate || 'all'}_${this.toDate || 'all'}.csv`;
          a.click();
          window.URL.revokeObjectURL(url);
          this.isExporting.set(false);
          this.toastService.success('Auditorías exportadas correctamente');
        },
        error: (error) => {
          console.error('Error exporting audits:', error);
          this.toastService.error('Error al exportar las auditorías');
          this.isExporting.set(false);
        }
      });
  }

  showChanges(audit: Audit): void {
    this.selectedAudit.set(audit);
    this.showChangesModal.set(true);
  }

  closeChangesModal(): void {
    this.showChangesModal.set(false);
    this.selectedAudit.set(null);
  }

  hasChanges(changes: Record<string, unknown> | null | undefined): boolean {
    return changes !== null && changes !== undefined && Object.keys(changes).length > 0;
  }

  formatChanges(changes: Record<string, unknown> | null | undefined): string {
    if (!changes) return '-';
    return JSON.stringify(changes, null, 2);
  }

  getActionLabel(action: string): string {
    return this.auditService.getActionLabel(action);
  }

  getActionBadgeClass(action: string): string {
    return this.auditService.getActionBadgeClass(action);
  }

  formatDate(dateString: string): string {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private getDefaultFromDate(): string {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return this.formatDateForInput(date);
  }

  private formatDateForInput(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
