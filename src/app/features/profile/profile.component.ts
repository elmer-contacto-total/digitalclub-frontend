/**
 * Profile Component
 * Vista y edición del perfil del usuario actual
 * PARIDAD: Rails devise/registrations/edit.html.erb
 */
import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { UserRole, RoleUtils, getInitials } from '../../core/models/user.model';

interface ProfileData {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  timeZone: string;
  locale: string;
  avatarData?: string;
  role: number;
  status: number;
  clientId: number;
  initialPasswordChanged: boolean;
  createdAt: string;
  updatedAt: string;
}

const TIME_ZONES = [
  { value: 'America/Lima', label: '(GMT-05:00) Lima' },
  { value: 'America/Bogota', label: '(GMT-05:00) Bogotá' },
  { value: 'America/Mexico_City', label: '(GMT-06:00) Ciudad de México' },
  { value: 'America/Santiago', label: '(GMT-04:00) Santiago' },
  { value: 'America/Buenos_Aires', label: '(GMT-03:00) Buenos Aires' },
  { value: 'America/Sao_Paulo', label: '(GMT-03:00) São Paulo' },
  { value: 'America/Caracas', label: '(GMT-04:00) Caracas' },
  { value: 'America/New_York', label: '(GMT-05:00) New York' },
  { value: 'America/Los_Angeles', label: '(GMT-08:00) Los Angeles' },
  { value: 'Europe/Madrid', label: '(GMT+01:00) Madrid' },
  { value: 'UTC', label: '(GMT+00:00) UTC' }
];

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="profile-page">
      @if (isLoading()) {
        <div class="loading-state">
          <div class="spinner"></div>
          <span>Cargando perfil...</span>
        </div>
      } @else if (profile()) {
        <!-- Page Header -->
        <div class="page-header">
          <div class="header-left">
            <a routerLink="/app/dashboard" class="back-link">
              <i class="ph ph-arrow-left"></i>
            </a>
            <div class="header-title">
              <h1>Mi Perfil</h1>
              <span class="subtitle">Gestiona tu información personal</span>
            </div>
          </div>
        </div>

        <!-- Main Content -->
        <div class="content-wrapper">
          <!-- Left: User Card -->
          <aside class="sidebar-card">
            <div class="user-card">
              <div class="avatar">
                @if (profile()!.avatarData) {
                  <img [src]="profile()!.avatarData" alt="Avatar" />
                } @else {
                  {{ getInitials() }}
                }
              </div>
              <h2 class="user-name">{{ profile()!.firstName }} {{ profile()!.lastName }}</h2>
              <span class="user-email">{{ profile()!.email }}</span>
              <span class="role-badge">{{ getRoleDisplayName(profile()!.role) }}</span>
            </div>

            <div class="user-stats">
              <div class="stat-item">
                <span class="stat-label">Miembro desde</span>
                <span class="stat-value">{{ formatDate(profile()!.createdAt) }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Última actualización</span>
                <span class="stat-value">{{ formatDate(profile()!.updatedAt) }}</span>
              </div>
            </div>

            <div class="security-section">
              <h4>Seguridad</h4>
              <p>Solicita un enlace para cambiar tu contraseña.</p>
              <button
                type="button"
                class="btn btn-outline btn-block"
                (click)="onResetPassword()"
                [disabled]="isResettingPassword()"
              >
                @if (isResettingPassword()) {
                  <i class="ph ph-spinner spinning"></i>
                  Enviando...
                } @else {
                  <i class="ph ph-key"></i>
                  Restablecer Contraseña
                }
              </button>
              @if (resetPasswordMessage()) {
                <p class="reset-message success">{{ resetPasswordMessage() }}</p>
              }
            </div>
          </aside>

          <!-- Right: Edit Form -->
          <main class="main-content">
            <div class="form-card">
              <div class="card-header">
                <h3>Información Personal</h3>
              </div>

              <form (ngSubmit)="onSave()" class="profile-form">
                <!-- Messages -->
                @if (error()) {
                  <div class="alert alert-error">
                    <i class="ph ph-warning-circle"></i>
                    <span>{{ error() }}</span>
                  </div>
                }
                @if (success()) {
                  <div class="alert alert-success">
                    <i class="ph ph-check-circle"></i>
                    <span>{{ success() }}</span>
                  </div>
                }

                <div class="form-grid">
                  <div class="form-group">
                    <label for="firstName">Nombre <span class="required">*</span></label>
                    <input
                      type="text"
                      id="firstName"
                      [(ngModel)]="form.firstName"
                      name="firstName"
                      placeholder="Ingresa tu nombre"
                      required
                    />
                  </div>

                  <div class="form-group">
                    <label for="lastName">Apellido <span class="required">*</span></label>
                    <input
                      type="text"
                      id="lastName"
                      [(ngModel)]="form.lastName"
                      name="lastName"
                      placeholder="Ingresa tu apellido"
                      required
                    />
                  </div>

                  <div class="form-group">
                    <label for="email">Correo electrónico</label>
                    <div class="input-with-icon">
                      <i class="ph ph-envelope"></i>
                      <input
                        type="email"
                        id="email"
                        [value]="profile()!.email"
                        readonly
                        class="readonly"
                      />
                    </div>
                    <span class="hint">El correo no puede modificarse</span>
                  </div>

                  <div class="form-group">
                    <label for="phone">Teléfono</label>
                    <div class="input-with-icon">
                      <i class="ph ph-phone"></i>
                      <input
                        type="tel"
                        id="phone"
                        [(ngModel)]="form.phone"
                        name="phone"
                        placeholder="+51 999 999 999"
                      />
                    </div>
                  </div>

                  <div class="form-group full-width">
                    <label for="timeZone">Zona horaria</label>
                    <div class="input-with-icon">
                      <i class="ph ph-globe"></i>
                      <select
                        id="timeZone"
                        [(ngModel)]="form.timeZone"
                        name="timeZone"
                      >
                        @for (tz of timeZones; track tz.value) {
                          <option [value]="tz.value">{{ tz.label }}</option>
                        }
                      </select>
                    </div>
                  </div>
                </div>

                <div class="form-actions">
                  <button
                    type="submit"
                    class="btn btn-primary"
                    [disabled]="isSaving() || !isFormValid()"
                  >
                    @if (isSaving()) {
                      <i class="ph ph-spinner spinning"></i>
                      Guardando...
                    } @else {
                      <i class="ph ph-floppy-disk"></i>
                      Guardar cambios
                    }
                  </button>
                </div>
              </form>
            </div>
          </main>
        </div>
      } @else {
        <div class="error-state">
          <i class="ph ph-warning-circle"></i>
          <h3>No se pudo cargar el perfil</h3>
          <p>Hubo un problema al obtener tu información.</p>
          <button class="btn btn-primary" (click)="loadProfile()">
            <i class="ph ph-arrow-clockwise"></i>
            Reintentar
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .profile-page {
      min-height: 100%;
      background: var(--bg-base);
      padding: 24px;
    }

    /* Loading State */
    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 400px;
      gap: 16px;
      color: var(--fg-muted);
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--border-default);
      border-top-color: var(--accent-default);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    /* Page Header */
    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 32px;
      max-width: 900px;
      margin-left: auto;
      margin-right: auto;

      @media (max-width: 900px) {
        max-width: 500px;
      }
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .back-link {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      color: var(--fg-muted);
      text-decoration: none;
      transition: all 0.2s;

      &:hover {
        color: var(--accent-default);
        border-color: var(--accent-default);
      }

      i { font-size: 20px; }
    }

    .header-title {
      h1 {
        margin: 0;
        font-size: 22px;
        font-weight: 600;
        color: var(--fg-default);
      }

      .subtitle {
        font-size: 13px;
        color: var(--fg-muted);
      }
    }

    /* Content Layout */
    .content-wrapper {
      display: grid;
      grid-template-columns: 320px 1fr;
      gap: 32px;
      max-width: 900px;
      margin: 0 auto;

      @media (max-width: 900px) {
        grid-template-columns: 1fr;
        max-width: 500px;
      }
    }

    /* Sidebar Card */
    .sidebar-card {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .user-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .avatar {
      width: 88px;
      height: 88px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--accent-default), var(--accent-emphasis));
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      font-weight: 600;
      margin-bottom: 16px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 50%;
      }
    }

    .user-name {
      margin: 0 0 4px 0;
      font-size: 18px;
      font-weight: 600;
      color: var(--fg-default);
    }

    .user-email {
      font-size: 13px;
      color: var(--fg-muted);
      margin-bottom: 12px;
      word-break: break-all;
    }

    .role-badge {
      display: inline-block;
      padding: 6px 14px;
      background: var(--accent-subtle);
      color: var(--accent-default);
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .user-stats {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 16px;
    }

    .stat-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 0;

      &:not(:last-child) {
        border-bottom: 1px solid var(--border-default);
      }

      .stat-label {
        font-size: 13px;
        color: var(--fg-muted);
      }

      .stat-value {
        font-size: 13px;
        font-weight: 500;
        color: var(--fg-default);
      }
    }

    .security-section {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 20px;

      h4 {
        margin: 0 0 8px 0;
        font-size: 14px;
        font-weight: 600;
        color: var(--fg-default);
      }

      p {
        margin: 0 0 16px 0;
        font-size: 13px;
        color: var(--fg-muted);
        line-height: 1.5;
      }

      .reset-message {
        margin: 12px 0 0 0;
        padding: 10px;
        border-radius: 6px;
        font-size: 12px;

        &.success {
          background: var(--success-subtle);
          color: var(--success-text);
        }
      }
    }

    /* Main Content */
    .main-content {
      min-width: 0;
    }

    .form-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      overflow: hidden;
    }

    .card-header {
      padding: 20px 24px;
      border-bottom: 1px solid var(--border-default);

      h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--fg-default);
      }
    }

    .profile-form {
      padding: 24px;
    }

    .alert {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 20px;
      font-size: 14px;

      i { font-size: 18px; }

      &.alert-error {
        background: var(--error-subtle);
        color: var(--error-text);
      }

      &.alert-success {
        background: var(--success-subtle);
        color: var(--success-text);
      }
    }

    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;

      @media (max-width: 600px) {
        grid-template-columns: 1fr;
      }
    }

    .form-group {
      &.full-width {
        grid-column: 1 / -1;
      }

      label {
        display: block;
        margin-bottom: 8px;
        font-size: 13px;
        font-weight: 500;
        color: var(--fg-default);

        .required { color: var(--error-default); }
      }

      input, select {
        width: 100%;
        padding: 11px 14px;
        background: var(--input-bg);
        border: 1px solid var(--input-border);
        border-radius: 8px;
        font-size: 14px;
        color: var(--fg-default);
        transition: all 0.15s;

        &:focus {
          outline: none;
          border-color: var(--accent-default);
          box-shadow: 0 0 0 3px var(--accent-subtle);
        }

        &::placeholder { color: var(--fg-subtle); }

        &.readonly {
          background: var(--bg-subtle);
          color: var(--fg-muted);
          cursor: not-allowed;
        }
      }

      select { cursor: pointer; }

      .hint {
        display: block;
        margin-top: 6px;
        font-size: 12px;
        color: var(--fg-subtle);
      }
    }

    .input-with-icon {
      position: relative;

      i {
        position: absolute;
        left: 14px;
        top: 50%;
        transform: translateY(-50%);
        color: var(--fg-muted);
        font-size: 16px;
        pointer-events: none;
      }

      input, select {
        padding-left: 42px;
      }
    }

    .form-actions {
      margin-top: 24px;
      padding-top: 20px;
      border-top: 1px solid var(--border-default);
      display: flex;
      justify-content: flex-end;
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 11px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: all 0.2s;

      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      i { font-size: 18px; }
    }

    .btn-primary {
      background: var(--accent-default);
      color: white;

      &:hover:not(:disabled) {
        background: var(--accent-emphasis);
      }
    }

    .btn-outline {
      background: transparent;
      color: var(--fg-default);
      border: 1px solid var(--border-default);

      &:hover:not(:disabled) {
        background: var(--bg-subtle);
        border-color: var(--fg-muted);
      }
    }

    .btn-block {
      width: 100%;
    }

    /* Error State */
    .error-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 400px;
      text-align: center;
      color: var(--fg-muted);

      i {
        font-size: 56px;
        margin-bottom: 16px;
        opacity: 0.4;
      }

      h3 {
        margin: 0 0 8px 0;
        font-size: 18px;
        color: var(--fg-default);
      }

      p {
        margin: 0 0 20px 0;
        font-size: 14px;
      }
    }

    /* Animations */
    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .spinning {
      animation: spin 1s linear infinite;
    }
  `]
})
export class ProfileComponent implements OnInit {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private toast = inject(ToastService);

  isLoading = signal(true);
  isSaving = signal(false);
  isResettingPassword = signal(false);
  profile = signal<ProfileData | null>(null);
  error = signal('');
  success = signal('');
  resetPasswordMessage = signal('');

  form = {
    firstName: '',
    lastName: '',
    phone: '',
    timeZone: 'America/Lima'
  };

  timeZones = TIME_ZONES;

  ngOnInit(): void {
    this.loadProfile();
  }

  loadProfile(): void {
    this.isLoading.set(true);
    this.error.set('');

    this.http.get<ProfileData>(`${environment.apiUrl}/app/users/profile`).subscribe({
      next: (data) => {
        this.profile.set(data);
        this.form = {
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          phone: data.phone || '',
          timeZone: data.timeZone || 'America/Lima'
        };
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading profile:', err);
        this.error.set('Error al cargar el perfil');
        this.isLoading.set(false);
      }
    });
  }

  onSave(): void {
    if (!this.isFormValid()) return;

    this.isSaving.set(true);
    this.error.set('');
    this.success.set('');

    this.http.put<ProfileData>(`${environment.apiUrl}/app/users/profile`, this.form).subscribe({
      next: (data) => {
        this.profile.set(data);
        this.success.set('Perfil actualizado correctamente');
        this.isSaving.set(false);
        this.toast.success('Perfil actualizado');

        const currentUser = this.authService.currentUser();
        if (currentUser) {
          this.authService.updateCurrentUser({
            ...currentUser,
            firstName: data.firstName,
            lastName: data.lastName,
            phone: data.phone
          });
        }

        setTimeout(() => this.success.set(''), 4000);
      },
      error: (err) => {
        console.error('Error saving profile:', err);
        this.error.set(err.error?.message || 'Error al guardar el perfil');
        this.isSaving.set(false);
      }
    });
  }

  onResetPassword(): void {
    const profile = this.profile();
    if (!profile) return;

    this.isResettingPassword.set(true);
    this.resetPasswordMessage.set('');

    this.http.post<{ message: string }>(`${environment.apiUrl}/app/users/send_reset_password`, {
      userId: profile.id
    }).subscribe({
      next: () => {
        this.resetPasswordMessage.set('Enlace enviado a tu correo');
        this.isResettingPassword.set(false);
        this.toast.success('Enlace enviado');
      },
      error: (err) => {
        console.error('Error sending reset password:', err);
        this.resetPasswordMessage.set('');
        this.isResettingPassword.set(false);
        this.toast.error('Error al enviar el enlace');
      }
    });
  }

  isFormValid(): boolean {
    return !!(this.form.firstName?.trim() && this.form.lastName?.trim());
  }

  getInitials(): string {
    const profile = this.profile();
    if (!profile) return '??';
    return getInitials({ firstName: profile.firstName, lastName: profile.lastName });
  }

  getRoleDisplayName(role: number): string {
    return RoleUtils.getDisplayName(role as UserRole);
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }
}
