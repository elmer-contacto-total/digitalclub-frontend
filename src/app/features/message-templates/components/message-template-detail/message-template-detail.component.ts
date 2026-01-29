/**
 * Message Template Detail Component
 * PARIDAD: Rails admin/message_templates/show.html.erb
 * Vista de detalle de plantilla con preview
 */
import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { MessageTemplateService, MessageTemplate, TemplateStatus } from '../../../../core/services/message-template.service';
import { ToastService } from '../../../../core/services/toast.service';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-message-template-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    LoadingSpinnerComponent
  ],
  template: `
    <div class="template-detail-container">
      <!-- Header - PARIDAD: Rails admin/message_templates/show.html.erb -->
      <div class="page-header">
        <a routerLink="/app/message_templates" class="btn btn-secondary">
          <i class="ph ph-list"></i>
          Volver
        </a>
        <div class="title-container">
          <h1>Ver plantilla de mensaje</h1>
        </div>
      </div>

      @if (isLoading()) {
        <app-loading-spinner [overlay]="false" message="Cargando..." />
      } @else if (template()) {
        <div class="row">
          <!-- Detail Fields - PARIDAD: Rails dl-horizontal -->
          <div class="col-lg-6">
            <dl class="dl-horizontal">
              <dt>Nombre:</dt>
              <dd>{{ template()?.name }}</dd>
            </dl>

            <dl class="dl-horizontal">
              <dt>Categoría:</dt>
              <dd>{{ getCategoryLabel(template()!.category) }}</dd>
            </dl>

            <dl class="dl-horizontal">
              <dt>Tipo de Template:</dt>
              <dd>{{ getTemplateTypeLabel(template()!.templateWhatsappType) }}</dd>
            </dl>

            <dl class="dl-horizontal">
              <dt>Idioma:</dt>
              <dd>{{ template()?.languageName || template()?.language || '-' }}</dd>
            </dl>

            <dl class="dl-horizontal">
              <dt>Tipo de Media (Header):</dt>
              <dd>{{ getHeaderMediaTypeLabel(template()!.headerMediaType) }}</dd>
            </dl>

            @if (template()?.headerContent) {
              <dl class="dl-horizontal">
                <dt>Contenido del Header:</dt>
                <dd>{{ template()?.headerContent }}</dd>
              </dl>
            }

            <dl class="dl-horizontal">
              <dt>Contenido del Body:</dt>
              <dd class="body-content">{{ template()?.bodyContent || '-' }}</dd>
            </dl>

            @if (template()?.footerContent) {
              <dl class="dl-horizontal">
                <dt>Contenido del Footer:</dt>
                <dd>{{ template()?.footerContent }}</dd>
              </dl>
            }

            <dl class="dl-horizontal">
              <dt>Total Botones:</dt>
              <dd>{{ template()?.totButtons || 0 }}</dd>
            </dl>

            <dl class="dl-horizontal">
              <dt>Estado WhatsApp:</dt>
              <dd>
                <span class="badge" [ngClass]="getStatusClass(template()!.status)">
                  {{ getStatusLabel(template()!.status) }}
                </span>
              </dd>
            </dl>

            <dl class="dl-horizontal">
              <dt>Visibilidad:</dt>
              <dd>{{ template()?.visibility === 0 ? 'Todos' : 'Privado' }}</dd>
            </dl>

            <dl class="dl-horizontal">
              <dt>Cierra Ticket:</dt>
              <dd>{{ template()?.closesTicket ? 'Sí' : 'No' }}</dd>
            </dl>
          </div>

          <!-- Preview - PARIDAD: Rails _message_template_preview -->
          <div class="col-lg-4">
            <div class="preview-container">
              <div class="preview-title">Vista Previa</div>
              <div class="whatsapp-preview">
                <div class="message-bubble">
                  @if (template()?.headerContent) {
                    <div class="message-header">{{ template()?.headerContent }}</div>
                  }
                  <div class="message-body">{{ template()?.bodyContent || 'Sin contenido' }}</div>
                  @if (template()?.footerContent) {
                    <div class="message-footer">{{ template()?.footerContent }}</div>
                  }
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Parameters Section -->
        @if (template()?.params && template()!.params!.length > 0) {
          <div class="params-section">
            <h3>Parámetros</h3>
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
                  @for (param of template()!.params; track param.id) {
                    <tr>
                      <td>{{ param.component }}</td>
                      <td>{{ param.position }}</td>
                      <td>{{ param.dataField || '-' }}</td>
                      <td>{{ param.defaultValue || '-' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }

        <!-- Actions -->
        <div class="form-actions">
          <a [routerLink]="['/app/message_templates', template()?.id, 'params']" class="btn btn-primary">
            <i class="ph ph-gear"></i>
            Configurar Parámetros
          </a>
        </div>
      }
    </div>
  `,
  styles: [`
    .template-detail-container {
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

    .col-lg-4 {
      width: 350px;
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
    }

    .btn-primary {
      background-color: var(--primary-color, #0d6efd);
      border-color: var(--primary-color, #0d6efd);
      color: white;

      &:hover {
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

    /* DL Horizontal - PARIDAD: Rails dl-horizontal */
    .dl-horizontal {
      display: flex;
      margin: 0 0 12px 0;
      padding: 12px 16px;
      background: white;
      border: 1px solid var(--border-color, #dee2e6);
      border-radius: 4px;

      dt {
        min-width: 180px;
        font-weight: 600;
        color: var(--text-primary, #212529);
      }

      dd {
        margin: 0;
        color: var(--text-secondary, #6c757d);
        flex: 1;
      }

      .body-content {
        white-space: pre-wrap;
        word-break: break-word;
      }
    }

    /* Badge */
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
    }

    .badge-secondary { background: #e9ecef; color: #495057; }
    .badge-success { background: #d1fae5; color: #065f46; }
    .badge-danger { background: #fee2e2; color: #991b1b; }
    .badge-warning { background: #fff3cd; color: #856404; }

    /* Preview - PARIDAD: Rails WhatsApp preview */
    .preview-container {
      background: #e5ddd5;
      border-radius: 8px;
      padding: 16px;
    }

    .preview-title {
      font-weight: 600;
      margin-bottom: 12px;
      color: var(--text-primary);
    }

    .whatsapp-preview {
      display: flex;
      justify-content: flex-start;
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
      color: var(--text-primary);
    }

    .message-body {
      color: var(--text-primary);
      white-space: pre-wrap;
      word-break: break-word;
    }

    .message-footer {
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 8px;
    }

    /* Params Section */
    .params-section {
      margin-top: 32px;

      h3 {
        font-size: 1.1rem;
        font-weight: 500;
        margin-bottom: 16px;
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

    .form-actions {
      margin-top: 24px;
    }

    @media (max-width: 768px) {
      .template-detail-container { padding: 16px; }
      .row { flex-direction: column; }
      .col-lg-4 { width: 100%; }
      .dl-horizontal { flex-direction: column; }
      .dl-horizontal dt { margin-bottom: 4px; }
    }
  `]
})
export class MessageTemplateDetailComponent implements OnInit, OnDestroy {
  private templateService = inject(MessageTemplateService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);
  private destroy$ = new Subject<void>();

  // Data
  template = signal<MessageTemplate | null>(null);
  isLoading = signal(true);

  ngOnInit(): void {
    this.route.params.pipe(
      takeUntil(this.destroy$)
    ).subscribe(params => {
      if (params['id']) {
        this.loadTemplate(+params['id']);
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadTemplate(id: number): void {
    this.isLoading.set(true);

    this.templateService.getTemplate(id).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (template) => {
        this.template.set(template);
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

  getStatusLabel(status: TemplateStatus): string {
    return this.templateService.getStatusLabel(status);
  }

  getStatusClass(status: TemplateStatus): string {
    return this.templateService.getStatusClass(status);
  }

  getCategoryLabel(category: number): string {
    return this.templateService.getCategoryLabel(category);
  }

  getTemplateTypeLabel(type: number): string {
    return this.templateService.getTemplateTypeLabel(type);
  }

  getHeaderMediaTypeLabel(type: number): string {
    return this.templateService.getHeaderMediaTypeLabel(type);
  }
}
