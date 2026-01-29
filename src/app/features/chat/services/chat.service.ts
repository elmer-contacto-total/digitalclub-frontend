/**
 * Chat Service
 * Handles all message-related API operations
 * PARIDAD RAILS: Admin::MessagesController
 * PARIDAD SPRING BOOT: MessageAdminController
 */
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import {
  Message,
  MessageDirection,
  MessageStatus,
  CreateMessageRequest,
  SendTemplateRequest,
  MessageListItem
} from '../../../core/models/message.model';
import {
  Conversation,
  ConversationDetail,
  ConversationListItem,
  ConversationListRequest,
  ConversationListResponse,
  ChatViewType
} from '../../../core/models/conversation.model';
import { CannedMessage } from '../../../core/models/canned-message.model';
import {
  MessageTemplate,
  MessageTemplateListItem,
  TemplateSelectorItem
} from '../../../core/models/message-template.model';

// ===== API RESPONSE INTERFACES =====

interface MessagesApiResponse {
  messages: Message[];
  total?: number;
  page?: number;
  pageSize?: number;
}

interface ConversationApiResponse {
  client: any;
  agent?: any;
  ticket?: any;
  messages: Message[];
  crmFields?: any[];
  /**
   * Custom fields (datos de cobranza)
   * PARIDAD RAILS: header_custom_fields
   */
  customFields?: Record<string, unknown>;
  isWhatsappBusiness: boolean;
  lastIncomingMessageAt?: string;
  canSendFreeform: boolean;
  closeTypes?: any[];
}

interface DataTablesResponse {
  draw: number;
  recordsTotal: number;
  recordsFiltered: number;
  data: any[];
}

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private api = inject(ApiService);

  // ===== MESSAGES =====

  /**
   * Get messages for a conversation with a client
   * PARIDAD: GET /app/messages?client_id=X
   */
  getMessages(clientId: number, page: number = 1, pageSize: number = 50): Observable<MessagesApiResponse> {
    return this.api.get<MessagesApiResponse>('/app/messages', {
      params: {
        client_id: clientId,
        page,
        page_size: pageSize
      }
    });
  }

  /**
   * Get messages for a specific ticket
   * PARIDAD: GET /app/messages/ticket/{ticketId}
   */
  getMessagesByTicket(ticketId: number): Observable<Message[]> {
    return this.api.get<Message[]>(`/app/messages/ticket/${ticketId}`);
  }

  /**
   * Get full conversation detail with client info, messages, CRM fields
   * PARIDAD: GET /app/messages?client_id=X&chat_view_type=Y (with expanded data)
   */
  getConversationDetail(clientId: number, viewType: ChatViewType = 'clients'): Observable<ConversationDetail> {
    return this.api.get<ConversationApiResponse>('/app/messages', {
      params: {
        client_id: clientId,
        chat_view_type: viewType,
        include_detail: true
      }
    }).pipe(
      map(response => this.mapConversationDetail(response))
    );
  }

  /**
   * Send a new message
   * PARIDAD: POST /app/messages
   */
  sendMessage(request: CreateMessageRequest): Observable<Message> {
    return this.api.post<Message>('/app/messages', {
      recipient_id: request.recipientId,
      content: request.content,
      is_template: request.isTemplate || false,
      template_name: request.templateName,
      binary_content_data: request.binaryContentData
    });
  }

  /**
   * Send a template message
   * PARIDAD: POST /app/messages/template
   */
  sendTemplateMessage(request: SendTemplateRequest): Observable<Message> {
    return this.api.post<Message>('/app/messages/template', {
      recipient_id: request.recipientId,
      template_id: request.templateId,
      template_name: request.templateName,
      language_code: request.languageCode,
      parameters: request.parameters
    });
  }

  /**
   * Send a media message
   * PARIDAD: POST /app/messages/media
   */
  sendMediaMessage(recipientId: number, file: File, caption?: string): Observable<Message> {
    const formData = new FormData();
    formData.append('recipient_id', recipientId.toString());
    formData.append('file', file);
    if (caption) {
      formData.append('caption', caption);
    }
    return this.api.upload<Message>('/app/messages/media', formData);
  }

  /**
   * Mark messages as read
   * PARIDAD: POST /app/messages/mark_read
   */
  markAsRead(messageIds: number[]): Observable<void> {
    return this.api.post<void>('/app/messages/mark_read', {
      message_ids: messageIds
    });
  }

  /**
   * Get unread message count
   * PARIDAD: GET /app/messages/unread_count
   */
  getUnreadCount(): Observable<number> {
    return this.api.get<{ count: number }>('/app/messages/unread_count').pipe(
      map(response => response.count)
    );
  }

  /**
   * Resend a failed message
   * PARIDAD: POST /app/messages/{id}/resend
   */
  resendMessage(messageId: number): Observable<Message> {
    return this.api.post<Message>(`/app/messages/${messageId}/resend`);
  }

  /**
   * Get single message by ID
   * PARIDAD: GET /app/messages/{id}
   */
  getMessage(messageId: number): Observable<Message> {
    return this.api.get<Message>(`/app/messages/${messageId}`);
  }

  // ===== CONVERSATIONS =====

  /**
   * Get conversation list for DataTable (server-side pagination)
   * PARIDAD: Rails DataTable AJAX for clients_chat_view
   */
  getConversationList(request: ConversationListRequest): Observable<ConversationListResponse> {
    // Convert to DataTables format if needed
    const params: Record<string, string | number | boolean | undefined> = {
      draw: request.draw || 1,
      start: request.start ?? ((request.page || 1) - 1) * (request.pageSize || 25),
      length: request.length || request.pageSize || 25
    };

    if (request.search) {
      params['search[value]'] = request.search;
    }

    if (request.filters?.viewType) {
      params['chat_view_type'] = request.filters.viewType;
    }

    if (request.filters?.hasUnread) {
      params['has_unread'] = request.filters.hasUnread;
    }

    if (request.filters?.agentId) {
      params['agent_id'] = request.filters.agentId;
    }

    return this.api.get<DataTablesResponse>('/app/messages/conversations', { params }).pipe(
      map(response => ({
        draw: response.draw,
        recordsTotal: response.recordsTotal,
        recordsFiltered: response.recordsFiltered,
        data: response.data.map(item => this.mapConversationListItem(item))
      }))
    );
  }

  // ===== CANNED MESSAGES =====

  /**
   * Get canned messages for current user
   * PARIDAD: GET /app/canned_messages
   */
  getCannedMessages(): Observable<CannedMessage[]> {
    return this.api.get<CannedMessage[]>('/app/canned_messages');
  }

  /**
   * Create a canned message
   * PARIDAD: POST /app/canned_messages
   */
  createCannedMessage(data: Partial<CannedMessage>): Observable<CannedMessage> {
    return this.api.post<CannedMessage>('/app/canned_messages', data);
  }

  /**
   * Update a canned message
   * PARIDAD: PATCH /app/canned_messages/{id}
   */
  updateCannedMessage(id: number, data: Partial<CannedMessage>): Observable<CannedMessage> {
    return this.api.patch<CannedMessage>(`/app/canned_messages/${id}`, data);
  }

  /**
   * Delete a canned message
   * PARIDAD: DELETE /app/canned_messages/{id}
   */
  deleteCannedMessage(id: number): Observable<void> {
    return this.api.delete<void>(`/app/canned_messages/${id}`);
  }

  // ===== MESSAGE TEMPLATES =====

  /**
   * Get message templates
   * PARIDAD: GET /app/message_templates
   */
  getMessageTemplates(): Observable<MessageTemplate[]> {
    return this.api.get<MessageTemplate[]>('/app/message_templates');
  }

  /**
   * Get templates for selector modal (simplified)
   * PARIDAD: GET /app/chat_select_template
   */
  getTemplatesForSelector(): Observable<TemplateSelectorItem[]> {
    return this.api.get<any[]>('/app/chat_select_template').pipe(
      map(templates => templates.map(t => ({
        id: t.id,
        name: t.name,
        bodyContent: t.body_content || t.bodyContent,
        headerContent: t.header_content || t.headerContent,
        footerContent: t.footer_content || t.footerContent,
        headerMediaType: t.header_media_type || t.headerMediaType || 0,
        paramsRequired: t.params_count || t.paramsRequired || 0,
        languageCode: t.language_code || t.languageCode || 'es'
      })))
    );
  }

  /**
   * Get template preview
   * PARIDAD: GET /app/message_templates/{id}/preview
   */
  getTemplatePreview(templateId: number): Observable<{ preview: string; params: any[] }> {
    return this.api.get<{ preview: string; params: any[] }>(`/app/message_templates/${templateId}/preview`);
  }

  /**
   * Sync templates with WhatsApp Cloud API
   * PARIDAD: POST /app/message_templates/sync_with_cloud_api
   */
  syncTemplatesWithCloudApi(): Observable<{ synced: number; errors: string[] }> {
    return this.api.post<{ synced: number; errors: string[] }>('/app/message_templates/sync_with_cloud_api');
  }

  // ===== HELPERS =====

  /**
   * Map API response to ConversationDetail
   */
  private mapConversationDetail(response: ConversationApiResponse): ConversationDetail {
    return {
      client: {
        id: response.client.id,
        firstName: response.client.first_name || response.client.firstName,
        lastName: response.client.last_name || response.client.lastName,
        phone: response.client.phone,
        email: response.client.email,
        codigo: response.client.codigo,
        avatarData: response.client.avatar_data || response.client.avatarData,
        requireResponse: response.client.require_response || response.client.requireResponse || false,
        customFields: response.client.custom_fields || response.client.customFields,
        createdAt: response.client.created_at || response.client.createdAt,
        lastMessageAt: response.client.last_message_at || response.client.lastMessageAt
      },
      agent: response.agent ? {
        id: response.agent.id,
        firstName: response.agent.first_name || response.agent.firstName,
        lastName: response.agent.last_name || response.agent.lastName,
        phone: response.agent.phone,
        email: response.agent.email
      } : undefined,
      ticket: response.ticket,
      messages: (response.messages || []).map((msg: any) => this.mapMessage(msg)),
      // Map CRM fields from backend format (columnLabel, columnValue, columnVisible)
      // to frontend format (key, label, value, type, visible)
      // PARIDAD RAILS: Only fields with columnVisible=true should be shown in header
      crmFields: (response.crmFields || []).map((field: any, index: number) => ({
        key: `crm_field_${index}`,
        label: field.columnLabel || field.label || '',
        value: field.columnValue || field.value || '',
        type: 'text' as const,
        visible: field.columnVisible ?? false
      })),
      // PARIDAD RAILS: header_custom_fields (datos de cobranza)
      customFields: response.customFields || {},
      isWhatsappBusiness: response.isWhatsappBusiness || false,
      lastIncomingMessageAt: response.lastIncomingMessageAt,
      canSendFreeform: response.canSendFreeform ?? true,
      closeTypes: response.closeTypes?.map(ct => ({
        name: ct.name,
        kpiName: ct.kpi_name || ct.kpiName
      }))
    };
  }

  /**
   * Map DataTables row to ConversationListItem
   */
  private mapConversationListItem(item: any): ConversationListItem {
    return {
      id: item.id || item[0],
      name: item.name || `${item.first_name || ''} ${item.last_name || ''}`.trim() || item[1],
      phone: item.phone || item[2],
      codigo: item.codigo || item[3],
      lastMessagePreview: item.last_message_preview || item.lastMessagePreview || '',
      lastMessageAt: item.last_message_at || item.lastMessageAt || '',
      unreadCount: item.unread_count || item.unreadCount || 0,
      hasOpenTicket: item.has_open_ticket || item.hasOpenTicket || false,
      requiresResponse: item.requires_response || item.requiresResponse || false
    };
  }

  /**
   * Map backend message to frontend Message model
   * PARIDAD: Backend sends snake_case and string direction, frontend expects camelCase and number direction
   */
  private mapMessage(msg: any): Message {
    // Convert direction string to enum number
    let direction: MessageDirection;
    if (typeof msg.direction === 'string') {
      direction = msg.direction.toLowerCase() === 'incoming'
        ? MessageDirection.INCOMING
        : MessageDirection.OUTGOING;
    } else {
      direction = msg.direction ?? MessageDirection.INCOMING;
    }

    // Convert status string to enum number
    let status: MessageStatus;
    if (typeof msg.status === 'string') {
      const statusMap: Record<string, MessageStatus> = {
        'pending': MessageStatus.PENDING,
        'sent': MessageStatus.SENT,
        'read': MessageStatus.READ,
        'error': MessageStatus.ERROR,
        'failed': MessageStatus.FAILED
      };
      status = statusMap[msg.status.toLowerCase()] ?? MessageStatus.SENT;
    } else {
      status = msg.status ?? MessageStatus.SENT;
    }

    return {
      id: msg.id,
      senderId: msg.sender_id || msg.senderId,
      recipientId: msg.recipient_id || msg.recipientId,
      content: msg.content || '',
      direction,
      status,
      ticketId: msg.ticket_id || msg.ticketId,
      isTemplate: msg.is_template || msg.isTemplate || false,
      templateName: msg.template_name || msg.templateName,
      whatsappBusinessRouted: msg.whatsapp_business_routed || msg.whatsappBusinessRouted || false,
      isProspect: msg.is_prospect || msg.isProspect || false,
      isEvent: msg.is_event || msg.isEvent || false,
      processed: msg.processed ?? true,
      binaryContentData: msg.binary_content_data || msg.binaryContentData,
      binaryContentUrl: msg.binary_content_url || msg.binaryContentUrl,
      historicSenderName: msg.historic_sender_name || msg.historicSenderName,
      errorMessage: msg.error_message || msg.errorMessage,
      // Handle dates - backend sends sent_at/created_at, frontend expects sentAt/createdAt
      sentAt: msg.sent_at || msg.sentAt || msg.created_at || msg.createdAt,
      createdAt: msg.created_at || msg.createdAt || msg.sent_at || msg.sentAt,
      updatedAt: msg.updated_at || msg.updatedAt
    };
  }
}
