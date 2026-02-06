/**
 * Media Audit Log model
 * PARIDAD: Spring Boot MediaAuditLogDto
 */

export interface MediaAuditLog {
  id: number;
  agentId: number | null;
  agentName: string | null;
  clientUserId: number | null;
  clientUserName: string | null;
  userFingerprint: string;
  action: MediaAuditAction;
  description: string | null;
  chatPhone: string | null;
  fileType: string | null;
  fileName: string | null;
  originalUrl: string | null;
  sizeBytes: number | null;
  clientIp: string | null;
  extraMetadata: Record<string, unknown> | null;
  eventTimestamp: string;
  createdAt: string;
}

export type MediaAuditAction =
  | 'DOWNLOAD_BLOCKED'
  | 'MEDIA_CAPTURED'
  | 'MEDIA_VIEWED'
  | 'BLOCKED_FILE_ATTEMPT'
  | 'VIDEO_BLOCKED';

export interface MediaAuditStatsResponse {
  total: number;
  DOWNLOAD_BLOCKED: number;
  MEDIA_CAPTURED: number;
  MEDIA_VIEWED: number;
  BLOCKED_FILE_ATTEMPT: number;
  VIDEO_BLOCKED: number;
}
