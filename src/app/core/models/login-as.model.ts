/**
 * Login As (Impersonation) Model
 * PARIDAD: Rails login_as functionality
 */

export interface LoginAsUser {
  id: number;
  display_name: string;  // Format: "ClientName | UserName"
  role: string;
}

export interface LoginAsResponse {
  result: 'success' | 'error';
  token?: string;
  user?: {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    full_name: string;
    phone?: string;
    role: string;
    status: string;
    created_at: string;
    client_id?: number;
    client_name?: string;
  };
  original_user_id?: number;
  error?: string;
}

export interface ImpersonationState {
  isImpersonating: boolean;
  originalUserId: number | null;
  originalUserName: string | null;
  currentUserName: string | null;
}
