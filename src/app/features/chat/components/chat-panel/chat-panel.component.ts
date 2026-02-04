/**
 * Chat Panel Component
 * Main chat area with header, messages, and input
 * PARIDAD RAILS: app/views/admin/messages/_chat_panel.html.erb
 */
import { Component, inject, signal, computed, input, output, OnInit, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { ChatService } from '../../services/chat.service';
import { WebSocketService } from '../../../../core/services/websocket.service';
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

        <!-- Captured Media Gallery -->
        @if (capturedMedia().length > 0) {
          <div class="captured-media-section">
            <button class="media-toggle-btn" (click)="toggleMediaGallery()">
              <i class="ph-fill" [class.ph-caret-down]="showMediaGallery()" [class.ph-caret-right]="!showMediaGallery()"></i>
              <i class="ph-fill ph-images"></i>
              <span>Medios Capturados ({{ capturedMedia().length }})</span>
              <span class="media-counts">
                @if (capturedImages().length > 0) {
                  <span class="count-badge images">
                    <i class="ph-fill ph-image"></i> {{ capturedImages().length }}
                  </span>
                }
                @if (capturedAudios().length > 0) {
                  <span class="count-badge audios">
                    <i class="ph-fill ph-speaker-high"></i> {{ capturedAudios().length }}
                  </span>
                }
              </span>
            </button>

            @if (showMediaGallery()) {
              <div class="media-gallery">
                <!-- Images Section -->
                @if (capturedImages().length > 0) {
                  <div class="media-group">
                    <h4><i class="ph-fill ph-image"></i> Imágenes</h4>
                    <div class="images-grid">
                      @for (media of capturedImages(); track media.id) {
                        <div class="media-item image-item" (click)="openMediaViewer(media)">
                          @if (media.publicUrl) {
                            <img [src]="media.publicUrl" [alt]="'Imagen capturada'" loading="lazy" />
                          } @else {
                            <div class="no-preview">
                              <i class="ph-fill ph-image"></i>
                              <span>Sin URL</span>
                            </div>
                          }
                          <div class="media-overlay">
                            <span class="media-date">{{ formatMediaDate(media.messageSentAt || media.capturedAt) }}</span>
                          </div>
                        </div>
                      }
                    </div>
                  </div>
                }

                <!-- Audios Section -->
                @if (capturedAudios().length > 0) {
                  <div class="media-group">
                    <h4><i class="ph-fill ph-speaker-high"></i> Audios</h4>
                    <div class="audios-list">
                      @for (media of capturedAudios(); track media.id) {
                        <div class="media-item audio-item">
                          <div class="audio-info">
                            <i class="ph-fill ph-speaker-high"></i>
                            <span class="audio-duration">
                              @if (media.durationSeconds) {
                                {{ formatDuration(media.durationSeconds) }}
                              } @else {
                                --:--
                              }
                            </span>
                            <span class="audio-date">{{ formatMediaDate(media.messageSentAt || media.capturedAt) }}</span>
                          </div>
                          @if (media.publicUrl) {
                            <audio controls [src]="media.publicUrl" preload="none"></audio>
                          } @else {
                            <span class="no-preview">Sin URL</span>
                          }
                        </div>
                      }
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        }

        <!-- Messages -->
        <app-message-list
          [messages]="messages()"
          [clientId]="clientId()"
          [isTyping]="isTyping()"
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
  showMediaGallery = signal(false);
  private typingTimeout: any;
  private ticketUnsubscribe: (() => void) | null = null;
  private notificationSound: HTMLAudioElement | null = null;

  // Computed signals for captured media
  capturedMedia = computed(() => this.conversationDetail()?.capturedMedia || []);
  capturedImages = computed(() => this.capturedMedia().filter(m => m.mediaType === 'image'));
  capturedAudios = computed(() => this.capturedMedia().filter(m => m.mediaType === 'audio'));

  constructor() {
    // Update messages when conversation detail changes
    effect(() => {
      const detail = this.conversationDetail();
      if (detail) {
        this.messages.set(detail.messages || []);
        this.subscribeToTicket(detail.ticket?.id);
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
    // Implement pagination for messages
    // This would load older messages
  }

  onMessageSent(message: Message): void {
    // Add optimistic update
    this.messages.update(msgs => [...msgs, message]);
    this.messageSent.emit();
  }

  onCloseTicket(event: { ticketId: number; closeType?: string; notes?: string }): void {
    this.closeTicket.emit(event);
  }

  toggleMediaGallery(): void {
    this.showMediaGallery.update(v => !v);
  }

  openMediaViewer(media: CapturedMedia): void {
    if (media.publicUrl) {
      window.open(media.publicUrl, '_blank');
    }
  }

  formatMediaDate(dateStr: string | null): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
