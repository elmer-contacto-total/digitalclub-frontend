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
import { ImportService, Import, ImportStatus, TempImportUser, UnmatchedColumn } from '../../../../core/services/import.service';
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
    <div class="imports-page">
      <!-- Header -->
      <div class="page-header">
        <a routerLink="/app/imports/new" [queryParams]="{import_type: 'users'}" class="back-link">
          <i class="ph ph-arrow-left"></i>
          Nueva importación
        </a>
        <h1 class="page-title">Validación del archivo</h1>
      </div>

      <!-- Status Banner -->
      @if (isValidating()) {
        <div class="status-banner status-banner-info">
          <div class="spinner"></div>
          <div>
            <strong>Validando archivo...</strong>
            <p>Por favor, espere mientras se procesan los registros.</p>
          </div>
        </div>
      } @else if (importData()?.status === 'status_valid') {
        <div class="status-banner status-banner-success">
          <i class="ph ph-check-circle"></i>
          <div>
            <strong>Archivo válido</strong>
            <p>Se encontraron <strong>{{ importData()?.totRecords }}</strong> registros listos para importar.</p>
            <label class="checkbox-label">
              <input type="checkbox" [(ngModel)]="sendInvitationEmail" />
              <span>Enviar correo de invitación a los usuarios nuevos</span>
            </label>
          </div>
        </div>
      } @else if (importData()?.status === 'status_error') {
        <div class="status-banner status-banner-error">
          <i class="ph ph-x-circle"></i>
          <div>
            <strong>Errores en el archivo</strong>
            <p>Corrija los errores y cargue un nuevo archivo.</p>
            @if (importData()?.errorsText) {
              <pre class="error-block">{{ importData()?.errorsText }}</pre>
            }
          </div>
        </div>
      }

      <!-- Unmatched Columns Banner (Phase D) -->
      @if (unmatchedColumns().length > 0) {
        <div class="status-banner status-banner-warning">
          <i class="ph ph-warning"></i>
          <div class="unmatched-section">
            <strong>Se encontraron {{ unmatchedColumns().length }} columna(s) no registradas como campos CRM</strong>
            <p>Seleccione las columnas que desea agregar como campos CRM o ignórelas.</p>
            <div class="unmatched-list">
              @for (col of unmatchedColumns(); track col.name) {
                <label class="checkbox-label">
                  <input type="checkbox"
                    [checked]="selectedColumns().has(col.name)"
                    (change)="toggleColumn(col.name)" />
                  <span>{{ col.name }}</span>
                </label>
              }
            </div>
            <div class="unmatched-actions">
              <button type="button" class="btn-sm btn-outline" (click)="selectAllColumns()">
                Seleccionar todas
              </button>
              <button type="button" class="btn-sm btn-outline" (click)="selectNoColumns()">
                No agregar ninguna
              </button>
              <button type="button" class="btn-sm btn-primary-sm" (click)="confirmColumnSelection()"
                [disabled]="isAcceptingColumns()">
                @if (isAcceptingColumns()) {
                  <span class="spinner spinner-sm"></span>
                }
                Confirmar selección
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Table -->
      @if (!isLoading() && tempUsers().length > 0) {
        <div class="table-card">
          <table class="data-table">
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Apellido</th>
                <th>Nombres</th>
                <th>Teléfono</th>
                <th>Cód. País</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Ejecutivo</th>
                <th>CRM</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              @for (user of tempUsers(); track user.id) {
                <tr [class.row-error]="user.errorMessage">
                  <td>{{ user.codigo }}</td>
                  <td>{{ user.lastName }}</td>
                  <td>{{ user.firstName }}</td>
                  <td>{{ user.phone }}</td>
                  <td>{{ user.phoneCode }}</td>
                  <td>{{ user.email }}</td>
                  <td>{{ user.role }}</td>
                  <td>{{ user.managerEmail }}</td>
                  <td class="text-subtle">{{ formatCrmFields(user.crmFields) }}</td>
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
          <a routerLink="/app/imports/new" [queryParams]="{import_type: 'users'}" class="btn-ghost">Cancelar</a>
          <button type="button" class="btn-primary" (click)="confirmImport()"
            [disabled]="isProcessing() || unmatchedColumns().length > 0">
            @if (isProcessing()) {
              <span class="spinner spinner-sm"></span>
              Procesando...
            } @else {
              <i class="ph ph-check"></i>
              Procesar registros
            }
          </button>
        } @else if (importData()?.status === 'status_error') {
          <a routerLink="/app/imports/new" [queryParams]="{import_type: 'users'}" class="btn-secondary">
            <i class="ph ph-arrow-left"></i>
            Cargar nuevo archivo
          </a>
        }
      </div>

      @if (isLoading()) {
        <app-loading-spinner [overlay]="true" message="Cargando datos..." />
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

    /* Status Banners */
    .status-banner {
      display: flex;
      gap: var(--space-3);
      padding: var(--space-4);
      border-radius: var(--radius-lg);
      margin-bottom: var(--space-4);

      > i { font-size: 24px; flex-shrink: 0; margin-top: 2px; }

      strong { display: block; margin-bottom: var(--space-1); }
      p { margin: 0; font-size: var(--text-sm); line-height: 1.5; }
    }

    .status-banner-info {
      background: var(--info-subtle);
      border: 1px solid var(--info-default);
      color: var(--info-text);
    }

    .status-banner-success {
      background: var(--success-subtle);
      border: 1px solid var(--success-default);
      color: var(--success-text);
    }

    .status-banner-error {
      background: var(--error-subtle);
      border: 1px solid var(--error-default);
      color: var(--error-text);
    }

    .status-banner-warning {
      background: var(--warning-subtle, #fff8e1);
      border: 1px solid var(--warning-default, #f9a825);
      color: var(--warning-text, #5d4037);
    }

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin-top: var(--space-3);
      cursor: pointer;
      font-size: var(--text-sm);

      input[type="checkbox"] {
        width: 16px;
        height: 16px;
        accent-color: var(--accent-default);
        cursor: pointer;
      }
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

    /* Unmatched columns section */
    .unmatched-section {
      flex: 1;
    }

    .unmatched-list {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin-top: var(--space-3);

      .checkbox-label {
        margin-top: 0;
        padding: var(--space-1) var(--space-3);
        background: rgba(0,0,0,0.05);
        border-radius: var(--radius-md);
      }
    }

    .unmatched-actions {
      display: flex;
      gap: var(--space-2);
      margin-top: var(--space-3);
    }

    .btn-sm {
      padding: var(--space-1) var(--space-3);
      font-size: var(--text-xs);
      border-radius: var(--radius-md);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
    }

    .btn-outline {
      background: transparent;
      border: 1px solid var(--border-default);
      color: var(--fg-default);
      &:hover { background: var(--bg-subtle); }
    }

    .btn-primary-sm {
      background: var(--accent-default);
      color: #fff;
      border: none;
      font-weight: var(--font-medium);
      &:hover:not(:disabled) { background: var(--accent-emphasis); }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }

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

    .row-error {
      background: var(--error-subtle) !important;
    }

    .error-cell {
      color: var(--error-text);
      font-weight: var(--font-medium);
      font-size: var(--text-xs);
    }

    .text-subtle { color: var(--fg-subtle); }

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
      transition: background var(--duration-fast);
      &:hover:not(:disabled) { background: var(--accent-emphasis); }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
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

    .btn-ghost {
      display: inline-flex;
      align-items: center;
      padding: var(--space-2) var(--space-4);
      height: var(--btn-height);
      background: transparent;
      color: var(--fg-muted);
      border: none;
      border-radius: var(--radius-md);
      font-size: var(--text-base);
      cursor: pointer;
      text-decoration: none;
      &:hover { color: var(--fg-default); background: var(--bg-subtle); }
    }

    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-3);
    }

    /* Spinner */
    .spinner {
      width: 20px;
      height: 20px;
      border: 2.5px solid var(--accent-muted);
      border-top-color: var(--accent-default);
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
      flex-shrink: 0;
    }

    .spinner-sm {
      width: 16px;
      height: 16px;
      border-width: 2px;
      border-color: rgba(255,255,255,0.3);
      border-top-color: #fff;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    @media (max-width: 768px) {
      .imports-page { padding: var(--space-4); }
      .table-card { overflow-x: auto; }
      .data-table { min-width: 900px; }
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
  unmatchedColumns = signal<UnmatchedColumn[]>([]);
  selectedColumns = signal<Set<string>>(new Set());

  // State
  isLoading = signal(true);
  isValidating = signal(false);
  isProcessing = signal(false);
  isAcceptingColumns = signal(false);

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

        // Load temp users for preview when validation is complete
        if (data.status === 'status_valid' || data.status === 'status_error') {
          this.importService.getValidatedUsers(this.importId).pipe(
            takeUntil(this.destroy$)
          ).subscribe({
            next: (result) => {
              this.tempUsers.set(result.tempUsers || []);
              this.unmatchedColumns.set(result.unmatchedColumns || []);
              // Pre-select all unmatched columns by default
              if (result.unmatchedColumns && result.unmatchedColumns.length > 0) {
                this.selectedColumns.set(new Set(result.unmatchedColumns.map(c => c.name)));
              }
            },
            error: (err) => {
              console.error('Error loading temp users:', err);
            }
          });
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

  /**
   * Format CRM fields from object to readable string
   * Phase F2: Converts {key: value} to "key: value, ..."
   */
  formatCrmFields(crmFields: Record<string, string> | null): string {
    if (!crmFields || typeof crmFields !== 'object') return '';
    return Object.entries(crmFields)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
  }

  /** Phase D: Toggle individual column selection */
  toggleColumn(name: string): void {
    this.selectedColumns.update(set => {
      const newSet = new Set(set);
      if (newSet.has(name)) {
        newSet.delete(name);
      } else {
        newSet.add(name);
      }
      return newSet;
    });
  }

  /** Phase D: Select all unmatched columns */
  selectAllColumns(): void {
    this.selectedColumns.set(new Set(this.unmatchedColumns().map(c => c.name)));
  }

  /** Phase D: Deselect all unmatched columns */
  selectNoColumns(): void {
    this.selectedColumns.set(new Set());
  }

  /** Phase D: Confirm column selection and send to backend */
  confirmColumnSelection(): void {
    const selected = Array.from(this.selectedColumns());
    this.isAcceptingColumns.set(true);

    if (selected.length === 0) {
      // No columns selected — just dismiss the banner
      this.unmatchedColumns.set([]);
      this.isAcceptingColumns.set(false);
      this.toast.success('Columnas descartadas');
      return;
    }

    this.importService.acceptColumns(this.importId, selected).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.isAcceptingColumns.set(false);
        this.unmatchedColumns.set([]);
        this.toast.success(`${selected.length} columna(s) agregadas como campos CRM`);
        // Reload data to reflect changes
        this.loadImportData();
      },
      error: (err) => {
        console.error('Error accepting columns:', err);
        this.isAcceptingColumns.set(false);
        this.toast.error('Error al aceptar columnas');
      }
    });
  }

  confirmImport(): void {
    if (this.importData()?.status !== 'status_valid') {
      return;
    }

    this.isProcessing.set(true);

    // Phase F3: Send sendInvitationEmail parameter
    this.importService.confirmImport(this.importId, this.sendInvitationEmail).pipe(
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
