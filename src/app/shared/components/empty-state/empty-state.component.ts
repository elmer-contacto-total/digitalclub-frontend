import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="empty-state">
      @if (icon()) {
        <div class="empty-icon">
          <i class="ph {{ icon() }}"></i>
        </div>
      }
      <h3 class="empty-title">{{ title() }}</h3>
      @if (description()) {
        <p class="empty-description">{{ description() }}</p>
      }
      @if (actionLabel()) {
        <button type="button" class="btn btn-primary" (click)="onAction()">
          @if (actionIcon()) {
            <i class="ph {{ actionIcon() }}"></i>
          }
          {{ actionLabel() }}
        </button>
      }
      <ng-content></ng-content>
    </div>
  `,
  styles: [`
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--space-8);
      text-align: center;
    }

    .empty-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 80px;
      height: 80px;
      margin-bottom: var(--space-4);
      background: var(--bg-subtle);
      border-radius: var(--radius-full);

      i {
        font-size: 2.5rem;
        color: var(--fg-muted);
      }
    }

    .empty-title {
      margin: 0 0 var(--space-2) 0;
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--fg-default);
    }

    .empty-description {
      margin: 0 0 var(--space-5) 0;
      max-width: 400px;
      font-size: 0.875rem;
      color: var(--fg-muted);
      line-height: 1.5;
    }

    .btn {
      margin-top: var(--space-2);
    }
  `]
})
export class EmptyStateComponent {
  icon = input<string>('ph-folder-open');
  title = input<string>('No hay datos');
  description = input<string>('');
  actionLabel = input<string>('');
  actionIcon = input<string>('');

  action = output<void>();

  onAction(): void {
    this.action.emit();
  }
}
