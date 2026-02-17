/**
 * Template Params Component
 * PARIDAD: Rails admin/message_template_params/index
 * Configuración de parámetros de plantilla
 */
import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { MessageTemplateService, MessageTemplate, MessageTemplateParam } from '../../../../core/services/message-template.service';
import { ToastService } from '../../../../core/services/toast.service';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-template-params',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FormsModule,
    LoadingSpinnerComponent
  ],
  template: `
    <div class="template-params-container">
      <!-- Header -->
      <div class="page-header">
        <a [routerLink]="['/app/message_templates', templateId]" class="btn btn-secondary">
          <i class="ph ph-arrow-left"></i>
          Volver
        </a>
        <div class="title-container">
          <h1>Parámetros de Plantilla</h1>
          @if (template()) {
            <p class="template-name">{{ template()?.name }}</p>
          }
        </div>
      </div>

      @if (isLoading()) {
        <app-loading-spinner [overlay]="false" message="Cargando..." />
      } @else if (template()) {
        <!-- Template Preview -->
        <div class="template-preview-card">
          <h3>Contenido de la Plantilla</h3>
          @if (template()?.headerContent) {
            <div class="content-section">
              <label>Header:</label>
              <p>{{ template()?.headerContent }}</p>
            </div>
          }
          <div class="content-section">
            <label>Body:</label>
            <p class="body-content">{{ template()?.bodyContent || '-' }}</p>
          </div>
          @if (template()?.footerContent) {
            <div class="content-section">
              <label>Footer:</label>
              <p>{{ template()?.footerContent }}</p>
            </div>
          }
        </div>

        <!-- Parameters Table -->
        <div class="params-section">
          <h3>Parámetros Detectados</h3>
          @if (params().length === 0) {
            <div class="empty-state">
              <p>Esta plantilla no tiene parámetros configurables.</p>
              <p class="hint">Los parámetros se detectan automáticamente en el formato {{1}}, {{2}}, etc.</p>
            </div>
          } @else {
            <div class="table-responsive">
              <table class="table table-striped table-bordered">
                <thead>
                  <tr>
                    <th>Componente</th>
                    <th>Posición</th>
                    <th>Campo de Datos</th>
                    <th>Valor por Defecto</th>
                  </tr>
                </thead>
                <tbody>
                  @for (param of params(); track param.id; let i = $index) {
                    <tr>
                      <td>
                        <select [(ngModel)]="param.component" class="form-control form-control-sm">
                          <option value="header">Header</option>
                          <option value="body">Body</option>
                          <option value="footer">Footer</option>
                          <option value="button">Botón</option>
                        </select>
                      </td>
                      <td>{{ param.position }}</td>
                      <td>
                        <select [(ngModel)]="param.dataField" class="form-control form-control-sm">
                          <option value="">-- Seleccionar --</option>
                          <option value="user_name">Nombre de Usuario</option>
                          <option value="user_first_name">Primer Nombre</option>
                          <option value="user_last_name">Apellido</option>
                          <option value="user_phone">Teléfono</option>
                          <option value="user_email">Email</option>
                          <option value="agent_name">Nombre del Agente</option>
                          <option value="client_name">Nombre del Cliente</option>
                          <option value="custom">Personalizado</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="text"
                          class="form-control form-control-sm"
                          [(ngModel)]="param.defaultValue"
                          placeholder="Valor por defecto"
                        />
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            <div class="form-actions">
              <button
                type="button"
                class="btn btn-primary"
                (click)="saveParams()"
                [disabled]="isSaving()"
              >
                @if (isSaving()) {
                  <span class="spinner-border spinner-border-sm"></span>
                  Guardando...
                } @else {
                  <i class="ph ph-floppy-disk"></i>
                  Guardar Parámetros
                }
              </button>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .template-params-container {
      padding: 24px;
    }

    .page-header {
      margin-bottom: 24px;
    }

    .title-container {
      margin-top: 16px;

      h1 {
        margin: 0 0 8px 0;
        font-size: 1.5rem;
        font-weight: 500;
        color: var(--text-primary, #212529);
      }

      .template-name {
        margin: 0;
        font-size: 14px;
        color: var(--text-secondary, #6c757d);
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

    /* Template Preview Card */
    .template-preview-card {
      background: white;
      border: 1px solid var(--border-color, #dee2e6);
      border-radius: 4px;
      padding: 20px;
      margin-bottom: 24px;

      h3 {
        margin: 0 0 16px 0;
        font-size: 1.1rem;
        font-weight: 500;
      }
    }

    .content-section {
      margin-bottom: 12px;

      label {
        display: block;
        font-weight: 600;
        font-size: 12px;
        color: var(--text-secondary);
        margin-bottom: 4px;
        text-transform: uppercase;
      }

      p {
        margin: 0;
        padding: 8px 12px;
        background: var(--bg-light, #f8f9fa);
        border-radius: 4px;
      }

      .body-content {
        white-space: pre-wrap;
        word-break: break-word;
      }
    }

    /* Params Section */
    .params-section {
      h3 {
        margin: 0 0 16px 0;
        font-size: 1.1rem;
        font-weight: 500;
      }
    }

    .empty-state {
      background: var(--bg-light, #f8f9fa);
      border: 1px dashed var(--border-color, #dee2e6);
      border-radius: 4px;
      padding: 24px;
      text-align: center;

      p {
        margin: 0;
        color: var(--text-secondary, #6c757d);
      }

      .hint {
        margin-top: 8px;
        font-size: 13px;
      }
    }

    .table-responsive {
      background: white;
      border-radius: 4px;
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
      padding: 12px;
      border: 1px solid var(--border-color, #dee2e6);
    }

    .table thead th {
      background: var(--bg-light, #f8f9fa);
      font-weight: 600;
    }

    .form-control {
      width: 100%;
      padding: 6px 10px;
      border: 1px solid var(--border-color, #ced4da);
      border-radius: 4px;
      font-size: 14px;

      &:focus {
        outline: none;
        border-color: var(--primary-color, #86b7fe);
      }
    }

    .form-control-sm {
      padding: 4px 8px;
      font-size: 13px;
    }

    .form-actions {
      margin-top: 20px;
    }

    .spinner-border-sm {
      width: 16px;
      height: 16px;
      border-width: 2px;
    }

    @media (max-width: 768px) {
      .template-params-container { padding: 16px; }
      .table-responsive { overflow-x: auto; }
      .table { min-width: 600px; }
    }
  `]
})
export class TemplateParamsComponent implements OnInit, OnDestroy {
  private templateService = inject(MessageTemplateService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);
  private destroy$ = new Subject<void>();

  // Data
  templateId = 0;
  template = signal<MessageTemplate | null>(null);
  params = signal<MessageTemplateParam[]>([]);
  isLoading = signal(true);
  isSaving = signal(false);

  ngOnInit(): void {
    this.route.params.pipe(
      takeUntil(this.destroy$)
    ).subscribe(params => {
      if (params['id']) {
        this.templateId = +params['id'];
        this.loadTemplate();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadTemplate(): void {
    this.isLoading.set(true);

    this.templateService.getTemplate(this.templateId).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (template) => {
        this.template.set(template);
        this.params.set(template.params ? [...template.params] : []);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading template:', err);
        this.toast.error('Error al cargar plantilla');
        this.isLoading.set(false);
        this.router.navigate(['/app/message_templates']);
      }
    });
  }

  saveParams(): void {
    this.isSaving.set(true);

    const paramsToSave = this.params().map(p => ({
      id: p.id,
      dataField: p.dataField,
      defaultValue: p.defaultValue
    }));

    this.templateService.updateParams(this.templateId, paramsToSave).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.toast.success('Parámetros guardados correctamente');
      },
      error: (err) => {
        console.error('Error saving params:', err);
        this.isSaving.set(false);
        this.toast.error('Error al guardar parámetros');
      }
    });
  }
}
