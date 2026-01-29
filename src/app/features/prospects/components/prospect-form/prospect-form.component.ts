/**
 * Prospect Form Component
 * PARIDAD: Rails admin/prospects/_form.html.erb, new.html.erb, edit.html.erb
 * Formulario para crear/editar prospectos
 */
import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { ProspectService, Prospect } from '../../../../core/services/prospect.service';
import { ToastService } from '../../../../core/services/toast.service';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-prospect-form',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FormsModule,
    LoadingSpinnerComponent
  ],
  template: `
    <div class="prospect-form-container">
      <!-- Header - PARIDAD: Rails admin/prospects/new.html.erb y edit.html.erb -->
      <div class="page-header">
        <a routerLink="/app/prospects" class="btn btn-secondary">
          <i class="ph ph-arrow-left"></i>
          Volver
        </a>
        <div class="title-container">
          <h1>{{ isEditMode() ? 'Editar' : 'Crear' }} prospecto</h1>
        </div>
      </div>

      <!-- Form - PARIDAD: Rails simple_form _form.html.erb -->
      <form (ngSubmit)="onSubmit()" #prospectForm="ngForm">
        <!-- Error Messages -->
        @if (errors().length > 0) {
          <div class="panel panel-danger">
            <div class="panel-heading">
              <h2 class="panel-title">{{ errors().length }} error(es) al intentar guardar los datos</h2>
            </div>
            <div class="panel-body">
              <ul>
                @for (error of errors(); track error) {
                  <li>{{ error }}</li>
                }
              </ul>
            </div>
          </div>
        }

        <div class="form-inputs">
          <div class="card">
            <div class="card-body">
              <h5 class="card-title">Detalles</h5>
              <div class="row">
                <div class="col-lg-12">
                  <!-- Name -->
                  <div class="form-group">
                    <label for="name" class="form-label">Nombre <span class="required">*</span></label>
                    <input
                      type="text"
                      id="name"
                      class="form-control"
                      [(ngModel)]="formData.name"
                      name="name"
                      required
                      placeholder="Nombre completo del prospecto"
                    />
                  </div>

                  <!-- Phone -->
                  <div class="form-group">
                    <label for="phone" class="form-label">Teléfono <span class="required">*</span></label>
                    <input
                      type="tel"
                      id="phone"
                      class="form-control"
                      [(ngModel)]="formData.phone"
                      name="phone"
                      required
                      placeholder="Número de teléfono (sin código de país)"
                      [readonly]="isEditMode()"
                    />
                    @if (isEditMode()) {
                      <small class="form-text text-muted">El teléfono no se puede modificar</small>
                    }
                  </div>

                  <!-- Status (solo en edición) -->
                  @if (isEditMode()) {
                    <div class="form-group">
                      <label for="status" class="form-label">Estado</label>
                      <select
                        id="status"
                        class="form-control"
                        [(ngModel)]="formData.status"
                        name="status"
                      >
                        <option value="active">Activo</option>
                        <option value="inactive">Inactivo</option>
                        <option value="pending">Pendiente</option>
                      </select>
                    </div>
                  }
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="form-actions">
          <button
            type="submit"
            class="btn btn-primary"
            [disabled]="!prospectForm.valid || isSubmitting()"
          >
            @if (isSubmitting()) {
              <span class="spinner-border spinner-border-sm"></span>
              Guardando...
            } @else {
              Guardar
            }
          </button>
          <a routerLink="/app/prospects" class="btn btn-secondary">
            Cancelar
          </a>
        </div>
      </form>

      @if (isLoading()) {
        <app-loading-spinner [overlay]="true" message="Cargando..." />
      }
    </div>
  `,
  styles: [`
    .prospect-form-container {
      padding: 24px;
    }

    .page-header {
      margin-bottom: 24px;
    }

    .title-container {
      margin-top: 16px;

      h1 {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 500;
        color: var(--text-primary, #212529);
      }
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border: 1px solid transparent;
      border-radius: 4px;
      font-size: 14px;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.15s;

      &:disabled {
        opacity: 0.65;
        cursor: not-allowed;
      }
    }

    .btn-primary {
      background-color: var(--primary-color, #0d6efd);
      border-color: var(--primary-color, #0d6efd);
      color: white;

      &:hover:not(:disabled) {
        background-color: var(--primary-dark, #0b5ed7);
      }
    }

    .btn-secondary {
      background-color: var(--secondary-color, #6c757d);
      border-color: var(--secondary-color, #6c757d);
      color: white;

      &:hover:not(:disabled) {
        background-color: #5c636a;
      }
    }

    /* Panel Error - PARIDAD: Rails panel-danger */
    .panel-danger {
      border: 1px solid #f5c6cb;
      border-radius: 4px;
      margin-bottom: 20px;
    }

    .panel-danger .panel-heading {
      background-color: #f8d7da;
      padding: 12px 16px;
      border-bottom: 1px solid #f5c6cb;
    }

    .panel-danger .panel-title {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: #721c24;
    }

    .panel-danger .panel-body {
      padding: 12px 16px;
      background: #fff;

      ul {
        margin: 0;
        padding-left: 20px;
        color: #721c24;
      }
    }

    /* Card - PARIDAD: Rails card */
    .card {
      border: 1px solid var(--border-color, #dee2e6);
      border-radius: 4px;
      background: white;
    }

    .card-body {
      padding: 20px;
    }

    .card-title {
      margin: 0 0 16px 0;
      font-size: 1.1rem;
      font-weight: 500;
      color: var(--text-primary, #212529);
    }

    /* Form Controls */
    .form-group {
      margin-bottom: 16px;
    }

    .form-label {
      display: block;
      margin-bottom: 8px;
      font-weight: 500;
      color: var(--text-primary, #212529);

      .required {
        color: var(--danger-color, #dc3545);
      }
    }

    .form-control {
      display: block;
      width: 100%;
      padding: 8px 12px;
      font-size: 14px;
      border: 1px solid var(--border-color, #ced4da);
      border-radius: 4px;
      transition: border-color 0.15s;

      &:focus {
        outline: none;
        border-color: var(--primary-color, #86b7fe);
        box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.25);
      }

      &[readonly] {
        background-color: #e9ecef;
        cursor: not-allowed;
      }
    }

    .form-text {
      display: block;
      margin-top: 4px;
      font-size: 12px;
    }

    .text-muted {
      color: var(--text-secondary, #6c757d);
    }

    /* Form Actions */
    .form-actions {
      margin-top: 20px;
      display: flex;
      gap: 12px;
    }

    .spinner-border-sm {
      width: 16px;
      height: 16px;
      border-width: 2px;
    }

    @media (max-width: 768px) {
      .prospect-form-container { padding: 16px; }
      .form-actions { flex-direction: column; }
      .form-actions .btn { width: 100%; justify-content: center; }
    }
  `]
})
export class ProspectFormComponent implements OnInit, OnDestroy {
  private prospectService = inject(ProspectService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);
  private destroy$ = new Subject<void>();

  // Form state
  isEditMode = signal(false);
  isLoading = signal(false);
  isSubmitting = signal(false);
  errors = signal<string[]>([]);
  prospectId: number | null = null;

  // Form data
  formData = {
    name: '',
    phone: '',
    status: 'active'
  };

  ngOnInit(): void {
    this.route.params.pipe(
      takeUntil(this.destroy$)
    ).subscribe(params => {
      if (params['id']) {
        this.prospectId = +params['id'];
        this.isEditMode.set(true);
        this.loadProspect();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadProspect(): void {
    if (!this.prospectId) return;

    this.isLoading.set(true);

    this.prospectService.getProspect(this.prospectId).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (prospect) => {
        this.formData = {
          name: prospect.name || '',
          phone: prospect.phone || '',
          status: prospect.status || 'active'
        };
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading prospect:', err);
        this.toast.error('Error al cargar prospecto');
        this.isLoading.set(false);
        this.router.navigate(['/app/prospects']);
      }
    });
  }

  onSubmit(): void {
    this.errors.set([]);

    // Validation
    if (!this.formData.name.trim()) {
      this.errors.set(['El nombre es requerido']);
      return;
    }

    if (!this.isEditMode() && !this.formData.phone.trim()) {
      this.errors.set(['El teléfono es requerido']);
      return;
    }

    this.isSubmitting.set(true);

    if (this.isEditMode() && this.prospectId) {
      // Update
      this.prospectService.updateProspect(this.prospectId, {
        name: this.formData.name,
        status: this.formData.status
      }).pipe(
        takeUntil(this.destroy$)
      ).subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.toast.success('Prospecto actualizado correctamente');
          this.router.navigate(['/app/prospects', this.prospectId]);
        },
        error: (err) => {
          console.error('Error updating prospect:', err);
          this.isSubmitting.set(false);
          if (err.error?.message) {
            this.errors.set([err.error.message]);
          } else {
            this.errors.set(['Error al actualizar prospecto']);
          }
        }
      });
    } else {
      // Create
      this.prospectService.createProspect({
        name: this.formData.name,
        phone: this.formData.phone
      }).pipe(
        takeUntil(this.destroy$)
      ).subscribe({
        next: (response) => {
          this.isSubmitting.set(false);
          this.toast.success('Prospecto creado correctamente');
          this.router.navigate(['/app/prospects', response.prospect.id]);
        },
        error: (err) => {
          console.error('Error creating prospect:', err);
          this.isSubmitting.set(false);
          if (err.error?.message) {
            this.errors.set([err.error.message]);
          } else {
            this.errors.set(['Error al crear prospecto']);
          }
        }
      });
    }
  }
}
