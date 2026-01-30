/**
 * Message Item Component
 * Displays a single message bubble
 * PARIDAD RAILS: app/views/admin/messages/_message.html.erb
 */
import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  Message,
  MessageDirection,
  MessageStatus,
  isIncoming,
  isOutgoing,
  hasMedia,
  getMediaType,
  isTemplate,
  hasFailed
} from '../../../../core/models/message.model';

@Component({
  selector: 'app-message-item',
  standalone: true,
  imports: [CommonModule],
  styleUrl: './message-item.component.scss',
  template: `
    <div
      class="message-item"
      [class.incoming]="isIncomingMessage()"
      [class.outgoing]="isOutgoingMessage()"
      [class.failed]="hasFailedStatus()"
      [class.template]="isTemplateMessage()"
    >
      <!-- PARIDAD RAILS: Outgoing avatar a la IZQUIERDA (primero en el DOM) -->
      @if (isOutgoingMessage()) {
        <div class="avatar outgoing-avatar">
          <i class="ph-fill ph-user"></i>
        </div>
      }

      <!-- Message Bubble -->
      <div class="message-bubble">
        <!-- Template Badge -->
        @if (isTemplateMessage()) {
          <div class="template-badge">
            <i class="ph ph-file-text"></i>
            Plantilla
          </div>
        }

        <!-- Media Content -->
        @if (hasMediaContent()) {
          <div class="media-content">
            @switch (mediaType()) {
              @case ('image') {
                <img
                  [src]="message().binaryContentUrl || message().binaryContentData"
                  [alt]="message().content || 'Imagen'"
                  class="media-image"
                  (click)="openMediaPreview()"
                />
              }
              @case ('video') {
                <video
                  [src]="message().binaryContentUrl"
                  class="media-video"
                  controls
                ></video>
              }
              @case ('audio') {
                <audio
                  [src]="message().binaryContentUrl"
                  class="media-audio"
                  controls
                ></audio>
              }
              @case ('document') {
                <a
                  [href]="message().binaryContentUrl"
                  class="media-document"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <i class="ph ph-file"></i>
                  <span>{{ getDocumentName() }}</span>
                  <i class="ph ph-download-simple"></i>
                </a>
              }
              @default {
                <div class="media-unknown">
                  <i class="ph ph-file-x"></i>
                  <span>Archivo no soportado</span>
                </div>
              }
            }
          </div>
        }

        <!-- Text Content (PARIDAD: Rails shows sender name + content) -->
        <div class="message-content">
          @if (message().historicSenderName) {
            <strong class="sender-name">{{ message().historicSenderName }}:</strong>
          }
          <span [innerHTML]="formatContent()"></span>
        </div>

        <!-- Footer -->
        <div class="message-footer">
          <span class="message-time">{{ formatTime() }}</span>

          <!-- Status for outgoing messages -->
          @if (isOutgoingMessage()) {
            <span class="message-status" [class]="getStatusClass()">
              @switch (message().status) {
                @case (MessageStatus.PENDING) {
                  <i class="ph ph-clock"></i>
                }
                @case (MessageStatus.SENT) {
                  <i class="ph ph-check"></i>
                }
                @case (MessageStatus.READ) {
                  <i class="ph ph-checks"></i>
                }
                @case (MessageStatus.ERROR) {
                  <i class="ph-fill ph-warning-circle"></i>
                }
                @case (MessageStatus.FAILED) {
                  <i class="ph-fill ph-x-circle"></i>
                }
                @default {
                  <i class="ph ph-check"></i>
                }
              }
            </span>
          }
        </div>

        <!-- Error message -->
        @if (hasFailedStatus() && message().errorMessage) {
          <div class="error-message">
            <i class="ph-fill ph-warning"></i>
            {{ message().errorMessage }}
          </div>
        }

        <!-- Retry button for failed messages -->
        @if (hasFailedStatus()) {
          <button class="retry-btn" (click)="onRetry()">
            <i class="ph ph-arrow-clockwise"></i>
            Reintentar
          </button>
        }
      </div>

      <!-- PARIDAD RAILS: Incoming avatar a la DERECHA (último en el DOM) -->
      @if (isIncomingMessage()) {
        <div class="avatar incoming-avatar">
          <i class="ph-fill ph-user"></i>
        </div>
      }
    </div>
  `
})
export class MessageItemComponent {
  // Inputs
  message = input.required<Message>();
  showAvatar = input(false);

  // Expose enum for template
  readonly MessageStatus = MessageStatus;

  isIncomingMessage(): boolean {
    return isIncoming(this.message());
  }

  isOutgoingMessage(): boolean {
    return isOutgoing(this.message());
  }

  hasMediaContent(): boolean {
    return hasMedia(this.message());
  }

  mediaType(): string {
    return getMediaType(this.message());
  }

  isTemplateMessage(): boolean {
    return isTemplate(this.message());
  }

  hasFailedStatus(): boolean {
    return hasFailed(this.message());
  }

  getStatusClass(): string {
    const status = this.message().status;
    switch (status) {
      case MessageStatus.PENDING: return 'status-pending';
      case MessageStatus.SENT: return 'status-sent';
      case MessageStatus.READ: return 'status-read';
      case MessageStatus.ERROR:
      case MessageStatus.FAILED: return 'status-failed';
      default: return 'status-sent';
    }
  }

  formatTime(): string {
    const date = new Date(this.message().createdAt);
    return date.toLocaleTimeString('es-PE', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatContent(): string {
    let content = this.message().content || '';

    // Convert URLs to links
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    content = content.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');

    // Convert newlines to <br>
    content = content.replace(/\n/g, '<br>');

    return content;
  }

  getDocumentName(): string {
    const url = this.message().binaryContentUrl || '';
    const name = url.split('/').pop() || 'Documento';
    return decodeURIComponent(name);
  }

  openMediaPreview(): void {
    // Could implement a lightbox/modal for image preview
    const url = this.message().binaryContentUrl || this.message().binaryContentData;
    if (url) {
      window.open(url, '_blank');
    }
  }

  onRetry(): void {
    // TODO: Implement retry logic via service
    console.log('Retry message:', this.message().id);
  }
}
