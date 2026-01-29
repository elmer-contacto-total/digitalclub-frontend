/**
 * Chat Layout Component
 * Main 2-column layout for chat functionality
 * PARIDAD RAILS: app/views/admin/users/_clients_chat_view.html.erb
 */
import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { WebSocketService } from '../../core/services/websocket.service';
import { ChatService } from './services/chat.service';
import { TicketService } from './services/ticket.service';
import { ConversationListComponent } from './components/conversation-list/conversation-list.component';
import { ChatPanelComponent } from './components/chat-panel/chat-panel.component';
import { ConversationListItem, ConversationDetail, ChatViewType } from '../../core/models/conversation.model';

@Component({
  selector: 'app-chat-layout',
  standalone: true,
  imports: [
    CommonModule,
    ConversationListComponent,
    ChatPanelComponent
  ],
  template: `
    <!-- PARIDAD RAILS: _clients_chat_view.html.erb - 2 column layout -->
    <div class="chat-layout">
      <!-- Left Panel: Conversation List (col-lg-5) -->
      <div class="chat-sidebar">
        <app-conversation-list
          [viewType]="viewType()"
          [selectedClientId]="selectedClientId()"
          (clientSelected)="onClientSelected($event)"
          (viewTypeChanged)="onViewTypeChanged($event)"
        />
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
          <!-- PARIDAD RAILS: chat-placeholder in _clients_chat_view.html.erb -->
          <div class="chat-placeholder">
            <div class="placeholder-content">
              <i class="bi bi-chat-text"></i>
              <p>Seleccione un cliente para ver mensajes</p>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    /* PARIDAD RAILS: 2-column layout from _clients_chat_view.html.erb
     * - Left: col-lg-5 (DataTable with clients)
     * - Right: col-lg-6 (Chat panel)
     */
    .chat-layout {
      display: flex;
      height: calc(100vh - 60px);
      background-color: var(--bg-secondary, #f5f5f5);
    }

    /* Left panel: ~40% width (col-lg-5 equivalent) */
    .chat-sidebar {
      width: 42%;
      min-width: 320px;
      max-width: 500px;
      background: white;
      border-right: 1px solid var(--border-color, #dee2e6);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* Right panel: flex-1 (col-lg-6 equivalent) */
    .chat-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      background: white;
    }

    /* Placeholder when no client selected */
    .chat-placeholder {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg-light, #f8f9fa);

      .placeholder-content {
        text-align: center;
        color: var(--text-muted, #6c757d);

        i {
          font-size: 48px;
          margin-bottom: 12px;
          opacity: 0.5;
        }

        p {
          margin: 0;
          font-size: 14px;
        }
      }
    }

    /* Responsive: stack on mobile */
    @media (max-width: 768px) {
      .chat-layout {
        flex-direction: column;
      }

      .chat-sidebar {
        width: 100%;
        max-width: none;
        height: 45vh;
        border-right: none;
        border-bottom: 1px solid var(--border-color, #dee2e6);
      }

      .chat-main {
        flex: 1;
      }
    }
  `]
})
export class ChatLayoutComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);
  private wsService = inject(WebSocketService);
  private chatService = inject(ChatService);
  private ticketService = inject(TicketService);
  private destroy$ = new Subject<void>();

  // State
  viewType = signal<ChatViewType>('clients');
  selectedClientId = signal<number | null>(null);
  conversationDetail = signal<ConversationDetail | null>(null);
  isLoadingConversation = signal(false);

  // User context
  readonly currentUser = this.authService.currentUser;
  readonly isAdmin = this.authService.isAdmin;

  ngOnInit(): void {
    // Connect WebSocket
    this.wsService.connect();

    // Handle route params
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const clientId = params['clientId'];
      if (clientId) {
        this.selectClient(parseInt(clientId, 10));
      }
    });

    // Handle query params for view type
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      if (params['view'] === 'prospects') {
        this.viewType.set('prospects');
      }
    });

    // Listen for new messages via WebSocket
    this.wsService.messages$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      // If message is for current conversation, it will be handled by chat panel
      // Here we just refresh the conversation list
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onClientSelected(client: ConversationListItem): void {
    this.selectClient(client.id);
    // Update URL
    this.router.navigate(['/app/chat', client.id], {
      queryParams: this.viewType() === 'prospects' ? { view: 'prospects' } : {}
    });
  }

  onViewTypeChanged(viewType: ChatViewType): void {
    this.viewType.set(viewType);
    this.selectedClientId.set(null);
    this.conversationDetail.set(null);
    this.router.navigate(['/app/chat'], {
      queryParams: viewType === 'prospects' ? { view: 'prospects' } : {}
    });
  }

  onCloseTicket(event: { ticketId: number; closeType?: string; notes?: string }): void {
    this.ticketService.closeTicketById(event.ticketId, event.closeType, event.notes)
      .subscribe({
        next: () => {
          // Reload conversation to get updated ticket state
          const clientId = this.selectedClientId();
          if (clientId) {
            this.loadConversationDetail(clientId);
          }
        },
        error: (err) => {
          console.error('Error closing ticket:', err);
        }
      });
  }

  onMessageSent(): void {
    // Conversation detail will be updated via the chat panel component
    // Here we could refresh the conversation list if needed
  }

  private selectClient(clientId: number): void {
    this.selectedClientId.set(clientId);
    this.loadConversationDetail(clientId);
  }

  private loadConversationDetail(clientId: number): void {
    this.isLoadingConversation.set(true);
    this.chatService.getConversationDetail(clientId, this.viewType()).subscribe({
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
