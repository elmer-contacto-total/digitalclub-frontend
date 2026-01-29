import { Component, input, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PeriodType, PERIODS_CONFIG, DateRange } from '../../../../core/models/dashboard.model';

@Component({
  selector: 'app-period-selector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="period-selector">
      <div class="period-buttons">
        @for (period of periods; track period.id) {
          <button
            type="button"
            class="period-btn"
            [class.active]="selectedPeriod() === period.id"
            (click)="selectPeriod(period.id)"
          >
            {{ period.label }}
          </button>
        }
      </div>

      <div class="custom-range">
        <span class="range-label">Período Personalizado</span>
        <div class="date-inputs">
          <input
            type="date"
            class="date-input"
            [value]="fromDate()"
            (change)="onFromDateChange($event)"
            placeholder="Desde..."
          />
          <input
            type="date"
            class="date-input"
            [value]="toDate()"
            (change)="onToDateChange($event)"
            placeholder="Hasta..."
          />
          <button
            type="button"
            class="calc-btn"
            [disabled]="!canCalculateCustom()"
            (click)="calculateCustom()"
          >
            Calcular
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .period-selector {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-4);
    }

    .period-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .period-btn {
      padding: var(--space-2) var(--space-4);
      border-radius: var(--radius-md);
      border: 1px solid var(--border-default);
      background-color: var(--bg-subtle);
      color: var(--fg-default);
      font-size: var(--text-sm);
      font-weight: var(--font-medium);
      cursor: pointer;
      transition: all var(--duration-fast);
    }

    .period-btn:hover {
      background-color: var(--bg-muted);
    }

    .period-btn.active {
      background-color: var(--accent-default);
      border-color: var(--accent-default);
      color: white;
    }

    .custom-range {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-3);
    }

    .range-label {
      font-size: var(--text-sm);
      color: var(--fg-muted);
    }

    .date-inputs {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .date-input {
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      background-color: var(--bg-subtle);
      color: var(--fg-default);
      font-size: var(--text-sm);
      width: 140px;
    }

    .date-input:focus {
      outline: none;
      border-color: var(--accent-default);
      box-shadow: 0 0 0 2px var(--accent-subtle);
    }

    .calc-btn {
      padding: var(--space-2) var(--space-4);
      border-radius: var(--radius-md);
      border: 1px solid var(--border-default);
      background-color: var(--bg-subtle);
      color: var(--fg-default);
      font-size: var(--text-sm);
      font-weight: var(--font-medium);
      cursor: pointer;
      transition: all var(--duration-fast);
    }

    .calc-btn:hover:not(:disabled) {
      background-color: var(--bg-muted);
    }

    .calc-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    @media (max-width: 768px) {
      .period-selector {
        flex-direction: column;
        align-items: flex-start;
      }

      .custom-range {
        flex-direction: column;
        align-items: flex-start;
      }

      .date-inputs {
        flex-wrap: wrap;
      }

      .date-input {
        width: 100%;
      }
    }
  `]
})
export class PeriodSelectorComponent {
  selectedPeriod = input<PeriodType>('today');

  periodChange = output<PeriodType>();
  customRangeChange = output<DateRange>();

  periods = PERIODS_CONFIG;

  fromDate = signal<string>('');
  toDate = signal<string>('');

  canCalculateCustom = computed(() => {
    const from = this.fromDate();
    const to = this.toDate();
    if (!from || !to) return false;
    return new Date(from) < new Date(to);
  });

  selectPeriod(periodId: PeriodType): void {
    if (periodId !== 'last_custom') {
      this.periodChange.emit(periodId);
    }
  }

  onFromDateChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.fromDate.set(input.value);
  }

  onToDateChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.toDate.set(input.value);
  }

  calculateCustom(): void {
    if (!this.canCalculateCustom()) return;

    this.periodChange.emit('last_custom');
    this.customRangeChange.emit({
      fromDate: this.fromDate(),
      toDate: this.toDate()
    });
  }
}
