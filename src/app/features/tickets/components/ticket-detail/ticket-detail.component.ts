/**
 * Ticket Detail Component
 * PARIDAD: Rails admin/tickets/show.html.erb
 */
import { Component, inject, signal, OnInit, OnDestroy, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { TicketService } from '../../../chat/services/ticket.service';
import { UserService } from '../../../../core/services/user.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../core/services/toast.service';
import { Ticket, TicketStatus, TicketCloseType, getTicketStatusText, getCloseTypeText, formatDuration, calculateDurationMinutes } from '../../../../core/models/ticket.model';
import { MessageDirection } from '../../../../core/models/message.model';
import { UserListItem, UserRole } from '../../../../core/models/user.model';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-ticket-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, LoadingSpinnerComponent],
  template: `
    <div class="ticket-detail-container">
      @if (isLoading()) {
        <app-loading-spinner [overlay]="false" message="Cargando ticket..." />
      } @else if (ticket()) {
        <div class="page-header">
          <div class="header-left">
            <a routerLink="/app/tickets" class="back-link">
              <i class="ph ph-arrow-left"></i>
              Volver a Tickets
            </a>
            <div class="header-content">
              <h1>Ticket #{{ ticket()!.id }}</h1>
              <span class="status-badge" [class.open]="ticket()!.status === TicketStatus.OPEN" [class.closed]="ticket()!.status === TicketStatus.CLOSED">
                {{ getStatusText(ticket()!.status) }}
              </span>
            </div>
          </div>
          <div class="header-actions">
            <a [routerLink]="['/app/chat']" [queryParams]="{ticketId: ticket()!.id}" class="btn btn-outline">
              <i class="ph ph-chat-circle-text"></i>
              Ver Conversación
            </a>
            @if (ticket()!.status === TicketStatus.OPEN && canCloseTicket()) {
              <button class="btn btn-danger" (click)="showCloseModal.set(true)">
                <i class="ph ph-x-circle"></i>
                Cerrar Ticket
              </button>
            }
          </div>
        </div>

        <div class="ticket-content">
          <div class="main-section">
            <!-- Ticket Info Card -->
            <div class="info-card">
              <h2>Información del Ticket</h2>
              <div class="info-grid">
                <div class="info-item">
                  <label>ID</label>
                  <span>#{{ ticket()!.id }}</span>
                </div>
                <div class="info-item">
                  <label>Estado</label>
                  <span class="status-badge small" [class.open]="ticket()!.status === TicketStatus.OPEN" [class.closed]="ticket()!.status === TicketStatus.CLOSED">
                    {{ getStatusText(ticket()!.status) }}
                  </span>
                </div>
                <div class="info-item">
                  <label>Creado</label>
                  <span>{{ formatDateTime(ticket()!.createdAt) }}</span>
                </div>
                @if (ticket()!.closedAt) {
                  <div class="info-item">
                    <label>Cerrado</label>
                    <span>{{ formatDateTime(ticket()!.closedAt) }}</span>
                  </div>
                }
                <div class="info-item">
                  <label>Duración</label>
                  <span>{{ getDuration() }}</span>
                </div>
                @if (ticket()!.closeType) {
                  <div class="info-item">
                    <label>Tipo de Cierre</label>
                    <span class="close-type-badge">{{ getCloseTypeDisplay(ticket()!.closeType) }}</span>
                  </div>
                }
                <div class="info-item full-width">
                  <label>Asunto</label>
                  <span>{{ ticket()!.subject || 'Sin asunto' }}</span>
                </div>
                @if (ticket()!.notes) {
                  <div class="info-item full-width">
                    <label>Notas</label>
                    <span>{{ ticket()!.notes }}</span>
                  </div>
                }
              </div>
            </div>

            <!-- Messages Preview -->
            <div class="info-card">
              <div class="card-header">
                <h2>Mensajes ({{ ticket()!.messageCount || ticket()!.messages?.length || 0 }})</h2>
                <a [routerLink]="['/app/chat']" [queryParams]="{ticketId: ticket()!.id}" class="view-all-link">
                  Ver todos <i class="ph ph-arrow-right"></i>
                </a>
              </div>
              @if (ticket()!.messages && ticket()!.messages!.length > 0) {
                <div class="messages-preview">
                  @for (message of getPreviewMessages(); track message.id) {
                    <div class="message-item" [class.outgoing]="message.direction === MessageDirection.OUTGOING">
                      <div class="message-header">
                        <span class="message-sender">
                          @if (message.direction === MessageDirection.OUTGOING) {
                            <i class="ph ph-arrow-up-right"></i> Agente
                          } @else {
                            <i class="ph ph-arrow-down-left"></i> Cliente
                          }
                        </span>
                        <span class="message-time">{{ formatDateTime(message.createdAt) }}</span>
                      </div>
                      <div class="message-content">{{ message.content }}</div>
                    </div>
                  }
                </div>
              } @else {
                <div class="empty-messages">
                  <i class="ph ph-chat-circle"></i>
                  <p>No hay mensajes en este ticket</p>
                </div>
              }
            </div>
          </div>

          <div class="side-section">
            <!-- Client Info -->
            <div class="side-card">
              <h3><i class="ph ph-user"></i> Cliente</h3>
              @if (ticket()!.user) {
                <div class="person-info">
                  <div class="person-avatar">
                    {{ getInitials(ticket()!.user!.firstName, ticket()!.user!.lastName) }}
                  </div>
                  <div class="person-details">
                    <span class="name">{{ ticket()!.user!.firstName }} {{ ticket()!.user!.lastName }}</span>
                    @if (ticket()!.user!.phone) {
                      <span class="phone"><i class="ph ph-phone"></i> {{ ticket()!.user!.phone }}</span>
                    }
                    @if (ticket()!.user!.email) {
                      <span class="email"><i class="ph ph-envelope"></i> {{ ticket()!.user!.email }}</span>
                    }
                  </div>
                </div>
              } @else {
                <p class="no-data">Cliente no disponible</p>
              }
            </div>

            <!-- Agent Info -->
            <div class="side-card">
              <div class="card-header-inline">
                <h3><i class="ph ph-headset"></i> Agente</h3>
                @if (ticket()!.status === TicketStatus.OPEN && canReassign()) {
                  <button class="btn-text" (click)="showReassignModal.set(true)">
                    <i class="ph ph-swap"></i> Reasignar
                  </button>
                }
              </div>
              @if (ticket()!.agent) {
                <div class="person-info">
                  <div class="person-avatar agent">
                    {{ getInitials(ticket()!.agent!.firstName, ticket()!.agent!.lastName) }}
                  </div>
                  <div class="person-details">
                    <span class="name">{{ ticket()!.agent!.firstName }} {{ ticket()!.agent!.lastName }}</span>
                    @if (ticket()!.agent!.email) {
                      <span class="email"><i class="ph ph-envelope"></i> {{ ticket()!.agent!.email }}</span>
                    }
                  </div>
                </div>
              } @else {
                <p class="no-data">Sin agente asignado</p>
              }
            </div>

            <!-- Quick Actions -->
            <div class="side-card">
              <h3><i class="ph ph-lightning"></i> Acciones Rápidas</h3>
              <div class="quick-actions">
                <a [routerLink]="['/app/chat']" [queryParams]="{ticketId: ticket()!.id}" class="action-btn">
                  <i class="ph ph-chat-circle-text"></i>
                  Ver Conversación
                </a>
                @if (ticket()!.user) {
                  <a [routerLink]="['/app/users', ticket()!.userId]" class="action-btn">
                    <i class="ph ph-user"></i>
                    Ver Perfil Cliente
                  </a>
                }
                <button class="action-btn" (click)="exportTicket()">
                  <i class="ph ph-download-simple"></i>
                  Exportar Transcript
                </button>
              </div>
            </div>
          </div>
        </div>
      } @else {
        <div class="not-found">
          <i class="ph ph-warning-circle"></i>
          <h2>Ticket no encontrado</h2>
          <p>El ticket que buscas no existe o no tienes acceso.</p>
          <a routerLink="/app/tickets" class="btn btn-primary">Volver a Tickets</a>
        </div>
      }
    </div>

    <!-- Close Ticket Modal -->
    @if (showCloseModal()) {
      <div class="modal-overlay" (click)="showCloseModal.set(false)">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>Cerrar Ticket #{{ ticket()!.id }}</h3>
            <button class="close-btn" (click)="showCloseModal.set(false)">
              <i class="ph ph-x"></i>
            </button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>Tipo de Cierre *</label>
              <select [(ngModel)]="selectedCloseType" required>
                <option value="">Seleccionar tipo...</option>
                @for (closeType of closeTypes(); track closeType.kpiName) {
                  <option [value]="closeType.kpiName">{{ closeType.name }}</option>
                }
              </select>
            </div>
            <div class="form-group">
              <label>Notas (opcional)</label>
              <textarea [(ngModel)]="closeNotes" rows="3" placeholder="Agregar notas de cierre..."></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="showCloseModal.set(false)">Cancelar</button>
            <button class="btn btn-danger" (click)="closeTicket()" [disabled]="!selectedCloseType || isClosing()">
              @if (isClosing()) {
                <i class="ph ph-spinner ph-spin"></i> Cerrando...
              } @else {
                <i class="ph ph-x-circle"></i> Cerrar Ticket
              }
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Reassign Modal -->
    @if (showReassignModal()) {
      <div class="modal-overlay" (click)="showReassignModal.set(false)">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>Reasignar Ticket #{{ ticket()!.id }}</h3>
            <button class="close-btn" (click)="showReassignModal.set(false)">
              <i class="ph ph-x"></i>
            </button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>Nuevo Agente *</label>
              <select [(ngModel)]="selectedAgentId" required>
                <option value="">Seleccionar agente...</option>
                @for (agent of availableAgents(); track agent.id) {
                  <option [value]="agent.id" [disabled]="agent.id === ticket()!.agentId">
                    {{ agent.firstName }} {{ agent.lastName }}
                    @if (agent.id === ticket()!.agentId) { (Actual) }
                  </option>
                }
              </select>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="showReassignModal.set(false)">Cancelar</button>
            <button class="btn btn-primary" (click)="reassignTicket()" [disabled]="!selectedAgentId || isReassigning()">
              @if (isReassigning()) {
                <i class="ph ph-spinner ph-spin"></i> Reasignando...
              } @else {
                <i class="ph ph-swap"></i> Reasignar
              }
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .ticket-detail-container { padding: 24px; }

    .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
    .header-left { display: flex; flex-direction: column; gap: 12px; }
    .back-link { display: flex; align-items: center; gap: 8px; color: var(--text-secondary); text-decoration: none; font-size: 14px; }
    .back-link:hover { color: var(--primary-color); }
    .header-content { display: flex; align-items: center; gap: 16px; }
    .header-content h1 { margin: 0; font-size: 24px; font-weight: 600; }
    .header-actions { display: flex; gap: 12px; }

    .btn { display: inline-flex; align-items: center; gap: 8px; padding: 10px 16px; border-radius: 8px; font-size: 14px; font-weight: 500; text-decoration: none; cursor: pointer; border: none; transition: all 0.2s; }
    .btn-primary { background: var(--primary-color); color: white; }
    .btn-primary:hover { background: var(--primary-hover); }
    .btn-outline { background: transparent; border: 1px solid var(--border-color); color: var(--text-primary); }
    .btn-outline:hover { border-color: var(--primary-color); color: var(--primary-color); }
    .btn-secondary { background: var(--bg-secondary); color: var(--text-primary); }
    .btn-danger { background: #ef4444; color: white; }
    .btn-danger:hover { background: #dc2626; }
    .btn-danger:disabled { background: #fca5a5; cursor: not-allowed; }
    .btn-text { background: none; border: none; color: var(--primary-color); cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 4px; }
    .btn-text:hover { text-decoration: underline; }

    .status-badge { display: inline-flex; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 500; }
    .status-badge.small { padding: 4px 10px; font-size: 12px; }
    .status-badge.open { background: #d1fae5; color: #065f46; }
    .status-badge.closed { background: #e5e7eb; color: #374151; }

    .close-type-badge { display: inline-flex; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 500; background: #dbeafe; color: #1e40af; }

    .ticket-content { display: grid; grid-template-columns: 1fr 360px; gap: 24px; }
    .main-section { display: flex; flex-direction: column; gap: 24px; }
    .side-section { display: flex; flex-direction: column; gap: 20px; }

    .info-card { background: white; border-radius: 12px; border: 1px solid var(--border-color); padding: 24px; }
    .info-card h2 { margin: 0 0 20px 0; font-size: 18px; font-weight: 600; }
    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .card-header h2 { margin: 0; }
    .view-all-link { display: flex; align-items: center; gap: 4px; color: var(--primary-color); text-decoration: none; font-size: 14px; }
    .view-all-link:hover { text-decoration: underline; }

    .info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
    .info-item { display: flex; flex-direction: column; gap: 6px; }
    .info-item.full-width { grid-column: 1 / -1; }
    .info-item label { font-size: 12px; color: var(--text-secondary); text-transform: uppercase; font-weight: 500; }
    .info-item span { font-size: 14px; color: var(--text-primary); }

    .messages-preview { display: flex; flex-direction: column; gap: 16px; max-height: 400px; overflow-y: auto; }
    .message-item { padding: 16px; background: var(--bg-secondary); border-radius: 10px; }
    .message-item.outgoing { background: #eff6ff; }
    .message-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .message-sender { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; color: var(--text-secondary); }
    .message-sender i { font-size: 14px; }
    .message-time { font-size: 12px; color: var(--text-tertiary); }
    .message-content { font-size: 14px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }

    .empty-messages { text-align: center; padding: 40px 20px; color: var(--text-secondary); }
    .empty-messages i { font-size: 48px; margin-bottom: 12px; opacity: 0.5; }
    .empty-messages p { margin: 0; }

    .side-card { background: white; border-radius: 12px; border: 1px solid var(--border-color); padding: 20px; }
    .side-card h3 { margin: 0 0 16px 0; font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
    .side-card h3 i { color: var(--primary-color); }

    .card-header-inline { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .card-header-inline h3 { margin: 0; }

    .person-info { display: flex; gap: 14px; align-items: flex-start; }
    .person-avatar { width: 48px; height: 48px; border-radius: 50%; background: var(--primary-color); color: white; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 600; flex-shrink: 0; }
    .person-avatar.agent { background: #8b5cf6; }
    .person-details { display: flex; flex-direction: column; gap: 6px; }
    .person-details .name { font-weight: 600; font-size: 15px; }
    .person-details .phone,
    .person-details .email { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-secondary); }
    .person-details i { font-size: 14px; }
    .no-data { color: var(--text-secondary); font-size: 14px; margin: 0; }

    .quick-actions { display: flex; flex-direction: column; gap: 10px; }
    .action-btn { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: var(--bg-secondary); border: none; border-radius: 8px; cursor: pointer; text-decoration: none; color: var(--text-primary); font-size: 14px; transition: all 0.2s; }
    .action-btn:hover { background: var(--bg-tertiary); color: var(--primary-color); }
    .action-btn i { font-size: 18px; }

    .not-found { text-align: center; padding: 80px 20px; }
    .not-found i { font-size: 64px; color: var(--text-tertiary); margin-bottom: 20px; }
    .not-found h2 { margin: 0 0 8px 0; }
    .not-found p { color: var(--text-secondary); margin: 0 0 24px 0; }

    /* Modals */
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .modal { background: white; border-radius: 16px; width: 100%; max-width: 480px; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
    .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 1px solid var(--border-color); }
    .modal-header h3 { margin: 0; font-size: 18px; }
    .close-btn { background: none; border: none; font-size: 20px; cursor: pointer; color: var(--text-secondary); padding: 4px; }
    .close-btn:hover { color: var(--text-primary); }
    .modal-body { padding: 24px; }
    .modal-footer { display: flex; justify-content: flex-end; gap: 12px; padding: 16px 24px; border-top: 1px solid var(--border-color); }

    .form-group { margin-bottom: 20px; }
    .form-group:last-child { margin-bottom: 0; }
    .form-group label { display: block; margin-bottom: 8px; font-size: 14px; font-weight: 500; }
    .form-group select,
    .form-group textarea { width: 100%; padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; font-size: 14px; font-family: inherit; }
    .form-group select:focus,
    .form-group textarea:focus { outline: none; border-color: var(--primary-color); }
    .form-group textarea { resize: vertical; }

    .ph-spin { animation: spin 1s linear infinite; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

    @media (max-width: 1024px) {
      .ticket-content { grid-template-columns: 1fr; }
      .info-grid { grid-template-columns: repeat(2, 1fr); }
    }

    @media (max-width: 640px) {
      .page-header { flex-direction: column; gap: 16px; }
      .header-actions { width: 100%; }
      .header-actions .btn { flex: 1; justify-content: center; }
      .info-grid { grid-template-columns: 1fr; }
    }
  `]
})
export class TicketDetailComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private ticketService = inject(TicketService);
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private destroy$ = new Subject<void>();

  // Data
  ticket = signal<Ticket | null>(null);
  closeTypes = signal<TicketCloseType[]>([]);
  availableAgents = signal<UserListItem[]>([]);
  isLoading = signal(false);

  // Modals
  showCloseModal = signal(false);
  showReassignModal = signal(false);

  // Form data
  selectedCloseType = '';
  closeNotes = '';
  selectedAgentId = '';

  // Loading states
  isClosing = signal(false);
  isReassigning = signal(false);

  // Enums for template
  TicketStatus = TicketStatus;
  MessageDirection = MessageDirection;

  ngOnInit(): void {
    const ticketId = this.route.snapshot.paramMap.get('id');
    if (ticketId) {
      this.loadTicket(parseInt(ticketId, 10));
      this.loadCloseTypes();
      this.loadAvailableAgents();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadTicket(id: number): void {
    this.isLoading.set(true);
    this.ticketService.getTicket(id).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (ticket) => {
        this.ticket.set(ticket);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading ticket:', err);
        this.toast.error('Error al cargar ticket');
        this.ticket.set(null);
        this.isLoading.set(false);
      }
    });
  }

  loadCloseTypes(): void {
    this.ticketService.getCloseTypes().pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (types) => this.closeTypes.set(types),
      error: () => {
        // Fallback close types
        this.closeTypes.set([
          { name: 'Con Acuerdo', kpiName: 'closed_con_acuerdo' },
          { name: 'Sin Acuerdo', kpiName: 'closed_sin_acuerdo' },
          { name: 'Transferido', kpiName: 'transferred' }
        ]);
      }
    });
  }

  loadAvailableAgents(): void {
    // Get internal users and filter for agents
    this.userService.getInternalUsers({ pageSize: 1000 }).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        const agentUsers = response.data.filter(u => u.role === UserRole.AGENT);
        this.availableAgents.set(agentUsers);
      },
      error: (err) => {
        console.error('Error loading agents:', err);
      }
    });
  }

  canCloseTicket(): boolean {
    const currentUser = this.authService.currentUser();
    if (!currentUser) return false;
    const ticket = this.ticket();
    if (!ticket) return false;

    // Can close if agent or manager/admin
    return currentUser.id === ticket.agentId ||
      [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER_LEVEL_1, UserRole.MANAGER_LEVEL_2, UserRole.MANAGER_LEVEL_3, UserRole.MANAGER_LEVEL_4].includes(currentUser.role);
  }

  canReassign(): boolean {
    const currentUser = this.authService.currentUser();
    if (!currentUser) return false;
    return [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER_LEVEL_1, UserRole.MANAGER_LEVEL_2, UserRole.MANAGER_LEVEL_3, UserRole.MANAGER_LEVEL_4].includes(currentUser.role);
  }

  closeTicket(): void {
    const ticket = this.ticket();
    if (!ticket || !this.selectedCloseType) return;

    this.isClosing.set(true);
    this.ticketService.closeTicketById(ticket.id, this.selectedCloseType, this.closeNotes).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.showCloseModal.set(false);
        this.toast.success('Ticket cerrado correctamente');
        this.loadTicket(ticket.id);
        this.isClosing.set(false);
        this.selectedCloseType = '';
        this.closeNotes = '';
      },
      error: (err) => {
        console.error('Error closing ticket:', err);
        this.toast.error('Error al cerrar ticket');
        this.isClosing.set(false);
      }
    });
  }

  reassignTicket(): void {
    const ticket = this.ticket();
    if (!ticket || !this.selectedAgentId) return;

    this.isReassigning.set(true);
    this.ticketService.reassignTicket({
      ticketId: ticket.id,
      newAgentId: parseInt(this.selectedAgentId, 10)
    }).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.showReassignModal.set(false);
        this.toast.success('Ticket reasignado correctamente');
        this.loadTicket(ticket.id);
        this.isReassigning.set(false);
        this.selectedAgentId = '';
      },
      error: (err) => {
        console.error('Error reassigning ticket:', err);
        this.toast.error('Error al reasignar ticket');
        this.isReassigning.set(false);
      }
    });
  }

  exportTicket(): void {
    const ticket = this.ticket();
    if (!ticket) return;
    this.ticketService.downloadTranscripts({ ticketIds: [ticket.id] });
  }

  getPreviewMessages() {
    const ticket = this.ticket();
    if (!ticket?.messages) return [];
    return ticket.messages.slice(0, 5); // Show first 5 messages
  }

  getStatusText(status: TicketStatus): string {
    return getTicketStatusText(status);
  }

  getCloseTypeDisplay(closeType: string | undefined): string {
    return getCloseTypeText(closeType);
  }

  getDuration(): string {
    const ticket = this.ticket();
    if (!ticket) return '-';
    const minutes = calculateDurationMinutes(ticket);
    return formatDuration(minutes);
  }

  getInitials(firstName: string, lastName: string): string {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  }

  formatDateTime(dateStr: string | undefined): string {
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
