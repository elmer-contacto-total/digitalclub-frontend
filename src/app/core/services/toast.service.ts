import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
  duration: number;
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private nextId = 0;

  /** Signal containing all active toasts */
  toasts = signal<Toast[]>([]);

  /**
   * Show a success toast
   */
  success(message: string, duration = 4000): void {
    this.show('success', message, duration);
  }

  /**
   * Show an error toast
   */
  error(message: string, duration = 6000): void {
    this.show('error', message, duration);
  }

  /**
   * Show a warning toast
   */
  warning(message: string, duration = 5000): void {
    this.show('warning', message, duration);
  }

  /**
   * Show an info toast
   */
  info(message: string, duration = 4000): void {
    this.show('info', message, duration);
  }

  /**
   * Show a toast with specified type
   */
  show(type: ToastType, message: string, duration = 4000): void {
    const id = this.nextId++;
    const toast: Toast = { id, type, message, duration };

    this.toasts.update(current => [...current, toast]);

    // Auto-remove after duration
    if (duration > 0) {
      setTimeout(() => this.dismiss(id), duration);
    }
  }

  /**
   * Dismiss a specific toast
   */
  dismiss(id: number): void {
    this.toasts.update(current => current.filter(t => t.id !== id));
  }

  /**
   * Clear all toasts
   */
  clearAll(): void {
    this.toasts.set([]);
  }
}
