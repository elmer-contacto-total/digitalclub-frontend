import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IndividualKpiRow,
  IndividualKpis,
  INDIVIDUAL_KPI_COLUMNS,
  calculateTableTotals
} from '../../../../core/models/dashboard.model';

@Component({
  selector: 'app-kpi-table',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="kpi-table-container">
      <div class="kpi-table-header">
        <h5 class="kpi-table-title">KPIs Detallados</h5>
      </div>

      <div class="kpi-table-wrapper">
        @if (rows().length === 0) {
          <div class="empty-state">
            <i class="ph ph-table"></i>
            <p>No hay datos para mostrar</p>
          </div>
        } @else {
          <table class="kpi-table">
            <thead>
              <tr>
                @for (col of visibleColumns(); track col.key) {
                  <th>
                    {{ col.label }}
                    @if (col.tooltip) {
                      <button
                        type="button"
                        class="tooltip-trigger"
                        [attr.aria-label]="col.tooltip"
                        [title]="col.tooltip"
                      >
                        <i class="ph ph-question"></i>
                      </button>
                    }
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.userId) {
                <tr>
                  <td>{{ row.userName }}</td>
                  <td>{{ row.kpis.client_responded_rate }}%</td>
                  <td>{{ row.kpis.new_cases }}</td>
                  <td>{{ row.kpis.client_cases_to_close_period }}</td>
                  @if (showCloseTypeKpis()) {
                    <td>{{ row.kpis.closed_con_acuerdo_cases }}</td>
                    <td>{{ row.kpis.closed_sin_acuerdo_cases }}</td>
                  }
                  <td>{{ row.kpis.client_unique_responded_to }}</td>
                  <td>{{ row.kpis.clients_to_respond_to }}</td>
                  <td>{{ row.kpis.client_total_sent_messages }}</td>
                </tr>
              }
            </tbody>
            @if (showTotals()) {
              <tfoot>
                <tr class="totals-row">
                  <th>Total</th>
                  <th>{{ totals().client_responded_rate }}%</th>
                  <th>{{ totals().new_cases }}</th>
                  <th>{{ totals().client_cases_to_close_period }}</th>
                  @if (showCloseTypeKpis()) {
                    <th>{{ totals().closed_con_acuerdo_cases }}</th>
                    <th>{{ totals().closed_sin_acuerdo_cases }}</th>
                  }
                  <th>{{ totals().client_unique_responded_to }}</th>
                  <th>{{ totals().clients_to_respond_to }}</th>
                  <th>{{ totals().client_total_sent_messages }}</th>
                </tr>
              </tfoot>
            }
          </table>
        }
      </div>
    </div>
  `,
  styles: [`
    .kpi-table-container {
      background-color: var(--bg-subtle);
      border-radius: var(--radius-lg);
      border: 1px solid var(--border-muted);
      overflow: hidden;
    }

    .kpi-table-header {
      padding: var(--space-4) var(--space-5);
      border-bottom: 1px solid var(--border-muted);
    }

    .kpi-table-title {
      font-size: var(--text-base);
      font-weight: var(--font-semibold);
      color: var(--fg-default);
      margin: 0;
    }

    .kpi-table-wrapper {
      overflow-x: auto;
    }

    .kpi-table {
      width: 100%;
      border-collapse: collapse;
      font-size: var(--text-sm);
    }

    .kpi-table thead {
      background-color: var(--bg-muted);
    }

    .kpi-table th {
      padding: var(--space-3) var(--space-4);
      text-align: left;
      font-weight: var(--font-medium);
      color: var(--fg-muted);
      white-space: nowrap;
      border-bottom: 1px solid var(--border-muted);
    }

    .kpi-table td {
      padding: var(--space-3) var(--space-4);
      color: var(--fg-default);
      border-bottom: 1px solid var(--border-muted);
    }

    .kpi-table tbody tr:hover {
      background-color: var(--bg-muted);
    }

    .kpi-table tfoot .totals-row {
      background-color: var(--bg-emphasis);
    }

    .kpi-table tfoot th {
      border-bottom: none;
      color: var(--fg-default);
    }

    .tooltip-trigger {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border: none;
      background: none;
      color: var(--fg-subtle);
      cursor: help;
      padding: 0;
      margin-left: var(--space-1);
    }

    .tooltip-trigger:hover {
      color: var(--fg-muted);
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--space-8);
      color: var(--fg-subtle);
    }

    .empty-state i {
      font-size: 48px;
      margin-bottom: var(--space-3);
    }

    .empty-state p {
      margin: 0;
      font-size: var(--text-sm);
    }
  `]
})
export class KpiTableComponent {
  rows = input<IndividualKpiRow[]>([]);
  showCloseTypeKpis = input<boolean>(false);

  allColumns = INDIVIDUAL_KPI_COLUMNS;

  visibleColumns = computed(() => {
    const cols = [...this.allColumns];
    if (!this.showCloseTypeKpis()) {
      return cols.filter(c =>
        c.key !== 'closed_con_acuerdo_cases' &&
        c.key !== 'closed_sin_acuerdo_cases'
      );
    }
    return cols;
  });

  showTotals = computed(() => this.rows().length > 1);

  totals = computed(() => calculateTableTotals(this.rows()));
}
