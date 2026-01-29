import {
  Component,
  input,
  output,
  signal,
  effect,
  ElementRef,
  inject,
  HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './modal.component.html',
  styleUrl: './modal.component.scss'
})
export class ModalComponent {
  private elementRef = inject(ElementRef);

  // Inputs
  isOpen = input<boolean>(false);
  title = input<string>('');
  size = input<ModalSize>('md');
  closable = input<boolean>(true);
  closeOnBackdrop = input<boolean>(true);
  closeOnEscape = input<boolean>(true);
  showFooter = input<boolean>(true);

  // Outputs
  closed = output<void>();
  confirmed = output<void>();

  // Internal state
  isVisible = signal(false);
  isAnimating = signal(false);

  constructor() {
    // Sync isOpen input with internal visibility
    effect(() => {
      const open = this.isOpen();
      if (open) {
        this.open();
      } else {
        this.close();
      }
    });
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.isOpen() && this.closeOnEscape() && this.closable()) {
      this.close();
    }
  }

  open(): void {
    this.isVisible.set(true);
    this.isAnimating.set(true);
    document.body.style.overflow = 'hidden';

    setTimeout(() => {
      this.isAnimating.set(false);
    }, 200);
  }

  close(): void {
    if (!this.closable()) return;

    this.isAnimating.set(true);

    setTimeout(() => {
      this.isVisible.set(false);
      this.isAnimating.set(false);
      document.body.style.overflow = '';
      this.closed.emit();
    }, 200);
  }

  onBackdropClick(event: MouseEvent): void {
    if (
      this.closeOnBackdrop() &&
      this.closable() &&
      event.target === event.currentTarget
    ) {
      this.close();
    }
  }

  onConfirm(): void {
    this.confirmed.emit();
  }

  getSizeClass(): string {
    const sizes: Record<ModalSize, string> = {
      sm: 'modal-sm',
      md: 'modal-md',
      lg: 'modal-lg',
      xl: 'modal-xl',
      full: 'modal-full'
    };
    return sizes[this.size()];
  }
}
