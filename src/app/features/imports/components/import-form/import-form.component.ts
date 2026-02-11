/**
 * Import Form Component
 * PARIDAD: Rails admin/imports/new.html.erb
 * Paso 1: Subir archivo CSV para importación
 */
import { Component, inject, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { ImportService } from '../../../../core/services/import.service';
import { ToastService } from '../../../../core/services/toast.service';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-import-form',
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
        <div class="page-header-left">
          <a routerLink="/app/imports" class="back-link">
            <i class="ph ph-arrow-left"></i>
            Importaciones
          </a>
          <h1 class="page-title">Nueva importación</h1>
        </div>
      </div>

      <!-- Instructions Card -->
      <div class="card instructions-card">
        <div class="card-header">
          <i class="ph ph-info"></i>
          <span>Instrucciones</span>
        </div>
        <div class="card-body">
          <p>Prepare y cargue un archivo CSV (delimitado por comas) con la lista de usuarios a importar. El archivo debe contener las siguientes columnas:</p>
          <div class="columns-grid">
            <div class="column-item required">
              <i class="ph ph-check-circle"></i>
              <span>APELLIDO_P</span>
              <small>obligatorio</small>
            </div>
            <div class="column-item">
              <i class="ph ph-circle"></i>
              <span>APELLIDO_M</span>
              <small>opcional</small>
            </div>
            <div class="column-item required">
              <i class="ph ph-check-circle"></i>
              <span>NOMBRES</span>
              <small>obligatorio</small>
            </div>
            <div class="column-item required">
              <i class="ph ph-check-circle"></i>
              <span>CELULAR</span>
              <small>único, sin 51</small>
            </div>
            <div class="column-item">
              <i class="ph ph-circle"></i>
              <span>CORREO</span>
              <small>único si se ingresa</small>
            </div>
            <div class="column-item required">
              <i class="ph ph-check-circle"></i>
              <span>EJECUTIVO</span>
              <small>obligatorio</small>
            </div>
          </div>
          <button type="button" class="btn-secondary" (click)="downloadSampleCsv()">
            <i class="ph ph-download-simple"></i>
            Descargar CSV de ejemplo
          </button>
        </div>
      </div>

      <!-- Upload Card -->
      <form (ngSubmit)="onSubmit()" #importForm="ngForm">
        @if (errors().length > 0) {
          <div class="alert-error">
            <i class="ph ph-warning-circle"></i>
            <div>
              <strong>{{ errors().length }} error(es)</strong>
              <ul>
                @for (error of errors(); track error) {
                  <li>{{ error }}</li>
                }
              </ul>
            </div>
          </div>
        }

        <div class="card upload-card">
          <div class="card-header">
            <i class="ph ph-upload-simple"></i>
            <span>Archivo CSV</span>
          </div>
          <div class="card-body">
            <input type="hidden" [(ngModel)]="importType" name="importType" />

            <label for="file-import-upload" class="upload-area" [class.has-file]="selectedFile()">
              @if (selectedFile()) {
                <i class="ph ph-file-csv file-icon"></i>
                <span class="file-name">{{ selectedFile()!.name }}</span>
                <button type="button" class="remove-btn" (click)="clearFile(); $event.preventDefault()">
                  <i class="ph ph-x"></i>
                </button>
              } @else {
                <i class="ph ph-cloud-arrow-up upload-icon"></i>
                <span class="upload-text">Haz clic para seleccionar un archivo CSV</span>
                <span class="upload-hint">o arrastra y suelta aquí</span>
              }
            </label>
            <input
              type="file"
              id="file-import-upload"
              class="file-input-hidden"
              accept=".csv"
              (change)="onFileSelected($event)"
              required
            />
          </div>
        </div>

        <div class="form-actions">
          <a routerLink="/app/imports" class="btn-ghost">Cancelar</a>
          <button type="submit" class="btn-primary" [disabled]="!selectedFile() || isSubmitting()">
            @if (isSubmitting()) {
              <span class="spinner"></span>
              Validando...
            } @else {
              <i class="ph ph-check"></i>
              Validar archivo
            }
          </button>
        </div>
      </form>

      @if (isSubmitting()) {
        <app-loading-spinner [overlay]="true" message="Validando archivo..." />
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

    /* Cards */
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius-lg);
      margin-bottom: var(--space-4);
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-3) var(--space-4);
      border-bottom: 1px solid var(--border-muted);
      font-weight: var(--font-semibold);
      font-size: var(--text-sm);
      color: var(--fg-default);

      i { font-size: 18px; color: var(--fg-muted); }
    }

    .card-body {
      padding: var(--space-4);
    }

    .card-body p {
      margin: 0 0 var(--space-4);
      font-size: var(--text-base);
      color: var(--fg-muted);
      line-height: 1.5;
    }

    /* Columns Grid */
    .columns-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: var(--space-2);
      margin-bottom: var(--space-4);
    }

    .column-item {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-3);
      background: var(--bg-subtle);
      border-radius: var(--radius-md);
      font-size: var(--text-sm);

      i { color: var(--fg-subtle); font-size: 16px; }
      span { color: var(--fg-default); font-weight: var(--font-medium); }
      small { color: var(--fg-subtle); font-size: var(--text-xs); margin-left: auto; }

      &.required i { color: var(--success-default); }
    }

    /* Upload Area */
    .upload-area {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 160px;
      border: 2px dashed var(--border-default);
      border-radius: var(--radius-lg);
      cursor: pointer;
      transition: all var(--duration-normal);

      &:hover {
        border-color: var(--accent-default);
        background: var(--accent-subtle);
      }

      &.has-file {
        flex-direction: row;
        min-height: auto;
        padding: var(--space-3) var(--space-4);
        border-style: solid;
        border-color: var(--accent-muted);
        background: var(--accent-subtle);
        gap: var(--space-3);
      }
    }

    .upload-icon {
      font-size: 40px;
      color: var(--fg-subtle);
      margin-bottom: var(--space-2);
    }

    .upload-text {
      font-size: var(--text-base);
      color: var(--fg-muted);
      font-weight: var(--font-medium);
    }

    .upload-hint {
      font-size: var(--text-sm);
      color: var(--fg-subtle);
      margin-top: var(--space-1);
    }

    .file-icon {
      font-size: 28px;
      color: var(--accent-default);
    }

    .file-name {
      flex: 1;
      font-size: var(--text-base);
      color: var(--fg-default);
      font-weight: var(--font-medium);
    }

    .remove-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border: none;
      border-radius: var(--radius-md);
      background: transparent;
      color: var(--fg-subtle);
      cursor: pointer;

      &:hover { background: var(--error-subtle); color: var(--error-default); }
    }

    .file-input-hidden {
      position: absolute;
      width: 0;
      height: 0;
      opacity: 0;
      overflow: hidden;
    }

    /* Alert Error */
    .alert-error {
      display: flex;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
      background: var(--error-subtle);
      border: 1px solid var(--error-default);
      border-radius: var(--radius-lg);
      margin-bottom: var(--space-4);
      color: var(--error-text);

      > i { font-size: 20px; margin-top: 2px; }

      ul { margin: var(--space-1) 0 0; padding-left: var(--space-4); }
      li { font-size: var(--text-sm); }
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
      font-size: var(--text-sm);
      font-weight: var(--font-medium);
      cursor: pointer;
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

    /* Form Actions */
    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-3);
      margin-top: var(--space-4);
    }

    /* Spinner */
    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    @media (max-width: 768px) {
      .imports-page { padding: var(--space-4); }
      .columns-grid { grid-template-columns: 1fr 1fr; }
    }
  `]
})
export class ImportFormComponent implements OnDestroy {
  private importService = inject(ImportService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);
  private destroy$ = new Subject<void>();

  // Form state
  importType = 'user';
  selectedFile = signal<File | null>(null);
  isSubmitting = signal(false);
  errors = signal<string[]>([]);

  constructor() {
    // Get import type from query params
    this.route.queryParams.pipe(
      takeUntil(this.destroy$)
    ).subscribe(params => {
      if (params['import_type']) {
        this.importType = params['import_type'];
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];

      // Validate file type
      if (!file.name.toLowerCase().endsWith('.csv')) {
        this.errors.set(['Solo se permiten archivos CSV']);
        this.selectedFile.set(null);
        return;
      }

      this.selectedFile.set(file);
      this.errors.set([]);
    }
  }

  clearFile(): void {
    this.selectedFile.set(null);
    this.errors.set([]);
    // Reset file input
    const input = document.getElementById('file-import-upload') as HTMLInputElement;
    if (input) {
      input.value = '';
    }
  }

  downloadSampleCsv(): void {
    this.importService.downloadSampleCsv(this.importType);
  }

  onSubmit(): void {
    const file = this.selectedFile();
    if (!file) {
      this.errors.set(['Debe seleccionar un archivo CSV']);
      return;
    }

    this.isSubmitting.set(true);
    this.errors.set([]);

    this.importService.createImport(file, this.importType).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        this.isSubmitting.set(false);

        if (response.result === 'success') {
          this.toast.success('Archivo subido correctamente. Validando...');
          // Navigate to validation preview
          this.router.navigate(['/app/imports', response.import.id, 'preview']);
        } else {
          this.errors.set(['Error al procesar el archivo']);
        }
      },
      error: (err) => {
        console.error('Error creating import:', err);
        this.isSubmitting.set(false);

        if (err.error?.message) {
          this.errors.set([err.error.message]);
        } else if (err.error?.errors) {
          this.errors.set(err.error.errors);
        } else {
          this.errors.set(['Error al subir el archivo. Intente nuevamente.']);
        }
      }
    });
  }
}
