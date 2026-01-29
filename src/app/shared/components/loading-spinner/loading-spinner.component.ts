import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type SpinnerSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="spinner-wrapper" [class.overlay]="overlay()" [class.fullscreen]="fullscreen()">
      <div class="spinner" [ngClass]="'spinner-' + size()">
        <div class="spinner-circle"></div>
      </div>
      @if (message()) {
        <p class="spinner-message">{{ message() }}</p>
      }
    </div>
  `,
  styles: [`
    .spinner-wrapper {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--space-3);
      padding: var(--space-4);

      &.overlay {
        position: absolute;
        inset: 0;
        background: rgba(var(--bg-base-rgb, 255, 255, 255), 0.8);
        z-index: var(--z-overlay);
      }

      &.fullscreen {
        position: fixed;
        inset: 0;
        background: rgba(var(--bg-base-rgb, 255, 255, 255), 0.9);
        z-index: var(--z-modal);
      }
    }

    .spinner {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .spinner-circle {
      border-radius: 50%;
      border: 3px solid var(--border-default);
      border-top-color: var(--accent-default);
      animation: spin 0.8s linear infinite;
    }

    .spinner-sm .spinner-circle {
      width: 20px;
      height: 20px;
      border-width: 2px;
    }

    .spinner-md .spinner-circle {
      width: 32px;
      height: 32px;
      border-width: 3px;
    }

    .spinner-lg .spinner-circle {
      width: 48px;
      height: 48px;
      border-width: 4px;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    .spinner-message {
      margin: 0;
      font-size: 0.875rem;
      color: var(--fg-muted);
    }
  `]
})
export class LoadingSpinnerComponent {
  size = input<SpinnerSize>('md');
  message = input<string>('');
  overlay = input<boolean>(false);
  fullscreen = input<boolean>(false);
}
