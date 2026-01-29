/**
 * Messages List Component
 * Two tabs: Incoming messages / Outgoing messages
 * PARIDAD RAILS: app/views/admin/messages/index.html.erb
 */
import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { environment } from '../../../environments/environment';

// Message item for list display
interface MessageListItem {
  id: number;
  senderName: string;
  recipientName: string;
  content: string;
  sentAt: string;
  direction: 'incoming' | 'outgoing';
}

// DataTables response format
interface DataTablesResponse {
  draw: number;
  recordsTotal: number;
  recordsFiltered: number;
  data: any[];
}

type MessageDirection = 'incoming' | 'outgoing';

@Component({
  selector: 'app-messages-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="messages-list-container">
      <!-- Page Header -->
      <div class="page-header">
        <h1>Lista de Mensajes</h1>
      </div>

      <!-- Tab Navigation (PARIDAD: Rails nav-tabs) -->
      <ul class="nav-tabs">
        <li class="nav-item">
          <button
            class="nav-link"
            [class.active]="activeTab() === 'incoming'"
            (click)="switchTab('incoming')"
          >
            Mensajes Entrantes
          </button>
        </li>
        <li class="nav-item">
          <button
            class="nav-link"
            [class.active]="activeTab() === 'outgoing'"
            (click)="switchTab('outgoing')"
          >
            Mensajes Salientes
          </button>
        </li>
      </ul>

      <!-- Tab Content -->
      <div class="tab-content">
        <!-- Search -->
        <div class="datatable-header">
          <div class="search-wrapper">
            <label>Buscar:</label>
            <input
              type="text"
              class="form-control search-input"
              [(ngModel)]="searchTerm"
              (ngModelChange)="onSearchChange($event)"
              placeholder=""
            />
          </div>
        </div>

        <!-- DataTable -->
        <div class="table-responsive">
          <table class="table table-striped table-bordered table-hover">
            <thead>
              <tr>
                <th class="col-person">
                  {{ activeTab() === 'incoming' ? 'Enviado por' : 'Recibido por' }}
                </th>
                <th class="col-message">Mensaje</th>
                <th class="col-date">Fecha</th>
              </tr>
            </thead>
            <tbody>
              @if (isLoading() && messages().length === 0) {
                <tr>
                  <td colspan="3" class="text-center loading-cell">
                    <div class="spinner"></div>
                    Cargando...
                  </td>
                </tr>
              } @else if (messages().length === 0) {
                <tr>
                  <td colspan="3" class="text-center empty-cell">
                    No hay datos disponibles
                  </td>
                </tr>
              } @else {
                @for (message of messages(); track message.id) {
                  <tr class="message-row">
                    <td class="col-person">
                      {{ activeTab() === 'incoming' ? message.senderName : message.recipientName }}
                    </td>
                    <td class="col-message">
                      <div class="message-content">{{ truncateMessage(message.content) }}</div>
                    </td>
                    <td class="col-date">{{ formatDate(message.sentAt) }}</td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>

        <!-- Pagination Footer -->
        <div class="datatable-footer">
          <div class="info">
            Mostrando {{ getShowingStart() }} a {{ getShowingEnd() }} de {{ totalRecords }} registros
          </div>
          <div class="pagination-controls">
            <button
              class="btn btn-sm"
              [disabled]="currentPage === 0 || isLoading()"
              (click)="goToPage(0)"
            >
              Primera
            </button>
            <button
              class="btn btn-sm"
              [disabled]="currentPage === 0 || isLoading()"
              (click)="goToPage(currentPage - 1)"
            >
              Anterior
            </button>
            <span class="page-info">Pagina {{ currentPage + 1 }} de {{ getTotalPages() }}</span>
            <button
              class="btn btn-sm"
              [disabled]="!hasMore() || isLoading()"
              (click)="goToPage(currentPage + 1)"
            >
              Siguiente
            </button>
            <button
              class="btn btn-sm"
              [disabled]="!hasMore() || isLoading()"
              (click)="goToPage(getTotalPages() - 1)"
            >
              Ultima
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styleUrl: './messages-list.component.scss'
})
export class MessagesListComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private destroy$ = new Subject<void>();
  private searchSubject = new Subject<string>();

  // State
  activeTab = signal<MessageDirection>('incoming');
  messages = signal<MessageListItem[]>([]);
  isLoading = signal(false);
  hasMore = signal(true);
  searchTerm = '';

  // Pagination
  currentPage = 0;
  private pageSize = 25;
  totalRecords = 0;

  ngOnInit(): void {
    // Setup search debounce
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.resetAndLoad();
    });

    // Initial load
    this.loadMessages();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  switchTab(direction: MessageDirection): void {
    if (this.activeTab() !== direction) {
      this.activeTab.set(direction);
      this.resetAndLoad();
    }
  }

  onSearchChange(term: string): void {
    this.searchSubject.next(term);
  }

  // Pagination methods
  goToPage(page: number): void {
    if (page < 0 || page >= this.getTotalPages()) return;
    this.currentPage = page;
    this.loadMessages();
  }

  getTotalPages(): number {
    return Math.ceil(this.totalRecords / this.pageSize) || 1;
  }

  getShowingStart(): number {
    if (this.totalRecords === 0) return 0;
    return this.currentPage * this.pageSize + 1;
  }

  getShowingEnd(): number {
    const end = (this.currentPage + 1) * this.pageSize;
    return Math.min(end, this.totalRecords);
  }

  truncateMessage(content: string): string {
    if (!content) return '-';
    return content.length > 100 ? content.substring(0, 100) + '...' : content;
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private resetAndLoad(): void {
    this.currentPage = 0;
    this.messages.set([]);
    this.hasMore.set(true);
    this.loadMessages();
  }

  private loadMessages(): void {
    this.isLoading.set(true);

    let params = new HttpParams()
      .set('direction', this.activeTab())
      .set('draw', (this.currentPage + 1).toString())
      .set('start', (this.currentPage * this.pageSize).toString())
      .set('length', this.pageSize.toString());

    if (this.searchTerm) {
      params = params.set('search[value]', this.searchTerm);
    }

    this.http.get<DataTablesResponse>(`${environment.apiUrl}/app/messages`, { params })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.totalRecords = response.recordsTotal;
          this.messages.set(this.mapMessages(response.data));

          const loaded = (this.currentPage + 1) * this.pageSize;
          this.hasMore.set(loaded < response.recordsFiltered);

          this.isLoading.set(false);
        },
        error: (err) => {
          console.error('Error loading messages:', err);
          this.isLoading.set(false);
        }
      });
  }

  private mapMessages(data: any[]): MessageListItem[] {
    return data.map(item => {
      // Handle both array format [name, content, date] and object format
      if (Array.isArray(item)) {
        return {
          id: item[0] || Math.random(),
          senderName: item[0] || '-',
          recipientName: item[0] || '-',
          content: item[1] || '',
          sentAt: item[2] || '',
          direction: this.activeTab()
        };
      }
      return {
        id: item.id,
        senderName: item.sender_name || item.senderName || `${item.sender?.first_name || ''} ${item.sender?.last_name || ''}`.trim() || '-',
        recipientName: item.recipient_name || item.recipientName || `${item.recipient?.first_name || ''} ${item.recipient?.last_name || ''}`.trim() || '-',
        content: item.content || '',
        sentAt: item.sent_at || item.sentAt || '',
        direction: this.activeTab()
      };
    });
  }
}
