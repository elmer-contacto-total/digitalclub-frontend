import { Component, input, output, HostListener } from '@angular/core';

@Component({
  selector: 'app-image-preview',
  standalone: true,
  template: `
    @if (imageUrl()) {
      <div class="image-preview-backdrop" (click)="onBackdropClick($event)">
        <button class="close-btn" (click)="close()" aria-label="Cerrar">
          <i class="ph ph-x"></i>
        </button>
        <img
          [src]="imageUrl()"
          alt="Vista previa"
          class="preview-image"
          (click)="$event.stopPropagation()"
        />
      </div>
    }
  `,
  styles: [`
    .image-preview-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.85);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      cursor: pointer;
    }

    .preview-image {
      max-width: 90vw;
      max-height: 90vh;
      object-fit: contain;
      border-radius: 4px;
      cursor: default;
      box-shadow: 0 4px 30px rgba(0, 0, 0, 0.5);
    }

    .close-btn {
      position: absolute;
      top: 16px;
      right: 16px;
      background: rgba(255, 255, 255, 0.15);
      border: none;
      color: white;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      font-size: 20px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
      z-index: 1;
    }

    .close-btn:hover {
      background: rgba(255, 255, 255, 0.3);
    }
  `]
})
export class ImagePreviewComponent {
  imageUrl = input<string | null>(null);
  closed = output<void>();

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.imageUrl()) {
      this.close();
    }
  }

  close(): void {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }
}
