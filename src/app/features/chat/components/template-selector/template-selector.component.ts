/**
 * Template Selector Component
 * Modal for selecting WhatsApp message templates
 * PARIDAD RAILS: app/views/admin/messages/_template_selector_modal.html.erb
 */
import { Component, inject, signal, input, output, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatService } from '../../services/chat.service';
import {
  TemplateSelectorItem,
  interpolateTemplate,
  countBodyParams
} from '../../../../core/models/message-template.model';

@Component({
  selector: 'app-template-selector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-overlay" (click)="onOverlayClick($event)">
      <div class="modal-content">
        <!-- Header -->
        <div class="modal-header">
          <h3>Seleccionar Plantilla</h3>
          <button class="close-btn" (click)="close.emit()">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>

        <!-- Search -->
        <div class="modal-search">
          <i class="bi bi-search"></i>
          <input
            type="text"
            placeholder="Buscar plantilla..."
            [(ngModel)]="searchTerm"
            (ngModelChange)="filterTemplates()"
          />
        </div>

        <!-- Template List / Preview -->
        <div class="modal-body">
          @if (!selectedTemplate()) {
            <!-- Template List -->
            <div class="template-list">
              @if (isLoading()) {
                <div class="loading-state">
                  <div class="spinner"></div>
                  <span>Cargando plantillas...</span>
                </div>
              } @else if (filteredTemplates().length === 0) {
                <div class="empty-state">
                  <i class="bi bi-file-text"></i>
                  <p>No hay plantillas disponibles</p>
                </div>
              } @else {
                @for (template of filteredTemplates(); track template.id) {
                  <div
                    class="template-item"
                    (click)="selectTemplate(template)"
                  >
                    <div class="template-name">{{ template.name }}</div>
                    <div class="template-preview">{{ getPreview(template.bodyContent) }}</div>
                    @if (template.paramsRequired > 0) {
                      <div class="template-params">
                        <i class="bi bi-input-cursor-text"></i>
                        {{ template.paramsRequired }} parámetro{{ template.paramsRequired > 1 ? 's' : '' }}
                      </div>
                    }
                  </div>
                }
              }
            </div>
          } @else {
            <!-- Template Preview with Params -->
            <div class="template-preview-panel">
              <button class="back-btn" (click)="selectedTemplate.set(null)">
                <i class="bi bi-arrow-left"></i>
                Volver
              </button>

              <div class="preview-header">
                <h4>{{ selectedTemplate()!.name }}</h4>
              </div>

              <!-- Header Content -->
              @if (selectedTemplate()!.headerContent) {
                <div class="preview-section">
                  <label>Encabezado</label>
                  <div class="preview-text">{{ selectedTemplate()!.headerContent }}</div>
                </div>
              }

              <!-- Body Content with Params -->
              <div class="preview-section">
                <label>Mensaje</label>
                <div class="preview-text preview-body" [innerHTML]="getInterpolatedBody()"></div>
              </div>

              <!-- Parameter Inputs -->
              @if (selectedTemplate()!.paramsRequired > 0) {
                <div class="params-section">
                  <label>Parámetros</label>
                  @for (i of getParamIndexes(); track i) {
                    <div class="param-input">
                      <span class="param-label">{{ '{{' + i + '}}' }}</span>
                      <input
                        type="text"
                        [placeholder]="'Valor para parámetro ' + i"
                        [(ngModel)]="paramValues[i]"
                        (ngModelChange)="updatePreview()"
                      />
                    </div>
                  }
                </div>
              }

              <!-- Footer Content -->
              @if (selectedTemplate()!.footerContent) {
                <div class="preview-section">
                  <label>Pie de mensaje</label>
                  <div class="preview-text footer-text">{{ selectedTemplate()!.footerContent }}</div>
                </div>
              }
            </div>
          }
        </div>

        <!-- Footer -->
        <div class="modal-footer">
          <button class="btn-secondary" (click)="close.emit()">
            Cancelar
          </button>
          @if (selectedTemplate()) {
            <button
              class="btn-primary"
              [disabled]="!canSend()"
              (click)="sendTemplate()"
            >
              <i class="bi bi-send"></i>
              Enviar Plantilla
            </button>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal-content {
      background: white;
      border-radius: 12px;
      width: 90%;
      max-width: 500px;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border-color, #e0e0e0);

      h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
      }

      .close-btn {
        width: 32px;
        height: 32px;
        border: none;
        background: transparent;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;

        &:hover {
          background: var(--bg-hover, #f5f5f5);
        }
      }
    }

    .modal-search {
      padding: 12px 20px;
      border-bottom: 1px solid var(--border-color, #e0e0e0);
      display: flex;
      align-items: center;
      gap: 8px;

      i {
        color: var(--text-secondary, #666);
      }

      input {
        flex: 1;
        border: none;
        font-size: 14px;
        outline: none;

        &::placeholder {
          color: var(--text-muted, #999);
        }
      }
    }

    .modal-body {
      flex: 1;
      overflow-y: auto;
      min-height: 300px;
    }

    .template-list {
      padding: 8px 0;
    }

    .template-item {
      padding: 12px 20px;
      cursor: pointer;
      transition: background 0.2s;

      &:hover {
        background: var(--bg-hover, #f5f5f5);
      }
    }

    .template-name {
      font-weight: 500;
      color: var(--text-primary, #333);
      margin-bottom: 4px;
    }

    .template-preview {
      font-size: 13px;
      color: var(--text-secondary, #666);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .template-params {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 4px;
      font-size: 11px;
      color: var(--info-color, #2196f3);

      i {
        font-size: 12px;
      }
    }

    .template-preview-panel {
      padding: 16px 20px;
    }

    .back-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border: none;
      background: transparent;
      color: var(--text-secondary, #666);
      font-size: 13px;
      cursor: pointer;
      margin-bottom: 16px;

      &:hover {
        color: var(--text-primary, #333);
      }
    }

    .preview-header {
      margin-bottom: 16px;

      h4 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
      }
    }

    .preview-section {
      margin-bottom: 16px;

      label {
        display: block;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        color: var(--text-muted, #999);
        margin-bottom: 6px;
      }
    }

    .preview-text {
      padding: 12px;
      background: var(--chat-bg, #efeae2);
      border-radius: 8px;
      font-size: 14px;
      line-height: 1.5;
      white-space: pre-wrap;

      &.preview-body {
        background: var(--message-outgoing-bg, #dcf8c6);

        ::ng-deep .param-highlight {
          background: rgba(33, 150, 243, 0.2);
          color: var(--info-color, #2196f3);
          padding: 2px 4px;
          border-radius: 4px;
        }
      }

      &.footer-text {
        font-size: 12px;
        color: var(--text-secondary, #666);
      }
    }

    .params-section {
      margin-bottom: 16px;

      label {
        display: block;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        color: var(--text-muted, #999);
        margin-bottom: 8px;
      }
    }

    .param-input {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;

      .param-label {
        min-width: 50px;
        font-size: 12px;
        color: var(--info-color, #2196f3);
        font-family: monospace;
      }

      input {
        flex: 1;
        padding: 8px 12px;
        border: 1px solid var(--border-color, #e0e0e0);
        border-radius: 6px;
        font-size: 14px;
        outline: none;

        &:focus {
          border-color: var(--primary-color, #25d366);
        }
      }
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      padding: 16px 20px;
      border-top: 1px solid var(--border-color, #e0e0e0);
    }

    .btn-secondary,
    .btn-primary {
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-secondary {
      background: white;
      border: 1px solid var(--border-color, #e0e0e0);
      color: var(--text-primary, #333);

      &:hover {
        background: var(--bg-hover, #f5f5f5);
      }
    }

    .btn-primary {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--primary-color, #25d366);
      border: none;
      color: white;

      &:hover:not(:disabled) {
        background: var(--primary-dark, #128c7e);
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }

    .loading-state,
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 24px;
      color: var(--text-secondary, #666);

      i {
        font-size: 48px;
        margin-bottom: 12px;
        opacity: 0.5;
      }

      p {
        margin: 0;
        font-size: 14px;
      }
    }

    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--border-color, #e0e0e0);
      border-top-color: var(--primary-color, #25d366);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-bottom: 12px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `]
})
export class TemplateSelectorComponent implements OnInit {
  private chatService = inject(ChatService);

  // Inputs
  clientId = input.required<number>();

  // Outputs
  select = output<{ templateId: number; params: Record<number, string> }>();
  close = output<void>();

  // State
  templates = signal<TemplateSelectorItem[]>([]);
  filteredTemplates = signal<TemplateSelectorItem[]>([]);
  selectedTemplate = signal<TemplateSelectorItem | null>(null);
  isLoading = signal(false);
  searchTerm = '';
  paramValues: Record<number, string> = {};

  ngOnInit(): void {
    this.loadTemplates();
  }

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.close.emit();
    }
  }

  filterTemplates(): void {
    const term = this.searchTerm.toLowerCase().trim();
    if (!term) {
      this.filteredTemplates.set(this.templates());
      return;
    }

    this.filteredTemplates.set(
      this.templates().filter(t =>
        t.name.toLowerCase().includes(term) ||
        t.bodyContent.toLowerCase().includes(term)
      )
    );
  }

  selectTemplate(template: TemplateSelectorItem): void {
    this.selectedTemplate.set(template);
    this.paramValues = {};

    // Initialize param values
    const paramCount = template.paramsRequired || countBodyParams(template.bodyContent);
    for (let i = 1; i <= paramCount; i++) {
      this.paramValues[i] = '';
    }
  }

  getPreview(content: string): string {
    if (content.length <= 80) return content;
    return content.substring(0, 77) + '...';
  }

  getParamIndexes(): number[] {
    const template = this.selectedTemplate();
    if (!template) return [];

    const count = template.paramsRequired || countBodyParams(template.bodyContent);
    return Array.from({ length: count }, (_, i) => i + 1);
  }

  getInterpolatedBody(): string {
    const template = this.selectedTemplate();
    if (!template) return '';

    let body = template.bodyContent;

    // Replace params with values or highlighted placeholders
    body = body.replace(/\{\{(\d+)\}\}/g, (match, num) => {
      const value = this.paramValues[parseInt(num)];
      if (value) {
        return value;
      }
      return `<span class="param-highlight">${match}</span>`;
    });

    return body.replace(/\n/g, '<br>');
  }

  updatePreview(): void {
    // Trigger change detection by updating signals
    // The interpolation happens in getInterpolatedBody()
  }

  canSend(): boolean {
    const template = this.selectedTemplate();
    if (!template) return false;

    const paramCount = template.paramsRequired || countBodyParams(template.bodyContent);
    if (paramCount === 0) return true;

    // Check all params are filled
    for (let i = 1; i <= paramCount; i++) {
      if (!this.paramValues[i]?.trim()) {
        return false;
      }
    }
    return true;
  }

  sendTemplate(): void {
    const template = this.selectedTemplate();
    if (!template || !this.canSend()) return;

    this.select.emit({
      templateId: template.id,
      params: { ...this.paramValues }
    });
  }

  private loadTemplates(): void {
    this.isLoading.set(true);

    this.chatService.getTemplatesForSelector().subscribe({
      next: (templates) => {
        this.templates.set(templates);
        this.filteredTemplates.set(templates);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading templates:', err);
        this.isLoading.set(false);
      }
    });
  }
}
