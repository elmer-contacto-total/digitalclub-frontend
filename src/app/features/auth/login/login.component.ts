import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { parseApiError, AuthErrorCode } from '../../../core/models/auth.model';
import { LogoComponent } from '../../../shared/components/logo/logo.component';

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,}$/;

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, LogoComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private toastService = inject(ToastService);

  loginForm: FormGroup;
  isLoading = signal(false);
  showPassword = signal(false);
  errorMessage = signal<string | null>(null);

  constructor() {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.pattern(EMAIL_REGEX)]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  togglePasswordVisibility(): void {
    this.showPassword.update(v => !v);
  }

  onSubmit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);
    const { email, password } = this.loginForm.value;

    this.authService.login(email, password).subscribe({
      next: (response) => {
        this.isLoading.set(false);

        if (response.requires_otp) {
          // Redirect to OTP verification
          this.router.navigate(['/auth/verify-otp']);
        } else if (response.user?.has_temporary_password) {
          // Redirect to change temp password
          this.router.navigate(['/auth/change-password']);
        } else {
          // Successful login
          this.toastService.success('Sesión iniciada correctamente');
          this.router.navigate(['/app/dashboard']);
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        const { code, message } = parseApiError(err);

        // Handle specific error cases
        switch (code) {
          case AuthErrorCode.INVALID_CREDENTIALS:
            this.errorMessage.set(message);
            this.passwordControl?.reset();
            break;
          case AuthErrorCode.USER_INACTIVE:
            this.errorMessage.set(message);
            break;
          case AuthErrorCode.NETWORK_ERROR:
            this.errorMessage.set('Error de conexión. Verifique su internet.');
            break;
          default:
            this.errorMessage.set(message);
        }
      }
    });
  }

  get emailControl() {
    return this.loginForm.get('email');
  }

  get passwordControl() {
    return this.loginForm.get('password');
  }
}
