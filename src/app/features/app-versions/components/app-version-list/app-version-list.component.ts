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
            <i class="ph ph-package"></i>
            <h3>No hay versiones</h3>
            <p>Crea una nueva versión para comenzar</p>
            <a routerLink="new" class="btn btn-primary">
              <i class="ph ph-plus"></i>
              Nueva Versión
            </a>
          </div>
        } @else {
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Versión</th>
                  <th>Plataforma</th>
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
                    <td>{{ formatFileSize(version.fileSize) }}</td>
                    <td>
                      @if (version.mandatory) {
                        <span class="badge badge-warning">Sí</span>
                      } @else {
                        <span class="badge badge-secondary">No</span>
                      }
                    </td>
                    <td>
                      @if (version.active) {
                        <span class="badge badge-success">Activa</span>
                      } @else {
                        <span class="badge badge-danger">Inactiva</span>
                      }
                    </td>
                    <td>{{ formatDate(version.publishedAt) }}</td>
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
                        <button class="btn-icon btn-danger" (click)="confirmDelete(version)" title="Eliminar">
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
      @if (showDeleteDialog()) {
        <app-confirm-dialog
          title="Eliminar Versión"
          [message]="'¿Estás seguro de eliminar la versión ' + versionToDelete()?.version + '?'"
          confirmText="Eliminar"
          confirmClass="btn-danger"
          (confirm)="deleteVersion()"
          (cancel)="showDeleteDialog.set(false)"
        />
      }
    </div>
  `,
  styles: [`
    .page-container {
      padding: 1.5rem;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1.5rem;
    }

    .page-title {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--text-primary);
      margin: 0;
    }

    .page-title i {
      font-size: 1.75rem;
      color: var(--primary);
    }

    .page-subtitle {
      color: var(--text-secondary);
      margin: 0.25rem 0 0;
      font-size: 0.875rem;
    }

    .filters-bar {
      display: flex;
      gap: 1rem;
      margin-bottom: 1rem;
      padding: 1rem;
      background: var(--bg-secondary);
      border-radius: 0.5rem;
    }

    .filter-group {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .filter-group label {
      font-size: 0.875rem;
      color: var(--text-secondary);
    }

    .filter-group select {
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--border-color);
      border-radius: 0.375rem;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-size: 0.875rem;
    }

    .card {
      background: var(--bg-secondary);
      border-radius: 0.5rem;
      overflow: hidden;
    }

    .loading-container {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      padding: 3rem;
      color: var(--text-secondary);
    }

    .loading-container i {
      font-size: 1.5rem;
    }

    .empty-state {
      text-align: center;
      padding: 3rem;
      color: var(--text-secondary);
    }

    .empty-state i {
      font-size: 3rem;
      opacity: 0.5;
      margin-bottom: 1rem;
    }

    .empty-state h3 {
      margin: 0 0 0.5rem;
      color: var(--text-primary);
    }

    .empty-state p {
      margin: 0 0 1.5rem;
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
      padding: 0.875rem 1rem;
      text-align: left;
      border-bottom: 1px solid var(--border-color);
    }

    .data-table th {
      font-weight: 600;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-secondary);
      background: var(--bg-tertiary);
    }

    .data-table td {
      font-size: 0.875rem;
      color: var(--text-primary);
    }

    .data-table tbody tr:hover {
      background: var(--bg-tertiary);
    }

    .version-badge {
      font-family: monospace;
      font-weight: 600;
      color: var(--primary);
    }

    .platform-badge {
      padding: 0.25rem 0.5rem;
      border-radius: 0.25rem;
      font-size: 0.75rem;
      font-weight: 500;
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
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 0.25rem;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .badge-success {
      background: var(--success-bg);
      color: var(--success);
    }

    .badge-danger {
      background: var(--error-bg);
      color: var(--error);
    }

    .badge-warning {
      background: var(--warning-bg);
      color: var(--warning);
    }

    .badge-secondary {
      background: var(--bg-tertiary);
      color: var(--text-secondary);
    }

    .action-buttons {
      display: flex;
      gap: 0.5rem;
    }

    .btn-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 2rem;
      height: 2rem;
      border: none;
      border-radius: 0.375rem;
      background: var(--bg-tertiary);
      color: var(--text-secondary);
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-icon:hover {
      background: var(--bg-primary);
      color: var(--text-primary);
    }

    .btn-icon.active {
      color: var(--success);
    }

    .btn-icon.btn-danger:hover {
      background: var(--error-bg);
      color: var(--error);
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.625rem 1rem;
      border: none;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      text-decoration: none;
    }

    .btn-primary {
      background: var(--primary);
      color: white;
    }

    .btn-primary:hover {
      background: var(--primary-hover);
    }

    .pagination-container {
      padding: 1rem;
      border-top: 1px solid var(--border-color);
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
