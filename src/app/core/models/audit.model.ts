/**
 * Audit Model
 * PARIDAD: Rails Audit model (audited gem)
 */

export interface Audit {
  id: number;
  auditable_id: number;
  auditable_type: string;
  action: 'create' | 'update' | 'destroy';
  username: string;
  audited_changes: Record<string, unknown>;
  version: number;
  created_at: string;
  user_id?: number;
  // Additional field for super_admin view
  client_name?: string;
}

export interface AuditListResponse {
  audits: Audit[];
  total: number;
  page: number;
  totalPages: number;
}

export interface AuditTypesResponse {
  types: string[];
}
