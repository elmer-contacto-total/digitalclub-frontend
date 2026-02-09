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

// Backend response format
interface MessagesApiResponse {
  data: any[];
  meta: {
    totalItems: number;
    totalPages: number;
    currentPage: number;
    pageSize: number;
  };
}

type MessageDirection = 'incoming' | 'outgoing';

@Component({
  selector: 'app-messages-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="messages-list-container">
      <!-- Page Header (PARIDAD RAILS: "Lista de Mensajes") -->
      <div class="page-header">
        <div class="page-header-content">
          <h1 class="page-title">Lista de Mensajes</h1>
          <p class="page-subtitle">Historial de mensajes recibidos y enviados</p>
        </div>
      </div>

      <!-- Toolbar Card -->
      <div class="toolbar-card">
        <!-- Tab Navigation (PARIDAD RAILS: "Recibidos" / "Enviados") -->
        <div class="tabs-container">
          <button
            class="tab-btn"
            [class.active]="activeTab() === 'incoming'"
            (click)="switchTab('incoming')"
          >
            <i class="ph-fill ph-tray-arrow-down"></i>
            <span>Recibidos</span>
            @if (activeTab() === 'incoming' && totalRecords > 0) {
              <span class="tab-badge">{{ totalRecords }}</span>
            }
          </button>
          <button
            class="tab-btn"
            [class.active]="activeTab() === 'outgoing'"
            (click)="switchTab('outgoing')"
          >
            <i class="ph-fill ph-paper-plane-tilt"></i>
            <span>Enviados</span>
            @if (activeTab() === 'outgoing' && totalRecords > 0) {
              <span class="tab-badge">{{ totalRecords }}</span>
            }
          </button>
        </div>

        <!-- Search Box -->
        <div class="search-box">
          <i class="ph ph-magnifying-glass"></i>
          <input
            type="text"
            class="search-input"
            [(ngModel)]="searchTerm"
            (ngModelChange)="onSearchChange($event)"
            placeholder="Buscar mensajes..."
          />
          @if (searchTerm) {
            <button class="clear-search" (click)="clearSearch()">
              <i class="ph ph-x"></i>
            </button>
          }
        </div>
      </div>

      <!-- Table Card -->
      <div class="table-card">
        <!-- Loading State -->
        @if (isLoading() && messages().length === 0) {
          <div class="loading-container">
            <div class="spinner"></div>
            <p>Cargando mensajes...</p>
          </div>
        } @else if (messages().length === 0) {
          <!-- Empty State -->
          <div class="empty-container">
            <i class="ph ph-chats-circle empty-icon"></i>
            <h3>No hay mensajes</h3>
            <p>No se encontraron mensajes {{ activeTab() === 'incoming' ? 'recibidos' : 'enviados' }}{{ searchTerm ? ' con ese criterio de búsqueda' : '' }}</p>
          </div>
        } @else {
          <!-- Table (PARIDAD RAILS: columns "Enviado por"/"Recibido por", "Mensaje", "Fecha") -->
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th class="col-person">
                    {{ activeTab() === 'incoming' ? 'Enviado por' : 'Enviado por' }}
                  </th>
                  <th class="col-message">Mensaje</th>
                  <th class="col-date">Fecha</th>
                </tr>
              </thead>
              <tbody>
                @for (message of messages(); track message.id) {
                  <tr class="message-row" [class.loading]="isLoading()">
                    <td class="col-person">
                      <div class="person-cell">
                        <div class="avatar-sm" [class.incoming]="activeTab() === 'incoming'" [class.outgoing]="activeTab() === 'outgoing'">
                          {{ getInitials(message.senderName) }}
                        </div>
                        <span class="person-name">
                          {{ message.senderName }}
                        </span>
                      </div>
                    </td>
                    <td class="col-message">
                      <div class="message-cell">
                        <span class="message-preview">{{ truncateMessage(message.content) }}</span>
                      </div>
                    </td>
                    <td class="col-date">
                      <div class="date-cell">
                        <span class="date-primary">{{ formatDate(message.sentAt) }}</span>
                        <span class="date-secondary">{{ formatTime(message.sentAt) }}</span>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <!-- Pagination Footer -->
          <div class="table-footer">
            <div class="pagination-info">
              Mostrando <strong>{{ getShowingStart() }}</strong> - <strong>{{ getShowingEnd() }}</strong> de <strong>{{ totalRecords }}</strong> registros
            </div>
            <div class="pagination-controls">
              <button
                class="pagination-btn"
                [disabled]="currentPage === 0 || isLoading()"
                (click)="goToPage(0)"
                title="Primera página"
              >
                <i class="ph ph-caret-double-left"></i>
              </button>
              <button
                class="pagination-btn"
                [disabled]="currentPage === 0 || isLoading()"
                (click)="goToPage(currentPage - 1)"
                title="Página anterior"
              >
                <i class="ph ph-caret-left"></i>
              </button>
              <span class="page-indicator">
                {{ currentPage + 1 }} / {{ getTotalPages() }}
              </span>
              <button
                class="pagination-btn"
                [disabled]="!hasMore() || isLoading()"
                (click)="goToPage(currentPage + 1)"
                title="Página siguiente"
              >
                <i class="ph ph-caret-right"></i>
              </button>
              <button
                class="pagination-btn"
                [disabled]="!hasMore() || isLoading()"
                (click)="goToPage(getTotalPages() - 1)"
                title="Última página"
              >
                <i class="ph ph-caret-double-right"></i>
              </button>
            </div>
          </div>
        }
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

  clearSearch(): void {
    this.searchTerm = '';
    this.resetAndLoad();
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
    if (!content) return '(Sin contenido)';
    return content.length > 80 ? content.substring(0, 80) + '...' : content;
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '-';
    // Backend envía LocalDateTime sin timezone, pero ya es hora Lima (UTC-5)
    if (!dateStr.endsWith('Z') && !dateStr.match(/[+-]\d{2}:\d{2}$/)) {
      dateStr = dateStr.replace(' ', 'T') + '-05:00';
    }
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'America/Lima'
    });
  }

  formatTime(dateStr: string): string {
    if (!dateStr) return '';
    // Backend envía LocalDateTime sin timezone, pero ya es hora Lima (UTC-5)
    if (!dateStr.endsWith('Z') && !dateStr.match(/[+-]\d{2}:\d{2}$/)) {
      dateStr = dateStr.replace(' ', 'T') + '-05:00';
    }
    const date = new Date(dateStr);
    return date.toLocaleTimeString('es-PE', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Lima'
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

    this.http.get<MessagesApiResponse>(`${environment.apiUrl}/app/messages`, { params })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          // Handle backend response format: { data: [...], meta: { totalItems, totalPages, ... } }
          this.totalRecords = response.meta?.totalItems || 0;
          this.messages.set(this.mapMessages(response.data || []));

          const totalPages = response.meta?.totalPages || 1;
          this.hasMore.set(this.currentPage < totalPages - 1);

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

      // Backend sends senderName for incoming, receiverName for outgoing
      const senderName = item.sender_name || item.senderName ||
        `${item.sender?.first_name || ''} ${item.sender?.last_name || ''}`.trim() || '-';

      // Note: Backend uses "receiverName" not "recipientName" for outgoing messages
      const recipientName = item.receiver_name || item.receiverName ||
        item.recipient_name || item.recipientName ||
        `${item.recipient?.first_name || ''} ${item.recipient?.last_name || ''}`.trim() || '-';

      return {
        id: item.id,
        senderName,
        recipientName,
        content: item.content || '',
        sentAt: item.sent_at || item.sentAt || item.createdAt || '',
        direction: this.activeTab()
      };
    });
  }

  /**
   * Get initials from a name (first letter of first name + first letter of last name)
   */
  getInitials(name: string): string {
    if (!name || name === '-') return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }
}
