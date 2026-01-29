/**
 * Message Template List Component
 * PARIDAD: Rails admin/message_templates/index.html.erb
 * Lista de plantillas de mensajes WhatsApp
 */
import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { MessageTemplateService, MessageTemplate, TemplateStatus } from '../../../../core/services/message-template.service';
import { ToastService } from '../../../../core/services/toast.service';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';

@Component({
  selector: 'app-message-template-list',
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
    <div class="template-list-container">
      <!-- Header - PARIDAD: Rails admin/message_templates/index.html.erb -->
      <div class="page-header">
        <div class="row">
          <div class="view-index-title-container col">
            <h1>Lista de plantillas de mensajes</h1>
          </div>
          <div class="view-index-button-container col">
            <button
              type="button"
              class="btn btn-primary"
              (click)="syncTemplates()"
              [disabled]="isSyncing()"
            >
              @if (isSyncing()) {
                <span class="spinner-border spinner-border-sm"></span>
                Sincronizando...
              } @else {
                <i class="ph ph-arrows-clockwise"></i>
                <span>Sincronizar Plantillas</span>
              }
            </button>
            @if (syncMessage()) {
              <span class="status-message" [class.success]="syncSuccess()" [class.error]="!syncSuccess()">
                {{ syncMessage() }}
              </span>
            }
          </div>
        </div>
      </div>

      <!-- Filters -->
      <div class="filters-bar">
        <div class="filter-group">
          <select [(ngModel)]="statusFilter" (change)="onFilterChange()">
            <option value="">Todos los estados</option>
            <option value="draft">Borrador</option>
            <option value="pending">Pendiente</option>
            <option value="approved">Aprobado</option>
            <option value="rejected">Rechazado</option>
          </select>
        </div>
      </div>

      <!-- Content -->
      @if (isLoading()) {
        <app-loading-spinner [overlay]="false" message="Cargando plantillas..." />
      } @else if (templates().length === 0) {
        <app-empty-state
          icon="ph-chat-text"
          title="No hay plantillas"
          description="Sincronice las plantillas desde WhatsApp Cloud API"
        >
          <button type="button" class="btn btn-primary" (click)="syncTemplates()">
            <i class="ph ph-arrows-clockwise"></i>
            Sincronizar Plantillas
          </button>
        </app-empty-state>
      } @else {
        <!-- Table - PARIDAD: Rails DataTable -->
        <div class="table-responsive">
          <table class="table table-striped table-bordered table-hover">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Tipo</th>
                <th>Categoría</th>
                <th>Estado WhatsApp</th>
                <th>Idioma</th>
                <th>Mensajes Enviados</th>
                <th>Última Actualización</th>
                <th>Estado</th>
                <th class="no-sort">Vista Previa</th>
                <th class="no-sort">Parámetros</th>
              </tr>
            </thead>
            <tbody>
              @for (template of templates(); track template.id) {
                <tr>
                  <td>{{ template.name }}</td>
                  <td>{{ getTemplateTypeLabel(template.templateWhatsappType) }}</td>
                  <td>{{ getCategoryLabel(template.category) }}</td>
                  <td>
                    <span class="badge" [ngClass]="getStatusClass(template.status)">
                      {{ getStatusLabel(template.status) }}
                    </span>
                  </td>
                  <td>{{ template.languageName || template.language || '-' }}</td>
                  <td>{{ template.messagesSent || 0 }}</td>
                  <td>{{ formatDate(template.updatedAt) }}</td>
                  <td>
                    <span class="badge badge-success">Activo</span>
                  </td>
                  <td>
                    <a [routerLink]="[template.id]" class="btn btn-sm btn-link" title="Vista Previa">
                      <i class="ph ph-eye"></i>
                    </a>
                  </td>
                  <td>
                    <a [routerLink]="[template.id, 'params']" class="btn btn-sm btn-link" title="Parámetros">
                      <i class="ph ph-gear"></i>
                    </a>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div class="table-footer">
          <div class="records-info">
            Mostrando {{ startRecord() }} - {{ endRecord() }} de {{ totalRecords() }} plantillas
          </div>
          <app-pagination
            [currentPage]="currentPage()"
            [totalItems]="totalRecords()"
            [pageSize]="pageSize()"
            [pageSizeOptions]="[10, 20, 50]"
            (pageChange)="onPageChange($event)"
            (pageSizeChange)="onPageSizeChange($event)"
          />
        </div>
      }
    </div>
  `,
  styles: [`
    .template-list-container {
      padding: 24px;
    }

    /* Page Header - PARIDAD: Rails page-header */
    .page-header {
      margin-bottom: 24px;
    }

    .page-header .row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }

    .view-index-title-container h1 {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 500;
      color: var(--text-primary, #212529);
    }

    .view-index-button-container {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .status-message {
      font-size: 14px;
      padding: 4px 8px;
      border-radius: 4px;

      &.success {
        color: #065f46;
        background: #d1fae5;
      }

      &.error {
        color: #991b1b;
        background: #fee2e2;
      }
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

      &:hover:not(:disabled) {
        background-color: var(--primary-dark, #0b5ed7);
      }
    }

    .btn-link {
      background: none;
      border: none;
      color: var(--primary-color, #0d6efd);
      padding: 4px 8px;

      &:hover {
        text-decoration: underline;
      }
    }

    .btn-sm {
      padding: 4px 8px;
      font-size: 12px;
    }

    .spinner-border-sm {
      width: 16px;
      height: 16px;
      border-width: 2px;
    }

    /* Filters */
    .filters-bar {
      display: flex;
      gap: 16px;
      margin-bottom: 16px;
    }

    .filter-group select {
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

    /* Table - PARIDAD: Rails DataTable */
    .table-responsive {
      background: white;
      border-radius: 4px;
      overflow: auto;
    }

    .table {
      width: 100%;
      margin: 0;
      border-collapse: collapse;
      font-size: 14px;
    }

    .table th,
    .table td {
      padding: 12px;
      border: 1px solid var(--border-color, #dee2e6);
      vertical-align: middle;
    }

    .table thead th {
      background: var(--bg-light, #f8f9fa);
      font-weight: 600;
      color: var(--text-primary, #212529);
      text-align: left;
      white-space: nowrap;
    }

    .table-striped tbody tr:nth-of-type(odd) {
      background: rgba(0, 0, 0, 0.02);
    }

    .table-hover tbody tr:hover {
      background: rgba(0, 0, 0, 0.05);
    }

    .no-sort {
      width: 80px;
      text-align: center;
    }

    /* Badge */
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
    }

    .badge-secondary { background: #e9ecef; color: #495057; }
    .badge-success { background: #d1fae5; color: #065f46; }
    .badge-danger { background: #fee2e2; color: #991b1b; }
    .badge-warning { background: #fff3cd; color: #856404; }

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
      .template-list-container { padding: 16px; }
      .page-header .row { flex-direction: column; align-items: flex-start; }
      .view-index-button-container { flex-direction: column; align-items: flex-start; }
      .table-responsive { overflow-x: auto; }
      .table { min-width: 1000px; }
    }
  `]
})
export class MessageTemplateListComponent implements OnInit, OnDestroy {
  private templateService = inject(MessageTemplateService);
  private toast = inject(ToastService);
  private destroy$ = new Subject<void>();

  // Data
  templates = signal<(MessageTemplate & { messagesSent?: number })[]>([]);
  totalRecords = signal(0);
  isLoading = signal(false);

  // Sync status
  isSyncing = signal(false);
  syncMessage = signal('');
  syncSuccess = signal(false);

  // Filters
  statusFilter = '';

  // Pagination
  currentPage = signal(1);
  pageSize = signal(20);
  totalPages = computed(() => Math.ceil(this.totalRecords() / this.pageSize()));

  // Computed
  startRecord = computed(() => (this.currentPage() - 1) * this.pageSize() + 1);
  endRecord = computed(() => Math.min(this.currentPage() * this.pageSize(), this.totalRecords()));

  ngOnInit(): void {
    this.loadTemplates();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadTemplates(): void {
    this.isLoading.set(true);

    this.templateService.getTemplates(
      this.currentPage() - 1,
      this.pageSize(),
      this.statusFilter || undefined
    ).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        this.templates.set(response.templates);
        this.totalRecords.set(response.total);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading templates:', err);
        this.toast.error('Error al cargar plantillas');
        this.isLoading.set(false);
      }
    });
  }

  syncTemplates(): void {
    this.isSyncing.set(true);
    this.syncMessage.set('');

    this.templateService.syncWithCloudApi().pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        this.isSyncing.set(false);
        this.syncSuccess.set(true);
        this.syncMessage.set(`${response.synced_count} plantillas sincronizadas`);
        this.toast.success(response.message);
        // Reload list
        this.loadTemplates();

        // Clear message after 5 seconds
        setTimeout(() => this.syncMessage.set(''), 5000);
      },
      error: (err) => {
        console.error('Error syncing templates:', err);
        this.isSyncing.set(false);
        this.syncSuccess.set(false);
        this.syncMessage.set('Error al sincronizar');
        this.toast.error('Error al sincronizar plantillas');

        setTimeout(() => this.syncMessage.set(''), 5000);
      }
    });
  }

  onFilterChange(): void {
    this.currentPage.set(1);
    this.loadTemplates();
  }

  onPageChange(page: number): void {
    this.currentPage.set(page);
    this.loadTemplates();
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
    this.loadTemplates();
  }

  getStatusLabel(status: TemplateStatus): string {
    return this.templateService.getStatusLabel(status);
  }

  getStatusClass(status: TemplateStatus): string {
    return this.templateService.getStatusClass(status);
  }

  getCategoryLabel(category: number): string {
    return this.templateService.getCategoryLabel(category);
  }

  getTemplateTypeLabel(type: number): string {
    return this.templateService.getTemplateTypeLabel(type);
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
