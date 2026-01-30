/**
 * Coming Soon Component
 * Placeholder for pages not yet implemented
 * Supports light/dark mode via CSS variables
 */
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-coming-soon',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="coming-soon-container">
      <div class="coming-soon-content">
        <div class="icon-wrapper">
          <i class="ph-duotone ph-wrench"></i>
        </div>
        <h1>En Construcción</h1>
        <p class="description">
          Esta página está siendo desarrollada y estará disponible pronto.
        </p>
        <p class="current-route">
          Ruta: <code>{{ currentRoute }}</code>
        </p>
        <div class="actions">
          <button class="btn-back" (click)="goBack()">
            <i class="ph ph-arrow-left"></i>
            Volver
          </button>
          <a routerLink="/app/dashboard" class="btn-dashboard">
            <i class="ph ph-house"></i>
            Ir al Dashboard
          </a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .coming-soon-container {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: calc(100vh - 200px);
      padding: var(--space-6);
      background: var(--bg-base);
    }

    .coming-soon-content {
      text-align: center;
      max-width: 500px;
    }

    .icon-wrapper {
      width: 120px;
      height: 120px;
      margin: 0 auto var(--space-6);
      background: var(--bg-subtle);
      border-radius: var(--radius-full);
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--border-default);

      i {
        font-size: 56px;
        color: var(--accent-default);
      }
    }

    h1 {
      font-size: var(--text-2xl);
      font-weight: var(--font-semibold);
      color: var(--fg-default);
      margin: 0 0 var(--space-3);
    }

    .description {
      font-size: var(--text-base);
      color: var(--fg-muted);
      margin: 0 0 var(--space-2);
      line-height: 1.5;
    }

    .current-route {
      font-size: var(--text-sm);
      color: var(--fg-subtle);
      margin: 0 0 var(--space-6);

      code {
        background: var(--bg-muted);
        padding: var(--space-1) var(--space-2);
        border-radius: var(--radius-md);
        font-family: 'Fira Code', monospace;
        color: var(--fg-muted);
      }
    }

    .actions {
      display: flex;
      gap: var(--space-3);
      justify-content: center;
      flex-wrap: wrap;
    }

    .btn-back, .btn-dashboard {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-3) var(--space-5);
      border-radius: var(--radius-md);
      font-size: var(--text-sm);
      font-weight: var(--font-medium);
      text-decoration: none;
      cursor: pointer;
      transition: all var(--duration-normal);

      i {
        font-size: 18px;
      }
    }

    .btn-back {
      background: var(--card-bg);
      border: 1px solid var(--border-default);
      color: var(--fg-default);

      &:hover {
        background: var(--bg-subtle);
        border-color: var(--border-emphasis);
      }
    }

    .btn-dashboard {
      background: var(--accent-default);
      border: 1px solid var(--accent-default);
      color: white;

      &:hover {
        background: var(--accent-emphasis);
        border-color: var(--accent-emphasis);
      }
    }
  `]
})
export class ComingSoonComponent {
  private router = inject(Router);

  get currentRoute(): string {
    return this.router.url;
  }

  goBack(): void {
    window.history.back();
  }
}
