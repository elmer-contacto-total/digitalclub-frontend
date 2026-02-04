/**
 * Captured Media Item Component
 * Displays a captured media (image/audio) as an incoming message bubble
 * Integrates seamlessly with the chat timeline
 */
import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CapturedMedia } from '../../../../core/models/conversation.model';

@Component({
  selector: 'app-captured-media-item',
  standalone: true,
  imports: [CommonModule],
  styleUrl: './captured-media-item.component.scss',
  template: `
    <div class="message-item incoming captured-media">
      <!-- Avatar (primero para alineación izquierda) -->
      <div class="avatar incoming-avatar">
        <i class="ph-fill ph-user"></i>
      </div>

      <!-- Message Bubble -->
      <div class="message-bubble">
        <!-- Captured Badge -->
        <div class="captured-badge">
          <i class="ph-fill ph-camera"></i>
          Media Capturado
        </div>

        <!-- Media Content -->
        <div class="media-content">
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

        <!-- Footer -->
        <div class="message-footer">
          <span class="message-time">{{ formatTime() }}</span>
          <span class="capture-indicator">
            <i class="ph-fill ph-eye"></i>
          </span>
        </div>
      </div>
    </div>
  `
})
export class CapturedMediaItemComponent {
  media = input.required<CapturedMedia>();

  formatTime(): string {
    const dateStr = this.media().messageSentAt || this.media().capturedAt;
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleTimeString('es-PE', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  openMediaPreview(): void {
    const url = this.media().publicUrl;
    if (url) {
      window.open(url, '_blank');
    }
  }
}
