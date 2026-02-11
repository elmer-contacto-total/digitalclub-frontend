/**
 * Import Mapping Component
 * Paso intermedio: Mapeo interactivo de columnas CSV antes de validación.
 * El usuario ve los headers del CSV, revisa/ajusta las asignaciones, y confirma.
 */
import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { ImportService, MappingColumn, MappingData, MappingTemplate } from '../../../../core/services/import.service';
import { ToastService } from '../../../../core/services/toast.service';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';

interface FieldOption {
  value: string;
  label: string;
  dbField: string | null; // campo real de destino en BD (null para 'ignore')
  required: boolean;
  category?: 'linker' | 'system'; // campos especiales con estilo diferenciado
}

@Component({
  selector: 'app-import-mapping',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FormsModule,
    LoadingSpinnerComponent
  ],
  template: `
    <div class="mapping-page">
      <!-- Header -->
      <div class="page-header">
        <a routerLink="/app/imports/new" class="back-link">
          <i class="ph ph-arrow-left"></i>
          Nueva importación
        </a>
        <h1 class="page-title">Mapeo de columnas</h1>
        <p class="page-subtitle">Asigne cada columna del CSV a un campo del sistema</p>
      </div>

      @if (loading()) {
        <app-loading-spinner message="Cargando columnas del CSV..." />
      } @else if (error()) {
        <div class="alert-error">
          <i class="ph ph-warning-circle"></i>
          <span>{{ error() }}</span>
        </div>
      } @else {
        <!-- Template match banner -->
        @if (matchedTemplate() && !templateDismissed()) {
          <div class="template-banner">
            <i class="ph ph-lightning"></i>
            <span>Se encontró el template <strong>{{ matchedTemplate()!.name }}</strong></span>
            <button class="btn-sm btn-accent" (click)="applyTemplate()">Usar</button>
            <button class="btn-sm btn-ghost-sm" (click)="dismissTemplate()">Ignorar</button>
          </div>
        }

        <!-- Info banner -->
        <div class="info-banner">
          <i class="ph ph-info"></i>
          <span>El archivo contiene <strong>{{ totalRows() }}</strong> registros y <strong>{{ columns().length }}</strong> columnas. Asigne al menos Teléfono, Nombre y Apellido.</span>
        </div>

        <!-- Mapping table -->
        <div class="card">
          <div class="card-header">
            <i class="ph ph-columns"></i>
            <span>Columnas del CSV</span>
          </div>
          <div class="card-body">
            <div class="mapping-table">
              <div class="mapping-row mapping-header-row">
                <div class="col-header">Columna CSV</div>
                <div class="col-sample">Ejemplo</div>
                <div class="col-field">Campo asignado</div>
              </div>
              @for (col of columns(); track col.index) {
                <div class="mapping-row" [class.mapped]="mappings()[col.index] && mappings()[col.index] !== 'ignore'"
                     [class.required-missing]="isRequiredMissing(col.index)">
                  <div class="col-header">
                    <span class="header-name">{{ col.header }}</span>
                    <span class="header-index">#{{ col.index + 1 }}</span>
                  </div>
                  <div class="col-sample">
                    @for (sample of col.sampleData; track $index) {
                      <span class="sample-value">{{ sample }}</span>
                    }
                    @if (col.sampleData.length === 0) {
                      <span class="sample-empty">—</span>
                    }
                  </div>
                  <div class="col-field">
                    <select [ngModel]="mappings()[col.index] || ''"
                            (ngModelChange)="setMapping(col.index, $event)"
                            class="field-select"
                            [class.field-required]="isRequiredField(mappings()[col.index])"
                            [class.field-ignore]="mappings()[col.index] === 'ignore'"
                            [class.field-linker]="isLinkerField(mappings()[col.index])">
                      <option value="">— Sin asignar —</option>
                      @for (opt of availableFields; track opt.value) {
                        <option [value]="opt.value"
                                [disabled]="isFieldUsed(opt.value, col.index)">
                          {{ opt.category === 'linker' ? '\u{1F517} ' : '' }}{{ opt.label }}{{ opt.dbField ? ' [' + opt.dbField + ']' : '' }}{{ opt.required ? ' *' : '' }}{{ isFieldUsed(opt.value, col.index) ? ' (ya asignado)' : '' }}
                        </option>
                      }
                    </select>
                  </div>
                </div>
              }
            </div>
          </div>
        </div>

        <!-- Required fields status -->
        <div class="required-status" [class.all-mapped]="allRequiredMapped()">
          @if (allRequiredMapped()) {
            <i class="ph ph-check-circle"></i>
            <span>Todos los campos obligatorios están asignados</span>
          } @else {
            <i class="ph ph-warning"></i>
            <span>Faltan campos obligatorios:</span>
            @for (field of missingRequired(); track field) {
              <span class="missing-badge">{{ field }}</span>
            }
          }
        </div>

        <!-- Actions -->
        <div class="form-actions">
          <a routerLink="/app/imports" class="btn-ghost">Cancelar</a>
          <button type="button"
                  class="btn-outline"
                  [disabled]="!allRequiredMapped()"
                  (click)="showSaveTemplate()">
            <i class="ph ph-floppy-disk"></i>
            Guardar como template
          </button>
          <button type="button"
                  class="btn-primary"
                  [disabled]="!allRequiredMapped() || isConfirming()"
                  (click)="onConfirm()">
            @if (isConfirming()) {
              <span class="spinner"></span>
              Validando...
            } @else {
              <i class="ph ph-check"></i>
              Confirmar y validar
            }
          </button>
        </div>
      }

      <!-- Save Template Modal -->
      @if (showSaveModal()) {
        <div class="modal-overlay" (click)="closeSaveModal()">
          <div class="modal-content" (click)="$event.stopPropagation()">
            <h3>Guardar template de mapeo</h3>
            <p class="modal-desc">El template se aplicará automáticamente cuando suba un CSV con las mismas columnas.</p>
            <input type="text"
                   class="modal-input"
                   placeholder="Nombre del template"
                   [ngModel]="templateName()"
                   (ngModelChange)="templateName.set($event)"
                   (keydown.enter)="onSaveTemplate()" />
            <div class="modal-actions">
              <button class="btn-ghost" (click)="closeSaveModal()">Cancelar</button>
              <button class="btn-primary"
                      [disabled]="!templateName() || isSavingTemplate()"
                      (click)="onSaveTemplate()">
                @if (isSavingTemplate()) {
                  <span class="spinner"></span>
                } @else {
                  Guardar
                }
              </button>
            </div>
          </div>
        </div>
      }

      @if (isConfirming()) {
        <app-loading-spinner [overlay]="true" message="Validando con el mapeo seleccionado..." />
      }
    </div>
  `,
  styles: [`
    .mapping-page {
      padding: var(--space-6);
      max-width: 960px;
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

    .page-subtitle {
      margin: var(--space-1) 0 0;
      font-size: var(--text-sm);
      color: var(--fg-muted);
    }

    /* Info Banner */
    .info-banner {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-3) var(--space-4);
      background: var(--accent-subtle);
      border: 1px solid var(--accent-muted);
      border-radius: var(--radius-lg);
      margin-bottom: var(--space-4);
      font-size: var(--text-sm);
      color: var(--fg-default);
      > i { font-size: 18px; color: var(--accent-default); }
    }

    /* Alert Error */
    .alert-error {
      display: flex;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
      background: var(--error-subtle);
      border: 1px solid var(--error-default);
      border-radius: var(--radius-lg);
      color: var(--error-text);
      > i { font-size: 20px; }
    }

    /* Card */
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
      padding: 0;
    }

    /* Mapping Table */
    .mapping-table {
      width: 100%;
    }

    .mapping-row {
      display: grid;
      grid-template-columns: 1fr 1fr 1.2fr;
      gap: var(--space-3);
      align-items: center;
      padding: var(--space-3) var(--space-4);
      border-bottom: 1px solid var(--border-muted);
      transition: background var(--duration-fast);

      &:last-child { border-bottom: none; }
      &:hover:not(.mapping-header-row) { background: var(--bg-subtle); }
      &.mapped { background: var(--success-subtle); }
      &.required-missing { background: var(--warning-subtle); }
    }

    .mapping-header-row {
      font-size: var(--text-xs);
      font-weight: var(--font-semibold);
      color: var(--fg-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: var(--bg-subtle);
    }

    .col-header {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .header-name {
      font-weight: var(--font-medium);
      font-size: var(--text-sm);
      color: var(--fg-default);
      font-family: monospace;
    }

    .header-index {
      font-size: var(--text-xs);
      color: var(--fg-subtle);
    }

    .col-sample {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .sample-value {
      font-size: var(--text-xs);
      color: var(--fg-muted);
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .sample-empty {
      font-size: var(--text-xs);
      color: var(--fg-subtle);
    }

    .col-field {
      display: flex;
    }

    .field-select {
      width: 100%;
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      font-size: var(--text-sm);
      color: var(--fg-default);
      background: var(--card-bg);
      cursor: pointer;
      transition: border-color var(--duration-fast);

      &:focus {
        outline: none;
        border-color: var(--accent-default);
        box-shadow: 0 0 0 2px var(--accent-subtle);
      }

      &.field-required {
        border-color: var(--success-default);
        background: var(--success-subtle);
      }

      &.field-ignore {
        border-color: var(--border-muted);
        color: var(--fg-subtle);
        font-style: italic;
      }

      &.field-linker {
        border-color: #8b5cf6;
        background: rgba(139, 92, 246, 0.08);
        color: #7c3aed;
      }
    }

    /* Required Status */
    .required-status {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-3) var(--space-4);
      background: var(--warning-subtle);
      border: 1px solid var(--warning-default);
      border-radius: var(--radius-lg);
      margin-bottom: var(--space-4);
      font-size: var(--text-sm);
      color: var(--fg-default);

      > i { font-size: 18px; color: var(--warning-default); }

      &.all-mapped {
        background: var(--success-subtle);
        border-color: var(--success-default);
        > i { color: var(--success-default); }
      }
    }

    .missing-badge {
      display: inline-flex;
      padding: 2px 8px;
      background: var(--warning-default);
      color: #fff;
      border-radius: var(--radius-sm);
      font-size: var(--text-xs);
      font-weight: var(--font-medium);
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
      margin-top: var(--space-4);
    }

    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    /* Template Banner */
    .template-banner {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-3) var(--space-4);
      background: var(--success-subtle);
      border: 1px solid var(--success-default);
      border-radius: var(--radius-lg);
      margin-bottom: var(--space-4);
      font-size: var(--text-sm);
      color: var(--fg-default);
      > i { font-size: 18px; color: var(--success-default); }
    }

    .btn-sm {
      padding: 4px 12px;
      font-size: var(--text-xs);
      font-weight: var(--font-medium);
      border-radius: var(--radius-md);
      border: none;
      cursor: pointer;
    }

    .btn-accent {
      background: var(--accent-default);
      color: #fff;
      &:hover { background: var(--accent-emphasis); }
    }

    .btn-ghost-sm {
      background: transparent;
      color: var(--fg-muted);
      &:hover { color: var(--fg-default); background: var(--bg-subtle); }
    }

    .btn-outline {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-4);
      height: var(--btn-height);
      background: transparent;
      color: var(--fg-default);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      font-size: var(--text-base);
      cursor: pointer;
      &:hover:not(:disabled) { border-color: var(--accent-default); color: var(--accent-default); }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }

    /* Modal */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal-content {
      background: var(--card-bg);
      border-radius: var(--radius-lg);
      padding: var(--space-6);
      width: 400px;
      max-width: 90vw;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);

      h3 { margin: 0 0 var(--space-2); font-size: var(--text-lg); color: var(--fg-default); }
    }

    .modal-desc {
      margin: 0 0 var(--space-4);
      font-size: var(--text-sm);
      color: var(--fg-muted);
    }

    .modal-input {
      width: 100%;
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      font-size: var(--text-sm);
      color: var(--fg-default);
      background: var(--card-bg);
      margin-bottom: var(--space-4);
      box-sizing: border-box;
      &:focus { outline: none; border-color: var(--accent-default); box-shadow: 0 0 0 2px var(--accent-subtle); }
    }

    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-3);
    }

    @media (max-width: 768px) {
      .mapping-page { padding: var(--space-4); }
      .mapping-row { grid-template-columns: 1fr; gap: var(--space-2); }
      .mapping-header-row { display: none; }
    }
  `]
})
export class ImportMappingComponent implements OnInit, OnDestroy {
  private importService = inject(ImportService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);
  private destroy$ = new Subject<void>();

  // State
  loading = signal(true);
  error = signal<string | null>(null);
  isConfirming = signal(false);
  importId = signal(0);
  isFoh = signal(false);
  columns = signal<MappingColumn[]>([]);
  totalRows = signal(0);

  // Mapping: column index -> field value
  mappings = signal<Record<number, string>>({});

  // Template state
  matchedTemplate = signal<MappingTemplate | null>(null);
  templateDismissed = signal(false);
  showSaveModal = signal(false);
  templateName = signal('');
  isSavingTemplate = signal(false);

  // Available field options for dropdowns
  availableFields: FieldOption[] = [
    { value: 'phone', label: 'Teléfono', dbField: 'phone', required: true },
    { value: 'first_name', label: 'Nombre', dbField: 'first_name', required: true },
    { value: 'last_name', label: 'Apellido', dbField: 'last_name', required: true },
    { value: 'last_name_2', label: 'Apellido materno', dbField: 'last_name', required: false },
    { value: 'first_name_2', label: 'Segundo nombre', dbField: 'first_name', required: false },
    { value: 'email', label: 'Email', dbField: 'email', required: false },
    { value: 'codigo', label: 'Código', dbField: 'codigo', required: false },
    { value: 'role', label: 'Rol', dbField: 'role', required: false },
    { value: 'phone_code', label: 'Cód. País', dbField: 'phone_code', required: false },
    { value: 'manager_email', label: 'Vinculador de agente', dbField: 'manager_email', required: false, category: 'linker' },
    { value: 'phone_order', label: 'Orden teléfono', dbField: 'phone_order', required: false },
    { value: 'custom_field', label: 'Campo personalizado', dbField: 'custom_fields', required: false },
    { value: 'ignore', label: 'Ignorar', dbField: null, required: false },
  ];

  // Required field names
  private requiredFieldValues = ['phone', 'first_name', 'last_name'];

  // Computed: all required fields are mapped
  allRequiredMapped = computed(() => {
    const m = this.mappings();
    const assignedValues = new Set(Object.values(m));
    return this.requiredFieldValues.every(f => assignedValues.has(f));
  });

  // Computed: list of missing required field labels
  missingRequired = computed(() => {
    const m = this.mappings();
    const assignedValues = new Set(Object.values(m));
    return this.availableFields
      .filter(f => f.required && !assignedValues.has(f.value))
      .map(f => f.label);
  });

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.importId.set(id);

    // Check if FOH from query params
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      if (params['isFoh'] === 'true') {
        this.isFoh.set(true);
      }
    });

    this.loadMapping();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadMapping(): void {
    this.loading.set(true);
    this.importService.getMapping(this.importId(), this.isFoh()).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (data) => {
        this.columns.set(data.columns);
        this.totalRows.set(data.totalRows);

        // Pre-fill mappings from auto-suggestions
        const initial: Record<number, string> = {};
        for (const col of data.columns) {
          if (col.suggestion) {
            initial[col.index] = col.suggestion;
          }
        }
        this.mappings.set(initial);
        this.loading.set(false);

        // Search for matching template
        const headers = data.columns.map(c => c.header);
        this.importService.findMatchingTemplate(headers, this.isFoh()).pipe(
          takeUntil(this.destroy$)
        ).subscribe({
          next: (res) => {
            if (res.found && res.template) {
              this.matchedTemplate.set(res.template);
            }
          },
          error: () => { /* ignore template match errors */ }
        });
      },
      error: (err) => {
        console.error('Error loading mapping data:', err);
        this.error.set('Error al cargar las columnas del archivo.');
        this.loading.set(false);
      }
    });
  }

  setMapping(colIndex: number, fieldValue: string): void {
    const current = { ...this.mappings() };
    if (fieldValue) {
      current[colIndex] = fieldValue;
    } else {
      delete current[colIndex];
    }
    this.mappings.set(current);
  }

  isFieldUsed(fieldValue: string, currentIndex: number): boolean {
    // 'ignore' and 'custom_field' can be used multiple times
    if (fieldValue === 'ignore' || fieldValue === 'custom_field') return false;
    const m = this.mappings();
    return Object.entries(m).some(
      ([idx, val]) => val === fieldValue && Number(idx) !== currentIndex
    );
  }

  isRequiredField(fieldValue: string | undefined): boolean {
    if (!fieldValue) return false;
    return this.requiredFieldValues.includes(fieldValue);
  }

  isLinkerField(fieldValue: string | undefined): boolean {
    if (!fieldValue) return false;
    const opt = this.availableFields.find(f => f.value === fieldValue);
    return opt?.category === 'linker';
  }

  isRequiredMissing(colIndex: number): boolean {
    // Highlight row if no mapping and it could be a required field
    return false; // not highlighting individual rows for now
  }

  onConfirm(): void {
    if (!this.allRequiredMapped()) return;

    this.isConfirming.set(true);

    // Build columnMapping as Record<string, string> (stringified index keys)
    // For custom_field columns, send "custom_field:HEADER" so backend knows the key
    const m = this.mappings();
    const cols = this.columns();
    const columnMapping: Record<string, string> = {};
    for (const [idx, val] of Object.entries(m)) {
      if (val === 'custom_field') {
        const col = cols.find(c => c.index === Number(idx));
        columnMapping[idx.toString()] = col ? `custom_field:${col.header}` : val;
      } else {
        columnMapping[idx.toString()] = val;
      }
    }

    this.importService.confirmMapping(this.importId(), columnMapping, this.isFoh()).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.isConfirming.set(false);
        this.toast.success('Mapeo confirmado. Validación completada.');
        this.router.navigate(['/app/imports', this.importId(), 'preview']);
      },
      error: (err) => {
        console.error('Error confirming mapping:', err);
        this.isConfirming.set(false);
        this.toast.error(err.error?.message || 'Error al confirmar el mapeo.');
      }
    });
  }

  // ========== Template Methods ==========

  applyTemplate(): void {
    const template = this.matchedTemplate();
    if (!template) return;

    const cols = this.columns();
    const newMappings: Record<number, string> = {};

    for (const col of cols) {
      const field = template.columnMapping[col.header];
      if (field) {
        // For custom_field:X format, display as 'custom_field' in the dropdown
        newMappings[col.index] = field.startsWith('custom_field:') ? 'custom_field' : field;
      }
    }

    this.mappings.set(newMappings);
    this.templateDismissed.set(true);
    this.toast.success(`Template "${template.name}" aplicado.`);
  }

  dismissTemplate(): void {
    this.templateDismissed.set(true);
  }

  showSaveTemplate(): void {
    this.showSaveModal.set(true);
    this.templateName.set('');
  }

  closeSaveModal(): void {
    this.showSaveModal.set(false);
  }

  onSaveTemplate(): void {
    const name = this.templateName().trim();
    if (!name) return;

    this.isSavingTemplate.set(true);

    // Build the mapping with header names as keys (not column indices)
    // For custom_field columns, save as "custom_field:HEADER"
    const m = this.mappings();
    const cols = this.columns();
    const columnMapping: Record<string, string> = {};
    const headers: string[] = [];

    for (const col of cols) {
      headers.push(col.header);
      const field = m[col.index];
      if (field) {
        columnMapping[col.header] = field === 'custom_field' ? `custom_field:${col.header}` : field;
      }
    }

    this.importService.saveMappingTemplate(name, this.isFoh(), columnMapping, headers).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.isSavingTemplate.set(false);
        this.showSaveModal.set(false);
        this.toast.success(`Template "${name}" guardado.`);
      },
      error: (err) => {
        this.isSavingTemplate.set(false);
        this.toast.error(err.error?.message || 'Error al guardar el template.');
      }
    });
  }
}
