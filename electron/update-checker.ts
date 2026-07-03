import { BrowserWindow, shell, app, net } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { DEFAULT_BACKEND_URL } from './app-config';

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
  apiBaseUrl: process.env.API_BASE_URL || DEFAULT_BACKEND_URL,
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

  console.log('[MWS Update] Checking for updates:', url);

  try {
    // IMPORTANTE: usar net.fetch (stack de red de Chromium), NO el fetch de Node.
    // net.fetch respeta el proxy del sistema (WPAD/PAC que impone Active Directory)
    // y el almacén de certificados de Windows (raíz corporativa de inspección TLS).
    // El fetch de Node ignora ambos y falla en silencio en laptops de dominio: por
    // eso a esos usuarios nunca les saltaba la modal de actualización.
    const response = await net.fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      console.warn('[MWS Update] Server returned error:', response.status);
      return null;
    }

    const data: UpdateInfo = await response.json();
    console.log('[MWS Update] Response:', data);

    return data;
  } catch (error) {
    console.error('[MWS Update] Error checking for updates:', error);
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

  console.log('[MWS Update] Notifying renderer:', updateInfo.latestVersion.version);

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
    console.log('[MWS Update] Download already in progress');
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
    const fileName = `mws-desktop-update-${Date.now()}.exe`;
    const filePath = path.join(tempDir, fileName);

    console.log('[MWS Update] Downloading to:', filePath);

    // Download the file
    await downloadFile(downloadUrl, filePath, (percent) => {
      sendProgress({ status: 'downloading', percent });
    });

    console.log('[MWS Update] Download complete:', filePath);
    sendProgress({ status: 'installing', percent: 100 });

    // Small delay so user sees 100%
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Run the installer as a detached process that survives app exit
    console.log('[MWS Update] Launching installer:', filePath);
    const child = spawn(filePath, ['/S'], {
      detached: true,
      stdio: 'ignore',
      shell: false
    });
    child.unref();

    // Give the installer time to start before quitting
    setTimeout(() => {
      app.quit();
    }, 2000);

  } catch (error: any) {
    console.error('[MWS Update] Download/install error:', error);
    sendProgress({ status: 'error', error: error.message || 'Error desconocido' });
    isDownloading = false;
  }
}

/**
 * Download a file with progress tracking, usando el módulo net de Electron.
 *
 * net.request enruta por el stack de Chromium igual que net.fetch: respeta el
 * proxy corporativo (WPAD/PAC de Active Directory) y el almacén de certificados
 * de Windows. Sigue redirects automáticamente (redirect: 'follow'), necesario
 * para las presigned URLs de S3.
 */
function downloadFile(
  url: string,
  destPath: string,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, method: 'GET', redirect: 'follow' });

    let settled = false;
    let watchdog: NodeJS.Timeout | null = null;

    const cleanupWatchdog = () => {
      if (watchdog) {
        clearTimeout(watchdog);
        watchdog = null;
      }
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanupWatchdog();
      try { request.abort(); } catch { /* noop */ }
      fs.unlink(destPath, () => {});
      reject(err);
    };

    // Watchdog de inactividad: aborta si no llegan datos por 60s.
    const armWatchdog = () => {
      cleanupWatchdog();
      watchdog = setTimeout(() => fail(new Error('Download timeout')), 60000);
    };

    request.on('response', (response) => {
      const status = response.statusCode || 0;
      if (status !== 200) {
        fail(new Error(`HTTP ${status}`));
        return;
      }

      // En Electron los headers pueden venir como string[] — normalizar.
      const clHeader = response.headers['content-length'];
      const clRaw = Array.isArray(clHeader) ? clHeader[0] : clHeader;
      const totalSize = parseInt((clRaw as string) || '0', 10);
      let downloadedSize = 0;

      const fileStream = fs.createWriteStream(destPath);
      fileStream.on('error', (err) => fail(err));

      // pause/resume para backpressure (cast: no siempre están en los tipos de Electron 28).
      const pausable = response as unknown as { pause?: () => void; resume?: () => void };

      armWatchdog();

      response.on('data', (chunk: Buffer) => {
        armWatchdog();
        downloadedSize += chunk.length;

        const ok = fileStream.write(chunk);
        if (!ok && pausable.pause && pausable.resume) {
          pausable.pause();
          fileStream.once('drain', () => pausable.resume!());
        }

        if (totalSize > 0) {
          onProgress(Math.round((downloadedSize / totalSize) * 100));
        }
      });

      response.on('end', () => {
        if (settled) return;
        cleanupWatchdog();
        fileStream.end(() => {
          settled = true;
          resolve();
        });
      });

      response.on('error', (err: Error) => fail(err));
    });

    request.on('error', (err) => fail(err));

    request.end();
  });
}

/**
 * Open the download URL in the default browser (fallback)
 */
export function openDownloadUrl(downloadUrl: string): void {
  console.log('[MWS Update] Opening download URL:', downloadUrl);
  shell.openExternal(downloadUrl);
}
