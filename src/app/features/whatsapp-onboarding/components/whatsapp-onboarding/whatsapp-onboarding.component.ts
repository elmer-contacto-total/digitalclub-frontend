/**
 * WhatsAppOnboardingComponent
 * PARIDAD: Rails admin/whatsapp_onboarding/new.html.erb + show.html.erb
 *
 * Handles two states:
 * 1. Not connected: Shows Facebook Login button to initiate OAuth
 * 2. Connected: Shows WhatsApp Business account details
 */
import { Component, OnInit, OnDestroy, inject, signal, PLATFORM_ID, Inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { WhatsAppOnboardingService } from '../../../../core/services/whatsapp-onboarding.service';
import { ToastService } from '../../../../core/services/toast.service';
import { OnboardingResponse } from '../../../../core/models/whatsapp-onboarding.model';

// Facebook SDK type declaration
interface FacebookSDK {
  init: (params: { appId: string; cookie: boolean; xfbml: boolean; version: string }) => void;
  login: (
    callback: (response: { authResponse?: { code?: string } }) => void,
    options: { config_id: string; response_type: string; override_default_response_type: boolean }
  ) => void;
}

declare global {
  interface Window {
    FB?: FacebookSDK;
  }
}

@Component({
  selector: 'app-whatsapp-onboarding',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="container-fluid py-4">
      <!-- Page Header -->
      <div class="page-header mb-4">
        <div class="row">
          <div class="col">
            <!-- PARIDAD: Rails "Estado de Alta Whatsapp" -->
            <h1 class="h3 mb-0">Estado de Alta WhatsApp</h1>
          </div>
        </div>
      </div>

      <!-- Loading -->
      @if (isLoading()) {
        <div class="text-center py-5">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Cargando...</span>
          </div>
          <p class="text-muted mt-3">Verificando estado de conexión...</p>
        </div>
      }

      <!-- Not Connected State - PARIDAD: Rails new.html.erb -->
      @if (!isLoading() && !isConnected()) {
        <div class="card">
          <div class="card-body text-center py-5">
            <div class="mb-4">
              <i class="bi bi-whatsapp text-success" style="font-size: 4rem;"></i>
            </div>
            <!-- PARIDAD: Rails "Haga clic en el botón para iniciar el proceso de alta de Whatsapp Business" -->
            <p class="text-muted mb-4">
              Haga clic en el botón para iniciar el proceso de alta de WhatsApp Business
            </p>

            <!-- Facebook Login Button - PARIDAD: Rails styling -->
            <button
              type="button"
              class="btn btn-facebook"
              (click)="initiateLogin()"
              [disabled]="isProcessing()">
              @if (isProcessing()) {
                <span class="spinner-border spinner-border-sm me-2"></span>
                Procesando...
              } @else {
                <i class="bi bi-facebook me-2"></i>
                Iniciar Sesión con Facebook
              }
            </button>

            @if (errorMessage()) {
              <div class="alert alert-danger mt-4 text-start">
                <i class="bi bi-exclamation-triangle me-2"></i>
                {{ errorMessage() }}
              </div>
            }
          </div>
        </div>
      }

      <!-- Connected State - PARIDAD: Rails show.html.erb -->
      @if (!isLoading() && isConnected()) {
        <div class="card">
          <div class="card-body">
            <!-- Status Message -->
            <div class="alert" [ngClass]="getStatusAlertClass()">
              <i class="bi" [ngClass]="getStatusIconClass()"></i>
              {{ getStatusMessage() }}
            </div>

            <!-- WhatsApp Business Details - PARIDAD: Rails DL structure -->
            <h5 class="mb-3">Datos de la cuenta WhatsApp Business</h5>
            <dl class="row">
              <!-- PARIDAD: "Nombre en Whatsapp Business" -->
              <dt class="col-sm-4">Nombre en WhatsApp Business</dt>
              <dd class="col-sm-8">{{ whatsappData()?.verified_name || '-' }}</dd>

              <!-- PARIDAD: "Id del Negocio en Whatsapp Business" -->
              <dt class="col-sm-4">ID del Negocio en WhatsApp Business</dt>
              <dd class="col-sm-8">
                <code>{{ whatsappData()?.waba_id || '-' }}</code>
              </dd>

              <!-- PARIDAD: "Estado de Revisión de Cuenta Whatsapp" -->
              <dt class="col-sm-4">Estado de Revisión de Cuenta</dt>
              <dd class="col-sm-8">
                <span class="badge" [ngClass]="getStatusBadgeClass()">
                  {{ getStatusLabel() }}
                </span>
              </dd>

              <!-- PARIDAD: "Número de Whatsapp Business" -->
              <dt class="col-sm-4">Número de WhatsApp Business</dt>
              <dd class="col-sm-8">{{ whatsappData()?.phone_number || '-' }}</dd>

              <!-- Quality Rating (if available) -->
              @if (whatsappData()?.quality_rating) {
                <dt class="col-sm-4">Calificación de Calidad</dt>
                <dd class="col-sm-8">
                  <span class="badge" [ngClass]="getQualityBadgeClass()">
                    {{ whatsappData()?.quality_rating }}
                  </span>
                </dd>
              }
            </dl>

            <!-- Actions -->
            <hr class="my-4">
            <div class="d-flex gap-2">
              <!-- Refresh Button -->
              <button
                type="button"
                class="btn btn-outline-primary"
                (click)="refreshData()"
                [disabled]="isProcessing()">
                @if (isProcessing()) {
                  <span class="spinner-border spinner-border-sm me-1"></span>
                }
                <i class="bi bi-arrow-clockwise me-1"></i>
                Actualizar datos
              </button>

              <!-- Disconnect Button - PARIDAD: Rails "Desconectar de Whatsapp" -->
              <button
                type="button"
                class="btn btn-outline-danger"
                (click)="confirmDisconnect()"
                [disabled]="isProcessing()">
                <i class="bi bi-x-circle me-1"></i>
                Desconectar de WhatsApp
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Disconnect Confirmation Modal -->
      @if (showDisconnectModal()) {
        <div class="modal fade show d-block" tabindex="-1" style="background-color: rgba(0,0,0,0.5);">
          <div class="modal-dialog">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">Confirmar desconexión</h5>
                <button type="button" class="btn-close" (click)="cancelDisconnect()"></button>
              </div>
              <div class="modal-body">
                <p>¿Está seguro que desea desconectar la integración de WhatsApp Business?</p>
                <p class="text-muted small">
                  Esta acción eliminará la configuración actual y deberá volver a conectar su cuenta.
                </p>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" (click)="cancelDisconnect()">
                  Cancelar
                </button>
                <button
                  type="button"
                  class="btn btn-danger"
                  (click)="disconnect()"
                  [disabled]="isProcessing()">
                  @if (isProcessing()) {
                    <span class="spinner-border spinner-border-sm me-1"></span>
                  }
                  Desconectar
                </button>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    /* Facebook Login Button - PARIDAD: Rails styling */
    .btn-facebook {
      background-color: #1877f2;
      border-color: #1877f2;
      color: white;
      font-family: Helvetica, Arial, sans-serif;
      font-weight: 600;
      padding: 10px 24px;
      border-radius: 4px;
    }

    .btn-facebook:hover {
      background-color: #166fe5;
      border-color: #166fe5;
      color: white;
    }

    .btn-facebook:disabled {
      background-color: #1877f2;
      border-color: #1877f2;
      opacity: 0.65;
    }

    dl.row dt {
      font-weight: 500;
    }

    dl.row dd {
      margin-bottom: 0.75rem;
    }
  `]
})
export class WhatsAppOnboardingComponent implements OnInit, OnDestroy {
  private whatsappService = inject(WhatsAppOnboardingService);
  private toastService = inject(ToastService);
  private destroy$ = new Subject<void>();
  private isBrowser: boolean;

  // State signals
  isLoading = signal(true);
  isProcessing = signal(false);
  isConnected = signal(false);
  whatsappData = signal<OnboardingResponse | null>(null);
  errorMessage = signal<string>('');
  showDisconnectModal = signal(false);

  // Facebook SDK loaded flag
  private fbSdkLoaded = false;

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    if (this.isBrowser) {
      this.loadFacebookSdk();
    }
    this.checkStatus();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Load Facebook SDK dynamically
   * PARIDAD: Rails includes FB SDK in view
   */
  private loadFacebookSdk(): void {
    if (window.FB) {
      this.fbSdkLoaded = true;
      return;
    }

    // Load Facebook SDK script
    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';

    script.onload = () => {
      if (window.FB) {
        window.FB.init({
          appId: this.whatsappService.FACEBOOK_APP_ID,
          cookie: true,
          xfbml: true,
          version: this.whatsappService.GRAPH_API_VERSION
        });
        this.fbSdkLoaded = true;
      }
    };

    document.head.appendChild(script);
  }

  /**
   * Check current WhatsApp connection status
   */
  checkStatus(): void {
    this.isLoading.set(true);

    this.whatsappService.checkStatus()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (status) => {
          this.isConnected.set(status.is_connected);

          if (status.is_connected) {
            // Load full data
            this.refreshData();
          } else {
            this.isLoading.set(false);
          }
        },
        error: (error) => {
          console.error('Error checking WhatsApp status:', error);
          this.isConnected.set(false);
          this.isLoading.set(false);
        }
      });
  }

  /**
   * Initiate Facebook OAuth login
   * PARIDAD: Rails FB.login() call
   */
  initiateLogin(): void {
    if (!this.fbSdkLoaded || !window.FB) {
      this.errorMessage.set('Facebook SDK no está cargado. Por favor recargue la página.');
      return;
    }

    this.errorMessage.set('');
    this.isProcessing.set(true);

    window.FB.login(
      (response) => {
        if (response.authResponse?.code) {
          this.exchangeCode(response.authResponse.code);
        } else {
          this.isProcessing.set(false);
          this.errorMessage.set('No se pudo obtener el código de autorización. Por favor intente nuevamente.');
        }
      },
      {
        config_id: this.whatsappService.FACEBOOK_CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true
      }
    );
  }

  /**
   * Exchange authorization code for access token
   */
  private exchangeCode(code: string): void {
    this.whatsappService.exchangeCode(code)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.result === 'success') {
            // Complete onboarding
            this.completeOnboarding();
          } else {
            this.isProcessing.set(false);
            this.errorMessage.set(response.message || 'Error al intercambiar el código de autorización.');
          }
        },
        error: (error) => {
          console.error('Error exchanging code:', error);
          this.isProcessing.set(false);
          this.errorMessage.set(error.error?.message || 'Error al procesar la autorización.');
        }
      });
  }

  /**
   * Complete the onboarding process
   */
  private completeOnboarding(): void {
    this.whatsappService.completeOnboarding()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.isProcessing.set(false);

          if (response.result === 'success') {
            this.isConnected.set(true);
            this.whatsappData.set(response);
            this.toastService.success('WhatsApp Business conectado exitosamente');
          } else {
            this.errorMessage.set(response.message || 'Error al completar el proceso de alta.');
          }
        },
        error: (error) => {
          console.error('Error completing onboarding:', error);
          this.isProcessing.set(false);
          this.errorMessage.set(error.error?.message || 'Error al completar el proceso de alta.');
        }
      });
  }

  /**
   * Refresh WhatsApp data
   */
  refreshData(): void {
    this.isProcessing.set(true);

    this.whatsappService.refresh()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.isProcessing.set(false);
          this.isLoading.set(false);

          if (response.result === 'success') {
            this.whatsappData.set(response);
            this.toastService.success('Datos actualizados');
          } else {
            this.toastService.error(response.message || 'Error al actualizar datos');
          }
        },
        error: (error) => {
          console.error('Error refreshing data:', error);
          this.isProcessing.set(false);
          this.isLoading.set(false);
          this.toastService.error('Error al actualizar datos');
        }
      });
  }

  /**
   * Show disconnect confirmation modal
   */
  confirmDisconnect(): void {
    this.showDisconnectModal.set(true);
  }

  /**
   * Cancel disconnect
   */
  cancelDisconnect(): void {
    this.showDisconnectModal.set(false);
  }

  /**
   * Disconnect WhatsApp integration
   */
  disconnect(): void {
    this.isProcessing.set(true);

    this.whatsappService.disconnect()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.isProcessing.set(false);
          this.showDisconnectModal.set(false);

          if (response.result === 'success') {
            this.isConnected.set(false);
            this.whatsappData.set(null);
            this.toastService.success('WhatsApp desconectado exitosamente');
          } else {
            this.toastService.error(response.message || 'Error al desconectar');
          }
        },
        error: (error) => {
          console.error('Error disconnecting:', error);
          this.isProcessing.set(false);
          this.toastService.error('Error al desconectar WhatsApp');
        }
      });
  }

  // Helper methods for template
  getStatusLabel(): string {
    return this.whatsappService.getStatusLabel(this.whatsappData()?.account_review_status || '');
  }

  getStatusBadgeClass(): string {
    return this.whatsappService.getStatusBadgeClass(this.whatsappData()?.account_review_status || '');
  }

  getStatusMessage(): string {
    return this.whatsappService.getStatusMessage(this.whatsappData()?.account_review_status || '');
  }

  getQualityBadgeClass(): string {
    return this.whatsappService.getQualityBadgeClass(this.whatsappData()?.quality_rating || '');
  }

  getStatusAlertClass(): string {
    const status = this.whatsappData()?.account_review_status?.toUpperCase();
    switch (status) {
      case 'APPROVED':
        return 'alert-success';
      case 'PENDING':
        return 'alert-warning';
      case 'REJECTED':
        return 'alert-danger';
      default:
        return 'alert-info';
    }
  }

  getStatusIconClass(): string {
    const status = this.whatsappData()?.account_review_status?.toUpperCase();
    switch (status) {
      case 'APPROVED':
        return 'bi-check-circle-fill me-2';
      case 'PENDING':
        return 'bi-clock-fill me-2';
      case 'REJECTED':
        return 'bi-x-circle-fill me-2';
      default:
        return 'bi-info-circle-fill me-2';
    }
  }
}
