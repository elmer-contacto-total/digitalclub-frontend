/**
 * Import Preview Component
 * PARIDAD: Rails admin/imports/validated_import_user.html.erb
 * Paso 2: Resultados de validación del CSV
 */
import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, interval, switchMap, takeWhile } from 'rxjs';
import { ImportService, Import, ImportStatus, TempImportUser } from '../../../../core/services/import.service';
import { ToastService } from '../../../../core/services/toast.service';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-import-preview',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FormsModule,
    LoadingSpinnerComponent
  ],
  template: `
    <div class="import-preview-container">
      <!-- Header - PARIDAD: Rails admin/imports/validated_import_user.html.erb -->
      <div class="page-header">
        <a routerLink="/app/imports/new" [queryParams]="{import_type: 'users'}" class="btn btn-secondary">
          <i class="ph ph-arrow-left"></i>
          Volver
        </a>
        <div class="title-container">
          <h1>Importación Paso 2</h1>
        </div>
        <div class="title-container">
          <p>Resultados de la validación del archivo CSV cargado:</p>
          <div id="validation-result">
            @if (isValidating()) {
              <p>Validando archivo... Por favor, espere.</p>
            } @else if (importData()?.status === 'status_valid') {
              <p class="text-success">Archivo válido y sin errores</p>
              <p>Número de nuevos usuarios que serán agregados: <strong>{{ importData()?.totRecords }}</strong></p>
              <div class="form-check form-check-inline">
                <input
                  class="form-check-input"
                  type="checkbox"
                  id="sendInvitationEmail"
                  [(ngModel)]="sendInvitationEmail"
                />
                <label class="form-check-label" for="sendInvitationEmail">
                  ¿Desea enviar un correo de invitación a todos los usuarios nuevos?
                </label>
              </div>
            } @else if (importData()?.status === 'status_error') {
              <p class="text-danger">Hay errores en el archivo CSV cargado:</p>
              <p class="error-text">{{ importData()?.errorsText }}</p>
              <p>Favor presione en volver e intente cargar un nuevo archivo corregido.</p>
            }
          </div>
        </div>
      </div>

      <!-- In Progress Indicator -->
      @if (isValidating()) {
        <div id="in-progress-indicator">
          <p class="progress-text">Validando<span class="dots"></span></p>
        </div>
      }

      <!-- Table - PARIDAD: Rails DataTable for temp_import_users -->
      @if (!isLoading() && tempUsers().length > 0) {
        <div class="table-responsive">
          <table class="table table-striped table-bordered table-hover">
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Apellido</th>
                <th>Nombres</th>
                <th>Teléfono</th>
                <th>Email</th>
                <th>Email del Agente</th>
                <th>Campos CRM</th>
                <th>Mensaje de Error</th>
              </tr>
            </thead>
            <tbody>
              @for (user of tempUsers(); track user.id) {
                <tr [class.has-error]="user.errorMessage">
                  <td>{{ user.codigo }}</td>
                  <td>{{ user.lastName }}</td>
                  <td>{{ user.firstName }}</td>
                  <td>{{ user.phone }}</td>
                  <td>{{ user.email }}</td>
                  <td>{{ user.managerEmail }}</td>
                  <td>{{ user.crmFields || '' }}</td>
                  <td class="error-cell">{{ user.errorMessage }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!-- Actions -->
      <div class="form-actions">
        @if (importData()?.status === 'status_valid') {
          <button
            type="button"
            class="btn btn-primary"
            (click)="confirmImport()"
            [disabled]="isProcessing()"
          >
            @if (isProcessing()) {
              <span class="spinner-border spinner-border-sm"></span>
              Procesando...
            } @else {
              <i class="ph ph-check"></i>
              Procesar registros importados
            }
          </button>
        } @else {
          <a routerLink="/app/imports/new" [queryParams]="{import_type: 'users'}" class="btn btn-secondary">
            <i class="ph ph-arrow-left"></i>
            Volver
          </a>
        }
      </div>

      @if (isLoading()) {
        <app-loading-spinner [overlay]="true" message="Cargando datos..." />
      }
    </div>
  `,
  styles: [`
    .import-preview-container {
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

    .text-success {
      color: #065f46 !important;
      font-weight: 500;
    }

    .text-danger {
      color: #991b1b !important;
      font-weight: 500;
    }

    .error-text {
      padding: 12px;
      background: #fee2e2;
      border-radius: 4px;
      color: #991b1b;
      font-family: monospace;
      white-space: pre-wrap;
    }

    .form-check-inline {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 16px;
    }

    .form-check-input {
      width: 18px;
      height: 18px;
      cursor: pointer;
    }

    .form-check-label {
      cursor: pointer;
      user-select: none;
    }

    /* In Progress Indicator - PARIDAD: Rails style */
    #in-progress-indicator {
      margin: 20px 0;
    }

    .progress-text {
      color: #dc3545;
      font-size: 20px;
    }

    .dots::after {
      content: '...';
      font-size: 20px;
      animation: blink 1s steps(1, end) infinite;
    }

    @keyframes blink {
      0% { opacity: 1; }
      50% { opacity: 0; }
      100% { opacity: 1; }
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

    .btn-secondary {
      background-color: var(--secondary-color, #6c757d);
      border-color: var(--secondary-color, #6c757d);
      color: white;

      &:hover:not(:disabled) {
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
    }

    .spinner-border-sm {
      width: 16px;
      height: 16px;
      border-width: 2px;
    }

    @media (max-width: 768px) {
      .import-preview-container { padding: 16px; }
      .table-responsive { overflow-x: auto; }
      .table { min-width: 900px; }
    }
  `]
})
export class ImportPreviewComponent implements OnInit, OnDestroy {
  private importService = inject(ImportService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);
  private destroy$ = new Subject<void>();

  // Data
  importId = 0;
  importData = signal<Import | null>(null);
  tempUsers = signal<TempImportUser[]>([]);

  // State
  isLoading = signal(true);
  isValidating = signal(false);
  isProcessing = signal(false);

  // Options
  sendInvitationEmail = false;

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

        // If validating, poll for status updates
        if (data.status === 'status_new' || data.status === 'status_validating') {
          this.isValidating.set(true);
          this.pollStatus();
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

  pollStatus(): void {
    // Poll every 2 seconds until validation is complete
    interval(2000).pipe(
      takeUntil(this.destroy$),
      switchMap(() => this.importService.getStatus(this.importId)),
      takeWhile(status => !this.importService.isComplete(status.status) && status.status !== 'status_valid', true)
    ).subscribe({
      next: (status) => {
        // Update import data with new status
        this.importData.update(data => {
          if (data) {
            return {
              ...data,
              status: status.status,
              totRecords: status.totRecords,
              progress: status.progress,
              progressPercent: status.progressPercent
            };
          }
          return data;
        });

        // Check if validation is complete
        if (status.status === 'status_valid' || status.status === 'status_error' || status.status === 'status_completed') {
          this.isValidating.set(false);
          // Reload full data to get temp users
          this.loadImportData();
        }
      },
      error: (err) => {
        console.error('Error polling status:', err);
        this.isValidating.set(false);
      }
    });
  }

  confirmImport(): void {
    if (this.importData()?.status !== 'status_valid') {
      return;
    }

    this.isProcessing.set(true);

    this.importService.confirmImport(this.importId).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.toast.success('Importación iniciada correctamente');
        // Navigate to progress view
        this.router.navigate(['/app/imports', this.importId, 'progress']);
      },
      error: (err) => {
        console.error('Error confirming import:', err);
        this.toast.error('Error al iniciar importación');
        this.isProcessing.set(false);
      }
    });
  }
}
