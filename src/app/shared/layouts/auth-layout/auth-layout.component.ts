import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-auth-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  templateUrl: './auth-layout.component.html',
  styleUrl: './auth-layout.component.scss'
})
export class AuthLayoutComponent {
  readonly currentYear = new Date().getFullYear();

  // El contenedor de toasts vivía solo en admin-layout, así que todo lo que
  // /auth reportaba por toast (OTP agotado, correo no registrado, errores de
  // red) no se veía. Se venía parcheando pantalla por pantalla con errores
  // inline; montarlo acá lo resuelve para todas.
  private toastService = inject(ToastService);

  get toasts() {
    return this.toastService.toasts;
  }

  dismissToast(id: number): void {
    this.toastService.dismiss(id);
  }

  getToastIcon(type: string): string {
    const icons: Record<string, string> = {
      success: 'ph-check-circle',
      error: 'ph-x-circle',
      warning: 'ph-warning',
      info: 'ph-info'
    };
    return icons[type] || 'ph-info';
  }
}
