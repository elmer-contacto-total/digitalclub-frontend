/**
 * Import Progress Component
 * PARIDAD: Rails admin/imports/create_import_user.html.erb
 * Paso 3: Progreso de procesamiento de importación
 */
import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { Subject, takeUntil, interval, switchMap, takeWhile } from 'rxjs';
import { ImportService, Import, TempImportUser } from '../../../../core/services/import.service';
import { ToastService } from '../../../../core/services/toast.service';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-import-progress',
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
        <h1 class="page-title">Progreso de importación</h1>
      </div>

      <!-- Progress Card -->
      <div class="progress-card">
        <div class="progress-top">
          <div class="progress-info">
            <span class="progress-percent">{{ progressPercent() }}%</span>
            <span class="progress-message">{{ progressMessage() }}</span>
          </div>
          <span class="status-badge" [ngClass]="getStatusClass()">
            {{ getStatusLabel() }}
          </span>
        </div>
        <div class="progress-track">
          <div
            class="progress-fill"
            [class.progress-complete]="isComplete() && importData()?.status === 'status_completed'"
            [class.progress-error]="isComplete() && importData()?.status === 'status_error'"
            [style.width.%]="progressPercent()"
          ></div>
        </div>

        @if (isComplete()) {
          @if (importData()?.status === 'status_completed') {
            <div class="result-banner result-success">
              <i class="ph ph-check-circle"></i>
              <div>
                <strong>Importación completada</strong>
                <p>Se importaron {{ importData()?.totRecords }} usuarios exitosamente.</p>
              </div>
            </div>
          } @else if (importData()?.status === 'status_error') {
            <div class="result-banner result-error">
              <i class="ph ph-x-circle"></i>
              <div>
                <strong>Error durante la importación</strong>
                @if (errorsText()) {
                  <pre class="error-block">{{ errorsText() }}</pre>
                }
              </div>
            </div>
          }
        }
      </div>

      <!-- Table -->
      @if (tempUsers().length > 0) {
        <div class="table-card">
          <table class="data-table">
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Email</th>
                <th>Nombres</th>
                <th>Apellido</th>
                <th>Cód. País</th>
                <th>Teléfono</th>
                <th>Rol</th>
                <th>Manager</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              @for (user of tempUsers(); track user.id) {
                <tr [class.row-error]="user.errorMessage">
                  <td>{{ user.codigo }}</td>
                  <td>{{ user.email }}</td>
                  <td>{{ user.firstName }}</td>
                  <td>{{ user.lastName }}</td>
                  <td>{{ user.phoneCode }}</td>
                  <td>{{ user.phone }}</td>
                  <td>{{ getRoleLabel(user.role) }}</td>
                  <td>{{ user.managerEmail }}</td>
                  <td class="error-cell">{{ user.errorMessage }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!-- Actions -->
      <div class="form-actions">
        <a routerLink="/app/imports" class="btn-secondary">
          <i class="ph ph-list"></i>
          Ver importaciones
        </a>
        <a routerLink="/app/users" class="btn-primary">
          <i class="ph ph-users"></i>
          Ver usuarios
        </a>
      </div>

      @if (isLoading()) {
        <app-loading-spinner [overlay]="true" message="Cargando..." />
      }
    </div>
  `,
  styles: [`
    .imports-page {
      padding: var(--space-6);
      max-width: 1200px;
      margin: 0 auto;
    }

    .page-header { margin-bottom: var(--space-6); }

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

    /* Progress Card */
    .progress-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius-lg);
      padding: var(--space-4);
      margin-bottom: var(--space-4);
    }

    .progress-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-3);
    }

    .progress-info {
      display: flex;
      align-items: baseline;
      gap: var(--space-3);
    }

    .progress-percent {
      font-size: var(--text-2xl);
      font-weight: var(--font-semibold);
      color: var(--fg-default);
    }

    .progress-message {
      font-size: var(--text-sm);
      color: var(--fg-muted);
    }

    .progress-track {
      height: 8px;
      background: var(--bg-muted);
      border-radius: var(--radius-full);
      overflow: hidden;
      margin-bottom: var(--space-4);
    }

    .progress-fill {
      height: 100%;
      background: var(--accent-default);
      border-radius: var(--radius-full);
      transition: width 0.4s ease;
    }

    .progress-complete { background: var(--success-default); }
    .progress-error { background: var(--error-default); }

    /* Result Banners */
    .result-banner {
      display: flex;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-md);

      > i { font-size: 24px; flex-shrink: 0; margin-top: 2px; }
      strong { display: block; margin-bottom: var(--space-1); }
      p { margin: 0; font-size: var(--text-sm); }
    }

    .result-success {
      background: var(--success-subtle);
      color: var(--success-text);
    }

    .result-error {
      background: var(--error-subtle);
      color: var(--error-text);
    }

    .error-block {
      margin: var(--space-2) 0 0;
      padding: var(--space-3);
      background: rgba(0,0,0,0.05);
      border-radius: var(--radius-md);
      font-family: var(--font-mono);
      font-size: var(--text-sm);
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 200px;
      overflow-y: auto;
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

    /* Table */
    .table-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius-lg);
      overflow: auto;
      margin-bottom: var(--space-4);
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: var(--text-sm);
    }

    .data-table thead th {
      padding: var(--space-3) var(--space-4);
      background: var(--table-header-bg);
      color: var(--fg-muted);
      font-size: var(--text-xs);
      font-weight: var(--font-semibold);
      text-transform: uppercase;
      letter-spacing: 0.3px;
      text-align: left;
      white-space: nowrap;
      border-bottom: 1px solid var(--table-border);
    }

    .data-table tbody td {
      padding: var(--space-2) var(--space-4);
      color: var(--fg-default);
      border-bottom: 1px solid var(--table-border);
      vertical-align: middle;
    }

    .data-table tbody tr {
      transition: background var(--duration-fast);
      &:hover { background: var(--table-row-hover); }
      &:last-child td { border-bottom: none; }
    }

    .row-error { background: var(--error-subtle) !important; }

    .error-cell {
      color: var(--error-text);
      font-weight: var(--font-medium);
      font-size: var(--text-xs);
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

    .btn-secondary {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-4);
      height: var(--btn-height);
      background: var(--bg-muted);
      color: var(--fg-default);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      font-size: var(--text-base);
      font-weight: var(--font-medium);
      cursor: pointer;
      text-decoration: none;
      transition: all var(--duration-fast);
      &:hover { background: var(--bg-emphasis); }
    }

    .form-actions {
      display: flex;
      gap: var(--space-3);
    }

    @media (max-width: 768px) {
      .imports-page { padding: var(--space-4); }
      .table-card { overflow-x: auto; }
      .data-table { min-width: 800px; }
      .form-actions { flex-direction: column; }
    }
  `]
})
export class ImportProgressComponent implements OnInit, OnDestroy {
  private importService = inject(ImportService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);
  private destroy$ = new Subject<void>();

  // Data
  importId = 0;
  importData = signal<Import | null>(null);
  tempUsers = signal<TempImportUser[]>([]);

  // Progress
  progressPercent = signal(0);
  progressMessage = signal('Iniciando procesamiento...');
  errorsText = signal('');

  // State
  isLoading = signal(true);
  isComplete = signal(false);

  ngOnInit(): void {
    this.route.params.pipe(
      takeUntil(this.destroy$)
    ).subscribe(params => {
      this.importId = +params['id'];
      this.loadImportData();
      this.startPolling();
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
        this.updateProgressFromData(data);
        this.isLoading.set(false);

        if (this.importService.isComplete(data.status)) {
          this.isComplete.set(true);
        }
      },
      error: (err) => {
        console.error('Error loading import:', err);
        this.toast.error('Error al cargar datos de importación');
        this.isLoading.set(false);
        this.router.navigate(['/app/imports']);
      }
    });
  }

  startPolling(): void {
    // Poll every 1 second until processing is complete
    interval(1000).pipe(
      takeUntil(this.destroy$),
      switchMap(() => this.importService.getProgress(this.importId)),
      takeWhile(progress => progress.status !== 'status_completed' && progress.status !== 'status_error', true)
    ).subscribe({
      next: (progress) => {
        this.progressPercent.set(progress.progress);
        this.progressMessage.set(progress.message || 'Procesando...');

        if (progress.errors) {
          this.errorsText.set(progress.errors);
        }

        // Update import data status
        this.importData.update(data => {
          if (data) {
            return { ...data, status: progress.status };
          }
          return data;
        });

        // Check if complete
        if (progress.status === 'status_completed' || progress.status === 'status_error') {
          this.isComplete.set(true);
          this.progressPercent.set(100);

          if (progress.status === 'status_completed') {
            this.progressMessage.set('Importación completada');
            this.toast.success('Importación completada exitosamente');
          } else {
            this.progressMessage.set('Error durante la importación');
            this.toast.error('Error durante la importación');
          }

          // Reload full data
          this.loadImportData();
        }
      },
      error: (err) => {
        console.error('Error polling progress:', err);
      }
    });
  }

  updateProgressFromData(data: Import): void {
    this.progressPercent.set(data.progressPercent || 0);

    if (data.status === 'status_completed') {
      this.progressMessage.set('Importación completada');
    } else if (data.status === 'status_error') {
      this.progressMessage.set('Error durante la importación');
      this.errorsText.set(data.errorsText || '');
    } else if (data.status === 'status_processing') {
      this.progressMessage.set(`Procesando... ${data.progress || 0} de ${data.totRecords || 0} registros`);
    }
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

  getRoleLabel(role: string): string {
    const labels: Record<string, string> = {
      'standard': 'Estándar',
      'agent': 'Agente',
      'supervisor': 'Supervisor',
      'admin': 'Administrador'
    };
    return labels[role?.toLowerCase()] || role || '-';
  }
}
