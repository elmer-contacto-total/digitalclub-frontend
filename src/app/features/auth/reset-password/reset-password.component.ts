import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { parseApiError, AuthErrorCode } from '../../../core/models/auth.model';
import { LogoComponent } from '../../../shared/components/logo/logo.component';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, LogoComponent],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss'
})
export class ResetPasswordComponent implements OnInit {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toastService = inject(ToastService);

  resetForm: FormGroup;
  isLoading = signal(false);
  showPassword = signal(false);
  showConfirmPassword = signal(false);
  resetToken = signal<string | null>(null);
  tokenValid = signal(true);
  resetSuccess = signal(false);

  readonly minPasswordLength = 6;

  constructor() {
    this.resetForm = this.fb.group({
      password: ['', [
        Validators.required,
        Validators.minLength(this.minPasswordLength)
      ]],
      password_confirmation: ['', [Validators.required]]
    }, {
      validators: this.passwordMatchValidator
    });
  }

  ngOnInit(): void {
    // Get reset token from URL
    const token = this.route.snapshot.queryParamMap.get('reset_password_token');
    if (token) {
      this.resetToken.set(token);
    } else {
      this.tokenValid.set(false);
    }
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

  togglePasswordVisibility(): void {
    this.showPassword.update(v => !v);
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword.update(v => !v);
  }

  onSubmit(): void {
    if (this.resetForm.invalid || !this.resetToken()) {
      this.resetForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    const { password, password_confirmation } = this.resetForm.value;

    this.authService.resetPassword(
      this.resetToken()!,
      password,
      password_confirmation
    ).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.resetSuccess.set(true);
        this.toastService.success('Contraseña cambiada exitosamente');
        // Intentar cerrar la pestaña para que el usuario vuelva a la app de escritorio.
        // El navegador puede bloquear el cierre automático (pestañas abiertas desde un
        // enlace de correo), por eso también mostramos un botón de respaldo.
        this.attemptCloseTab();
      },
      error: (err) => {
        this.isLoading.set(false);
        const { code, message } = parseApiError(err);

        // Handle specific error cases
        switch (code) {
          case AuthErrorCode.TOKEN_INVALID:
          case AuthErrorCode.TOKEN_EXPIRED:
            this.tokenValid.set(false);
            break;
          case AuthErrorCode.PASSWORD_TOO_SHORT:
            this.toastService.error(message);
            break;
          case AuthErrorCode.PASSWORD_MISMATCH:
            this.toastService.error(message);
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

  /**
   * Cierra la pestaña del navegador automáticamente tras un breve instante,
   * de modo que el usuario vuelva a la aplicación de escritorio.
   */
  private attemptCloseTab(): void {
    setTimeout(() => this.closeTab(), 1200);
  }

  /**
   * Intenta cerrar la pestaña actual. Algunos navegadores solo permiten cerrar
   * ventanas abiertas por script; el truco window.open('','_self') ayuda en varios
   * casos, y si falla el usuario verá el mensaje para cerrarla manualmente.
   */
  closeTab(): void {
    try {
      window.close();
      window.open('', '_self');
      window.close();
    } catch {
      // El navegador bloqueó el cierre programático: se mantiene el mensaje de éxito.
    }
  }

  get passwordControl() {
    return this.resetForm.get('password');
  }

  get confirmPasswordControl() {
    return this.resetForm.get('password_confirmation');
  }
}
