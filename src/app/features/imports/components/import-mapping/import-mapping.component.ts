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
import { ImportService, MappingColumn, MappingData } from '../../../../core/services/import.service';
import { ToastService } from '../../../../core/services/toast.service';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';

interface FieldOption {
  value: string;
  label: string;
  required: boolean;
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
                            [class.field-ignore]="mappings()[col.index] === 'ignore'">
                      <option value="">— Sin asignar —</option>
                      @for (opt of availableFields; track opt.value) {
                        <option [value]="opt.value"
                                [disabled]="isFieldUsed(opt.value, col.index)">
                          {{ opt.label }} [{{ opt.value }}]{{ opt.required ? ' *' : '' }}{{ isFieldUsed(opt.value, col.index) ? ' (ya asignado)' : '' }}
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

  // Available field options for dropdowns
  availableFields: FieldOption[] = [
    { value: 'phone', label: 'Teléfono', required: true },
    { value: 'first_name', label: 'Nombre', required: true },
    { value: 'last_name', label: 'Apellido', required: true },
    { value: 'last_name_2', label: 'Apellido materno', required: false },
    { value: 'first_name_2', label: 'Segundo nombre', required: false },
    { value: 'email', label: 'Email', required: false },
    { value: 'codigo', label: 'Código', required: false },
    { value: 'role', label: 'Rol', required: false },
    { value: 'phone_code', label: 'Cód. País', required: false },
    { value: 'manager_email', label: 'Ejecutivo', required: false },
    { value: 'agent_name', label: 'Agente (FOH)', required: false },
    { value: 'phone_order', label: 'Orden teléfono', required: false },
    { value: 'crm', label: 'Campo CRM', required: false },
    { value: 'ignore', label: 'Ignorar', required: false },
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
    // 'ignore' and 'crm' can be used multiple times
    if (fieldValue === 'ignore' || fieldValue === 'crm') return false;
    const m = this.mappings();
    return Object.entries(m).some(
      ([idx, val]) => val === fieldValue && Number(idx) !== currentIndex
    );
  }

  isRequiredField(fieldValue: string | undefined): boolean {
    if (!fieldValue) return false;
    return this.requiredFieldValues.includes(fieldValue);
  }

  isRequiredMissing(colIndex: number): boolean {
    // Highlight row if no mapping and it could be a required field
    return false; // not highlighting individual rows for now
  }

  onConfirm(): void {
    if (!this.allRequiredMapped()) return;

    this.isConfirming.set(true);

    // Build columnMapping as Record<string, string> (stringified index keys)
    const m = this.mappings();
    const columnMapping: Record<string, string> = {};
    for (const [idx, val] of Object.entries(m)) {
      columnMapping[idx.toString()] = val;
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
}
