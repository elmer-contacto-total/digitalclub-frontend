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
    <div class="import-progress-container">
      <!-- Header - PARIDAD: Rails admin/imports/create_import_user.html.erb -->
      <div class="page-header">
        <a routerLink="/app/imports/new" [queryParams]="{import_type: 'users'}" class="btn btn-secondary">
          <i class="ph ph-arrow-left"></i>
          Volver
        </a>
        <div class="title-container">
          <h1>Importación Paso 3</h1>
        </div>

        <!-- Progress Section - PARIDAD: Rails import-progress controller -->
        <div class="progress-section">
          <div class="progress">
            <div
              class="progress-bar"
              role="progressbar"
              [style.width.%]="progressPercent()"
              [attr.aria-valuenow]="progressPercent()"
              aria-valuemin="0"
              aria-valuemax="100"
            >
              {{ progressPercent() }}%
            </div>
          </div>
          <div class="progress-message">{{ progressMessage() }}</div>
          <div class="import-status">
            <span class="badge" [ngClass]="getStatusClass()">
              {{ getStatusLabel() }}
            </span>
          </div>

          @if (isComplete()) {
            <div class="title-container complete-message">
              @if (importData()?.status === 'status_completed') {
                <p class="text-success">
                  <i class="ph ph-check-circle"></i>
                  Importación completada exitosamente
                </p>
                <p>Se importaron {{ importData()?.totRecords }} usuarios.</p>
              } @else if (importData()?.status === 'status_error') {
                <p class="text-danger">
                  <i class="ph ph-x-circle"></i>
                  Error durante la importación
                </p>
                <p class="error-text">{{ errorsText() }}</p>
              }
            </div>
          }
        </div>
      </div>

      <!-- Table - PARIDAD: Rails DataTable for processed users -->
      @if (tempUsers().length > 0) {
        <div class="table-responsive">
          <table class="table table-striped table-bordered table-hover">
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Email</th>
                <th>Nombres</th>
                <th>Apellido</th>
                <th>Código País</th>
                <th>Teléfono</th>
                <th>Rol</th>
                <th>Email del Manager</th>
                <th>Mensaje de Error</th>
              </tr>
            </thead>
            <tbody>
              @for (user of tempUsers(); track user.id) {
                <tr [class.has-error]="user.errorMessage">
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

      <!-- Actions - PARIDAD: Rails see_users link -->
      <div class="form-actions">
        <a routerLink="/app/users" class="btn btn-primary">
          <i class="ph ph-list"></i>
          Ver usuarios
        </a>
        <a routerLink="/app/imports" class="btn btn-secondary">
          <i class="ph ph-list"></i>
          Ver importaciones
        </a>
      </div>

      @if (isLoading()) {
        <app-loading-spinner [overlay]="true" message="Cargando..." />
      }
    </div>
  `,
  styles: [`
    .import-progress-container {
      padding: 24px;
    }

    .page-header {
      margin-bottom: 24px;
    }

    .title-container {
      margin-top: 16px;

      h1 {
        margin: 0 0 16px 0;
        font-size: 1.5rem;
        font-weight: 500;
        color: var(--text-primary, #212529);
      }

      p {
        margin: 0 0 12px 0;
        color: var(--text-secondary, #6c757d);
      }
    }

    /* Progress Section - PARIDAD: Rails progress styles */
    .progress-section {
      margin: 20px 0;
    }

    .progress {
      height: 24px;
      background-color: #e9ecef;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 12px;
    }

    .progress-bar {
      height: 100%;
      background-color: var(--primary-color, #0d6efd);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 500;
      transition: width 0.3s ease;
    }

    .progress-message {
      font-size: 14px;
      color: var(--text-secondary, #6c757d);
      margin-bottom: 8px;
    }

    .import-status {
      margin-bottom: 16px;
    }

    .complete-message {
      padding: 16px;
      border-radius: 4px;
      background: var(--bg-light, #f8f9fa);
      border: 1px solid var(--border-color, #dee2e6);
    }

    .text-success {
      color: #065f46 !important;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 8px;

      i {
        font-size: 24px;
      }
    }

    .text-danger {
      color: #991b1b !important;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 8px;

      i {
        font-size: 24px;
      }
    }

    .error-text {
      padding: 12px;
      background: #fee2e2;
      border-radius: 4px;
      color: #991b1b;
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

    /* Table - PARIDAD: Rails DataTable */
    .table-responsive {
      background: white;
      border-radius: 4px;
      overflow: auto;
      margin: 20px 0;
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

    .table tbody tr.has-error {
      background: #fff5f5;
    }

    .error-cell {
      color: #dc3545;
      font-weight: 500;
    }

    .form-actions {
      margin-top: 20px;
      display: flex;
      gap: 12px;
    }

    @media (max-width: 768px) {
      .import-progress-container { padding: 16px; }
      .table-responsive { overflow-x: auto; }
      .table { min-width: 900px; }
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
