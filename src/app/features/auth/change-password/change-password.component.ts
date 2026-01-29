import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { parseApiError, AuthErrorCode } from '../../../core/models/auth.model';
import { LogoComponent } from '../../../shared/components/logo/logo.component';

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LogoComponent],
  templateUrl: './change-password.component.html',
  styleUrl: './change-password.component.scss'
})
export class ChangePasswordComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private toastService = inject(ToastService);

  changeForm: FormGroup;
  isLoading = signal(false);
  showCurrentPassword = signal(false);
  showNewPassword = signal(false);
  showConfirmPassword = signal(false);

  // PARIDAD RAILS: 8 caracteres mínimo para cambio de contraseña temporal
  readonly minPasswordLength = 8;

  constructor() {
    this.changeForm = this.fb.group({
      // PARIDAD RAILS: current_password es opcional (Rails no lo valida en update_temp_password)
      current_password: [''],
      password: ['', [
        Validators.required,
        Validators.minLength(this.minPasswordLength)
      ]],
      password_confirmation: ['', [Validators.required]]
    }, {
      validators: this.passwordMatchValidator
    });
  }

  private passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password');
    const confirmPassword = control.get('password_confirmation');

    if (password && confirmPassword && password.value !== confirmPassword.value) {
      confirmPassword.setErrors({ passwordMismatch: true });
      return { passwordMismatch: true };
    }
    return null;
  }

  toggleCurrentPasswordVisibility(): void {
    this.showCurrentPassword.update(v => !v);
  }

  toggleNewPasswordVisibility(): void {
    this.showNewPassword.update(v => !v);
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword.update(v => !v);
  }

  onSubmit(): void {
    if (this.changeForm.invalid) {
      this.changeForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    const { current_password, password, password_confirmation } = this.changeForm.value;

    this.authService.changePassword(current_password, password, password_confirmation).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.toastService.success('Contraseña actualizada exitosamente');
        this.router.navigate(['/app/dashboard']);
      },
      error: (err) => {
        this.isLoading.set(false);
        const { code, message } = parseApiError(err);

        // Handle specific error cases
        switch (code) {
          case AuthErrorCode.PASSWORD_TOO_SHORT:
            this.toastService.error(message);
            this.passwordControl?.markAsTouched();
            break;
          case AuthErrorCode.PASSWORD_MISMATCH:
            this.toastService.error(message);
            this.confirmPasswordControl?.markAsTouched();
            break;
          case AuthErrorCode.SESSION_EXPIRED:
          case AuthErrorCode.TOKEN_INVALID:
            this.toastService.error('Sesión expirada. Por favor inicie sesión nuevamente.');
            this.router.navigate(['/auth/login']);
            break;
          case AuthErrorCode.NETWORK_ERROR:
            this.toastService.error('Error de conexión. Verifique su internet.');
            break;
          default:
            this.toastService.error(message);
        }
      }
    });
  }

  get currentPasswordControl() {
    return this.changeForm.get('current_password');
  }

  get passwordControl() {
    return this.changeForm.get('password');
  }

  get confirmPasswordControl() {
    return this.changeForm.get('password_confirmation');
  }
}
