/**
 * Message Template List Component
 * PARIDAD: Rails admin/message_templates/index.html.erb
 * Lista de plantillas de mensajes WhatsApp
 */
import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { MessageTemplateService, MessageTemplate, TemplateStatus } from '../../../../core/services/message-template.service';
import { ToastService } from '../../../../core/services/toast.service';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';

@Component({
  selector: 'app-message-template-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FormsModule,
    PaginationComponent
  ],
  template: `
    <div class="template-list-container">
      <!-- Page Header -->
      <div class="page-header">
        <div class="header-content">
          <h1>Lista de plantillas de mensajes</h1>
          <p class="subtitle">Gestión de plantillas WhatsApp</p>
        </div>
        <div class="header-actions">
          <button
            type="button"
            class="btn btn-primary"
            (click)="syncTemplates()"
            [disabled]="isSyncing()"
          >
            @if (isSyncing()) {
              <i class="ph ph-spinner ph-spin"></i>
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

      <!-- Table Container -->
      <div class="table-container">
        <!-- DataTable Header -->
        <div class="datatable-header">
          <div class="records-summary">
            {{ totalRecords() }} plantilla(s) encontrada(s)
          </div>
          <div class="search-wrapper">
            <label>Buscar:</label>
            <input
              type="text"
              class="search-input"
              [ngModel]="searchTerm"
              (ngModelChange)="onSearchChange($event)"
              placeholder="Buscar por nombre..."
            />
          </div>
        </div>

        <!-- Table -->
        <div class="table-responsive">
          @if (isLoading() && templates().length === 0) {
            <div class="loading-container">
              <div class="spinner"></div>
              <span>Cargando plantillas...</span>
            </div>
          } @else if (templates().length === 0) {
            <div class="empty-container">
              <i class="ph ph-chat-text"></i>
              <p>{{ searchTerm ? 'No se encontraron plantillas' : 'No hay plantillas registradas' }}</p>
              @if (!searchTerm) {
                <button type="button" class="btn btn-primary" (click)="syncTemplates()">
                  <i class="ph ph-arrows-clockwise"></i>
                  Sincronizar Plantillas
                </button>
              }
            </div>
          } @else {
            <table class="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th>Categoría</th>
                  <th>Estado WhatsApp</th>
                  <th class="hide-mobile">Idioma</th>
                  <th class="hide-mobile">Última Actualización</th>
                  <th>Estado</th>
                  <th>Estado Parámetros</th>
                  <th class="col-actions"></th>
                </tr>
              </thead>
              <tbody>
                @for (template of templates(); track template.id) {
                  <tr>
                    <td class="col-name">{{ template.name }}</td>
                    <td>{{ getTemplateTypeLabel(template.templateWhatsappType) }}</td>
                    <td>{{ getCategoryLabel(template.category) }}</td>
                    <td>
                      <span class="status-badge"
                        [class.approved]="template.status === 'approved'"
                        [class.pending]="template.status === 'pending' || template.status === 'draft'"
                        [class.rejected]="template.status === 'rejected'"
                        [class.disabled]="template.status === 'disabled'"
                      >
                        {{ getStatusLabel(template.status) }}
                      </span>
                    </td>
                    <td class="hide-mobile">{{ template.languageName || template.language || '-' }}</td>
                    <td class="hide-mobile">{{ formatDate(template.updatedAt) }}</td>
                    <td>
                      <span class="status-badge active">Activo</span>
                    </td>
                    <td>
                      @if (template.paramsStatus === 'active') {
                        <span class="status-badge active">Activo</span>
                      } @else if (template.paramsStatus === 'pending') {
                        <span class="status-badge pending">Pendiente</span>
                      } @else {
                        <span class="text-muted">Sin parámetros</span>
                      }
                    </td>
                    <td class="col-actions">
                      <div class="action-buttons">
                        <a [routerLink]="[template.id]" class="action-btn" title="Vista Previa">
                          <i class="ph ph-eye"></i>
                        </a>
                        <a [routerLink]="[template.id, 'params']" class="action-btn" title="Parámetros">
                          <i class="ph ph-gear"></i>
                        </a>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>

        <!-- Pagination Footer -->
        @if (templates().length > 0) {
          <div class="datatable-footer">
            <div class="info">
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
    </div>
  `,
  styles: [`
    .template-list-container {
      height: 100%;
      display: flex;
      flex-direction: column;
      background: var(--bg-base);
      color: var(--fg-default);
    }

    /* Page Header */
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      padding: 24px 24px 0;
    }

    h1 {
      margin: 0 0 4px 0;
      font-size: 24px;
      font-weight: 600;
      color: var(--fg-default);
    }

    .subtitle {
      margin: 0;
      color: var(--fg-muted);
      font-size: 14px;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .status-message {
      font-size: 14px;
      padding: 4px 8px;
      border-radius: 4px;

      &.success {
        color: var(--success-text);
        background: var(--success-subtle);
      }

      &.error {
        color: var(--error-text);
        background: var(--error-subtle);
      }
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      border: 1px solid transparent;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.15s ease;

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }

    .btn-primary {
      background: var(--accent-default);
      border-color: var(--accent-default);
      color: white;

      &:hover:not(:disabled) {
        background: var(--accent-emphasis);
        border-color: var(--accent-emphasis);
      }
    }

    /* Table Container */
    .table-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      margin: 16px 24px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      overflow: hidden;
    }

    /* DataTable Header */
    .datatable-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-default);
      gap: 16px;
      flex-wrap: wrap;
    }

    .records-summary {
      font-size: 13px;
      color: var(--fg-muted);
    }

    .search-wrapper {
      display: flex;
      align-items: center;
      gap: 8px;

      label {
        font-size: 14px;
        color: var(--fg-muted);
        white-space: nowrap;
      }
    }

    .search-input {
      width: 220px;
      padding: 8px 12px;
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      border-radius: 6px;
      font-size: 14px;
      color: var(--fg-default);
      transition: border-color 0.15s, box-shadow 0.15s;

      &:focus {
        outline: none;
        border-color: var(--input-border-focus);
        box-shadow: 0 0 0 3px var(--accent-subtle);
      }

      &::placeholder {
        color: var(--fg-subtle);
      }
    }

    /* Table */
    .table-responsive {
      flex: 1;
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
      padding: 12px 16px;
      border-bottom: 1px solid var(--table-border);
      vertical-align: middle;
      text-align: left;
    }

    .table thead th {
      background: var(--table-header-bg);
      font-weight: 600;
      color: var(--fg-muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      white-space: nowrap;
      border-bottom: 2px solid var(--border-default);
    }

    .table tbody tr {
      transition: background 0.15s;

      &:hover {
        background: var(--table-row-hover);
      }
    }

    .col-name {
      min-width: 180px;
      font-weight: 500;
    }

    /* Status Badges */
    .status-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 500;

      &.approved, &.active {
        background: var(--success-subtle);
        color: var(--success-text);
      }

      &.pending {
        background: var(--warning-subtle);
        color: var(--warning-text);
      }

      &.rejected {
        background: var(--error-subtle);
        color: var(--error-text);
      }

      &.disabled {
        background: var(--bg-muted);
        color: var(--fg-muted);
      }
    }

    .text-muted {
      color: var(--fg-subtle);
      font-size: 13px;
    }

    /* Actions Column */
    .col-actions {
      width: 100px;
      text-align: center;
    }

    .action-buttons {
      display: flex;
      gap: 4px;
      justify-content: center;
    }

    .action-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--fg-muted);
      cursor: pointer;
      text-decoration: none;
      transition: all 0.15s;

      &:hover {
        background: var(--bg-subtle);
        color: var(--accent-default);
      }

      i {
        font-size: 18px;
      }
    }

    /* Loading & Empty States */
    .loading-container,
    .empty-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 24px;
      color: var(--fg-muted);
      gap: 12px;
    }

    .empty-container i {
      font-size: 48px;
      opacity: 0.5;
    }

    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--border-default);
      border-top-color: var(--accent-default);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .ph-spin {
      animation: spin 1s linear infinite;
    }

    /* Pagination Footer */
    .datatable-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-top: 1px solid var(--border-default);
      background: var(--table-header-bg);
      font-size: 13px;
      flex-wrap: wrap;
      gap: 12px;
    }

    .info {
      color: var(--fg-muted);
    }

    /* Responsive */
    @media (max-width: 768px) {
      .page-header {
        flex-direction: column;
        align-items: flex-start;
        padding: 12px 16px;
        gap: 12px;
      }

      .header-actions {
        width: 100%;
        flex-wrap: wrap;
      }

      .table-container {
        margin: 12px;
      }

      .datatable-header {
        flex-direction: column;
        align-items: stretch;
      }

      .search-wrapper {
        width: 100%;
      }

      .search-input {
        width: 100%;
      }

      .hide-mobile {
        display: none;
      }

      .datatable-footer {
        flex-direction: column;
        text-align: center;
      }
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

  // Search
  searchTerm = '';
  private search$ = new Subject<string>();

  // Pagination
  currentPage = signal(1);
  pageSize = signal(20);
  totalPages = computed(() => Math.ceil(this.totalRecords() / this.pageSize()));

  // Computed
  startRecord = computed(() => (this.currentPage() - 1) * this.pageSize() + 1);
  endRecord = computed(() => Math.min(this.currentPage() * this.pageSize(), this.totalRecords()));

  ngOnInit(): void {
    this.search$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.currentPage.set(1);
      this.loadTemplates();
    });

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
      this.searchTerm || undefined
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

  onSearchChange(term: string): void {
    this.searchTerm = term;
    this.search$.next(term);
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
