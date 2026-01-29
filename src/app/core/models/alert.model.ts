/**
 * Alert Model
 * PARIDAD: Rails Alert model
 */

export enum AlertType {
  CONVERSATION_RESPONSE_OVERDUE = 'conversation_response_overdue',
  REQUIRE_RESPONSE = 'require_response',
  ESCALATION = 'escalation'
}

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  PRIORITY = 'priority',
  SUCCESS = 'success',
  HIGH = 'high'
}

export interface Alert {
  id: number;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  acknowledged: boolean;
  acknowledged_at?: string;
  created_at: string;
  ticket_id?: number;
  user_id: number;
  user_name?: string;
}

export interface AlertListResponse {
  alerts: Alert[];
  total: number;
  page: number;
  totalPages: number;
}

export interface AlertCountResponse {
  count: number;
}

export interface AcknowledgeResponse {
  result: string;
  alert?: Alert;
  acknowledged_count?: number;
}
