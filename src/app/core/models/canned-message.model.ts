/**
 * Canned Message Models
 * Pre-defined quick reply messages
 * PARIDAD RAILS: CannedMessage model (app/models/canned_message.rb)
 * PARIDAD SPRING BOOT: CannedMessage entity
 */

// ===== ENUMS =====

export enum CannedMessageStatus {
  ACTIVE = 0,
  INACTIVE = 1
}

// ===== INTERFACES =====

/**
 * Canned message interface
 */
export interface CannedMessage {
  id: number;
  userId: number;
  clientId: number;
  name: string;          // Short name/label
  content: string;       // Message content
  shortcut?: string;     // Keyboard shortcut (e.g., "/hola")
  clientGlobal: boolean; // Available to all users in client
  status: CannedMessageStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Canned message for list display
 */
export interface CannedMessageListItem {
  id: number;
  name: string;
  content: string;
  shortcut?: string;
  clientGlobal: boolean;
  status: CannedMessageStatus;
}

/**
 * Request to create canned message
 */
export interface CreateCannedMessageRequest {
  name: string;
  content: string;
  shortcut?: string;
  clientGlobal?: boolean;
}

/**
 * Request to update canned message
 */
export interface UpdateCannedMessageRequest {
  name?: string;
  content?: string;
  shortcut?: string;
  clientGlobal?: boolean;
  status?: CannedMessageStatus;
}

// ===== HELPER FUNCTIONS =====

/**
 * Check if canned message is active
 */
export function isActive(message: Pick<CannedMessage, 'status'>): boolean {
  return message.status === CannedMessageStatus.ACTIVE;
}

/**
 * Filter active canned messages
 */
export function filterActiveCannedMessages(messages: CannedMessage[]): CannedMessage[] {
  return messages.filter(m => m.status === CannedMessageStatus.ACTIVE);
}

/**
 * Find canned message by shortcut
 */
export function findByShortcut(messages: CannedMessage[], shortcut: string): CannedMessage | undefined {
  const normalized = shortcut.toLowerCase().trim();
  return messages.find(m =>
    m.shortcut?.toLowerCase().trim() === normalized ||
    `/${m.shortcut?.toLowerCase().trim()}` === normalized
  );
}

/**
 * Sort canned messages by name
 */
export function sortCannedMessagesByName(messages: CannedMessage[]): CannedMessage[] {
  return [...messages].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get truncated content for display
 */
export function getTruncatedContent(content: string, maxLength: number = 100): string {
  if (content.length <= maxLength) return content;
  return content.substring(0, maxLength - 3) + '...';
}
