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
    <div class="import-form-container">
      <!-- Header - PARIDAD: Rails admin/imports/new.html.erb -->
      <div class="page-header">
        <a routerLink="/app/imports" class="btn btn-secondary">
          <i class="ph ph-arrow-left"></i>
          Volver
        </a>
        <div class="title-container">
          <h1>Importación Paso 1</h1>
        </div>
        <div class="title-container">
          <p>Para proceder con la importación, es necesario que prepare y cargue un archivo CSV (archivo de Excel delimitado por comas) con la lista de usuarios que desee importar.</p>
          <p>El archivo debe contener las siguientes columnas:</p>
          <ul>
            <li>APELLIDO_P (obligatorio)</li>
            <li>APELLIDO_M (opcional)</li>
            <li>NOMBRES (obligatorio)</li>
            <li>CELULAR (obligatorio, debe ser único. No incluir el 51 al inicio)</li>
            <li>CORREO (opcional, debe ser único si se ingresa)</li>
            <li>EJECUTIVO (obligatorio)</li>
            <li>COLUMNAS CRM ADICIONALES según configuración (opcional)</li>
          </ul>
          <p>Puede descargar este archivo CSV de ejemplo, y rellenar los datos en las columnas indicadas:</p>

          <button type="button" class="btn btn-secondary" (click)="downloadSampleCsv()">
            <i class="ph ph-download"></i>
            Descargar CSV de ejemplo
          </button>
        </div>
      </div>

      <!-- Form - PARIDAD: Rails simple_form -->
      <form (ngSubmit)="onSubmit()" #importForm="ngForm">
        <!-- Error Messages -->
        @if (errors().length > 0) {
          <div class="panel panel-danger">
            <div class="panel-heading">
              <h2 class="panel-title">{{ errors().length }} error(es) al intentar guardar los datos</h2>
            </div>
            <div class="panel-body">
              <ul>
                @for (error of errors(); track error) {
                  <li>{{ error }}</li>
                }
              </ul>
            </div>
          </div>
        }

        <div class="form-inputs">
          <div class="card">
            <div class="card-body">
              <h5 class="card-title">Detalles</h5>
              <div class="row">
                <div class="col-lg-12">
                  <!-- Hidden import type -->
                  <input type="hidden" [(ngModel)]="importType" name="importType" />

                  <!-- File Upload - PARIDAD: Rails file_field -->
                  <div class="form-image-container">
                    <label for="file-import-upload" class="form-label">Archivo de importación</label>
                    <input
                      type="file"
                      id="file-import-upload"
                      class="form-control"
                      accept=".csv"
                      (change)="onFileSelected($event)"
                      required
                    />
                    @if (selectedFile()) {
                      <div class="selected-file">
                        <i class="ph ph-file-csv"></i>
                        <span>{{ selectedFile()!.name }}</span>
                        <button type="button" class="btn-clear" (click)="clearFile()">
                          <i class="ph ph-x"></i>
                        </button>
                      </div>
                    }
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="form-actions">
          <button
            type="submit"
            class="btn btn-primary"
            [disabled]="!selectedFile() || isSubmitting()"
          >
            @if (isSubmitting()) {
              <span class="spinner-border spinner-border-sm" role="status"></span>
              Validando...
            } @else {
              Validar
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
    .import-form-container {
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

      ul {
        margin: 0 0 16px 0;
        padding-left: 20px;

        li {
          margin-bottom: 4px;
          color: var(--text-secondary, #6c757d);
        }
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
        border-color: var(--primary-dark, #0b5ed7);
      }
    }

    .btn-secondary {
      background-color: var(--secondary-color, #6c757d);
      border-color: var(--secondary-color, #6c757d);
      color: white;

      &:hover:not(:disabled) {
        background-color: #5c636a;
        border-color: #565e64;
      }
    }

    /* Panel Error - PARIDAD: Rails panel-danger */
    .panel-danger {
      border: 1px solid #f5c6cb;
      border-radius: 4px;
      margin-bottom: 20px;
    }

    .panel-danger .panel-heading {
      background-color: #f8d7da;
      padding: 12px 16px;
      border-bottom: 1px solid #f5c6cb;
    }

    .panel-danger .panel-title {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: #721c24;
    }

    .panel-danger .panel-body {
      padding: 12px 16px;
      background: #fff;

      ul {
        margin: 0;
        padding-left: 20px;
        color: #721c24;
      }
    }

    /* Card - PARIDAD: Rails card */
    .card {
      border: 1px solid var(--border-color, #dee2e6);
      border-radius: 4px;
      background: white;
    }

    .card-body {
      padding: 20px;
    }

    .card-title {
      margin: 0 0 16px 0;
      font-size: 1.1rem;
      font-weight: 500;
      color: var(--text-primary, #212529);
    }

    /* Form Controls */
    .form-label {
      display: block;
      margin-bottom: 8px;
      font-weight: 500;
      color: var(--text-primary, #212529);
    }

    .form-control {
      display: block;
      width: 100%;
      padding: 8px 12px;
      font-size: 14px;
      border: 1px solid var(--border-color, #ced4da);
      border-radius: 4px;
      transition: border-color 0.15s;

      &:focus {
        outline: none;
        border-color: var(--primary-color, #86b7fe);
        box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.25);
      }
    }

    .selected-file {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
      padding: 10px 14px;
      background: var(--bg-light, #f8f9fa);
      border: 1px solid var(--border-color, #dee2e6);
      border-radius: 4px;

      i {
        font-size: 24px;
        color: var(--primary-color, #0d6efd);
      }

      span {
        flex: 1;
        font-size: 14px;
        color: var(--text-primary, #212529);
      }
    }

    .btn-clear {
      background: none;
      border: none;
      padding: 4px;
      cursor: pointer;
      color: var(--text-secondary, #6c757d);

      &:hover {
        color: var(--danger-color, #dc3545);
      }
    }

    /* Form Actions */
    .form-actions {
      margin-top: 20px;
    }

    .spinner-border-sm {
      width: 16px;
      height: 16px;
      border-width: 2px;
    }

    @media (max-width: 768px) {
      .import-form-container { padding: 16px; }
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
  importType = 'users';
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
