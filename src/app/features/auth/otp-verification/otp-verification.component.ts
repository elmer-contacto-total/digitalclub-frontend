import { Component, inject, signal, computed, OnInit, OnDestroy, ViewChildren, QueryList, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { parseApiError, AuthErrorCode } from '../../../core/models/auth.model';
import { LogoComponent } from '../../../shared/components/logo/logo.component';

@Component({
  selector: 'app-otp-verification',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LogoComponent],
  templateUrl: './otp-verification.component.html',
  styleUrl: './otp-verification.component.scss'
})
export class OtpVerificationComponent implements OnInit, OnDestroy, AfterViewInit {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private toastService = inject(ToastService);

  @ViewChildren('digitInput') digitInputs!: QueryList<ElementRef<HTMLInputElement>>;

  otpForm: FormGroup;
  isLoading = signal(false);
  isResending = signal(false);
  resendCooldown = signal(0);
  hasError = signal(false);
  private cooldownInterval?: ReturnType<typeof setInterval>;

  // Individual digit signals
  otpDigits = [
    signal(''),
    signal(''),
    signal(''),
    signal(''),
    signal(''),
    signal('')
  ];

  // Computed: check if all digits are filled
  isComplete = computed(() => {
    return this.otpDigits.every(digit => digit().length === 1);
  });

  // Get full OTP value
  private getOtpValue(): string {
    return this.otpDigits.map(d => d()).join('');
  }

  constructor() {
    this.otpForm = this.fb.group({});
  }

  ngOnInit(): void {
    // Start cooldown for resend button
    this.startCooldown();
  }

  ngAfterViewInit(): void {
    // Focus first input
    setTimeout(() => {
      const inputs = this.digitInputs.toArray();
      if (inputs.length > 0) {
        inputs[0].nativeElement.focus();
      }
    }, 100);
  }

  ngOnDestroy(): void {
    if (this.cooldownInterval) {
      clearInterval(this.cooldownInterval);
    }
  }

  private startCooldown(): void {
    this.resendCooldown.set(60);
    this.cooldownInterval = setInterval(() => {
      const current = this.resendCooldown();
      if (current > 0) {
        this.resendCooldown.set(current - 1);
      } else {
        clearInterval(this.cooldownInterval);
      }
    }, 1000);
  }

  onDigitInput(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/\D/g, '').slice(0, 1);

    this.otpDigits[index].set(value);
    this.hasError.set(false);

    // Move to next input if value entered
    if (value && index < 5) {
      const inputs = this.digitInputs.toArray();
      inputs[index + 1]?.nativeElement.focus();
    }

    // Auto-submit when complete
    if (this.isComplete()) {
      this.onSubmit();
    }
  }

  onDigitKeydown(event: KeyboardEvent, index: number): void {
    const inputs = this.digitInputs.toArray();

    if (event.key === 'Backspace') {
      if (!this.otpDigits[index]() && index > 0) {
        // If empty and backspace, go to previous
        inputs[index - 1]?.nativeElement.focus();
        this.otpDigits[index - 1].set('');
      } else {
        this.otpDigits[index].set('');
      }
      this.hasError.set(false);
    } else if (event.key === 'ArrowLeft' && index > 0) {
      inputs[index - 1]?.nativeElement.focus();
    } else if (event.key === 'ArrowRight' && index < 5) {
      inputs[index + 1]?.nativeElement.focus();
    }
  }

  onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const pastedData = event.clipboardData?.getData('text') || '';
    const digits = pastedData.replace(/\D/g, '').slice(0, 6).split('');

    digits.forEach((digit, i) => {
      if (i < 6) {
        this.otpDigits[i].set(digit);
      }
    });

    // Focus last filled input or next empty one
    const inputs = this.digitInputs.toArray();
    const focusIndex = Math.min(digits.length, 5);
    inputs[focusIndex]?.nativeElement.focus();

    this.hasError.set(false);

    // Auto-submit if complete
    if (this.isComplete()) {
      setTimeout(() => this.onSubmit(), 100);
    }
  }

  onSubmit(): void {
    if (!this.isComplete()) {
      return;
    }

    this.isLoading.set(true);
    const otp = this.getOtpValue();

    this.authService.verifyOtp(otp).subscribe({
      next: (response) => {
        this.isLoading.set(false);

        if (response.user?.has_temporary_password) {
          this.router.navigate(['/auth/change-password']);
        } else {
          this.toastService.success('Sesión iniciada correctamente');
          this.router.navigate(['/app/dashboard']);
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        const { code, message } = parseApiError(err);

        // Handle specific error cases
        switch (code) {
          case AuthErrorCode.INVALID_OTP:
            this.hasError.set(true);
            this.toastService.error(message);
            // Clear all digits and refocus
            this.otpDigits.forEach(d => d.set(''));
            const inputs = this.digitInputs.toArray();
            inputs[0]?.nativeElement.focus();
            break;
          case AuthErrorCode.SESSION_EXPIRED:
            this.toastService.error(message);
            // Redirect back to login on session expiry
            setTimeout(() => this.goBack(), 1500);
            break;
          case AuthErrorCode.NETWORK_ERROR:
            this.toastService.error('Error de conexión. Verifique su internet.');
            break;
          default:
            this.hasError.set(true);
            this.toastService.error(message);
            this.otpDigits.forEach(d => d.set(''));
            const inputsDefault = this.digitInputs.toArray();
            inputsDefault[0]?.nativeElement.focus();
        }
      }
    });
  }

  resendOtp(): void {
    if (this.resendCooldown() > 0 || this.isResending()) return;

    this.isResending.set(true);

    this.authService.resendOtp().subscribe({
      next: () => {
        this.isResending.set(false);
        this.toastService.success('Código de seguridad reenviado');
        this.startCooldown();
        this.hasError.set(false);

        // Clear and focus first input
        this.otpDigits.forEach(d => d.set(''));
        const inputs = this.digitInputs.toArray();
        inputs[0]?.nativeElement.focus();
      },
      error: (err) => {
        this.isResending.set(false);
        const { code, message } = parseApiError(err);

        if (code === AuthErrorCode.SESSION_EXPIRED) {
          this.toastService.error(message);
          setTimeout(() => this.goBack(), 1500);
        } else {
          this.toastService.error('Error al reenviar el código');
        }
      }
    });
  }

  goBack(): void {
    this.authService.cancelOtpVerification();
    this.router.navigate(['/auth/login']);
  }
}
