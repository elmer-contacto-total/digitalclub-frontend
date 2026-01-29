/**
 * CRM Info Setting Model
 * PARIDAD: Rails CrmInfoSetting model
 */

export enum ColumnType {
  TEXT = 'text',
  NUMBER = 'number',
  DATE = 'date',
  BOOLEAN = 'boolean'
}

export enum CrmStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive'
}

export interface CrmInfoSetting {
  id: number;
  column_label: string;
  column_position: number;
  column_type: ColumnType;
  column_visible: boolean;
  status: CrmStatus;
  created_at: string;
  updated_at: string;
}

export interface CrmInfoSettingListResponse {
  crm_info_settings: CrmInfoSetting[];
}

export interface CrmInfoSettingResponse {
  result: string;
  crm_info_setting: CrmInfoSetting;
}

export interface CreateCrmInfoSettingRequest {
  columnLabel: string;
  columnType?: string;
  columnVisible?: boolean;
}

export interface UpdateCrmInfoSettingRequest {
  columnLabel?: string;
  columnType?: string;
  columnVisible?: boolean;
  status?: string;
}

export interface ReorderRequest {
  settingIds: number[];
}

export interface AvailableField {
  field: string;
  label: string;
}

export interface AvailableFieldsResponse {
  fields: AvailableField[];
}
