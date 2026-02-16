import { Component, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-pagination',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="pagination">
      <div class="pagination-info">
        Mostrando {{ startItem() }} - {{ endItem() }} de {{ totalItems() }}
      </div>

      <div class="pagination-controls">
        <!-- Previous button -->
        <button
          type="button"
          class="pagination-btn"
          [disabled]="currentPage() === 1"
          (click)="goToPage(currentPage() - 1)"
          aria-label="Página anterior"
        >
          <i class="ph ph-caret-left"></i>
        </button>

        <!-- Page numbers -->
        @for (page of visiblePages(); track page) {
          @if (page === '...') {
            <span class="pagination-ellipsis">...</span>
          } @else {
            <button
              type="button"
              class="pagination-btn"
              [class.active]="page === currentPage()"
              (click)="goToPage(+page)"
            >
              {{ page }}
            </button>
          }
        }

        <!-- Next button -->
        <button
          type="button"
          class="pagination-btn"
          [disabled]="currentPage() === totalPages()"
          (click)="goToPage(currentPage() + 1)"
          aria-label="Página siguiente"
        >
          <i class="ph ph-caret-right"></i>
        </button>
      </div>

      @if (showPageSize()) {
        <div class="pagination-size">
          <label>
            <span>Por página:</span>
            <select
              [value]="pageSize()"
              (change)="onPageSizeChange($event)"
            >
              @for (size of pageSizeOptions(); track size) {
                <option [value]="size" [selected]="size === pageSize()">{{ size }}</option>
              }
            </select>
          </label>
        </div>
      }
    </div>
  `,
  styles: [`
    .pagination {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: var(--space-4);
      padding: var(--space-4) 0;
    }

    .pagination-info {
      font-size: 0.875rem;
      color: var(--fg-muted);
    }

    .pagination-controls {
      display: flex;
      align-items: center;
      gap: var(--space-1);
    }

    .pagination-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 36px;
      height: 36px;
      padding: 0 var(--space-2);
      background: var(--bg-base);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      color: var(--fg-default);
      font-size: 0.875rem;
      cursor: pointer;
      transition: all var(--duration-fast);

      &:hover:not(:disabled) {
        background: var(--bg-subtle);
        border-color: var(--border-emphasis);
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      &.active {
        background: var(--accent-default);
        border-color: var(--accent-default);
        color: white;
      }

      i {
        font-size: 1rem;
      }
    }

    .pagination-ellipsis {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      color: var(--fg-muted);
    }

    .pagination-size {
      display: flex;
      align-items: center;

      label {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        font-size: 0.875rem;
        color: var(--fg-muted);
      }

      select {
        padding: var(--space-1) var(--space-2);
        background: var(--input-bg);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-md);
        color: var(--fg-default);
        font-size: 0.875rem;
        cursor: pointer;

        &:focus {
          outline: none;
          border-color: var(--accent-default);
        }
      }
    }
  `]
})
export class PaginationComponent {
  currentPage = input<number>(1);
  totalItems = input<number>(0);
  pageSize = input<number>(10);
  pageSizeOptions = input<number[]>([10, 25, 50, 100]);
  showPageSize = input<boolean>(true);
  maxVisiblePages = input<number>(5);

  pageChange = output<number>();
  pageSizeChange = output<number>();

  totalPages = computed(() => {
    return Math.ceil(this.totalItems() / this.pageSize()) || 1;
  });

  startItem = computed(() => {
    if (this.totalItems() === 0) return 0;
    return (this.currentPage() - 1) * this.pageSize() + 1;
  });

  endItem = computed(() => {
    return Math.min(this.currentPage() * this.pageSize(), this.totalItems());
  });

  visiblePages = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    const maxVisible = this.maxVisiblePages();

    if (total <= maxVisible) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }

    const pages: (number | string)[] = [];
    const half = Math.floor(maxVisible / 2);

    let start = Math.max(1, current - half);
    let end = Math.min(total, start + maxVisible - 1);

    if (end - start < maxVisible - 1) {
      start = Math.max(1, end - maxVisible + 1);
    }

    if (start > 1) {
      pages.push(1);
      if (start > 2) {
        pages.push('...');
      }
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (end < total) {
      if (end < total - 1) {
        pages.push('...');
      }
      pages.push(total);
    }

    return pages;
  });

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages() && page !== this.currentPage()) {
      this.pageChange.emit(page);
    }
  }

  onPageSizeChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const newSize = parseInt(select.value, 10);
    this.pageSizeChange.emit(newSize);
  }
}
