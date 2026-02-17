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
      <!-- Page Header -->
      <div class="page-header">
        <div class="header-content">
          <a routerLink="/app/message_templates" class="btn btn-secondary">
            <i class="ph ph-arrow-left"></i>
            Volver
          </a>
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
                <span class="status-badge"
                  [class.approved]="template()!.status === 'approved'"
                  [class.pending]="template()!.status === 'pending' || template()!.status === 'draft'"
                  [class.rejected]="template()!.status === 'rejected'"
                  [class.disabled]="template()!.status === 'disabled'"
                >
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
      height: 100%;
      display: flex;
      flex-direction: column;
      background: var(--bg-base);
      color: var(--fg-default);
      padding: 24px;
    }

    /* Page Header */
    .page-header {
      margin-bottom: 24px;
    }

    .header-content {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
      color: var(--fg-default);
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
    }

    .btn-primary {
      background: var(--accent-default);
      border-color: var(--accent-default);
      color: white;

      &:hover {
        background: var(--accent-emphasis);
        border-color: var(--accent-emphasis);
      }
    }

    .btn-secondary {
      background: var(--card-bg);
      border-color: var(--border-default);
      color: var(--fg-default);

      &:hover {
        background: var(--bg-subtle);
      }
    }

    /* DL Horizontal */
    .dl-horizontal {
      display: flex;
      margin: 0 0 8px 0;
      padding: 12px 16px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 6px;

      dt {
        min-width: 180px;
        font-weight: 600;
        font-size: 13px;
        color: var(--fg-default);
      }

      dd {
        margin: 0;
        color: var(--fg-muted);
        flex: 1;
      }

      .body-content {
        white-space: pre-wrap;
        word-break: break-word;
      }
    }

    /* Status Badge */
    .status-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 500;

      &.approved {
        background: var(--success-subtle);
        color: var(--success-text);
      }

      &.pending {
        background: var(--warning-subtle);
        color: var(--warning-text);
      }

      &.rejected {
        background: var(--error-subtle);
        color: var(--error-text);
      }

      &.disabled {
        background: var(--bg-muted);
        color: var(--fg-muted);
      }
    }

    /* Preview - WhatsApp */
    .preview-container {
      background: var(--chat-bg);
      border-radius: 8px;
      padding: 16px;
    }

    .preview-title {
      font-weight: 600;
      margin-bottom: 12px;
      color: var(--fg-default);
    }

    .whatsapp-preview {
      display: flex;
      justify-content: flex-start;
    }

    .message-bubble {
      background: var(--message-incoming-bg);
      border-radius: 8px;
      padding: 8px 12px;
      max-width: 280px;
      box-shadow: var(--shadow-sm);
    }

    .message-header {
      font-weight: 600;
      margin-bottom: 4px;
      color: var(--message-incoming-text);
    }

    .message-body {
      color: var(--message-incoming-text);
      white-space: pre-wrap;
      word-break: break-word;
    }

    .message-footer {
      font-size: 12px;
      color: var(--fg-subtle);
      margin-top: 8px;
    }

    /* Params Section */
    .params-section {
      margin-top: 32px;

      h3 {
        font-size: 16px;
        font-weight: 600;
        margin-bottom: 16px;
        color: var(--fg-default);
      }
    }

    .table-responsive {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
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
      border-bottom: 2px solid var(--border-default);
    }

    .table tbody tr {
      transition: background 0.15s;

      &:hover {
        background: var(--table-row-hover);
      }
    }

    .form-actions {
      margin-top: 24px;
    }

    @media (max-width: 768px) {
      .template-detail-container { padding: 16px; }
      .row { flex-direction: column; }
      .col-lg-4 { width: 100%; }
      .dl-horizontal { flex-direction: column; }
      .dl-horizontal dt { margin-bottom: 4px; min-width: auto; }
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
