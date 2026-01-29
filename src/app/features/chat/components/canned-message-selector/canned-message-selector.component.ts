/**
 * Canned Message Selector Component
 * Dropdown for quick reply selection
 * PARIDAD RAILS: app/views/admin/messages/_canned_messages_dropdown.html.erb
 */
import { Component, input, output, computed, signal, ElementRef, HostListener, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CannedMessage, getTruncatedContent, sortCannedMessagesByName } from '../../../../core/models/canned-message.model';

@Component({
  selector: 'app-canned-message-selector',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="canned-selector">
      <div class="selector-header">
        <span>Respuestas Rápidas</span>
        <button class="close-btn" (click)="close.emit()">
          <i class="bi bi-x"></i>
        </button>
      </div>

      <div class="selector-content">
        @if (filteredMessages().length === 0) {
          <div class="empty-state">
            <p>No hay respuestas disponibles</p>
          </div>
        } @else {
          @for (message of filteredMessages(); track message.id; let idx = $index) {
            <div
              class="canned-item"
              [class.highlighted]="highlightedIndex() === idx"
              (click)="selectMessage(message)"
              (mouseenter)="highlightedIndex.set(idx)"
            >
              <div class="item-header">
                <span class="item-name">{{ message.name }}</span>
                @if (message.shortcut) {
                  <span class="item-shortcut">/{{ message.shortcut }}</span>
                }
              </div>
              <div class="item-content">{{ getTruncated(message.content) }}</div>
            </div>
          }
        }
      </div>

      <div class="selector-footer">
        <span class="hint">
          <kbd>↑</kbd><kbd>↓</kbd> navegar
          <kbd>Enter</kbd> seleccionar
          <kbd>Esc</kbd> cerrar
        </span>
      </div>
    </div>
  `,
  styles: [`
    .canned-selector {
      position: absolute;
      bottom: 100%;
      left: 0;
      right: 0;
      margin-bottom: 8px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      overflow: hidden;
      max-height: 300px;
      display: flex;
      flex-direction: column;
      z-index: 100;
    }

    .selector-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color, #e0e0e0);
      background: var(--bg-secondary, #f5f5f5);

      span {
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        color: var(--text-secondary, #666);
        letter-spacing: 0.5px;
      }

      .close-btn {
        width: 24px;
        height: 24px;
        border: none;
        background: transparent;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-secondary, #666);

        &:hover {
          background: rgba(0, 0, 0, 0.1);
        }
      }
    }

    .selector-content {
      flex: 1;
      overflow-y: auto;
      max-height: 200px;
    }

    .canned-item {
      padding: 10px 16px;
      cursor: pointer;
      transition: background 0.15s;

      &:hover,
      &.highlighted {
        background: var(--primary-light, #e8f5e9);
      }
    }

    .item-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2px;
    }

    .item-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary, #333);
    }

    .item-shortcut {
      font-size: 11px;
      color: var(--primary-color, #25d366);
      font-family: monospace;
      background: var(--primary-light, #e8f5e9);
      padding: 2px 6px;
      border-radius: 4px;
    }

    .item-content {
      font-size: 12px;
      color: var(--text-secondary, #666);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .empty-state {
      padding: 24px;
      text-align: center;
      color: var(--text-secondary, #666);

      p {
        margin: 0;
        font-size: 13px;
      }
    }

    .selector-footer {
      padding: 8px 16px;
      border-top: 1px solid var(--border-color, #e0e0e0);
      background: var(--bg-secondary, #f5f5f5);
    }

    .hint {
      font-size: 11px;
      color: var(--text-muted, #999);

      kbd {
        display: inline-block;
        padding: 2px 6px;
        background: white;
        border: 1px solid var(--border-color, #e0e0e0);
        border-radius: 4px;
        font-family: monospace;
        font-size: 10px;
        margin: 0 2px;
      }
    }
  `]
})
export class CannedMessageSelectorComponent implements OnInit {
  private elementRef = inject(ElementRef);

  // Inputs
  cannedMessages = input<CannedMessage[]>([]);
  searchTerm = input<string>('');

  // Outputs
  select = output<CannedMessage>();
  close = output<void>();

  // State
  highlightedIndex = signal(0);

  // Computed filtered messages
  filteredMessages = computed(() => {
    let messages = this.cannedMessages();
    const term = this.searchTerm().toLowerCase().replace(/^\//, '').trim();

    if (term) {
      messages = messages.filter(m =>
        m.name.toLowerCase().includes(term) ||
        m.shortcut?.toLowerCase().includes(term) ||
        m.content.toLowerCase().includes(term)
      );
    }

    return sortCannedMessagesByName(messages);
  });

  ngOnInit(): void {
    this.highlightedIndex.set(0);
  }

  @HostListener('document:keydown', ['$event'])
  handleKeydown(event: KeyboardEvent): void {
    const messages = this.filteredMessages();
    const currentIndex = this.highlightedIndex();

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.highlightedIndex.set(Math.min(currentIndex + 1, messages.length - 1));
        break;

      case 'ArrowUp':
        event.preventDefault();
        this.highlightedIndex.set(Math.max(currentIndex - 1, 0));
        break;

      case 'Enter':
        event.preventDefault();
        if (messages[currentIndex]) {
          this.selectMessage(messages[currentIndex]);
        }
        break;

      case 'Escape':
        event.preventDefault();
        this.close.emit();
        break;
    }
  }

  selectMessage(message: CannedMessage): void {
    this.select.emit(message);
  }

  getTruncated(content: string): string {
    return getTruncatedContent(content, 60);
  }
}
