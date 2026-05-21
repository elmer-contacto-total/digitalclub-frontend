// wa-selectors.ts — Single source of truth for WhatsApp Web DOM selectors.
// The health probe always imports from here, so updating a selector in this file
// automatically keeps the probe in sync. Production executeJavaScript strings
// can adopt these constants incrementally.

export const WA_SELECTORS = {
  // Session — main.ts: checkWhatsAppSessionState
  SESSION_PANE:    '#pane-side',
  SESSION_MAIN:    'div#main',
  SESSION_SEARCH:  '[data-testid="chat-list-search"]',
  QR_CODE:         '[data-testid="qrcode"]',
  QR_CANVAS:       'canvas[aria-label*="QR"]',
  LINKING_SCREEN:  '[data-testid="intro-md-beta-message"]',

  // Chat header — main.ts: scanChat
  CHAT_HEADER:     '[data-testid="conversation-header"]',
  CHAT_HEADER_ALT: '#main header',
  CHAT_TITLE:      '[data-testid="conversation-info-header-chat-title"]',
  CHAT_TITLE_ALT:  'span[title]',

  // Compose box — main.ts: send-message, send-and-submit, navigate-to-chat
  COMPOSE_BOX:     '[data-testid="conversation-compose-box-input"]',
  COMPOSE_ALT1:    'div[contenteditable="true"][data-tab="10"]',
  COMPOSE_ALT2:    'footer div[contenteditable="true"]',

  // Search / navigate — main.ts: navigate-to-chat, BulkSender
  SEARCH_INPUT:    'input[data-tab="3"]',
  SEARCH_ALT1:     '[data-testid="chat-list-search-input"]',
  SEARCH_ALT2:     '#side div[contenteditable="true"]',
  SEARCH_RESULT:   '[data-testid="cell-frame-container"]',
  SEARCH_RES_ALT:  '#pane-side [role="row"]',

  // Messages — main.ts: scanChatMessages
  MSG_PANEL:       '[data-testid="conversation-panel-messages"]',
  MSG_ITEMS:       '[data-testid^="conv-msg-"]',
  MSG_ITEMS_ALT:   '[data-id^="true_"]',
  MSG_TAIL_OUT:    '[data-testid="tail-out"]',
  MSG_TAIL_IN:     '[data-testid="tail-in"]',
  MSG_TEXT:        '[data-testid="selectable-text"]',
  MSG_TEXT_ALT:    '.selectable-text span, .copyable-text span, ._ao3e',

  // Contact drawer — media-security.ts: extractPhoneFromContactPanel
  CONTACT_DRAWER:  '[data-testid="chat-info-drawer"]',
  CONTACT_ALT1:    '[data-testid="conversation-info-drawer"]',
  CONTACT_ALT2:    '[data-testid="contact-info-drawer"]',

  // Timestamps — media-security.ts: extractMessageTimestamp
  MSG_TIMESTAMP:   '[data-pre-plain-text]',

  // Message IDs — media-security.ts: trackMedia
  MSG_ID_OUT:      '[data-id^="true_"]',
  MSG_ID_IN:       '[data-id^="false_"]',

  // Download blocking CSS — media-security.ts: HIDE_DOWNLOAD_CSS
  ATTACH_BTN:      '[data-testid="clip"], [data-testid="plus-rounded"]',
} as const;
