/**
 * Supervisor Agents Component
 * Vista master-detail: Agentes y sus clientes
 * PARIDAD: Rails admin/users/supervisor_agents.html.erb
 */
import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { UserService, PaginationParams } from '../../../../core/services/user.service';
import { UserListItem, UserRole, UserStatus, RoleUtils, getFullName } from '../../../../core/models/user.model';

interface AgentClient {
  id: number;
  name: string;
  phone: string;
  lastMessageAt?: string;
}

@Component({
  selector: 'app-supervisor-agents',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="supervisor-agents-container">
      <!-- Page Header -->
      <div class="page-header">
        <div class="page-header-content">
          <h1 class="page-title">Mis Agentes</h1>
          <p class="page-subtitle">Selecciona un agente para ver sus clientes asignados</p>
        </div>
      </div>

      <!-- Main Content -->
      <div class="master-detail-layout">
        <!-- Left Panel: Agents List -->
        <div class="panel agents-panel">
          <div class="panel-header">
            <h3 class="panel-title">
              <i class="ph ph-users-three"></i>
              Agentes
            </h3>
            <span class="panel-count">{{ agents().length }}</span>
          </div>

          <!-- Search Box -->
          <div class="panel-search">
            <i class="ph ph-magnifying-glass search-icon"></i>
            <input
              type="text"
              class="search-input"
              placeholder="Buscar agente..."
              [value]="agentSearchTerm()"
              (input)="onAgentSearchInput($event)"
            />
            @if (agentSearchTerm()) {
              <button class="clear-search" (click)="clearAgentSearch()">
                <i class="ph ph-x"></i>
              </button>
            }
          </div>

          <div class="panel-body">
            @if (isLoadingAgents()) {
              <div class="loading-state">
                <div class="spinner"></div>
                <span>Cargando agentes...</span>
              </div>
            } @else if (filteredAgents().length === 0) {
              <div class="empty-state">
                <i class="ph ph-users-three"></i>
                @if (agentSearchTerm()) {
                  <p>No se encontraron agentes</p>
                  <button class="btn-link" (click)="clearAgentSearch()">Limpiar búsqueda</button>
                } @else {
                  <p>No tienes agentes asignados</p>
                }
              </div>
            } @else {
              <div class="agent-list">
                @for (agent of filteredAgents(); track agent.id) {
                  <div
                    class="agent-item"
                    [class.selected]="selectedAgent()?.id === agent.id"
                    (click)="selectAgent(agent)"
                  >
                    <div class="agent-avatar">
                      {{ getInitials(agent) }}
                    </div>
                    <div class="agent-info">
                      <span class="agent-name">{{ getAgentFullName(agent) }}</span>
                      <span class="agent-role">{{ getRoleDisplayName(agent.role) }}</span>
                    </div>
                    <div class="agent-status">
                      <span class="status-dot" [class.active]="agent.status === 0"></span>
                    </div>
                    <button
                      class="agent-details-btn"
                      (click)="openAgentDetails($event, agent)"
                      title="Ver detalles"
                    >
                      <i class="ph ph-caret-down"></i>
                    </button>
                  </div>
                }
              </div>
            }
          </div>
        </div>

        <!-- Right Panel: Agent's Clients -->
        <div class="panel clients-panel">
          <div class="panel-header">
            <h3 class="panel-title">
              <i class="ph ph-address-book"></i>
              @if (selectedAgent()) {
                Clientes de {{ getAgentFullName(selectedAgent()!) }}
              } @else {
                Clientes
              }
            </h3>
            @if (selectedAgent()) {
              <span class="panel-count">{{ totalClients() }}</span>
            }
          </div>

          @if (selectedAgent()) {
            <!-- Search Box for Clients -->
            <div class="panel-search">
              <i class="ph ph-magnifying-glass search-icon"></i>
              <input
                type="text"
                class="search-input"
                placeholder="Buscar cliente..."
                [value]="clientSearchTerm()"
                (input)="onClientSearchInput($event)"
              />
              @if (clientSearchTerm()) {
                <button class="clear-search" (click)="clearClientSearch()">
                  <i class="ph ph-x"></i>
                </button>
              }
            </div>
          }

          <div class="panel-body">
            @if (!selectedAgent()) {
              <div class="empty-state hint">
                <i class="ph ph-cursor-click"></i>
                <p>Selecciona un agente para ver sus clientes</p>
              </div>
            } @else if (isLoadingClients()) {
              <div class="loading-state">
                <div class="spinner"></div>
                <span>Cargando clientes...</span>
              </div>
            } @else if (clients().length === 0) {
              <div class="empty-state">
                <i class="ph ph-address-book"></i>
                @if (clientSearchTerm()) {
                  <p>No se encontraron clientes</p>
                  <button class="btn-link" (click)="clearClientSearch()">Limpiar búsqueda</button>
                } @else {
                  <p>Este agente no tiene clientes asignados</p>
                }
              </div>
            } @else {
              <!-- Clients Table -->
              <div class="clients-table-wrapper">
                <table class="clients-table">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Teléfono</th>
                      <th>Último mensaje</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (client of clients(); track client.id) {
                      <tr>
                        <td class="client-name">{{ client.name }}</td>
                        <td class="client-phone">{{ client.phone || '-' }}</td>
                        <td class="client-date">{{ formatDate(client.lastMessageAt) }}</td>
                        <td class="client-actions">
                          <a
                            [routerLink]="['/app/supervisor_clients', client.id]"
                            class="action-btn"
                            title="Ver chat"
                          >
                            <i class="ph ph-chat-text"></i>
                          </a>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>

          <!-- Pagination -->
          @if (selectedAgent()) {
            <div class="panel-footer">
              <div class="page-size-wrapper">
                <label>Mostrar</label>
                <select class="page-size-select" [(ngModel)]="clientPageSize" (ngModelChange)="onClientPageSizeChange()">
                  <option [ngValue]="10">10</option>
                  <option [ngValue]="25">25</option>
                  <option [ngValue]="50">50</option>
                  <option [ngValue]="100">100</option>
                </select>
                <label>entradas</label>
              </div>
              @if (totalClientPages() > 1) {
                <div class="pagination">
                  <button
                    class="pagination-btn"
                    [disabled]="currentClientPage() === 1"
                    (click)="goToClientPage(currentClientPage() - 1)"
                  >
                    <i class="ph ph-caret-left"></i>
                  </button>
                  <span class="pagination-info">
                    Página {{ currentClientPage() }} de {{ totalClientPages() }}
                  </span>
                  <button
                    class="pagination-btn"
                    [disabled]="currentClientPage() === totalClientPages()"
                    (click)="goToClientPage(currentClientPage() + 1)"
                  >
                    <i class="ph ph-caret-right"></i>
                  </button>
                </div>
              }
            </div>
          }
        </div>
      </div>

      <!-- Agent Details Modal -->
      @if (showAgentModal() && agentForModal()) {
        <div class="modal-backdrop" (click)="closeAgentModal()"></div>
        <div class="modal-container modal-container-wide">
          <div class="modal-content">
            <div class="modal-header">
              <h3>Detalles del Agente</h3>
              <button class="modal-close" (click)="closeAgentModal()">
                <i class="ph ph-x"></i>
              </button>
            </div>
            <div class="modal-body">
              <div class="modal-grid">
                <!-- Left Panel: Agent Data -->
                <div class="detail-panel">
                  <h4 class="detail-panel-title">Datos de Agente</h4>
                  <div class="agent-detail-card">
                    <div class="detail-avatar">
                      {{ getInitials(agentForModal()!) }}
                    </div>
                    <h4>{{ getAgentFullName(agentForModal()!) }}</h4>
                  </div>
                  <div class="detail-list">
                    <div class="detail-item">
                      <i class="ph ph-envelope"></i>
                      <span>{{ agentForModal()!.email || 'Sin email' }}</span>
                    </div>
                    <div class="detail-item">
                      <i class="ph ph-phone"></i>
                      <span>{{ agentForModal()!.phone || 'Sin teléfono' }}</span>
                    </div>
                  </div>
                </div>

                <!-- Right Panel: Manager and Role -->
                <div class="detail-panel">
                  <h4 class="detail-panel-title">Manager y Rol</h4>
                  <div class="detail-list">
                    <div class="detail-item">
                      <i class="ph ph-user-circle"></i>
                      <div class="detail-item-content">
                        <span class="detail-label">Rol</span>
                        <span>{{ getRoleDisplayName(agentForModal()!.role) }}</span>
                      </div>
                    </div>
                    <div class="detail-item">
                      <i class="ph ph-user"></i>
                      <div class="detail-item-content">
                        <span class="detail-label">Manager</span>
                        <span>{{ agentForModal()!.managerName || 'Sin asignar' }}</span>
                      </div>
                    </div>
                    @if (agentForModal()!.managerRole !== undefined) {
                      <div class="detail-item">
                        <i class="ph ph-identification-badge"></i>
                        <div class="detail-item-content">
                          <span class="detail-label">Rol de Manager</span>
                          <span>{{ getRoleDisplayName(agentForModal()!.managerRole!) }}</span>
                        </div>
                      </div>
                    }
                    <div class="detail-item">
                      <i class="ph ph-circle-half"></i>
                      <div class="detail-item-content">
                        <span class="detail-label">Estado</span>
                        <span class="status-text" [class.active]="agentForModal()!.status === 0">
                          {{ getStatusDisplayName(agentForModal()!.status) }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn-secondary" (click)="closeAgentModal()">Cerrar</button>
              <a [routerLink]="['/app/users', agentForModal()!.id]" class="btn-primary">
                <i class="ph ph-user"></i>
                Ver perfil completo
              </a>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styleUrls: ['./supervisor-agents.component.scss']
})
export class SupervisorAgentsComponent implements OnInit, OnDestroy {
  private userService = inject(UserService);
  private destroy$ = new Subject<void>();

  // Agents data
  agents = signal<UserListItem[]>([]);
  isLoadingAgents = signal(false);
  agentSearchTerm = signal('');
  selectedAgent = signal<UserListItem | null>(null);

  // Clients data
  clients = signal<AgentClient[]>([]);
  isLoadingClients = signal(false);
  clientSearchTerm = signal('');
  currentClientPage = signal(1);
  clientPageSize = 25;
  totalClients = signal(0);

  // Modal
  showAgentModal = signal(false);
  agentForModal = signal<UserListItem | null>(null);

  // Computed
  filteredAgents = computed(() => {
    const term = this.agentSearchTerm().toLowerCase().trim();
    if (!term) return this.agents();

    return this.agents().filter(a =>
      this.getAgentFullName(a).toLowerCase().includes(term) ||
      a.email?.toLowerCase().includes(term) ||
      a.phone?.includes(term)
    );
  });

  totalClientPages = computed(() => Math.ceil(this.totalClients() / this.clientPageSize));

  ngOnInit(): void {
    this.loadAgents();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadAgents(): void {
    this.isLoadingAgents.set(true);

    this.userService.getSupervisorAgents({ page: 1, pageSize: 100 }).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        this.agents.set(response.data || []);
        this.isLoadingAgents.set(false);
      },
      error: (err) => {
        console.error('Error loading agents:', err);
        this.isLoadingAgents.set(false);
      }
    });
  }

  selectAgent(agent: UserListItem): void {
    if (this.selectedAgent()?.id === agent.id) {
      return; // Already selected
    }

    this.selectedAgent.set(agent);
    this.clientSearchTerm.set('');
    this.currentClientPage.set(1);
    this.loadClients();
  }

  private loadClients(): void {
    const agent = this.selectedAgent();
    if (!agent) return;

    this.isLoadingClients.set(true);

    this.userService.getSupervisorGetAgentClients(agent.id, {
      page: this.currentClientPage(),
      pageSize: this.clientPageSize,
      search: this.clientSearchTerm() || undefined
    }).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        this.clients.set(this.mapClientsResponse(response.data || []));
        this.totalClients.set(response.meta?.totalItems || 0);
        this.isLoadingClients.set(false);
      },
      error: (err) => {
        console.error('Error loading clients:', err);
        this.isLoadingClients.set(false);
      }
    });
  }

  private mapClientsResponse(data: any[]): AgentClient[] {
    return data.map(item => ({
      id: item.id,
      name: item.name || item.fullName || `${item.firstName || ''} ${item.lastName || ''}`.trim() || 'Sin nombre',
      phone: item.phone || '',
      lastMessageAt: item.lastMessageAt || item.last_message_at
    }));
  }

  onAgentSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.agentSearchTerm.set(value);
  }

  clearAgentSearch(): void {
    this.agentSearchTerm.set('');
  }

  onClientSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.clientSearchTerm.set(value);
    this.currentClientPage.set(1);
    this.loadClients();
  }

  clearClientSearch(): void {
    this.clientSearchTerm.set('');
    this.currentClientPage.set(1);
    this.loadClients();
  }

  onClientPageSizeChange(): void {
    this.currentClientPage.set(1);
    this.loadClients();
  }

  goToClientPage(page: number): void {
    if (page < 1 || page > this.totalClientPages()) return;
    this.currentClientPage.set(page);
    this.loadClients();
  }

  openAgentDetails(event: Event, agent: UserListItem): void {
    event.stopPropagation();
    this.agentForModal.set(agent);
    this.showAgentModal.set(true);
  }

  closeAgentModal(): void {
    this.showAgentModal.set(false);
    this.agentForModal.set(null);
  }

  getAgentFullName(agent: UserListItem): string {
    return getFullName(agent);
  }

  getInitials(agent: UserListItem): string {
    const first = agent.firstName?.charAt(0) || '';
    const last = agent.lastName?.charAt(0) || '';
    return (first + last).toUpperCase() || '?';
  }

  getRoleDisplayName(role: UserRole): string {
    return RoleUtils.getDisplayName(role);
  }

  getStatusDisplayName(status: UserStatus): string {
    const statusMap: Record<UserStatus, string> = {
      [UserStatus.ACTIVE]: 'Activo',
      [UserStatus.INACTIVE]: 'Inactivo',
      [UserStatus.PENDING]: 'Pendiente'
    };
    return statusMap[status] || '';
  }

  formatDate(dateStr?: string): string {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('es', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '-';
    }
  }
}
