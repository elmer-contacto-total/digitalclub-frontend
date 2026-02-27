/**
 * Import Form Component
 * PARIDAD: Rails admin/imports/new.html.erb
 * Paso 1: Subir archivo CSV para importación.
 * Auto-aplica template o auto-detección de columnas, luego navega directo a preview.
 */
import { Component, inject, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { ImportService, CreateImportResponse, MappingColumn, MappingTemplate } from '../../../../core/services/import.service';
import { AuthService } from '../../../../core/services/auth.service';
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
      <a routerLink="/app/imports" class="back-link">
        <i class="ph ph-arrow-left"></i>
        Volver a Importaciones
      </a>

      <div class="hero-card">
        <div class="hero-main">
          <div class="hero-icon">
            <i class="ph ph-upload-simple"></i>
          </div>
          <div class="hero-info">
            <h1>Nueva importación</h1>
            <p class="hero-subtitle">Suba un archivo CSV con la lista de usuarios a importar</p>
          </div>
        </div>
      </div>

      <!-- Instructions Card -->
      <div class="card instructions-card">
        <div class="card-header">
          <i class="ph ph-info"></i>
          <span>Instrucciones</span>
        </div>
        <div class="card-body">
          <p>Prepare y cargue un archivo CSV (delimitado por comas) con la lista de usuarios a importar.</p>
          <p>El formato del archivo debe coincidir con un template de importación configurado previamente. Los campos mínimos requeridos son:</p>
          <div class="required-fields-list">
            <div class="required-field">
              <i class="ph ph-check-circle"></i>
              <span>Teléfono</span>
            </div>
            <div class="required-field">
              <i class="ph ph-check-circle"></i>
              <span>Nombre</span>
            </div>
            <div class="required-field">
              <i class="ph ph-check-circle"></i>
              <span>Apellido</span>
            </div>
          </div>
          <p class="hint-text">Los nombres exactos de las columnas y campos adicionales dependen del template configurado.</p>
          <div class="instructions-actions">
            <button type="button" class="btn-secondary" (click)="downloadSampleCsv()">
              <i class="ph ph-download-simple"></i>
              Descargar CSV de ejemplo
            </button>
            @if (authService.isAdmin()) {
              <a routerLink="/app/imports/templates" class="btn-secondary">
                <i class="ph ph-gear"></i>
                Configurar templates
              </a>
            }
          </div>
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
              @if (showTemplateAction()) {
                <a routerLink="/app/imports/templates" class="btn-template-action">
                  <i class="ph ph-gear"></i>
                  Configurar template
                </a>
              }
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
              {{ stepLabel() }}
            } @else {
              <i class="ph ph-upload-simple"></i>
              Importar
            }
          </button>
        </div>
      </form>

      @if (showTemplateSelector()) {
        <div class="card template-selector-card">
          <div class="card-header">
            <i class="ph ph-list-checks"></i>
            <span>Seleccionar template</span>
          </div>
          <div class="card-body">
            <p>Se encontraron {{ matchedTemplates().length }} templates compatibles con este CSV. Seleccione cuál aplicar:</p>
            <div class="template-options">
              @for (tpl of matchedTemplates(); track tpl.id) {
                <button class="template-option" (click)="selectTemplate(tpl)">
                  <div class="template-option-info">
                    <strong>{{ tpl.name }}</strong>
                    <small>{{ tpl.headers.length }} columnas mapeadas</small>
                  </div>
                  <i class="ph ph-caret-right"></i>
                </button>
              }
            </div>
            <button class="btn-ghost cancel-selector" (click)="cancelTemplateSelection()">Cancelar</button>
          </div>
        </div>
      }

      @if (isSubmitting()) {
        <app-loading-spinner [fullscreen]="true" [message]="stepLabel()" />
      }
    </div>
  `,
  styles: [`
    .imports-page {
      padding: var(--space-6);
      max-width: 800px;
      margin: 0 auto;
    }

    .back-link {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      color: var(--fg-muted);
      text-decoration: none;
      font-size: var(--text-sm);
      margin-bottom: var(--space-4);
      transition: color var(--duration-fast);

      i { font-size: 16px; }
      &:hover { color: var(--accent-default); }
    }

    .hero-card {
      background: linear-gradient(135deg, var(--accent-default) 0%, var(--accent-emphasis) 100%);
      border-radius: var(--radius-xl);
      padding: var(--space-6);
      margin-bottom: var(--space-6);
      color: white;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--space-6);
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

      i { font-size: 32px; }
    }

    .hero-info {
      h1 {
        margin: 0 0 var(--space-1) 0;
        font-size: var(--text-xl);
        font-weight: var(--font-bold);
        color: white;
      }

      .hero-subtitle {
        margin: 0;
        font-size: var(--text-base);
        opacity: 0.9;
      }
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

    /* Required Fields */
    .required-fields-list {
      display: flex;
      gap: var(--space-3);
      margin-bottom: var(--space-3);
    }

    .required-field {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-3);
      background: var(--bg-subtle);
      border-radius: var(--radius-md);
      font-size: var(--text-sm);

      i { color: var(--success-default); font-size: 16px; }
      span { color: var(--fg-default); font-weight: var(--font-medium); }
    }

    .hint-text {
      font-size: var(--text-sm) !important;
      color: var(--fg-subtle) !important;
      font-style: italic;
    }

    .instructions-actions {
      display: flex;
      gap: var(--space-3);
      flex-wrap: wrap;
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

    .btn-template-action {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      margin-top: var(--space-3);
      padding: var(--space-2) var(--space-4);
      background: var(--accent-default);
      color: #fff;
      border: none;
      border-radius: var(--radius-md);
      font-size: var(--text-sm);
      font-weight: var(--font-medium);
      text-decoration: none;
      cursor: pointer;
      transition: background var(--duration-fast);

      &:hover { background: var(--accent-emphasis); }
      i { font-size: 16px; }
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

    /* Template Selector */
    .template-selector-card {
      margin-top: var(--space-4);
    }

    .template-selector-card .card-body p {
      margin: 0 0 var(--space-3);
    }

    .template-options {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin-bottom: var(--space-3);
    }

    .template-option {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-3) var(--space-4);
      background: var(--bg-subtle);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: all var(--duration-fast);
      text-align: left;

      &:hover {
        border-color: var(--accent-default);
        background: var(--accent-subtle);
      }

      i { font-size: 18px; color: var(--fg-subtle); }
    }

    .template-option-info {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);

      strong { font-size: var(--text-base); color: var(--fg-default); }
      small { font-size: var(--text-xs); color: var(--fg-muted); }
    }

    .cancel-selector {
      width: 100%;
      justify-content: center;
    }

    @media (max-width: 768px) {
      .imports-page { padding: var(--space-4); }
      .hero-card { flex-direction: column; text-align: center; padding: var(--space-5); }
      .hero-main { flex-direction: column; }
      .required-fields-list { flex-wrap: wrap; }
      .instructions-actions { flex-direction: column; }
    }
  `]
})
export class ImportFormComponent implements OnDestroy {
  private importService = inject(ImportService);
  readonly authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);
  private destroy$ = new Subject<void>();

  private static readonly REQUIRED_FIELDS = ['phone', 'first_name', 'last_name'];
  private static readonly REQUIRED_LABELS: Record<string, string> = {
    phone: 'Teléfono',
    first_name: 'Nombre',
    last_name: 'Apellido'
  };

  // Form state
  importType = 'user';
  selectedFile = signal<File | null>(null);
  isSubmitting = signal(false);
  errors = signal<string[]>([]);
  stepLabel = signal('Subiendo archivo...');
  showTemplateAction = signal(false);

  // E2: Track created import to clean up if user re-submits with a different file
  private createdImportId = signal<number | null>(null);

  // Template selector state (shown when multiple templates match)
  showTemplateSelector = signal(false);
  matchedTemplates = signal<MappingTemplate[]>([]);
  private pendingColumns = signal<MappingColumn[]>([]);
  private pendingImportId = signal<number | null>(null);
  private pendingIsFoh = signal(false);

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
    this.showTemplateAction.set(false);
    this.stepLabel.set('Subiendo archivo...');

    // E2: Clean up previous import if user re-submits with a different file
    this.cleanupPreviousImport();

    const isFoh = this.importType === 'foh';

    this.importService.createImport(file, this.importType).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        if (response.result === 'success') {
          this.autoApplyMapping(response, isFoh);
        } else {
          this.isSubmitting.set(false);
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

  /**
   * Auto-apply mapping: search for matching templates.
   * - 0 matches → error
   * - 1 match → apply automatically
   * - 2+ matches → show selector for user to choose
   */
  private autoApplyMapping(response: CreateImportResponse, isFoh: boolean): void {
    const columns = response.mapping.columns;
    const headers = columns.map((c: MappingColumn) => c.header);
    const importId = response.import.id;

    // E2: Track import id for cleanup if user re-submits
    this.createdImportId.set(importId);

    this.stepLabel.set('Buscando template...');

    this.importService.findMatchingTemplates(headers, isFoh).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (matchResult) => {
        if (matchResult.found && matchResult.templates.length === 1) {
          // Single match — apply automatically
          this.applyTemplate(matchResult.templates[0], columns, importId, isFoh);
        } else if (matchResult.found && matchResult.templates.length > 1) {
          // Multiple matches — show selector
          this.isSubmitting.set(false);
          this.showTemplateSelector.set(true);
          this.matchedTemplates.set(matchResult.templates);
          this.pendingColumns.set(columns);
          this.pendingImportId.set(importId);
          this.pendingIsFoh.set(isFoh);
        } else {
          this.showNoTemplateError();
        }
      },
      error: () => {
        this.showNoTemplateError();
      }
    });
  }

  /**
   * User selected a template from the selector.
   */
  selectTemplate(template: MappingTemplate): void {
    this.showTemplateSelector.set(false);
    this.isSubmitting.set(true);
    this.stepLabel.set('Aplicando template...');
    this.applyTemplate(template, this.pendingColumns(), this.pendingImportId()!, this.pendingIsFoh());
  }

  /**
   * User cancelled the template selection.
   */
  cancelTemplateSelection(): void {
    this.showTemplateSelector.set(false);
    this.matchedTemplates.set([]);
  }

  /**
   * Apply a single template: validate required fields and navigate to preview.
   */
  private applyTemplate(template: MappingTemplate, columns: MappingColumn[], importId: number, isFoh: boolean): void {
    const columnMapping = this.buildMappingFromTemplate(columns, template.columnMapping);
    const missing = this.getMissingRequiredFields(columnMapping);

    // Detect extra CSV columns not covered by the template
    const templateHeaderSet = new Set(
      Object.keys(template.columnMapping).map(h => h.toLowerCase())
    );
    const extraColumns = columns
      .filter(c => !templateHeaderSet.has(c.header.toLowerCase()))
      .map(c => c.header);

    if (missing.length === 0) {
      let msg = `Template "${template.name}" aplicado automáticamente`;
      if (extraColumns.length > 0) {
        msg += `. Columnas ignoradas: ${extraColumns.join(', ')}`;
      }
      this.confirmAndNavigate(importId, columnMapping, isFoh, msg);
    } else {
      this.showTemplateMissingFieldsError(missing, template.name, extraColumns);
    }
  }

  /**
   * Show error when no matching template is found for the CSV format.
   * Admin sees a button to configure templates; non-admin sees a message to contact admin.
   */
  private showNoTemplateError(): void {
    this.isSubmitting.set(false);
    const isAdmin = this.authService.isAdmin();
    this.showTemplateAction.set(isAdmin);

    if (isAdmin) {
      this.errors.set([
        'No se encontró un template de importación compatible con este formato de CSV.',
        'Configure un template para este formato.'
      ]);
    } else {
      this.errors.set([
        'No se encontró un template de importación compatible con este formato de CSV.',
        'Contacte al administrador para que configure un template de importación.'
      ]);
    }
  }

  /**
   * Convert template's header-based mapping to index-based mapping.
   * Note (E3): Template values may include `custom_field:HEADER` keys for custom fields.
   * The backend's confirmMappingAndValidate already parses the `custom_field:` prefix correctly,
   * so no special handling is needed here.
   */
  private buildMappingFromTemplate(columns: MappingColumn[], templateMapping: Record<string, string>): Record<string, string> {
    // Build case-insensitive lookup since backend matches templates case-insensitively
    const lowerCaseMapping = new Map<string, string>();
    for (const [header, field] of Object.entries(templateMapping)) {
      lowerCaseMapping.set(header.toLowerCase(), field);
    }

    const mapping: Record<string, string> = {};
    for (const col of columns) {
      const field = lowerCaseMapping.get(col.header.toLowerCase());
      if (field) {
        mapping[col.index.toString()] = field;
      }
    }
    return mapping;
  }

  /**
   * Check which required fields are missing from the mapping.
   */
  private getMissingRequiredFields(mapping: Record<string, string>): string[] {
    const assignedFields = new Set(
      Object.values(mapping).map(v => v.endsWith('+cf') ? v.slice(0, -3) : v)
    );
    return ImportFormComponent.REQUIRED_FIELDS.filter(f => !assignedFields.has(f));
  }

  /**
   * Show error when a matched template is missing required fields.
   * Directs admin to fix the template rather than silently falling back to auto-detection.
   */
  private showTemplateMissingFieldsError(missingFields: string[], templateName: string, extraColumns: string[]): void {
    this.isSubmitting.set(false);
    const missingLabels = missingFields
      .map(f => ImportFormComponent.REQUIRED_LABELS[f] || f)
      .join(', ');

    const isAdmin = this.authService.isAdmin();
    this.showTemplateAction.set(isAdmin);

    const errors: string[] = [
      `El template "${templateName}" no mapea los campos obligatorios: ${missingLabels}.`
    ];

    if (extraColumns.length > 0) {
      errors.push(`Columnas del CSV no cubiertas por el template: ${extraColumns.join(', ')}.`);
    }

    if (isAdmin) {
      errors.push('Edite el template para incluir los campos faltantes.');
    } else {
      errors.push('Contacte al administrador para que corrija el template.');
    }

    this.errors.set(errors);
  }

  /**
   * E2: Clean up a previously created import when the user re-submits with a different file.
   * Fire-and-forget — errors are logged but don't block the new import.
   */
  private cleanupPreviousImport(): void {
    const prevId = this.createdImportId();
    if (prevId) {
      this.importService.deleteImport(prevId).subscribe({
        error: (err) => console.warn('Could not clean up previous import:', err)
      });
      this.createdImportId.set(null);
    }
  }

  /**
   * Confirm the mapping with the backend and navigate to preview.
   */
  private confirmAndNavigate(importId: number, columnMapping: Record<string, string>, isFoh: boolean, toastMessage: string): void {
    this.stepLabel.set('Validando columnas...');

    this.importService.confirmMapping(importId, columnMapping, isFoh).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        // E2: Clear tracked import — it's now valid and navigating to preview
        this.createdImportId.set(null);
        this.toast.success(toastMessage);
        this.router.navigate(['/app/imports', importId, 'preview']);
      },
      error: (err) => {
        console.error('Error confirming mapping:', err);
        this.isSubmitting.set(false);
        this.errors.set([err.error?.message || 'Error al confirmar el mapeo de columnas.']);
      }
    });
  }
}
