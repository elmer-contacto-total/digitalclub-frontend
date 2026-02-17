// User models
export * from './user.model';

// Auth models
export * from './auth.model';

// Client models
export * from './client.model';

// Navigation models
export * from './navigation.model';

// Dashboard models
export * from './dashboard.model';

// Pagination models
export * from './pagination.model';

// Ticket models
export * from './ticket.model';

// Message models
export * from './message.model';

// Conversation models
export * from './conversation.model';

// CRM Contact models (for Electron clients)
export * from './crm-contact.model';

// WhatsApp Onboarding models
export * from './whatsapp-onboarding.model';

// Message Template models
// Note: MessageTemplate and MessageTemplateParam interfaces are also exported from
// message-template.service.ts (with different shapes). Selectively re-export to
// avoid ambiguity with service exports.
export {
  TemplateCategory,
  TemplateWhatsappType,
  TemplateWhatsappStatus,
  HeaderMediaType,
  TemplateVisibility,
  isApproved,
  isUsable,
  getCategoryText,
  getTypeText,
  getWhatsappStatusText,
  getWhatsappStatusClass,
  countBodyParams,
  interpolateTemplate,
  generatePreview,
  filterUsableTemplates
} from './message-template.model';
export type {
  MessageTemplateListItem,
  TemplateSelectorItem,
  SendTemplateMessageRequest,
  TemplateParamValue,
  TemplatePreview
} from './message-template.model';
