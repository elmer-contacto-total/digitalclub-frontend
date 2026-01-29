/**
 * Message Models
 * PARIDAD RAILS: Message model (app/models/message.rb)
 * PARIDAD SPRING BOOT: Message entity (domain/message/entity/Message.java)
 */

// ===== ENUMS =====

/**
 * Message direction matching backend enums
 */
export enum MessageDirection {
  INCOMING = 0,
  OUTGOING = 1
}

/**
 * Message status matching backend enums
 */
export enum MessageStatus {
  SENT = 0,
  ERROR = 1,
  UNREAD = 2,
  READ = 3,
  PENDING = 4,
  FAILED = 5
}

// ===== INTERFACES =====

/**
 * Message interface matching backend entity
 */
export interface Message {
  id: number;
  senderId: number;
  recipientId: number;
  content: string;
  direction: MessageDirection;
  status: MessageStatus;
  ticketId?: number;

  // WhatsApp specific
  isTemplate: boolean;
  templateName?: string;
  whatsappBusinessRouted: boolean;
  originalWhatsappBusinessRecipientId?: number;

  // Prospect handling
  isProspect: boolean;
  prospectSenderId?: number;
  prospectRecipientId?: number;

  // Media/attachments
  binaryContentData?: string; // JSON string for media info
  binaryContentUrl?: string;  // Direct URL to media file

  // Error handling
  errorMessage?: string;

  // Metadata
  newSenderPhone?: string;
  historicSenderName?: string;
  isEvent: boolean;
  processed: boolean;

  // Timestamps
  sentAt: string;
  createdAt: string;
  updatedAt: string;

  // Expanded relations (optional, populated by API)
  sender?: MessageUser;
  recipient?: MessageUser;
}

/**
 * Simplified user info for message display
 */
export interface MessageUser {
  id: number;
  firstName: string;
  lastName: string;
  phone?: string;
  avatarData?: string;
}

/**
 * Message for list display (subset of fields)
 */
export interface MessageListItem {
  id: number;
  content: string;
  direction: MessageDirection;
  status: MessageStatus;
  sentAt: string;
  senderName: string;
  recipientName: string;
  isTemplate: boolean;
  hasMedia: boolean;
}

/**
 * Request to create a new message
 */
export interface CreateMessageRequest {
  recipientId: number;
  content: string;
  isTemplate?: boolean;
  templateName?: string;
  // For media messages
  binaryContentData?: string;
}

/**
 * Request to send a template message
 */
export interface SendTemplateRequest {
  recipientId: number;
  templateId: number;
  templateName?: string;
  languageCode?: string;
  parameters?: TemplateParameter[];
}

/**
 * Template parameter for variable substitution
 */
export interface TemplateParameter {
  type: 'text' | 'image' | 'document' | 'video';
  text?: string;
  link?: string;
}

/**
 * Media content structure stored in binaryContentData
 */
export interface MessageMedia {
  type: 'image' | 'video' | 'audio' | 'document';
  url?: string;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  caption?: string;
}

// ===== HELPER FUNCTIONS =====

/**
 * Check if message is incoming
 */
export function isIncoming(message: Pick<Message, 'direction'>): boolean {
  return message.direction === MessageDirection.INCOMING;
}

/**
 * Check if message is outgoing
 */
export function isOutgoing(message: Pick<Message, 'direction'>): boolean {
  return message.direction === MessageDirection.OUTGOING;
}

/**
 * Check if message has media attachment
 */
export function hasMedia(message: Pick<Message, 'binaryContentData'>): boolean {
  return !!message.binaryContentData && message.binaryContentData.length > 0;
}

/**
 * Parse media from binaryContentData
 */
export function parseMedia(message: Pick<Message, 'binaryContentData'>): MessageMedia | null {
  if (!message.binaryContentData) return null;
  try {
    return JSON.parse(message.binaryContentData) as MessageMedia;
  } catch {
    return null;
  }
}

/**
 * Check if message failed to send
 */
export function isFailed(message: Pick<Message, 'status'>): boolean {
  return message.status === MessageStatus.ERROR || message.status === MessageStatus.FAILED;
}

/**
 * Check if message is pending
 */
export function isPending(message: Pick<Message, 'status'>): boolean {
  return message.status === MessageStatus.PENDING;
}

/**
 * Get status display text
 */
export function getStatusText(status: MessageStatus): string {
  const statusTexts: Record<MessageStatus, string> = {
    [MessageStatus.SENT]: 'Enviado',
    [MessageStatus.ERROR]: 'Error',
    [MessageStatus.UNREAD]: 'No leído',
    [MessageStatus.READ]: 'Leído',
    [MessageStatus.PENDING]: 'Enviando...',
    [MessageStatus.FAILED]: 'Fallido'
  };
  return statusTexts[status] || 'Desconocido';
}

/**
 * Get direction display text
 */
export function getDirectionText(direction: MessageDirection): string {
  return direction === MessageDirection.INCOMING ? 'Entrante' : 'Saliente';
}

/**
 * Format message time for display
 */
export function formatMessageTime(sentAt: string): string {
  const date = new Date(sentAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return 'Ahora';
  } else if (diffMins < 60) {
    return `Hace ${diffMins} min`;
  } else if (diffHours < 24) {
    return date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays < 7) {
    return date.toLocaleDateString('es-PE', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  } else {
    return date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
}

/**
 * Check if message is within 24-hour WhatsApp window
 * WhatsApp Business API restricts freeform messages to 24h after last incoming
 */
export function isWithin24HourWindow(lastIncomingAt: string | null): boolean {
  if (!lastIncomingAt) return false;
  const lastIncoming = new Date(lastIncomingAt);
  const now = new Date();
  const diffHours = (now.getTime() - lastIncoming.getTime()) / 3600000;
  return diffHours <= 24;
}

/**
 * Check if message is a template message
 */
export function isTemplate(message: Pick<Message, 'isTemplate'>): boolean {
  return message.isTemplate === true;
}

/**
 * Alias for isFailed for backwards compatibility
 */
export function hasFailed(message: Pick<Message, 'status'>): boolean {
  return isFailed(message);
}

/**
 * Get media type from message
 */
export function getMediaType(message: Pick<Message, 'binaryContentData' | 'binaryContentUrl'>): string {
  // Try to parse from binaryContentData
  if (message.binaryContentData) {
    try {
      const media = JSON.parse(message.binaryContentData) as MessageMedia;
      return media.type || 'unknown';
    } catch {
      // Fall through to URL check
    }
  }

  // Try to determine from URL extension
  const url = message.binaryContentUrl || '';
  const extension = url.split('.').pop()?.toLowerCase() || '';

  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension)) {
    return 'image';
  } else if (['mp4', 'mov', 'avi', 'webm'].includes(extension)) {
    return 'video';
  } else if (['mp3', 'wav', 'ogg', 'aac'].includes(extension)) {
    return 'audio';
  } else if (['pdf', 'doc', 'docx', 'xls', 'xlsx'].includes(extension)) {
    return 'document';
  }

  return 'unknown';
}
