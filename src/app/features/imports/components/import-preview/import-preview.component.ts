/**
 * Import Preview Component
 * PARIDAD: Rails admin/imports/validated_import_user.html.erb
 * Paso 2: Resultados de validación del CSV
 * Features: Paginación real, filtro por error, chip de errores, edición/eliminación inline
 */
import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, interval, switchMap, takeWhile, debounceTime, distinctUntilChanged } from 'rxjs';
import { ImportService, Import, ImportStatus, TempImportUser, UnmatchedColumn } from '../../../../core/services/import.service';
import { ToastService } from '../../../../core/services/toast.service';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-import-preview',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FormsModule,
    LoadingSpinnerComponent,
    PaginationComponent,
    ConfirmDialogComponent
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
      } @else if (importData()?.status === 'status_valid' && invalidCount() === 0) {
        <div class="status-banner status-banner-success">
          <i class="ph ph-check-circle"></i>
          <div>
            <strong>Archivo válido</strong>
            <p>Se encontraron <strong>{{ validCount() }}</strong> registros listos para importar.</p>
            <label class="checkbox-label">
              <input type="checkbox" [(ngModel)]="sendInvitationEmail" />
              <span>Enviar correo de invitación a los usuarios nuevos</span>
            </label>
          </div>
        </div>
      } @else if (importData()?.status === 'status_valid' && invalidCount() > 0) {
        <div class="status-banner status-banner-warning">
          <i class="ph ph-warning"></i>
          <div>
            <strong>{{ validCount() }} registros válidos, {{ invalidCount() }} con errores</strong>
            <p>Resuelva los errores editando o eliminando los registros antes de procesar.</p>
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

      <!-- Filter Tabs + Table -->
      @if (!isLoading() && (tempUsers().length > 0 || errorFilter() !== 'all' || searchQuery())) {
        <!-- Filter Tabs + Search -->
        <div class="toolbar">
          <div class="filter-tabs">
            <button class="filter-tab" [class.active]="errorFilter() === 'all'" (click)="setFilter('all')">
              Todos ({{ validCount() + invalidCount() }})
            </button>
            <button class="filter-tab" [class.active]="errorFilter() === 'valid'" (click)="setFilter('valid')">
              Válidos ({{ validCount() }})
            </button>
            <button class="filter-tab" [class.active]="errorFilter() === 'errors'" (click)="setFilter('errors')">
              @if (invalidCount() > 0) {
                <span class="error-chip">Errores ({{ invalidCount() }})</span>
              } @else {
                Errores (0)
              }
            </button>
          </div>
          <div class="search-box">
            <i class="ph ph-magnifying-glass search-icon"></i>
            <input type="text"
              class="search-input"
              placeholder="Buscar por nombre, teléfono, email..."
              [ngModel]="searchQuery()"
              (ngModelChange)="onSearchInput($event)" />
            @if (searchQuery()) {
              <button class="search-clear" (click)="clearSearch()">
                <i class="ph ph-x"></i>
              </button>
            }
          </div>
        </div>

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
                <th>
                  @if (invalidCount() > 0) {
                    <span class="error-count-chip">ERROR ({{ invalidCount() }})</span>
                  } @else {
                    Error
                  }
                </th>
                <th class="col-actions">Acciones</th>
              </tr>
            </thead>
            <tbody>
              @for (user of tempUsers(); track user.id) {
                <tr [class.row-error]="user.errorMessage" [class.row-editing]="editingUserId() === user.id">
                  <!-- Codigo -->
                  <td>
                    @if (editingUserId() === user.id) {
                      <input class="inline-input" [(ngModel)]="editForm.codigo" />
                    } @else {
                      {{ user.codigo }}
                    }
                  </td>
                  <!-- Apellido -->
                  <td>
                    @if (editingUserId() === user.id) {
                      <input class="inline-input" [(ngModel)]="editForm.lastName" />
                    } @else {
                      {{ user.lastName }}
                    }
                  </td>
                  <!-- Nombres -->
                  <td>
                    @if (editingUserId() === user.id) {
                      <input class="inline-input" [(ngModel)]="editForm.firstName" />
                    } @else {
                      {{ user.firstName }}
                    }
                  </td>
                  <!-- Teléfono -->
                  <td>
                    @if (editingUserId() === user.id) {
                      <input class="inline-input" [(ngModel)]="editForm.phone" />
                    } @else {
                      {{ user.phone }}
                    }
                  </td>
                  <!-- Cód. País -->
                  <td>
                    @if (editingUserId() === user.id) {
                      <input class="inline-input inline-input-sm" [(ngModel)]="editForm.phoneCode" />
                    } @else {
                      {{ user.phoneCode }}
                    }
                  </td>
                  <!-- Email -->
                  <td>
                    @if (editingUserId() === user.id) {
                      <input class="inline-input" [(ngModel)]="editForm.email" />
                    } @else {
                      {{ user.email }}
                    }
                  </td>
                  <!-- Rol -->
                  <td>
                    @if (editingUserId() === user.id) {
                      <input class="inline-input inline-input-sm" [(ngModel)]="editForm.role" />
                    } @else {
                      {{ user.role }}
                    }
                  </td>
                  <!-- Ejecutivo -->
                  <td>
                    @if (editingUserId() === user.id) {
                      <input class="inline-input" [(ngModel)]="editForm.managerEmail" />
                    } @else {
                      {{ user.managerEmail }}
                    }
                  </td>
                  <!-- CRM -->
                  <td class="text-subtle">{{ formatCrmFields(user.crmFields) }}</td>
                  <!-- Error -->
                  <td class="error-cell">{{ user.errorMessage }}</td>
                  <!-- Actions -->
                  <td class="col-actions">
                    @if (editingUserId() === user.id) {
                      <div class="row-actions">
                        <button class="action-btn action-btn-success" (click)="saveEdit(user.id)" title="Guardar"
                          [disabled]="isSavingEdit()">
                          <i class="ph ph-check"></i>
                        </button>
                        <button class="action-btn" (click)="cancelEdit()" title="Cancelar">
                          <i class="ph ph-x"></i>
                        </button>
                      </div>
                    } @else if (user.errorMessage) {
                      <div class="row-actions">
                        <button class="action-btn" (click)="startEdit(user)" title="Editar">
                          <i class="ph ph-pencil-simple"></i>
                        </button>
                        <button class="action-btn action-btn-danger" (click)="confirmDeleteUser(user.id)" title="Eliminar">
                          <i class="ph ph-trash"></i>
                        </button>
                      </div>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>

          <!-- Pagination Footer -->
          @if (totalElements() > 0) {
            <div class="table-footer">
              <span class="records-info">
                Mostrando {{ startRecord() }}-{{ endRecord() }} de {{ totalElements() }}
              </span>
              <app-pagination
                [currentPage]="currentPage()"
                [totalItems]="totalElements()"
                [pageSize]="pageSize()"
                [pageSizeOptions]="[25, 50, 100]"
                (pageChange)="onPageChange($event)"
                (pageSizeChange)="onPageSizeChange($event)"
              />
            </div>
          }
        </div>
      }

      <!-- Actions -->
      <div class="form-actions">
        @if (importData()?.status === 'status_valid') {
          <a routerLink="/app/imports/new" [queryParams]="{import_type: 'users'}" class="btn-ghost">Cancelar</a>
          <button type="button" class="btn-primary" (click)="confirmImport()"
            [disabled]="isProcessing() || unmatchedColumns().length > 0 || invalidCount() > 0">
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

      <!-- Delete Confirmation Dialog -->
      @if (userToDelete() !== null) {
        <app-confirm-dialog
          [isOpen]="true"
          title="Eliminar Registro"
          message="¿Está seguro de eliminar este registro? Esta acción no se puede deshacer."
          type="danger"
          confirmLabel="Eliminar"
          [isLoading]="isDeletingUser()"
          (confirmed)="deleteUser()"
          (cancelled)="userToDelete.set(null)"
        />
      }
    </div>
  `,
  styles: [`
    .imports-page {
      padding: var(--space-6);
      max-width: 1400px;
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
    .unmatched-section { flex: 1; }

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

    /* Toolbar: tabs + search */
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: var(--space-4);
      margin-bottom: var(--space-3);
    }

    /* Filter Tabs */
    .filter-tabs {
      display: flex;
      gap: var(--space-1);
      border-bottom: 2px solid var(--border-default);
    }

    .filter-tab {
      padding: var(--space-2) var(--space-4);
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      margin-bottom: -2px;
      font-size: var(--text-sm);
      font-weight: var(--font-medium);
      color: var(--fg-muted);
      cursor: pointer;
      transition: all var(--duration-fast);

      &:hover { color: var(--fg-default); }

      &.active {
        color: var(--accent-default);
        border-bottom-color: var(--accent-default);
      }
    }

    /* Search Box */
    .search-box {
      position: relative;
      flex-shrink: 0;
    }

    .search-icon {
      position: absolute;
      left: 10px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--fg-subtle);
      font-size: 16px;
      pointer-events: none;
    }

    .search-input {
      padding: var(--space-2) var(--space-3) var(--space-2) 32px;
      width: 280px;
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      font-size: var(--text-sm);
      background: var(--input-bg);
      color: var(--fg-default);
      transition: border-color var(--duration-fast);

      &::placeholder { color: var(--fg-subtle); }
      &:focus {
        outline: none;
        border-color: var(--accent-default);
        box-shadow: 0 0 0 2px var(--accent-subtle, rgba(59, 130, 246, 0.15));
      }
    }

    .search-clear {
      position: absolute;
      right: 6px;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      border: none;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--fg-muted);
      cursor: pointer;

      &:hover { background: var(--bg-muted); color: var(--fg-default); }
      i { font-size: 14px; }
    }

    .error-chip {
      background: var(--error-default);
      color: #fff;
      padding: 1px 8px;
      border-radius: 12px;
      font-size: var(--text-xs);
      font-weight: var(--font-semibold);
    }

    .error-count-chip {
      background: var(--error-default);
      color: #fff;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: var(--text-xs);
      font-weight: var(--font-semibold);
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

    .row-editing {
      background: var(--info-subtle) !important;
    }

    .error-cell {
      color: var(--error-text);
      font-weight: var(--font-medium);
      font-size: var(--text-xs);
      max-width: 250px;
    }

    .text-subtle { color: var(--fg-subtle); }

    .col-actions {
      width: 90px;
      text-align: center;
    }

    /* Inline Edit Inputs */
    .inline-input {
      width: 100%;
      min-width: 80px;
      padding: var(--space-1) var(--space-2);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      font-size: var(--text-sm);
      background: var(--input-bg);
      color: var(--fg-default);

      &:focus {
        outline: none;
        border-color: var(--accent-default);
        box-shadow: 0 0 0 2px var(--accent-subtle, rgba(59, 130, 246, 0.15));
      }
    }

    .inline-input-sm {
      min-width: 50px;
      max-width: 80px;
    }

    /* Row Actions */
    .row-actions {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-1);
    }

    .action-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border: none;
      border-radius: var(--radius-md);
      background: transparent;
      color: var(--fg-muted);
      cursor: pointer;
      transition: all var(--duration-fast);

      &:hover:not(:disabled) {
        background: var(--bg-muted);
        color: var(--fg-default);
      }

      &:disabled { opacity: 0.5; cursor: not-allowed; }

      i { font-size: 16px; }
    }

    .action-btn-danger:hover:not(:disabled) {
      background: var(--error-subtle);
      color: var(--error-default);
    }

    .action-btn-success:hover:not(:disabled) {
      background: var(--success-subtle);
      color: var(--success-default);
    }

    /* Table Footer */
    .table-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--space-3) var(--space-4);
      border-top: 1px solid var(--table-border);
    }

    .records-info {
      font-size: var(--text-sm);
      color: var(--fg-subtle);
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
      .data-table { min-width: 1100px; }
      .toolbar { flex-direction: column; align-items: stretch; }
      .filter-tabs { overflow-x: auto; }
      .search-input { width: 100%; }
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

  // Pagination
  currentPage = signal(1);
  pageSize = signal(50);
  totalElements = signal(0);
  totalPages = signal(0);

  // Counts
  validCount = signal(0);
  invalidCount = signal(0);

  // Filter
  errorFilter = signal<'all' | 'errors' | 'valid'>('all');

  // Search
  searchQuery = signal('');
  private searchSubject$ = new Subject<string>();

  // Inline editing
  editingUserId = signal<number | null>(null);
  editForm = {
    codigo: '',
    firstName: '',
    lastName: '',
    phone: '',
    phoneCode: '',
    email: '',
    role: '',
    managerEmail: ''
  };
  isSavingEdit = signal(false);

  // Delete
  userToDelete = signal<number | null>(null);
  isDeletingUser = signal(false);

  // State
  isLoading = signal(true);
  isValidating = signal(false);
  isProcessing = signal(false);
  isAcceptingColumns = signal(false);

  // Options
  sendInvitationEmail = false;

  // Computed
  startRecord = computed(() => {
    if (this.totalElements() === 0) return 0;
    return (this.currentPage() - 1) * this.pageSize() + 1;
  });
  endRecord = computed(() => Math.min(this.currentPage() * this.pageSize(), this.totalElements()));

  ngOnInit(): void {
    this.route.params.pipe(
      takeUntil(this.destroy$)
    ).subscribe(params => {
      this.importId = +params['id'];
      this.loadImportData();
    });

    // Debounced search: wait 400ms after last keystroke, then reload
    this.searchSubject$.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(query => {
      this.searchQuery.set(query);
      this.currentPage.set(1);
      this.cancelEdit();
      this.loadTempUsers();
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
          this.loadTempUsers();
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

  /**
   * Load temp users with current pagination and filter settings.
   * Separated from loadImportData() to allow independent reloads.
   */
  loadTempUsers(): void {
    const page = this.currentPage() - 1; // Backend is 0-indexed
    const size = this.pageSize();
    const filter = this.errorFilter();
    const search = this.searchQuery();

    this.importService.getValidatedUsers(this.importId, page, size, filter, search).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (result) => {
        this.tempUsers.set(result.tempUsers || []);
        this.validCount.set(result.validCount ?? 0);
        this.invalidCount.set(result.invalidCount ?? 0);
        this.totalElements.set(result.totalElements ?? 0);
        this.totalPages.set(result.totalPages ?? 0);
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

  pollStatus(): void {
    interval(2000).pipe(
      takeUntil(this.destroy$),
      switchMap(() => this.importService.getStatus(this.importId)),
      takeWhile(status => !this.importService.isComplete(status.status) && status.status !== 'status_valid', true)
    ).subscribe({
      next: (status) => {
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

        if (status.status === 'status_valid' || status.status === 'status_error' || status.status === 'status_completed') {
          this.isValidating.set(false);
          this.loadImportData();
        }
      },
      error: (err) => {
        console.error('Error polling status:', err);
        this.isValidating.set(false);
      }
    });
  }

  // ===== Pagination =====

  onPageChange(page: number): void {
    this.currentPage.set(page);
    this.cancelEdit();
    this.loadTempUsers();
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
    this.cancelEdit();
    this.loadTempUsers();
  }

  // ===== Filter =====

  setFilter(filter: 'all' | 'errors' | 'valid'): void {
    if (this.errorFilter() === filter) return;
    this.errorFilter.set(filter);
    this.currentPage.set(1);
    this.cancelEdit();
    this.loadTempUsers();
  }

  // ===== Search =====

  onSearchInput(value: string): void {
    this.searchSubject$.next(value);
  }

  clearSearch(): void {
    this.searchQuery.set('');
    this.searchSubject$.next('');
    this.currentPage.set(1);
    this.loadTempUsers();
  }

  // ===== Inline Edit =====

  startEdit(user: TempImportUser): void {
    this.editingUserId.set(user.id);
    this.editForm = {
      codigo: user.codigo || '',
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      phone: user.phone || '',
      phoneCode: user.phoneCode || '',
      email: user.email || '',
      role: user.role || '',
      managerEmail: user.managerEmail || ''
    };
  }

  cancelEdit(): void {
    this.editingUserId.set(null);
    this.editForm = { codigo: '', firstName: '', lastName: '', phone: '', phoneCode: '', email: '', role: '', managerEmail: '' };
  }

  saveEdit(userId: number): void {
    this.isSavingEdit.set(true);

    this.importService.updateTempUser(this.importId, userId, this.editForm).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.editingUserId.set(null);
        this.editForm = { codigo: '', firstName: '', lastName: '', phone: '', phoneCode: '', email: '', role: '', managerEmail: '' };
        this.isSavingEdit.set(false);
        // Revalidate entire import to resolve cross-record errors
        this.revalidateAndReload();
      },
      error: (err) => {
        console.error('Error updating temp user:', err);
        this.toast.error('Error al guardar cambios');
        this.isSavingEdit.set(false);
      }
    });
  }

  // ===== Delete =====

  confirmDeleteUser(userId: number): void {
    this.userToDelete.set(userId);
  }

  deleteUser(): void {
    const userId = this.userToDelete();
    if (userId === null) return;

    this.isDeletingUser.set(true);

    this.importService.deleteTempUser(this.importId, userId).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.userToDelete.set(null);
        this.isDeletingUser.set(false);
        this.toast.success('Registro eliminado');
        // Revalidate to resolve cross-record errors
        this.revalidateAndReload();
      },
      error: (err) => {
        console.error('Error deleting temp user:', err);
        this.toast.error('Error al eliminar registro');
        this.isDeletingUser.set(false);
        this.userToDelete.set(null);
      }
    });
  }

  // ===== Revalidation =====

  private revalidateAndReload(): void {
    this.importService.revalidateImport(this.importId).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (result) => {
        this.validCount.set(result.validCount);
        this.invalidCount.set(result.invalidCount);
        this.loadTempUsers();
      },
      error: (err) => {
        console.error('Error revalidating import:', err);
        // Still reload the table even if revalidation fails
        this.loadTempUsers();
      }
    });
  }

  // ===== CRM / Columns =====

  formatCrmFields(crmFields: Record<string, string> | null): string {
    if (!crmFields || typeof crmFields !== 'object') return '';
    return Object.entries(crmFields)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
  }

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

  selectAllColumns(): void {
    this.selectedColumns.set(new Set(this.unmatchedColumns().map(c => c.name)));
  }

  selectNoColumns(): void {
    this.selectedColumns.set(new Set());
  }

  confirmColumnSelection(): void {
    const selected = Array.from(this.selectedColumns());
    this.isAcceptingColumns.set(true);

    if (selected.length === 0) {
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
        this.loadTempUsers();
      },
      error: (err) => {
        console.error('Error accepting columns:', err);
        this.isAcceptingColumns.set(false);
        this.toast.error('Error al aceptar columnas');
      }
    });
  }

  // ===== Process =====

  confirmImport(): void {
    if (this.importData()?.status !== 'status_valid') return;
    if (this.invalidCount() > 0) return;

    this.isProcessing.set(true);

    this.importService.confirmImport(this.importId, this.sendInvitationEmail).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.toast.success('Importación iniciada correctamente');
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
