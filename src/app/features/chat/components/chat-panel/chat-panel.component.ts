/**
 * Chat Panel Component
 * Main chat area with header, messages, and input
 * PARIDAD RAILS: app/views/admin/messages/_chat_panel.html.erb
 */
import { Component, inject, signal, input, output, OnInit, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { ChatService } from '../../services/chat.service';
import { WebSocketService, WsCapturedMediaPayload } from '../../../../core/services/websocket.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ConversationDetail, CapturedMedia } from '../../../../core/models/conversation.model';
import { Message } from '../../../../core/models/message.model';
import { ChatHeaderComponent } from '../chat-header/chat-header.component';
import { MessageListComponent } from '../message-list/message-list.component';
import { MessageInputComponent } from '../message-input/message-input.component';

@Component({
  selector: 'app-chat-panel',
  standalone: true,
  imports: [
    CommonModule,
    ChatHeaderComponent,
    MessageListComponent,
    MessageInputComponent
  ],
  styleUrl: './chat-panel.component.scss',
  template: `
    <div class="chat-panel">
      @if (isLoading()) {
        <div class="loading-overlay">
          <div class="spinner"></div>
          <span>Cargando conversación...</span>
        </div>
      } @else if (conversationDetail()) {
        <!-- Header -->
        <app-chat-header
          [client]="conversationDetail()!.client"
          [agent]="conversationDetail()!.agent"
          [ticket]="conversationDetail()!.ticket"
          [crmFields]="conversationDetail()!.crmFields || []"
          [customFields]="conversationDetail()!.customFields || {}"
          [closeTypes]="conversationDetail()!.closeTypes || []"
          [canSendFreeform]="conversationDetail()!.canSendFreeform"
          [isWhatsappBusiness]="conversationDetail()!.isWhatsappBusiness"
          (closeTicket)="onCloseTicket($event)"
        />

        <!-- Messages (includes captured media in timeline) -->
        <app-message-list
          [messages]="messages()"
          [capturedMedia]="capturedMedia()"
          [clientId]="clientId()"
          [isTyping]="isTyping()"
          [isLoadingMore]="isLoadingMore()"
          [hasMore]="hasMoreMessages()"
          (loadMore)="loadMoreMessages()"
        />

        <!-- Input -->
        <app-message-input
          [clientId]="clientId()"
          [ticketId]="conversationDetail()?.ticket?.id"
          [canSendFreeform]="conversationDetail()!.canSendFreeform"
          [closeTypes]="conversationDetail()!.closeTypes || []"
          (messageSent)="onMessageSent($event)"
          (ticketClosed)="onCloseTicket($event)"
        />
      } @else {
        <div class="error-state">
          <i class="ph-fill ph-warning-circle"></i>
          <p>No se pudo cargar la conversación</p>
        </div>
      }
    </div>
  `
})
export class ChatPanelComponent implements OnInit, OnDestroy {
  private chatService = inject(ChatService);
  private wsService = inject(WebSocketService);
  private authService = inject(AuthService);
  private destroy$ = new Subject<void>();

  // Inputs
  clientId = input.required<number>();
  conversationDetail = input<ConversationDetail | null>(null);
  isLoading = input(false);

  // Outputs
  closeTicket = output<{ ticketId: number; closeType?: string; notes?: string }>();
  messageSent = output<void>();

  // Local state
  messages = signal<Message[]>([]);
  isTyping = signal(false);
  private typingTimeout: any;
  private ticketUnsubscribe: (() => void) | null = null;
  private notificationSound: HTMLAudioElement | null = null;

  // Mutable signal for captured media (REST + WebSocket updates)
  capturedMedia = signal<CapturedMedia[]>([]);

  // Pagination state for loading older messages
  currentMessagesPage = signal(0);
  hasMoreMessages = signal(true);
  isLoadingMore = signal(false);

  constructor() {
    // Update messages and captured media when conversation detail changes
    effect(() => {
      const detail = this.conversationDetail();
      if (detail) {
        this.messages.set(detail.messages || []);
        this.capturedMedia.set(detail.capturedMedia || []);
        this.subscribeToTicket(detail.ticket?.id);
        // Reset pagination state for new conversation
        this.currentMessagesPage.set(detail.messagesPage ?? 0);
        this.hasMoreMessages.set(detail.messagesHasMore ?? false);
        this.isLoadingMore.set(false);
      }
    }, { allowSignalWrites: true });
  }

  ngOnInit(): void {
    // Initialize notification sound (PARIDAD: Rails HTML audio element)
    this.initNotificationSound();

    // Listen for new messages via WebSocket
    this.wsService.messages$.pipe(takeUntil(this.destroy$)).subscribe(payload => {
      if (payload.recipientId === this.clientId() || payload.senderId === this.clientId()) {
        this.messages.update(msgs => [...msgs, payload.message]);
        this.messageSent.emit();

        // Play notification sound for incoming messages
        const currentUserId = this.authService.currentUser()?.id;
        if (payload.senderId !== currentUserId) {
          this.playNotificationSound();
        }
      }
    });

    // Listen for captured media via WebSocket (real-time from Electron)
    this.wsService.capturedMedia$.pipe(takeUntil(this.destroy$)).subscribe(payload => {
      // Only add media that belongs to the current conversation's client
      if (payload.clientUserId === this.clientId()) {
        const media: CapturedMedia = {
          id: payload.id,
          mediaUuid: payload.mediaUuid,
          mediaType: payload.mediaType?.toLowerCase() as 'image' | 'audio',
          mimeType: payload.mimeType,
          publicUrl: payload.publicUrl,
          filePath: payload.filePath,
          sizeBytes: payload.sizeBytes,
          durationSeconds: payload.durationSeconds,
          capturedAt: payload.capturedAt,
          messageSentAt: payload.messageSentAt,
          chatPhone: payload.chatPhone,
          chatName: payload.chatName,
          deleted: payload.deleted,
          deletedAt: payload.deletedAt
        };
        // Deduplicate by id and append
        this.capturedMedia.update(existing => {
          if (existing.some(m => m.id === media.id)) {
            return existing;
          }
          return [...existing, media];
        });
      }
    });

    // Listen for captured media deletions via WebSocket
    this.wsService.capturedMediaDeleted$.pipe(takeUntil(this.destroy$)).subscribe(payload => {
      if (payload.clientUserId === this.clientId()) {
        this.capturedMedia.update(existing =>
          existing.map(m => m.id === payload.id ? { ...m, deleted: true, deletedAt: payload.deletedAt } : m)
        );
      }
    });

    // Listen for typing indicators
    this.wsService.typing$.pipe(takeUntil(this.destroy$)).subscribe(payload => {
      const detail = this.conversationDetail();
      if (detail?.ticket?.id === payload.ticketId) {
        this.isTyping.set(payload.isTyping);

        // Auto-clear typing after 3 seconds
        if (payload.isTyping) {
          clearTimeout(this.typingTimeout);
          this.typingTimeout = setTimeout(() => {
            this.isTyping.set(false);
          }, 3000);
        }
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    clearTimeout(this.typingTimeout);

    if (this.ticketUnsubscribe) {
      this.ticketUnsubscribe();
    }
  }

  loadMoreMessages(): void {
    if (this.isLoadingMore() || !this.hasMoreMessages()) return;
    this.isLoadingMore.set(true);
    const nextPage = this.currentMessagesPage() + 1;

    this.chatService.loadOlderMessages(this.clientId(), nextPage)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          // Prepend older messages before current ones
          this.messages.update(current => [...result.messages, ...current]);
          this.currentMessagesPage.set(nextPage);
          this.hasMoreMessages.set(result.hasMore);
          this.isLoadingMore.set(false);
        },
        error: () => {
          this.isLoadingMore.set(false);
        }
      });
  }

  onMessageSent(message: Message): void {
    // Add optimistic update
    this.messages.update(msgs => [...msgs, message]);
    this.messageSent.emit();
  }

  onCloseTicket(event: { ticketId: number; closeType?: string; notes?: string }): void {
    this.closeTicket.emit(event);
  }

  private subscribeToTicket(ticketId?: number): void {
    // Unsubscribe from previous ticket
    if (this.ticketUnsubscribe) {
      this.ticketUnsubscribe();
      this.ticketUnsubscribe = null;
    }

    // Subscribe to new ticket
    if (ticketId) {
      this.ticketUnsubscribe = this.wsService.subscribeToTicket(ticketId);
    }
  }

  /**
   * Initialize notification sound
   * PARIDAD: Rails uses HTML audio element for message notifications
   */
  private initNotificationSound(): void {
    try {
      // Use a data URI for a simple notification sound (beep)
      // This avoids needing an external audio file
      this.notificationSound = new Audio();
      // Short beep notification sound as base64 (WAV format)
      this.notificationSound.src = 'data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU' +
        'tvT19/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/' +
        'f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/' +
        'f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/' +
        'f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/';
      this.notificationSound.volume = 0.5;
      this.notificationSound.load();
    } catch (e) {
      console.warn('Could not initialize notification sound:', e);
    }
  }

  /**
   * Play notification sound for incoming messages
   */
  private playNotificationSound(): void {
    if (this.notificationSound) {
      try {
        // Reset to beginning if already playing
        this.notificationSound.currentTime = 0;
        this.notificationSound.play().catch(e => {
          // Browsers may block autoplay, silently ignore
          console.debug('Notification sound blocked by browser:', e);
        });
      } catch (e) {
        console.debug('Error playing notification sound:', e);
      }
    }
  }
}
