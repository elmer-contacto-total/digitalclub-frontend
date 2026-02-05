import { BrowserWindow, shell } from 'electron';

/**
 * Update information returned from the API
 */
export interface UpdateInfo {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion?: {
    version: string;
    downloadUrl: string;
    platform: string;
    releaseNotes: string | null;
    fileSize: number | null;
    mandatory: boolean;
    publishedAt: string;
  };
  message?: string;
}

/**
 * Configuration for the update checker
 */
interface UpdateCheckerConfig {
  apiBaseUrl: string;
  platform: string;
}

// Default configuration - uses the same base URL as media API
const DEFAULT_CONFIG: UpdateCheckerConfig = {
  apiBaseUrl: process.env.API_BASE_URL || 'http://digitalclub.contactototal.com.pe',
  platform: 'windows'
};

/**
 * Check for available updates
 *
 * @param currentVersion The current version of the app (e.g., "1.0.0")
 * @param config Optional configuration override
 * @returns UpdateInfo object with update details
 */
export async function checkForUpdates(
  currentVersion: string,
  config: Partial<UpdateCheckerConfig> = {}
): Promise<UpdateInfo | null> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  const url = `${finalConfig.apiBaseUrl}/api/v1/app/version/check?currentVersion=${encodeURIComponent(currentVersion)}&platform=${encodeURIComponent(finalConfig.platform)}`;

  console.log('[HablaPe Update] Checking for updates:', url);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      // Timeout after 10 seconds
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      console.warn('[HablaPe Update] Server returned error:', response.status);
      return null;
    }

    const data: UpdateInfo = await response.json();
    console.log('[HablaPe Update] Response:', data);

    return data;
  } catch (error) {
    console.error('[HablaPe Update] Error checking for updates:', error);
    return null;
  }
}

/**
 * Notify the main window that an update is available
 *
 * @param mainWindow The main BrowserWindow instance
 * @param updateInfo The update information to send
 */
export function notifyUpdateAvailable(
  mainWindow: BrowserWindow | null,
  updateInfo: UpdateInfo
): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    console.warn('[HablaPe Update] Cannot notify: mainWindow is null or destroyed');
    return;
  }

  if (!updateInfo.updateAvailable || !updateInfo.latestVersion) {
    console.log('[HablaPe Update] No update available to notify');
    return;
  }

  console.log('[HablaPe Update] Notifying renderer of available update:', updateInfo.latestVersion.version);

  mainWindow.webContents.send('update-available', {
    version: updateInfo.latestVersion.version,
    downloadUrl: updateInfo.latestVersion.downloadUrl,
    releaseNotes: updateInfo.latestVersion.releaseNotes,
    fileSize: updateInfo.latestVersion.fileSize,
    mandatory: updateInfo.latestVersion.mandatory,
    publishedAt: updateInfo.latestVersion.publishedAt
  });
}

/**
 * Open the download URL in the default browser
 *
 * @param downloadUrl The URL to open
 */
export function openDownloadUrl(downloadUrl: string): void {
  console.log('[HablaPe Update] Opening download URL:', downloadUrl);
  shell.openExternal(downloadUrl);
}
