/**
 * Manager Assignments Component
 * PARIDAD: Rails admin/managers/index.html.erb
 * Permite a supervisores reasignar clientes entre sus agentes subordinados
 */
import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil, forkJoin } from 'rxjs';
import { UserService } from '../../core/services/user.service';
import { ToastService } from '../../core/services/toast.service';
import { UserOption, UserListItem } from '../../core/models/user.model';

interface SubordinateClient {
  id: number;
  name: string;
  phone: string;
  managerName: string;
  managerId: number;
}

@Component({
  selector: 'app-manager-assignments',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="assignments-container">
      <!-- Page Header -->
      <div class="page-header">
        <div class="page-header-content">
          <h1 class="page-title">Asignar Managers</h1>
          <p class="page-subtitle">Reasigna clientes entre tus agentes subordinados</p>
        </div>
      </div>

      <!-- Main Content -->
      <div class="assignments-layout">
        <!-- Left Panel: Managers/Agents -->
        <div class="panel managers-panel">
          <div class="panel-header">
            <h3 class="panel-title">
              <i class="ph ph-users"></i>
              Mis Agentes
            </h3>
            <span class="panel-count">{{ managers().length }}</span>
          </div>

          <div class="panel-body">
            @if (isLoadingManagers()) {
              <div class="loading-state">
                <div class="spinner"></div>
                <span>Cargando agentes...</span>
              </div>
            } @else if (managers().length === 0) {
              <div class="empty-state">
                <i class="ph ph-users"></i>
                <p>No tienes agentes subordinados</p>
              </div>
            } @else {
              <div class="user-list">
                @for (manager of managers(); track manager.id) {
                  <div
                    class="user-item"
                    [class.selected]="selectedManager()?.id === manager.id"
                    (click)="selectManager(manager)"
                  >
                    <div class="user-avatar">
                      <i class="ph-fill ph-user"></i>
                    </div>
                    <div class="user-info">
                      <span class="user-name">{{ manager.name }}</span>
                    </div>
                    @if (selectedManager()?.id === manager.id) {
                      <i class="ph-fill ph-check-circle selected-icon"></i>
                    }
                  </div>
                }
              </div>
            }
          </div>
        </div>

        <!-- Center: Action Button -->
        <div class="action-column">
          <button
            class="assign-btn"
            [disabled]="!canAssign()"
            (click)="assignClients()"
          >
            @if (isAssigning()) {
              <div class="spinner-sm"></div>
            } @else {
              <i class="ph-fill ph-arrow-left"></i>
            }
            <span>Asignar</span>
          </button>
          <p class="assign-hint">
            Selecciona un agente y uno o más clientes para reasignar
          </p>
        </div>

        <!-- Right Panel: Clients -->
        <div class="panel clients-panel">
          <div class="panel-header">
            <h3 class="panel-title">
              <i class="ph ph-address-book"></i>
              Clientes de mis Agentes
            </h3>
            <span class="panel-count">{{ selectedClientsCount() }} / {{ clients().length }}</span>
          </div>

          <!-- Search Box -->
          <div class="panel-search">
            <i class="ph ph-magnifying-glass search-icon"></i>
            <input
              type="text"
              class="search-input"
              placeholder="Buscar cliente..."
              [value]="searchTerm()"
              (input)="onSearchInput($event)"
            />
            @if (searchTerm()) {
              <button class="clear-search" (click)="clearSearch()">
                <i class="ph ph-x"></i>
              </button>
            }
          </div>

          <div class="panel-body">
            @if (isLoadingClients()) {
              <div class="loading-state">
                <div class="spinner"></div>
                <span>Cargando clientes...</span>
              </div>
            } @else if (filteredClients().length === 0) {
              <div class="empty-state">
                <i class="ph ph-address-book"></i>
                @if (searchTerm()) {
                  <p>No se encontraron clientes</p>
                  <button class="btn-link" (click)="clearSearch()">Limpiar búsqueda</button>
                } @else {
                  <p>No hay clientes asignados</p>
                }
              </div>
            } @else {
              <!-- Select All -->
              <div class="select-all-row">
                <label class="checkbox-label">
                  <input
                    type="checkbox"
                    [checked]="allFilteredSelected()"
                    [indeterminate]="someFilteredSelected() && !allFilteredSelected()"
                    (change)="toggleSelectAll()"
                  />
                  <span>Seleccionar todos ({{ filteredClients().length }})</span>
                </label>
              </div>

              <div class="client-list">
                @for (client of filteredClients(); track client.id) {
                  <div
                    class="client-item"
                    [class.selected]="isClientSelected(client.id)"
                    (click)="toggleClientSelection(client.id)"
                  >
                    <input
                      type="checkbox"
                      [checked]="isClientSelected(client.id)"
                      (click)="$event.stopPropagation()"
                      (change)="toggleClientSelection(client.id)"
                    />
                    <div class="client-info">
                      <span class="client-name">{{ client.name }}</span>
                      <span class="client-phone">{{ client.phone }}</span>
                    </div>
                    <span class="client-manager">
                      <i class="ph ph-user"></i>
                      {{ client.managerName }}
                    </span>
                  </div>
                }
              </div>
            }
          </div>

          <!-- Pagination -->
          @if (totalPages() > 1) {
            <div class="panel-footer">
              <div class="pagination">
                <button
                  class="pagination-btn"
                  [disabled]="currentPage() === 1"
                  (click)="goToPage(currentPage() - 1)"
                >
                  <i class="ph ph-caret-left"></i>
                </button>
                <span class="pagination-info">
                  Página {{ currentPage() }} de {{ totalPages() }}
                </span>
                <button
                  class="pagination-btn"
                  [disabled]="currentPage() === totalPages()"
                  (click)="goToPage(currentPage() + 1)"
                >
                  <i class="ph ph-caret-right"></i>
                </button>
              </div>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./manager-assignments.component.scss']
})
export class ManagerAssignmentsComponent implements OnInit, OnDestroy {
  private userService = inject(UserService);
  private toast = inject(ToastService);
  private destroy$ = new Subject<void>();

  // Data
  managers = signal<UserOption[]>([]);
  clients = signal<SubordinateClient[]>([]);

  // Selection
  selectedManager = signal<UserOption | null>(null);
  selectedClientIds = signal<Set<number>>(new Set());

  // Search & Pagination
  searchTerm = signal('');
  currentPage = signal(1);
  pageSize = 50;
  totalClients = signal(0);

  // Loading states
  isLoadingManagers = signal(false);
  isLoadingClients = signal(false);
  isAssigning = signal(false);

  // Computed
  filteredClients = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    if (!term) return this.clients();

    return this.clients().filter(c =>
      c.name.toLowerCase().includes(term) ||
      c.phone.includes(term) ||
      c.managerName.toLowerCase().includes(term)
    );
  });

  totalPages = computed(() => Math.ceil(this.totalClients() / this.pageSize));

  selectedClientsCount = computed(() => this.selectedClientIds().size);

  canAssign = computed(() => {
    return this.selectedManager() !== null &&
           this.selectedClientIds().size > 0 &&
           !this.isAssigning();
  });

  allFilteredSelected = computed(() => {
    const filtered = this.filteredClients();
    if (filtered.length === 0) return false;
    return filtered.every(c => this.selectedClientIds().has(c.id));
  });

  someFilteredSelected = computed(() => {
    const filtered = this.filteredClients();
    return filtered.some(c => this.selectedClientIds().has(c.id));
  });

  ngOnInit(): void {
    this.loadData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadData(): void {
    this.isLoadingManagers.set(true);
    this.isLoadingClients.set(true);

    forkJoin({
      managers: this.userService.getSubordinates(),
      clients: this.userService.getSubordinatesClients({ page: 1, pageSize: this.pageSize })
    }).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: ({ managers, clients }) => {
        this.managers.set(managers);
        this.isLoadingManagers.set(false);

        // Map clients data
        this.clients.set(this.mapClientsResponse(clients.data || []));
        this.totalClients.set(clients.meta?.totalItems || 0);
        this.isLoadingClients.set(false);
      },
      error: (err) => {
        console.error('Error loading data:', err);
        this.toast.error('Error al cargar datos');
        this.isLoadingManagers.set(false);
        this.isLoadingClients.set(false);
      }
    });
  }

  private mapClientsResponse(data: any[]): SubordinateClient[] {
    return data.map(item => ({
      id: item.id,
      name: item.name || item.first_name + ' ' + (item.last_name || ''),
      phone: item.phone || '',
      managerName: item.manager_name || item.managerName || 'Sin asignar',
      managerId: item.manager_id || item.managerId || 0
    }));
  }

  selectManager(manager: UserOption): void {
    if (this.selectedManager()?.id === manager.id) {
      this.selectedManager.set(null);
    } else {
      this.selectedManager.set(manager);
    }
  }

  toggleClientSelection(clientId: number): void {
    const current = new Set(this.selectedClientIds());
    if (current.has(clientId)) {
      current.delete(clientId);
    } else {
      current.add(clientId);
    }
    this.selectedClientIds.set(current);
  }

  isClientSelected(clientId: number): boolean {
    return this.selectedClientIds().has(clientId);
  }

  toggleSelectAll(): void {
    const filtered = this.filteredClients();
    const current = new Set(this.selectedClientIds());

    if (this.allFilteredSelected()) {
      // Deselect all filtered
      filtered.forEach(c => current.delete(c.id));
    } else {
      // Select all filtered
      filtered.forEach(c => current.add(c.id));
    }

    this.selectedClientIds.set(current);
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchTerm.set(value);
  }

  clearSearch(): void {
    this.searchTerm.set('');
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;

    this.currentPage.set(page);
    this.loadClients();
  }

  private loadClients(): void {
    this.isLoadingClients.set(true);

    this.userService.getSubordinatesClients({
      page: this.currentPage(),
      pageSize: this.pageSize,
      search: this.searchTerm() || undefined
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
        this.toast.error('Error al cargar clientes');
        this.isLoadingClients.set(false);
      }
    });
  }

  assignClients(): void {
    const manager = this.selectedManager();
    const clientIds = Array.from(this.selectedClientIds());

    if (!manager || clientIds.length === 0) return;

    this.isAssigning.set(true);

    this.userService.reassignBulk({
      userIds: clientIds,
      newAgentId: manager.id
    }).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        this.isAssigning.set(false);

        if (response.result === 'success') {
          this.toast.success(response.message || `${clientIds.length} cliente(s) asignados a ${manager.name}`);
          this.selectedClientIds.set(new Set());
          this.loadClients();
        } else {
          this.toast.error(response.message || 'Error al asignar');
        }
      },
      error: (err) => {
        console.error('Error assigning clients:', err);
        this.toast.error('Error al asignar clientes');
        this.isAssigning.set(false);
      }
    });
  }
}
