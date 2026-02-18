/**
 * Import Detail Component
 * PARIDAD: Rails admin/imports/show.html.erb
 * Vista de detalle de importación
 */
import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ImportService, Import } from '../../../../core/services/import.service';
import { ToastService } from '../../../../core/services/toast.service';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-import-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    LoadingSpinnerComponent
  ],
  template: `
    <div class="imports-page">
      <!-- Header -->
      <div class="page-header">
        <a routerLink="/app/imports" class="back-link">
          <i class="ph ph-arrow-left"></i>
          Importaciones
        </a>
        <h1 class="page-title">Detalle de importación</h1>
      </div>

      @if (isLoading()) {
        <app-loading-spinner [overlay]="false" message="Cargando..." />
      } @else if (importData()) {
        <!-- Detail Card -->
        <div class="detail-card">
          <div class="detail-row">
            <span class="detail-label">Estado</span>
            <span class="detail-value">
              <span class="status-badge" [ngClass]="getStatusClass()">
                {{ getStatusLabel() }}
              </span>
            </span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Progreso</span>
            <span class="detail-value">
              <div class="progress-inline">
                <div class="progress-bar-bg">
                  <div class="progress-bar-fill" [style.width.%]="importData()?.progressPercent || 0"></div>
                </div>
                <span>{{ importData()?.progressPercent || 0 }}%</span>
              </div>
            </span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Total registros</span>
            <span class="detail-value">{{ importData()?.totRecords || 0 }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Cliente</span>
            <span class="detail-value">{{ importData()?.clientName || '-' }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Creado por</span>
            <span class="detail-value">{{ importData()?.userName || '-' }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Fecha</span>
            <span class="detail-value">{{ formatDate(importData()?.createdAt) }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Archivo</span>
            <span class="detail-value">
              @if (importData()?.importFileName) {
                <a (click)="downloadFile()" class="file-link" style="cursor:pointer">
                  <i class="ph ph-file-csv"></i>
                  {{ importData()?.importFileName }}
                </a>
              } @else {
                <span class="text-subtle">-</span>
              }
            </span>
          </div>
          @if (importData()?.errorsText) {
            <div class="detail-row errors-row">
              <span class="detail-label">Errores</span>
              <span class="detail-value">
                <pre class="error-block">{{ importData()?.errorsText }}</pre>
              </span>
            </div>
          }
        </div>

        <!-- Actions -->
        <div class="form-actions">
          @if (importData()?.status === 'status_valid') {
            <a [routerLink]="['/app/imports', importData()?.id, 'preview']" class="btn-primary">
              <i class="ph ph-eye"></i>
              Ver validación
            </a>
          }
          @if (importData()?.status === 'status_processing') {
            <a [routerLink]="['/app/imports', importData()?.id, 'progress']" class="btn-primary">
              <i class="ph ph-arrow-circle-right"></i>
              Ver progreso
            </a>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .imports-page {
      padding: var(--space-6);
      max-width: 800px;
      margin: 0 auto;
    }

    .page-header {
      margin-bottom: var(--space-6);
    }

    .back-link {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      color: var(--fg-muted);
      text-decoration: none;
      font-size: var(--text-sm);
      margin-bottom: var(--space-2);
      transition: color var(--duration-fast);

      &:hover { color: var(--accent-default); }
    }

    .page-title {
      margin: 0;
      font-size: var(--text-2xl);
      font-weight: var(--font-semibold);
      color: var(--fg-default);
    }

    /* Detail Card */
    .detail-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius-lg);
      overflow: hidden;
    }

    .detail-row {
      display: flex;
      align-items: flex-start;
      padding: var(--space-3) var(--space-4);
      border-bottom: 1px solid var(--border-muted);

      &:last-child { border-bottom: none; }
    }

    .detail-label {
      min-width: 140px;
      font-size: var(--text-sm);
      font-weight: var(--font-medium);
      color: var(--fg-muted);
      flex-shrink: 0;
    }

    .detail-value {
      font-size: var(--text-base);
      color: var(--fg-default);
    }

    .text-subtle { color: var(--fg-subtle); }

    /* Progress Inline */
    .progress-inline {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }

    .progress-bar-bg {
      width: 120px;
      height: 6px;
      background: var(--bg-muted);
      border-radius: var(--radius-full);
      overflow: hidden;
    }

    .progress-bar-fill {
      height: 100%;
      background: var(--accent-default);
      border-radius: var(--radius-full);
      transition: width 0.3s ease;
    }

    /* Status Badge */
    .status-badge {
      display: inline-flex;
      align-items: center;
      padding: 2px var(--space-3);
      border-radius: var(--radius-full);
      font-size: var(--text-xs);
      font-weight: var(--font-medium);
    }

    .badge-secondary { background: var(--bg-muted); color: var(--fg-muted); }
    .badge-warning { background: var(--warning-subtle); color: var(--warning-text); }
    .badge-success { background: var(--success-subtle); color: var(--success-text); }
    .badge-danger { background: var(--error-subtle); color: var(--error-text); }
    .badge-info { background: var(--info-subtle); color: var(--info-text); }

    /* File Link */
    .file-link {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      color: var(--accent-default);
      text-decoration: none;

      &:hover { text-decoration: underline; }
      i { font-size: 18px; }
    }

    /* Error Block */
    .error-block {
      margin: 0;
      padding: var(--space-3);
      background: var(--error-subtle);
      color: var(--error-text);
      border-radius: var(--radius-md);
      font-family: var(--font-mono);
      font-size: var(--text-sm);
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 200px;
      overflow-y: auto;
    }

    .errors-row {
      flex-direction: column;
      gap: var(--space-2);
    }

    /* Buttons */
    .btn-primary {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-4);
      height: var(--btn-height);
      background: var(--accent-default);
      color: #fff;
      border: none;
      border-radius: var(--radius-md);
      font-size: var(--text-base);
      font-weight: var(--font-medium);
      cursor: pointer;
      text-decoration: none;
      transition: background var(--duration-fast);

      &:hover { background: var(--accent-emphasis); }
    }

    .form-actions {
      display: flex;
      gap: var(--space-3);
      margin-top: var(--space-4);
    }

    @media (max-width: 768px) {
      .imports-page { padding: var(--space-4); }
      .detail-row { flex-direction: column; gap: var(--space-1); }
      .detail-label { min-width: unset; }
    }
  `]
})
export class ImportDetailComponent implements OnInit, OnDestroy {
  private importService = inject(ImportService);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);
  private destroy$ = new Subject<void>();

  // Data
  importId = 0;
  importData = signal<(Import & { clientName?: string; importFileName?: string; importFileUrl?: string }) | null>(null);
  isLoading = signal(true);

  ngOnInit(): void {
    this.route.params.pipe(
      takeUntil(this.destroy$)
    ).subscribe(params => {
      this.importId = +params['id'];
      this.loadImportData();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadImportData(): void {
    this.isLoading.set(true);

    this.importService.getImport(this.importId).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (data) => {
        this.importData.set(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading import:', err);
        this.toast.error('Error al cargar datos de importación');
        this.isLoading.set(false);
      }
    });
  }

  getStatusLabel(): string {
    const data = this.importData();
    if (!data) return '-';
    return this.importService.getStatusLabel(data.status);
  }

  getStatusClass(): string {
    const data = this.importData();
    if (!data) return 'badge-secondary';
    return this.importService.getStatusClass(data.status);
  }

  downloadFile(): void {
    const data = this.importData();
    if (data) {
      this.importService.downloadFile(data.id, (data as any).importFileName);
    }
  }

  formatDate(dateStr: string | undefined): string {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-PE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
