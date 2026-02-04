/**
 * Message List Component
 * Displays list of messages in a conversation
 * PARIDAD RAILS: app/views/admin/messages/_messages.html.erb
 */
import {
  Component,
  input,
  output,
  signal,
  effect,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnChanges,
  SimpleChanges
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Message, MessageDirection, isIncoming, isOutgoing } from '../../../../core/models/message.model';
import { CapturedMedia } from '../../../../core/models/conversation.model';
import { MessageItemComponent } from '../message-item/message-item.component';
import { CapturedMediaItemComponent } from '../captured-media-item/captured-media-item.component';

// Union type for timeline items (messages + captured media)
export interface TimelineItem {
  type: 'message' | 'captured_media';
  timestamp: Date;
  data: Message | CapturedMedia;
}

interface TimelineGroup {
  date: string;
  items: TimelineItem[];
}

@Component({
  selector: 'app-message-list',
  standalone: true,
  imports: [CommonModule, MessageItemComponent, CapturedMediaItemComponent],
  styleUrl: './message-list.component.scss',
  template: `
    <div class="message-list" #scrollContainer (scroll)="onScroll($event)">
      @if (timelineGroups().length === 0) {
        <div class="empty-state">
          <i class="ph ph-chat-text"></i>
          <p>No hay mensajes en esta conversación</p>
        </div>
      } @else {
        @for (group of timelineGroups(); track group.date) {
          <div class="message-group">
            <!-- Date Separator -->
            <div class="date-separator">
              <span class="date-label">{{ formatDateLabel(group.date) }}</span>
            </div>

            <!-- Timeline Items (Messages + Captured Media) -->
            @for (item of group.items; track trackTimelineItem(item, $index)) {
              @if (item.type === 'message') {
                <app-message-item
                  [message]="asMessage(item.data)"
                  [showAvatar]="shouldShowAvatarForItem(item, $index, group.items)"
                />
              } @else {
                <app-captured-media-item
                  [media]="asCapturedMedia(item.data)"
                />
              }
            }
          </div>
        }

        <!-- Typing Indicator -->
        @if (isTyping()) {
          <div class="typing-indicator">
            <div class="typing-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <span class="typing-text">Escribiendo...</span>
          </div>
        }
      }
    </div>
  `
})
export class MessageListComponent implements AfterViewInit {
  @ViewChild('scrollContainer') scrollContainer!: ElementRef<HTMLDivElement>;

  // Inputs
  messages = input<Message[]>([]);
  capturedMedia = input<CapturedMedia[]>([]);
  clientId = input<number>(0);
  isTyping = input(false);

  // Outputs
  loadMore = output<void>();

  // Computed
  timelineGroups = signal<TimelineGroup[]>([]);

  private autoScrollEnabled = true;
  private lastItemCount = 0;

  constructor() {
    // Group timeline items by date when messages or capturedMedia change
    effect(() => {
      const msgs = this.messages();
      const media = this.capturedMedia();
      this.timelineGroups.set(this.groupTimelineByDate(msgs, media));

      // Auto-scroll to bottom on new items
      const totalItems = msgs.length + media.length;
      if (totalItems > this.lastItemCount && this.autoScrollEnabled) {
        setTimeout(() => this.scrollToBottom(), 100);
      }
      this.lastItemCount = totalItems;
    }, { allowSignalWrites: true });
  }

  ngAfterViewInit(): void {
    // Initial scroll to bottom
    setTimeout(() => this.scrollToBottom(), 100);
  }

  onScroll(event: Event): void {
    const target = event.target as HTMLElement;

    // Check if user scrolled near top for loading more messages
    if (target.scrollTop < 50) {
      this.loadMore.emit();
    }

    // Check if user is near bottom for auto-scroll
    const threshold = 100;
    const atBottom = target.scrollHeight - target.scrollTop - target.clientHeight < threshold;
    this.autoScrollEnabled = atBottom;
  }

  // Type guard helpers for template
  asMessage(data: Message | CapturedMedia): Message {
    return data as Message;
  }

  asCapturedMedia(data: Message | CapturedMedia): CapturedMedia {
    return data as CapturedMedia;
  }

  trackTimelineItem(item: TimelineItem, index: number): string {
    if (item.type === 'message') {
      return `msg-${(item.data as Message).id}`;
    }
    return `media-${(item.data as CapturedMedia).id}`;
  }

  shouldShowAvatarForItem(item: TimelineItem, index: number, groupItems: TimelineItem[]): boolean {
    // Only for messages
    if (item.type !== 'message') return false;
    const message = item.data as Message;

    // Show avatar for incoming messages when:
    // 1. It's the first item in the group, OR
    // 2. Previous item was different type or from different sender
    if (!isIncoming(message)) return false;
    if (index === 0) return true;

    const prevItem = groupItems[index - 1];
    if (prevItem.type !== 'message') return true;

    const prevMessage = prevItem.data as Message;
    return prevMessage.direction !== message.direction;
  }

  formatDateLabel(dateStr: string): string {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const isToday = date.toDateString() === today.toDateString();
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isToday) return 'Hoy';
    if (isYesterday) return 'Ayer';

    return date.toLocaleDateString('es-PE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
    });
  }

  private groupTimelineByDate(messages: Message[], capturedMedia: CapturedMedia[]): TimelineGroup[] {
    const groups: Map<string, TimelineItem[]> = new Map();

    // Add messages to timeline
    messages.forEach(message => {
      const timestamp = new Date(message.createdAt);
      const dateKey = timestamp.toDateString();
      const existing = groups.get(dateKey) || [];
      groups.set(dateKey, [...existing, {
        type: 'message' as const,
        timestamp,
        data: message
      }]);
    });

    // Add captured media to timeline
    capturedMedia.forEach(media => {
      const timestamp = new Date(media.messageSentAt || media.capturedAt);
      const dateKey = timestamp.toDateString();
      const existing = groups.get(dateKey) || [];
      groups.set(dateKey, [...existing, {
        type: 'captured_media' as const,
        timestamp,
        data: media
      }]);
    });

    // Sort items within each group by timestamp
    return Array.from(groups.entries()).map(([date, items]) => ({
      date,
      items: items.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    })).sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }

  private scrollToBottom(): void {
    if (this.scrollContainer?.nativeElement) {
      const element = this.scrollContainer.nativeElement;
      element.scrollTop = element.scrollHeight;
    }
  }
}
