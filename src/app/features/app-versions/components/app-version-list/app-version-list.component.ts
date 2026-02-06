import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { AppVersionService, AppVersion } from '../../../../core/services/app-version.service';
import { ToastService } from '../../../../core/services/toast.service';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';

@Component({
  selector: 'app-app-version-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, ConfirmDialogComponent, PaginationComponent],
  template: `
    <div class="page-container">
      <!-- Header -->
      <div class="page-header">
        <div class="header-content">
          <h1 class="page-title">
            <i class="ph ph-rocket-launch"></i>
            Versiones de App
          </h1>
          <p class="page-subtitle">Gestiona las versiones de la aplicación Electron</p>
        </div>
        <div class="header-actions">
          <a routerLink="new" class="btn btn-primary">
            <i class="ph ph-plus"></i>
            Nueva Versión
          </a>
        </div>
      </div>

      <!-- Filters -->
      <div class="filters-bar">
        <div class="filter-group">
          <label>Plataforma:</label>
          <select [(ngModel)]="selectedPlatform" (change)="onPlatformChange()">
            <option value="">Todas</option>
            <option value="windows">Windows</option>
            <option value="mac">Mac</option>
            <option value="linux">Linux</option>
          </select>
        </div>
      </div>

      <!-- Table -->
      <div class="card">
        @if (isLoading()) {
          <div class="loading-container">
            <i class="ph ph-spinner ph-spin"></i>
            <span>Cargando versiones...</span>
          </div>
        } @else if (versions().length === 0) {
          <div class="empty-state">
            <div class="empty-icon">
              <i class="ph ph-package"></i>
            </div>
            <h3>No hay versiones</h3>
            <p>Crea una nueva versión para comenzar</p>
            <a routerLink="new" class="btn btn-primary">Nueva Versión</a>
          </div>
        } @else {
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Versión</th>
                  <th>Plataforma</th>
                  <th>Origen</th>
                  <th>Tamaño</th>
                  <th>Obligatoria</th>
                  <th>Estado</th>
                  <th>Publicada</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                @for (version of versions(); track version.id) {
                  <tr>
                    <td>
                      <span class="version-badge">v{{ version.version }}</span>
                    </td>
                    <td>
                      <span class="platform-badge" [class]="'platform-' + version.platform">
                        {{ version.platform | titlecase }}
                      </span>
                    </td>
                    <td>
                      @if (version.s3Key) {
                        <span class="badge badge-info">
                          <i class="ph ph-cloud-arrow-up"></i> S3
                        </span>
                      } @else {
                        <span class="badge badge-default">
                          <i class="ph ph-link"></i> URL
                        </span>
                      }
                    </td>
                    <td>{{ formatFileSize(version.fileSize) }}</td>
                    <td>
                      @if (version.mandatory) {
                        <span class="badge badge-warning">Sí</span>
                      } @else {
                        <span class="badge badge-default">No</span>
                      }
                    </td>
                    <td>
                      @if (version.active) {
                        <span class="badge badge-success">Activa</span>
                      } @else {
                        <span class="badge badge-error">Inactiva</span>
                      }
                    </td>
                    <td class="date-cell">{{ formatDate(version.publishedAt) }}</td>
                    <td>
                      <div class="action-buttons">
                        <button
                          class="btn-icon"
                          [class.active]="version.active"
                          (click)="toggleActive(version)"
                          [title]="version.active ? 'Desactivar' : 'Activar'">
                          <i class="ph" [class.ph-toggle-right]="version.active" [class.ph-toggle-left]="!version.active"></i>
                        </button>
                        <a [routerLink]="[version.id, 'edit']" class="btn-icon" title="Editar">
                          <i class="ph ph-pencil"></i>
                        </a>
                        <button class="btn-icon btn-icon-danger" (click)="confirmDelete(version)" title="Eliminar">
                          <i class="ph ph-trash"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          @if (totalItems() > pageSize()) {
            <div class="pagination-container">
              <app-pagination
                [currentPage]="currentPage()"
                [totalItems]="totalItems()"
                [pageSize]="pageSize()"
                (pageChange)="onPageChange($event)"
              />
            </div>
          }
        }
      </div>

      <!-- Delete Confirmation Dialog -->
      <app-confirm-dialog
        [isOpen]="showDeleteDialog()"
        title="Eliminar Versión"
        [message]="'¿Estás seguro de eliminar la versión ' + (versionToDelete()?.version || '') + '?'"
        type="danger"
        confirmLabel="Eliminar"
        (confirmed)="deleteVersion()"
        (cancelled)="showDeleteDialog.set(false)"
      />
    </div>
  `,
  styles: [`
    .page-container {
      padding: var(--space-6);
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: var(--space-6);
    }

    .page-title {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      font-size: var(--text-2xl);
      font-weight: var(--font-semibold);
      color: var(--fg-default);
      margin: 0;
    }

    .page-title i {
      font-size: 28px;
      color: var(--accent-default);
    }

    .page-subtitle {
      color: var(--fg-muted);
      margin: var(--space-1) 0 0;
      font-size: var(--text-base);
    }

    .filters-bar {
      display: flex;
      gap: var(--space-4);
      margin-bottom: var(--space-4);
      padding: var(--space-3) var(--space-4);
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius-lg);
    }

    .filter-group {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .filter-group label {
      font-size: var(--text-sm);
      font-weight: var(--font-medium);
      color: var(--fg-muted);
    }

    .filter-group select {
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--input-border);
      border-radius: var(--radius-md);
      background: var(--input-bg);
      color: var(--fg-default);
      font-size: var(--text-base);
      transition: border-color var(--duration-fast);
    }

    .filter-group select:focus {
      outline: none;
      border-color: var(--input-border-focus);
      box-shadow: 0 0 0 3px var(--accent-subtle);
    }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius-lg);
      overflow: hidden;
    }

    .loading-container {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-3);
      padding: var(--space-8);
      color: var(--fg-muted);
    }

    .loading-container i {
      font-size: 24px;
      color: var(--accent-default);
    }

    .empty-state {
      text-align: center;
      padding: var(--space-8);
      color: var(--fg-muted);
    }

    .empty-icon {
      width: 80px;
      height: 80px;
      margin: 0 auto var(--space-4);
      background: var(--bg-subtle);
      border-radius: var(--radius-full);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .empty-icon i {
      font-size: 36px;
      color: var(--fg-subtle);
    }

    .empty-state h3 {
      margin: 0 0 var(--space-2);
      color: var(--fg-default);
      font-weight: var(--font-semibold);
    }

    .empty-state p {
      margin: 0 0 var(--space-5);
      color: var(--fg-subtle);
    }

    .table-container {
      overflow-x: auto;
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
    }

    .data-table th,
    .data-table td {
      padding: var(--space-3) var(--space-4);
      text-align: left;
      border-bottom: 1px solid var(--table-border);
    }

    .data-table th {
      font-weight: var(--font-semibold);
      font-size: var(--text-sm);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--fg-muted);
      background: var(--table-header-bg);
    }

    .data-table td {
      font-size: var(--text-base);
      color: var(--fg-default);
    }

    .data-table tbody tr {
      transition: background-color var(--duration-fast);
    }

    .data-table tbody tr:hover {
      background: var(--table-row-hover);
    }

    .version-badge {
      font-family: var(--font-mono);
      font-weight: var(--font-semibold);
      color: var(--accent-default);
    }

    .platform-badge {
      display: inline-flex;
      align-items: center;
      padding: 2px var(--space-2);
      border-radius: var(--radius-sm);
      font-size: var(--text-sm);
      font-weight: var(--font-medium);
    }

    .platform-windows {
      background: #0078d4;
      color: white;
    }

    .platform-mac {
      background: #333;
      color: white;
    }

    .platform-linux {
      background: #dd4814;
      color: white;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      padding: 2px var(--space-2);
      border-radius: var(--radius-full);
      font-size: var(--text-sm);
      font-weight: var(--font-medium);
    }

    .badge-success {
      background: var(--success-subtle);
      color: var(--success-text);
    }

    .badge-error {
      background: var(--error-subtle);
      color: var(--error-text);
    }

    .badge-warning {
      background: var(--warning-subtle);
      color: var(--warning-text);
    }

    .badge-default {
      background: var(--bg-muted);
      color: var(--fg-muted);
    }

    .badge-info {
      background: var(--accent-subtle);
      color: var(--accent-emphasis);
    }

    .badge i {
      font-size: 12px;
    }

    .date-cell {
      font-size: var(--text-sm) !important;
      color: var(--fg-muted) !important;
      white-space: nowrap;
    }

    .action-buttons {
      display: flex;
      gap: var(--space-1);
    }

    .btn-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border: none;
      border-radius: var(--radius-md);
      background: transparent;
      color: var(--fg-muted);
      cursor: pointer;
      transition: all var(--duration-fast);
      text-decoration: none;
    }

    .btn-icon:hover {
      background: var(--bg-muted);
      color: var(--fg-default);
    }

    .btn-icon.active {
      color: var(--success-default);
    }

    .btn-icon-danger:hover {
      background: var(--error-subtle);
      color: var(--error-default);
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      height: var(--btn-height);
      padding: 0 var(--space-4);
      border: 1px solid transparent;
      border-radius: var(--radius-md);
      font-size: var(--text-base);
      font-weight: var(--font-medium);
      cursor: pointer;
      transition: all var(--duration-normal);
      text-decoration: none;
      white-space: nowrap;
    }

    .btn i {
      font-size: 18px;
      flex-shrink: 0;
    }

    .btn-primary {
      background: var(--accent-default);
      color: white;
    }

    .btn-primary:hover {
      background: var(--accent-emphasis);
    }

    .pagination-container {
      padding: var(--space-4);
      border-top: 1px solid var(--table-border);
    }
  `]
})
export class AppVersionListComponent implements OnInit, OnDestroy {
  private appVersionService = inject(AppVersionService);
  private toastService = inject(ToastService);
  private destroy$ = new Subject<void>();

  // State
  versions = signal<AppVersion[]>([]);
  isLoading = signal(false);
  currentPage = signal(1);
  pageSize = signal(10);
  totalItems = signal(0);
  selectedPlatform = '';

  // Delete dialog
  showDeleteDialog = signal(false);
  versionToDelete = signal<AppVersion | null>(null);

  ngOnInit(): void {
    this.loadVersions();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadVersions(): void {
    this.isLoading.set(true);

    this.appVersionService.getVersions({
      page: this.currentPage(),
      pageSize: this.pageSize(),
      platform: this.selectedPlatform || undefined
    })
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: (response) => {
        this.versions.set(response.data);
        this.totalItems.set(response.meta.totalItems);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading versions:', err);
        this.toastService.error('Error al cargar las versiones');
        this.isLoading.set(false);
      }
    });
  }

  onPageChange(page: number): void {
    this.currentPage.set(page);
    this.loadVersions();
  }

  onPlatformChange(): void {
    this.currentPage.set(1);
    this.loadVersions();
  }

  toggleActive(version: AppVersion): void {
    this.appVersionService.toggleActive(version.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updated) => {
          const versions = this.versions();
          const index = versions.findIndex(v => v.id === version.id);
          if (index !== -1) {
            versions[index] = updated;
            this.versions.set([...versions]);
          }
          this.toastService.success(`Versión ${updated.active ? 'activada' : 'desactivada'}`);
        },
        error: (err) => {
          console.error('Error toggling active:', err);
          this.toastService.error('Error al cambiar el estado');
        }
      });
  }

  confirmDelete(version: AppVersion): void {
    this.versionToDelete.set(version);
    this.showDeleteDialog.set(true);
  }

  deleteVersion(): void {
    const version = this.versionToDelete();
    if (!version) return;

    this.appVersionService.deleteVersion(version.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toastService.success('Versión eliminada');
          this.showDeleteDialog.set(false);
          this.versionToDelete.set(null);
          this.loadVersions();
        },
        error: (err) => {
          console.error('Error deleting version:', err);
          this.toastService.error('Error al eliminar la versión');
        }
      });
  }

  formatFileSize(bytes: number | null): string {
    return this.appVersionService.formatFileSize(bytes);
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-PE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
