/**
 * Message Input Component
 * Text input with attachments, canned messages, templates
 * PARIDAD RAILS: app/views/admin/messages/_message_input.html.erb
 */
import { Component, inject, signal, input, output, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, debounceTime } from 'rxjs';
import { ChatService } from '../../services/chat.service';
import { WebSocketService } from '../../../../core/services/websocket.service';
import { ToastService } from '../../../../core/services/toast.service';
import { Message, CreateMessageRequest } from '../../../../core/models/message.model';
import { ConversationCloseType } from '../../../../core/models/conversation.model';
import { CannedMessage, findByShortcut, filterActiveCannedMessages } from '../../../../core/models/canned-message.model';
import { TemplateSelectorItem } from '../../../../core/models/message-template.model';
import { TemplateSelectorComponent } from '../template-selector/template-selector.component';
import { CloseTicketModalComponent } from '../close-ticket-modal/close-ticket-modal.component';

@Component({
  selector: 'app-message-input',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TemplateSelectorComponent,
    CloseTicketModalComponent
  ],
  styleUrl: './message-input.component.scss',
  template: `
    <div class="message-input-container">
      <!-- Toolbar -->
      <div class="input-toolbar">
        <!-- Attachment Button -->
        <button
          class="toolbar-btn"
          title="Adjuntar archivo"
          (click)="fileInput.click()"
          [disabled]="!canSendFreeform()"
        >
          <i class="bi bi-paperclip"></i>
        </button>
        <input
          #fileInput
          type="file"
          class="hidden-input"
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
          (change)="onFileSelected($event)"
        />

        <!-- Canned Messages Button -->
        <button
          class="toolbar-btn"
          title="Respuestas rápidas"
          [class.active]="showCannedMessages()"
          (click)="toggleCannedMessages()"
        >
          <i class="bi bi-lightning"></i>
        </button>

        <!-- Template Button (only when freeform is not available) -->
        @if (!canSendFreeform()) {
          <button
            class="toolbar-btn primary"
            title="Enviar plantilla"
            (click)="showTemplateSelector.set(true)"
          >
            <i class="bi bi-file-text"></i>
            Plantillas
          </button>
        }
      </div>

      <!-- Main Input Area -->
      <div class="input-main">
        <!-- Text Input -->
        <div class="textarea-wrapper">
          <textarea
            #textareaRef
            class="message-textarea"
            [placeholder]="getPlaceholder()"
            [(ngModel)]="messageContent"
            (keydown)="onKeyDown($event)"
            (input)="onInput()"
            [disabled]="!canSendFreeform() || isSending()"
            rows="1"
          ></textarea>
        </div>

        <!-- Send Button -->
        <button
          class="send-btn"
          [disabled]="!canSend()"
          (click)="sendMessage()"
          title="Enviar mensaje"
        >
          @if (isSending()) {
            <div class="spinner-small"></div>
          } @else {
            <i class="bi bi-send-fill"></i>
          }
        </button>
      </div>

      <!-- Close Ticket Buttons (PARIDAD: _close_buttons.html.erb) -->
      @if (ticketId() && hasOpenTicket()) {
        <div class="close-buttons-bar">
          @if (closeTypes().length > 0) {
            <!-- Multiple close type buttons -->
            @for (closeType of closeTypes(); track closeType.kpiName) {
              <button
                class="close-type-btn"
                (click)="onQuickCloseTicket(closeType.kpiName)"
                [disabled]="isClosing()"
              >
                <i class="bi bi-check-circle"></i>
                Finalizar {{ closeType.name }}
              </button>
            }
          } @else {
            <!-- Single close button (fallback) - PARIDAD RAILS: "Finalizar" -->
            <button
              class="close-type-btn"
              (click)="showCloseTicketModal.set(true)"
              [disabled]="isClosing()"
            >
              <i class="bi bi-check-circle"></i>
              Finalizar
            </button>
          }
          <!-- Additional options -->
          <button
            class="close-options-btn"
            title="Más opciones"
            (click)="showCloseTicketModal.set(true)"
          >
            <i class="bi bi-three-dots"></i>
          </button>
        </div>
      }

      <!-- File Preview -->
      @if (selectedFile()) {
        <div class="file-preview">
          <div class="file-info">
            @if (isImageFile()) {
              <img [src]="filePreviewUrl()" alt="Preview" class="preview-image" />
            } @else {
              <i class="bi bi-file-earmark"></i>
            }
            <span class="file-name">{{ selectedFile()!.name }}</span>
            <span class="file-size">{{ formatFileSize(selectedFile()!.size) }}</span>
          </div>
          <button class="remove-file-btn" (click)="clearFile()">
            <i class="bi bi-x"></i>
          </button>
        </div>
      }

      <!-- Canned Messages Grid (PARIDAD RAILS: _canned_messages.html.erb)
           Buttons in rows of 3, below the input form -->
      @if (showCannedMessages() && cannedMessages().length > 0) {
        <div class="canned-messages-section">
          <div class="canned-messages-header">
            <span>Respuestas rápidas</span>
            <button class="close-canned-btn" (click)="showCannedMessages.set(false)">
              <i class="bi bi-x"></i>
            </button>
          </div>
          <div class="canned-messages-grid">
            @for (canned of cannedMessages(); track canned.id) {
              <button
                class="canned-message-btn"
                (click)="onCannedMessageSelected(canned)"
                [title]="canned.content"
              >
                {{ truncateMessage(canned.name || canned.content) }}
              </button>
            }
          </div>
        </div>
      }

      <!-- Template Selector Modal -->
      @if (showTemplateSelector()) {
        <app-template-selector
          [clientId]="clientId()"
          (select)="onTemplateSelected($event)"
          (close)="showTemplateSelector.set(false)"
        />
      }

      <!-- Close Ticket Modal -->
      @if (showCloseTicketModal()) {
        <app-close-ticket-modal
          [ticketId]="ticketId()!"
          [closeTypes]="closeTypes()"
          (close)="showCloseTicketModal.set(false)"
          (confirm)="onConfirmCloseTicket($event)"
        />
      }
    </div>
  `
})
export class MessageInputComponent implements OnInit, OnDestroy {
  @ViewChild('textareaRef') textareaRef!: ElementRef<HTMLTextAreaElement>;

  private chatService = inject(ChatService);
  private wsService = inject(WebSocketService);
  private toastService = inject(ToastService);
  private destroy$ = new Subject<void>();
  private typingSubject = new Subject<void>();

  // Inputs
  clientId = input.required<number>();
  ticketId = input<number>();
  canSendFreeform = input(true);
  closeTypes = input<ConversationCloseType[]>([]);

  // Outputs
  messageSent = output<Message>();
  ticketClosed = output<{ ticketId: number; closeType?: string; notes?: string }>();

  // Additional inputs
  hasOpenTicket = input(true);

  // State
  messageContent = '';
  cannedSearchTerm = '';
  isSending = signal(false);
  isClosing = signal(false);
  showCannedMessages = signal(false);
  showTemplateSelector = signal(false);
  showCloseTicketModal = signal(false);
  cannedMessages = signal<CannedMessage[]>([]);
  selectedFile = signal<File | null>(null);
  filePreviewUrl = signal<string | null>(null);

  ngOnInit(): void {
    // Load canned messages
    this.loadCannedMessages();

    // Setup typing indicator debounce
    this.typingSubject.pipe(
      debounceTime(500),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      const tid = this.ticketId();
      if (tid) {
        this.wsService.sendTypingIndicator(tid, true);
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.clearFile();
  }

  canSend(): boolean {
    if (this.isSending()) return false;
    if (!this.canSendFreeform()) return false;

    const hasContent = this.messageContent.trim().length > 0;
    const hasFile = this.selectedFile() !== null;

    return hasContent || hasFile;
  }

  getPlaceholder(): string {
    if (!this.canSendFreeform()) {
      return 'Solo puedes enviar plantillas (ventana de 24h expirada)';
    }
    return 'Escribe un mensaje...';
  }

  onKeyDown(event: KeyboardEvent): void {
    // Send on Enter (without Shift)
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (this.canSend()) {
        this.sendMessage();
      }
    }

    // Check for canned message shortcuts (starts with /)
    if (event.key === '/' && this.messageContent === '') {
      this.showCannedMessages.set(true);
    }
  }

  onInput(): void {
    // Auto-resize textarea
    this.autoResizeTextarea();

    // Check for canned message shortcut
    if (this.messageContent.startsWith('/')) {
      this.cannedSearchTerm = this.messageContent;
      this.showCannedMessages.set(true);
    } else {
      this.showCannedMessages.set(false);
    }

    // Send typing indicator
    this.typingSubject.next();
  }

  toggleCannedMessages(): void {
    this.showCannedMessages.update(v => !v);
  }

  onCannedMessageSelected(canned: CannedMessage): void {
    this.messageContent = canned.content;
    this.showCannedMessages.set(false);
    this.autoResizeTextarea();
    this.focusTextarea();
  }

  /**
   * Truncate canned message for button display
   * PARIDAD RAILS: .truncate(48)
   */
  truncateMessage(text: string): string {
    const maxLength = 48;
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  onTemplateSelected(template: { templateId: number; params: Record<number, string> }): void {
    this.showTemplateSelector.set(false);
    this.sendTemplateMessage(template.templateId, template.params);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];

      // Validate file size (max 16MB)
      if (file.size > 16 * 1024 * 1024) {
        this.toastService.error('El archivo es demasiado grande (máx. 16MB)');
        return;
      }

      this.selectedFile.set(file);

      // Create preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
          this.filePreviewUrl.set(reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    }
    input.value = ''; // Reset input
  }

  isImageFile(): boolean {
    const file = this.selectedFile();
    return file ? file.type.startsWith('image/') : false;
  }

  clearFile(): void {
    const url = this.filePreviewUrl();
    if (url) {
      URL.revokeObjectURL(url);
    }
    this.selectedFile.set(null);
    this.filePreviewUrl.set(null);
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  sendMessage(): void {
    if (!this.canSend()) return;

    const file = this.selectedFile();

    if (file) {
      this.sendMediaMessage(file);
    } else {
      this.sendTextMessage();
    }
  }

  onConfirmCloseTicket(data: { closeType?: string; notes?: string }): void {
    this.showCloseTicketModal.set(false);
    const tid = this.ticketId();
    if (tid) {
      this.ticketClosed.emit({ ticketId: tid, ...data });
    }
  }

  /**
   * Quick close ticket with a specific close type (inline buttons)
   * PARIDAD: _close_buttons.html.erb click handler
   */
  onQuickCloseTicket(kpiName: string): void {
    const tid = this.ticketId();
    if (!tid) return;

    this.isClosing.set(true);
    this.ticketClosed.emit({ ticketId: tid, closeType: kpiName });

    // Reset closing state after a delay (parent will handle actual API call)
    setTimeout(() => this.isClosing.set(false), 2000);
  }

  private sendTextMessage(): void {
    const content = this.messageContent.trim();
    if (!content) return;

    this.isSending.set(true);

    const request: CreateMessageRequest = {
      recipientId: this.clientId(),
      content
    };

    this.chatService.sendMessage(request).subscribe({
      next: (message) => {
        this.messageContent = '';
        this.autoResizeTextarea();
        this.isSending.set(false);
        this.messageSent.emit(message);
      },
      error: (err) => {
        console.error('Error sending message:', err);
        this.toastService.error('Error al enviar el mensaje');
        this.isSending.set(false);
      }
    });
  }

  private sendMediaMessage(file: File): void {
    this.isSending.set(true);
    const caption = this.messageContent.trim() || undefined;

    this.chatService.sendMediaMessage(this.clientId(), file, caption).subscribe({
      next: (message) => {
        this.messageContent = '';
        this.clearFile();
        this.isSending.set(false);
        this.messageSent.emit(message);
      },
      error: (err) => {
        console.error('Error sending media:', err);
        this.toastService.error('Error al enviar el archivo');
        this.isSending.set(false);
      }
    });
  }

  private sendTemplateMessage(templateId: number, params: Record<number, string>): void {
    this.isSending.set(true);

    // Convert params to TemplateParameter array format
    const parameters = Object.values(params).map(value => ({
      type: 'text' as const,
      text: value
    }));

    this.chatService.sendTemplateMessage({
      recipientId: this.clientId(),
      templateId,
      parameters
    }).subscribe({
      next: (message) => {
        this.isSending.set(false);
        this.messageSent.emit(message);
        this.toastService.success('Plantilla enviada');
      },
      error: (err) => {
        console.error('Error sending template:', err);
        this.toastService.error('Error al enviar la plantilla');
        this.isSending.set(false);
      }
    });
  }

  private loadCannedMessages(): void {
    this.chatService.getCannedMessages().subscribe({
      next: (messages) => {
        this.cannedMessages.set(filterActiveCannedMessages(messages));
      },
      error: (err) => {
        console.error('Error loading canned messages:', err);
      }
    });
  }

  private autoResizeTextarea(): void {
    setTimeout(() => {
      if (this.textareaRef?.nativeElement) {
        const textarea = this.textareaRef.nativeElement;
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
      }
    }, 0);
  }

  private focusTextarea(): void {
    setTimeout(() => {
      this.textareaRef?.nativeElement?.focus();
    }, 0);
  }
}
