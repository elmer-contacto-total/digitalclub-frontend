import { Component, inject, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UpdateService } from '../../../core/services/update.service';
import { ElectronService } from '../../../core/services/electron.service';

@Component({
  selector: 'app-update-banner',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (showDialog()) {
      <div class="update-overlay" [class.mandatory]="updateService.isMandatory()">
        <div class="update-dialog">
          <!-- Icon -->
          <div class="update-icon-container">
            @if (status() === 'error') {
              <i class="ph ph-warning-circle"></i>
            } @else if (isDownloading()) {
              <i class="ph ph-arrow-circle-down"></i>
            } @else {
              <i class="ph ph-rocket-launch"></i>
            }
          </div>

          <!-- Title -->
          <h2 class="update-title">
            @if (status() === 'error') {
              Error de actualización
            } @else if (status() === 'installing') {
              Instalando...
            } @else if (isDownloading()) {
              Descargando actualización
            } @else {
              Nueva versión disponible
            }
          </h2>

          <!-- Info -->
          @if (!isDownloading() && status() !== 'error') {
            <p class="update-version">
              v{{ update()?.version }}
              @if (fileSize()) {
                &nbsp;&middot;&nbsp;{{ fileSize() }}
              }
            </p>
            @if (update()?.releaseNotes) {
              <p class="update-notes">{{ update()?.releaseNotes }}</p>
            }
          }

          <!-- Progress bar -->
          @if (isDownloading()) {
            <div class="progress-container">
              <div class="progress-bar">
                <div class="progress-fill" [style.width.%]="percent()"></div>
              </div>
              <span class="progress-text">{{ percent() }}%</span>
            </div>
            @if (status() === 'installing') {
              <p class="update-hint">La aplicación se reiniciará automáticamente</p>
            }
          }

          <!-- Error -->
          @if (status() === 'error') {
            <p class="update-error">{{ updateService.downloadError() }}</p>
          }

          <!-- Actions -->
          <div class="update-actions">
            @if (status() === 'idle' || status() === 'error') {
              <button class="btn-update" (click)="startUpdate()">
                @if (status() === 'error') {
                  Reintentar
                } @else {
                  Actualizar ahora
                }
              </button>
              @if (!updateService.isMandatory()) {
                <button class="btn-later" (click)="dismiss()">Más tarde</button>
              }
            }
          </div>

          <!-- Mandatory label -->
          @if (updateService.isMandatory() && !isDownloading()) {
            <p class="mandatory-hint">Esta actualización es obligatoria</p>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .update-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      backdrop-filter: blur(4px);
    }

    .update-dialog {
      background: var(--card-bg, #1c1c1e);
      border: 1px solid var(--card-border, #2c2c2e);
      border-radius: 16px;
      padding: 2rem 2.5rem;
      text-align: center;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
    }

    .update-icon-container {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: var(--accent-subtle, #1a3a2a);
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1.25rem;
    }

    .update-icon-container i {
      font-size: 28px;
      color: var(--accent-default, #22c55e);
    }

    .mandatory .update-icon-container {
      background: var(--error-subtle, #3a1a1a);
    }

    .mandatory .update-icon-container i {
      color: var(--error-default, #ef4444);
    }

    .update-title {
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--fg-default, #fafafa);
      margin: 0 0 0.5rem;
    }

    .update-version {
      font-size: 0.9375rem;
      color: var(--fg-muted, #a1a1aa);
      margin: 0 0 0.25rem;
    }

    .update-notes {
      font-size: 0.8125rem;
      color: var(--fg-subtle, #71717a);
      margin: 0.5rem 0 0;
      line-height: 1.5;
    }

    .progress-container {
      margin: 1.25rem 0 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .progress-bar {
      flex: 1;
      height: 8px;
      background: var(--bg-muted, #27272a);
      border-radius: 4px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: var(--accent-default, #22c55e);
      border-radius: 4px;
      transition: width 0.3s ease;
    }

    .progress-text {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--fg-muted, #a1a1aa);
      min-width: 3rem;
      text-align: right;
    }

    .update-hint {
      font-size: 0.75rem;
      color: var(--fg-subtle, #71717a);
      margin: 0;
    }

    .update-error {
      font-size: 0.8125rem;
      color: var(--error-default, #ef4444);
      margin: 0.75rem 0 0;
    }

    .update-actions {
      margin-top: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.625rem;
    }

    .btn-update {
      width: 100%;
      padding: 0.75rem 1.5rem;
      background: var(--accent-default, #22c55e);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 0.9375rem;
      font-weight: 600;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .btn-update:hover {
      background: var(--accent-emphasis, #16a34a);
    }

    .mandatory .btn-update {
      background: var(--error-default, #ef4444);
    }

    .mandatory .btn-update:hover {
      background: #dc2626;
    }

    .btn-later {
      width: 100%;
      padding: 0.625rem 1.5rem;
      background: transparent;
      color: var(--fg-muted, #a1a1aa);
      border: 1px solid var(--border-default, #3f3f46);
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-later:hover {
      background: var(--bg-muted, #27272a);
      color: var(--fg-default, #fafafa);
    }

    .mandatory-hint {
      margin: 1rem 0 0;
      font-size: 0.75rem;
      color: var(--error-default, #ef4444);
      font-weight: 500;
    }
  `]
})
export class UpdateBannerComponent {
  updateService = inject(UpdateService);
  private electronService = inject(ElectronService);

  constructor() {
    // Hide WhatsApp BrowserView when update dialog is shown (it renders above web content)
    effect(() => {
      const visible = this.showDialog();
      this.electronService.setWhatsAppOverlayMode(visible);
    });
  }

  update = computed(() => this.updateService.updateAvailable());
  status = computed(() => this.updateService.downloadStatus());
  percent = computed(() => this.updateService.downloadPercent());

  showDialog = computed(() => this.updateService.shouldShowUpdate());

  isDownloading = computed(() => {
    const s = this.status();
    return s === 'starting' || s === 'downloading' || s === 'installing';
  });

  fileSize = computed(() => {
    const size = this.update()?.fileSize;
    return size ? this.updateService.formatFileSize(size) : null;
  });

  startUpdate(): void {
    this.updateService.startUpdate();
  }

  dismiss(): void {
    this.updateService.dismissUpdate();
  }
}
