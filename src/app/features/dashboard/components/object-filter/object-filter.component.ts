import { Component, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { KpiObjectType } from '../../../../core/models/dashboard.model';

export interface ObjectOption {
  label: string;
  value: string | number;
}

@Component({
  selector: 'app-object-filter',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="object-filter">
      <div class="object-buttons">
        @for (obj of objectTypes(); track obj) {
          <button
            type="button"
            class="object-btn"
            [class.active]="selectedObject() === obj"
            (click)="selectObject(obj)"
          >
            {{ getObjectLabel(obj) }}
          </button>
        }
      </div>

      @if (dropdownOptions().length > 0) {
        <select
          class="object-select"
          [value]="selectedOption()"
          (change)="onOptionChange($event)"
        >
          @for (option of dropdownOptions(); track option.value) {
            <option [value]="option.value">{{ option.label }}</option>
          }
        </select>
      }

      @if (showExportButton()) {
        <button
          type="button"
          class="export-btn"
          (click)="onExport()"
        >
          <i class="ph ph-download-simple"></i>
          Exportar KPIs a CSV
        </button>
      }
    </div>
  `,
  styles: [`
    .object-filter {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-3);
    }

    .object-buttons {
      display: flex;
      gap: var(--space-2);
    }

    .object-btn {
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

    .object-btn:hover {
      background-color: var(--bg-muted);
    }

    .object-btn.active {
      background-color: var(--accent-default);
      border-color: var(--accent-default);
      color: white;
    }

    .object-select {
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      background-color: var(--bg-subtle);
      color: var(--fg-default);
      font-size: var(--text-sm);
      min-width: 200px;
      cursor: pointer;
    }

    .object-select:focus {
      outline: none;
      border-color: var(--accent-default);
      box-shadow: 0 0 0 2px var(--accent-subtle);
    }

    .export-btn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-4);
      border-radius: var(--radius-md);
      border: none;
      background-color: var(--accent-default);
      color: white;
      font-size: var(--text-sm);
      font-weight: var(--font-medium);
      cursor: pointer;
      transition: all var(--duration-fast);
      margin-left: var(--space-4);
    }

    .export-btn:hover {
      background-color: var(--accent-emphasis);
    }

    @media (max-width: 768px) {
      .object-filter {
        flex-direction: column;
        align-items: flex-start;
      }

      .object-select {
        width: 100%;
      }

      .export-btn {
        margin-left: 0;
        width: 100%;
        justify-content: center;
      }
    }
  `]
})
export class ObjectFilterComponent {
  objectTypes = input<KpiObjectType[]>(['agent']);
  selectedObject = input<KpiObjectType>('agent');
  selectedOption = input<string | number>('Todos');
  dropdownOptions = input<ObjectOption[]>([]);
  showExportButton = input<boolean>(false);

  objectChange = output<KpiObjectType>();
  optionChange = output<string | number>();
  exportClick = output<void>();

  objectLabels: Record<KpiObjectType, string> = {
    'agent': 'Agente',
    'manager_level_4': 'Supervisor',
    'Cliente': 'Cliente'
  };

  getObjectLabel(obj: KpiObjectType): string {
    return this.objectLabels[obj] || obj;
  }

  selectObject(obj: KpiObjectType): void {
    this.objectChange.emit(obj);
  }

  onOptionChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.optionChange.emit(select.value);
  }

  onExport(): void {
    this.exportClick.emit();
  }
}
