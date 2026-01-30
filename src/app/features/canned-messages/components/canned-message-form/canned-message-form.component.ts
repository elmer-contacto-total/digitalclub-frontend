/**
 * Canned Message Form Component
 * PARIDAD: Rails admin/canned_messages/_form.html.erb
 * Formulario para crear/editar mensaje enlatado
 */
import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { CannedMessageService } from '../../../../core/services/canned-message.service';
import { ToastService } from '../../../../core/services/toast.service';

@Component({
  selector: 'app-canned-message-form',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="canned-message-form-container">
      <!-- Breadcrumb -->
      <nav class="breadcrumb">
        <a routerLink="/app/canned_messages" class="breadcrumb-link">
          <i class="ph ph-chat-centered-text"></i>
          Respuestas Rápidas
        </a>
        <i class="ph ph-caret-right breadcrumb-separator"></i>
        <span class="breadcrumb-current">{{ isEditMode() ? 'Editar' : 'Nueva' }}</span>
      </nav>

      <!-- Page Header -->
      <div class="page-header">
        <div class="page-header-content">
          <h1 class="page-title">{{ isEditMode() ? 'Editar Respuesta' : 'Nueva Respuesta Rápida' }}</h1>
          <p class="page-subtitle">
            {{ isEditMode() ? 'Modifica el contenido de tu respuesta rápida' : 'Crea un mensaje predefinido para usar en tus conversaciones' }}
          </p>
        </div>
      </div>

      @if (isLoading()) {
        <div class="loading-container">
          <div class="spinner"></div>
          <p>Cargando...</p>
        </div>
      } @else {
        <!-- Form Card -->
        <div class="form-card">
          <!-- Error Alert -->
          @if (errors().length > 0) {
            <div class="alert alert-error">
              <div class="alert-icon">
                <i class="ph-fill ph-warning-circle"></i>
              </div>
              <div class="alert-content">
                <h4>Error al guardar</h4>
                <ul>
                  @for (error of errors(); track error) {
                    <li>{{ error }}</li>
                  }
                </ul>
              </div>
              <button class="alert-close" (click)="errors.set([])">
                <i class="ph ph-x"></i>
              </button>
            </div>
          }

          <form (ngSubmit)="onSubmit()" #formRef="ngForm">
            <!-- Message Field -->
            <div class="form-section">
              <div class="form-group">
                <label for="message" class="form-label">
                  <i class="ph ph-text-aa"></i>
                  Contenido del mensaje
                  <span class="required">*</span>
                </label>
                <div class="textarea-wrapper">
                  <textarea
                    id="message"
                    name="message"
                    class="form-textarea"
                    [(ngModel)]="formData.message"
                    required
                    rows="6"
                    placeholder="Escribe el contenido de tu respuesta rápida..."
                    #messageInput="ngModel"
                  ></textarea>
                  <div class="textarea-footer">
                    <span class="char-count" [class.warning]="formData.message.length > 900">
                      {{ formData.message.length }} / 1000
                    </span>
                  </div>
                </div>
                @if (messageInput.invalid && messageInput.touched) {
                  <span class="form-error">El mensaje es requerido</span>
                }
                <p class="form-hint">
                  Este mensaje aparecerá como opción rápida al escribir en el chat.
                </p>
              </div>
            </div>

            <!-- Visibility Section -->
            <div class="form-section">
              <h3 class="section-title">
                <i class="ph ph-eye"></i>
                Visibilidad
              </h3>

              <div class="visibility-options">
                <label class="visibility-card" [class.selected]="!formData.clientGlobal">
                  <input
                    type="radio"
                    name="visibility"
                    [value]="false"
                    [(ngModel)]="formData.clientGlobal"
                  />
                  <div class="visibility-icon">
                    <i class="ph-fill ph-user"></i>
                  </div>
                  <div class="visibility-content">
                    <strong>Solo para mí</strong>
                    <span>Esta respuesta solo estará disponible para ti</span>
                  </div>
                  <div class="visibility-check">
                    <i class="ph-fill ph-check-circle"></i>
                  </div>
                </label>

                <label class="visibility-card" [class.selected]="formData.clientGlobal">
                  <input
                    type="radio"
                    name="visibility"
                    [value]="true"
                    [(ngModel)]="formData.clientGlobal"
                  />
                  <div class="visibility-icon global">
                    <i class="ph-fill ph-globe"></i>
                  </div>
                  <div class="visibility-content">
                    <strong>Disponible para todos</strong>
                    <span>Todos los usuarios podrán usar esta respuesta</span>
                  </div>
                  <div class="visibility-check">
                    <i class="ph-fill ph-check-circle"></i>
                  </div>
                </label>
              </div>
            </div>

            <!-- Preview Section -->
            @if (formData.message.trim()) {
              <div class="form-section">
                <h3 class="section-title">
                  <i class="ph ph-eye"></i>
                  Vista previa
                </h3>
                <div class="preview-card">
                  <div class="preview-bubble">
                    <p>{{ formData.message }}</p>
                    <span class="preview-time">Ahora</span>
                  </div>
                </div>
              </div>
            }

            <!-- Form Actions -->
            <div class="form-actions">
              <a routerLink="/app/canned_messages" class="btn-secondary">
                <i class="ph ph-x"></i>
                Cancelar
              </a>
              <button
                type="submit"
                class="btn-primary"
                [disabled]="isSaving() || !formData.message.trim()"
              >
                @if (isSaving()) {
                  <div class="spinner-sm"></div>
                  Guardando...
                } @else {
                  <i class="ph-fill ph-floppy-disk"></i>
                  {{ isEditMode() ? 'Guardar cambios' : 'Crear respuesta' }}
                }
              </button>
            </div>
          </form>
        </div>
      }
    </div>
  `,
  styleUrls: ['./canned-message-form.component.scss']
})
export class CannedMessageFormComponent implements OnInit, OnDestroy {
  private cannedMessageService = inject(CannedMessageService);
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
        this.loadCannedMessage();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadCannedMessage(): void {
    if (!this.messageId) return;

    this.isLoading.set(true);

    this.cannedMessageService.getCannedMessage(this.messageId).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (message) => {
        this.formData.message = message.message;
        this.formData.clientGlobal = message.client_global;
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading canned message:', err);
        this.toast.error('Error al cargar respuesta');
        this.isLoading.set(false);
        this.router.navigate(['/app/canned_messages']);
      }
    });
  }

  onSubmit(): void {
    this.errors.set([]);

    // Validate
    if (!this.formData.message.trim()) {
      this.errors.set(['El mensaje es requerido']);
      return;
    }

    if (this.formData.message.length > 1000) {
      this.errors.set(['El mensaje no puede exceder 1000 caracteres']);
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
    this.cannedMessageService.createCannedMessage({
      message: this.formData.message.trim(),
      clientGlobal: this.formData.clientGlobal
    }).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.toast.success('Respuesta rápida creada');
        this.router.navigate(['/app/canned_messages']);
      },
      error: (err) => {
        console.error('Error creating canned message:', err);
        this.isSaving.set(false);
        this.errors.set([err.error?.message || 'Error al crear respuesta']);
      }
    });
  }

  private updateMessage(): void {
    if (!this.messageId) return;

    this.cannedMessageService.updateCannedMessage(this.messageId, {
      message: this.formData.message.trim(),
      clientGlobal: this.formData.clientGlobal
    }).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.toast.success('Respuesta rápida actualizada');
        this.router.navigate(['/app/canned_messages']);
      },
      error: (err) => {
        console.error('Error updating canned message:', err);
        this.isSaving.set(false);
        this.errors.set([err.error?.message || 'Error al actualizar respuesta']);
      }
    });
  }
}
