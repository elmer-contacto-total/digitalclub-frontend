/**
 * Conversation List Component
 * Displays list of conversations in a DataTable format
 * PARIDAD RAILS: app/views/admin/users/agent_clients.html.erb
 *               app/views/admin/users/_clients_chat_view.html.erb
 */
import { Component, inject, signal, input, output, OnInit, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { ChatService } from '../../services/chat.service';
import { AuthService } from '../../../../core/services/auth.service';
import { WebSocketService } from '../../../../core/services/websocket.service';
import {
  ConversationListItem,
  ConversationListRequest,
  ChatViewType
} from '../../../../core/models/conversation.model';

// Tipos para filtros Rails
type TicketFilter = 'all' | 'open' | 'closed';
type MessageFilter = 'all' | 'to_respond' | 'responded';

@Component({
  selector: 'app-conversation-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="conversation-list">
      <!-- Page Header (PARIDAD: agent_clients.html.erb) -->
      <div class="page-header">
        <div class="header-row">
          <h1>Clientes</h1>
          <button
            class="btn btn-primary export-btn"
            (click)="onExport()"
            [disabled]="isExporting()"
          >
            @if (isExporting()) {
              <span class="spinner-border spinner-border-sm"></span>
            }
            Exportar CSV
          </button>
        </div>
      </div>

      <!-- View Type Tabs (Clientes / Prospectos) -->
      <div class="view-tabs">
        <button
          class="tab-btn"
          [class.active]="viewType() === 'clients'"
          (click)="onViewTypeChange('clients')"
        >
          Clientes
        </button>
        <button
          class="tab-btn"
          [class.active]="viewType() === 'prospects'"
          (click)="onViewTypeChange('prospects')"
        >
          Prospectos
        </button>
      </div>

      <!-- Filters (PARIDAD: agent_clients.html.erb) -->
      <div class="filters-container">
        <!-- Filtro tickets -->
        <div class="filter-row">
          <label class="filter-label">Filtro tickets:</label>
          <select
            class="form-control filter-select"
            [(ngModel)]="ticketFilter"
            (ngModelChange)="onFilterChange()"
          >
            <option value="all">Todos</option>
            <option value="open">Casos abiertos</option>
            <option value="closed">Casos cerrados</option>
          </select>
        </div>

        <!-- Filtro respuestas -->
        <div class="filter-row">
          <label class="filter-label">Filtro respuestas:</label>
          <select
            class="form-control filter-select"
            [(ngModel)]="messageFilter"
            (ngModelChange)="onFilterChange()"
          >
            <option value="all">Todos</option>
            <option value="to_respond">Por Responder</option>
            <option value="responded">Ya Respondidos</option>
          </select>
        </div>
      </div>

      <!-- DataTable Container (PARIDAD: _clients_chat_view.html.erb) -->
      <div class="table-container">
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
                <th class="col-nombre">Nombre</th>
                <th class="col-movil">Móvil</th>
                <th class="col-codigo">Código</th>
                <th class="col-action"></th>
              </tr>
            </thead>
            <tbody>
              @if (isLoading() && conversations().length === 0) {
                <tr>
                  <td colspan="4" class="text-center loading-cell">
                    <div class="spinner"></div>
                    Cargando...
                  </td>
                </tr>
              } @else if (conversations().length === 0) {
                <tr>
                  <td colspan="4" class="text-center empty-cell">
                    No hay datos disponibles
                  </td>
                </tr>
              } @else {
                @for (conversation of conversations(); track conversation.id) {
                  <tr
                    class="conversation-row"
                    [class.selected]="selectedClientId() === conversation.id"
                    [class.unread]="conversation.unreadCount > 0"
                    (click)="selectConversation(conversation)"
                  >
                    <td class="col-nombre">
                      <div class="nombre-cell">
                        <span class="nombre-text">{{ conversation.name || 'Sin nombre' }}</span>
                        @if (conversation.unreadCount > 0) {
                          <span class="unread-badge">{{ conversation.unreadCount }}</span>
                        }
                        @if (conversation.hasOpenTicket) {
                          <span class="ticket-badge" title="Ticket abierto">
                            <i class="ph ph-ticket"></i>
                          </span>
                        }
                      </div>
                    </td>
                    <td class="col-movil">{{ conversation.phone || '-' }}</td>
                    <td class="col-codigo">{{ conversation.codigo || '-' }}</td>
                    <td class="col-action">
                      <button
                        class="detail-btn"
                        (click)="openClientDetail($event, conversation)"
                        title="Ver detalles"
                      >
                        <i class="ph ph-caret-right"></i>
                      </button>
                    </td>
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
            <span class="page-info">Página {{ currentPage + 1 }} de {{ getTotalPages() }}</span>
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
              Última
            </button>
          </div>
        </div>
      </div>

      <!-- Client Detail Modal -->
      @if (showClientDetailModal()) {
        <div class="modal-backdrop" (click)="closeClientDetailModal()"></div>
        <div class="modal-container">
          <div class="modal-content">
            <div class="modal-header">
              <h5>Detalles del Cliente</h5>
              <button class="close-btn" (click)="closeClientDetailModal()">
                <i class="ph ph-x"></i>
              </button>
            </div>
            <div class="modal-body">
              @if (selectedDetailClient()) {
                <div class="detail-row">
                  <span class="label">Nombre:</span>
                  <span class="value">{{ selectedDetailClient()!.name }}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Móvil:</span>
                  <span class="value">{{ selectedDetailClient()!.phone || '-' }}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Código:</span>
                  <span class="value">{{ selectedDetailClient()!.codigo || '-' }}</span>
                </div>
                @if (selectedDetailClient()!.email) {
                  <div class="detail-row">
                    <span class="label">Email:</span>
                    <span class="value">{{ selectedDetailClient()!.email }}</span>
                  </div>
                }
              }
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .conversation-list {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: white;
    }

    /* Page Header (PARIDAD: Rails page-header) */
    .page-header {
      padding: 16px;
      border-bottom: 1px solid var(--border-color, #dee2e6);
    }

    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }

    h1 {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 500;
      color: var(--text-primary, #212529);
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border: 1px solid transparent;
      border-radius: 4px;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.15s;

      &:disabled {
        opacity: 0.65;
        cursor: not-allowed;
      }
    }

    .btn-primary {
      background-color: var(--primary-color, #0d6efd);
      border-color: var(--primary-color, #0d6efd);
      color: white;

      &:hover:not(:disabled) {
        background-color: var(--primary-dark, #0b5ed7);
        border-color: var(--primary-dark, #0b5ed7);
      }
    }

    .btn-sm {
      padding: 4px 8px;
      font-size: 12px;
    }

    .spinner-border-sm {
      width: 14px;
      height: 14px;
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      animation: spin 0.75s linear infinite;
    }

    /* View Tabs */
    .view-tabs {
      display: flex;
      padding: 8px 16px;
      gap: 8px;
      border-bottom: 1px solid var(--border-color, #dee2e6);
    }

    .tab-btn {
      flex: 1;
      padding: 8px 16px;
      border: 1px solid var(--border-color, #dee2e6);
      background: white;
      border-radius: 4px;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.15s;

      &:hover {
        background: var(--bg-hover, #f8f9fa);
      }

      &.active {
        background: var(--primary-color, #0d6efd);
        color: white;
        border-color: var(--primary-color, #0d6efd);
      }
    }

    /* Filters (PARIDAD: Rails filter dropdowns) */
    .filters-container {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      padding: 12px 16px;
      background: var(--bg-light, #f8f9fa);
      border-bottom: 1px solid var(--border-color, #dee2e6);
    }

    .filter-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .filter-label {
      font-size: 14px;
      color: var(--text-secondary, #6c757d);
      white-space: nowrap;
    }

    .filter-select {
      min-width: 150px;
      padding: 6px 12px;
      border: 1px solid var(--border-color, #ced4da);
      border-radius: 4px;
      font-size: 14px;
      background: white;

      &:focus {
        outline: none;
        border-color: var(--primary-color, #86b7fe);
        box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.25);
      }
    }

    /* DataTable Container */
    .table-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .datatable-header {
      display: flex;
      justify-content: flex-end;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color, #dee2e6);
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

    /* Table (PARIDAD: Rails DataTable) */
    .table-responsive {
      flex: 1;
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
      padding: 10px 12px;
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

    /* Column widths */
    .col-nombre {
      width: 40%;
    }

    .col-movil {
      width: 25%;
    }

    .col-codigo {
      width: 25%;
    }

    .col-action {
      width: 10%;
      text-align: center;
    }

    /* Row states */
    .conversation-row {
      cursor: pointer;
      transition: background 0.15s;

      &.selected {
        background: var(--primary-light, #cfe2ff) !important;
      }

      &.unread {
        font-weight: 600;
      }
    }

    .nombre-cell {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .nombre-text {
      flex: 1;
    }

    .unread-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      height: 20px;
      padding: 0 6px;
      background: var(--primary-color, #0d6efd);
      color: white;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
    }

    .ticket-badge {
      color: var(--info-color, #0dcaf0);
      font-size: 14px;
    }

    .detail-btn {
      background: transparent;
      border: none;
      padding: 4px 8px;
      cursor: pointer;
      color: var(--text-secondary, #6c757d);
      transition: color 0.15s;

      &:hover {
        color: var(--primary-color, #0d6efd);
      }
    }

    .loading-cell,
    .empty-cell {
      padding: 24px !important;
      color: var(--text-secondary, #6c757d);
    }

    /* Pagination Footer (PARIDAD: DataTables pagination) */
    .datatable-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-top: 1px solid var(--border-color, #dee2e6);
      background: white;
      font-size: 13px;
    }

    .info {
      color: var(--text-secondary, #6c757d);
    }

    .pagination-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .page-info {
      padding: 0 12px;
      color: var(--text-secondary, #6c757d);
    }

    /* Modal (PARIDAD: Rails remote_modal) */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 1000;
    }

    .modal-container {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 1001;
      width: 100%;
      max-width: 400px;
    }

    .modal-content {
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      border-bottom: 1px solid var(--border-color, #dee2e6);

      h5 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
      }
    }

    .close-btn {
      background: transparent;
      border: none;
      padding: 4px;
      cursor: pointer;
      font-size: 20px;
      color: var(--text-secondary, #6c757d);

      &:hover {
        color: var(--text-primary, #212529);
      }
    }

    .modal-body {
      padding: 16px;
    }

    .detail-row {
      display: flex;
      margin-bottom: 12px;

      .label {
        width: 80px;
        font-weight: 500;
        color: var(--text-secondary, #6c757d);
      }

      .value {
        flex: 1;
        color: var(--text-primary, #212529);
      }
    }

    /* Spinner */
    .spinner {
      display: inline-block;
      width: 24px;
      height: 24px;
      border: 3px solid var(--border-color, #dee2e6);
      border-top-color: var(--primary-color, #0d6efd);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-right: 8px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `]
})
export class ConversationListComponent implements OnInit, OnDestroy {
  private chatService = inject(ChatService);
  private authService = inject(AuthService);
  private wsService = inject(WebSocketService);
  private destroy$ = new Subject<void>();
  private searchSubject = new Subject<string>();

  // Inputs
  viewType = input<ChatViewType>('clients');
  selectedClientId = input<number | null>(null);

  // Outputs
  clientSelected = output<ConversationListItem>();
  viewTypeChanged = output<ChatViewType>();

  // State
  conversations = signal<ConversationListItem[]>([]);
  isLoading = signal(false);
  isExporting = signal(false);
  hasMore = signal(true);
  searchTerm = '';

  // Filters (PARIDAD: Rails dropdowns)
  ticketFilter: TicketFilter = 'all';
  messageFilter: MessageFilter = 'all';

  // Pagination
  currentPage = 0;
  private pageSize = 25;
  totalRecords = 0;

  // Client Detail Modal
  showClientDetailModal = signal(false);
  selectedDetailClient = signal<ConversationListItem | null>(null);

  constructor() {
    // Re-load when view type changes
    effect(() => {
      const vt = this.viewType();
      this.resetAndLoad();
    }, { allowSignalWrites: true });
  }

  ngOnInit(): void {
    // Setup search debounce
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.resetAndLoad();
    });

    // Listen for new messages to update list
    this.wsService.messages$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.loadConversations(true);
    });

    // Initial load
    this.loadConversations();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSearchChange(term: string): void {
    this.searchSubject.next(term);
  }

  onFilterChange(): void {
    this.resetAndLoad();
  }

  onViewTypeChange(viewType: ChatViewType): void {
    this.viewTypeChanged.emit(viewType);
  }

  /**
   * Export conversations to CSV
   * PARIDAD: Rails "Exportar CSV" button
   */
  onExport(): void {
    this.isExporting.set(true);

    const params = new URLSearchParams();
    params.set('chat_view_type', this.viewType());
    if (this.searchTerm) {
      params.set('search', this.searchTerm);
    }
    if (this.ticketFilter !== 'all') {
      params.set('ticket_status', this.ticketFilter);
    }
    if (this.messageFilter !== 'all') {
      params.set('message_status', this.messageFilter);
    }
    params.set('format', 'csv');

    const exportUrl = `/api/app/users/export_client_messages?${params.toString()}`;

    const link = document.createElement('a');
    link.href = exportUrl;
    link.download = `clientes_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => this.isExporting.set(false), 1000);
  }

  selectConversation(conversation: ConversationListItem): void {
    this.clientSelected.emit(conversation);
  }

  /**
   * Open client detail modal
   * PARIDAD: Rails chevron click opens remote_modal
   */
  openClientDetail(event: Event, conversation: ConversationListItem): void {
    event.stopPropagation();
    this.selectedDetailClient.set(conversation);
    this.showClientDetailModal.set(true);
  }

  closeClientDetailModal(): void {
    this.showClientDetailModal.set(false);
    this.selectedDetailClient.set(null);
  }

  // Pagination methods
  goToPage(page: number): void {
    if (page < 0 || page >= this.getTotalPages()) return;
    this.currentPage = page;
    this.loadConversations();
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

  private resetAndLoad(): void {
    this.currentPage = 0;
    this.conversations.set([]);
    this.hasMore.set(true);
    this.loadConversations();
  }

  private loadConversations(refresh = false): void {
    if (refresh) {
      this.currentPage = 0;
    }

    this.isLoading.set(true);

    const request: ConversationListRequest = {
      draw: this.currentPage + 1,
      start: this.currentPage * this.pageSize,
      length: this.pageSize,
      search: this.searchTerm || undefined,
      filters: {
        viewType: this.viewType(),
        ticketStatus: this.ticketFilter !== 'all' ? this.ticketFilter : undefined,
        messageStatus: this.messageFilter !== 'all' ? this.messageFilter : undefined
      }
    };

    this.chatService.getConversationList(request).subscribe({
      next: (response) => {
        this.totalRecords = response.recordsTotal;
        this.conversations.set(response.data);

        const loaded = (this.currentPage + 1) * this.pageSize;
        this.hasMore.set(loaded < response.recordsFiltered);

        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading conversations:', err);
        this.isLoading.set(false);
      }
    });
  }
}
