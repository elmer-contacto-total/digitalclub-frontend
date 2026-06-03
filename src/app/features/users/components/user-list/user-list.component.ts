/**
 * User List Component
 * Lista de usuarios con DataTable server-side y modal de edición
 * PARIDAD: Rails admin/users/index.html.erb
 */
import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { UserService, PaginationParams, UpdateUserRequest } from '../../../../core/services/user.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../core/services/toast.service';
import { UserListItem, UserRole, UserStatus, RoleUtils, getFullName, UserOption } from '../../../../core/models/user.model';

import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { environment } from '../../../../../environments/environment';
import { splitPhone, joinPhone, DEFAULT_COUNTRY_CODE } from '../../../../core/utils/phone.util';
import { SortHeaderDirective } from '../../../../shared/directives/sort-header.directive';
import { SortState, toggleSort, sortRows } from '../../../../core/utils/table-sort';

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,}$/;

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FormsModule,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    ConfirmDialogComponent,
    SortHeaderDirective
  ],
  template: `
    <div class="user-list-container">
      <!-- Page Header -->
      <div class="page-header">
        <div class="header-content">
          <h1>Lista de usuarios</h1>
          <p class="subtitle">Gestión de todos los usuarios del sistema</p>
        </div>
        @if (canCreateUsers()) {
          <div class="header-actions">
            <a routerLink="new" class="btn btn-primary">
              <i class="ph ph-plus"></i>
              Crear usuario
            </a>
            <a routerLink="/app/imports/new" [queryParams]="{ import_type: 'users' }" class="btn btn-secondary">
              <i class="ph ph-upload-simple"></i>
              Importar
            </a>
          </div>
        }
      </div>

      <!-- Table Container -->
      <div class="table-container">
        <!-- DataTable Header -->
        <div class="datatable-header">
          <div class="records-summary">
            {{ totalRecords() }} usuario(s) encontrado(s)
          </div>
          <div class="search-wrapper">
            <label>Buscar:</label>
            <input
              type="text"
              class="form-control search-input"
              [ngModel]="searchTerm()"
              (ngModelChange)="onSearchChange($event)"
              placeholder="Nombre, email, teléfono..."
            />
          </div>
        </div>

        <!-- Table -->
        <div class="table-responsive">
          @if (isLoading() && users().length === 0) {
            <div class="loading-container">
              <div class="spinner"></div>
              <span>Cargando usuarios...</span>
            </div>
          } @else if (users().length === 0) {
            <div class="empty-container">
              <i class="ph ph-users"></i>
              <p>{{ searchTerm() ? 'No se encontraron usuarios' : 'No hay usuarios registrados' }}</p>
              @if (canCreateUsers() && !searchTerm()) {
                <a routerLink="new" class="btn btn-primary">
                  Crear primer usuario
                </a>
              }
            </div>
          } @else {
            <table class="table table-striped table-bordered table-hover">
              <thead>
                <tr>
                  <th [appSort]="'name'" [appSortState]="sort()" (appSortChange)="onSort($event)">Nombre</th>
                  <th [appSort]="'email'" [appSortState]="sort()" (appSortChange)="onSort($event)">Email</th>
                  <th class="hide-mobile" [appSort]="'phone'" [appSortState]="sort()" (appSortChange)="onSort($event)">Teléfono</th>
                  <th [appSort]="'role'" [appSortState]="sort()" (appSortChange)="onSort($event)">Rol</th>
                  <th class="hide-mobile" [appSort]="'manager'" [appSortState]="sort()" (appSortChange)="onSort($event)">Manager</th>
                  <th [appSort]="'status'" [appSortState]="sort()" (appSortChange)="onSort($event)">Estado</th>
                  <th class="col-actions"></th>
                </tr>
              </thead>
              <tbody>
                @for (user of sortedUsers(); track user.id) {
                  <tr>
                    <td class="col-name">
                      <div class="user-name">
                        <div class="avatar">
                          @if (user.avatarData) {
                            <img [src]="user.avatarData" alt="" />
                          } @else {
                            {{ getInitials(user) }}
                          }
                        </div>
                        <span>{{ getFullName(user) }}</span>
                      </div>
                    </td>
                    <td class="col-email">{{ user.email || '-' }}</td>
                    <td class="hide-mobile">{{ user.phone || '-' }}</td>
                    <td>
                      <span class="role-badge">
                        {{ user.friendlyRole || getRoleDisplayName(user.role) }}
                      </span>
                    </td>
                    <td class="hide-mobile">{{ user.managerName || '-' }}</td>
                    <td>
                      <span
                        class="status-badge"
                        [class.active]="user.status === UserStatus.ACTIVE"
                        [class.inactive]="user.status === UserStatus.INACTIVE"
                        [class.pending]="user.status === UserStatus.PENDING"
                      >
                        {{ getStatusDisplayName(user.status) }}
                      </span>
                    </td>
                    <td class="col-actions">
                      <div class="action-buttons">
                        <a
                          [routerLink]="[user.id]"
                          class="action-btn"
                          title="Ver detalles"
                        >
                          <i class="ph ph-eye"></i>
                        </a>
                        @if (canEditUser(user)) {
                          <button
                            class="action-btn"
                            (click)="openEditModal(user)"
                            title="Editar"
                          >
                            <i class="ph ph-pencil-simple"></i>
                          </button>
                        }
                        @if (canDeleteUser(user)) {
                          <button
                            class="action-btn danger"
                            (click)="confirmDelete(user)"
                            title="Desactivar"
                          >
                            <i class="ph ph-user-minus"></i>
                          </button>
                        }
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>

        <!-- Pagination Footer -->
        @if (users().length > 0) {
          <div class="datatable-footer">
            <div class="info">
              Mostrando {{ startRecord() }} a {{ endRecord() }} de {{ totalRecords() }} registros
            </div>
            <div class="pagination-controls">
              <button
                class="btn btn-sm"
                [disabled]="currentPage() === 1 || isLoading()"
                (click)="onPageChange(1)"
              >
                <i class="ph ph-caret-double-left"></i>
              </button>
              <button
                class="btn btn-sm"
                [disabled]="currentPage() === 1 || isLoading()"
                (click)="onPageChange(currentPage() - 1)"
              >
                <i class="ph ph-caret-left"></i>
              </button>
              <span class="page-info">{{ currentPage() }} / {{ totalPages() }}</span>
              <button
                class="btn btn-sm"
                [disabled]="currentPage() >= totalPages() || isLoading()"
                (click)="onPageChange(currentPage() + 1)"
              >
                <i class="ph ph-caret-right"></i>
              </button>
              <button
                class="btn btn-sm"
                [disabled]="currentPage() >= totalPages() || isLoading()"
                (click)="onPageChange(totalPages())"
              >
                <i class="ph ph-caret-double-right"></i>
              </button>
              <select
                class="page-size-select"
                [ngModel]="pageSize()"
                (ngModelChange)="onPageSizeChange($event)"
              >
                <option [value]="10">10</option>
                <option [value]="25">25</option>
                <option [value]="50">50</option>
                <option [value]="100">100</option>
              </select>
            </div>
          </div>
        }
      </div>

      <!-- Delete Confirmation Dialog -->
      @if (userToDelete()) {
        <app-confirm-dialog
          [isOpen]="true"
          title="Desactivar Usuario"
          [message]="'¿Estás seguro de desactivar a ' + getFullName(userToDelete()!) + '? El usuario no podrá iniciar sesión.'"
          type="danger"
          confirmLabel="Desactivar"
          (confirmed)="deleteUser()"
          (cancelled)="userToDelete.set(null)"
        />
      }

      <!-- Edit User Modal -->
      @if (editingUser()) {
        <div class="modal-backdrop" (click)="closeEditModal()"></div>
        <div class="modal-container">
          <div class="modal-content">
            <div class="modal-header">
              <h2>Editar Usuario</h2>
              <button class="close-btn" (click)="closeEditModal()">
                <i class="ph ph-x"></i>
              </button>
            </div>

            <div class="modal-body">
              @if (isLoadingEdit()) {
                <div class="loading-container">
                  <div class="spinner"></div>
                  <span>Cargando...</span>
                </div>
              } @else {
                <!-- Personal Info -->
                <div class="form-section">
                  <h3>Información Personal</h3>

                  <!-- Avatar Upload -->
                  <div class="avatar-upload-row">
                    <div class="avatar-preview" (click)="avatarInput.click()">
                      @if (avatarPreview()) {
                        <img [src]="avatarPreview()" alt="Avatar" />
                      } @else if (existingAvatarUrl()) {
                        <img [src]="existingAvatarUrl()" alt="Avatar" />
                      } @else {
                        <i class="ph ph-user"></i>
                      }
                    </div>
                    <div class="avatar-actions">
                      <button type="button" class="btn btn-secondary btn-sm" (click)="avatarInput.click()">
                        <i class="ph ph-camera"></i>
                        {{ existingAvatarUrl() || avatarPreview() ? 'Cambiar foto' : 'Subir foto' }}
                      </button>
                      @if (avatarPreview()) {
                        <button type="button" class="btn-link" (click)="removeAvatar()">Quitar</button>
                      }
                      <span class="field-hint">JPG, PNG, GIF o WebP. Máximo 5MB.</span>
                    </div>
                    <input
                      #avatarInput
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      style="display: none"
                      (change)="onAvatarSelected($event)"
                    />
                  </div>

                  <div class="form-row">
                    <div class="form-group">
                      <label>Nombre <span class="required">*</span></label>
                      <input
                        type="text"
                        [(ngModel)]="editForm.firstName"
                        placeholder="Nombre"
                      />
                    </div>
                    <div class="form-group">
                      <label>Apellido <span class="required">*</span></label>
                      <input
                        type="text"
                        [(ngModel)]="editForm.lastName"
                        placeholder="Apellido"
                      />
                    </div>
                  </div>
                  <div class="form-row">
                    <div class="form-group">
                      <label>Email <span class="required">*</span></label>
                      <input
                        type="email"
                        [(ngModel)]="editForm.email"
                        placeholder="correo@ejemplo.com"
                      />
                    </div>
                    <div class="form-group">
                      <label>Teléfono</label>
                      <div class="phone-input-row">
                        <input
                          type="text"
                          [(ngModel)]="editForm.phoneCountryCode"
                          class="phone-code-input"
                          placeholder="51"
                        />
                        <input
                          type="tel"
                          [(ngModel)]="editForm.phone"
                          placeholder="999 999 999"
                        />
                      </div>
                    </div>
                  </div>
                  <div class="form-row">
                    <div class="form-group full-width">
                      <label>Nombre en archivo de importación</label>
                      <input
                        type="text"
                        [(ngModel)]="editForm.importString"
                        placeholder="Nombre usado para identificar al usuario en importaciones"
                      />
                      <span class="field-hint">Este nombre se usa para hacer match durante la importación de datos</span>
                    </div>
                  </div>
                </div>

                <!-- Role Section -->
                <div class="form-section">
                  <h3>Rol y Permisos</h3>
                  <div class="form-row">
                    <div class="form-group">
                      <label>Rol <span class="required">*</span></label>
                      <select [(ngModel)]="editForm.role" (ngModelChange)="onEditRoleChange()">
                        @for (role of availableRoles(); track role.value) {
                          <option [ngValue]="role.value">{{ role.label }}</option>
                        }
                      </select>
                    </div>
                    <div class="form-group">
                      <label>Manager/Agente</label>
                      <select [(ngModel)]="editForm.managerId">
                        <option [ngValue]="null">Sin asignar</option>
                        @for (manager of availableManagers(); track manager.id) {
                          <option [ngValue]="manager.id">{{ manager.name }}</option>
                        }
                      </select>
                    </div>
                  </div>
                  <div class="form-row">
                    <div class="form-group">
                      <label>Estado</label>
                      <select [(ngModel)]="editForm.status">
                        <option [ngValue]="0">Activo</option>
                        <option [ngValue]="1">Inactivo</option>
                        <option [ngValue]="2">Pendiente</option>
                      </select>
                    </div>
                  </div>
                </div>

                <!-- Error Message -->
                @if (editError()) {
                  <div class="error-alert">
                    <i class="ph ph-warning-circle"></i>
                    {{ editError() }}
                  </div>
                }
              }
            </div>

            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="closeEditModal()">
                Cancelar
              </button>
              <button
                class="btn btn-primary"
                (click)="saveUser()"
                [disabled]="isSaving() || !isEditFormValid()"
              >
                @if (isSaving()) {
                  <i class="ph ph-spinner ph-spin"></i>
                  Guardando...
                } @else {
                  <i class="ph ph-check"></i>
                  Guardar
                }
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .user-list-container {
      height: 100%;
      display: flex;
      flex-direction: column;
      background: var(--bg-base);
      color: var(--fg-default);
    }

    /* Page Header */
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      padding: 24px 24px 0;
    }

    h1 {
      margin: 0 0 4px 0;
      font-size: 24px;
      font-weight: 600;
      color: var(--fg-default);
    }

    .subtitle {
      margin: 0;
      color: var(--fg-muted);
      font-size: 14px;
    }

    .header-actions {
      display: flex;
      gap: 8px;
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      border: 1px solid transparent;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.15s ease;

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }

    .btn-primary {
      background: var(--accent-default);
      border-color: var(--accent-default);
      color: white;

      &:hover:not(:disabled) {
        background: var(--accent-emphasis);
        border-color: var(--accent-emphasis);
      }
    }

    .btn-secondary {
      background: var(--card-bg);
      border-color: var(--border-default);
      color: var(--fg-default);

      &:hover:not(:disabled) {
        background: var(--bg-subtle);
      }
    }

    .btn-sm {
      padding: 6px 10px;
      font-size: 13px;
    }

    /* Table Container */
    .table-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      margin: 16px 24px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      overflow: hidden;
    }

    /* DataTable Header */
    .datatable-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-default);
      gap: 16px;
      flex-wrap: wrap;
    }

    .records-summary {
      font-size: 13px;
      color: var(--fg-muted);
    }

    .search-wrapper {
      display: flex;
      align-items: center;
      gap: 8px;

      label {
        font-size: 14px;
        color: var(--fg-muted);
        white-space: nowrap;
      }
    }

    .search-input {
      width: 220px;
      padding: 8px 12px;
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      border-radius: 6px;
      font-size: 14px;
      color: var(--fg-default);
      transition: border-color 0.15s, box-shadow 0.15s;

      &:focus {
        outline: none;
        border-color: var(--input-border-focus);
        box-shadow: 0 0 0 3px var(--accent-subtle);
      }

      &::placeholder {
        color: var(--fg-subtle);
      }
    }

    /* Table */
    .table-responsive {
      flex: 1;
      overflow: auto;
    }

    .table {
      width: 100%;
      margin: 0;
      border-collapse: collapse;
      font-size: 14px;
    }

    .table th,
    .table td {
      padding: 12px 16px;
      border-bottom: 1px solid var(--table-border);
      vertical-align: middle;
      text-align: left;
    }

    .table thead th {
      background: var(--table-header-bg);
      font-weight: 600;
      color: var(--fg-muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      white-space: nowrap;
      border-bottom: 2px solid var(--border-default);
    }

    .table tbody tr {
      transition: background 0.15s;

      &:hover {
        background: var(--table-row-hover);
      }
    }

    /* User Name Cell */
    .col-name {
      min-width: 180px;
    }

    .user-name {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: var(--accent-default);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 600;
      flex-shrink: 0;
      overflow: hidden;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    }

    .col-email {
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Badges */
    .role-badge {
      display: inline-block;
      padding: 4px 8px;
      background: var(--bg-muted);
      color: var(--fg-muted);
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
    }

    .status-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 500;

      &.active {
        background: var(--success-subtle);
        color: var(--success-text);
      }

      &.inactive {
        background: var(--error-subtle);
        color: var(--error-text);
      }

      &.pending {
        background: var(--warning-subtle);
        color: var(--warning-text);
      }
    }

    /* Actions Column */
    .col-actions {
      width: 120px;
      text-align: center;
    }

    .action-buttons {
      display: flex;
      gap: 4px;
      justify-content: center;
    }

    .action-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--fg-muted);
      cursor: pointer;
      text-decoration: none;
      transition: all 0.15s;

      &:hover {
        background: var(--bg-subtle);
        color: var(--accent-default);
      }

      &.danger:hover {
        background: var(--error-subtle);
        color: var(--error-default);
      }

      i {
        font-size: 18px;
      }
    }

    /* Loading & Empty States */
    .loading-container,
    .empty-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 24px;
      color: var(--fg-muted);
      gap: 12px;
    }

    .empty-container i {
      font-size: 48px;
      opacity: 0.5;
    }

    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--border-default);
      border-top-color: var(--accent-default);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Pagination Footer */
    .datatable-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-top: 1px solid var(--border-default);
      background: var(--table-header-bg);
      font-size: 13px;
      flex-wrap: wrap;
      gap: 12px;
    }

    .info {
      color: var(--fg-muted);
    }

    .pagination-controls {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .page-info {
      padding: 0 12px;
      color: var(--fg-muted);
      font-weight: 500;
    }

    .page-size-select {
      margin-left: 8px;
      padding: 6px 8px;
      border: 1px solid var(--input-border);
      border-radius: 4px;
      font-size: 13px;
      background: var(--input-bg);
      color: var(--fg-default);
      cursor: pointer;
    }

    /* ===== MODAL STYLES ===== */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: var(--z-modal-backdrop);
    }

    .modal-container {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: var(--z-modal);
      width: 100%;
      max-width: 600px;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
    }

    .modal-content {
      background: var(--card-bg);
      border-radius: 12px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      display: flex;
      flex-direction: column;
      max-height: 90vh;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 24px;
      border-bottom: 1px solid var(--border-default);

      h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: var(--fg-default);
      }
    }

    .close-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--fg-muted);
      cursor: pointer;

      &:hover {
        background: var(--bg-subtle);
        color: var(--fg-default);
      }

      i {
        font-size: 20px;
      }
    }

    .modal-body {
      flex: 1;
      padding: 24px;
      overflow-y: auto;
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      padding: 16px 24px;
      border-top: 1px solid var(--border-default);
    }

    /* Form Styles */
    .form-section {
      margin-bottom: 24px;

      &:last-child {
        margin-bottom: 0;
      }

      h3 {
        margin: 0 0 16px 0;
        font-size: 14px;
        font-weight: 600;
        color: var(--fg-default);
        padding-bottom: 8px;
        border-bottom: 1px solid var(--border-default);
      }
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;

      @media (max-width: 500px) {
        grid-template-columns: 1fr;
      }
    }

    .form-group {
      margin-bottom: 16px;

      &.full-width {
        grid-column: 1 / -1;
      }

      label {
        display: block;
        margin-bottom: 6px;
        font-size: 13px;
        font-weight: 500;
        color: var(--fg-default);

        .required {
          color: var(--error-default);
        }
      }

      input, select {
        width: 100%;
        padding: 10px 12px;
        background: var(--input-bg);
        border: 1px solid var(--input-border);
        border-radius: 6px;
        font-size: 14px;
        color: var(--fg-default);
        transition: border-color 0.15s;

        &:focus {
          outline: none;
          border-color: var(--input-border-focus);
          box-shadow: 0 0 0 3px var(--accent-subtle);
        }

        &::placeholder {
          color: var(--fg-subtle);
        }

        &.readonly {
          background: var(--input-bg-readonly);
          color: var(--fg-muted);
          cursor: not-allowed;
        }
      }

      select {
        cursor: pointer;
      }

      .field-hint {
        display: block;
        margin-top: 6px;
        font-size: 12px;
        color: var(--fg-subtle);
      }
    }

    /* Phone (código país + número) */
    .phone-input-row {
      display: flex;
      gap: 8px;

      .phone-code-input {
        width: 64px;
        flex-shrink: 0;
      }
    }

    /* Avatar upload (mismos campos que el formulario completo) */
    .avatar-upload-row {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 20px;
    }

    .avatar-preview {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: var(--bg-subtle);
      border: 2px dashed var(--border-default);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      overflow: hidden;
      flex-shrink: 0;
      transition: border-color 0.2s;

      &:hover { border-color: var(--accent-default); }

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      i {
        font-size: 28px;
        color: var(--fg-subtle);
      }
    }

    .avatar-actions {
      display: flex;
      flex-direction: column;
      gap: 6px;

      .btn-sm {
        padding: 6px 14px;
        font-size: 13px;
      }

      .btn-link {
        background: none;
        border: none;
        color: var(--error-default);
        cursor: pointer;
        font-size: 13px;
        padding: 0;
        text-align: left;

        &:hover { text-decoration: underline; }
      }
    }

    .error-alert {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      background: var(--error-subtle);
      border-radius: 6px;
      color: var(--error-text);
      font-size: 14px;

      i {
        font-size: 18px;
      }
    }

    .ph-spin {
      animation: spin 1s linear infinite;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .page-header {
        padding: 12px 16px;
      }

      .header-row {
        flex-direction: column;
        align-items: flex-start;
      }

      .header-actions {
        width: 100%;
      }

      .header-actions .btn {
        flex: 1;
      }

      .btn-text {
        display: none;
      }

      .table-container {
        margin: 12px;
      }

      .datatable-header {
        flex-direction: column;
        align-items: stretch;
      }

      .search-wrapper {
        width: 100%;
      }

      .search-input {
        width: 100%;
      }

      .hide-mobile {
        display: none;
      }

      .col-email {
        max-width: 120px;
      }

      .datatable-footer {
        flex-direction: column;
        text-align: center;
      }

      .modal-container {
        max-width: calc(100% - 32px);
      }
    }
  `]
})
export class UserListComponent implements OnInit, OnDestroy {
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);
  private destroy$ = new Subject<void>();

  // Expose enum to template
  UserStatus = UserStatus;

  // Data
  users = signal<UserListItem[]>([]);
  totalRecords = signal(0);
  isLoading = signal(false);
  userToDelete = signal<UserListItem | null>(null);

  // Orden client-side de la página visible
  sort = signal<SortState>({ column: null, dir: 'asc' });
  sortedUsers = computed(() => sortRows(this.users(), this.sort(), (u: UserListItem, col: string) => {
    switch (col) {
      case 'name': return getFullName(u);
      case 'role': return u.friendlyRole || RoleUtils.getDisplayName(u.role);
      case 'manager': return u.managerName;
      default: return (u as unknown as Record<string, unknown>)[col];
    }
  }));
  onSort(column: string): void {
    this.sort.set(toggleSort(this.sort(), column));
  }

  // Filters
  searchTerm = signal('');

  // Pagination
  currentPage = signal(1);
  pageSize = signal(25);
  totalPages = computed(() => Math.ceil(this.totalRecords() / this.pageSize()) || 1);

  // Computed
  startRecord = computed(() => {
    if (this.totalRecords() === 0) return 0;
    return (this.currentPage() - 1) * this.pageSize() + 1;
  });
  endRecord = computed(() => Math.min(this.currentPage() * this.pageSize(), this.totalRecords()));

  // Current user
  currentUser = this.authService.currentUser;

  // Edit Modal State
  editingUser = signal<UserListItem | null>(null);
  isLoadingEdit = signal(false);
  isSaving = signal(false);
  editError = signal('');
  availableManagers = signal<UserOption[]>([]);

  // Avatar (mismos campos que el formulario completo de edición)
  avatarFile = signal<File | null>(null);
  avatarPreview = signal<string | null>(null);
  existingAvatarUrl = signal<string | null>(null);

  // Edit form data
  editForm = {
    firstName: '',
    lastName: '',
    email: '',
    phoneCountryCode: DEFAULT_COUNTRY_CODE,
    phone: '',
    importString: '',
    role: 0 as UserRole,
    managerId: null as number | null,
    status: 0 as UserStatus
  };

  // Available roles based on current user
  availableRoles = computed(() => {
    const user = this.currentUser();
    if (!user) return [];

    const allRoles = [
      UserRole.STANDARD,
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.MANAGER_LEVEL_1,
      UserRole.MANAGER_LEVEL_2,
      UserRole.MANAGER_LEVEL_3,
      UserRole.MANAGER_LEVEL_4,
      UserRole.AGENT,
      UserRole.STAFF,
      UserRole.WHATSAPP_BUSINESS
    ].map(value => ({ value, label: RoleUtils.getDisplayName(value) }));

    let filtered: { value: UserRole; label: string }[];
    if (user.role === UserRole.SUPER_ADMIN) {
      filtered = allRoles;
    } else if (user.role === UserRole.ADMIN) {
      filtered = allRoles.filter(r => r.value !== UserRole.SUPER_ADMIN);
    } else if (user.role === UserRole.STAFF) {
      filtered = allRoles.filter(r =>
        r.value === UserRole.STANDARD ||
        r.value === UserRole.AGENT ||
        r.value === UserRole.WHATSAPP_BUSINESS
      );
    } else if (user.role === UserRole.MANAGER_LEVEL_4) {
      // Supervisor: solo puede asignar Agente o Cliente (STANDARD)
      filtered = allRoles.filter(r =>
        r.value === UserRole.AGENT ||
        r.value === UserRole.STANDARD
      );
    } else if (RoleUtils.isManager(user.role)) {
      // ML1/ML2/ML3 (managers de gerencia, no Supervisor)
      filtered = allRoles.filter(r =>
        r.value === UserRole.STANDARD ||
        r.value === UserRole.WHATSAPP_BUSINESS
      );
    } else {
      filtered = [];
    }

    // Tenant infinance: limitar a Administrador, Manager (=ML4) y Agente.
    // Modal de edición: preservar el rol actual del user editado si está fuera del set.
    if (environment.simplifiedRoles) {
      const allowed = new Set<UserRole>([
        UserRole.ADMIN,
        UserRole.MANAGER_LEVEL_4,
        UserRole.AGENT
      ]);
      filtered = filtered.filter(r => allowed.has(r.value));

      const currentRole = this.editingUser()?.role;
      if (currentRole != null &&
          !allowed.has(currentRole) &&
          !filtered.some(r => r.value === currentRole)) {
        filtered = [
          ...filtered,
          { value: currentRole, label: RoleUtils.getDisplayName(currentRole) }
        ];
      }
    }

    return filtered;
  });

  private searchTimeout: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.loadUsers();
  }

  ngOnDestroy(): void {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadUsers(): void {
    this.isLoading.set(true);

    const params: PaginationParams = {
      page: this.currentPage(),
      pageSize: this.pageSize(),
      search: this.searchTerm() || undefined
    };

    this.userService.getUsers(params).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        this.users.set(response.data);
        this.totalRecords.set(response.meta.totalItems);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading users:', err);
        this.toast.error('Error al cargar usuarios');
        this.isLoading.set(false);
      }
    });
  }

  onSearchChange(term: string): void {
    this.searchTerm.set(term);
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
    this.searchTimeout = setTimeout(() => {
      this.currentPage.set(1);
      this.loadUsers();
    }, 300);
  }

  onPageChange(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    this.loadUsers();
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(Number(size));
    this.currentPage.set(1);
    this.loadUsers();
  }

  canCreateUsers(): boolean {
    const user = this.currentUser();
    if (!user) return false;
    return RoleUtils.canManageUsers(user.role);
  }

  canEditUser(user: UserListItem): boolean {
    const current = this.currentUser();
    if (!current) return false;

    if (current.role === UserRole.SUPER_ADMIN) return true;
    if (current.role === UserRole.ADMIN) return true;
    if (current.role === UserRole.STAFF) return true;

    if (RoleUtils.isManager(current.role)) {
      return user.managerId === current.id;
    }

    return false;
  }

  canDeleteUser(user: UserListItem): boolean {
    const current = this.currentUser();
    if (!current) return false;

    if (user.id === current.id) return false;
    if (current.role === UserRole.SUPER_ADMIN) return true;

    if (current.role === UserRole.ADMIN) {
      return user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN;
    }

    return false;
  }

  confirmDelete(user: UserListItem): void {
    this.userToDelete.set(user);
  }

  deleteUser(): void {
    const user = this.userToDelete();
    if (!user) return;

    this.userService.deleteUser(user.id).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.userToDelete.set(null);
        this.toast.success('Usuario eliminado correctamente');
        this.loadUsers();
      },
      error: (err) => {
        console.error('Error deleting user:', err);
        this.toast.error('Error al eliminar usuario');
        this.userToDelete.set(null);
      }
    });
  }

  // ===== Edit Modal Methods =====

  openEditModal(user: UserListItem): void {
    this.editingUser.set(user);
    this.editError.set('');
    this.isLoadingEdit.set(true);
    this.avatarFile.set(null);
    this.avatarPreview.set(null);
    this.existingAvatarUrl.set(user.avatarData || null);

    // Pre-fill form with list data (el teléfono se separa en código + número)
    const listSplit = splitPhone(user.phone);
    this.editForm = {
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      email: user.email || '',
      phoneCountryCode: listSplit.code,
      phone: listSplit.number,
      importString: '',
      role: user.role,
      managerId: user.managerId || null,
      status: user.status
    };

    // Load full user details
    this.userService.getUser(user.id).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        const fullUser = response.user || response;
        const { code, number } = splitPhone(fullUser.phone);
        this.editForm = {
          firstName: fullUser.firstName || '',
          lastName: fullUser.lastName || '',
          email: fullUser.email || '',
          phoneCountryCode: code,
          phone: number,
          importString: (fullUser as any).importString || '',
          role: typeof fullUser.role === 'number' ? fullUser.role : 0,
          managerId: fullUser.managerId || null,
          status: typeof fullUser.status === 'number' ? fullUser.status : 0
        };
        this.existingAvatarUrl.set((fullUser as any).avatarData || null);
        this.isLoadingEdit.set(false);
        this.loadAvailableManagers();
      },
      error: (err) => {
        console.error('Error loading user details:', err);
        this.editError.set('Error al cargar los datos del usuario');
        this.isLoadingEdit.set(false);
      }
    });
  }

  closeEditModal(): void {
    this.editingUser.set(null);
    this.editError.set('');
    this.avatarFile.set(null);
    this.avatarPreview.set(null);
    this.existingAvatarUrl.set(null);
  }

  onAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowed.includes(file.type)) {
      this.editError.set('Tipo de archivo no permitido. Use JPG, PNG, GIF o WebP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.editError.set('El archivo excede el tamaño máximo de 5MB.');
      return;
    }

    this.avatarFile.set(file);
    const reader = new FileReader();
    reader.onload = () => this.avatarPreview.set(reader.result as string);
    reader.readAsDataURL(file);
    input.value = '';
  }

  removeAvatar(): void {
    this.avatarFile.set(null);
    this.avatarPreview.set(null);
  }

  onEditRoleChange(): void {
    this.loadAvailableManagers();
  }

  private loadAvailableManagers(): void {
    this.userService.getAvailableManagers(this.editForm.role).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        this.availableManagers.set(response.data || []);
      },
      error: (err) => {
        console.error('Error loading managers:', err);
      }
    });
  }

  isEditFormValid(): boolean {
    const email = this.editForm.email?.trim() || '';
    return !!(
      this.editForm.firstName?.trim() &&
      this.editForm.lastName?.trim() &&
      EMAIL_REGEX.test(email)
    );
  }

  saveUser(): void {
    const user = this.editingUser();
    if (!user || !this.isEditFormValid()) return;

    this.isSaving.set(true);
    this.editError.set('');

    const request: UpdateUserRequest = {
      email: this.editForm.email.trim(),
      firstName: this.editForm.firstName.trim(),
      lastName: this.editForm.lastName.trim(),
      phone: joinPhone(this.editForm.phoneCountryCode, this.editForm.phone),
      role: this.editForm.role,
      status: this.editForm.status,
      managerId: this.editForm.managerId || undefined,
      importString: this.editForm.importString?.trim() || undefined
    };

    this.userService.updateUser(user.id, request).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        const file = this.avatarFile();
        if (file) {
          this.userService.uploadAvatar(user.id, file).pipe(
            takeUntil(this.destroy$)
          ).subscribe({
            next: () => this.finishSave(),
            error: () => this.finishSave()  // usuario actualizado aunque falle el avatar
          });
        } else {
          this.finishSave();
        }
      },
      error: (err) => {
        console.error('Error updating user:', err);
        this.editError.set(err.error?.message || 'Error al actualizar el usuario');
        this.isSaving.set(false);
      }
    });
  }

  private finishSave(): void {
    this.isSaving.set(false);
    this.closeEditModal();
    this.toast.success('Usuario actualizado correctamente');
    this.loadUsers();
  }

  getFullName(user: UserListItem): string {
    return getFullName(user);
  }

  getInitials(user: UserListItem): string {
    const first = user.firstName?.charAt(0) || '';
    const last = user.lastName?.charAt(0) || '';
    return (first + last).toUpperCase() || '?';
  }

  getRoleDisplayName(role: UserRole): string {
    return RoleUtils.getDisplayName(role);
  }

  getStatusDisplayName(status: UserStatus): string {
    const names: Record<UserStatus, string> = {
      [UserStatus.ACTIVE]: 'Activo',
      [UserStatus.INACTIVE]: 'Inactivo',
      [UserStatus.PENDING]: 'Pendiente'
    };
    return names[status] || 'Desconocido';
  }
}
