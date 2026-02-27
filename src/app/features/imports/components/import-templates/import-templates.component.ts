/**
 * Import Templates Component
 * Gestión de templates de mapeo de importación (Admin/SuperAdmin only).
 * Permite listar, crear y eliminar templates de mapeo de columnas CSV.
 */
import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { ImportService, MappingTemplate, MappingColumn } from '../../../../core/services/import.service';
import { ToastService } from '../../../../core/services/toast.service';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';

interface FieldOption {
  value: string;
  label: string;
  dbField: string | null;
  required: boolean;
  category?: 'linker' | 'system';
}

@Component({
  selector: 'app-import-templates',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FormsModule,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    ConfirmDialogComponent
  ],
  template: `
    <div class="templates-page">
      <!-- Header -->
      <a routerLink="/app/imports" class="back-link">
        <i class="ph ph-arrow-left"></i>
        Volver a Importaciones
      </a>

      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">Templates de importación</h1>
          <p class="page-subtitle">Configure templates para que las importaciones se mapeen automáticamente</p>
        </div>
        @if (!isCreating()) {
          <button class="btn-primary" (click)="startCreate()">
            <i class="ph ph-plus"></i>
            Nuevo template
          </button>
        }
      </div>

      <!-- Info Banner -->
      @if (!isCreating()) {
        <div class="info-banner">
          <i class="ph ph-info"></i>
          <div class="info-content">
            <strong>¿Cómo funcionan los templates?</strong>
            <p>Un template define cómo se mapean las columnas de un CSV a los campos del sistema (teléfono, nombre, apellido, etc.). Cuando un usuario sube un archivo, el sistema busca automáticamente un template compatible con las mismas columnas y lo aplica sin intervención manual.</p>
            <div class="info-details">
              <span class="info-tag"><i class="ph ph-upload-simple"></i> Suba un CSV de muestra para crear un template</span>
              <span class="info-tag"><i class="ph ph-arrows-left-right"></i> Asigne cada columna a un campo del sistema</span>
              <span class="info-tag"><i class="ph ph-lightning"></i> Las importaciones futuras se mapean solas</span>
            </div>
          </div>
        </div>
      }

      <!-- Create Template Flow -->
      @if (isCreating()) {
        <div class="card create-card">
          <div class="card-header">
            <i class="ph ph-plus-circle"></i>
            <span>Nuevo template</span>
            <button class="close-btn" (click)="cancelCreate()">
              <i class="ph ph-x"></i>
            </button>
          </div>
          <div class="card-body">
            @if (!sampleColumns().length) {
              <!-- Step 1: Upload sample CSV -->
              <div class="create-step">
                <p class="step-label">Paso 1: Suba un archivo CSV de muestra para detectar las columnas</p>
                <label for="template-csv-upload" class="upload-area" [class.has-file]="sampleFile()">
                  @if (sampleFile()) {
                    <i class="ph ph-file-csv file-icon"></i>
                    <span class="file-name">{{ sampleFile()!.name }}</span>
                    <button type="button" class="remove-btn" (click)="clearSampleFile(); $event.preventDefault()">
                      <i class="ph ph-x"></i>
                    </button>
                  } @else {
                    <i class="ph ph-cloud-arrow-up upload-icon"></i>
                    <span class="upload-text">Seleccionar archivo CSV</span>
                  }
                </label>
                <input type="file" id="template-csv-upload" class="file-input-hidden"
                       accept=".csv" (change)="onSampleFileSelected($event)" />
                @if (uploadError()) {
                  <div class="inline-error">
                    <i class="ph ph-warning-circle"></i>
                    {{ uploadError() }}
                  </div>
                }
                <div class="step-actions">
                  <button class="btn-ghost" (click)="cancelCreate()">Cancelar</button>
                  <button class="btn-primary" [disabled]="!sampleFile() || isUploading()"
                          (click)="uploadSample()">
                    @if (isUploading()) {
                      <span class="spinner"></span>
                      Procesando...
                    } @else {
                      <i class="ph ph-arrow-right"></i>
                      Siguiente
                    }
                  </button>
                </div>
              </div>
            } @else {
              <!-- Step 2: Configure mapping + name -->
              <div class="create-step">
                <p class="step-label">Paso 2: Asigne cada columna del CSV a un campo del sistema</p>

                <!-- Mapping table -->
                <div class="mapping-table">
                  <div class="mapping-row mapping-header-row">
                    <div class="col-header">Columna CSV</div>
                    <div class="col-sample">Ejemplo</div>
                    <div class="col-field">Campo asignado</div>
                  </div>
                  @for (col of sampleColumns(); track col.index) {
                    <div class="mapping-row"
                         [class.mapped]="sampleMappings()[col.index] && sampleMappings()[col.index] !== 'ignore'">
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
                        <select [ngModel]="sampleMappings()[col.index] || ''"
                                (ngModelChange)="setMapping(col.index, $event)"
                                class="field-select"
                                [class.field-required]="isRequiredField(sampleMappings()[col.index])"
                                [class.field-ignore]="sampleMappings()[col.index] === 'ignore'"
                                [class.field-linker]="isLinkerField(sampleMappings()[col.index])">
                          <option value="">— Sin asignar —</option>
                          @for (opt of availableFields; track opt.value) {
                            <option [value]="opt.value"
                                    [disabled]="isFieldUsed(opt.value, col.index)">
                              {{ opt.category === 'linker' ? '\u{1F517} ' : '' }}{{ opt.label }}{{ opt.dbField ? ' [' + opt.dbField + ']' : '' }}{{ opt.required ? ' *' : '' }}{{ isFieldUsed(opt.value, col.index) ? ' (ya asignado)' : '' }}
                            </option>
                          }
                        </select>
                        @if (sampleMappings()[col.index] && sampleMappings()[col.index] !== 'ignore'
                             && sampleMappings()[col.index] !== 'custom_field') {
                          <button type="button"
                                  class="cf-toggle"
                                  [class.cf-active]="customFieldDuplicates().has(col.index)"
                                  (click)="toggleCustomFieldDuplicate(col.index)"
                                  title="Guardar también como campo personalizado en el CRM">
                            <i class="ph" [ngClass]="customFieldDuplicates().has(col.index) ? 'ph-check-square' : 'ph-square'"></i>
                            <span>+ Campo personalizado</span>
                          </button>
                        }
                      </div>
                    </div>
                  }
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

                <!-- Template name + FOH toggle -->
                <div class="template-config">
                  <div class="config-field">
                    <label for="template-name">Nombre del template</label>
                    <input type="text" id="template-name" class="text-input"
                           placeholder="Ej: Importación estándar, FOH Financiera, etc."
                           [ngModel]="templateName()"
                           (ngModelChange)="templateName.set($event)" />
                  </div>
                  <div class="config-field config-checkbox">
                    <label>
                      <input type="checkbox" [ngModel]="isFoh()" (ngModelChange)="isFoh.set($event)" />
                      Template FOH (Financiera Oh)
                    </label>
                  </div>
                </div>

                <div class="step-actions">
                  <button class="btn-ghost" (click)="cancelCreate()">Cancelar</button>
                  <button class="btn-primary"
                          [disabled]="!allRequiredMapped() || !templateName().trim() || isSaving()"
                          (click)="saveTemplate()">
                    @if (isSaving()) {
                      <span class="spinner"></span>
                      Guardando...
                    } @else {
                      <i class="ph ph-floppy-disk"></i>
                      Guardar template
                    }
                  </button>
                </div>
              </div>
            }
          </div>
        </div>
      }

      <!-- Templates List -->
      @if (isLoading()) {
        <app-loading-spinner [overlay]="false" message="Cargando templates..." />
      } @else if (templates().length === 0 && !isCreating()) {
        <app-empty-state
          icon="ph-file-dashed"
          title="No hay templates"
          description="Cree un template para que las importaciones se mapeen automáticamente"
        >
          <button class="btn-primary" (click)="startCreate()">
            <i class="ph ph-plus"></i>
            Crear template
          </button>
        </app-empty-state>
      } @else if (templates().length > 0) {
        <div class="table-card">
          <table class="data-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Tipo</th>
                <th class="text-right">Columnas</th>
                <th>Fecha</th>
                <th class="col-actions"></th>
              </tr>
            </thead>
            <tbody>
              @for (tpl of templates(); track tpl.id) {
                <tr [class.expanded]="expandedTemplateId() === tpl.id">
                  <td>
                    <button class="template-name-btn" (click)="toggleExpand(tpl.id)">
                      <i class="ph" [ngClass]="expandedTemplateId() === tpl.id ? 'ph-caret-down' : 'ph-caret-right'"></i>
                      {{ tpl.name }}
                    </button>
                  </td>
                  <td>
                    <span class="type-tag">{{ tpl.isFoh ? 'FOH' : 'Estándar' }}</span>
                  </td>
                  <td class="text-right">{{ tpl.headers.length }}</td>
                  <td class="text-nowrap">{{ formatDate(tpl.createdAt) }}</td>
                  <td class="col-actions">
                    <button class="action-btn action-btn-danger" (click)="confirmDelete(tpl)" title="Eliminar">
                      <i class="ph ph-trash"></i>
                    </button>
                  </td>
                </tr>
                @if (expandedTemplateId() === tpl.id) {
                  <tr class="detail-row">
                    <td [colSpan]="5">
                      <div class="template-detail">
                        <div class="detail-header">Mapeo de columnas:</div>
                        <div class="detail-mappings">
                          @for (header of tpl.headers; track header) {
                            <div class="detail-mapping-row">
                              <span class="detail-csv-col">{{ header }}</span>
                              <i class="ph ph-arrow-right"></i>
                              <span class="detail-field">{{ getFieldLabel(tpl.columnMapping[header]) || '—' }}</span>
                            </div>
                          }
                        </div>
                      </div>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
      }

      <!-- Delete Confirmation Dialog -->
      @if (templateToDelete()) {
        <app-confirm-dialog
          [isOpen]="true"
          title="Eliminar Template"
          [message]="deleteMessage()"
          type="danger"
          confirmLabel="Eliminar"
          (confirmed)="deleteTemplate()"
          (cancelled)="templateToDelete.set(null)"
        />
      }

      @if (isUploading()) {
        <app-loading-spinner [fullscreen]="true" message="Procesando archivo CSV..." />
      }
    </div>
  `,
  styles: [`
    .templates-page {
      padding: var(--space-6);
      max-width: 1000px;
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

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: var(--space-6);
      gap: var(--space-4);
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
      gap: var(--space-3);
      padding: var(--space-4);
      background: var(--accent-subtle);
      border: 1px solid var(--accent-muted);
      border-radius: var(--radius-lg);
      margin-bottom: var(--space-6);
      > i { font-size: 20px; color: var(--accent-default); flex-shrink: 0; margin-top: 2px; }
    }

    .info-content {
      strong { font-size: var(--text-sm); color: var(--fg-default); }
      p {
        margin: var(--space-1) 0 var(--space-3);
        font-size: var(--text-sm);
        color: var(--fg-muted);
        line-height: 1.5;
      }
    }

    .info-details {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .info-tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 10px;
      background: var(--card-bg);
      border: 1px solid var(--border-muted);
      border-radius: var(--radius-sm);
      font-size: var(--text-xs);
      color: var(--fg-muted);
      i { font-size: 14px; color: var(--accent-default); }
    }

    /* Cards */
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius-lg);
      margin-bottom: var(--space-6);
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

    .close-btn {
      margin-left: auto;
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
      &:hover { background: var(--bg-muted); color: var(--fg-default); }
    }

    .card-body { padding: var(--space-4); }

    /* Create Flow */
    .create-step { }

    .step-label {
      margin: 0 0 var(--space-4);
      font-size: var(--text-sm);
      color: var(--fg-muted);
      font-weight: var(--font-medium);
    }

    .step-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-3);
      margin-top: var(--space-4);
    }

    /* Upload */
    .upload-area {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 120px;
      border: 2px dashed var(--border-default);
      border-radius: var(--radius-lg);
      cursor: pointer;
      transition: all var(--duration-normal);
      &:hover { border-color: var(--accent-default); background: var(--accent-subtle); }
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

    .upload-icon { font-size: 32px; color: var(--fg-subtle); margin-bottom: var(--space-2); }
    .upload-text { font-size: var(--text-sm); color: var(--fg-muted); font-weight: var(--font-medium); }
    .file-icon { font-size: 24px; color: var(--accent-default); }
    .file-name { flex: 1; font-size: var(--text-sm); color: var(--fg-default); font-weight: var(--font-medium); }
    .remove-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px; height: 24px;
      border: none; border-radius: var(--radius-md);
      background: transparent; color: var(--fg-subtle); cursor: pointer;
      &:hover { background: var(--error-subtle); color: var(--error-default); }
    }
    .file-input-hidden { position: absolute; width: 0; height: 0; opacity: 0; overflow: hidden; }

    .inline-error {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin-top: var(--space-2);
      font-size: var(--text-sm);
      color: var(--error-default);
      i { font-size: 16px; }
    }

    /* Mapping Table */
    .mapping-table { width: 100%; margin-bottom: var(--space-4); border: 1px solid var(--border-muted); border-radius: var(--radius-md); overflow: hidden; }

    .mapping-row {
      display: grid;
      grid-template-columns: 1fr 1fr 1.2fr;
      gap: var(--space-3);
      align-items: center;
      padding: var(--space-2) var(--space-3);
      border-bottom: 1px solid var(--border-muted);
      transition: background var(--duration-fast);
      &:last-child { border-bottom: none; }
      &:hover:not(.mapping-header-row) { background: var(--bg-subtle); }
      &.mapped { background: var(--success-subtle); }
    }

    .mapping-header-row {
      font-size: var(--text-xs);
      font-weight: var(--font-semibold);
      color: var(--fg-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: var(--bg-subtle);
    }

    .col-header { display: flex; align-items: center; gap: var(--space-2); }
    .header-name { font-weight: var(--font-medium); font-size: var(--text-sm); color: var(--fg-default); font-family: monospace; }
    .header-index { font-size: var(--text-xs); color: var(--fg-subtle); }
    .col-sample { display: flex; flex-direction: column; gap: 2px; }
    .sample-value { font-size: var(--text-xs); color: var(--fg-muted); max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sample-empty { font-size: var(--text-xs); color: var(--fg-subtle); }

    .col-field { display: flex; flex-direction: column; gap: 4px; }

    .field-select {
      width: 100%;
      padding: var(--space-1) var(--space-2);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      font-size: var(--text-sm);
      color: var(--fg-default);
      background: var(--card-bg);
      cursor: pointer;
      &:focus { outline: none; border-color: var(--accent-default); box-shadow: 0 0 0 2px var(--accent-subtle); }
      &.field-required { border-color: var(--success-default); background: var(--success-subtle); }
      &.field-ignore { border-color: var(--border-muted); color: var(--fg-subtle); font-style: italic; }
      &.field-linker {
        border-color: #8b5cf6;
        background: rgba(139, 92, 246, 0.08);
        color: #7c3aed;
      }

      :host-context([data-theme="dark"]) &.field-linker {
        border-color: #a78bfa;
        background: rgba(167, 139, 250, 0.15);
        color: #c4b5fd;
      }

      :host-context([data-theme="dark"]) & option {
        background: var(--bg-subtle);
        color: var(--fg-default);
      }
    }

    .cf-toggle {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border: 1px dashed var(--border-default);
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--fg-subtle);
      font-size: var(--text-xs);
      cursor: pointer;
      transition: all var(--duration-fast);
      i { font-size: 14px; }
      &:hover {
        border-color: var(--accent-muted);
        color: var(--fg-muted);
        background: var(--accent-subtle);
      }
      &.cf-active {
        border-style: solid;
        border-color: #8b5cf6;
        background: rgba(139, 92, 246, 0.1);
        color: #7c3aed;
        font-weight: var(--font-medium);
      }
      :host-context([data-theme="dark"]) &.cf-active {
        border-color: #a78bfa;
        background: rgba(167, 139, 250, 0.15);
        color: #c4b5fd;
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

    /* Template Config */
    .template-config {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      margin-bottom: var(--space-2);
    }

    .config-field {
      label {
        display: block;
        font-size: var(--text-sm);
        font-weight: var(--font-medium);
        color: var(--fg-default);
        margin-bottom: var(--space-1);
      }
    }

    .config-checkbox label {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      cursor: pointer;
      input { cursor: pointer; }
    }

    .text-input {
      width: 100%;
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      font-size: var(--text-sm);
      color: var(--fg-default);
      background: var(--card-bg);
      box-sizing: border-box;
      &:focus { outline: none; border-color: var(--accent-default); box-shadow: 0 0 0 2px var(--accent-subtle); }
    }

    /* Table */
    .table-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius-lg);
      overflow: hidden;
    }

    .data-table { width: 100%; border-collapse: collapse; font-size: var(--text-base); }
    .data-table thead th {
      padding: var(--space-3) var(--space-4);
      background: var(--table-header-bg);
      color: var(--fg-muted);
      font-size: var(--text-sm);
      font-weight: var(--font-semibold);
      text-transform: uppercase;
      letter-spacing: 0.3px;
      text-align: left;
      white-space: nowrap;
      border-bottom: 1px solid var(--table-border);
    }
    .data-table tbody td {
      padding: var(--space-3) var(--space-4);
      color: var(--fg-default);
      border-bottom: 1px solid var(--table-border);
      vertical-align: middle;
    }
    .data-table tbody tr { transition: background var(--duration-fast); }
    .data-table tbody tr:hover:not(.detail-row) { background: var(--table-row-hover); }
    .data-table tbody tr:last-child td { border-bottom: none; }

    .text-right { text-align: right; }
    .text-nowrap { white-space: nowrap; }
    .col-actions { width: 60px; text-align: center; }

    .type-tag {
      display: inline-block;
      padding: 2px var(--space-2);
      background: var(--bg-muted);
      color: var(--fg-muted);
      border-radius: var(--radius-sm);
      font-size: var(--text-sm);
    }

    .template-name-btn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      background: none;
      border: none;
      color: var(--fg-default);
      font-size: var(--text-base);
      font-weight: var(--font-medium);
      cursor: pointer;
      padding: 0;
      &:hover { color: var(--accent-default); }
      i { font-size: 14px; color: var(--fg-subtle); }
    }

    .action-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px; height: 32px;
      border: none; border-radius: var(--radius-md);
      background: transparent; color: var(--fg-muted); cursor: pointer;
      &:hover { background: var(--bg-muted); color: var(--fg-default); }
      i { font-size: 18px; }
    }
    .action-btn-danger:hover { background: var(--error-subtle); color: var(--error-default); }

    /* Detail Row */
    .detail-row td {
      padding: 0 var(--space-4) var(--space-3) !important;
      background: var(--bg-subtle);
    }

    .template-detail { padding: var(--space-3) 0; }
    .detail-header {
      font-size: var(--text-xs);
      font-weight: var(--font-semibold);
      color: var(--fg-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: var(--space-2);
    }
    .detail-mappings {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: var(--space-2);
    }
    .detail-mapping-row {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-size: var(--text-sm);
      padding: var(--space-1) var(--space-2);
      background: var(--card-bg);
      border-radius: var(--radius-sm);
      i { font-size: 12px; color: var(--fg-subtle); }
    }
    .detail-csv-col { font-family: monospace; color: var(--fg-muted); }
    .detail-field { font-weight: var(--font-medium); color: var(--fg-default); }

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

    .spinner {
      width: 16px; height: 16px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    @media (max-width: 768px) {
      .templates-page { padding: var(--space-4); }
      .page-header { flex-direction: column; }
      .mapping-row { grid-template-columns: 1fr; gap: var(--space-2); }
      .mapping-header-row { display: none; }
      .detail-mappings { grid-template-columns: 1fr; }
    }
  `]
})
export class ImportTemplatesComponent implements OnInit, OnDestroy {
  private importService = inject(ImportService);
  private toast = inject(ToastService);
  private destroy$ = new Subject<void>();

  // List state
  templates = signal<MappingTemplate[]>([]);
  isLoading = signal(false);
  expandedTemplateId = signal<number | null>(null);
  templateToDelete = signal<MappingTemplate | null>(null);

  // Create state
  isCreating = signal(false);
  sampleFile = signal<File | null>(null);
  isUploading = signal(false);
  uploadError = signal<string | null>(null);
  sampleColumns = signal<MappingColumn[]>([]);
  sampleMappings = signal<Record<number, string>>({});
  customFieldDuplicates = signal<Set<number>>(new Set());
  templateName = signal('');
  isFoh = signal(false);
  isSaving = signal(false);

  // Field options (same as import-mapping)
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

  private requiredFieldValues = ['phone', 'first_name', 'last_name'];

  deleteMessage = computed(() => {
    const tpl = this.templateToDelete();
    return tpl
      ? `¿Eliminar el template "${tpl.name}"? Las importaciones futuras ya no podrán usarlo.`
      : '';
  });

  allRequiredMapped = computed(() => {
    const m = this.sampleMappings();
    const assignedValues = new Set(Object.values(m));
    return this.requiredFieldValues.every(f => assignedValues.has(f));
  });

  missingRequired = computed(() => {
    const m = this.sampleMappings();
    const assignedValues = new Set(Object.values(m));
    return this.availableFields
      .filter(f => f.required && !assignedValues.has(f.value))
      .map(f => f.label);
  });

  ngOnInit(): void {
    this.loadTemplates();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadTemplates(): void {
    this.isLoading.set(true);
    this.importService.getMappingTemplates().pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (templates) => {
        this.templates.set(templates);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading templates:', err);
        this.toast.error('Error al cargar templates');
        this.isLoading.set(false);
      }
    });
  }

  toggleExpand(id: number): void {
    this.expandedTemplateId.set(this.expandedTemplateId() === id ? null : id);
  }

  getFieldLabel(fieldValue: string | undefined): string {
    if (!fieldValue) return '';
    if (fieldValue.startsWith('custom_field:')) {
      return `Campo: ${fieldValue.substring('custom_field:'.length)}`;
    }
    // Manejar sufijo +cf para doble escritura
    const hasCf = fieldValue.endsWith('+cf');
    const baseField = hasCf ? fieldValue.slice(0, -3) : fieldValue;
    const opt = this.availableFields.find(f => f.value === baseField);
    const label = opt?.label || baseField;
    return hasCf ? `${label} (+campo personalizado)` : label;
  }

  // ========== Create Flow ==========

  startCreate(): void {
    this.isCreating.set(true);
    this.resetCreateState();
  }

  cancelCreate(): void {
    this.isCreating.set(false);
    this.resetCreateState();
  }

  private resetCreateState(): void {
    this.sampleFile.set(null);
    this.sampleColumns.set([]);
    this.sampleMappings.set({});
    this.customFieldDuplicates.set(new Set());
    this.templateName.set('');
    this.isFoh.set(false);
    this.uploadError.set(null);
  }

  onSampleFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      if (!file.name.toLowerCase().endsWith('.csv')) {
        this.uploadError.set('Solo se permiten archivos CSV');
        this.sampleFile.set(null);
        return;
      }
      this.sampleFile.set(file);
      this.uploadError.set(null);
    }
  }

  clearSampleFile(): void {
    this.sampleFile.set(null);
    this.uploadError.set(null);
    const input = document.getElementById('template-csv-upload') as HTMLInputElement;
    if (input) input.value = '';
  }

  uploadSample(): void {
    const file = this.sampleFile();
    if (!file) return;

    this.isUploading.set(true);
    this.uploadError.set(null);

    // Preview CSV in-memory — does NOT create an Import record
    this.importService.previewCsv(file).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        this.isUploading.set(false);
        if (response.result === 'success') {
          this.sampleColumns.set(response.mapping.columns);

          // Pre-fill from auto-suggestions
          const initial: Record<number, string> = {};
          for (const col of response.mapping.columns) {
            if (col.suggestion) {
              initial[col.index] = col.suggestion;
            }
          }
          this.sampleMappings.set(initial);
        } else {
          this.uploadError.set('Error al procesar el archivo');
        }
      },
      error: (err) => {
        this.isUploading.set(false);
        this.uploadError.set(err.error?.message || 'Error al subir el archivo');
      }
    });
  }

  setMapping(colIndex: number, fieldValue: string): void {
    const current = { ...this.sampleMappings() };
    if (fieldValue) {
      current[colIndex] = fieldValue;
    } else {
      delete current[colIndex];
    }
    this.sampleMappings.set(current);

    // Limpiar duplicate flag si cambia a ignore, custom_field, o vacío
    if (!fieldValue || fieldValue === 'ignore' || fieldValue === 'custom_field') {
      const dups = new Set(this.customFieldDuplicates());
      if (dups.has(colIndex)) {
        dups.delete(colIndex);
        this.customFieldDuplicates.set(dups);
      }
    }
  }

  toggleCustomFieldDuplicate(colIndex: number): void {
    const current = new Set(this.customFieldDuplicates());
    if (current.has(colIndex)) {
      current.delete(colIndex);
    } else {
      current.add(colIndex);
    }
    this.customFieldDuplicates.set(current);
  }

  isFieldUsed(fieldValue: string, currentIndex: number): boolean {
    if (fieldValue === 'ignore' || fieldValue === 'custom_field') return false;
    const m = this.sampleMappings();
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

  saveTemplate(): void {
    const name = this.templateName().trim();
    if (!name || !this.allRequiredMapped()) return;

    this.isSaving.set(true);

    // Build header-based mapping for the template
    const m = this.sampleMappings();
    const cols = this.sampleColumns();
    const columnMapping: Record<string, string> = {};
    const headers: string[] = [];

    for (const col of cols) {
      headers.push(col.header);
      const field = m[col.index];
      if (field) {
        let mappedValue = field === 'custom_field' ? `custom_field:${col.header}` : field;
        // Agregar sufijo +cf si el checkbox está activado para esta columna
        if (this.customFieldDuplicates().has(col.index) && field !== 'custom_field' && field !== 'ignore') {
          mappedValue += '+cf';
        }
        columnMapping[col.header] = mappedValue;
      }
    }

    this.importService.saveMappingTemplate(name, this.isFoh(), columnMapping, headers).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.toast.success(`Template "${name}" guardado correctamente`);
        this.isCreating.set(false);
        this.resetCreateState();
        this.loadTemplates();
      },
      error: (err) => {
        this.isSaving.set(false);
        this.toast.error(err.error?.message || 'Error al guardar el template');
      }
    });
  }

  // ========== Delete ==========

  confirmDelete(tpl: MappingTemplate): void {
    this.templateToDelete.set(tpl);
  }

  deleteTemplate(): void {
    const tpl = this.templateToDelete();
    if (!tpl) return;

    this.importService.deleteMappingTemplate(tpl.id).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.templateToDelete.set(null);
        this.toast.success(`Template "${tpl.name}" eliminado`);
        this.loadTemplates();
      },
      error: (err) => {
        console.error('Error deleting template:', err);
        this.toast.error('Error al eliminar el template');
        this.templateToDelete.set(null);
      }
    });
  }

  // ========== Helpers ==========

  formatDate(dateStr: string): string {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-PE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

}
