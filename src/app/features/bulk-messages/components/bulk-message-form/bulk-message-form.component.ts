/**
 * Bulk Message Form Component
 * PARIDAD: Rails admin/bulk_messages/_form.html.erb
 * Formulario para crear/editar mensaje masivo
 */
import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { BulkMessageService } from '../../../../core/services/bulk-message.service';
import { ToastService } from '../../../../core/services/toast.service';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-bulk-message-form',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FormsModule,
    LoadingSpinnerComponent
  ],
  template: `
    <div class="bulk-message-form-container">
      <!-- Header -->
      <div class="page-header">
        <a routerLink="/app/bulk_messages" class="btn btn-secondary">
          <i class="ph ph-list"></i>
          Volver
        </a>
        <div class="title-container">
          <h1>{{ isEditMode() ? 'Editar' : 'Crear' }} mensaje masivo</h1>
        </div>
      </div>

      @if (isLoading()) {
        <app-loading-spinner [overlay]="false" message="Cargando..." />
      } @else {
        <!-- Form - PARIDAD: Rails admin/bulk_messages/_form.html.erb -->
        <form (ngSubmit)="onSubmit()" #formRef="ngForm">
          @if (errors().length > 0) {
            <div class="panel panel-danger">
              <div class="panel-heading">
                <h2 class="panel-title">{{ errors().length }} error(es) al intentar guardar</h2>
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

          <div class="card">
            <div class="card-body">
              <h5 class="card-title">Detalles</h5>

              <div class="row">
                <div class="col-lg-12">
                  <!-- Mensaje -->
                  <div class="form-group">
                    <label for="message" class="form-label">Mensaje <span class="required">*</span></label>
                    <textarea
                      id="message"
                      name="message"
                      class="form-control"
                      [(ngModel)]="formData.message"
                      required
                      rows="5"
                      placeholder="Escriba el mensaje masivo..."
                    ></textarea>
                  </div>

                  <!-- Disponible para Todos -->
                  <div class="form-group">
                    <div class="form-check">
                      <input
                        type="checkbox"
                        id="clientGlobal"
                        name="clientGlobal"
                        class="form-check-input"
                        [(ngModel)]="formData.clientGlobal"
                      />
                      <label for="clientGlobal" class="form-check-label">
                        Disponible para Todos
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="form-actions">
            <button
              type="submit"
              class="btn btn-primary"
              [disabled]="isSaving() || !formData.message"
            >
              @if (isSaving()) {
                <span class="spinner-border spinner-border-sm"></span>
                Guardando...
              } @else {
                <i class="ph ph-floppy-disk"></i>
                Guardar
              }
            </button>
          </div>
        </form>
      }
    </div>
  `,
  styles: [`
    .bulk-message-form-container {
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

      &:hover {
        background-color: #5c636a;
      }
    }

    .spinner-border-sm {
      width: 16px;
      height: 16px;
      border-width: 2px;
    }

    /* Error Panel */
    .panel-danger {
      background: #fee2e2;
      border: 1px solid #fca5a5;
      border-radius: 4px;
      margin-bottom: 20px;
    }

    .panel-heading {
      padding: 12px 16px;
      border-bottom: 1px solid #fca5a5;

      .panel-title {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        color: #991b1b;
      }
    }

    .panel-body {
      padding: 12px 16px;

      ul {
        margin: 0;
        padding-left: 20px;
        color: #991b1b;
      }
    }

    /* Card */
    .card {
      background: white;
      border: 1px solid var(--border-color, #dee2e6);
      border-radius: 4px;
      margin-bottom: 20px;
    }

    .card-body {
      padding: 20px;
    }

    .card-title {
      margin: 0 0 16px 0;
      font-size: 1.1rem;
      font-weight: 500;
    }

    /* Form */
    .form-group {
      margin-bottom: 16px;
    }

    .form-label {
      display: block;
      margin-bottom: 6px;
      font-weight: 500;
      font-size: 14px;

      .required {
        color: #dc3545;
      }
    }

    .form-control {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid var(--border-color, #ced4da);
      border-radius: 4px;
      font-size: 14px;

      &:focus {
        outline: none;
        border-color: var(--primary-color, #86b7fe);
        box-shadow: 0 0 0 3px rgba(13, 110, 253, 0.1);
      }
    }

    textarea.form-control {
      resize: vertical;
      min-height: 120px;
    }

    .form-check {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .form-check-input {
      width: 18px;
      height: 18px;
      cursor: pointer;
    }

    .form-check-label {
      cursor: pointer;
      font-size: 14px;
    }

    .form-actions {
      margin-top: 20px;
    }

    @media (max-width: 768px) {
      .bulk-message-form-container { padding: 16px; }
    }
  `]
})
export class BulkMessageFormComponent implements OnInit, OnDestroy {
  private bulkMessageService = inject(BulkMessageService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);
  private destroy$ = new Subject<void>();

  // State
  isEditMode = signal(false);
  isLoading = signal(false);
  isSaving = signal(false);
  errors = signal<string[]>([]);

  // Form data
  formData = {
    message: '',
    clientGlobal: false
  };

  private messageId: number | null = null;

  ngOnInit(): void {
    this.route.params.pipe(
      takeUntil(this.destroy$)
    ).subscribe(params => {
      if (params['id']) {
        this.messageId = +params['id'];
        this.isEditMode.set(true);
        this.loadBulkMessage();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadBulkMessage(): void {
    if (!this.messageId) return;

    this.isLoading.set(true);

    this.bulkMessageService.getBulkMessage(this.messageId).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (message) => {
        this.formData.message = message.message;
        this.formData.clientGlobal = message.client_global;
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading bulk message:', err);
        this.toast.error('Error al cargar mensaje');
        this.isLoading.set(false);
        this.router.navigate(['/app/bulk_messages']);
      }
    });
  }

  onSubmit(): void {
    this.errors.set([]);

    if (!this.formData.message.trim()) {
      this.errors.set(['El mensaje es requerido']);
      return;
    }

    this.isSaving.set(true);

    if (this.isEditMode() && this.messageId) {
      this.updateMessage();
    } else {
      this.createMessage();
    }
  }

  private createMessage(): void {
    this.bulkMessageService.createBulkMessage({
      message: this.formData.message.trim(),
      clientGlobal: this.formData.clientGlobal
    }).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.toast.success('Mensaje masivo creado');
        this.router.navigate(['/app/bulk_messages']);
      },
      error: (err) => {
        console.error('Error creating bulk message:', err);
        this.isSaving.set(false);
        this.errors.set([err.error?.message || 'Error al crear mensaje']);
      }
    });
  }

  private updateMessage(): void {
    if (!this.messageId) return;

    this.bulkMessageService.updateBulkMessage(this.messageId, {
      message: this.formData.message.trim(),
      clientGlobal: this.formData.clientGlobal
    }).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.toast.success('Mensaje masivo actualizado');
        this.router.navigate(['/app/bulk_messages']);
      },
      error: (err) => {
        console.error('Error updating bulk message:', err);
        this.isSaving.set(false);
        this.errors.set([err.error?.message || 'Error al actualizar mensaje']);
      }
    });
  }
}
