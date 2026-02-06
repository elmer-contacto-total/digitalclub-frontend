import { Injectable, signal, inject, OnDestroy } from '@angular/core';
import { ElectronService } from './electron.service';

/**
 * Information about an available update
 */
export interface UpdateInfo {
  version: string;
  downloadUrl: string;
  releaseNotes: string | null;
  fileSize: number | null;
  mandatory: boolean;
  publishedAt: string;
}

/**
 * Download progress state
 */
export type DownloadStatus = 'idle' | 'starting' | 'downloading' | 'installing' | 'error';

@Injectable({
  providedIn: 'root'
})
export class UpdateService implements OnDestroy {
  private electronService = inject(ElectronService);

  /** Available update info, or null */
  updateAvailable = signal<UpdateInfo | null>(null);

  /** Whether the update dialog was dismissed by user */
  dismissed = signal(false);

  /** Current app version */
  currentVersion = signal<string>('');

  /** Download status */
  downloadStatus = signal<DownloadStatus>('idle');

  /** Download progress (0-100) */
  downloadPercent = signal(0);

  /** Download error message */
  downloadError = signal<string | null>(null);

  private initialized = false;

  constructor() {
    this.initializeIfElectron();
  }

  ngOnDestroy(): void {
    if (this.electronService.isElectron) {
      window.electronAPI?.removeAllListeners?.('update-available');
      window.electronAPI?.removeAllListeners?.('update-download-progress');
    }
  }

  private initializeIfElectron(): void {
    if (this.initialized || !this.electronService.isElectron) return;
    this.initialized = true;

    window.electronAPI?.getAppVersion?.().then((version: string) => {
      this.currentVersion.set(version);
      console.log('[UpdateService] Current app version:', version);
    }).catch(() => {});

    // Listen for push events
    window.electronAPI?.onUpdateAvailable?.((info: UpdateInfo) => {
      console.log('[UpdateService] Update available (push):', info);
      this.updateAvailable.set(info);
      this.dismissed.set(false);
    });

    // Pull pending update (in case we missed the push)
    window.electronAPI?.getPendingUpdate?.().then((info: UpdateInfo | null) => {
      if (info && !this.updateAvailable()) {
        console.log('[UpdateService] Update available (pull):', info);
        this.updateAvailable.set(info);
        this.dismissed.set(false);
      }
    }).catch(() => {});

    // Listen for download progress
    window.electronAPI?.onUpdateDownloadProgress?.((data: { status: string; percent?: number; error?: string }) => {
      this.downloadStatus.set(data.status as DownloadStatus);
      if (data.percent !== undefined) {
        this.downloadPercent.set(data.percent);
      }
      if (data.error) {
        this.downloadError.set(data.error);
      }
    });
  }

  shouldShowUpdate(): boolean {
    return this.updateAvailable() !== null && !this.dismissed();
  }

  isMandatory(): boolean {
    return this.updateAvailable()?.mandatory ?? false;
  }

  dismissUpdate(): void {
    if (!this.isMandatory()) {
      this.dismissed.set(true);
    }
  }

  /**
   * Start downloading and installing the update
   */
  startUpdate(): void {
    const update = this.updateAvailable();
    if (!update?.downloadUrl) return;

    this.downloadStatus.set('starting');
    this.downloadPercent.set(0);
    this.downloadError.set(null);

    if (this.electronService.isElectron) {
      window.electronAPI?.downloadAndInstallUpdate?.(update.downloadUrl);
    } else {
      window.open(update.downloadUrl, '_blank');
    }
  }

  formatFileSize(bytes: number | null): string {
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let unitIndex = 0;
    let size = bytes;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
}
