import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AppVersionService, AppVersion, CreateAppVersionRequest, UpdateAppVersionRequest } from '../../../../core/services/app-version.service';
import { ToastService } from '../../../../core/services/toast.service';

@Component({
  selector: 'app-app-version-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page-container">
      <!-- Header -->
      <div class="page-header">
        <div class="header-content">
          <a routerLink="/app/app_versions" class="back-link">
            <i class="ph ph-arrow-left"></i>
            Volver
          </a>
          <h1 class="page-title">
            {{ isEditMode() ? 'Editar Versión' : 'Nueva Versión' }}
          </h1>
        </div>
      </div>

      <!-- Form -->
      <div class="card">
        @if (isLoading()) {
          <div class="loading-container">
            <i class="ph ph-spinner ph-spin"></i>
            <span>Cargando...</span>
          </div>
        } @else {
          <form (ngSubmit)="onSubmit()" #versionForm="ngForm">
            <div class="form-grid">
              <!-- Version -->
              <div class="form-group">
                <label for="version">Versión <span class="required">*</span></label>
                <input
                  type="text"
                  id="version"
                  name="version"
                  [(ngModel)]="formData.version"
                  required
                  placeholder="1.0.0"
                  pattern="\\d+\\.\\d+\\.\\d+"
                  #versionInput="ngModel"
                />
                @if (versionInput.invalid && versionInput.touched) {
                  <span class="error-text">Ingresa una versión válida (ej: 1.0.0)</span>
                }
              </div>

              <!-- Platform -->
              <div class="form-group">
                <label for="platform">Plataforma <span class="required">*</span></label>
                <select
                  id="platform"
                  name="platform"
                  [(ngModel)]="formData.platform"
                  required
                >
                  <option value="windows">Windows</option>
                  <option value="mac">Mac</option>
                  <option value="linux">Linux</option>
                </select>
              </div>

              <!-- Download URL -->
              <div class="form-group full-width">
                <label for="downloadUrl">URL de Descarga <span class="required">*</span></label>
                <input
                  type="url"
                  id="downloadUrl"
                  name="downloadUrl"
                  [(ngModel)]="formData.downloadUrl"
                  required
                  placeholder="https://firebasestorage.googleapis.com/..."
                  #downloadUrlInput="ngModel"
                />
                @if (downloadUrlInput.invalid && downloadUrlInput.touched) {
                  <span class="error-text">Ingresa una URL válida</span>
                }
              </div>

              <!-- Release Notes -->
              <div class="form-group full-width">
                <label for="releaseNotes">Notas de Release</label>
                <textarea
                  id="releaseNotes"
                  name="releaseNotes"
                  [(ngModel)]="formData.releaseNotes"
                  rows="4"
                  placeholder="Describe los cambios en esta versión..."
                ></textarea>
              </div>

              <!-- File Size -->
              <div class="form-group">
                <label for="fileSize">Tamaño del Archivo (bytes)</label>
                <input
                  type="number"
                  id="fileSize"
                  name="fileSize"
                  [(ngModel)]="formData.fileSize"
                  placeholder="85000000"
                  min="0"
                />
                <span class="help-text">
                  @if (formData.fileSize) {
                    {{ formatFileSize(formData.fileSize) }}
                  }
                </span>
              </div>

              <!-- SHA256 Hash -->
              <div class="form-group">
                <label for="sha256Hash">SHA256 Hash</label>
                <input
                  type="text"
                  id="sha256Hash"
                  name="sha256Hash"
                  [(ngModel)]="formData.sha256Hash"
                  placeholder="abc123..."
                  maxlength="64"
                />
              </div>

              <!-- Published At -->
              <div class="form-group">
                <label for="publishedAt">Fecha de Publicación</label>
                <input
                  type="datetime-local"
                  id="publishedAt"
                  name="publishedAt"
                  [(ngModel)]="formData.publishedAt"
                />
              </div>

              <!-- Switches -->
              <div class="form-group switches-group">
                <label class="switch-label">
                  <input
                    type="checkbox"
                    name="mandatory"
                    [(ngModel)]="formData.mandatory"
                  />
                  <span class="switch-text">
                    <strong>Obligatoria</strong>
                    <small>El usuario no podrá cerrar el banner de actualización</small>
                  </span>
                </label>

                <label class="switch-label">
                  <input
                    type="checkbox"
                    name="active"
                    [(ngModel)]="formData.active"
                  />
                  <span class="switch-text">
                    <strong>Activa</strong>
                    <small>Esta versión estará disponible para descargar</small>
                  </span>
                </label>
              </div>
            </div>

            <!-- Actions -->
            <div class="form-actions">
              <a routerLink="/app/app_versions" class="btn btn-secondary">
                Cancelar
              </a>
              <button
                type="submit"
                class="btn btn-primary"
                [disabled]="versionForm.invalid || isSaving()"
              >
                @if (isSaving()) {
                  <i class="ph ph-spinner ph-spin"></i>
                  Guardando...
                } @else {
                  <i class="ph ph-check"></i>
                  {{ isEditMode() ? 'Guardar Cambios' : 'Crear Versión' }}
                }
              </button>
            </div>
          </form>
        }
      </div>
    </div>
  `,
  styles: [`
    .page-container {
      padding: 1.5rem;
      max-width: 800px;
    }

    .page-header {
      margin-bottom: 1.5rem;
    }

    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      color: var(--text-secondary);
      text-decoration: none;
      font-size: 0.875rem;
      margin-bottom: 0.5rem;
      transition: color 0.2s;
    }

    .back-link:hover {
      color: var(--primary);
    }

    .page-title {
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--text-primary);
      margin: 0;
    }

    .card {
      background: var(--bg-secondary);
      border-radius: 0.5rem;
      padding: 1.5rem;
    }

    .loading-container {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      padding: 3rem;
      color: var(--text-secondary);
    }

    .form-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1.25rem;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .form-group.full-width {
      grid-column: span 2;
    }

    .form-group label {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--text-primary);
    }

    .required {
      color: var(--error);
    }

    .form-group input,
    .form-group select,
    .form-group textarea {
      padding: 0.625rem 0.75rem;
      border: 1px solid var(--border-color);
      border-radius: 0.375rem;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-size: 0.875rem;
      transition: border-color 0.2s;
    }

    .form-group input:focus,
    .form-group select:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: var(--primary);
    }

    .form-group textarea {
      resize: vertical;
      min-height: 100px;
    }

    .error-text {
      font-size: 0.75rem;
      color: var(--error);
    }

    .help-text {
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    .switches-group {
      grid-column: span 2;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      margin-top: 0.5rem;
    }

    .switch-label {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      cursor: pointer;
    }

    .switch-label input[type="checkbox"] {
      width: 1.25rem;
      height: 1.25rem;
      margin-top: 0.125rem;
      cursor: pointer;
    }

    .switch-text {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }

    .switch-text strong {
      font-size: 0.875rem;
      color: var(--text-primary);
    }

    .switch-text small {
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      margin-top: 1.5rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--border-color);
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

    .btn-primary:hover:not(:disabled) {
      background: var(--primary-hover);
    }

    .btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .btn-secondary {
      background: var(--bg-tertiary);
      color: var(--text-primary);
    }

    .btn-secondary:hover {
      background: var(--border-color);
    }

    @media (max-width: 640px) {
      .form-grid {
        grid-template-columns: 1fr;
      }

      .form-group.full-width {
        grid-column: span 1;
      }

      .switches-group {
        grid-column: span 1;
      }
    }
  `]
})
export class AppVersionFormComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private appVersionService = inject(AppVersionService);
  private toastService = inject(ToastService);
  private destroy$ = new Subject<void>();

  // State
  isLoading = signal(false);
  isSaving = signal(false);
  isEditMode = signal(false);
  versionId = signal<number | null>(null);

  // Form data
  formData = {
    version: '',
    downloadUrl: '',
    platform: 'windows',
    releaseNotes: '',
    fileSize: null as number | null,
    sha256Hash: '',
    mandatory: false,
    active: true,
    publishedAt: ''
  };

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEditMode.set(true);
      this.versionId.set(+id);
      this.loadVersion(+id);
    } else {
      // Set default publishedAt to now
      this.formData.publishedAt = this.formatDateForInput(new Date());
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadVersion(id: number): void {
    this.isLoading.set(true);

    this.appVersionService.getVersion(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (version) => {
          this.formData = {
            version: version.version,
            downloadUrl: version.downloadUrl,
            platform: version.platform,
            releaseNotes: version.releaseNotes || '',
            fileSize: version.fileSize,
            sha256Hash: version.sha256Hash || '',
            mandatory: version.mandatory,
            active: version.active,
            publishedAt: version.publishedAt ? this.formatDateForInput(new Date(version.publishedAt)) : ''
          };
          this.isLoading.set(false);
        },
        error: (err) => {
          console.error('Error loading version:', err);
          this.toastService.error('Error al cargar la versión');
          this.router.navigate(['/app/app_versions']);
        }
      });
  }

  onSubmit(): void {
    if (this.isSaving()) return;

    this.isSaving.set(true);

    const request: CreateAppVersionRequest | UpdateAppVersionRequest = {
      version: this.formData.version,
      downloadUrl: this.formData.downloadUrl,
      platform: this.formData.platform,
      releaseNotes: this.formData.releaseNotes || undefined,
      fileSize: this.formData.fileSize || undefined,
      sha256Hash: this.formData.sha256Hash || undefined,
      mandatory: this.formData.mandatory,
      active: this.formData.active,
      publishedAt: this.formData.publishedAt || undefined
    };

    const operation = this.isEditMode()
      ? this.appVersionService.updateVersion(this.versionId()!, request)
      : this.appVersionService.createVersion(request as CreateAppVersionRequest);

    operation.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toastService.success(
          this.isEditMode() ? 'Versión actualizada' : 'Versión creada'
        );
        this.router.navigate(['/app/app_versions']);
      },
      error: (err) => {
        console.error('Error saving version:', err);
        const errorMsg = err.error?.error || 'Error al guardar la versión';
        this.toastService.error(errorMsg);
        this.isSaving.set(false);
      }
    });
  }

  formatFileSize(bytes: number | null): string {
    return this.appVersionService.formatFileSize(bytes);
  }

  private formatDateForInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }
}
