import { User, UserRole, UserStatus } from './user.model';

/**
 * Login request for web authentication
 */
export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * Login request for mobile app (includes phone)
 * PARIDAD: AuthController.AppLoginRequest
 */
export interface AppLoginRequest {
  email: string;
  password: string;
  phone: string;
}

/**
 * Login response from backend
 * Supports two-stage authentication (email/password → OTP)
 */
export interface LoginResponse {
  // Stage 1: Pre-login - these are returned when OTP is required
  requires_otp?: boolean;
  otp_session_id?: string;

  // Stage 2 / Direct login - these are returned after successful auth
  user?: AuthUser;
  token?: string;
  refreshToken?: string;
  expiresIn?: number;
}

/**
 * User data returned after authentication
 * Matches Rails/Spring Boot app_login response format
 */
export interface AuthUser {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  status: number;
  time_zone: string;
  country_id: number | null;
  client_id: number;
  uuid_token: string;
  role?: UserRole;
  avatar_data?: string;
  locale?: string;
  has_temporary_password?: boolean;
}

/**
 * Normalized auth user for internal use
 */
export interface CurrentUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  status: UserStatus;
  role: UserRole;
  clientId: number;
  countryId: number | null;
  timeZone: string;
  locale: string;
  avatarData?: string;
  uuidToken: string;
}

/**
 * Password change request
 */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/**
 * Forgot password request
 */
export interface ForgotPasswordRequest {
  email: string;
}

/**
 * Reset password request
 */
export interface ResetPasswordRequest {
  token: string;
  password: string;
  confirmPassword: string;
}

/**
 * Temp password change request (first login)
 */
export interface TempPasswordRequest {
  tempPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/**
 * Auth state for store
 */
export interface AuthState {
  user: CurrentUser | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  requiresPasswordChange: boolean;
}

/**
 * Initial auth state
 */
export const initialAuthState: AuthState = {
  user: null,
  token: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  requiresPasswordChange: false
};

/**
 * API Error Response (matching backend format)
 */
export interface ApiErrorResponse {
  error?: string;
  message?: string;
  token_invalid?: boolean;
  status?: number;
}

/**
 * Auth error codes for specific handling
 */
export enum AuthErrorCode {
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  INVALID_OTP = 'INVALID_OTP',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  USER_INACTIVE = 'USER_INACTIVE',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  PASSWORD_TOO_SHORT = 'PASSWORD_TOO_SHORT',
  PASSWORD_MISMATCH = 'PASSWORD_MISMATCH',
  TOKEN_INVALID = 'TOKEN_INVALID',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN = 'UNKNOWN'
}

/**
 * Parse error response from API
 */
export function parseApiError(error: any): { code: AuthErrorCode; message: string } {
  const errorMessage = error?.error?.error || error?.error?.message || error?.message || '';

  // Map error messages to codes
  if (errorMessage.includes('Credenciales Inválidas') || errorMessage.includes('Invalid credentials')) {
    return { code: AuthErrorCode.INVALID_CREDENTIALS, message: 'Credenciales inválidas' };
  }
  if (errorMessage.includes('Código de Seguridad Inválido') || errorMessage.includes('Invalid Security Code')) {
    return { code: AuthErrorCode.INVALID_OTP, message: 'Código de seguridad inválido' };
  }
  if (errorMessage.includes('Sesión') || errorMessage.includes('session')) {
    return { code: AuthErrorCode.SESSION_EXPIRED, message: 'Sesión expirada, inicie de nuevo' };
  }
  if (errorMessage.includes('inactiv')) {
    return { code: AuthErrorCode.USER_INACTIVE, message: 'Su cuenta está inactiva' };
  }
  if (errorMessage.includes('8 caracteres')) {
    return { code: AuthErrorCode.PASSWORD_TOO_SHORT, message: 'La contraseña debe tener al menos 8 caracteres' };
  }
  if (errorMessage.includes('6 caracteres')) {
    return { code: AuthErrorCode.PASSWORD_TOO_SHORT, message: 'La contraseña debe tener al menos 6 caracteres' };
  }
  if (errorMessage.includes('no coinciden')) {
    return { code: AuthErrorCode.PASSWORD_MISMATCH, message: 'Las contraseñas no coinciden' };
  }
  if (error?.error?.token_invalid || errorMessage.includes('Token') || errorMessage.includes('token')) {
    return { code: AuthErrorCode.TOKEN_INVALID, message: 'Enlace inválido o expirado' };
  }
  if (error?.status === 0 || error?.name === 'HttpErrorResponse' && !error?.ok) {
    return { code: AuthErrorCode.NETWORK_ERROR, message: 'Error de conexión' };
  }

  return { code: AuthErrorCode.UNKNOWN, message: errorMessage || 'Error inesperado' };
}

/**
 * Convert API auth user to current user
 */
export function mapAuthUserToCurrentUser(authUser: AuthUser, role?: UserRole): CurrentUser {
  return {
    id: authUser.id,
    email: authUser.email,
    firstName: authUser.first_name,
    lastName: authUser.last_name,
    fullName: `${authUser.first_name} ${authUser.last_name}`.trim(),
    phone: authUser.phone,
    status: authUser.status as UserStatus,
    role: role ?? authUser.role ?? UserRole.STANDARD,
    clientId: authUser.client_id,
    countryId: authUser.country_id,
    timeZone: authUser.time_zone,
    locale: authUser.locale ?? 'es',
    avatarData: authUser.avatar_data,
    uuidToken: authUser.uuid_token
  };
}
