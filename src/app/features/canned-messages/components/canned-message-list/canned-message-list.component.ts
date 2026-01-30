/**
 * Canned Message List Component
 * PARIDAD: Rails admin/canned_messages/index.html.erb
 * Lista de mensajes enlatados (respuestas rápidas)
 */
import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { CannedMessageService, CannedMessage } from '../../../../core/services/canned-message.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../core/services/toast.service';
import { UserRole } from '../../../../core/models/user.model';

@Component({
  selector: 'app-canned-message-list',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="canned-messages-container">
      <!-- Page Header -->
      <div class="page-header">
        <div class="page-header-content">
          <h1 class="page-title">Respuestas Rápidas</h1>
          <p class="page-subtitle">Gestiona tus mensajes predefinidos para responder más rápido</p>
        </div>
        @if (canCreate()) {
          <a routerLink="new" class="btn-primary">
            <i class="ph-fill ph-plus"></i>
            Nueva Respuesta
          </a>
        }
      </div>

      <!-- Toolbar Card -->
      <div class="toolbar-card">
        <!-- Search Box -->
        <div class="search-box">
          <i class="ph ph-magnifying-glass search-icon"></i>
          <input
            type="text"
            class="search-input"
            [value]="searchTerm()"
            (input)="onSearchInput($event)"
            placeholder="Buscar respuestas rápidas..."
          />
          @if (searchTerm()) {
            <button class="clear-search" (click)="clearSearch()">
              <i class="ph ph-x"></i>
            </button>
          }
        </div>

        <!-- Filter Tabs -->
        <div class="filter-tabs">
          <button
            class="filter-tab"
            [class.active]="activeFilter() === 'all'"
            (click)="setFilter('all')"
          >
            Todas
            <span class="tab-count">{{ allMessages().length }}</span>
          </button>
          <button
            class="filter-tab"
            [class.active]="activeFilter() === 'global'"
            (click)="setFilter('global')"
          >
            Globales
            <span class="tab-count">{{ globalMessages().length }}</span>
          </button>
          <button
            class="filter-tab"
            [class.active]="activeFilter() === 'personal'"
            (click)="setFilter('personal')"
          >
            Personales
            <span class="tab-count">{{ personalMessages().length }}</span>
          </button>
        </div>
      </div>

      <!-- Content -->
      @if (isLoading()) {
        <div class="loading-container">
          <div class="spinner"></div>
          <p>Cargando respuestas rápidas...</p>
        </div>
      } @else if (filteredMessages().length === 0) {
        <div class="empty-state">
          <div class="empty-icon">
            <i class="ph ph-chat-centered-text"></i>
          </div>
          @if (searchTerm()) {
            <h3>Sin resultados</h3>
            <p>No se encontraron respuestas que coincidan con "{{ searchTerm() }}"</p>
            <button class="btn-secondary" (click)="clearSearch()">
              Limpiar búsqueda
            </button>
          } @else {
            <h3>No hay respuestas rápidas</h3>
            <p>Crea tu primera respuesta rápida para agilizar tus conversaciones</p>
            @if (canCreate()) {
              <a routerLink="new" class="btn-primary">
                <i class="ph-fill ph-plus"></i>
                Crear respuesta
              </a>
            }
          }
        </div>
      } @else {
        <!-- Messages Grid -->
        <div class="messages-grid">
          @for (message of filteredMessages(); track message.id) {
            <div class="message-card" [class.global]="message.client_global">
              <div class="card-header">
                <div class="card-badges">
                  @if (message.client_global) {
                    <span class="badge badge-global">
                      <i class="ph-fill ph-globe"></i>
                      Global
                    </span>
                  } @else {
                    <span class="badge badge-personal">
                      <i class="ph-fill ph-user"></i>
                      Personal
                    </span>
                  }
                </div>
                @if (canEdit()) {
                  <div class="card-actions">
                    <a [routerLink]="[message.id, 'edit']" class="action-btn" title="Editar">
                      <i class="ph ph-pencil-simple"></i>
                    </a>
                    <button
                      class="action-btn delete"
                      (click)="confirmDelete(message)"
                      title="Eliminar"
                    >
                      <i class="ph ph-trash"></i>
                    </button>
                  </div>
                }
              </div>
              <div class="card-body">
                <p class="message-content">{{ message.message }}</p>
              </div>
              <div class="card-footer">
                <span class="message-preview">
                  <i class="ph ph-chat-text"></i>
                  {{ truncateMessage(message.message, 50) }}
                </span>
              </div>
            </div>
          }
        </div>

        <!-- Results Footer -->
        <div class="results-footer">
          <span class="results-count">
            {{ filteredMessages().length }} respuesta(s) encontrada(s)
          </span>
        </div>
      }

      <!-- Delete Confirmation Modal -->
      @if (showDeleteModal()) {
        <div class="modal-backdrop" (click)="cancelDelete()"></div>
        <div class="modal-container">
          <div class="modal-content">
            <div class="modal-header">
              <div class="modal-icon delete">
                <i class="ph-fill ph-warning"></i>
              </div>
              <h3>Eliminar Respuesta</h3>
              <p>¿Estás seguro de que deseas eliminar esta respuesta rápida?</p>
            </div>
            <div class="modal-preview">
              <p>{{ messageToDelete()?.message }}</p>
            </div>
            <div class="modal-actions">
              <button class="btn-secondary" (click)="cancelDelete()">
                Cancelar
              </button>
              <button
                class="btn-danger"
                (click)="deleteMessage()"
                [disabled]="isDeleting()"
              >
                @if (isDeleting()) {
                  <div class="spinner-sm"></div>
                  Eliminando...
                } @else {
                  <i class="ph-fill ph-trash"></i>
                  Eliminar
                }
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styleUrls: ['./canned-message-list.component.scss']
})
export class CannedMessageListComponent implements OnInit, OnDestroy {
  private cannedMessageService = inject(CannedMessageService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private destroy$ = new Subject<void>();

  // Data
  allMessages = signal<CannedMessage[]>([]);
  isLoading = signal(false);
  searchTerm = signal('');
  activeFilter = signal<'all' | 'global' | 'personal'>('all');

  // Delete modal
  showDeleteModal = signal(false);
  messageToDelete = signal<CannedMessage | null>(null);
  isDeleting = signal(false);

  // Permissions
  canCreate = signal(false);
  canEdit = signal(false);

  // Computed filtered messages
  globalMessages = computed(() => this.allMessages().filter(m => m.client_global));
  personalMessages = computed(() => this.allMessages().filter(m => !m.client_global));

  filteredMessages = computed(() => {
    let messages = this.allMessages();

    // Filter by type
    if (this.activeFilter() === 'global') {
      messages = messages.filter(m => m.client_global);
    } else if (this.activeFilter() === 'personal') {
      messages = messages.filter(m => !m.client_global);
    }

    // Filter by search term
    const term = this.searchTerm().toLowerCase().trim();
    if (term) {
      messages = messages.filter(m =>
        m.message.toLowerCase().includes(term)
      );
    }

    return messages;
  });

  ngOnInit(): void {
    this.checkPermissions();
    this.loadCannedMessages();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    const user = this.authService.currentUser();
    if (user) {
      const canManage = user.role === UserRole.ADMIN ||
                        user.role === UserRole.SUPER_ADMIN ||
                        user.role === UserRole.STAFF ||
                        user.role === UserRole.MANAGER_LEVEL_4 ||
                        user.role === UserRole.AGENT;
      this.canCreate.set(canManage);
      this.canEdit.set(
        user.role === UserRole.ADMIN ||
        user.role === UserRole.SUPER_ADMIN ||
        user.role === UserRole.STAFF ||
        user.role === UserRole.MANAGER_LEVEL_4
      );
    }
  }

  loadCannedMessages(): void {
    this.isLoading.set(true);

    this.cannedMessageService.getCannedMessages().pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        this.allMessages.set(response.canned_messages || []);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading canned messages:', err);
        this.toast.error('Error al cargar respuestas rápidas');
        this.isLoading.set(false);
      }
    });
  }

  onSearchInput(event: Event): void {
    const term = (event.target as HTMLInputElement).value;
    this.searchTerm.set(term);
  }

  clearSearch(): void {
    this.searchTerm.set('');
  }

  setFilter(filter: 'all' | 'global' | 'personal'): void {
    this.activeFilter.set(filter);
  }

  truncateMessage(text: string, maxLength: number): string {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  confirmDelete(message: CannedMessage): void {
    this.messageToDelete.set(message);
    this.showDeleteModal.set(true);
  }

  cancelDelete(): void {
    this.showDeleteModal.set(false);
    this.messageToDelete.set(null);
  }

  deleteMessage(): void {
    const message = this.messageToDelete();
    if (!message) return;

    this.isDeleting.set(true);

    this.cannedMessageService.deleteCannedMessage(message.id).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.isDeleting.set(false);
        this.showDeleteModal.set(false);
        this.messageToDelete.set(null);
        this.toast.success('Respuesta rápida eliminada');
        this.loadCannedMessages();
      },
      error: (err) => {
        console.error('Error deleting canned message:', err);
        this.isDeleting.set(false);
        this.toast.error('Error al eliminar respuesta');
      }
    });
  }
}
