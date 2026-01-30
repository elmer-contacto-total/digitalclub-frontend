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
import { MessageItemComponent } from '../message-item/message-item.component';

interface MessageGroup {
  date: string;
  messages: Message[];
}

@Component({
  selector: 'app-message-list',
  standalone: true,
  imports: [CommonModule, MessageItemComponent],
  styleUrl: './message-list.component.scss',
  template: `
    <div class="message-list" #scrollContainer (scroll)="onScroll($event)">
      @if (messageGroups().length === 0) {
        <div class="empty-state">
          <i class="ph ph-chat-text"></i>
          <p>No hay mensajes en esta conversación</p>
        </div>
      } @else {
        @for (group of messageGroups(); track group.date) {
          <div class="message-group">
            <!-- Date Separator -->
            <div class="date-separator">
              <span class="date-label">{{ formatDateLabel(group.date) }}</span>
            </div>

            <!-- Messages -->
            @for (message of group.messages; track message.id) {
              <app-message-item
                [message]="message"
                [showAvatar]="shouldShowAvatar(message, $index, group.messages)"
              />
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
  clientId = input<number>(0);
  isTyping = input(false);

  // Outputs
  loadMore = output<void>();

  // Computed
  messageGroups = signal<MessageGroup[]>([]);

  private autoScrollEnabled = true;
  private lastMessageCount = 0;

  constructor() {
    // Group messages by date when messages change
    effect(() => {
      const msgs = this.messages();
      this.messageGroups.set(this.groupMessagesByDate(msgs));

      // Auto-scroll to bottom on new messages
      if (msgs.length > this.lastMessageCount && this.autoScrollEnabled) {
        setTimeout(() => this.scrollToBottom(), 100);
      }
      this.lastMessageCount = msgs.length;
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

  shouldShowAvatar(message: Message, index: number, groupMessages: Message[]): boolean {
    // Show avatar for incoming messages when:
    // 1. It's the first message in the group, OR
    // 2. Previous message was from a different sender
    if (!isIncoming(message)) return false;
    if (index === 0) return true;

    const prevMessage = groupMessages[index - 1];
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

  private groupMessagesByDate(messages: Message[]): MessageGroup[] {
    const groups: Map<string, Message[]> = new Map();

    messages.forEach(message => {
      const dateKey = new Date(message.createdAt).toDateString();
      const existing = groups.get(dateKey) || [];
      groups.set(dateKey, [...existing, message]);
    });

    return Array.from(groups.entries()).map(([date, msgs]) => ({
      date,
      messages: msgs.sort((a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )
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
