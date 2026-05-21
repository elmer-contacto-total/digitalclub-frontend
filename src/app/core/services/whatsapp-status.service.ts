import { Injectable, inject, signal } from '@angular/core';
import { retry } from 'rxjs/operators';
import { WhatsAppOnboardingService } from './whatsapp-onboarding.service';

@Injectable({ providedIn: 'root' })
export class WhatsAppStatusService {
  private onboardingService = inject(WhatsAppOnboardingService);
  private _isConnected = signal<boolean | null>(null);
  readonly isConnected = this._isConnected.asReadonly();

  constructor() {
    this.onboardingService.checkStatus().pipe(retry(1)).subscribe({
      next: (status) => this._isConnected.set(status.is_connected),
      error: () => this._isConnected.set(false)
    });
  }
}
