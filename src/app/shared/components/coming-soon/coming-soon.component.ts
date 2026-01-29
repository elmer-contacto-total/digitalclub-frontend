/**
 * Coming Soon Component
 * Placeholder for pages not yet implemented
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
      padding: 24px;
    }

    .coming-soon-content {
      text-align: center;
      max-width: 500px;
    }

    .icon-wrapper {
      width: 120px;
      height: 120px;
      margin: 0 auto 24px;
      background: linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;

      i {
        font-size: 56px;
        color: var(--primary-color, #25d366);
      }
    }

    h1 {
      font-size: 28px;
      font-weight: 600;
      color: var(--text-primary, #333);
      margin: 0 0 12px;
    }

    .description {
      font-size: 16px;
      color: var(--text-secondary, #666);
      margin: 0 0 8px;
      line-height: 1.5;
    }

    .current-route {
      font-size: 13px;
      color: var(--text-muted, #999);
      margin: 0 0 24px;

      code {
        background: var(--bg-secondary, #f5f5f5);
        padding: 2px 8px;
        border-radius: 4px;
        font-family: 'Fira Code', monospace;
      }
    }

    .actions {
      display: flex;
      gap: 12px;
      justify-content: center;
      flex-wrap: wrap;
    }

    .btn-back, .btn-dashboard {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.2s;

      i {
        font-size: 18px;
      }
    }

    .btn-back {
      background: white;
      border: 1px solid var(--border-color, #e0e0e0);
      color: var(--text-primary, #333);

      &:hover {
        background: var(--bg-hover, #f5f5f5);
        border-color: var(--text-muted, #999);
      }
    }

    .btn-dashboard {
      background: var(--primary-color, #25d366);
      border: none;
      color: white;

      &:hover {
        background: var(--primary-dark, #128c7e);
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
