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
 * Service to handle app updates in Electron environment.
 *
 * This service listens for update notifications from the main process
 * and provides methods to dismiss or download updates.
 */
@Injectable({
  providedIn: 'root'
})
export class UpdateService implements OnDestroy {
  private electronService = inject(ElectronService);

  /** Signal containing the available update info, or null if no update */
  updateAvailable = signal<UpdateInfo | null>(null);

  /** Signal indicating if the update banner was dismissed by user */
  dismissed = signal(false);

  /** Current app version */
  currentVersion = signal<string>('');

  private initialized = false;

  constructor() {
    this.initializeIfElectron();
  }

  ngOnDestroy(): void {
    // Clean up listeners if needed
    if (this.electronService.isElectron) {
      window.electronAPI?.removeAllListeners?.('update-available');
    }
  }

  private initializeIfElectron(): void {
    if (this.initialized || !this.electronService.isElectron) {
      return;
    }

    this.initialized = true;

    // Get current app version
    window.electronAPI?.getAppVersion?.().then(version => {
      this.currentVersion.set(version);
      console.log('[UpdateService] Current app version:', version);
    }).catch(err => {
      console.warn('[UpdateService] Could not get app version:', err);
    });

    // Listen for update available events from Electron main process
    window.electronAPI?.onUpdateAvailable?.((info: UpdateInfo) => {
      console.log('[UpdateService] Update available:', info);
      this.updateAvailable.set(info);
      this.dismissed.set(false);
    });
  }

  /**
   * Check if there's an update that should be shown (not dismissed)
   */
  shouldShowUpdate(): boolean {
    return this.updateAvailable() !== null && !this.dismissed();
  }

  /**
   * Check if the update is mandatory (cannot be dismissed)
   */
  isMandatory(): boolean {
    return this.updateAvailable()?.mandatory ?? false;
  }

  /**
   * Dismiss the update banner (only works for non-mandatory updates)
   */
  dismissUpdate(): void {
    if (!this.isMandatory()) {
      this.dismissed.set(true);
    }
  }

  /**
   * Open the download URL in the default browser
   */
  downloadUpdate(): void {
    const update = this.updateAvailable();
    if (update?.downloadUrl) {
      console.log('[UpdateService] Opening download URL:', update.downloadUrl);

      if (this.electronService.isElectron) {
        window.electronAPI?.openDownloadUrl?.(update.downloadUrl);
      } else {
        // Fallback for web - open in new tab
        window.open(update.downloadUrl, '_blank');
      }
    }
  }

  /**
   * Format file size for display
   */
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
