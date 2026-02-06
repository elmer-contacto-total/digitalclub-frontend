import { BrowserWindow, shell, app } from 'electron';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';

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

// Default configuration
const DEFAULT_CONFIG: UpdateCheckerConfig = {
  apiBaseUrl: process.env.API_BASE_URL || 'http://digitalclub.contactototal.com.pe',
  platform: 'windows'
};

// Download state
let isDownloading = false;
let downloadAbortController: AbortController | null = null;

/**
 * Check for available updates
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
 */
export function notifyUpdateAvailable(
  mainWindow: BrowserWindow | null,
  updateInfo: UpdateInfo
): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!updateInfo.updateAvailable || !updateInfo.latestVersion) return;

  console.log('[HablaPe Update] Notifying renderer:', updateInfo.latestVersion.version);

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
 * Download the installer and run it.
 * Sends progress events to the renderer.
 */
export async function downloadAndInstallUpdate(
  downloadUrl: string,
  mainWindow: BrowserWindow | null
): Promise<void> {
  if (isDownloading) {
    console.log('[HablaPe Update] Download already in progress');
    return;
  }

  isDownloading = true;

  const sendProgress = (data: { status: string; percent?: number; error?: string }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-download-progress', data);
    }
  };

  try {
    sendProgress({ status: 'starting', percent: 0 });

    // Determine temp file path
    const tempDir = app.getPath('temp');
    const fileName = `holape-update-${Date.now()}.exe`;
    const filePath = path.join(tempDir, fileName);

    console.log('[HablaPe Update] Downloading to:', filePath);

    // Download the file
    await downloadFile(downloadUrl, filePath, (percent) => {
      sendProgress({ status: 'downloading', percent });
    });

    console.log('[HablaPe Update] Download complete:', filePath);
    sendProgress({ status: 'installing', percent: 100 });

    // Small delay so user sees 100%
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Run the installer and quit
    console.log('[HablaPe Update] Launching installer...');
    execFile(filePath, { detached: true, windowsHide: false } as any);

    // Quit the app so the installer can replace files
    setTimeout(() => {
      app.quit();
    }, 500);

  } catch (error: any) {
    console.error('[HablaPe Update] Download/install error:', error);
    sendProgress({ status: 'error', error: error.message || 'Error desconocido' });
    isDownloading = false;
  }
}

/**
 * Download a file with progress tracking.
 * Follows redirects (important for S3 presigned URLs).
 */
function downloadFile(
  url: string,
  destPath: string,
  onProgress: (percent: number) => void,
  redirectCount = 0
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error('Too many redirects'));
      return;
    }

    const protocol = url.startsWith('https') ? https : http;

    const request = protocol.get(url, (response) => {
      // Handle redirects
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        console.log('[HablaPe Update] Following redirect to:', response.headers.location);
        downloadFile(response.headers.location, destPath, onProgress, redirectCount + 1)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      const totalSize = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedSize = 0;

      const fileStream = fs.createWriteStream(destPath);

      response.on('data', (chunk: Buffer) => {
        downloadedSize += chunk.length;
        if (totalSize > 0) {
          const percent = Math.round((downloadedSize / totalSize) * 100);
          onProgress(percent);
        }
      });

      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });

      fileStream.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    });

    request.on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });

    request.setTimeout(60000, () => {
      request.destroy();
      reject(new Error('Download timeout'));
    });
  });
}

/**
 * Open the download URL in the default browser (fallback)
 */
export function openDownloadUrl(downloadUrl: string): void {
  console.log('[HablaPe Update] Opening download URL:', downloadUrl);
  shell.openExternal(downloadUrl);
}
