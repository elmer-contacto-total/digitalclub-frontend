/**
 * Message Template Models
 * WhatsApp Business API message templates
 * PARIDAD RAILS: MessageTemplate model (app/models/message_template.rb)
 * PARIDAD SPRING BOOT: MessageTemplate entity
 */

// ===== ENUMS =====

/**
 * WhatsApp template category
 */
export enum TemplateCategory {
  GENERAL = 0,
  COMMERCE = 1,
  FOOD_DELIVERY = 2,
  TICKET_UPDATE = 3,
  SHIPPING_UPDATE = 4,
  RESERVATION_UPDATE = 5,
  ACCOUNT_UPDATE = 6,
  PAYMENT_UPDATE = 7,
  APPOINTMENT_UPDATE = 8,
  ALERT_UPDATE = 9,
  TRANSPORTATION_UPDATE = 10,
  ISSUE_RESOLUTION = 11,
  AUTO_REPLY = 12
}

/**
 * WhatsApp template type
 */
export enum TemplateWhatsappType {
  MARKETING = 0,
  UTILITY = 1,
  AUTHENTICATION = 2
}

/**
 * WhatsApp template status (from Meta)
 */
export enum TemplateWhatsappStatus {
  DRAFT = 0,
  APPROVED = 1,
  REJECTED = 2,
  PENDING = 3,
  DISABLED = 4
}

/**
 * Header media type
 */
export enum HeaderMediaType {
  NONE = 0,
  TEXT = 1,
  IMAGE = 2,
  VIDEO = 3,
  DOCUMENT = 4
}

/**
 * Template visibility
 */
export enum TemplateVisibility {
  PUBLIC = 0,
  PRIVATE = 1
}

/**
 * Template status (internal)
 */
export enum TemplateStatus {
  ACTIVE = 0,
  INACTIVE = 1,
  PARAMS_PENDING = 2
}

// ===== INTERFACES =====

/**
 * Message template interface
 */
export interface MessageTemplate {
  id: number;
  userId: number;
  clientId: number;
  languageId?: number;

  // Template identification
  name: string;
  whatsappTemplateId?: string;

  // Type and category
  category: TemplateCategory;
  templateWhatsappType: TemplateWhatsappType;
  templateWhatsappStatus: TemplateWhatsappStatus;

  // Content components
  headerMediaType: HeaderMediaType;
  headerContent?: string;
  headerBinaryData?: string;
  bodyContent: string;
  footerContent?: string;

  // Status and visibility
  visibility: TemplateVisibility;
  status: TemplateStatus;

  // Metadata
  createdAt: string;
  updatedAt: string;

  // Relations
  language?: TemplateLanguage;
  params?: MessageTemplateParam[];
}

/**
 * Template language info
 */
export interface TemplateLanguage {
  id: number;
  name: string;
  languageCode: string;
}

/**
 * Template parameter definition
 */
export interface MessageTemplateParam {
  id: number;
  messageTemplateId: number;
  paramOrder: number;     // Position: 1, 2, 3...
  paramType: 'HEADER' | 'BODY' | 'FOOTER';
  paramExample?: string;  // Example value
  defaultValue?: string;  // Default value
  fieldName?: string;     // CRM field name to auto-fill
  status: TemplateStatus;
}

/**
 * Template for list display
 */
export interface MessageTemplateListItem {
  id: number;
  name: string;
  category: TemplateCategory;
  templateWhatsappType: TemplateWhatsappType;
  templateWhatsappStatus: TemplateWhatsappStatus;
  bodyPreview: string;
  paramsCount: number;
  status: TemplateStatus;
  createdAt: string;
}

/**
 * Template for selector modal
 */
export interface TemplateSelectorItem {
  id: number;
  name: string;
  bodyContent: string;
  headerContent?: string;
  footerContent?: string;
  headerMediaType: HeaderMediaType;
  paramsRequired: number;
  languageCode: string;
}

/**
 * Request to send template message
 */
export interface SendTemplateMessageRequest {
  recipientId: number;
  templateId: number;
  params: TemplateParamValue[];
}

/**
 * Parameter value for template sending
 */
export interface TemplateParamValue {
  paramOrder: number;
  paramType: 'HEADER' | 'BODY' | 'FOOTER';
  value: string;
}

/**
 * Template preview with interpolated values
 */
export interface TemplatePreview {
  header?: string;
  body: string;
  footer?: string;
  hasAllParams: boolean;
  missingParams: number[];
}

// ===== HELPER FUNCTIONS =====

/**
 * Check if template is approved
 */
export function isApproved(template: Pick<MessageTemplate, 'templateWhatsappStatus'>): boolean {
  return template.templateWhatsappStatus === TemplateWhatsappStatus.APPROVED;
}

/**
 * Check if template is active and usable
 */
export function isUsable(template: Pick<MessageTemplate, 'status' | 'templateWhatsappStatus'>): boolean {
  return template.status === TemplateStatus.ACTIVE &&
         template.templateWhatsappStatus === TemplateWhatsappStatus.APPROVED;
}

/**
 * Get category display text
 */
export function getCategoryText(category: TemplateCategory): string {
  const texts: Record<TemplateCategory, string> = {
    [TemplateCategory.GENERAL]: 'General',
    [TemplateCategory.COMMERCE]: 'Comercio',
    [TemplateCategory.FOOD_DELIVERY]: 'Delivery',
    [TemplateCategory.TICKET_UPDATE]: 'Actualización de Ticket',
    [TemplateCategory.SHIPPING_UPDATE]: 'Actualización de Envío',
    [TemplateCategory.RESERVATION_UPDATE]: 'Actualización de Reserva',
    [TemplateCategory.ACCOUNT_UPDATE]: 'Actualización de Cuenta',
    [TemplateCategory.PAYMENT_UPDATE]: 'Actualización de Pago',
    [TemplateCategory.APPOINTMENT_UPDATE]: 'Actualización de Cita',
    [TemplateCategory.ALERT_UPDATE]: 'Alerta',
    [TemplateCategory.TRANSPORTATION_UPDATE]: 'Transporte',
    [TemplateCategory.ISSUE_RESOLUTION]: 'Resolución de Problema',
    [TemplateCategory.AUTO_REPLY]: 'Respuesta Automática'
  };
  return texts[category] || 'Desconocido';
}

/**
 * Get type display text
 */
export function getTypeText(type: TemplateWhatsappType): string {
  const texts: Record<TemplateWhatsappType, string> = {
    [TemplateWhatsappType.MARKETING]: 'Marketing',
    [TemplateWhatsappType.UTILITY]: 'Utilidad',
    [TemplateWhatsappType.AUTHENTICATION]: 'Autenticación'
  };
  return texts[type] || 'Desconocido';
}

/**
 * Get WhatsApp status display text
 */
export function getWhatsappStatusText(status: TemplateWhatsappStatus): string {
  const texts: Record<TemplateWhatsappStatus, string> = {
    [TemplateWhatsappStatus.DRAFT]: 'Borrador',
    [TemplateWhatsappStatus.APPROVED]: 'Aprobado',
    [TemplateWhatsappStatus.REJECTED]: 'Rechazado',
    [TemplateWhatsappStatus.PENDING]: 'Pendiente',
    [TemplateWhatsappStatus.DISABLED]: 'Deshabilitado'
  };
  return texts[status] || 'Desconocido';
}

/**
 * Get WhatsApp status CSS class
 */
export function getWhatsappStatusClass(status: TemplateWhatsappStatus): string {
  const classes: Record<TemplateWhatsappStatus, string> = {
    [TemplateWhatsappStatus.DRAFT]: 'status-draft',
    [TemplateWhatsappStatus.APPROVED]: 'status-approved',
    [TemplateWhatsappStatus.REJECTED]: 'status-rejected',
    [TemplateWhatsappStatus.PENDING]: 'status-pending',
    [TemplateWhatsappStatus.DISABLED]: 'status-disabled'
  };
  return classes[status] || '';
}

/**
 * Count required parameters in template body
 * Matches {{1}}, {{2}}, etc.
 */
export function countBodyParams(bodyContent: string): number {
  const matches = bodyContent.match(/\{\{(\d+)\}\}/g);
  return matches ? matches.length : 0;
}

/**
 * Interpolate template with parameter values
 * Replaces {{1}}, {{2}}, etc. with actual values
 */
export function interpolateTemplate(
  content: string,
  params: Record<number, string>
): string {
  return content.replace(/\{\{(\d+)\}\}/g, (match, num) => {
    const value = params[parseInt(num)];
    return value !== undefined ? value : match;
  });
}

/**
 * Generate template preview with values
 */
export function generatePreview(
  template: Pick<MessageTemplate, 'headerContent' | 'bodyContent' | 'footerContent'>,
  params: Record<number, string>
): TemplatePreview {
  const body = interpolateTemplate(template.bodyContent, params);
  const header = template.headerContent
    ? interpolateTemplate(template.headerContent, params)
    : undefined;
  const footer = template.footerContent
    ? interpolateTemplate(template.footerContent, params)
    : undefined;

  // Check for missing params (still has {{n}} patterns)
  const missingParams: number[] = [];
  const missingMatches = body.match(/\{\{(\d+)\}\}/g) || [];
  missingMatches.forEach(match => {
    const num = parseInt(match.replace(/[{}]/g, ''));
    if (!missingParams.includes(num)) {
      missingParams.push(num);
    }
  });

  return {
    header,
    body,
    footer,
    hasAllParams: missingParams.length === 0,
    missingParams
  };
}

/**
 * Filter usable templates
 */
export function filterUsableTemplates(templates: MessageTemplate[]): MessageTemplate[] {
  return templates.filter(t => isUsable(t));
}
