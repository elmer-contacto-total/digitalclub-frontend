/**
 * Template Bulk Send Form Component
 * PARIDAD: Rails admin/template_bulk_sends/_form.html.erb
 * Formulario para crear envío masivo de plantillas
 */
import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { TemplateBulkSendService, TemplateForBulkSend, BulkSendRecipient } from '../../../../core/services/template-bulk-send.service';
import { ToastService } from '../../../../core/services/toast.service';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-template-bulk-send-form',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FormsModule,
    LoadingSpinnerComponent
  ],
  template: `
    <div class="template-bulk-send-form-container">
      <!-- Header -->
      <div class="page-header">
        <a routerLink="/app/template_bulk_sends" class="btn btn-secondary">
          <i class="ph ph-list"></i>
          Volver
        </a>
        <div class="title-container">
          <h1>Crear Mensaje Masivo</h1>
        </div>
      </div>

      @if (isLoading()) {
        <app-loading-spinner [overlay]="false" message="Cargando..." />
      } @else {
        <!-- Form - PARIDAD: Rails admin/template_bulk_sends/_form.html.erb -->
        <form (ngSubmit)="onSubmit()" #formRef="ngForm">
          @if (errors().length > 0) {
            <div class="panel panel-danger">
              <div class="panel-heading">
                <h2 class="panel-title">{{ errors().length }} error(es)</h2>
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

          <div class="row">
            <!-- Left Column: Form -->
            <div class="col-lg-6">
              <div class="card">
                <div class="card-body">
                  <h5 class="card-title">Detalles</h5>

                  <!-- Seleccionar Plantilla -->
                  <div class="form-group">
                    <label for="templateId" class="form-label">Plantilla <span class="required">*</span></label>
                    <select
                      id="templateId"
                      name="templateId"
                      class="form-control"
                      [(ngModel)]="formData.templateId"
                      (change)="onTemplateChange()"
                      required
                    >
                      <option value="">Seleccione una Plantilla</option>
                      @for (template of templates(); track template.id) {
                        <option [value]="template.id">{{ template.name }}</option>
                      }
                    </select>
                  </div>

                  <!-- Destinatarios -->
                  <div class="form-group">
                    <label class="form-label">Destinatarios <span class="required">*</span></label>
                    <div class="recipients-controls">
                      <button type="button" class="btn btn-sm btn-outline" (click)="selectAllRecipients()">
                        Seleccionar Todos
                      </button>
                      <button type="button" class="btn btn-sm btn-outline" (click)="deselectAllRecipients()">
                        Deseleccionar Todos
                      </button>
                      <span class="selected-count">{{ selectedRecipientIds().length }} seleccionados</span>
                    </div>
                    <div class="recipients-list">
                      @for (recipient of recipients(); track recipient.id) {
                        <div class="recipient-item">
                          <input
                            type="checkbox"
                            [id]="'recipient_' + recipient.id"
                            [checked]="isRecipientSelected(recipient.id)"
                            (change)="toggleRecipient(recipient.id)"
                          />
                          <label [for]="'recipient_' + recipient.id">
                            {{ recipient.name }} - {{ recipient.phone }}
                          </label>
                        </div>
                      }
                      @if (recipients().length === 0) {
                        <p class="text-muted">No hay destinatarios con teléfono disponibles.</p>
                      }
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Right Column: Preview -->
            <div class="col-lg-6">
              @if (selectedTemplate()) {
                <div class="preview-card">
                  <h5 class="preview-title">Vista Previa</h5>
                  <div class="whatsapp-preview">
                    <div class="message-bubble">
                      @if (selectedTemplate()?.header_content) {
                        <div class="message-header">{{ selectedTemplate()?.header_content }}</div>
                      }
                      <div class="message-body">{{ selectedTemplate()?.body_content || 'Sin contenido' }}</div>
                      @if (selectedTemplate()?.footer_content) {
                        <div class="message-footer">{{ selectedTemplate()?.footer_content }}</div>
                      }
                    </div>
                  </div>
                  <div class="template-info">
                    <span class="info-item">
                      <strong>Idioma:</strong> {{ selectedTemplate()?.language || 'es' }}
                    </span>
                  </div>
                </div>
              } @else {
                <div class="preview-placeholder">
                  <i class="ph ph-chat-text"></i>
                  <p>Seleccione una plantilla para ver la vista previa</p>
                </div>
              }
            </div>
          </div>

          <div class="form-actions">
            <button
              type="submit"
              class="btn btn-primary"
              [disabled]="isSending() || !formData.templateId || selectedRecipientIds().length === 0"
            >
              @if (isSending()) {
                <span class="spinner-border spinner-border-sm"></span>
                Enviando...
              } @else {
                <i class="ph ph-paper-plane-tilt"></i>
                Enviar
              }
            </button>
          </div>
        </form>
      }
    </div>
  `,
  styles: [`
    .template-bulk-send-form-container {
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

    .row {
      display: flex;
      gap: 24px;
      flex-wrap: wrap;
    }

    .col-lg-6 {
      flex: 1;
      min-width: 300px;
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

    .btn-outline {
      background: white;
      border-color: var(--border-color, #ced4da);
      color: var(--text-primary, #212529);

      &:hover {
        background: var(--bg-light, #f8f9fa);
      }
    }

    .btn-sm {
      padding: 4px 10px;
      font-size: 12px;
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
      background: white;

      &:focus {
        outline: none;
        border-color: var(--primary-color, #86b7fe);
      }
    }

    /* Recipients */
    .recipients-controls {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
      align-items: center;
    }

    .selected-count {
      margin-left: auto;
      font-size: 13px;
      color: var(--text-secondary, #6c757d);
    }

    .recipients-list {
      max-height: 250px;
      overflow-y: auto;
      border: 1px solid var(--border-color, #dee2e6);
      border-radius: 4px;
      padding: 8px;
    }

    .recipient-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 4px;

      &:hover {
        background: var(--bg-light, #f8f9fa);
      }

      input[type="checkbox"] {
        width: 16px;
        height: 16px;
        cursor: pointer;
      }

      label {
        flex: 1;
        cursor: pointer;
        font-size: 14px;
      }
    }

    .text-muted {
      color: var(--text-secondary, #6c757d);
      font-size: 14px;
    }

    /* Preview */
    .preview-card {
      background: white;
      border: 1px solid var(--border-color, #dee2e6);
      border-radius: 4px;
      padding: 20px;
    }

    .preview-title {
      margin: 0 0 16px 0;
      font-size: 1.1rem;
      font-weight: 500;
    }

    .whatsapp-preview {
      background: #e5ddd5;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 12px;
    }

    .message-bubble {
      background: white;
      border-radius: 8px;
      padding: 8px 12px;
      max-width: 280px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.1);
    }

    .message-header {
      font-weight: 600;
      margin-bottom: 4px;
    }

    .message-body {
      white-space: pre-wrap;
      word-break: break-word;
    }

    .message-footer {
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 8px;
    }

    .template-info {
      display: flex;
      gap: 16px;
      font-size: 13px;
    }

    .info-item strong {
      margin-right: 4px;
    }

    .preview-placeholder {
      background: var(--bg-light, #f8f9fa);
      border: 1px dashed var(--border-color, #dee2e6);
      border-radius: 4px;
      padding: 40px;
      text-align: center;

      i {
        font-size: 48px;
        color: var(--text-secondary, #6c757d);
        margin-bottom: 12px;
      }

      p {
        margin: 0;
        color: var(--text-secondary, #6c757d);
      }
    }

    .form-actions {
      margin-top: 20px;
    }

    @media (max-width: 768px) {
      .template-bulk-send-form-container { padding: 16px; }
      .row { flex-direction: column; }
    }
  `]
})
export class TemplateBulkSendFormComponent implements OnInit, OnDestroy {
  private templateBulkSendService = inject(TemplateBulkSendService);
  private router = inject(Router);
  private toast = inject(ToastService);
  private destroy$ = new Subject<void>();

  // State
  isLoading = signal(true);
  isSending = signal(false);
  errors = signal<string[]>([]);

  // Data
  templates = signal<TemplateForBulkSend[]>([]);
  recipients = signal<BulkSendRecipient[]>([]);
  selectedTemplate = signal<TemplateForBulkSend | null>(null);
  selectedRecipientIds = signal<number[]>([]);

  // Form data
  formData = {
    templateId: ''
  };

  ngOnInit(): void {
    this.loadData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadData(): void {
    this.isLoading.set(true);

    // Load templates and recipients in parallel
    this.templateBulkSendService.getTemplates().pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        this.templates.set(response.templates || []);
      },
      error: (err) => {
        console.error('Error loading templates:', err);
        this.toast.error('Error al cargar plantillas');
      }
    });

    this.templateBulkSendService.getRecipients('with_phone').pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        this.recipients.set(response.recipients || []);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading recipients:', err);
        this.toast.error('Error al cargar destinatarios');
        this.isLoading.set(false);
      }
    });
  }

  onTemplateChange(): void {
    const templateId = +this.formData.templateId;
    if (templateId) {
      const template = this.templates().find(t => t.id === templateId);
      this.selectedTemplate.set(template || null);
    } else {
      this.selectedTemplate.set(null);
    }
  }

  isRecipientSelected(id: number): boolean {
    return this.selectedRecipientIds().includes(id);
  }

  toggleRecipient(id: number): void {
    const current = this.selectedRecipientIds();
    if (current.includes(id)) {
      this.selectedRecipientIds.set(current.filter(x => x !== id));
    } else {
      this.selectedRecipientIds.set([...current, id]);
    }
  }

  selectAllRecipients(): void {
    this.selectedRecipientIds.set(this.recipients().map(r => r.id));
  }

  deselectAllRecipients(): void {
    this.selectedRecipientIds.set([]);
  }

  onSubmit(): void {
    this.errors.set([]);

    if (!this.formData.templateId) {
      this.errors.set(['Debe seleccionar una plantilla']);
      return;
    }

    if (this.selectedRecipientIds().length === 0) {
      this.errors.set(['Debe seleccionar al menos un destinatario']);
      return;
    }

    this.isSending.set(true);

    this.templateBulkSendService.startBulkSend(
      +this.formData.templateId,
      this.selectedRecipientIds(),
      {}
    ).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        this.isSending.set(false);
        this.toast.success(`Envío iniciado: ${response.total_recipients} destinatarios`);
        this.router.navigate(['/app/template_bulk_sends']);
      },
      error: (err) => {
        console.error('Error starting bulk send:', err);
        this.isSending.set(false);
        this.errors.set([err.error?.message || 'Error al iniciar envío']);
      }
    });
  }
}
