/**
 * AuditListComponent
 * PARIDAD: Rails admin/audits/index.html.erb
 *
 * DataTable with:
 * - Date range filters (Desde/Hasta)
 * - Export CSV button
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

@Component({
  selector: 'app-audit-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="container-fluid py-4">
      <!-- Page Header -->
      <div class="page-header mb-4">
        <div class="row align-items-center">
          <div class="col">
            <h1 class="h3 mb-0">Auditorías</h1>
          </div>
        </div>
      </div>

      <!-- Export Form - PARIDAD: Rails export form -->
      <div class="row mb-3">
        <div class="col d-flex justify-content-end">
          <form
            class="d-flex align-items-center border p-3 rounded bg-white"
            (ngSubmit)="exportAudits()">
            <div class="me-3">
              <label for="from-date" class="visually-hidden">From Date</label>
              <input
                type="date"
                id="from-date"
                class="form-control form-control-sm bg-light rounded-2"
                [(ngModel)]="fromDate"
                name="fromDate"
                placeholder="Desde...">
            </div>
            <div class="me-3">
              <label for="to-date" class="visually-hidden">To Date</label>
              <input
                type="date"
                id="to-date"
                class="form-control form-control-sm bg-light rounded-2"
                [(ngModel)]="toDate"
                name="toDate"
                placeholder="Hasta...">
            </div>
            <button type="submit" class="btn btn-primary">
              <i class="bi bi-download me-1"></i>
              Exportar Auditorías
            </button>
          </form>
        </div>
      </div>

      <!-- Quick Date Filters -->
      <div class="card mb-4">
        <div class="card-body py-2">
          <div class="d-flex gap-2 flex-wrap">
            <button
              type="button"
              class="btn btn-sm"
              [class.btn-primary]="selectedQuickFilter() === 'today'"
              [class.btn-outline-secondary]="selectedQuickFilter() !== 'today'"
              (click)="setQuickFilter('today')">
              Hoy
            </button>
            <button
              type="button"
              class="btn btn-sm"
              [class.btn-primary]="selectedQuickFilter() === 'week'"
              [class.btn-outline-secondary]="selectedQuickFilter() !== 'week'"
              (click)="setQuickFilter('week')">
              Última semana
            </button>
            <button
              type="button"
              class="btn btn-sm"
              [class.btn-primary]="selectedQuickFilter() === 'month'"
              [class.btn-outline-secondary]="selectedQuickFilter() !== 'month'"
              (click)="setQuickFilter('month')">
              Último mes
            </button>
            <button
              type="button"
              class="btn btn-sm"
              [class.btn-primary]="selectedQuickFilter() === 'all'"
              [class.btn-outline-secondary]="selectedQuickFilter() !== 'all'"
              (click)="setQuickFilter('all')">
              Todos
            </button>
          </div>
        </div>
      </div>

      <!-- Loading -->
      @if (isLoading()) {
        <div class="text-center py-5">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Cargando...</span>
          </div>
        </div>
      }

      <!-- DataTable - PARIDAD: Rails DataTable -->
      @if (!isLoading()) {
        <div class="card">
          <div class="table-responsive">
            <table class="table table-striped table-bordered table-hover mb-0">
              <thead class="table-light">
                <tr>
                  @if (isSuperAdmin()) {
                    <th>Cliente</th>
                  }
                  <th class="sortable" (click)="toggleSort('id')">
                    ID
                    @if (sortField() === 'id') {
                      <i class="bi" [class.bi-sort-up]="sortDirection() === 'asc'"
                         [class.bi-sort-down]="sortDirection() === 'desc'"></i>
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
                      <i class="bi" [class.bi-sort-up]="sortDirection() === 'asc'"
                         [class.bi-sort-down]="sortDirection() === 'desc'"></i>
                    }
                  </th>
                </tr>
              </thead>
              <tbody>
                @if (audits().length === 0) {
                  <tr>
                    <td [attr.colspan]="isSuperAdmin() ? 8 : 7" class="text-center py-4 text-muted">
                      No hay auditorías en el período seleccionado
                    </td>
                  </tr>
                } @else {
                  @for (audit of audits(); track audit.id) {
                    <tr>
                      @if (isSuperAdmin()) {
                        <td>{{ audit.client_name || '-' }}</td>
                      }
                      <td>{{ audit.id }}</td>
                      <td>
                        <span class="badge" [ngClass]="getActionBadgeClass(audit.action)">
                          {{ getActionLabel(audit.action) }}
                        </span>
                      </td>
                      <td>{{ audit.auditable_type }}</td>
                      <td>{{ audit.auditable_id }}</td>
                      <td>{{ audit.username || 'Admin BD' }}</td>
                      <td>
                        @if (hasChanges(audit.audited_changes)) {
                          <button
                            type="button"
                            class="btn btn-sm btn-outline-secondary"
                            (click)="showChanges(audit)"
                            title="Ver cambios">
                            <i class="bi bi-eye"></i> Ver
                          </button>
                        } @else {
                          <span class="text-muted">-</span>
                        }
                      </td>
                      <td>{{ formatDate(audit.created_at) }}</td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          @if (totalPages() > 1) {
            <div class="card-footer">
              <div class="d-flex justify-content-between align-items-center">
                <div class="text-muted small">
                  Mostrando {{ (currentPage() * pageSize()) + 1 }} -
                  {{ Math.min((currentPage() + 1) * pageSize(), totalCount()) }}
                  de {{ totalCount() }} registros
                </div>
                <nav>
                  <ul class="pagination pagination-sm mb-0">
                    <li class="page-item" [class.disabled]="currentPage() === 0">
                      <button class="page-link" (click)="goToPage(currentPage() - 1)">
                        <i class="bi bi-chevron-left"></i>
                      </button>
                    </li>
                    @for (page of getPageNumbers(); track page) {
                      <li class="page-item" [class.active]="page === currentPage()">
                        <button class="page-link" (click)="goToPage(page)">
                          {{ page + 1 }}
                        </button>
                      </li>
                    }
                    <li class="page-item" [class.disabled]="currentPage() >= totalPages() - 1">
                      <button class="page-link" (click)="goToPage(currentPage() + 1)">
                        <i class="bi bi-chevron-right"></i>
                      </button>
                    </li>
                  </ul>
                </nav>
              </div>
            </div>
          }
        </div>
      }

      <!-- Changes Modal -->
      @if (showChangesModal()) {
        <div class="modal fade show d-block" tabindex="-1" style="background-color: rgba(0,0,0,0.5);">
          <div class="modal-dialog modal-lg">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">
                  Cambios - {{ selectedAudit()?.auditable_type }} #{{ selectedAudit()?.auditable_id }}
                </h5>
                <button type="button" class="btn-close" (click)="closeChangesModal()"></button>
              </div>
              <div class="modal-body">
                <pre class="bg-light p-3 rounded overflow-auto" style="max-height: 400px;">{{ formatChanges(selectedAudit()?.audited_changes) }}</pre>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" (click)="closeChangesModal()">
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .sortable {
      cursor: pointer;
      user-select: none;
    }

    .sortable:hover {
      background-color: var(--bs-gray-200);
    }

    pre {
      font-size: 0.85rem;
      white-space: pre-wrap;
      word-break: break-word;
    }
  `]
})
export class AuditListComponent implements OnInit, OnDestroy {
  private auditService = inject(AuditService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  private destroy$ = new Subject<void>();

  // For template
  Math = Math;

  // State signals
  audits = signal<Audit[]>([]);
  isLoading = signal(true);
  currentPage = signal(0);
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
      page: this.currentPage(),
      size: this.pageSize()
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          let audits = response.audits;

          // Client-side sorting
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
    // Re-sort current data
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
        this.fromDate = '';
        this.toDate = '';
        break;
    }

    this.currentPage.set(0);
    this.loadAudits();
  }

  goToPage(page: number): void {
    if (page >= 0 && page < this.totalPages()) {
      this.currentPage.set(page);
      this.loadAudits();
    }
  }

  getPageNumbers(): number[] {
    const total = this.totalPages();
    const current = this.currentPage();
    const pages: number[] = [];

    const start = Math.max(0, current - 2);
    const end = Math.min(total, start + 5);

    for (let i = start; i < end; i++) {
      pages.push(i);
    }

    return pages;
  }

  exportAudits(): void {
    const url = this.auditService.getExportUrl(this.fromDate, this.toDate);
    window.open(url, '_blank');
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
