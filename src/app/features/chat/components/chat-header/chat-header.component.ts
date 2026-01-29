/**
 * Chat Header Component
 * Shows client info, ticket status, CRM fields, custom fields (cobranza), close buttons
 * PARIDAD RAILS: app/views/admin/shared/chat/_chat.html.erb structure:
 *   1. WhatsApp Message Type Toggle
 *   2. Close Buttons (Finalizar con Acuerdo, Finalizar sin Acuerdo)
 *   3. Header Custom Fields (Datos de Cobranza)
 *   4. Header CRM Fields
 */
import { Component, input, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ConversationClient,
  ConversationAgent,
  CrmField,
  CustomField,
  ConversationCloseType,
  getConversationInitials
} from '../../../../core/models/conversation.model';
import { Ticket, TicketStatus, isOpen } from '../../../../core/models/ticket.model';

export type WhatsAppMessageType = 'p2p' | 'centralized';

@Component({
  selector: 'app-chat-header',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styleUrl: './chat-header.component.scss',
  template: `
    <div class="chat-header">
      <!-- Main Info -->
      <div class="header-main">
        <div class="avatar">
          <span class="initials">{{ getInitials() }}</span>
        </div>

        <div class="client-info">
          <div class="client-name">
            {{ client().firstName }} {{ client().lastName }}
            @if (client().codigo) {
              <span class="codigo">({{ client().codigo }})</span>
            }
          </div>
          <div class="client-contact">
            <span class="phone">
              <i class="bi bi-telephone"></i>
              {{ client().phone }}
            </span>
            @if (client().email) {
              <span class="email">
                <i class="bi bi-envelope"></i>
                {{ client().email }}
              </span>
            }
          </div>
        </div>

        <!-- Status Indicators -->
        <div class="status-indicators">
          @if (ticket() && isTicketOpen()) {
            <span class="badge ticket-badge">
              <i class="bi bi-ticket-perforated"></i>
              Ticket #{{ ticket()!.id }}
            </span>
          }
          @if (!canSendFreeform()) {
            <span class="badge warning-badge" title="Fuera de ventana de 24 horas">
              <i class="bi bi-clock"></i>
              Solo plantillas
            </span>
          }
          @if (client().requireResponse) {
            <span class="badge alert-badge" title="Requiere respuesta">
              <i class="bi bi-exclamation-triangle"></i>
              Pendiente
            </span>
          }
        </div>

        <!-- WhatsApp Message Type Toggle (PARIDAD: _whatsapp_message_type_toggle.html.erb) -->
        @if (isWhatsappBusiness() && showMessageTypeToggle()) {
          <div class="message-type-toggle">
            <label class="toggle-label">
              <input
                type="checkbox"
                [checked]="messageType() === 'centralized'"
                (change)="onMessageTypeChange($event)"
              />
              <span class="toggle-switch"></span>
              <span class="toggle-text">
                {{ messageType() === 'p2p' ? 'P2P (Directo)' : 'Centralizado' }}
              </span>
            </label>
          </div>
        }

        <!-- Actions -->
        <div class="header-actions">
          <button
            class="action-btn"
            title="Ver información"
            (click)="toggleDetails()"
          >
            <i class="bi" [class.bi-chevron-down]="!showDetails()" [class.bi-chevron-up]="showDetails()"></i>
          </button>
          <button class="action-btn" title="Más opciones">
            <i class="bi bi-three-dots-vertical"></i>
          </button>
        </div>
      </div>

      <!-- Close Buttons (PARIDAD RAILS: _close_buttons.html.erb) -->
      <!-- Aparecen ENCIMA del chat cuando hay ticket abierto -->
      @if (ticket() && isTicketOpen()) {
        <div class="close-buttons-row">
          @if (closeTypes().length > 0) {
            @for (closeType of closeTypes(); track closeType.kpiName) {
              <button
                class="close-type-btn"
                (click)="onCloseTicketWithType(closeType.kpiName)"
                [disabled]="isClosing()"
              >
                <i class="bi bi-check-circle"></i>
                Finalizar {{ closeType.name }}
              </button>
            }
          } @else {
            <button
              class="close-type-btn"
              (click)="onCloseTicket()"
              [disabled]="isClosing()"
            >
              <i class="bi bi-check-circle"></i>
              Finalizar
            </button>
          }
        </div>
      }

      <!-- Custom Fields - Datos de Cobranza (PARIDAD RAILS: _header_custom_fields.html.erb) -->
      <!-- Siempre visible encima del chat -->
      @if (hasCustomFields()) {
        <div class="header-custom-fields">
          <p class="custom-field-line">
            <strong>Datos de Cobranza:</strong> {{ getCustomField('codigo') }}
          </p>
          <p class="custom-field-line">
            <strong>Saldo Total:</strong> {{ getCustomField('saldo_total') }} |
            <strong>Saldo Mora:</strong> {{ getCustomField('saldo_mora') }} |
            <strong>Días mora:</strong> {{ getCustomField('dias_mora') }} |
            <strong>Día Venc:</strong> {{ getCustomField('dia_venc') }}
          </p>
          <p class="custom-field-line">
            <strong>Ult Acc:</strong> {{ getCustomField('ult_acc') }} |
            <strong>Dist Dom:</strong> {{ getCustomField('dist_dom') }} |
            <strong>Campaña:</strong> {{ getCustomField('list_tra') }}
          </p>
        </div>
      }

      <!-- CRM Fields visible (PARIDAD RAILS: _header_crm_fields.html.erb) -->
      <!-- Solo se muestran si NO hay custom fields (mutuamente excluyentes) -->
      @if (!hasCustomFields() && visibleCrmFields().length > 0) {
        <div class="header-crm-fields">
          @for (field of visibleCrmFields(); track $index) {
            <span class="crm-field-item">
              <strong>{{ field.label }}:</strong> {{ formatFieldValue(field) }}
            </span>
          }
        </div>
      }

      <!-- Expandable Details -->
      @if (showDetails()) {
        <div class="header-details">
          <!-- All CRM Fields -->
          @if (crmFields().length > 0) {
            <div class="detail-section">
              <h4>Campos CRM</h4>
              <div class="crm-fields">
                @for (field of crmFields(); track $index) {
                  <div class="crm-field">
                    <span class="field-label">{{ field.label }}:</span>
                    <span class="field-value">{{ formatFieldValue(field) }}</span>
                  </div>
                }
              </div>
            </div>
          }

          <!-- Agent Info -->
          @if (agent()) {
            <div class="detail-section">
              <h4>Agente asignado</h4>
              <div class="agent-info">
                <i class="bi bi-person"></i>
                {{ agent()!.firstName }} {{ agent()!.lastName }}
              </div>
            </div>
          }

          <!-- Ticket Info -->
          @if (ticket()) {
            <div class="detail-section">
              <h4>Ticket</h4>
              <div class="ticket-info">
                <div class="ticket-row">
                  <span>ID:</span>
                  <span>#{{ ticket()!.id }}</span>
                </div>
                <div class="ticket-row">
                  <span>Estado:</span>
                  <span class="status" [class.open]="isTicketOpen()" [class.closed]="!isTicketOpen()">
                    {{ isTicketOpen() ? 'Abierto' : 'Cerrado' }}
                  </span>
                </div>
                @if (ticket()!.createdAt) {
                  <div class="ticket-row">
                    <span>Creado:</span>
                    <span>{{ formatDate(ticket()!.createdAt) }}</span>
                  </div>
                }
              </div>
            </div>
          }

          <!-- Client Info -->
          <div class="detail-section">
            <h4>Cliente desde</h4>
            <span>{{ formatDate(client().createdAt) }}</span>
          </div>
        </div>
      }
    </div>
  `
})
export class ChatHeaderComponent {
  // Inputs
  client = input.required<ConversationClient>();
  agent = input<ConversationAgent>();
  ticket = input<Ticket>();
  crmFields = input<CrmField[]>([]);
  customFields = input<Record<string, unknown>>({});
  closeTypes = input<ConversationCloseType[]>([]);
  canSendFreeform = input(true);
  isWhatsappBusiness = input(false);
  showMessageTypeToggle = input(false);

  // Outputs
  closeTicket = output<{ ticketId: number; closeType?: string; notes?: string }>();
  messageTypeChanged = output<WhatsAppMessageType>();

  // Local state
  showDetails = signal(false);
  messageType = signal<WhatsAppMessageType>('p2p');
  isClosing = signal(false);

  getInitials(): string {
    const c = this.client();
    const name = `${c.firstName || ''} ${c.lastName || ''}`.trim();
    return getConversationInitials(name || 'NN');
  }

  isTicketOpen(): boolean {
    const t = this.ticket();
    return t ? isOpen(t) : false;
  }

  toggleDetails(): void {
    this.showDetails.update(v => !v);
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  formatFieldValue(field: CrmField): string {
    if (field.value === null || field.value === undefined) return '-';

    switch (field.type) {
      case 'boolean':
        return field.value ? 'Sí' : 'No';
      case 'date':
        return this.formatDate(field.value as string);
      case 'currency':
        return `S/ ${Number(field.value).toFixed(2)}`;
      default:
        return String(field.value);
    }
  }

  onCloseTicket(): void {
    const t = this.ticket();
    if (t) {
      this.isClosing.set(true);
      this.closeTicket.emit({ ticketId: t.id });
      setTimeout(() => this.isClosing.set(false), 2000);
    }
  }

  /**
   * Close ticket with specific type (Finalizar con Acuerdo, etc.)
   * PARIDAD RAILS: _close_buttons.html.erb
   */
  onCloseTicketWithType(kpiName: string): void {
    const t = this.ticket();
    if (t) {
      this.isClosing.set(true);
      this.closeTicket.emit({ ticketId: t.id, closeType: kpiName });
      setTimeout(() => this.isClosing.set(false), 2000);
    }
  }

  /**
   * Check if custom fields exist
   * PARIDAD RAILS: header_custom_fields.present?
   */
  hasCustomFields(): boolean {
    const cf = this.customFields();
    return cf && Object.keys(cf).length > 0;
  }

  /**
   * Get a specific custom field value
   * PARIDAD RAILS: header_custom_fields["key"]
   */
  getCustomField(key: string): string {
    const cf = this.customFields();
    if (!cf || cf[key] === undefined || cf[key] === null) {
      return '';
    }
    return String(cf[key]);
  }

  /**
   * Computed: CRM fields marked as visible (cached to avoid repeated computation)
   * PARIDAD RAILS: header_crm_fields where column_visible = true
   */
  visibleCrmFields = computed(() => {
    // Filter by visible property (columnVisible from backend)
    // PARIDAD RAILS: visible_fields = header_crm_fields.select { |field| field[2] }
    return this.crmFields().filter(field => field.visible === true);
  });

  onMessageTypeChange(event: Event): void {
    const isChecked = (event.target as HTMLInputElement).checked;
    const newType: WhatsAppMessageType = isChecked ? 'centralized' : 'p2p';
    this.messageType.set(newType);
    this.messageTypeChanged.emit(newType);
  }
}
