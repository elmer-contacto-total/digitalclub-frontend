/**
 * User Form Component
 * Crear/Editar usuarios
 * PARIDAD: Rails admin/users/new.html.erb, admin/users/edit.html.erb
 */
import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { UserService, CreateUserRequest, UpdateUserRequest } from '../../../../core/services/user.service';
import { AuthService } from '../../../../core/services/auth.service';
import { User, UserRole, UserStatus, UserOption, RoleUtils } from '../../../../core/models/user.model';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,}$/;

@Component({
  selector: 'app-user-form',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ReactiveFormsModule,
    LoadingSpinnerComponent
  ],
  template: `
    <div class="user-form-container">
      <!-- Header -->
      <div class="page-header">
        <div class="header-content">
          <a [routerLink]="backUrl()" class="back-link">
            <i class="ph ph-arrow-left"></i>
            {{ isEditMode() ? 'Volver a usuario' : 'Volver a usuarios' }}
          </a>
          <h1>{{ isEditMode() ? 'Editar Usuario' : 'Nuevo Usuario' }}</h1>
        </div>
      </div>

      @if (isLoading()) {
        <app-loading-spinner [overlay]="true" message="Cargando..." />
      }

      <!-- Form -->
      <div class="form-card">
        <form [formGroup]="form" (ngSubmit)="onSubmit()">
          <!-- Personal Info Section -->
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
                <label for="firstName">Nombre <span class="required">*</span></label>
                <input
                  id="firstName"
                  type="text"
                  formControlName="firstName"
                  [class.invalid]="isFieldInvalid('firstName')"
                />
                @if (isFieldInvalid('firstName')) {
                  <span class="error-message">El nombre es requerido</span>
                }
              </div>

              <div class="form-group">
                <label for="lastName">Apellido <span class="required">*</span></label>
                <input
                  id="lastName"
                  type="text"
                  formControlName="lastName"
                  [class.invalid]="isFieldInvalid('lastName')"
                />
                @if (isFieldInvalid('lastName')) {
                  <span class="error-message">El apellido es requerido</span>
                }
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="email">Email <span class="required">*</span></label>
                <input
                  id="email"
                  type="email"
                  formControlName="email"
                  [class.invalid]="isFieldInvalid('email')"
                  [readonly]="isEditMode()"
                />
                @if (isFieldInvalid('email')) {
                  <span class="error-message">
                    @if (form.get('email')?.errors?.['required']) {
                      El email es requerido
                    } @else {
                      Ingrese un email válido
                    }
                  </span>
                }
              </div>

              <div class="form-group">
                <label for="phone">Teléfono</label>
                <input
                  id="phone"
                  type="tel"
                  formControlName="phone"
                  placeholder="+51 999 999 999"
                />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group full-width">
                <label for="importString">Nombre en archivo de importación</label>
                <input
                  id="importString"
                  type="text"
                  formControlName="importString"
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
                <label for="role">Rol <span class="required">*</span></label>
                <select
                  id="role"
                  formControlName="role"
                  [class.invalid]="isFieldInvalid('role')"
                  (change)="onRoleChange()"
                >
                  <option [ngValue]="null" disabled>Seleccionar rol</option>
                  @for (role of availableRoles(); track role.value) {
                    <option [ngValue]="role.value">{{ role.label }}</option>
                  }
                </select>
                @if (isFieldInvalid('role')) {
                  <span class="error-message">Seleccione un rol</span>
                }
              </div>

              <div class="form-group">
                <label for="managerId">Manager</label>
                <select id="managerId" formControlName="managerId">
                  <option [ngValue]="null">Sin manager asignado</option>
                  @for (manager of availableManagers(); track manager.id) {
                    <option [ngValue]="manager.id">{{ manager.name }} ({{ getRoleDisplayName(manager.role) }})</option>
                  }
                </select>
              </div>
            </div>

            @if (isEditMode()) {
              <div class="form-row">
                <div class="form-group">
                  <label for="status">Estado</label>
                  <select id="status" formControlName="status">
                    <option [ngValue]="0">Activo</option>
                    <option [ngValue]="1">Inactivo</option>
                    <option [ngValue]="2">Pendiente</option>
                  </select>
                </div>
              </div>
            }
          </div>

          <!-- Password Section (only for new users) -->
          @if (!isEditMode()) {
            <div class="form-section">
              <h3>Contraseña</h3>

              <div class="form-row">
                <div class="form-group">
                  <label for="password">Contraseña <span class="required">*</span></label>
                  <div class="password-input">
                    <input
                      id="password"
                      [type]="showPassword() ? 'text' : 'password'"
                      formControlName="password"
                      [class.invalid]="isFieldInvalid('password')"
                      placeholder="Mínimo 8 caracteres"
                    />
                    <button type="button" class="toggle-password" (click)="togglePassword()">
                      <i class="ph" [class.ph-eye]="!showPassword()" [class.ph-eye-slash]="showPassword()"></i>
                    </button>
                  </div>
                  @if (isFieldInvalid('password')) {
                    <span class="error-message">
                      @if (form.get('password')?.errors?.['required']) {
                        La contraseña es requerida
                      } @else {
                        Mínimo 8 caracteres
                      }
                    </span>
                  }
                </div>

                <div class="form-group">
                  <label for="passwordConfirmation">Confirmar Contraseña <span class="required">*</span></label>
                  <input
                    id="passwordConfirmation"
                    [type]="showPassword() ? 'text' : 'password'"
                    formControlName="passwordConfirmation"
                    [class.invalid]="isFieldInvalid('passwordConfirmation')"
                  />
                  @if (isFieldInvalid('passwordConfirmation')) {
                    <span class="error-message">Las contraseñas no coinciden</span>
                  }
                </div>
              </div>
            </div>
          }

          <!-- Error Message -->
          @if (errorMessage()) {
            <div class="error-alert">
              <i class="ph ph-warning-circle"></i>
              {{ errorMessage() }}
            </div>
          }

          <!-- Actions -->
          <div class="form-actions">
            <a [routerLink]="backUrl()" class="btn btn-secondary">Cancelar</a>
            <button
              type="submit"
              class="btn btn-primary"
              [disabled]="isSaving() || form.invalid"
            >
              @if (isSaving()) {
                <i class="ph ph-spinner ph-spin"></i>
                Guardando...
              } @else {
                <i class="ph ph-check"></i>
                {{ isEditMode() ? 'Guardar Cambios' : 'Crear Usuario' }}
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .user-form-container {
      padding: 24px;
      max-width: 800px;
      margin: 0 auto;
      background: var(--bg-base);
      min-height: 100%;
    }

    .page-header {
      margin-bottom: 24px;

      .back-link {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        color: var(--fg-muted);
        text-decoration: none;
        font-size: 14px;
        margin-bottom: 8px;

        &:hover { color: var(--accent-default); }

        i { font-size: 18px; }
      }

      h1 {
        margin: 0;
        font-size: 24px;
        font-weight: 600;
        color: var(--fg-default);
      }
    }

    .form-card {
      background: var(--card-bg);
      border-radius: 12px;
      border: 1px solid var(--card-border);
      padding: 24px;
    }

    .avatar-upload-row {
      display: flex;
      align-items: center;
      gap: 20px;
      margin-bottom: 24px;
    }

    .avatar-preview {
      width: 80px;
      height: 80px;
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
        font-size: 32px;
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

    .form-section {
      margin-bottom: 32px;

      &:last-of-type { margin-bottom: 24px; }

      h3 {
        margin: 0 0 20px 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--fg-default);
        padding-bottom: 12px;
        border-bottom: 1px solid var(--border-default);
      }
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;

      @media (max-width: 600px) {
        grid-template-columns: 1fr;
      }
    }

    .form-group {
      margin-bottom: 20px;

      &.full-width {
        grid-column: 1 / -1;
      }

      label {
        display: block;
        margin-bottom: 8px;
        font-size: 14px;
        font-weight: 500;
        color: var(--fg-default);

        .required { color: var(--error-default); }
      }

      input, select {
        width: 100%;
        padding: 10px 12px;
        background: var(--input-bg);
        border: 1px solid var(--input-border);
        border-radius: 8px;
        font-size: 14px;
        color: var(--fg-default);
        transition: border-color 0.2s;

        &:focus {
          outline: none;
          border-color: var(--input-border-focus);
          box-shadow: 0 0 0 3px var(--accent-subtle);
        }

        &.invalid {
          border-color: var(--error-default);
        }

        &[readonly] {
          background: var(--input-bg-readonly);
          color: var(--fg-muted);
        }

        &::placeholder {
          color: var(--fg-subtle);
        }
      }

      select {
        cursor: pointer;
      }

      .error-message {
        display: block;
        margin-top: 6px;
        font-size: 12px;
        color: var(--error-default);
      }

      .field-hint {
        display: block;
        margin-top: 6px;
        font-size: 12px;
        color: var(--fg-subtle);
      }
    }

    .password-input {
      position: relative;

      input { padding-right: 40px; }

      .toggle-password {
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        background: none;
        border: none;
        color: var(--fg-muted);
        cursor: pointer;
        padding: 4px;

        &:hover { color: var(--fg-default); }

        i { font-size: 18px; }
      }
    }

    .error-alert {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: var(--error-subtle);
      border: 1px solid var(--error-default);
      border-radius: 8px;
      color: var(--error-text);
      font-size: 14px;
      margin-bottom: 24px;

      i { font-size: 20px; }
    }

    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      padding-top: 20px;
      border-top: 1px solid var(--border-default);
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 24px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.2s;

      i { font-size: 18px; }

      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      &.btn-primary {
        background: var(--accent-default);
        color: white;
        border: none;

        &:hover:not(:disabled) { background: var(--accent-emphasis); }
      }

      &.btn-secondary {
        background: var(--card-bg);
        color: var(--fg-default);
        border: 1px solid var(--border-default);

        &:hover { background: var(--bg-subtle); }
      }
    }

    .ph-spin {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `]
})
export class UserFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private userService = inject(UserService);
  private authService = inject(AuthService);

  // Navigation
  backUrl = signal('/app/users');

  // State
  isLoading = signal(false);
  isSaving = signal(false);
  errorMessage = signal('');
  showPassword = signal(false);
  availableManagers = signal<UserOption[]>([]);

  // Avatar
  avatarFile = signal<File | null>(null);
  avatarPreview = signal<string | null>(null);

  // Edit mode
  userId = signal<number | null>(null);
  isEditMode = computed(() => this.userId() !== null);
  existingUser = signal<User | null>(null);

  // Form
  form!: FormGroup;

  // Current user for permissions
  currentUser = this.authService.currentUser;

  // Existing avatar URL from user data (parsed from Shrine JSON or direct URL)
  existingAvatarUrl = computed(() => {
    const user = this.existingUser();
    if (!user) return null;
    const avatarData = (user as any).avatarData;
    if (!avatarData) return null;
    // avatarData may be Shrine JSON or a direct URL
    if (avatarData.startsWith('http')) return avatarData;
    try {
      const parsed = JSON.parse(avatarData);
      if (parsed.id) return null; // S3 key only — would need presigned URL from backend
    } catch { /* not JSON */ }
    return null;
  });

  // Available roles based on current user's role
  availableRoles = computed(() => {
    const user = this.currentUser();
    if (!user) return [];

    const allRoles = [
      { value: UserRole.STANDARD, label: 'Estándar' },
      { value: UserRole.SUPER_ADMIN, label: 'Super Admin' },
      { value: UserRole.ADMIN, label: 'Administrador' },
      { value: UserRole.MANAGER_LEVEL_1, label: 'Manager Nivel 1' },
      { value: UserRole.MANAGER_LEVEL_2, label: 'Manager Nivel 2' },
      { value: UserRole.MANAGER_LEVEL_3, label: 'Manager Nivel 3' },
      { value: UserRole.MANAGER_LEVEL_4, label: 'Manager Nivel 4' },
      { value: UserRole.AGENT, label: 'Agente' },
      { value: UserRole.STAFF, label: 'Staff' },
      { value: UserRole.WHATSAPP_BUSINESS, label: 'WhatsApp Business' }
    ];

    // Super admin can assign any role
    if (user.role === UserRole.SUPER_ADMIN) return allRoles;

    // Admin can't create super admins
    if (user.role === UserRole.ADMIN) {
      return allRoles.filter(r => r.value !== UserRole.SUPER_ADMIN);
    }

    // Staff can create standard users and agents
    if (user.role === UserRole.STAFF) {
      return allRoles.filter(r =>
        r.value === UserRole.STANDARD ||
        r.value === UserRole.AGENT ||
        r.value === UserRole.WHATSAPP_BUSINESS
      );
    }

    // Managers can create standard users
    if (RoleUtils.isManager(user.role)) {
      return allRoles.filter(r =>
        r.value === UserRole.STANDARD ||
        r.value === UserRole.WHATSAPP_BUSINESS
      );
    }

    return [];
  });

  ngOnInit(): void {
    // Determine back navigation URL
    const from = this.route.snapshot.queryParams['from'];
    if (from === 'internal') {
      this.backUrl.set('/app/internal_users');
    }

    // Check for edit mode FIRST, before initializing the form
    const id = this.route.snapshot.params['id'];
    if (id && id !== 'new') {
      this.userId.set(parseInt(id, 10));
      this.backUrl.set(from === 'internal' ? `/app/users/${id}?from=internal` : `/app/users/${id}`);
    }

    // Now initialize form with correct validators based on mode
    this.initForm();
    this.loadManagers();

    // Load user data if in edit mode
    if (this.isEditMode()) {
      this.loadUser(this.userId()!);
    }
  }

  private initForm(): void {
    // Password validators only for create mode
    const passwordValidators = this.isEditMode() ? [] : [Validators.required, Validators.minLength(8)];

    this.form = this.fb.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      email: ['', [Validators.required, Validators.pattern(EMAIL_REGEX)]],
      phone: [''],
      importString: [''],
      role: [null, Validators.required],
      managerId: [null],
      status: [UserStatus.ACTIVE],
      password: ['', passwordValidators],
      passwordConfirmation: ['']
    }, {
      validators: this.passwordMatchValidator
    });
  }

  private passwordMatchValidator(form: FormGroup) {
    const password = form.get('password')?.value;
    const confirmation = form.get('passwordConfirmation')?.value;

    if (password && confirmation && password !== confirmation) {
      form.get('passwordConfirmation')?.setErrors({ mismatch: true });
    }
    return null;
  }

  private loadManagers(): void {
    const selectedRole = this.form?.get('role')?.value;
    this.userService.getAvailableManagers(selectedRole).subscribe({
      next: (response) => this.availableManagers.set(response.data),
      error: (err) => console.error('Error loading managers:', err)
    });
  }

  private loadUser(id: number): void {
    this.isLoading.set(true);
    this.userService.getUser(id).subscribe({
      next: (response) => {
        console.log('User loaded for edit:', response);
        if (response.user) {
          this.existingUser.set(response.user);
          this.patchForm(response.user);
        } else {
          // Handle case where response might be flat (backwards compatibility)
          this.existingUser.set(response as any);
          this.patchForm(response as any);
        }
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading user:', err);
        this.errorMessage.set('Error al cargar el usuario');
        this.isLoading.set(false);
      }
    });
  }

  private patchForm(user: User): void {
    console.log('Patching form with user:', user);

    // Ensure role and status are numbers for select binding
    const roleValue = typeof user.role === 'number' ? user.role : parseInt(String(user.role), 10);
    const statusValue = typeof user.status === 'number' ? user.status : parseInt(String(user.status), 10);

    this.form.patchValue({
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      email: user.email || '',
      phone: user.phone || '',
      importString: (user as any).importString || '',
      role: roleValue,
      managerId: user.managerId || null,
      status: statusValue
    });

    console.log('Form values after patch:', this.form.value);
  }

  onRoleChange(): void {
    this.loadManagers();
  }

  togglePassword(): void {
    this.showPassword.update(v => !v);
  }

  isFieldInvalid(field: string): boolean {
    const control = this.form.get(field);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }

  getRoleDisplayName(role: UserRole): string {
    return RoleUtils.getDisplayName(role);
  }

  onAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // Validate type
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowed.includes(file.type)) {
      this.errorMessage.set('Tipo de archivo no permitido. Use JPG, PNG, GIF o WebP.');
      return;
    }

    // Validate size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      this.errorMessage.set('El archivo excede el tamaño máximo de 5MB.');
      return;
    }

    this.avatarFile.set(file);

    // Show local preview
    const reader = new FileReader();
    reader.onload = () => this.avatarPreview.set(reader.result as string);
    reader.readAsDataURL(file);

    // Reset file input for re-selection of same file
    input.value = '';
  }

  removeAvatar(): void {
    this.avatarFile.set(null);
    this.avatarPreview.set(null);
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set('');

    if (this.isEditMode()) {
      this.updateUser();
    } else {
      this.createUser();
    }
  }

  private createUser(): void {
    const request: CreateUserRequest = {
      email: this.form.value.email,
      firstName: this.form.value.firstName,
      lastName: this.form.value.lastName,
      phone: this.form.value.phone || '',
      password: this.form.value.password,
      role: parseInt(this.form.value.role, 10),
      managerId: this.form.value.managerId || undefined,
      importString: this.form.value.importString || undefined
    };

    this.userService.createUser(request).subscribe({
      next: (user) => {
        if (this.avatarFile() && user.id) {
          this.userService.uploadAvatar(user.id, this.avatarFile()!).subscribe({
            next: () => {
              this.isSaving.set(false);
              this.router.navigate(['/app/users', user.id]);
            },
            error: () => {
              // User created but avatar failed — navigate anyway
              this.isSaving.set(false);
              this.router.navigate(['/app/users', user.id]);
            }
          });
        } else {
          this.isSaving.set(false);
          this.router.navigate(['/app/users', user.id]);
        }
      },
      error: (err) => {
        console.error('Error creating user:', err);
        this.errorMessage.set(err.error?.message || 'Error al crear el usuario');
        this.isSaving.set(false);
      }
    });
  }

  private updateUser(): void {
    const request: UpdateUserRequest = {
      firstName: this.form.value.firstName,
      lastName: this.form.value.lastName,
      phone: this.form.value.phone || '',
      role: parseInt(this.form.value.role, 10),
      status: parseInt(this.form.value.status, 10),
      managerId: this.form.value.managerId || undefined,
      importString: this.form.value.importString || undefined
    };

    this.userService.updateUser(this.userId()!, request).subscribe({
      next: () => {
        if (this.avatarFile()) {
          this.userService.uploadAvatar(this.userId()!, this.avatarFile()!).subscribe({
            next: () => {
              this.isSaving.set(false);
              this.router.navigate(['/app/users', this.userId()]);
            },
            error: () => {
              // User updated but avatar failed — navigate anyway
              this.isSaving.set(false);
              this.router.navigate(['/app/users', this.userId()]);
            }
          });
        } else {
          this.isSaving.set(false);
          this.router.navigate(['/app/users', this.userId()]);
        }
      },
      error: (err) => {
        console.error('Error updating user:', err);
        this.errorMessage.set(err.error?.message || 'Error al actualizar el usuario');
        this.isSaving.set(false);
      }
    });
  }
}
