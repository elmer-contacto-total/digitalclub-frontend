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
    <div class="import-detail-container">
      <!-- Header - PARIDAD: Rails admin/imports/show.html.erb -->
      <div class="page-header">
        <a routerLink="/app/imports" class="btn btn-secondary">
          <i class="ph ph-arrow-left"></i>
          Volver
        </a>
        <div class="title-container">
          <h1>Ver importación</h1>
        </div>
      </div>

      @if (isLoading()) {
        <app-loading-spinner [overlay]="false" message="Cargando..." />
      } @else if (importData()) {
        <!-- Detail Fields - PARIDAD: Rails dl-horizontal -->
        <dl class="dl-horizontal">
          <dt>Cliente:</dt>
          <dd>{{ importData()?.clientName || '-' }}</dd>
        </dl>

        <dl class="dl-horizontal">
          <dt>Archivo:</dt>
          <dd>
            @if (importData()?.importFileName) {
              <a [href]="importData()?.importFileUrl" target="_blank">
                {{ importData()?.importFileName }}
              </a>
            } @else {
              -
            }
          </dd>
        </dl>

        <dl class="dl-horizontal">
          <dt>Total Registros:</dt>
          <dd>{{ importData()?.totRecords || 0 }}</dd>
        </dl>

        <dl class="dl-horizontal">
          <dt>Estado:</dt>
          <dd>
            <span class="badge" [ngClass]="getStatusClass()">
              {{ getStatusLabel() }}
            </span>
          </dd>
        </dl>

        <dl class="dl-horizontal">
          <dt>Progreso:</dt>
          <dd>{{ importData()?.progressPercent || 0 }}%</dd>
        </dl>

        <dl class="dl-horizontal">
          <dt>Creado por:</dt>
          <dd>{{ importData()?.userName || '-' }}</dd>
        </dl>

        <dl class="dl-horizontal">
          <dt>Fecha de Creación:</dt>
          <dd>{{ formatDate(importData()?.createdAt) }}</dd>
        </dl>

        @if (importData()?.errorsText) {
          <dl class="dl-horizontal">
            <dt>Errores:</dt>
            <dd class="error-text">{{ importData()?.errorsText }}</dd>
          </dl>
        }

        <!-- Actions based on status -->
        <div class="form-actions">
          @if (importData()?.status === 'status_valid') {
            <a [routerLink]="['/app/imports', importData()?.id, 'preview']" class="btn btn-primary">
              <i class="ph ph-eye"></i>
              Ver Validación
            </a>
          }

          @if (importData()?.status === 'status_processing') {
            <a [routerLink]="['/app/imports', importData()?.id, 'progress']" class="btn btn-primary">
              <i class="ph ph-arrow-circle-right"></i>
              Ver Progreso
            </a>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .import-detail-container {
      padding: 24px;
    }

    .page-header {
      margin-bottom: 24px;
    }

    .title-container {
      margin-top: 16px;

      h1 {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 500;
        color: var(--text-primary, #212529);
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
    }

    .btn-primary {
      background-color: var(--primary-color, #0d6efd);
      border-color: var(--primary-color, #0d6efd);
      color: white;

      &:hover {
        background-color: var(--primary-dark, #0b5ed7);
      }
    }

    .btn-secondary {
      background-color: var(--secondary-color, #6c757d);
      border-color: var(--secondary-color, #6c757d);
      color: white;

      &:hover {
        background-color: #5c636a;
      }
    }

    /* DL Horizontal - PARIDAD: Rails dl-horizontal */
    .dl-horizontal {
      display: flex;
      margin: 0 0 12px 0;
      padding: 12px 16px;
      background: white;
      border: 1px solid var(--border-color, #dee2e6);
      border-radius: 4px;

      dt {
        min-width: 160px;
        font-weight: 600;
        color: var(--text-primary, #212529);
      }

      dd {
        margin: 0;
        color: var(--text-secondary, #6c757d);

        a {
          color: var(--primary-color, #0d6efd);
          text-decoration: none;

          &:hover {
            text-decoration: underline;
          }
        }
      }
    }

    .error-text {
      color: #dc3545;
      font-family: monospace;
      white-space: pre-wrap;
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
    .badge-warning { background: #fff3cd; color: #856404; }
    .badge-success { background: #d1fae5; color: #065f46; }
    .badge-danger { background: #fee2e2; color: #991b1b; }
    .badge-info { background: #dbeafe; color: #1e40af; }

    .form-actions {
      margin-top: 20px;
      display: flex;
      gap: 12px;
    }

    @media (max-width: 768px) {
      .import-detail-container { padding: 16px; }
      .dl-horizontal { flex-direction: column; }
      .dl-horizontal dt { margin-bottom: 4px; }
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
