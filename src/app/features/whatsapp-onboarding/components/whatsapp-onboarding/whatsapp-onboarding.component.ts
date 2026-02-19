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
    <!-- Page Header -->
    <div class="page-header">
      <div>
        <!-- PARIDAD: Rails "Estado de Alta Whatsapp" -->
        <h1 class="page-title">Estado de Alta WhatsApp</h1>
        <p class="page-subtitle">Gestión de integración con WhatsApp Business</p>
      </div>
    </div>

    <!-- Loading -->
    @if (isLoading()) {
      <div class="loading-state">
        <div class="spinner spinner-lg"></div>
        <p>Verificando estado de conexión...</p>
      </div>
    }

    <!-- Not Connected State - PARIDAD: Rails new.html.erb -->
    @if (!isLoading() && !isConnected()) {
      <div class="card not-connected">
        <div class="status-icon">
          <i class="ph ph-whatsapp-logo"></i>
        </div>
        <!-- PARIDAD: Rails "Haga clic en el botón para iniciar el proceso de alta de Whatsapp Business" -->
        <p class="status-text">
          Haga clic en el botón para iniciar el proceso de alta de WhatsApp Business
        </p>

        <!-- Facebook Login Button - PARIDAD: Rails styling -->
        <button
          type="button"
          class="btn btn-facebook btn-lg"
          (click)="initiateLogin()"
          [disabled]="isProcessing()">
          @if (isProcessing()) {
            <div class="spinner spinner-sm"></div>
            Procesando...
          } @else {
            <i class="ph ph-meta-logo"></i>
            Iniciar Sesión con Facebook
          }
        </button>

        @if (errorMessage()) {
          <div class="alert alert-error error-alert">
            <i class="ph ph-warning"></i>
            {{ errorMessage() }}
          </div>
        }
      </div>
    }

    <!-- Connected State - PARIDAD: Rails show.html.erb -->
    @if (!isLoading() && isConnected()) {
      <div class="card">
        <!-- Status Message -->
        <div class="alert" [ngClass]="getStatusAlertClass()">
          <i [ngClass]="getStatusIconClass()"></i>
          {{ getStatusMessage() }}
        </div>

        <!-- WhatsApp Business Details - PARIDAD: Rails DL structure -->
        <h3 class="section-title">Datos de la cuenta WhatsApp Business</h3>
        <div class="detail-grid">
          <!-- PARIDAD: "Nombre en Whatsapp Business" -->
          <span class="detail-label">Nombre en WhatsApp Business</span>
          <span class="detail-value">{{ whatsappData()?.verified_name || '-' }}</span>

          <!-- PARIDAD: "Id del Negocio en Whatsapp Business" -->
          <span class="detail-label">ID del Negocio en WhatsApp Business</span>
          <span class="detail-value"><code>{{ whatsappData()?.waba_id || '-' }}</code></span>

          <!-- PARIDAD: "Estado de Revisión de Cuenta Whatsapp" -->
          <span class="detail-label">Estado de Revisión de Cuenta</span>
          <span class="detail-value">
            <span class="badge" [ngClass]="getStatusBadgeClass()">
              {{ getStatusLabel() }}
            </span>
          </span>

          <!-- PARIDAD: "Número de Whatsapp Business" -->
          <span class="detail-label">Número de WhatsApp Business</span>
          <span class="detail-value">{{ whatsappData()?.phone_number || '-' }}</span>

          <!-- Quality Rating (if available) -->
          @if (whatsappData()?.quality_rating) {
            <span class="detail-label">Calificación de Calidad</span>
            <span class="detail-value">
              <span class="badge" [ngClass]="getQualityBadgeClass()">
                {{ whatsappData()?.quality_rating }}
              </span>
            </span>
          }
        </div>

        <!-- Actions -->
        <div class="actions-bar">
          <!-- Refresh Button -->
          <button
            type="button"
            class="btn btn-secondary"
            (click)="refreshData()"
            [disabled]="isProcessing()">
            @if (isProcessing()) {
              <div class="spinner spinner-sm"></div>
            }
            <i class="ph ph-arrows-clockwise"></i>
            Actualizar datos
          </button>

          <!-- Disconnect Button - PARIDAD: Rails "Desconectar de Whatsapp" -->
          <button
            type="button"
            class="btn btn-danger"
            (click)="confirmDisconnect()"
            [disabled]="isProcessing()">
            <i class="ph ph-x-circle"></i>
            Desconectar de WhatsApp
          </button>
        </div>
      </div>
    }

    <!-- Disconnect Confirmation Modal -->
    @if (showDisconnectModal()) {
      <div class="modal-backdrop" (click)="cancelDisconnect()">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <span class="modal-title">Confirmar desconexión</span>
            <button type="button" class="btn btn-ghost btn-icon" (click)="cancelDisconnect()">
              <i class="ph ph-x"></i>
            </button>
          </div>
          <div class="modal-body">
            <p>¿Está seguro que desea desconectar la integración de WhatsApp Business?</p>
            <p class="modal-hint">
              Esta acción eliminará la configuración actual y deberá volver a conectar su cuenta.
            </p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" (click)="cancelDisconnect()">
              Cancelar
            </button>
            <button
              type="button"
              class="btn btn-danger-solid"
              (click)="disconnect()"
              [disabled]="isProcessing()">
              @if (isProcessing()) {
                <div class="spinner spinner-sm"></div>
              }
              Desconectar
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    :host {
      display: block;
      padding: var(--space-6);
      max-width: 800px;
    }

    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-4);
      padding: var(--space-8);
      color: var(--fg-muted);
    }

    .not-connected {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: var(--space-8);
    }

    .status-icon {
      font-size: 64px;
      color: var(--success-default);
      margin-bottom: var(--space-4);
    }

    .status-text {
      color: var(--fg-muted);
      margin-bottom: var(--space-5);
    }

    .error-alert {
      margin-top: var(--space-5);
      text-align: left;
      width: 100%;
    }

    .btn-facebook {
      background-color: #1877f2;
      color: white;
      font-weight: var(--font-semibold);
      border: none;
    }

    .btn-facebook:hover:not(:disabled) {
      background-color: #166fe5;
    }

    .section-title {
      font-size: var(--text-lg);
      font-weight: var(--font-semibold);
      color: var(--fg-default);
      margin-bottom: var(--space-4);
    }

    .detail-grid {
      display: grid;
      grid-template-columns: 200px 1fr;
      gap: var(--space-3) var(--space-4);
      align-items: baseline;
    }

    .detail-label {
      font-size: var(--text-sm);
      font-weight: var(--font-medium);
      color: var(--fg-muted);
    }

    .detail-value {
      font-size: var(--text-base);
      color: var(--fg-default);
    }

    .detail-value code {
      font-family: var(--font-mono);
      font-size: var(--text-sm);
      background: var(--bg-subtle);
      padding: 2px 6px;
      border-radius: var(--radius-sm);
    }

    .actions-bar {
      display: flex;
      gap: var(--space-3);
      margin-top: var(--space-5);
      padding-top: var(--space-5);
      border-top: 1px solid var(--border-muted);
    }

    .modal-hint {
      font-size: var(--text-sm);
      color: var(--fg-muted);
    }

    .btn-danger-solid {
      background-color: var(--error-default);
      color: white;
      border: none;
    }

    .btn-danger-solid:hover:not(:disabled) {
      opacity: 0.9;
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
        return 'alert-error';
      default:
        return 'alert-info';
    }
  }

  getStatusIconClass(): string {
    const status = this.whatsappData()?.account_review_status?.toUpperCase();
    switch (status) {
      case 'APPROVED':
        return 'ph-fill ph-check-circle';
      case 'PENDING':
        return 'ph-fill ph-clock';
      case 'REJECTED':
        return 'ph-fill ph-x-circle';
      default:
        return 'ph-fill ph-info';
    }
  }
}
