import { Component, input, output, computed, signal, contentChildren, TemplateRef, ContentChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoadingSpinnerComponent } from '../loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../empty-state/empty-state.component';
import { PaginationComponent } from '../pagination/pagination.component';

export interface TableColumn<T = unknown> {
  key: string;
  label: string;
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  template?: TemplateRef<{ $implicit: T; row: T; index: number }>;
}

export type SortDirection = 'asc' | 'desc' | null;

export interface SortEvent {
  column: string;
  direction: SortDirection;
}

@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [CommonModule, LoadingSpinnerComponent, EmptyStateComponent, PaginationComponent],
  templateUrl: './data-table.component.html',
  styleUrl: './data-table.component.scss'
})
export class DataTableComponent<T = unknown> {
  // Data
  data = input<T[]>([]);
  columns = input<TableColumn<T>[]>([]);

  // State
  loading = input<boolean>(false);
  selectable = input<boolean>(false);
  hoverable = input<boolean>(true);

  // Pagination
  paginated = input<boolean>(true);
  currentPage = input<number>(1);
  pageSize = input<number>(10);
  totalItems = input<number | null>(null);

  // Sorting
  sortColumn = input<string | null>(null);
  sortDirection = input<SortDirection>(null);

  // Empty state
  emptyIcon = input<string>('ph-folder-open');
  emptyTitle = input<string>('No hay datos');
  emptyDescription = input<string>('');

  // Outputs
  rowClick = output<T>();
  sortChange = output<SortEvent>();
  pageChange = output<number>();
  pageSizeChange = output<number>();
  selectionChange = output<T[]>();

  // Internal state
  selectedRows = signal<Set<number>>(new Set());

  // Computed
  computedTotalItems = computed(() => {
    return this.totalItems() ?? this.data().length;
  });

  displayedData = computed(() => {
    const allData = this.data();
    if (!this.paginated()) {
      return allData;
    }

    // If totalItems is provided, assume server-side pagination
    if (this.totalItems() !== null) {
      return allData;
    }

    // Client-side pagination
    const start = (this.currentPage() - 1) * this.pageSize();
    return allData.slice(start, start + this.pageSize());
  });

  isAllSelected = computed(() => {
    const displayed = this.displayedData();
    return displayed.length > 0 && this.selectedRows().size === displayed.length;
  });

  onRowClick(row: T, index: number): void {
    if (this.selectable()) {
      this.toggleRowSelection(index);
    }
    this.rowClick.emit(row);
  }

  onSort(column: TableColumn<T>): void {
    if (!column.sortable) return;

    let direction: SortDirection = 'asc';

    if (this.sortColumn() === column.key) {
      if (this.sortDirection() === 'asc') {
        direction = 'desc';
      } else if (this.sortDirection() === 'desc') {
        direction = null;
      }
    }

    this.sortChange.emit({ column: column.key, direction });
  }

  onPageChange(page: number): void {
    this.pageChange.emit(page);
  }

  onPageSizeChange(size: number): void {
    this.pageSizeChange.emit(size);
  }

  toggleRowSelection(index: number): void {
    this.selectedRows.update(selected => {
      const newSelected = new Set(selected);
      if (newSelected.has(index)) {
        newSelected.delete(index);
      } else {
        newSelected.add(index);
      }
      return newSelected;
    });
    this.emitSelectionChange();
  }

  toggleAllSelection(): void {
    const displayed = this.displayedData();
    if (this.isAllSelected()) {
      this.selectedRows.set(new Set());
    } else {
      this.selectedRows.set(new Set(displayed.map((_, i) => i)));
    }
    this.emitSelectionChange();
  }

  isRowSelected(index: number): boolean {
    return this.selectedRows().has(index);
  }

  private emitSelectionChange(): void {
    const displayed = this.displayedData();
    const selected = Array.from(this.selectedRows())
      .map(index => displayed[index])
      .filter(Boolean);
    this.selectionChange.emit(selected);
  }

  getCellValue(row: T, key: string): unknown {
    const keys = key.split('.');
    let value: unknown = row;
    for (const k of keys) {
      if (value && typeof value === 'object') {
        value = (value as Record<string, unknown>)[k];
      } else {
        return undefined;
      }
    }
    return value;
  }

  getSortIcon(column: TableColumn<T>): string {
    if (this.sortColumn() !== column.key) {
      return 'ph-arrows-down-up';
    }
    return this.sortDirection() === 'asc' ? 'ph-arrow-up' : 'ph-arrow-down';
  }
}
