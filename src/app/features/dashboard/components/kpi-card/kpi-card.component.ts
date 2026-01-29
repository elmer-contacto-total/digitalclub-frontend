import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { getPercentageChangeClass, formatPercentageChange } from '../../../../core/models/dashboard.model';

@Component({
  selector: 'app-kpi-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="kpi-card">
      <div class="kpi-card-header">
        <div class="kpi-title-container">
          <h5 class="kpi-title">{{ title() }}</h5>
          @if (tooltip()) {
            <button
              type="button"
              class="tooltip-trigger"
              [attr.aria-label]="'Información: ' + tooltip()"
              (click)="showTooltip = !showTooltip"
            >
              <i class="ph ph-question"></i>
            </button>
            @if (showTooltip) {
              <div class="tooltip-content">
                {{ tooltip() }}
              </div>
            }
          }
        </div>
        <div class="kpi-icon">
          <i [class]="'ph ' + icon()"></i>
        </div>
      </div>

      <div class="kpi-value-container">
        <span class="kpi-value">{{ formattedValue() }}</span>
        @if (unit()) {
          <span class="kpi-unit">{{ unit() }}</span>
        }
      </div>

      <div class="kpi-change-container">
        <span class="kpi-change" [class]="percentageClass()">
          <i class="ph" [class]="changeIcon()"></i>
          {{ formattedPercentage() }}
        </span>
        <span class="kpi-comparison">{{ comparisonLabel() }}</span>
      </div>
    </div>
  `,
  styles: [`
    .kpi-card {
      background-color: var(--bg-subtle);
      border-radius: var(--radius-lg);
      padding: var(--space-5);
      border: 1px solid var(--border-muted);
      transition: box-shadow var(--duration-normal);
    }

    .kpi-card:hover {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }

    .kpi-card-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: var(--space-3);
    }

    .kpi-title-container {
      position: relative;
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .kpi-title {
      font-size: var(--text-sm);
      font-weight: var(--font-medium);
      color: var(--fg-muted);
      margin: 0;
    }

    .tooltip-trigger {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      border: none;
      background: none;
      color: var(--fg-subtle);
      cursor: pointer;
      padding: 0;
      transition: color var(--duration-fast);
    }

    .tooltip-trigger:hover {
      color: var(--fg-muted);
    }

    .tooltip-content {
      position: absolute;
      top: 100%;
      left: 0;
      z-index: 100;
      width: 220px;
      padding: var(--space-2) var(--space-3);
      background-color: var(--bg-emphasis);
      border-radius: var(--radius-md);
      font-size: var(--text-xs);
      color: var(--fg-default);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      margin-top: var(--space-2);
    }

    .kpi-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border-radius: var(--radius-md);
      background-color: var(--accent-subtle);
      color: var(--accent-default);
    }

    .kpi-icon i {
      font-size: 18px;
    }

    .kpi-value-container {
      display: flex;
      align-items: baseline;
      gap: var(--space-1);
      margin-bottom: var(--space-3);
    }

    .kpi-value {
      font-size: var(--text-2xl);
      font-weight: var(--font-semibold);
      color: var(--fg-default);
      line-height: 1.2;
    }

    .kpi-unit {
      font-size: var(--text-base);
      color: var(--fg-muted);
    }

    .kpi-change-container {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .kpi-change {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      padding: var(--space-1) var(--space-2);
      border-radius: var(--radius-sm);
      font-size: var(--text-xs);
      font-weight: var(--font-medium);
    }

    .kpi-change.badge-success {
      background-color: var(--success-subtle);
      color: var(--success-text);
    }

    .kpi-change.badge-danger {
      background-color: var(--error-subtle);
      color: var(--error-text);
    }

    .kpi-change.badge-neutral {
      background-color: var(--bg-muted);
      color: var(--fg-muted);
    }

    .kpi-comparison {
      font-size: var(--text-xs);
      color: var(--fg-subtle);
    }
  `]
})
export class KpiCardComponent {
  title = input.required<string>();
  value = input.required<number | null | undefined>();
  percentage = input<number | null | undefined>();
  tooltip = input<string>('');
  unit = input<string>('');
  icon = input<string>('ph-chart-line');
  invertColor = input<boolean>(false);
  comparisonLabel = input<string>('Desde ayer');

  showTooltip = false;

  formattedValue = computed(() => {
    const val = this.value();
    if (val === null || val === undefined) {
      return '-';
    }
    return val.toLocaleString('es-PE');
  });

  formattedPercentage = computed(() => {
    return formatPercentageChange(this.percentage());
  });

  percentageClass = computed(() => {
    return getPercentageChangeClass(this.percentage(), this.invertColor());
  });

  changeIcon = computed(() => {
    const pct = this.percentage();
    if (pct === null || pct === undefined) {
      return 'ph-minus';
    }
    return pct >= 0 ? 'ph-arrow-up-right' : 'ph-arrow-down-right';
  });
}
