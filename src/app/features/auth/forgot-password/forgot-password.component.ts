import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { LogoComponent } from '../../../shared/components/logo/logo.component';

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,}$/;

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, LogoComponent],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss'
})
export class ForgotPasswordComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private toastService = inject(ToastService);

  forgotForm: FormGroup;
  isLoading = signal(false);
  // Marca que la solicitud se envio, NO que el correo exista: el backend ya no
  // lo revela (V04, enumeracion de usuarios).
  requestSent = signal(false);
  // Mensaje de error inline: los toasts no se renderizan en las páginas de auth
  // (el contenedor de toasts vive solo en el admin-layout), así que aquí mostramos
  // el feedback dentro del propio componente.
  errorMessage = signal<string | null>(null);

  constructor() {
    this.forgotForm = this.fb.group({
      email: ['', [Validators.required, Validators.pattern(EMAIL_REGEX)]]
    });
  }

  onSubmit(): void {
    if (this.forgotForm.invalid) {
      this.forgotForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);
    const { email } = this.forgotForm.value;

    this.authService.forgotPassword(email).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        // Misma pantalla siempre. Distinguir el caso "no registrado" es
        // justamente lo que permitia enumerar cuentas validas.
        this.requestSent.set(true);
      },
      error: () => {
        this.isLoading.set(false);
        this.errorMessage.set('No se pudo procesar la solicitud. Intente nuevamente.');
      }
    });
  }

  get emailControl() {
    return this.forgotForm.get('email');
  }
}
