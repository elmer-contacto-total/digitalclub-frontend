/**
 * WebSocket Service using STOMP over native WebSocket
 * PARIDAD SPRING BOOT: WebSocketConfig.java (STOMP endpoint /websocket)
 *
 * Provides real-time messaging capabilities for chat functionality.
 */
import { Injectable, inject, signal, computed, OnDestroy } from '@angular/core';
import { Client, IMessage, StompSubscription } from '@stomp/stompjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { Message } from '../models/message.model';
import { Subject, Observable } from 'rxjs';

// ===== TYPES =====

export type WebSocketStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

/**
 * Message received via WebSocket
 */
export interface WsMessage {
  type: 'NEW_MESSAGE' | 'MESSAGE_READ' | 'TYPING' | 'ONLINE_STATUS' | 'TICKET_UPDATE' | 'ALERT' | 'CAPTURED_MEDIA' | 'CAPTURED_MEDIA_DELETED' | 'BULK_SEND_UPDATE';
  payload: unknown;
}

/**
 * New message payload
 */
export interface WsNewMessagePayload {
  message: Message;
  senderId: number;
  recipientId: number;
  ticketId?: number;
}

/**
 * Typing indicator payload
 */
export interface WsTypingPayload {
  userId: number;
  ticketId: number;
  isTyping: boolean;
}

/**
 * Online status payload
 */
export interface WsOnlineStatusPayload {
  userId: number;
  online: boolean;
  lastSeen?: string;
}

/**
 * Ticket update payload
 */
export interface WsTicketUpdatePayload {
  ticketId: number;
  action: 'created' | 'closed' | 'updated' | 'reassigned';
  agentId?: number;
}

/**
 * Alert payload
 */
export interface WsAlertPayload {
  id: number;
  alertType: string;
  title: string;
  body: string;
  severity: string;
}

/**
 * Captured media payload (from Electron via backend WebSocket)
 */
export interface WsCapturedMediaPayload {
  id: number;
  mediaUuid: string;
  agentId: number | null;
  clientUserId: number | null;
  mediaType: string;
  mimeType: string;
  publicUrl: string | null;
  filePath: string | null;
  sizeBytes: number | null;
  durationSeconds: number | null;
  capturedAt: string;
  messageSentAt: string | null;
  chatPhone: string | null;
  chatName: string | null;
  deleted?: boolean;
  deletedAt?: string | null;
}

/**
 * Bulk send update payload (from backend WebSocket broadcast)
 */
export interface WsBulkSendUpdatePayload {
  bulk_send_id: number;
  status: string;
  sent_count: number;
  failed_count: number;
  total_recipients: number;
  progress_percent: number;
}

@Injectable({
  providedIn: 'root'
})
export class WebSocketService implements OnDestroy {
  private authService = inject(AuthService);

  private stompClient: Client | null = null;
  private subscriptions: StompSubscription[] = [];
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private pendingBulkSendClientId: number | null = null;
  private bulkSendStompSub: StompSubscription | null = null;

  // State signals
  private _status = signal<WebSocketStatus>('disconnected');
  private _lastError = signal<string | null>(null);

  // Public signals
  readonly status = this._status.asReadonly();
  readonly lastError = this._lastError.asReadonly();
  readonly isConnected = computed(() => this._status() === 'connected');

  // Message subjects for different event types
  private messageSubject = new Subject<WsNewMessagePayload>();
  private typingSubject = new Subject<WsTypingPayload>();
  private onlineStatusSubject = new Subject<WsOnlineStatusPayload>();
  private ticketUpdateSubject = new Subject<WsTicketUpdatePayload>();
  private alertSubject = new Subject<WsAlertPayload>();
  private capturedMediaSubject = new Subject<WsCapturedMediaPayload>();
  private capturedMediaDeletedSubject = new Subject<WsCapturedMediaPayload>();
  private bulkSendUpdateSubject = new Subject<WsBulkSendUpdatePayload>();

  // Public observables
  readonly messages$ = this.messageSubject.asObservable();
  readonly typing$ = this.typingSubject.asObservable();
  readonly onlineStatus$ = this.onlineStatusSubject.asObservable();
  readonly ticketUpdates$ = this.ticketUpdateSubject.asObservable();
  readonly alerts$ = this.alertSubject.asObservable();
  readonly capturedMedia$ = this.capturedMediaSubject.asObservable();
  readonly capturedMediaDeleted$ = this.capturedMediaDeletedSubject.asObservable();
  readonly bulkSendUpdates$ = this.bulkSendUpdateSubject.asObservable();

  /**
   * Connect to WebSocket server
   */
  connect(): void {
    if (this.stompClient?.active) {
      return;
    }

    const token = this.authService.getToken();
    if (!token) {
      this._lastError.set('No authentication token available');
      return;
    }

    this._status.set('connecting');
    this._lastError.set(null);

    try {
      this.stompClient = new Client({
        // Native WebSocket (no SockJS fallback needed - runs in Electron/Chromium)
        brokerURL: `${environment.wsUrl}?token=${token}`,

        // Connection headers with auth token (sent at STOMP level after handshake)
        connectHeaders: {
          Authorization: `Bearer ${token}`
        },

        // Debug logging (disable in production)
        debug: (str) => {
          if (!environment.production) {
            console.log('[STOMP]', str);
          }
        },

        // Reconnection settings
        reconnectDelay: 5000,
        heartbeatIncoming: 4000,
        heartbeatOutgoing: 4000,

        // Connection handlers
        onConnect: () => this.onConnect(),
        onDisconnect: () => this.onDisconnect(),
        onStompError: (frame) => this.onStompError(frame),
        onWebSocketClose: (event) => this.onWebSocketClose(event),
        onWebSocketError: (event) => this.onWebSocketError(event)
      });

      this.stompClient.activate();
    } catch (error) {
      this._status.set('error');
      this._lastError.set('Failed to create WebSocket connection');
      console.error('WebSocket connection error:', error);
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.reconnectAttempts = 0;

    // Unsubscribe from all subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.subscriptions = [];

    if (this.stompClient) {
      this.stompClient.deactivate();
      this.stompClient = null;
    }

    this._status.set('disconnected');
  }

  /**
   * Subscribe to user-specific messages
   * PARIDAD SPRING BOOT: /user/{userId}/queue/messages
   */
  subscribeToUserMessages(userId: number): void {
    if (!this.stompClient?.active) {
      console.warn('Cannot subscribe: WebSocket not connected');
      return;
    }

    const sub = this.stompClient.subscribe(
      `/user/${userId}/queue/messages`,
      (message: IMessage) => this.handleMessage(message)
    );
    this.subscriptions.push(sub);
  }

  /**
   * Subscribe to ticket-specific messages
   * PARIDAD SPRING BOOT: /topic/ticket.{ticketId}
   */
  subscribeToTicket(ticketId: number): () => void {
    if (!this.stompClient?.active) {
      console.warn('Cannot subscribe: WebSocket not connected');
      return () => {};
    }

    const sub = this.stompClient.subscribe(
      `/topic/ticket.${ticketId}`,
      (message: IMessage) => this.handleMessage(message)
    );
    this.subscriptions.push(sub);

    // Return unsubscribe function
    return () => {
      sub.unsubscribe();
      const index = this.subscriptions.indexOf(sub);
      if (index > -1) {
        this.subscriptions.splice(index, 1);
      }
    };
  }

  /**
   * Subscribe to alerts for user
   * PARIDAD SPRING BOOT: /user/{userId}/queue/alerts
   */
  subscribeToAlerts(userId: number): void {
    if (!this.stompClient?.active) {
      console.warn('Cannot subscribe: WebSocket not connected');
      return;
    }

    const sub = this.stompClient.subscribe(
      `/user/${userId}/queue/alerts`,
      (message: IMessage) => {
        try {
          const payload = JSON.parse(message.body) as WsAlertPayload;
          this.alertSubject.next(payload);
        } catch (e) {
          console.error('Failed to parse alert message:', e);
        }
      }
    );
    this.subscriptions.push(sub);
  }

  /**
   * Subscribe to captured media notifications
   * Subscribes to both:
   * - /topic/captured_media (broadcast: any user viewing the conversation)
   * - /user/{userId}/queue/captured_media (personal: for the capturing agent)
   */
  subscribeToCapturedMedia(userId: number): void {
    if (!this.stompClient?.active) {
      console.warn('Cannot subscribe: WebSocket not connected');
      return;
    }

    const handler = (message: IMessage) => {
      try {
        const data = JSON.parse(message.body);
        const payload = (data.payload || data) as WsCapturedMediaPayload;
        if (data.type === 'CAPTURED_MEDIA_DELETED') {
          this.capturedMediaDeletedSubject.next(payload);
        } else {
          this.capturedMediaSubject.next(payload);
        }
      } catch (e) {
        console.error('Failed to parse captured media message:', e);
      }
    };

    // Topic subscription (broadcast to all connected users)
    const topicSub = this.stompClient.subscribe('/topic/captured_media', handler);
    this.subscriptions.push(topicSub);

    // Personal queue subscription (for the capturing agent in Electron)
    const userSub = this.stompClient.subscribe(
      `/user/${userId}/queue/captured_media`,
      handler
    );
    this.subscriptions.push(userSub);
  }

  /**
   * Subscribe to bulk send updates for a client.
   * Deferred: if not yet connected, stores the intent and subscribes in onConnect().
   */
  subscribeToBulkSendUpdates(clientId: number): () => void {
    this.pendingBulkSendClientId = clientId;

    if (this.stompClient?.connected) {
      this.doSubscribeBulkSend(clientId);
    }

    return () => {
      this.pendingBulkSendClientId = null;
      if (this.bulkSendStompSub) {
        this.bulkSendStompSub.unsubscribe();
        const index = this.subscriptions.indexOf(this.bulkSendStompSub);
        if (index > -1) this.subscriptions.splice(index, 1);
        this.bulkSendStompSub = null;
      }
    };
  }

  private doSubscribeBulkSend(clientId: number): void {
    if (this.bulkSendStompSub || !this.stompClient?.connected) return;

    const sub = this.stompClient.subscribe(
      `/topic/client.${clientId}.bulk_sends`,
      (message: IMessage) => {
        try {
          const data = JSON.parse(message.body);
          const payload = (data.data || data) as WsBulkSendUpdatePayload;
          this.bulkSendUpdateSubject.next(payload);
        } catch (e) {
          console.error('Failed to parse bulk send update:', e);
        }
      }
    );
    this.subscriptions.push(sub);
    this.bulkSendStompSub = sub;
  }

  /**
   * Send a chat message via WebSocket
   * PARIDAD SPRING BOOT: @MessageMapping("/chat.send")
   */
  sendMessage(recipientId: number, content: string, ticketId?: number): void {
    if (!this.stompClient?.active) {
      console.warn('Cannot send: WebSocket not connected');
      return;
    }

    this.stompClient.publish({
      destination: '/app/chat.send',
      body: JSON.stringify({
        recipientId,
        content,
        ticketId
      })
    });
  }

  /**
   * Send typing indicator
   * PARIDAD SPRING BOOT: @MessageMapping("/ticket.{ticketId}.typing")
   */
  sendTypingIndicator(ticketId: number, isTyping: boolean): void {
    if (!this.stompClient?.active) return;

    this.stompClient.publish({
      destination: `/app/ticket.${ticketId}.typing`,
      body: JSON.stringify({ isTyping })
    });
  }

  /**
   * Send message read receipt
   * PARIDAD SPRING BOOT: @MessageMapping("/message.read")
   */
  sendReadReceipt(messageId: number): void {
    if (!this.stompClient?.active) return;

    this.stompClient.publish({
      destination: '/app/message.read',
      body: JSON.stringify({ messageId })
    });
  }

  /**
   * Update online presence
   * PARIDAD SPRING BOOT: @MessageMapping("/presence")
   */
  sendPresenceUpdate(online: boolean): void {
    if (!this.stompClient?.active) return;

    this.stompClient.publish({
      destination: '/app/presence',
      body: JSON.stringify({ online })
    });
  }

  /**
   * Handle connection established
   */
  private onConnect(): void {
    this._status.set('connected');
    this.reconnectAttempts = 0;
    this._lastError.set(null);

    // Auto-subscribe to user messages, alerts, and captured media
    const user = this.authService.currentUser();
    if (user) {
      this.subscribeToUserMessages(user.id);
      this.subscribeToAlerts(user.id);
      this.subscribeToCapturedMedia(user.id);

      // Send online presence
      this.sendPresenceUpdate(true);
    }

    // Resubscribe to bulk send updates if requested before connection was ready
    this.bulkSendStompSub = null;
    if (this.pendingBulkSendClientId) {
      this.doSubscribeBulkSend(this.pendingBulkSendClientId);
    }

    console.log('[WebSocket] Connected to STOMP server');
  }

  /**
   * Handle disconnection
   */
  private onDisconnect(): void {
    this._status.set('disconnected');
    console.log('[WebSocket] Disconnected from STOMP server');
  }

  /**
   * Handle STOMP protocol error
   */
  private onStompError(frame: any): void {
    this._status.set('error');
    this._lastError.set(frame.headers?.message || 'STOMP protocol error');
    console.error('[WebSocket] STOMP error:', frame);
  }

  /**
   * Handle WebSocket close
   */
  private onWebSocketClose(event: CloseEvent): void {
    if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
      this._status.set('reconnecting');
      this.reconnectAttempts++;
      console.log(`[WebSocket] Reconnecting... attempt ${this.reconnectAttempts}`);
    }
  }

  /**
   * Handle WebSocket error
   */
  private onWebSocketError(event: Event): void {
    this._status.set('error');
    this._lastError.set('WebSocket connection error');
    console.error('[WebSocket] Error:', event);
  }

  /**
   * Handle incoming STOMP message
   */
  private handleMessage(message: IMessage): void {
    try {
      const data = JSON.parse(message.body) as WsMessage;

      switch (data.type) {
        case 'NEW_MESSAGE':
          this.messageSubject.next(data.payload as WsNewMessagePayload);
          break;

        case 'MESSAGE_READ':
          // Handle read receipt - could emit to subject if needed
          break;

        case 'TYPING':
          this.typingSubject.next(data.payload as WsTypingPayload);
          break;

        case 'ONLINE_STATUS':
          this.onlineStatusSubject.next(data.payload as WsOnlineStatusPayload);
          break;

        case 'TICKET_UPDATE':
          this.ticketUpdateSubject.next(data.payload as WsTicketUpdatePayload);
          break;

        case 'ALERT':
          this.alertSubject.next(data.payload as WsAlertPayload);
          break;

        case 'CAPTURED_MEDIA':
          this.capturedMediaSubject.next(data.payload as WsCapturedMediaPayload);
          break;

        case 'CAPTURED_MEDIA_DELETED':
          this.capturedMediaDeletedSubject.next(data.payload as WsCapturedMediaPayload);
          break;

        case 'BULK_SEND_UPDATE':
          this.bulkSendUpdateSubject.next(data.payload as WsBulkSendUpdatePayload);
          break;

        default:
          // For messages without type wrapper (direct message payload)
          if ((data as any).message || (data as any).content) {
            this.messageSubject.next(data as unknown as WsNewMessagePayload);
          }
      }
    } catch (error) {
      console.error('[WebSocket] Failed to parse message:', error);
    }
  }

  /**
   * Cleanup on service destroy
   */
  ngOnDestroy(): void {
    this.sendPresenceUpdate(false);
    this.disconnect();

    this.messageSubject.complete();
    this.typingSubject.complete();
    this.onlineStatusSubject.complete();
    this.ticketUpdateSubject.complete();
    this.alertSubject.complete();
    this.capturedMediaSubject.complete();
    this.capturedMediaDeletedSubject.complete();
    this.bulkSendUpdateSubject.complete();
  }
}
