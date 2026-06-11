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
  emailSent = signal(false);
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
        if (res?.emailSent) {
          // El correo existe y se envió: mostrar pantalla "Correo Enviado"
          this.emailSent.set(true);
          this.toastService.success('Se han enviado las instrucciones a su correo');
        } else {
          // Correo no registrado: NO mostrar "Correo Enviado", avisar inline
          this.errorMessage.set('El correo no está registrado');
        }
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
