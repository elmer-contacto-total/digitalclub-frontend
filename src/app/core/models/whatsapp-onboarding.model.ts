/**
 * WhatsApp Onboarding Model
 * PARIDAD: Rails WhatsApp Onboarding
 */

export interface WhatsAppStatus {
  is_connected: boolean;
  phone_number_id?: string;
  business_account_id?: string;
}

export interface WhatsAppBusinessData {
  waba_id: string;
  waba_name: string;
  phone_number_id: string;
  phone_number: string;
  verified_name: string;
  quality_rating?: string;
  account_review_status: string;
  timezone_id?: string;
}

export interface ExchangeCodeRequest {
  code: string;
}

export interface OnboardingResponse {
  result: 'success' | 'error';
  message?: string;
  // Fields returned on complete/refresh
  waba_id?: string;
  waba_name?: string;
  phone_number_id?: string;
  phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  account_review_status?: string;
}

export interface DisconnectResponse {
  result: 'success' | 'error';
  message?: string;
}

/**
 * Account review status values
 */
export enum AccountReviewStatus {
  APPROVED = 'APPROVED',
  PENDING = 'PENDING',
  REJECTED = 'REJECTED'
}
