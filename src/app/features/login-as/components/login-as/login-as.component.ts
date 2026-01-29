/**
 * LoginAsComponent
 * PARIDAD: Rails admin/users/get_login_as.html.erb
 *
 * Allows SUPER_ADMIN and ADMIN users to impersonate other users.
 * Uses a searchable dropdown (TomSelect style) to select user.
 */
import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { LoginAsService } from '../../../../core/services/login-as.service';
import { UserService } from '../../../../core/services/user.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../core/services/toast.service';
import { User, UserRole } from '../../../../core/models/user.model';

interface SelectableUser {
  id: number;
  displayName: string;
  role: string;
}

@Component({
  selector: 'app-login-as',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="container-fluid py-4">
      <!-- Page Header - PARIDAD: Rails title -->
      <div class="page-header mb-4">
        <div class="row">
          <div class="col">
            <h1 class="h3 mb-0">Seleccione el usuario con el que desea iniciar sesión</h1>
          </div>
        </div>
      </div>

      <!-- Loading -->
      @if (isLoading()) {
        <div class="text-center py-5">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Cargando...</span>
          </div>
        </div>
      }

      <!-- User Selection Form -->
      @if (!isLoading()) {
        <div class="card">
          <div class="card-body">
            <div class="row">
              <div class="col-md-6">
                <!-- User Dropdown - PARIDAD: Rails TomSelect -->
                <div class="mb-3">
                  <label for="user-select" class="form-label">Usuario</label>
                  <select
                    id="user-select"
                    class="form-select form-select-lg"
                    [(ngModel)]="selectedUserId"
                    [disabled]="isProcessing()">
                    <option [ngValue]="null">Seleccione un usuario...</option>
                    @for (user of users(); track user.id) {
                      <option [ngValue]="user.id">
                        {{ user.displayName }}
                      </option>
                    }
                  </select>
                </div>

                <!-- Search Filter -->
                <div class="mb-4">
                  <label for="search" class="form-label">Buscar</label>
                  <input
                    type="text"
                    id="search"
                    class="form-control"
                    placeholder="Filtrar usuarios..."
                    [(ngModel)]="searchTerm"
                    (input)="filterUsers()">
                </div>

                <!-- Submit Button - PARIDAD: Rails "Iniciar Sesión" -->
                <button
                  type="button"
                  class="btn btn-primary"
                  (click)="loginAs()"
                  [disabled]="!selectedUserId || isProcessing()">
                  @if (isProcessing()) {
                    <span class="spinner-border spinner-border-sm me-2"></span>
                  }
                  <i class="bi bi-box-arrow-in-right me-2"></i>
                  Iniciar Sesión
                </button>

                @if (errorMessage()) {
                  <div class="alert alert-danger mt-4">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    {{ errorMessage() }}
                  </div>
                }
              </div>

              <!-- Info Panel -->
              <div class="col-md-6">
                <div class="card bg-light">
                  <div class="card-body">
                    <h5 class="card-title">
                      <i class="bi bi-info-circle me-2"></i>
                      Información
                    </h5>
                    <p class="card-text text-muted">
                      Esta función le permite iniciar sesión como otro usuario para
                      propósitos de soporte y depuración.
                    </p>
                    <p class="card-text text-muted mb-0">
                      Una vez iniciada la sesión como otro usuario, verá una barra
                      roja en la parte superior indicando que está en modo de
                      suplantación. Puede volver a su sesión original en cualquier
                      momento.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `
})
export class LoginAsComponent implements OnInit, OnDestroy {
  private loginAsService = inject(LoginAsService);
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  private router = inject(Router);
  private destroy$ = new Subject<void>();

  // State signals
  users = signal<SelectableUser[]>([]);
  allUsers: SelectableUser[] = [];
  isLoading = signal(true);
  isProcessing = signal(false);
  errorMessage = signal<string>('');

  // Form
  selectedUserId: number | null = null;
  searchTerm = '';

  ngOnInit(): void {
    // Check if user has permission
    const currentUser = this.authService.currentUser();
    if (!this.loginAsService.canUseLoginAs(currentUser)) {
      this.router.navigate(['/app/dashboard']);
      return;
    }

    this.loadUsers();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadUsers(): void {
    this.isLoading.set(true);
    const currentUser = this.authService.currentUser();

    // Get all users and filter based on role
    this.userService.getUsers()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          // Response is PagedResponse<UserListItem> with data array
          const users = (response.data || []) as any[];

          // Filter users based on current user role
          // PARIDAD: Rails filtering logic
          this.allUsers = users
            .filter(u => {
              // Exclude current user
              if (u.id === currentUser?.id) return false;

              // Exclude standard and whatsapp_business users
              if (u.role === UserRole.STANDARD || u.role === UserRole.WHATSAPP_BUSINESS) return false;

              // If admin (not super_admin), exclude super_admin and other admins
              if (currentUser?.role === UserRole.ADMIN) {
                if (u.role === UserRole.SUPER_ADMIN || u.role === UserRole.ADMIN) return false;
              }

              return true;
            })
            .map(u => ({
              id: u.id,
              displayName: `${(u as any).clientName || 'Sin cliente'} | ${u.firstName} ${u.lastName}`.trim() || u.email,
              role: u.role as unknown as string
            }))
            .sort((a, b) => this.getRolePriority(a.role) - this.getRolePriority(b.role));

          this.users.set(this.allUsers);
          this.isLoading.set(false);
        },
        error: (error) => {
          console.error('Error loading users:', error);
          this.toastService.error('Error al cargar usuarios');
          this.isLoading.set(false);
        }
      });
  }

  filterUsers(): void {
    if (!this.searchTerm.trim()) {
      this.users.set(this.allUsers);
      return;
    }

    const term = this.searchTerm.toLowerCase();
    this.users.set(
      this.allUsers.filter(u =>
        u.displayName.toLowerCase().includes(term)
      )
    );
  }

  loginAs(): void {
    if (!this.selectedUserId) return;

    this.errorMessage.set('');
    this.isProcessing.set(true);

    this.loginAsService.loginAs(this.selectedUserId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.result === 'success') {
            this.toastService.success('Sesión iniciada correctamente');
            // Reload the page to apply new session
            window.location.href = '/app/dashboard';
          } else {
            this.errorMessage.set(response.error || 'Error al iniciar sesión');
            this.isProcessing.set(false);
          }
        },
        error: (error) => {
          console.error('Error logging in as user:', error);
          this.errorMessage.set(error.error?.error || 'Error al iniciar sesión como usuario');
          this.isProcessing.set(false);
        }
      });
  }

  /**
   * Role priority for sorting
   * PARIDAD: Rails role_priority helper
   */
  private getRolePriority(role: string | UserRole): number {
    const roleNum = typeof role === 'number' ? role : parseInt(role, 10);
    switch (roleNum) {
      case UserRole.SUPER_ADMIN:
        return 0;
      case UserRole.ADMIN:
        return 1;
      case UserRole.STAFF:
        return 2;
      case UserRole.MANAGER_LEVEL_4:
        return 3;
      case UserRole.AGENT:
        return 4;
      default:
        return 99;
    }
  }
}
