import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UpdateService } from '../../../core/services/update.service';

/**
 * Banner component to notify users when an app update is available.
 *
 * Features:
 * - Shows when update is available and not dismissed
 * - Download button opens URL in browser
 * - Close button dismisses (only for non-mandatory updates)
 * - Displays version and file size
 */
@Component({
  selector: 'app-update-banner',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (showBanner()) {
      <div class="update-banner" [class.mandatory]="updateService.isMandatory()">
        <div class="update-banner-content">
          <div class="update-icon">
            <i class="ph ph-arrow-circle-up"></i>
          </div>
          <div class="update-info">
            <span class="update-title">Nueva versión disponible</span>
            <span class="update-details">
              Versión {{ update()?.version }}
              @if (fileSize()) {
                <span class="update-size">({{ fileSize() }})</span>
              }
            </span>
          </div>
          <div class="update-actions">
            <button class="btn-download" (click)="download()">
              <i class="ph ph-download-simple"></i>
              Descargar
            </button>
            @if (!updateService.isMandatory()) {
              <button class="btn-close" (click)="dismiss()" aria-label="Cerrar">
                <i class="ph ph-x"></i>
              </button>
            }
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .update-banner {
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
      color: white;
      padding: 0.75rem 1rem;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      z-index: 1000;
    }

    .update-banner.mandatory {
      background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
    }

    .update-banner-content {
      display: flex;
      align-items: center;
      gap: 1rem;
      max-width: 1200px;
      width: 100%;
    }

    .update-icon {
      font-size: 1.5rem;
      display: flex;
      align-items: center;
    }

    .update-info {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
      flex: 1;
    }

    .update-title {
      font-weight: 600;
      font-size: 0.9375rem;
    }

    .update-details {
      font-size: 0.8125rem;
      opacity: 0.9;
    }

    .update-size {
      opacity: 0.8;
    }

    .update-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .btn-download {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.5rem 1rem;
      background: rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 0.375rem;
      color: white;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.2s, border-color 0.2s;
    }

    .btn-download:hover {
      background: rgba(255, 255, 255, 0.3);
      border-color: rgba(255, 255, 255, 0.5);
    }

    .btn-download:active {
      background: rgba(255, 255, 255, 0.4);
    }

    .btn-close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 2rem;
      height: 2rem;
      background: transparent;
      border: none;
      border-radius: 0.25rem;
      color: white;
      font-size: 1.25rem;
      cursor: pointer;
      opacity: 0.8;
      transition: opacity 0.2s, background-color 0.2s;
    }

    .btn-close:hover {
      opacity: 1;
      background: rgba(255, 255, 255, 0.1);
    }

    @media (max-width: 640px) {
      .update-banner {
        padding: 0.625rem 0.75rem;
      }

      .update-banner-content {
        gap: 0.75rem;
      }

      .update-icon {
        font-size: 1.25rem;
      }

      .update-title {
        font-size: 0.875rem;
      }

      .update-details {
        font-size: 0.75rem;
      }

      .btn-download {
        padding: 0.375rem 0.75rem;
        font-size: 0.8125rem;
      }
    }
  `]
})
export class UpdateBannerComponent {
  updateService = inject(UpdateService);

  update = computed(() => this.updateService.updateAvailable());

  showBanner = computed(() => this.updateService.shouldShowUpdate());

  fileSize = computed(() => {
    const size = this.update()?.fileSize;
    return size ? this.updateService.formatFileSize(size) : null;
  });

  download(): void {
    this.updateService.downloadUpdate();
  }

  dismiss(): void {
    this.updateService.dismissUpdate();
  }
}
