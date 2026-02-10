/**
 * Captured Media Item Component
 * Displays a captured media (image/audio) as an incoming message bubble
 * Integrates seamlessly with the chat timeline
 */
import { Component, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CapturedMedia } from '../../../../core/models/conversation.model';
import { ImagePreviewComponent } from '../../../../shared/components/image-preview/image-preview.component';

@Component({
  selector: 'app-captured-media-item',
  standalone: true,
  imports: [CommonModule, ImagePreviewComponent],
  styleUrl: './captured-media-item.component.scss',
  template: `
    <div class="message-item incoming captured-media" [class.deleted-bubble]="media().deleted">
      <!-- Avatar (primero para alineación izquierda) -->
      <div class="avatar incoming-avatar">
        <i class="ph-fill ph-user"></i>
      </div>

      <!-- Message Bubble -->
      <div class="message-bubble" [class.deleted-bubble]="media().deleted">
        <!-- Captured Badge -->
        @if (media().deleted) {
          <div class="captured-badge deleted-badge">
            <i class="ph-fill ph-trash"></i>
            Mensaje Eliminado
          </div>
        } @else {
          <div class="captured-badge">
            <i class="ph-fill ph-camera"></i>
            Media Capturado
          </div>
        }

        <!-- Sender name -->
        @if (media().chatName) {
          <strong class="sender-name">{{ media().chatName }}:</strong>
        }

        <!-- Media Content -->
        <div class="media-content" [class.deleted-media]="media().deleted">
          @if (media().mediaType === 'image') {
            @if (media().publicUrl) {
              <img
                [src]="media().publicUrl"
                alt="Imagen capturada"
                class="media-image"
                (click)="openMediaPreview()"
                loading="lazy"
              />
            } @else {
              <div class="no-preview">
                <i class="ph-fill ph-image"></i>
                <span>Imagen sin URL</span>
              </div>
            }
          } @else if (media().mediaType === 'audio') {
            <div class="audio-player">
              <i class="ph-fill ph-speaker-high audio-icon"></i>
              @if (media().publicUrl) {
                <audio
                  [src]="media().publicUrl"
                  controls
                  preload="none"
                  class="media-audio"
                ></audio>
              } @else {
                <span class="no-preview">Audio sin URL</span>
              }
              @if (media().durationSeconds) {
                <span class="duration">{{ formatDuration(media().durationSeconds!) }}</span>
              }
            </div>
          }
        </div>

        <!-- Deleted info -->
        @if (media().deleted && media().deletedAt) {
          <div class="deleted-info">
            <i class="ph-fill ph-trash"></i>
            Eliminado: {{ formatDeletedTime() }}
          </div>
        }

        <!-- Footer -->
        <div class="message-footer">
          <span class="message-time">{{ formatTime() }}</span>
          <span class="capture-indicator">
            @if (media().deleted) {
              <i class="ph-fill ph-trash deleted-icon"></i>
            } @else {
              <i class="ph-fill ph-eye"></i>
            }
          </span>
        </div>
      </div>
    </div>

    <app-image-preview
      [imageUrl]="previewUrl()"
      (closed)="previewUrl.set(null)"
    />
  `
})
export class CapturedMediaItemComponent {
  previewUrl = signal<string | null>(null);
  media = input.required<CapturedMedia>();

  formatTime(): string {
    let dateStr = this.media().messageSentAt || this.media().capturedAt;
    if (!dateStr) return '';

    // Backend ya envía hora Lima sin timezone - no manipular offset
    const date = new Date(dateStr.replace(' ', 'T'));
    return date.toLocaleTimeString('es-PE', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatDeletedTime(): string {
    const dateStr = this.media().deletedAt;
    if (!dateStr) return '';

    const date = new Date(dateStr.replace(' ', 'T'));
    const time = date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    const day = date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
    return `${time} ${day}`;
  }

  formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  openMediaPreview(): void {
    const url = this.media().publicUrl;
    if (url) {
      this.previewUrl.set(url);
    }
  }
}
