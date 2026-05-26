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
import { ToastService } from '../../core/services/toast.service';
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

// Conversion modal interfaces
interface UserOption {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  codigo?: string;
}

interface ImportTemplate {
  id: number;
  name: string;
  isFoh: boolean;
  headers: string[];
}

interface ConvGroupItem {
  prospect: Prospect;
  user: UserOption | null;
  searchTerm: string;
  searchResults: UserOption[];
  showSearch: boolean;
}

interface ConvGroup {
  templateId: number | null;
  items: ConvGroupItem[];
}

interface ProspectsResponse {
  data: Prospect[];
  meta: {
    totalItems: number;
    page: number;
    pageSize: number;
  };
}

interface SkippedAssociation {
  prospectId: number;
  userId: number;
  reason: string;
  prospectName?: string;
  prospectPhone?: string;
}

interface GenerateImportCsvResponse {
  files: { filename: string; content: string }[];
  skipped?: SkippedAssociation[];
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
            <div class="header-actions">
              <button
                class="btn btn-secondary"
                (click)="openConversionModal()"
                [disabled]="eligibleCount() === 0"
              >
                Convertir a CSV
                @if (eligibleCount() > 0) {
                  <span class="badge-count">{{ eligibleCount() }}</span>
                }
              </button>
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
                placeholder="Nombre o teléfono..."
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
                      <td class="col-nombre">
                        {{ prospect.name || 'Sin nombre' }}
                        @if (prospect.upgradedToUser) {
                          <span class="badge-converted" title="Ya convertido a usuario"><i class="ph ph-check-circle"></i></span>
                        }
                      </td>
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

    <!-- Conversion Modal -->
    @if (showConversionModal()) {
      <div class="modal-backdrop" (click)="attemptCloseConversionModal()"></div>
      <div class="modal-container modal-xl">
        <div class="modal-content">
          <div class="modal-header">
            <div>
              <h5>Convertir Prospectos a CSV de Importación</h5>
              <small class="modal-scope-note">
                <i class="ph ph-info"></i>
                {{ modalSnapshotCount }} prospecto(s) · página actual
                @if (totalRecords > pageSize) {
                  · {{ totalRecords }} en total (usa el buscador principal para otro lote)
                }
              </small>
            </div>
            <button class="close-btn" (click)="attemptCloseConversionModal()">
              <i class="ph ph-x"></i>
            </button>
          </div>
          <div class="modal-body">
            <div class="modal-filters">
              <div class="modal-search-box">
                <i class="ph ph-magnifying-glass"></i>
                <input
                  type="text"
                  class="form-control form-control-sm"
                  placeholder="Buscar por nombre o teléfono..."
                  [(ngModel)]="modalSearch"
                />
                @if (modalSearch) {
                  <button class="modal-search-clear" (click)="modalSearch = ''" title="Limpiar búsqueda">
                    <i class="ph ph-x"></i>
                  </button>
                }
              </div>
              <label class="toggle-label">
                <input type="checkbox" [(ngModel)]="showOnlyUnassociated" />
                Solo sin asociar
              </label>
            </div>
            @for (group of convGroups; track $index; let gIdx = $index) {
              <div class="conv-group">
                <div class="conv-group-header">
                  <div class="template-selector">
                    <label>Template:</label>
                    <select class="form-control" [(ngModel)]="group.templateId">
                      <option [ngValue]="null">FOH (estándar)</option>
                      @for (tpl of availableTemplates; track tpl.id) {
                        <option [ngValue]="tpl.id">{{ tpl.name }}</option>
                      }
                    </select>
                  </div>
                  @if (convGroups.length > 1) {
                    <button class="btn btn-sm btn-danger" (click)="removeConvGroup(gIdx)">
                      <i class="ph ph-trash"></i> Eliminar grupo
                    </button>
                  }
                </div>
                <div class="table-responsive">
                  <table class="table table-sm conv-table">
                    <thead>
                      <tr>
                        <th>Prospecto</th>
                        <th>Teléfono</th>
                        <th>Usuario Asociado</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (item of group.items; track item.prospect.id; let iIdx = $index) {
                        @if (matchesModalSearch(item) && (!showOnlyUnassociated || item.user === null)) {
                        <tr>
                          <td>{{ item.prospect.name || 'Sin nombre' }}</td>
                          <td>{{ item.prospect.phone }}</td>
                          <td>
                            @if (item.user) {
                              <span class="user-badge">
                                {{ item.user.firstName }} {{ item.user.lastName }}
                                <small class="text-muted">({{ item.user.phone }})</small>
                              </span>
                            } @else {
                              <span class="text-muted-sm">Sin asociar</span>
                            }
                          </td>
                          <td class="conv-actions-cell">
                            @if (item.user) {
                              <button class="btn btn-sm btn-outline-danger" (click)="clearUser(gIdx, iIdx)" title="Quitar asociación">
                                <i class="ph ph-x"></i>
                              </button>
                            }
                            <button class="btn btn-sm btn-outline" (click)="toggleSearch(gIdx, iIdx)" title="Buscar usuario">
                              <i class="ph ph-magnifying-glass"></i>
                            </button>
                            @if (item.showSearch) {
                              <div class="user-search-panel" (click)="$event.stopPropagation()">
                                <input
                                  type="text"
                                  class="form-control form-control-sm"
                                  placeholder="Buscar por nombre, teléfono o código..."
                                  [value]="item.searchTerm"
                                  (input)="onUserSearchChange(gIdx, iIdx, $any($event.target).value)"
                                  autofocus
                                />
                                @if (item.searchResults.length > 0) {
                                  <div class="search-results-dropdown">
                                    @for (u of item.searchResults; track u.id) {
                                      <div class="search-result-item" (click)="selectUser(gIdx, iIdx, u)">
                                        <strong>{{ u.firstName }} {{ u.lastName }}</strong>
                                        <span class="result-phone">{{ u.phone }}</span>
                                        @if (u.codigo) {
                                          <span class="result-codigo">{{ u.codigo }}</span>
                                        }
                                      </div>
                                    }
                                  </div>
                                }
                              </div>
                            }
                          </td>
                        </tr>
                        }
                      }
                      @if (hasNoVisibleItems(group)) {
                        <tr>
                          <td colspan="4" class="empty-cell">
                            @if (modalSearch) {
                              Sin resultados para "{{ modalSearch }}"
                            } @else {
                              Todos los prospectos ya están asociados
                            }
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            }
            <button class="btn btn-sm btn-outline add-group-btn" (click)="addConvGroup()">
              <i class="ph ph-plus"></i> Agregar grupo de template
            </button>

            <!-- Panel de omitidos (visible después de generar si hay filas excluidas) -->
            @if (showSkippedPanel() && skippedItems().length > 0) {
              <div class="skipped-panel">
                <div class="skipped-panel-header">
                  <span><i class="ph ph-warning"></i> {{ skippedItems().length }} fila(s) no incluidas en el CSV</span>
                  <button class="btn btn-sm btn-outline" (click)="downloadSkippedCsv()">
                    <i class="ph ph-download-simple"></i> Descargar reporte
                  </button>
                </div>
                <div class="skipped-list">
                  @for (item of skippedItems(); track item.prospectId) {
                    <div class="skipped-item">
                      <span class="skipped-name">{{ item.prospectName || ('Prospecto #' + item.prospectId) }}</span>
                      @if (item.prospectPhone) {
                        <span class="skipped-phone">{{ item.prospectPhone }}</span>
                      }
                      <span class="skipped-reason">{{ reasonLabel(item.reason) }}</span>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
          <div class="modal-footer">
            <span class="assoc-count">
              @if (modalSearch) {
                <span class="filter-active-badge">
                  <i class="ph ph-funnel-simple"></i> "{{ modalSearch }}"
                </span>
              }
              {{ countTotalAssociations() }} de {{ conversionProspectsCount() }} asociados
            </span>
            <div class="footer-actions">
              <button class="btn btn-secondary" (click)="attemptCloseConversionModal()">Cancelar</button>
              <button
                class="btn btn-primary"
                (click)="generateImportCsv()"
                [disabled]="countTotalAssociations() === 0 || isGeneratingCsv()"
              >
                @if (isGeneratingCsv()) {
                  <span class="spinner-sm"></span>
                }
                Generar CSV
              </button>
            </div>
          </div>
        </div>
      </div>
    }

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
  private toastService = inject(ToastService);
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

  // Conversion Modal
  showConversionModal = signal(false);
  isGeneratingCsv = signal(false);
  availableTemplates: ImportTemplate[] = [];
  convGroups: ConvGroup[] = [];
  skippedItems = signal<SkippedAssociation[]>([]);
  showSkippedPanel = signal(false);
  showOnlyUnassociated = false;
  modalSearch = '';
  modalSnapshotCount = 0;
  eligibleCount = computed(() => this.prospects().filter(p => !p.upgradedToUser).length);
  private searchTimers = new Map<string, ReturnType<typeof setTimeout>>();

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
    // NO navegamos a /:prospectId: '' y ':prospectId' son route configs
    // distintas, así que el router recrea el componente y se pierde el filtro
    // de búsqueda. La selección vive en el signal selectedProspectId.
    // La ruta /:prospectId sigue existiendo solo para deep-links externos.
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

  // ======================== CONVERSION MODAL ========================

  openConversionModal(): void {
    const snapshot = this.prospects().filter(p => !p.upgradedToUser);
    this.modalSnapshotCount = snapshot.length;
    const items: ConvGroupItem[] = snapshot.map(p => ({
      prospect: p,
      user: null,
      searchTerm: '',
      searchResults: [],
      showSearch: false
    }));
    this.convGroups = [{ templateId: null, items }];
    this.showConversionModal.set(true);

    if (this.availableTemplates.length === 0) {
      this.http.get<ImportTemplate[]>(`${environment.apiUrl}/app/imports/mapping_templates`)
        .subscribe({ next: (tpls) => { this.availableTemplates = tpls; } });
    }
  }

  closeConversionModal(): void {
    this.showConversionModal.set(false);
    this.showSkippedPanel.set(false);
    this.skippedItems.set([]);
    this.showOnlyUnassociated = false;
    this.modalSearch = '';
    this.searchTimers.forEach(t => clearTimeout(t));
    this.searchTimers.clear();
  }

  /**
   * Close attempt: ask for confirmation if there are pending associations,
   * so a misclick on the backdrop doesn't wipe the user's work.
   */
  attemptCloseConversionModal(): void {
    if (this.countAllAssociations() > 0) {
      const confirmed = window.confirm(
        '¿Cerrar sin generar el CSV? Se perderán las asociaciones realizadas.'
      );
      if (!confirmed) return;
    }
    this.closeConversionModal();
  }

  addConvGroup(): void {
    const snapshot = [...this.prospects()];
    const items: ConvGroupItem[] = snapshot.map(p => ({
      prospect: p,
      user: null,
      searchTerm: '',
      searchResults: [],
      showSearch: false
    }));
    this.convGroups = [...this.convGroups, { templateId: null, items }];
  }

  removeConvGroup(idx: number): void {
    this.convGroups = this.convGroups.filter((_, i) => i !== idx);
  }

  toggleSearch(gIdx: number, iIdx: number): void {
    const item = this.convGroups[gIdx].items[iIdx];
    item.showSearch = !item.showSearch;
    if (!item.showSearch) {
      item.searchTerm = '';
      item.searchResults = [];
    }
  }

  onUserSearchChange(gIdx: number, iIdx: number, term: string): void {
    const key = `${gIdx}-${iIdx}`;
    const item = this.convGroups[gIdx].items[iIdx];
    item.searchTerm = term;

    const existing = this.searchTimers.get(key);
    if (existing) clearTimeout(existing);

    if (!term.trim()) {
      item.searchResults = [];
      return;
    }

    this.searchTimers.set(key, setTimeout(() => {
      this.searchStandardUsers(gIdx, iIdx, term);
      this.searchTimers.delete(key);
    }, 300));
  }

  selectUser(gIdx: number, iIdx: number, user: UserOption): void {
    const item = this.convGroups[gIdx].items[iIdx];
    item.user = user;
    item.showSearch = false;
    item.searchTerm = '';
    item.searchResults = [];
  }

  clearUser(gIdx: number, iIdx: number): void {
    this.convGroups[gIdx].items[iIdx].user = null;
  }

  matchesModalSearch(item: ConvGroupItem): boolean {
    const term = this.modalSearch.trim().toLowerCase();
    if (!term) return true;
    return (item.prospect.name?.toLowerCase().includes(term) ?? false) ||
           item.prospect.phone.includes(term);
  }

  hasNoVisibleItems(group: ConvGroup): boolean {
    return group.items.every(i =>
      !this.matchesModalSearch(i) || (this.showOnlyUnassociated && i.user !== null)
    );
  }

  private countAllAssociations(): number {
    return this.convGroups.reduce((sum, g) =>
      sum + g.items.filter(i => i.user !== null).length, 0);
  }

  countTotalAssociations(): number {
    return this.convGroups.reduce((sum, g) =>
      sum + g.items.filter(i => i.user !== null && this.matchesModalSearch(i)).length, 0);
  }

  conversionProspectsCount(): number {
    if (this.convGroups.length === 0) return 0;
    return this.convGroups[0].items.filter(i => this.matchesModalSearch(i)).length;
  }

  generateImportCsv(): void {
    const groups = this.convGroups
      .map(g => ({
        templateId: g.templateId,
        associations: g.items
          .filter(i => i.user !== null && this.matchesModalSearch(i))
          .map(i => ({ prospectId: i.prospect.id, userId: i.user!.id }))
      }))
      .filter(g => g.associations.length > 0);

    if (groups.length === 0) return;

    this.isGeneratingCsv.set(true);

    this.http.post<GenerateImportCsvResponse>(
      `${environment.apiUrl}/app/prospects/generate-import-csv`,
      { groups }
    ).subscribe({
      next: (response) => {
        this.isGeneratingCsv.set(false);
        response.files.forEach(file => {
          const bytes = Uint8Array.from(atob(file.content), c => c.charCodeAt(0));
          const blob = new Blob([bytes], { type: 'text/csv;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = file.filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        });
        if (response.skipped && response.skipped.length > 0) {
          this.skippedItems.set(response.skipped);
          this.showSkippedPanel.set(true);
          this.toastService.success(`${response.files.length} archivo(s) descargado(s). Revisa los omitidos al final del modal.`);
        } else {
          this.toastService.success('CSV generado correctamente.');
          this.closeConversionModal();
        }
      },
      error: (err) => {
        console.error('Error generando CSV:', err);
        this.isGeneratingCsv.set(false);
        this.toastService.error('Error generando el CSV de importación.');
      }
    });
  }

  /**
   * Show a warning toast summarizing rows the backend skipped, grouped by reason.
   * Reasons come from ProspectAdminController.generateImportCsv().
   */
  private notifySkipped(skipped: SkippedAssociation[] | undefined): void {
    if (!skipped || skipped.length === 0) return;

    const reasonLabels: Record<string, string> = {
      phone_already_exists_as_user: 'teléfono ya registrado como usuario',
      prospect_not_found_or_wrong_client: 'prospecto no encontrado',
      user_not_found: 'usuario no encontrado',
      user_not_standard: 'usuario no es estándar',
      user_wrong_client: 'usuario de otro cliente'
    };

    const counts = new Map<string, number>();
    for (const item of skipped) {
      counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1);
    }

    const parts: string[] = [];
    for (const [reason, count] of counts) {
      const label = reasonLabels[reason] ?? reason;
      parts.push(`${count} con ${label}`);
    }

    this.toastService.warning(
      `Se omitieron ${skipped.length} fila(s) del CSV: ${parts.join(', ')}.`,
      8000
    );
  }

  readonly reasonLabels: Record<string, string> = {
    phone_already_exists_as_user: 'Teléfono ya registrado como usuario',
    prospect_not_found_or_wrong_client: 'Prospecto no encontrado',
    user_not_found: 'Usuario no encontrado',
    user_not_standard: 'Usuario no es estándar',
    user_wrong_client: 'Usuario de otro cliente'
  };

  reasonLabel(reason: string): string {
    return this.reasonLabels[reason] ?? reason;
  }

  downloadSkippedCsv(): void {
    const lines = ['Nombre,Teléfono,Motivo'];
    for (const item of this.skippedItems()) {
      const name = item.prospectName || `Prospecto #${item.prospectId}`;
      const phone = item.prospectPhone || '';
      const reason = this.reasonLabel(item.reason);
      lines.push(`"${name}","${phone}","${reason}"`);
    }
    const csv = lines.join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `omitidos_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private searchStandardUsers(gIdx: number, iIdx: number, term: string): void {
    const params = new HttpParams().set('search', term).set('pageSize', '10');
    this.http.get<any>(`${environment.apiUrl}/app/users`, { params }).subscribe({
      next: (resp) => {
        const raw: any[] = resp.data || resp.users || [];
        this.convGroups[gIdx].items[iIdx].searchResults = raw.map(u => ({
          id: u.id,
          firstName: u.firstName || u.first_name || '',
          lastName: u.lastName || u.last_name || '',
          phone: u.phone || '',
          codigo: u.codigo || ''
        }));
      },
      error: () => { this.convGroups[gIdx].items[iIdx].searchResults = []; }
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
