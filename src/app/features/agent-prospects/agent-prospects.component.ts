/**
 * Agent Prospects Component
 * Two-column layout: DataTable with prospects (left) + Chat panel (right)
 * PARIDAD RAILS: app/views/admin/users/agent_prospects.html.erb
 *               app/views/admin/users/_clients_chat_view.html.erb (chat_view_type: 'prospects')
 */
import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { WebSocketService } from '../../core/services/websocket.service';
import { ChatService } from '../chat/services/chat.service';
import { ChatPanelComponent } from '../chat/components/chat-panel/chat-panel.component';
import { ConversationDetail } from '../../core/models/conversation.model';
import { environment } from '../../../environments/environment';
import { UserRole, RoleUtils } from '../../core/models/user.model';

// Prospect interface matching backend response
interface Prospect {
  id: number;
  name: string;
  phone: string;
  clientId: number;
  status: string;
  upgradedToUser: boolean;
  managerId?: number;
  managerName?: string;
  createdAt: string;
  updatedAt: string;
}

interface ProspectsResponse {
  data: Prospect[];
  meta: {
    totalItems: number;
    page: number;
    pageSize: number;
  };
}

@Component({
  selector: 'app-agent-prospects',
  standalone: true,
  imports: [CommonModule, FormsModule, ChatPanelComponent],
  styleUrl: './agent-prospects.component.scss',
  template: `
    <!-- PARIDAD RAILS: agent_prospects.html.erb + _clients_chat_view.html.erb -->
    <div class="agent-prospects-layout">
      <!-- Left Panel: Prospect List (col-lg-5) -->
      <div class="prospects-sidebar">
        <!-- Page Header -->
        <div class="page-header">
          <div class="header-row">
            <h1>Prospectos</h1>
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

        <!-- Manager Filter (only for manager_level_4) -->
        @if (isManagerLevel4()) {
          <div class="filters-container">
            <div class="filter-row">
              <label class="filter-label">Filtro agentes:</label>
              <select
                class="form-control filter-select"
                [(ngModel)]="managerFilter"
                (ngModelChange)="onFilterChange()"
              >
                <option value="">Todos</option>
                @for (manager of managers(); track manager.id) {
                  <option [value]="manager.id">{{ manager.name }}</option>
                }
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
              <select class="form-control page-size-select" [(ngModel)]="pageSize" (ngModelChange)="onPageSizeChange()">
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
                @if (isLoading() && prospects().length === 0) {
                  <tr>
                    <td colspan="4" class="text-center loading-cell">
                      <div class="spinner"></div>
                      Cargando...
                    </td>
                  </tr>
                } @else if (prospects().length === 0) {
                  <tr>
                    <td colspan="4" class="text-center empty-cell">
                      No hay datos disponibles
                    </td>
                  </tr>
                } @else {
                  @for (prospect of prospects(); track prospect.id) {
                    <tr
                      class="prospect-row"
                      [class.selected]="selectedProspectId() === prospect.id"
                      (click)="selectProspect(prospect)"
                    >
                      <td class="col-nombre">{{ prospect.name || 'Sin nombre' }}</td>
                      <td class="col-movil">{{ prospect.phone || '-' }}</td>
                      <td class="col-codigo">-</td>
                      <td class="col-action">
                        <button
                          class="detail-btn"
                          (click)="openProspectDetail($event, prospect)"
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
        @if (selectedProspectId()) {
          <app-chat-panel
            [clientId]="selectedProspectId()!"
            [conversationDetail]="conversationDetail()"
            [isLoading]="isLoadingConversation()"
            (messageSent)="onMessageSent()"
          />
        } @else {
          <div class="chat-placeholder">
            <div class="placeholder-content">
              <i class="ph ph-chat-text"></i>
              <p>Seleccione un prospecto para ver mensajes</p>
            </div>
          </div>
        }
      </div>
    </div>

    <!-- Prospect Detail Modal (PARIDAD RAILS: panel styling) -->
    @if (showProspectDetailModal()) {
      <div class="modal-backdrop" (click)="closeProspectDetailModal()"></div>
      <div class="modal-container modal-md">
        <div class="modal-content">
          <div class="modal-header">
            <h5>Detalles del Prospecto</h5>
            <button class="close-btn" (click)="closeProspectDetailModal()">
              <i class="ph ph-x"></i>
            </button>
          </div>
          <div class="modal-body">
            @if (selectedDetailProspect()) {
              <div class="panel">
                <div class="panel-heading">
                  <h3 class="panel-title">Perfil de {{ selectedDetailProspect()!.name || 'Prospecto' }}</h3>
                </div>
                <div class="panel-body">
                  <div class="avatar-container">
                    <div class="avatar-placeholder">
                      <i class="ph ph-user"></i>
                    </div>
                  </div>
                  <p><strong>Nombre:</strong> {{ selectedDetailProspect()!.name || '-' }}</p>
                  <p><strong>Telefono:</strong> {{ selectedDetailProspect()!.phone || '-' }}</p>
                  <p><strong>Estado:</strong> {{ selectedDetailProspect()!.status || '-' }}</p>
                  @if (selectedDetailProspect()!.managerName) {
                    <p><strong>Agente Asignado:</strong> {{ selectedDetailProspect()!.managerName }}</p>
                  }
                  <p><strong>Fecha Creacion:</strong> {{ formatDate(selectedDetailProspect()!.createdAt) }}</p>
                </div>
              </div>
            }
          </div>
        </div>
      </div>
    }
  `
})
export class AgentProspectsComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private wsService = inject(WebSocketService);
  private chatService = inject(ChatService);
  private destroy$ = new Subject<void>();
  private searchSubject = new Subject<string>();

  private baseUrl = `${environment.apiUrl}/app/users`;

  // State
  prospects = signal<Prospect[]>([]);
  managers = signal<{ id: number; name: string }[]>([]);
  isLoading = signal(false);
  isExporting = signal(false);
  hasMore = signal(true);
  selectedProspectId = signal<number | null>(null);
  conversationDetail = signal<ConversationDetail | null>(null);
  isLoadingConversation = signal(false);

  // Filters
  managerFilter = '';
  searchTerm = '';

  // Pagination
  currentPage = 0;
  pageSize = 25;
  totalRecords = 0;

  // Prospect Detail Modal
  showProspectDetailModal = signal(false);
  selectedDetailProspect = signal<Prospect | null>(null);

  // Current user
  currentUser = this.authService.currentUser;

  isManagerLevel4(): boolean {
    const user = this.currentUser();
    return user?.role === UserRole.MANAGER_LEVEL_4;
  }

  ngOnInit(): void {
    // Connect WebSocket
    this.wsService.connect();

    // Handle route params for prospectId
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const prospectId = params['prospectId'];
      if (prospectId) {
        this.selectProspectById(parseInt(prospectId, 10));
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
      this.loadProspects(true);
    });

    // Load managers for filter (if manager_level_4)
    if (this.isManagerLevel4()) {
      this.loadManagers();
    }

    // Initial load
    this.loadProspects();
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

  selectProspect(prospect: Prospect): void {
    this.selectedProspectId.set(prospect.id);
    this.loadConversationDetail(prospect.id);
    // Update URL
    this.router.navigate(['/app/agent_prospects', prospect.id]);
  }

  private selectProspectById(prospectId: number): void {
    this.selectedProspectId.set(prospectId);
    this.loadConversationDetail(prospectId);
  }

  onMessageSent(): void {
    // Refresh the prospect list
    this.loadProspects(true);
  }

  /**
   * Export prospects to CSV
   * PARIDAD RAILS: Similar to agent_clients export
   */
  onExport(): void {
    this.isExporting.set(true);

    const params = new URLSearchParams();
    if (this.searchTerm) {
      params.set('search', this.searchTerm);
    }
    if (this.managerFilter) {
      params.set('managerId', this.managerFilter);
    }
    params.set('format', 'csv');

    const exportUrl = `${environment.apiUrl}/app/users/agent_prospects?${params.toString()}`;

    const link = document.createElement('a');
    link.href = exportUrl;
    link.download = `prospectos_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => this.isExporting.set(false), 1000);
  }

  // Pagination methods
  goToPage(page: number): void {
    if (page < 0 || page >= this.getTotalPages()) return;
    this.currentPage = page;
    this.loadProspects();
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
  openProspectDetail(event: Event, prospect: Prospect): void {
    event.stopPropagation();
    this.selectedDetailProspect.set(prospect);
    this.showProspectDetailModal.set(true);
  }

  closeProspectDetailModal(): void {
    this.showProspectDetailModal.set(false);
    this.selectedDetailProspect.set(null);
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
    this.prospects.set([]);
    this.hasMore.set(true);
    this.loadProspects();
  }

  /**
   * Load list of agents for the filter dropdown
   * PARIDAD RAILS: current_user.subordinates for manager_level_4
   */
  private loadManagers(): void {
    this.http.get<{ id: number; firstName: string; lastName: string }[]>(
      `${this.baseUrl}/subordinates`
    ).subscribe({
      next: (subordinates) => {
        this.managers.set(subordinates.map(s => ({
          id: s.id,
          name: `${s.firstName || ''} ${s.lastName || ''}`.trim() || `Usuario ${s.id}`
        })));
      },
      error: (err) => {
        console.error('Error loading managers:', err);
      }
    });
  }

  private loadProspects(refresh = false): void {
    if (refresh) {
      this.currentPage = 0;
    }

    this.isLoading.set(true);

    let params = new HttpParams()
      .set('page', this.currentPage.toString())
      .set('pageSize', this.pageSize.toString());

    if (this.searchTerm) {
      params = params.set('search', this.searchTerm);
    }
    if (this.managerFilter) {
      params = params.set('managerId', this.managerFilter);
    }

    this.http.get<ProspectsResponse>(`${this.baseUrl}/agent_prospects`, { params }).subscribe({
      next: (response) => {
        this.totalRecords = response.meta.totalItems;
        this.prospects.set(response.data);

        const loaded = (this.currentPage + 1) * this.pageSize;
        this.hasMore.set(loaded < response.meta.totalItems);

        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading prospects:', err);
        this.isLoading.set(false);
      }
    });
  }

  private loadConversationDetail(prospectId: number): void {
    this.isLoadingConversation.set(true);
    // Use 'prospects' as chat_view_type to match Rails
    this.chatService.getConversationDetail(prospectId, 'prospects').subscribe({
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
