/**
 * Client status
 */
export enum ClientStatus {
  ACTIVE = 0,
  INACTIVE = 1,
  PENDING = 2
}

/**
 * Document type - PARIDAD: Rails Client.doc_types
 */
export enum DocType {
  RUC = 'ruc',
  DNI = 'dni'
}

/**
 * Client type - PARIDAD: Rails Client.client_types
 */
export enum ClientType {
  WHATSAPP_APP = 'whatsapp_app',
  WHATSAPP_BUSINESS = 'whatsapp_business',
  POINT_TO_POINT_ONLY = 'point_to_point_only'
}

/**
 * Helper functions for Client enums
 */
export const DocTypeLabels: Record<string, string> = {
  'ruc': 'RUC',
  'dni': 'DNI'
};

export const ClientTypeLabels: Record<string, string> = {
  'whatsapp_app': 'WhatsApp App',
  'whatsapp_business': 'WhatsApp Business',
  'point_to_point_only': 'Punto a Punto'
};

/**
 * Client interface matching Spring Boot Client entity
 * PARIDAD: digitalgroup-web-main-spring-boot/domain/client/entity/Client.java
 */
export interface Client {
  id: number;
  name: string;
  code?: string;
  companyName?: string;
  docType?: string;
  docNumber?: string;
  clientType?: string;
  description?: string;
  status: ClientStatus;
  domainUrl?: string;
  logoUrl?: string;
  whatsappEnabled?: boolean;
  whatsappPhoneId?: string;
  whatsappBusinessId?: string;
  whatsappAccessToken?: string;
  whatsappNumber?: string;
  whatsappVerifiedName?: string;
  maxAgents?: number;
  maxUsers?: number;
  primaryColor?: string;
  secondaryColor?: string;
  timeZone?: string;
  locale?: string;
  createdAt: string;
  updatedAt: string;
  // Client Structure - PARIDAD: Rails client_structure relationship
  clientStructure?: ClientStructure;
}

/**
 * Client for dropdown/select
 */
export interface ClientOption {
  id: number;
  name: string;
  code: string;
}

/**
 * Client settings
 */
export interface ClientSetting {
  id: number;
  clientId: number;
  key: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Client structure (hierarchy configuration)
 * PARIDAD: Rails client_structure model
 */
export interface ClientStructure {
  id?: number;
  clientId?: number;
  // Admin level 0 - Administrador (siempre activo)
  existsAdminLevel0: boolean;
  adminLevel0: string;
  // Manager levels 1-3 (configurables)
  existsManagerLevel1: boolean;
  managerLevel1: string;
  existsManagerLevel2: boolean;
  managerLevel2: string;
  existsManagerLevel3: boolean;
  managerLevel3: string;
  // Manager level 4 - Supervisor (siempre activo)
  existsManagerLevel4: boolean;
  managerLevel4: string;
  // Agent (siempre activo)
  existsAgent: boolean;
  agent: string;
  // Client level 6 - Cliente Final (siempre activo)
  existsClientLevel6: boolean;
  clientLevel6: string;
}

/**
 * Default client structure values
 * PARIDAD: Rails defaults
 */
export const DEFAULT_CLIENT_STRUCTURE: ClientStructure = {
  existsAdminLevel0: true,
  adminLevel0: 'Administrador',
  existsManagerLevel1: false,
  managerLevel1: 'Gerente Nivel 1',
  existsManagerLevel2: false,
  managerLevel2: 'Gerente Nivel 2',
  existsManagerLevel3: false,
  managerLevel3: 'Gerente Nivel 3',
  existsManagerLevel4: true,
  managerLevel4: 'Supervisor',
  existsAgent: true,
  agent: 'Agente',
  existsClientLevel6: true,
  clientLevel6: 'Cliente Final'
};

/**
 * Client type labels - PARIDAD: Rails es.yml enums.client.client_type
 */
export const ClientTypeLabelsFull: Record<string, string> = {
  'whatsapp_app': 'Whatsapp Punto a Punto / Whatsapp Business Centralizado',
  'whatsapp_business': 'Solo Whatsapp Business Centralizado',
  'point_to_point_only': 'Solo Whatsapp Punto a Punto'
};

/**
 * Status labels - PARIDAD: Rails es.yml enums.client.status
 */
export const StatusLabels: Record<string, string> = {
  'active': 'Activo',
  'inactive': 'Inactivo'
};
