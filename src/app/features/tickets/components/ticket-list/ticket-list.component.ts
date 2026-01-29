/**
 * Ticket List Component (Listado de Mensajes)
 * PARIDAD: Rails admin/messages/index.html.erb
 * Tabs: Entrantes / Salientes
 */
import { Component, inject, signal, OnInit, OnDestroy, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { TicketService } from '../../../chat/services/ticket.service';
import { ToastService } from '../../../../core/services/toast.service';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';

interface MessageItem {
  id: number;
  senderName?: string;
  receiverName?: string;
  content: string;
  createdAt: string;
  direction: 'incoming' | 'outgoing';
}

@Component({
  selector: 'app-ticket-list',
  standalone: true,
  imports: [CommonModule, FormsModule, LoadingSpinnerComponent, EmptyStateComponent, PaginationComponent],
  template: `
    <div class="message-list-container">
      <!-- Header - PARIDAD: Rails admin/messages/index.html.erb -->
      <div class="page-header">
        <h1>Listado de Mensajes</h1>
      </div>

      <!-- Layout: Tabs verticales + Table -->
      <div class="content-layout">
        <!-- Vertical Tabs - PARIDAD: Rails tabs -->
        <div class="vertical-tabs">
          <button
            class="tab-btn"
            [class.active]="activeTab() === 'incoming'"
            (click)="setActiveTab('incoming')"
          >
            <i class="bi bi-inbox"></i>
            Entrantes
          </button>
          <button
            class="tab-btn"
            [class.active]="activeTab() === 'outgoing'"
            (click)="setActiveTab('outgoing')"
          >
            <i class="bi bi-send"></i>
            Salientes
          </button>
        </div>

        <!-- Table Content -->
        <div class="table-content">
          <!-- Search - DataTable style -->
          <div class="datatable-header">
            <div class="search-wrapper">
              <label>Buscar:</label>
              <input
                type="text"
                class="form-control search-input"
                [(ngModel)]="searchTerm"
                (input)="onSearch()"
              />
            </div>
          </div>

          @if (isLoading()) {
            <app-loading-spinner [overlay]="false" message="Cargando mensajes..." />
          } @else if (messages().length === 0) {
            <app-empty-state
              icon="bi-chat-dots"
              title="No hay mensajes"
              [description]="activeTab() === 'incoming' ? 'No hay mensajes entrantes' : 'No hay mensajes salientes'"
            />
          } @else {
            <!-- DataTable - PARIDAD: Rails messages index -->
            <div class="table-responsive">
              <table class="table table-striped table-bordered table-hover">
                <thead>
                  <tr>
                    @if (activeTab() === 'incoming') {
                      <th>Enviado por</th>
                    } @else {
                      <th>Recibido por</th>
                    }
                    <th>Mensaje</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  @for (message of messages(); track message.id) {
                    <tr>
                      <td>
                        @if (activeTab() === 'incoming') {
                          {{ message.senderName || '-' }}
                        } @else {
                          {{ message.receiverName || '-' }}
                        }
                      </td>
                      <td class="message-content">{{ truncateMessage(message.content) }}</td>
                      <td class="date-col">{{ formatDate(message.createdAt) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            <!-- Pagination Footer -->
            <div class="datatable-footer">
              <div class="info">
                Mostrando {{ startRecord() }} - {{ endRecord() }} de {{ totalRecords() }} mensajes
              </div>
              <app-pagination
                [currentPage]="currentPage()"
                [totalItems]="totalRecords()"
                [pageSize]="pageSize()"
                (pageChange)="onPageChange($event)"
              />
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .message-list-container {
      padding: 24px;
    }

    /* Page Header - PARIDAD: Rails page-header */
    .page-header {
      margin-bottom: 24px;

      h1 {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 500;
        color: var(--text-primary, #212529);
      }
    }

    /* Content Layout - Tabs + Table */
    .content-layout {
      display: flex;
      gap: 0;
      background: white;
      border: 1px solid var(--border-color, #dee2e6);
      border-radius: 4px;
    }

    /* Vertical Tabs - PARIDAD: Rails vertical tabs */
    .vertical-tabs {
      display: flex;
      flex-direction: column;
      border-right: 1px solid var(--border-color, #dee2e6);
      padding: 16px 0;
      min-width: 150px;
      background: var(--bg-light, #f8f9fa);
    }

    .tab-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 20px;
      border: none;
      background: transparent;
      text-align: left;
      font-size: 14px;
      color: var(--text-secondary, #6c757d);
      cursor: pointer;
      transition: all 0.15s;

      i {
        font-size: 16px;
      }

      &:hover {
        background: rgba(0, 0, 0, 0.05);
        color: var(--text-primary, #212529);
      }

      &.active {
        background: white;
        color: var(--primary-color, #0d6efd);
        border-right: 2px solid var(--primary-color, #0d6efd);
        font-weight: 500;
      }
    }

    /* Table Content */
    .table-content {
      flex: 1;
      padding: 16px;
    }

    /* DataTable Header */
    .datatable-header {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 16px;
    }

    .search-wrapper {
      display: flex;
      align-items: center;
      gap: 8px;

      label {
        font-size: 14px;
        color: var(--text-secondary, #6c757d);
      }
    }

    .search-input {
      width: 200px;
      padding: 6px 12px;
      border: 1px solid var(--border-color, #ced4da);
      border-radius: 4px;
      font-size: 14px;

      &:focus {
        outline: none;
        border-color: var(--primary-color, #86b7fe);
        box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.25);
      }
    }

    /* Table - PARIDAD: Rails DataTable */
    .table-responsive {
      overflow: auto;
    }

    .table {
      width: 100%;
      margin: 0;
      border-collapse: collapse;
      font-size: 14px;
    }

    .table th,
    .table td {
      padding: 12px;
      border: 1px solid var(--border-color, #dee2e6);
      vertical-align: middle;
    }

    .table thead th {
      background: var(--bg-light, #f8f9fa);
      font-weight: 600;
      color: var(--text-primary, #212529);
      text-align: left;
      white-space: nowrap;
    }

    .table-striped tbody tr:nth-of-type(odd) {
      background: rgba(0, 0, 0, 0.02);
    }

    .table-hover tbody tr:hover {
      background: rgba(0, 0, 0, 0.05);
    }

    .message-content {
      max-width: 400px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .date-col {
      white-space: nowrap;
      color: var(--text-secondary, #6c757d);
    }

    /* Pagination Footer */
    .datatable-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 0;
      margin-top: 16px;
      border-top: 1px solid var(--border-color, #dee2e6);
      font-size: 13px;
    }

    .info {
      color: var(--text-secondary, #6c757d);
    }

    @media (max-width: 768px) {
      .message-list-container { padding: 16px; }

      .content-layout {
        flex-direction: column;
      }

      .vertical-tabs {
        flex-direction: row;
        border-right: none;
        border-bottom: 1px solid var(--border-color, #dee2e6);
        min-width: 100%;
        padding: 0;
      }

      .tab-btn {
        flex: 1;
        justify-content: center;
        border-right: none;

        &.active {
          border-right: none;
          border-bottom: 2px solid var(--primary-color, #0d6efd);
        }
      }

      .table-responsive {
        overflow-x: auto;
      }

      .table {
        min-width: 500px;
      }
    }
  `]
})
export class TicketListComponent implements OnInit, OnDestroy {
  private ticketService = inject(TicketService);
  private toast = inject(ToastService);
  private destroy$ = new Subject<void>();

  // Data
  messages = signal<MessageItem[]>([]);
  isLoading = signal(false);

  // Tab state
  activeTab = signal<'incoming' | 'outgoing'>('incoming');

  // Pagination
  currentPage = signal(1);
  pageSize = signal(25);
  totalRecords = signal(0);

  // Search
  searchTerm = '';

  // Computed
  startRecord = computed(() => {
    if (this.totalRecords() === 0) return 0;
    return (this.currentPage() - 1) * this.pageSize() + 1;
  });

  endRecord = computed(() => {
    const end = this.currentPage() * this.pageSize();
    return Math.min(end, this.totalRecords());
  });

  private searchTimeout: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.loadMessages();
  }

  ngOnDestroy(): void {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  setActiveTab(tab: 'incoming' | 'outgoing'): void {
    this.activeTab.set(tab);
    this.currentPage.set(1);
    this.loadMessages();
  }

  loadMessages(): void {
    this.isLoading.set(true);

    // Use the ticket service to get messages
    // Note: This should ideally use a MessageService, but we're adapting existing service
    this.ticketService.getMessages({
      page: this.currentPage(),
      pageSize: this.pageSize(),
      direction: this.activeTab(),
      search: this.searchTerm || undefined
    }).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        this.messages.set(response.data);
        this.totalRecords.set(response.meta.totalItems);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading messages:', err);
        this.toast.error('Error al cargar mensajes');
        this.isLoading.set(false);
        // Set empty state on error
        this.messages.set([]);
        this.totalRecords.set(0);
      }
    });
  }

  onSearch(): void {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
    this.searchTimeout = setTimeout(() => {
      this.currentPage.set(1);
      this.loadMessages();
    }, 300);
  }

  onPageChange(page: number): void {
    this.currentPage.set(page);
    this.loadMessages();
  }

  truncateMessage(content: string): string {
    if (!content) return '-';
    const maxLength = 100;
    return content.length > maxLength ? content.substring(0, maxLength) + '...' : content;
  }

  formatDate(dateStr: string | undefined): string {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('es-PE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
