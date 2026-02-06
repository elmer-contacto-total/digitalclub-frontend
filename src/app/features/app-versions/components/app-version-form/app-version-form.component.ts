import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { HttpEventType } from '@angular/common/http';
import { AppVersionService, AppVersion, CreateAppVersionRequest, UpdateAppVersionRequest, UploadInstallerResponse } from '../../../../core/services/app-version.service';
import { ToastService } from '../../../../core/services/toast.service';

const ALLOWED_EXTENSIONS = ['.exe', '.msi', '.dmg', '.appimage', '.deb', '.rpm', '.zip'];
const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB

@Component({
  selector: 'app-app-version-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="form-container">
      @if (isLoading()) {
        <div class="loading-overlay">
          <i class="ph ph-spinner ph-spin"></i>
          <span>Cargando...</span>
        </div>
      }

      <!-- Back Link -->
      <a routerLink="/app/app_versions" class="back-link">
        <i class="ph ph-arrow-left"></i>
        Volver a Versiones
      </a>

      <!-- Hero Card -->
      <div class="hero-card">
        <div class="hero-main">
          <div class="hero-icon">
            <i class="ph" [class.ph-pencil-simple]="isEditMode()" [class.ph-rocket-launch]="!isEditMode()"></i>
          </div>
          <div class="hero-info">
            <h1>{{ isEditMode() ? 'Editar Versión' : 'Nueva Versión' }}</h1>
            <p>{{ isEditMode() ? 'Actualiza los datos de la versión' : 'Publica una nueva versión de la aplicación' }}</p>
          </div>
        </div>
      </div>

      <form (ngSubmit)="onSubmit()" class="form-layout">
        <div class="form-grid">
          <!-- Left Column: Detalles -->
          <div class="form-column">
            <div class="card">
              <div class="card-body">
                <h5 class="card-title">
                  <i class="ph ph-info"></i>
                  Detalles
                </h5>

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
                    [class.is-invalid]="versionInput.invalid && versionInput.touched"
                  />
                  @if (versionInput.invalid && versionInput.touched) {
                    <span class="error-text">
                      <i class="ph ph-warning-circle"></i>
                      Ingresa una versión válida (ej: 1.0.0)
                    </span>
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
                <div class="form-group">
                  <label class="toggle-label">
                    <input
                      type="checkbox"
                      name="mandatory"
                      [(ngModel)]="formData.mandatory"
                    />
                    <span class="toggle-content">
                      <strong>Obligatoria</strong>
                      <small>El usuario no podrá cerrar el banner de actualización</small>
                    </span>
                  </label>
                </div>

                <div class="form-group">
                  <label class="toggle-label">
                    <input
                      type="checkbox"
                      name="active"
                      [(ngModel)]="formData.active"
                    />
                    <span class="toggle-content">
                      <strong>Activa</strong>
                      <small>Esta versión estará disponible para descargar</small>
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <!-- Right Column: Instalador + Info -->
          <div class="form-column">
            <!-- Instalador Card -->
            <div class="card">
              <div class="card-body">
                <div class="card-title-row">
                  <h5 class="card-title">
                    <i class="ph ph-download-simple"></i>
                    Instalador
                  </h5>
                  <button
                    type="button"
                    class="toggle-mode-btn"
                    (click)="toggleUploadMode()"
                  >
                    @if (useManualUrl()) {
                      <i class="ph ph-upload-simple"></i> Subir archivo
                    } @else {
                      <i class="ph ph-link"></i> URL manual
                    }
                  </button>
                </div>

                @if (useManualUrl()) {
                  <!-- Manual URL input -->
                  <div class="form-group">
                    <label for="downloadUrl">URL de Descarga <span class="required">*</span></label>
                    <input
                      type="url"
                      id="downloadUrl"
                      name="downloadUrl"
                      [(ngModel)]="formData.downloadUrl"
                      [required]="!formData.s3Key"
                      placeholder="https://storage.example.com/installer.exe"
                      #downloadUrlInput="ngModel"
                      [class.is-invalid]="downloadUrlInput.invalid && downloadUrlInput.touched"
                    />
                    @if (downloadUrlInput.invalid && downloadUrlInput.touched) {
                      <span class="error-text">
                        <i class="ph ph-warning-circle"></i>
                        Ingresa una URL válida
                      </span>
                    }
                  </div>
                } @else {
                  <!-- Upload zone -->
                  @if (uploadedFileName()) {
                    <!-- Uploaded file display -->
                    <div class="uploaded-file">
                      <div class="uploaded-file-icon">
                        <i class="ph ph-file-arrow-up"></i>
                      </div>
                      <div class="uploaded-file-details">
                        <span class="uploaded-file-name">{{ uploadedFileName() }}</span>
                        <span class="uploaded-file-size">{{ formatFileSize(formData.fileSize) }}</span>
                      </div>
                      <button
                        type="button"
                        class="uploaded-file-change"
                        (click)="removeUploadedFile()"
                        [disabled]="isUploading()"
                      >
                        <i class="ph ph-arrows-clockwise"></i>
                        Cambiar
                      </button>
                    </div>
                  } @else if (isUploading()) {
                    <!-- Upload progress -->
                    <div class="upload-progress">
                      <div class="progress-header">
                        <i class="ph ph-spinner ph-spin"></i>
                        <span>Subiendo {{ uploadingFileName() }}</span>
                        <span class="progress-percent">{{ uploadProgress() }}%</span>
                      </div>
                      <div class="progress-track">
                        <div class="progress-fill" [style.width.%]="uploadProgress()"></div>
                      </div>
                    </div>
                  } @else {
                    <!-- Drop zone -->
                    <div
                      class="drop-zone"
                      [class.drag-over]="isDragOver()"
                      (dragover)="onDragOver($event)"
                      (dragleave)="onDragLeave($event)"
                      (drop)="onDrop($event)"
                      (click)="fileInput.click()"
                    >
                      <div class="drop-zone-icon">
                        <i class="ph ph-cloud-arrow-up"></i>
                      </div>
                      <span class="drop-zone-text">
                        Arrastra el instalador aquí o <strong>haz clic para seleccionar</strong>
                      </span>
                      <span class="drop-zone-hint">
                        .exe, .msi, .dmg, .AppImage, .deb, .rpm, .zip
                      </span>
                      <span class="drop-zone-limit">Tamaño máximo: 200 MB</span>
                    </div>
                    <input
                      #fileInput
                      type="file"
                      [accept]="acceptedExtensions"
                      (change)="onFileSelected($event)"
                      style="display: none"
                    />
                  }

                  @if (uploadError()) {
                    <div class="upload-error">
                      <i class="ph ph-warning-circle"></i>
                      {{ uploadError() }}
                    </div>
                  }

                  <!-- Hidden input for form validation when using upload -->
                  <input
                    type="hidden"
                    name="downloadUrl"
                    [(ngModel)]="formData.downloadUrl"
                    [required]="!formData.s3Key"
                  />
                }
              </div>
            </div>

            <!-- Info Adicional Card -->
            <div class="card">
              <div class="card-body">
                <h5 class="card-title">
                  <i class="ph ph-note-pencil"></i>
                  Información Adicional
                </h5>

                <!-- Release Notes -->
                <div class="form-group">
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
                    [readonly]="!!formData.s3Key"
                  />
                  @if (formData.fileSize) {
                    <span class="hint-text">{{ formatFileSize(formData.fileSize) }}</span>
                  }
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
              </div>
            </div>
          </div>
        </div>

        <!-- Form Actions -->
        <div class="form-actions">
          <button
            type="submit"
            class="btn btn-success"
            [disabled]="versionInput.invalid || isSaving() || isUploading() || (!formData.downloadUrl && !formData.s3Key)"
          >
            @if (isSaving()) {
              <i class="ph ph-spinner ph-spin"></i>
              Guardando...
            } @else {
              <i class="ph ph-floppy-disk"></i>
              {{ isEditMode() ? 'Guardar Cambios' : 'Crear Versión' }}
            }
          </button>
          <a routerLink="/app/app_versions" class="btn btn-secondary">
            <i class="ph ph-x"></i>
            Cancelar
          </a>
        </div>
      </form>
    </div>
  `,
  styles: [`
    .form-container {
      padding: var(--space-6);
      max-width: 1200px;
      margin: 0 auto;
    }

    /* Loading overlay */
    .loading-overlay {
      position: fixed;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--space-3);
      background: rgba(0, 0, 0, 0.3);
      z-index: var(--z-modal);
      color: white;
      font-size: var(--text-lg);
    }

    .loading-overlay i {
      font-size: 32px;
    }

    /* Back Link */
    .back-link {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      font-size: var(--text-sm);
      color: var(--fg-muted);
      text-decoration: none;
      margin-bottom: var(--space-4);
      transition: color var(--duration-fast);
    }

    .back-link:hover {
      color: var(--accent-default);
    }

    .back-link i {
      font-size: 16px;
    }

    /* Hero Card */
    .hero-card {
      background: linear-gradient(135deg, var(--accent-default) 0%, var(--accent-emphasis) 100%);
      border-radius: var(--radius-xl);
      padding: var(--space-6);
      margin-bottom: var(--space-6);
      color: white;
    }

    .hero-main {
      display: flex;
      align-items: center;
      gap: var(--space-4);
    }

    .hero-icon {
      width: 64px;
      height: 64px;
      border-radius: var(--radius-lg);
      background: rgba(255, 255, 255, 0.2);
      backdrop-filter: blur(10px);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .hero-icon i {
      font-size: 32px;
    }

    .hero-info h1 {
      margin: 0 0 var(--space-1) 0;
      font-size: var(--text-xl);
      font-weight: var(--font-semibold);
      color: white;
    }

    .hero-info p {
      margin: 0;
      font-size: var(--text-base);
      opacity: 0.9;
    }

    /* Form Layout */
    .form-layout {
      width: 100%;
    }

    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-6);
    }

    .form-column {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
    }

    /* Card */
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-sm);
    }

    .card-body {
      padding: var(--space-5);
    }

    .card-title {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin: 0 0 var(--space-5) 0;
      padding-bottom: var(--space-3);
      border-bottom: 1px solid var(--border-default);
      font-size: 1rem;
      font-weight: var(--font-semibold);
      color: var(--fg-default);
    }

    .card-title i {
      font-size: 20px;
      color: var(--accent-default);
    }

    .card-title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-5);
      padding-bottom: var(--space-3);
      border-bottom: 1px solid var(--border-default);
    }

    .card-title-row .card-title {
      margin: 0;
      padding: 0;
      border: none;
    }

    /* Toggle mode button */
    .toggle-mode-btn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      background: none;
      border: 1px solid var(--border-default);
      color: var(--accent-default);
      font-size: var(--text-sm);
      font-weight: var(--font-medium);
      cursor: pointer;
      padding: var(--space-1) var(--space-3);
      border-radius: var(--radius-full);
      transition: all var(--duration-fast);
    }

    .toggle-mode-btn:hover {
      background: var(--accent-subtle);
      border-color: var(--accent-default);
    }

    .toggle-mode-btn i {
      font-size: 14px;
    }

    /* Form Group */
    .form-group {
      margin-bottom: var(--space-4);
    }

    .form-group:last-child {
      margin-bottom: 0;
    }

    .form-group > label {
      display: block;
      margin-bottom: var(--space-2);
      font-size: 0.875rem;
      font-weight: var(--font-medium);
      color: var(--fg-default);
    }

    .required {
      color: var(--error-default);
    }

    .form-group input[type="text"],
    .form-group input[type="url"],
    .form-group input[type="number"],
    .form-group input[type="datetime-local"],
    .form-group select,
    .form-group textarea {
      width: 100%;
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--input-border);
      border-radius: var(--radius-md);
      font-size: var(--text-base);
      background: var(--input-bg);
      color: var(--fg-default);
      transition: border-color var(--duration-fast), box-shadow var(--duration-fast);
    }

    .form-group input:focus,
    .form-group select:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: var(--input-border-focus);
      box-shadow: 0 0 0 3px var(--accent-subtle);
    }

    .form-group input.is-invalid {
      border-color: var(--error-default);
    }

    .form-group input.is-invalid:focus {
      box-shadow: 0 0 0 3px var(--error-subtle);
    }

    .form-group input[readonly] {
      background: var(--input-bg-readonly);
      color: var(--fg-muted);
      cursor: not-allowed;
    }

    .form-group textarea {
      resize: vertical;
      min-height: 100px;
      line-height: 1.6;
    }

    .form-group input::placeholder,
    .form-group textarea::placeholder {
      color: var(--fg-subtle);
    }

    .error-text {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      margin-top: var(--space-1);
      font-size: var(--text-sm);
      color: var(--error-default);
    }

    .error-text i {
      font-size: 14px;
    }

    .hint-text {
      display: block;
      margin-top: var(--space-1);
      font-size: var(--text-sm);
      color: var(--fg-muted);
    }

    /* Toggle/Switch labels */
    .toggle-label {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
      cursor: pointer;
      margin: 0;
    }

    .toggle-label input[type="checkbox"] {
      width: 18px;
      height: 18px;
      margin-top: 2px;
      cursor: pointer;
      accent-color: var(--accent-default);
    }

    .toggle-content {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .toggle-content strong {
      font-size: 0.875rem;
      font-weight: var(--font-medium);
      color: var(--fg-default);
    }

    .toggle-content small {
      font-size: var(--text-sm);
      color: var(--fg-muted);
    }

    /* Drop zone */
    .drop-zone {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      padding: var(--space-8) var(--space-4);
      border: 2px dashed var(--border-default);
      border-radius: var(--radius-lg);
      background: var(--bg-subtle);
      cursor: pointer;
      transition: all var(--duration-normal);
    }

    .drop-zone:hover {
      border-color: var(--accent-default);
      background: var(--accent-subtle);
    }

    .drop-zone.drag-over {
      border-color: var(--accent-default);
      background: var(--accent-subtle);
      transform: scale(1.01);
    }

    .drop-zone-icon {
      width: 56px;
      height: 56px;
      border-radius: var(--radius-full);
      background: var(--accent-subtle);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: var(--space-2);
    }

    .drop-zone-icon i {
      font-size: 28px;
      color: var(--accent-default);
    }

    .drop-zone-text {
      font-size: var(--text-base);
      color: var(--fg-muted);
      text-align: center;
    }

    .drop-zone-text strong {
      color: var(--accent-default);
    }

    .drop-zone-hint {
      font-size: var(--text-sm);
      color: var(--fg-subtle);
      font-family: var(--font-mono);
    }

    .drop-zone-limit {
      font-size: var(--text-sm);
      color: var(--fg-subtle);
    }

    /* Upload progress */
    .upload-progress {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding: var(--space-4);
      border: 1px solid var(--accent-muted);
      border-radius: var(--radius-lg);
      background: var(--accent-subtle);
    }

    .progress-header {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-size: var(--text-base);
      color: var(--fg-default);
    }

    .progress-header i {
      color: var(--accent-default);
    }

    .progress-percent {
      margin-left: auto;
      font-weight: var(--font-semibold);
      color: var(--accent-emphasis);
      font-family: var(--font-mono);
    }

    .progress-track {
      height: 6px;
      background: var(--accent-muted);
      border-radius: var(--radius-full);
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: var(--accent-default);
      border-radius: var(--radius-full);
      transition: width 0.3s ease;
    }

    /* Uploaded file display */
    .uploaded-file {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-4);
      border: 1px solid var(--success-default);
      border-radius: var(--radius-lg);
      background: var(--success-subtle);
    }

    .uploaded-file-icon {
      width: 44px;
      height: 44px;
      border-radius: var(--radius-md);
      background: rgba(45, 160, 80, 0.15);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .uploaded-file-icon i {
      font-size: 22px;
      color: var(--success-default);
    }

    .uploaded-file-details {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .uploaded-file-name {
      font-size: var(--text-base);
      font-weight: var(--font-medium);
      color: var(--fg-default);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .uploaded-file-size {
      font-size: var(--text-sm);
      color: var(--fg-muted);
    }

    .uploaded-file-change {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      background: none;
      border: 1px solid var(--border-default);
      color: var(--fg-muted);
      font-size: var(--text-sm);
      font-weight: var(--font-medium);
      cursor: pointer;
      padding: var(--space-1) var(--space-3);
      border-radius: var(--radius-md);
      transition: all var(--duration-fast);
      flex-shrink: 0;
    }

    .uploaded-file-change:hover:not(:disabled) {
      border-color: var(--accent-default);
      color: var(--accent-default);
    }

    .uploaded-file-change:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Upload error */
    .upload-error {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin-top: var(--space-3);
      padding: var(--space-3);
      background: var(--error-subtle);
      border: 1px solid var(--error-default);
      border-radius: var(--radius-md);
      font-size: var(--text-sm);
      color: var(--error-text);
    }

    .upload-error i {
      font-size: 16px;
      color: var(--error-default);
      flex-shrink: 0;
    }

    /* Form Actions */
    .form-actions {
      display: flex;
      gap: var(--space-3);
      margin-top: var(--space-6);
      padding-top: var(--space-6);
      border-top: 1px solid var(--border-default);
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      height: var(--btn-height);
      padding: 0 var(--space-4);
      border-radius: var(--radius-md);
      font-size: var(--text-base);
      font-weight: var(--font-medium);
      cursor: pointer;
      border: none;
      text-decoration: none;
      transition: all var(--duration-fast);
    }

    .btn i {
      font-size: 16px;
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-success {
      background: #198754;
      color: white;
    }

    .btn-success:hover:not(:disabled) {
      background: #157347;
    }

    .btn-secondary {
      background: var(--bg-subtle);
      border: 1px solid var(--border-default);
      color: var(--fg-default);
    }

    .btn-secondary:hover {
      background: var(--bg-muted);
    }

    /* Responsive */
    @media (max-width: 900px) {
      .form-grid {
        grid-template-columns: 1fr;
      }

      .hero-main {
        flex-direction: column;
        text-align: center;
      }

      .hero-card {
        padding: var(--space-5);
      }
    }

    @media (max-width: 640px) {
      .form-container {
        padding: var(--space-4);
      }

      .card-title-row {
        flex-direction: column;
        align-items: flex-start;
        gap: var(--space-2);
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

  // Upload state
  useManualUrl = signal(false);
  isUploading = signal(false);
  uploadProgress = signal(0);
  uploadingFileName = signal('');
  uploadedFileName = signal('');
  uploadError = signal('');
  isDragOver = signal(false);

  acceptedExtensions = ALLOWED_EXTENSIONS.join(',');

  // Form data
  formData = {
    version: '',
    downloadUrl: '',
    platform: 'windows',
    releaseNotes: '',
    fileSize: null as number | null,
    sha256Hash: '',
    s3Key: '',
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
            s3Key: version.s3Key || '',
            mandatory: version.mandatory,
            active: version.active,
            publishedAt: version.publishedAt ? this.formatDateForInput(new Date(version.publishedAt)) : ''
          };

          // If version has s3Key, show the uploaded file state
          if (version.s3Key) {
            const fileName = version.s3Key.split('/').pop() || 'archivo subido';
            this.uploadedFileName.set(fileName);
          } else {
            // Existing version without s3Key - show manual URL mode
            this.useManualUrl.set(true);
          }

          this.isLoading.set(false);
        },
        error: (err) => {
          console.error('Error loading version:', err);
          this.toastService.error('Error al cargar la versión');
          this.router.navigate(['/app/app_versions']);
        }
      });
  }

  toggleUploadMode(): void {
    this.useManualUrl.update(v => !v);
    this.uploadError.set('');
  }

  // ==================== DRAG & DROP ====================

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleFile(files[0]);
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFile(input.files[0]);
      input.value = ''; // Reset so same file can be re-selected
    }
  }

  // ==================== UPLOAD LOGIC ====================

  private handleFile(file: File): void {
    this.uploadError.set('');

    // Validate extension
    const fileName = file.name.toLowerCase();
    const hasValidExtension = ALLOWED_EXTENSIONS.some(ext => fileName.endsWith(ext));
    if (!hasValidExtension) {
      this.uploadError.set(`Tipo de archivo no válido. Permitidos: ${ALLOWED_EXTENSIONS.join(', ')}`);
      return;
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      this.uploadError.set('El archivo excede el tamaño máximo de 200MB');
      return;
    }

    this.uploadFile(file);
  }

  private uploadFile(file: File): void {
    this.isUploading.set(true);
    this.uploadProgress.set(0);
    this.uploadingFileName.set(file.name);
    this.uploadError.set('');

    this.appVersionService.uploadInstaller(file, this.formData.platform)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (event) => {
          if (event.type === HttpEventType.UploadProgress) {
            const progress = event.total
              ? Math.round((100 * event.loaded) / event.total)
              : 0;
            this.uploadProgress.set(progress);
          } else if (event.type === HttpEventType.Response) {
            const body = event.body as UploadInstallerResponse;
            if (body) {
              this.formData.s3Key = body.s3Key;
              this.formData.fileSize = body.fileSize;
              this.formData.downloadUrl = body.downloadUrl;
              this.uploadedFileName.set(body.fileName);
              this.toastService.success('Instalador subido correctamente');
            }
            this.isUploading.set(false);
          }
        },
        error: (err) => {
          console.error('Upload error:', err);
          const errorMsg = err.error?.error || 'Error al subir el archivo';
          this.uploadError.set(errorMsg);
          this.isUploading.set(false);
        }
      });
  }

  removeUploadedFile(): void {
    this.formData.s3Key = '';
    this.formData.downloadUrl = '';
    this.formData.fileSize = null;
    this.uploadedFileName.set('');
    this.uploadError.set('');
  }

  // ==================== FORM SUBMIT ====================

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
      s3Key: this.formData.s3Key || undefined,
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
