/**
 * Agent Clients Component
 * Two-column layout: DataTable with clients (left) + Chat panel (right)
 * PARIDAD RAILS: app/views/admin/users/agent_clients.html.erb
 *               app/views/admin/users/_clients_chat_view.html.erb
 */
import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { UserService, PaginationParams, AgentClientsParams } from '../../core/services/user.service';
import { WebSocketService } from '../../core/services/websocket.service';
import { ChatService } from '../chat/services/chat.service';
import { TicketService } from '../chat/services/ticket.service';
import { ChatPanelComponent } from '../chat/components/chat-panel/chat-panel.component';
import { UserListItem } from '../../core/models/user.model';
import { ConversationDetail } from '../../core/models/conversation.model';
import { environment } from '../../../environments/environment';

// Interface for client details response (PARIDAD: Rails client_details_from_stimulus_modal)
interface ClientDetailsResponse {
  user: {
    id: number;
    name: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    codigo: string;
    avatarUrl: string;
  };
  managerHistory: {
    id: number;
    managerName: string;
    createdAt: string;
  }[];
}

// Filter types matching Rails
type TicketFilter = 'all' | 'open' | 'closed';
type MessageFilter = 'all' | 'to_respond' | 'responded';

@Component({
  selector: 'app-agent-clients',
  standalone: true,
  imports: [CommonModule, FormsModule, ChatPanelComponent],
  template: `
    <!-- PARIDAD RAILS: agent_clients.html.erb + _clients_chat_view.html.erb -->
    <div class="agent-clients-layout">
      <!-- Left Panel: Client List (col-lg-5) -->
      <div class="clients-sidebar">
        <!-- Page Header -->
        <div class="page-header">
          <div class="header-row">
            <h1>{{ pageTitle() }}</h1>
            <button
              class="btn btn-primary export-btn"
              (click)="onExport()"
              [disabled]="isExporting()"
            >
              @if (isExporting()) {
                <span class="spinner-sm"></span>
              }
              Exportar CSV
            </button>
          </div>
        </div>

        <!-- Filters (PARIDAD: Rails filter dropdowns) -->
        @if (activeOnly()) {
          <div class="filters-container">
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
        }

        <!-- DataTable Container -->
        <div class="table-container">
          <!-- Search -->
          <div class="datatable-header">
            <div class="page-size-wrapper">
              <label>Mostrar</label>
              <select class="page-size-select" [(ngModel)]="pageSize" (ngModelChange)="onPageSizeChange()">
                <option [ngValue]="10">10</option>
                <option [ngValue]="25">25</option>
                <option [ngValue]="50">50</option>
                <option [ngValue]="100">100</option>
              </select>
              <label>entradas</label>
            </div>
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
                  <th class="col-movil">Movil</th>
                  <th class="col-codigo">Codigo</th>
                  <th class="col-action"></th>
                </tr>
              </thead>
              <tbody>
                @if (isLoading() && clients().length === 0) {
                  <tr>
                    <td colspan="4" class="text-center loading-cell">
                      <div class="spinner"></div>
                      Cargando...
                    </td>
                  </tr>
                } @else if (clients().length === 0) {
                  <tr>
                    <td colspan="4" class="text-center empty-cell">
                      No hay datos disponibles
                    </td>
                  </tr>
                } @else {
                  @for (client of clients(); track client.id) {
                    <tr
                      class="client-row"
                      [class.selected]="selectedClientId() === client.id"
                      [class.unread]="client.requireResponse"
                      (click)="selectClient(client)"
                    >
                      <td class="col-nombre">
                        <div class="nombre-cell">
                          <span class="nombre-text">{{ client.fullName || 'Sin nombre' }}</span>
                          @if (client.requireResponse) {
                            <span class="unread-badge" title="Por responder">!</span>
                          }
                          @if (client.hasOpenTicket) {
                            <span class="ticket-badge" title="Ticket abierto">
                              <i class="ph ph-ticket"></i>
                            </span>
                          }
                        </div>
                      </td>
                      <td class="col-movil">{{ client.phone || '-' }}</td>
                      <td class="col-codigo">{{ client.codigo || '-' }}</td>
                      <td class="col-action">
                        <button
                          class="detail-btn"
                          (click)="openClientDetail($event, client)"
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

      <!-- Right Panel: Chat Area (col-lg-6) -->
      <div class="chat-main">
        @if (selectedClientId()) {
          <app-chat-panel
            [clientId]="selectedClientId()!"
            [conversationDetail]="conversationDetail()"
            [isLoading]="isLoadingConversation()"
            (closeTicket)="onCloseTicket($event)"
            (messageSent)="onMessageSent()"
          />
        } @else {
          <div class="chat-placeholder">
            <div class="placeholder-content">
              <i class="ph ph-chat-text"></i>
              <p>Seleccione un cliente para ver mensajes</p>
            </div>
          </div>
        }
      </div>
    </div>

    <!-- Client Detail Modal (PARIDAD RAILS: _client_details_modal.html.erb) -->
    @if (showClientDetailModal()) {
      <div class="modal-backdrop" (click)="closeClientDetailModal()"></div>
      <div class="modal-container modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5>Detalles del Cliente</h5>
            <button class="close-btn" (click)="closeClientDetailModal()">
              <i class="ph ph-x"></i>
            </button>
          </div>
          <div class="modal-body">
            @if (isLoadingDetails()) {
              <div class="loading-container">
                <span class="spinner"></span>
                <span>Cargando...</span>
              </div>
            } @else if (clientDetails()) {
              <div class="details-row">
                <!-- Left Column: Profile (col-md-5) -->
                <div class="profile-panel">
                  <div class="panel">
                    <div class="panel-heading">
                      <h3 class="panel-title">Perfil de {{ clientDetails()!.user.name || 'Cliente' }}</h3>
                    </div>
                    <div class="panel-body">
                      <div class="avatar-container">
                        @if (clientDetails()!.user.avatarUrl) {
                          <img [src]="clientDetails()!.user.avatarUrl" alt="Avatar" class="avatar-img" />
                        } @else {
                          <div class="avatar-placeholder">
                            <i class="ph ph-user"></i>
                          </div>
                        }
                      </div>
                      <p><strong>Nombre:</strong> {{ clientDetails()!.user.name }}</p>
                      <p><strong>Email:</strong> {{ clientDetails()!.user.email || '-' }}</p>
                      <p><strong>Telefono:</strong> {{ clientDetails()!.user.phone || '-' }}</p>
                    </div>
                  </div>
                </div>

                <!-- Right Column: Assignment History (col-md-7) -->
                <div class="history-panel">
                  <div class="panel">
                    <div class="panel-heading">
                      <h3 class="panel-title">Historial de Asignaciones</h3>
                    </div>
                    <div class="panel-body">
                      <div class="table-responsive">
                        <table class="table table-striped table-bordered table-hover">
                          <thead>
                            <tr>
                              <th>Responsable</th>
                              <th>Fecha</th>
                            </tr>
                          </thead>
                          <tbody>
                            @if (clientDetails()!.managerHistory.length === 0) {
                              <tr>
                                <td colspan="2" class="text-center text-muted">Sin historial de asignaciones</td>
                              </tr>
                            } @else {
                              @for (history of clientDetails()!.managerHistory; track history.id) {
                                <tr>
                                  <td>{{ history.managerName }}</td>
                                  <td>{{ formatDate(history.createdAt) }}</td>
                                </tr>
                              }
                            }
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            }
          </div>
        </div>
      </div>
    }
  `,
  styleUrl: './agent-clients.component.scss'
})
export class AgentClientsComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);
  private userService = inject(UserService);
  private wsService = inject(WebSocketService);
  private chatService = inject(ChatService);
  private ticketService = inject(TicketService);
  private destroy$ = new Subject<void>();
  private searchSubject = new Subject<string>();

  // State
  clients = signal<UserListItem[]>([]);
  isLoading = signal(false);
  isExporting = signal(false);
  hasMore = signal(true);
  selectedClientId = signal<number | null>(null);
  conversationDetail = signal<ConversationDetail | null>(null);
  isLoadingConversation = signal(false);

  // Query params
  activeOnly = signal(false);

  // Filters
  ticketFilter: TicketFilter = 'all';
  messageFilter: MessageFilter = 'all';
  searchTerm = '';

  // Pagination
  currentPage = 0;
  pageSize = 25;
  totalRecords = 0;

  // Client Detail Modal (PARIDAD: Rails _client_details_modal.html.erb)
  showClientDetailModal = signal(false);
  selectedDetailClient = signal<UserListItem | null>(null);
  clientDetails = signal<ClientDetailsResponse | null>(null);
  isLoadingDetails = signal(false);
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl;

  // Computed
  pageTitle = computed(() => {
    return this.activeOnly() ? 'Conversaciones Activas' : 'Clientes';
  });

  ngOnInit(): void {
    // Connect WebSocket
    this.wsService.connect();

    // Handle query params for active_only
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.activeOnly.set(params['active_only'] === 'true');
      this.resetAndLoad();
    });

    // Handle route params for clientId
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const clientId = params['clientId'];
      if (clientId) {
        this.selectClientById(parseInt(clientId, 10));
      }
    });

    // Setup search debounce
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.resetAndLoad();
    });

    // Listen for new messages via WebSocket
    this.wsService.messages$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.loadClients(true);
    });

    // Initial load
    this.loadClients();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSearchChange(term: string): void {
    this.searchSubject.next(term);
  }

  onPageSizeChange(): void {
    this.resetAndLoad();
  }

  onFilterChange(): void {
    this.resetAndLoad();
  }

  selectClient(client: UserListItem): void {
    this.selectedClientId.set(client.id);
    this.loadConversationDetail(client.id);
    // Update URL
    this.router.navigate(['/app/agent_clients', client.id], {
      queryParams: this.activeOnly() ? { active_only: 'true' } : {},
      queryParamsHandling: 'merge'
    });
  }

  private selectClientById(clientId: number): void {
    this.selectedClientId.set(clientId);
    this.loadConversationDetail(clientId);
  }

  onCloseTicket(event: { ticketId: number; closeType?: string; notes?: string }): void {
    this.ticketService.closeTicketById(event.ticketId, event.closeType, event.notes)
      .subscribe({
        next: () => {
          const clientId = this.selectedClientId();
          if (clientId) {
            this.loadConversationDetail(clientId);
          }
        },
        error: (err) => console.error('Error closing ticket:', err)
      });
  }

  onMessageSent(): void {
    // Refresh the client list to update require_response status
    this.loadClients(true);
  }

  /**
   * Export clients to CSV
   * PARIDAD: Rails "Exportar CSV" button
   */
  onExport(): void {
    this.isExporting.set(true);

    const params: PaginationParams & AgentClientsParams = {
      page: 0,
      pageSize: 10000,
      search: this.searchTerm || undefined,
      activeOnly: this.activeOnly(),
      ticketStatus: this.ticketFilter as any,
      messageStatus: this.messageFilter as any,
    };

    this.userService.getAgentClients(params).subscribe({
      next: (response) => {
        const csv = this.generateCsv(response.data);
        this.downloadCsv(csv, `clientes_${new Date().toISOString().split('T')[0]}.csv`);
        this.isExporting.set(false);
      },
      error: () => this.isExporting.set(false)
    });
  }

  private generateCsv(clients: UserListItem[]): string {
    const header = 'Código,Nombre,Teléfono';
    const rows = clients.map(c => {
      const codigo = (c.codigo || '').replace(/"/g, '""');
      const nombre = (c.fullName || `${c.firstName} ${c.lastName}`).replace(/"/g, '""');
      const phone = (c.phone || '').replace(/"/g, '""');
      return `"${codigo}","${nombre}","${phone}"`;
    });
    return [header, ...rows].join('\n');
  }

  private downloadCsv(csv: string, filename: string): void {
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Pagination methods
  goToPage(page: number): void {
    if (page < 0 || page >= this.getTotalPages()) return;
    this.currentPage = page;
    this.loadClients();
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

  // Modal methods
  openClientDetail(event: Event, client: UserListItem): void {
    event.stopPropagation();
    this.selectedDetailClient.set(client);
    this.showClientDetailModal.set(true);
    this.loadClientDetails(client.id);
  }

  closeClientDetailModal(): void {
    this.showClientDetailModal.set(false);
    this.selectedDetailClient.set(null);
    this.clientDetails.set(null);
  }

  private loadClientDetails(userId: number): void {
    this.isLoadingDetails.set(true);
    this.http.get<ClientDetailsResponse>(`${this.baseUrl}/app/users/client_details`, {
      params: { user_id: userId.toString() }
    }).subscribe({
      next: (response) => {
        this.clientDetails.set(response);
        this.isLoadingDetails.set(false);
      },
      error: (err) => {
        console.error('Error loading client details:', err);
        this.isLoadingDetails.set(false);
      }
    });
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private resetAndLoad(): void {
    this.currentPage = 0;
    this.clients.set([]);
    this.hasMore.set(true);
    this.loadClients();
  }

  private loadClients(refresh = false): void {
    if (refresh) {
      this.currentPage = 0;
    }

    this.isLoading.set(true);

    const params: PaginationParams = {
      page: this.currentPage,
      pageSize: this.pageSize,
      search: this.searchTerm || undefined,
    };

    // Add filters
    if (this.activeOnly()) {
      (params as any).activeOnly = true;
    }
    if (this.ticketFilter !== 'all') {
      (params as any).ticketStatus = this.ticketFilter;
    }
    if (this.messageFilter !== 'all') {
      (params as any).messageStatus = this.messageFilter;
    }

    this.userService.getAgentClients(params).subscribe({
      next: (response) => {
        this.totalRecords = response.meta.totalItems;
        this.clients.set(response.data);

        const loaded = (this.currentPage + 1) * this.pageSize;
        this.hasMore.set(loaded < response.meta.totalItems);

        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading clients:', err);
        this.isLoading.set(false);
      }
    });
  }

  private loadConversationDetail(clientId: number): void {
    this.isLoadingConversation.set(true);
    this.chatService.getConversationDetail(clientId, 'clients').subscribe({
      next: (detail) => {
        this.conversationDetail.set(detail);
        this.isLoadingConversation.set(false);
      },
      error: (err) => {
        console.error('Error loading conversation:', err);
        this.isLoadingConversation.set(false);
      }
    });
  }
}
