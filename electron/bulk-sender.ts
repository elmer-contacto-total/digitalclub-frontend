/**
 * BulkSender - Electron bulk messaging engine with anti-ban measures
 * Polls the backend for next recipient, navigates to chat, sends message,
 * and reports result. Respects configurable rate limiting and pauses.
 */

import { app, BrowserView, BrowserWindow, clipboard, net, nativeImage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export interface BulkSendRules {
  min_delay_seconds: number;
  max_delay_seconds: number;
  pause_after_count: number;
  pause_duration_minutes: number;
  send_hour_start: number;
  send_hour_end: number;
  max_daily_messages: number;
  enabled: boolean;
}

export interface BulkSenderStatus {
  bulkSendId: number | null;
  state: 'idle' | 'running' | 'pausing' | 'paused' | 'cancelled' | 'completed' | 'error';
  sentCount: number;
  failedCount: number;
  totalRecipients: number;
  currentPhone: string | null;
  lastError: string | null;
}

export type OverlayUpdateCallback = (data: {
  state: string;
  sentCount: number;
  failedCount: number;
  totalRecipients: number;
  currentPhone: string | null;
  periodicPauseRemaining?: number;
  lastError?: string | null;
  nextMessageInSeconds?: number;
}) => void;

/** Resultado de navigateToChat / prefetchNext */
type NavResult = { success: boolean; error?: string; errorType?: 'not_registered' | 'not_found' | 'timeout' | 'selector' | 'unknown' };

/**
 * Código de país que se antepone cuando el número del CSV viene en formato
 * local. Las tramas de cartera traen el celular peruano de 9 dígitos
 * (ej. 906261039) y el buscador de "Nuevo chat" necesita el número completo.
 */
const DEFAULT_COUNTRY_CODE = '51';

/** Largo de un celular local sin código de país (Perú). */
const LOCAL_PHONE_LENGTH = 9;

/**
 * Margen para que abra el panel "Nuevo chat" y devuelva resultados.
 * Es dentro de la SPA, así que no necesita tanto como una recarga.
 */
const NEW_CHAT_TIMEOUT_MS = 8000;

/**
 * Margen para que aparezca el cuadro de texto tras abrir un chat.
 *
 * Estaba en 5s y se agotaba con WhatsApp lento o la máquina cargada, y el
 * codigo lo reportaba como "Contacto no registrado en WhatsApp" — conclusion
 * falsa: en el envio 21 de produccion un numero se envio bien y despues fallo
 * por aca. Solo se paga cuando algo va mal, asi que conviene holgado.
 */
const COMPOSE_BOX_TIMEOUT_MS = 12000;

const DEFAULT_RULES: BulkSendRules = {
  min_delay_seconds: 30,
  max_delay_seconds: 90,
  pause_after_count: 20,
  pause_duration_minutes: 5,
  send_hour_start: 8,
  send_hour_end: 20,
  max_daily_messages: 200,
  enabled: true
};

export class BulkSender {
  private bulkSendId: number | null = null;
  private apiBaseUrl: string;
  private authToken: string = '';
  private rules: BulkSendRules = { ...DEFAULT_RULES };
  private whatsappView: BrowserView | null = null;
  private onOverlayUpdate: OverlayUpdateCallback | null = null;

  private _state: 'idle' | 'running' | 'pausing' | 'paused' | 'cancelled' | 'completed' | 'error' = 'idle';
  private sentCount = 0;
  private failedCount = 0;
  private totalRecipients = 0;
  private consecutiveFailures = 0;
  private currentPhone: string | null = null;
  private lastError: string | null = null;
  private isPaused = false;
  private isCancelled = false;
  private dailySentCount = 0;
  private stateFile: string | null = null;
  private cdpAttached = false;
  private processLoopPromise: Promise<void> | null = null;
  // Destinatario pre-cargado + pre-navegado durante la espera del mensaje
  // anterior (solapa el trabajo con la espera anti-ban). Ver prefetchNext().
  private prefetched: { next: any; navResult: NavResult } | null = null;
  private rateLimitResumeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(apiBaseUrl: string) {
    this.apiBaseUrl = apiBaseUrl;
  }

  setStateFile(filePath: string): void {
    this.stateFile = filePath;
  }

  getPersistedState(): { bulkSendId: number; state: string; sentCount: number; failedCount: number; totalRecipients: number } | null {
    if (!this.stateFile) return null;
    try {
      if (fs.existsSync(this.stateFile)) {
        return JSON.parse(fs.readFileSync(this.stateFile, 'utf-8'));
      }
    } catch { /* ignore */ }
    return null;
  }

  private persistState(): void {
    if (!this.stateFile || !this.bulkSendId) return;
    try {
      fs.writeFileSync(this.stateFile, JSON.stringify({
        bulkSendId: this.bulkSendId,
        state: this._state,
        sentCount: this.sentCount,
        failedCount: this.failedCount,
        totalRecipients: this.totalRecipients
      }));
    } catch { /* ignore */ }
  }

  private clearPersistedState(): void {
    if (!this.stateFile) return;
    try {
      if (fs.existsSync(this.stateFile)) {
        fs.unlinkSync(this.stateFile);
      }
    } catch { /* ignore */ }
  }

  private cleanupTempAttachment(): void {
    if (!this.bulkSendId) return;
    try {
      const tempDir = path.join(app.getPath('temp'), `bulk_send_${this.bulkSendId}`);
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        console.log(`[BulkSender] Cleaned up temp attachment dir: ${tempDir}`);
      }
    } catch { /* ignore */ }
  }

  private scheduleRateLimitResume(cooldownMs: number): void {
    this.clearRateLimitTimer();
    console.log(`[BulkSender] Auto-resume scheduled in ${Math.round(cooldownMs / 1000)}s`);
    this.rateLimitResumeTimer = setTimeout(() => {
      this.rateLimitResumeTimer = null;
      if (this._state === 'paused' && !this.isCancelled) {
        console.log('[BulkSender] Rate limit cooldown expired — auto-resuming');
        this.resume();
      }
    }, cooldownMs);
  }

  private clearRateLimitTimer(): void {
    if (this.rateLimitResumeTimer) {
      clearTimeout(this.rateLimitResumeTimer);
      this.rateLimitResumeTimer = null;
    }
  }

  setOverlayCallback(cb: OverlayUpdateCallback): void {
    this.onOverlayUpdate = cb;
  }

  private emitOverlayUpdate(): void {
    if (this.onOverlayUpdate) {
      this.onOverlayUpdate({
        state: this._state,
        sentCount: this.sentCount,
        failedCount: this.failedCount,
        totalRecipients: this.totalRecipients,
        currentPhone: this.currentPhone,
        lastError: this.lastError
      });
    }
    this.persistState();
    this.updateOverlay();
  }

  setWhatsAppView(view: BrowserView | null): void {
    this.whatsappView = view;
  }

  // Para reenviar logs de diagnóstico al renderer Angular (DevTools de la
  // ventana principal con Ctrl+Shift+I). El main process no tiene DevTools,
  // así que sin esto los logs se pierden.
  private mainWindow: BrowserWindow | null = null;
  setMainWindow(win: BrowserWindow | null): void {
    this.mainWindow = win;
  }
  private sendDiagToRenderer(payload: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      try {
        this.mainWindow.webContents.send('bulk:diag-log', payload);
      } catch { /* ignore */ }
    }
  }

  setAuthToken(token: string): void {
    this.authToken = token;
  }

  getStatus(): BulkSenderStatus {
    return {
      bulkSendId: this.bulkSendId,
      state: this._state,
      sentCount: this.sentCount,
      failedCount: this.failedCount,
      totalRecipients: this.totalRecipients,
      currentPhone: this.currentPhone,
      lastError: this.lastError
    };
  }

  async start(bulkSendId: number): Promise<{ success: boolean; error?: string; activeBulkSendId?: number | null }> {
    if (this._state === 'running') {
      console.log('[BulkSender] Already running bulk send', this.bulkSendId);
      return { success: false, error: 'Ya hay un envío masivo en curso', activeBulkSendId: this.bulkSendId };
    }

    this.bulkSendId = bulkSendId;
    this._state = 'running';
    this.sentCount = 0;
    this.failedCount = 0;
    this.totalRecipients = 0;
    this.consecutiveFailures = 0;
    this.dailySentCount = 0;
    this.currentPhone = null;
    this.lastError = null;
    this.isPaused = false;
    this.isCancelled = false;

    console.log(`[BulkSender] Starting bulk send ${bulkSendId}`);

    // Disable chat blocker during bulk send
    await this.setBulkSendActiveFlag(true);

    // Show overlay
    await this.showOverlay();

    // Fetch rules from backend
    await this.fetchRules();

    // Main send loop
    const loopPromise = this.processLoop();
    this.processLoopPromise = loopPromise;
    await loopPromise;
    this.processLoopPromise = null;

    // Detach CDP debugger
    this.detachCdp();

    // Hide overlay when done
    await this.hideOverlay();

    // Re-enable chat blocker
    await this.setBulkSendActiveFlag(false);

    return { success: true };
  }

  isActive(): boolean {
    return this._state === 'running';
  }

  /** Pause and wait for backend notification — used on app shutdown */
  async pauseForShutdown(): Promise<void> {
    console.log(`[BulkSender] Pausing for shutdown, bulk send ${this.bulkSendId}`);
    this.isPaused = true;
    this._state = 'paused';
    this.persistState();
    await this.notifyBackend('pause');
    // Wait for processLoop to finish current operation before app.quit()
    if (this.processLoopPromise) {
      await Promise.race([this.processLoopPromise, this.sleep(15000)]);
    }
  }

  pause(): void {
    console.log(`[BulkSender] Pausing bulk send ${this.bulkSendId}`);
    this.isPaused = true;
    this.clearRateLimitTimer();
    if (this.processLoopPromise) {
      // processLoop is active — it will check isPaused and transition to 'paused'
      this._state = 'pausing';
    } else {
      // processLoop already finished (auto-paused, completed, etc.) — go directly to 'paused'
      this._state = 'paused';
      this.notifyBackend('pause');
    }
    this.emitOverlayUpdate();
  }

  async resume(): Promise<{ success: boolean; error?: string }> {
    // Case 1: Normal resume (same session, paused state in memory)
    if (this._state === 'paused') {
      console.log(`[BulkSender] Resuming bulk send ${this.bulkSendId} (same session)`);
      this.isPaused = false;
      this._state = 'running';
      this.notifyBackend('resume');
      this.emitOverlayUpdate();
      await this.showOverlay();
      await this.fetchRules();
      const loopPromise = this.processLoop();
      this.processLoopPromise = loopPromise;
      await loopPromise;
      this.processLoopPromise = null;
      this.detachCdp();
      await this.hideOverlay();
      await this.setBulkSendActiveFlag(false);
      return { success: true };
    }

    // Case 2: After app restart — state is 'idle' but persisted state says 'paused' or 'running'
    if (this._state === 'idle') {
      const persisted = this.getPersistedState();
      if (persisted && (persisted.state === 'paused' || persisted.state === 'running') && persisted.bulkSendId) {
        console.log(`[BulkSender] Resuming bulk send ${persisted.bulkSendId} (after app restart)`);
        this.bulkSendId = persisted.bulkSendId;
        this.sentCount = persisted.sentCount || 0;
        this.failedCount = persisted.failedCount || 0;
        this.totalRecipients = persisted.totalRecipients || 0;
        this._state = 'running';
        this.isPaused = false;
        this.isCancelled = false;
        this.consecutiveFailures = 0;
        this.dailySentCount = 0;

        this.notifyBackend('resume');
        this.emitOverlayUpdate();
        await this.setBulkSendActiveFlag(true);
        await this.showOverlay();
        await this.fetchRules();
        const loopPromise = this.processLoop();
        this.processLoopPromise = loopPromise;
        await loopPromise;
        this.processLoopPromise = null;
        this.detachCdp();
        await this.hideOverlay();
        await this.setBulkSendActiveFlag(false);
        return { success: true };
      }
    }

    return { success: false, error: 'No hay envío para reanudar' };
  }

  cancel(): void {
    console.log(`[BulkSender] Cancelling bulk send ${this.bulkSendId}`);
    this.isCancelled = true;
    this._state = 'cancelled';
    this.clearRateLimitTimer();
    this.notifyBackend('cancel');
    this.emitOverlayUpdate();
    this.clearPersistedState();
    this.cleanupTempAttachment();
    this.detachCdp();
    this.hideOverlay();
    this.setBulkSendActiveFlag(false);
  }

  private async processLoop(): Promise<void> {
    let messagesSinceLastPause = 0;
    // Descartar cualquier prefetch de una corrida anterior: tras pausa/reanudación
    // resumeBulkSend() resetea los IN_PROGRESS a PENDING, así que un prefetch
    // viejo sería un destinatario obsoleto (reportarlo lo duplicaría).
    this.prefetched = null;

    while (true) {
      // Check cancel/pause
      if (this.isCancelled) {
        this._state = 'cancelled';
        this.emitOverlayUpdate();
        console.log(`[BulkSender] Bulk send ${this.bulkSendId} cancelled`);
        return;
      }

      if (this.isPaused) {
        this._state = 'paused';
        this.notifyBackend('pause');
        this.emitOverlayUpdate();
        console.log(`[BulkSender] Bulk send ${this.bulkSendId} paused`);
        return;
      }

      // Check WhatsApp session
      const sessionOk = await this.checkWhatsAppSession();
      if (!sessionOk) {
        console.warn('[BulkSender] WhatsApp disconnected - auto-pausing');
        this.isPaused = true;
        this._state = 'paused';
        this.lastError = 'WhatsApp desconectado - escanee el código QR y reanude';
        this.notifyBackend('pause');
        this.emitOverlayUpdate();
        return;
      }

      // Check send hours
      if (!this.isWithinSendHours()) {
        console.log('[BulkSender] Outside send hours, waiting 60s...');
        await this.sleep(60000);
        continue;
      }

      // Check daily limit
      if (this.rules.max_daily_messages > 0 && this.dailySentCount >= this.rules.max_daily_messages) {
        console.log(`[BulkSender] Daily limit reached (${this.dailySentCount}/${this.rules.max_daily_messages}) — auto-pausing`);
        this.isPaused = true;
        this._state = 'paused';
        this.lastError = `Límite diario alcanzado (${this.rules.max_daily_messages} mensajes)`;
        this.notifyBackend('pause');
        this.emitOverlayUpdate();
        return;
      }

      // Usar el destinatario pre-cargado (fetch + navegación solapados con la
      // espera del mensaje anterior) si está disponible; si no, fetch fresco.
      let next: any;
      let navResult: NavResult | null = null;

      if (this.prefetched) {
        next = this.prefetched.next;
        navResult = this.prefetched.navResult;
        this.prefetched = null;
      } else {
        // Fetch next recipient
        next = await this.fetchNextRecipient();

        // Network/HTTP error — NOT completion, treat as transient failure
        if (next === null) {
          this.consecutiveFailures++;
          console.warn(`[BulkSender] Failed to fetch next recipient (attempt ${this.consecutiveFailures})`);
          if (this.consecutiveFailures >= 5) {
            this.isPaused = true;
            this._state = 'paused';
            this.lastError = 'Error de conexión con el servidor. Verifique su red y reanude.';
            await this.notifyBackend('pause');
            this.emitOverlayUpdate();
            return;
          }
          await this.sleep(5000);
          continue;
        }

        if (!next.has_next) {
          // Check if backend stopped us due to limits (NOT actual completion)
          if (next.daily_limit_reached || next.rate_limited) {
            this.isPaused = true;
            this._state = 'paused';
            this.lastError = next.message || 'Límite alcanzado. Se reanudará automáticamente en ~15 minutos.';
            await this.notifyBackend('pause');
            this.scheduleRateLimitResume(15 * 60 * 1000);
            this.emitOverlayUpdate();
            return;
          }
          this._state = 'completed';
          this.emitOverlayUpdate();
          this.clearPersistedState();
          this.cleanupTempAttachment();
          console.log(`[BulkSender] Bulk send ${this.bulkSendId} completed: ${this.sentCount} sent, ${this.failedCount} failed`);
          return;
        }

        // Validate phone
        if (!next.phone || next.phone.trim().length < 5) {
          console.warn(`[BulkSender] Invalid phone "${next.phone}" for recipient ${next.recipient_id} — skipping`);
          await this.reportResult(next.recipient_id, false, 'Teléfono inválido: vacío o muy corto', 'SKIP');
          this.failedCount++;
          this.emitOverlayUpdate();
          await this.sleep(1000);
          continue;
        }
      }

      this.currentPhone = next.phone;
      const content = next.content || '';
      const recipientId = next.recipient_id;
      const hasAttachment = !!next.attachment_path;

      this.emitOverlayUpdate();

      console.log(`[BulkSender] Sending to ${next.phone} (${next.recipient_name || 'Unknown'})`);

      // Navigate to chat (omitido si el destinatario ya viene pre-navegado)
      if (navResult === null) {
        navResult = await this.navigateToChat(next.phone);
      }

      if (!navResult.success) {
        const errorMsg = navResult.error || 'navigation_failed';
        const errorType = navResult.errorType || 'unknown';

        // Classify error: skippable vs real failure
        if (errorType === 'not_registered' || errorType === 'not_found') {
          // Contact not on WhatsApp or only groups found — SKIP, don't count as consecutive failure
          console.log(`[BulkSender] Skipping ${next.phone}: ${errorMsg} (${errorType})`);
          await this.reportResult(recipientId, false, errorMsg, 'SKIP');
          this.failedCount++;
          this.emitOverlayUpdate();

          // Espera breve antes del siguiente: no se envió nada → sin riesgo de baneo.
          await this.sleep(600 + Math.random() * 400);
          continue;
        }

        // Real failure (timeout, selector, unknown)
        console.error(`[BulkSender] Navigation failed for ${next.phone}: ${errorMsg} (${errorType})`);
        await this.reportResult(recipientId, false, errorMsg);
        this.failedCount++;
        this.consecutiveFailures++;
        this.lastError = errorMsg;
        this.emitOverlayUpdate();

        // Backoff on consecutive failures
        if (this.consecutiveFailures >= 5) {
          console.warn('[BulkSender] 5 consecutive failures - auto-pausing');
          this.isPaused = true;
          this._state = 'paused';
          this.lastError = 'Pausado automáticamente tras 5 fallos consecutivos';
          this.notifyBackend('pause');
          this.emitOverlayUpdate();
          return;
        }

        if (this.consecutiveFailures >= 3) {
          const backoffDelay = this.getRandomDelay() * 2;
          console.log(`[BulkSender] Backoff: waiting ${backoffDelay}ms`);
          await this.sleep(backoffDelay);
        }
        continue;
      }

      // Navigation succeeded — send the message
      try {
        // Breve asentamiento del chat antes de verificar (no es anti-ban).
        await this.sleep(150);

        // Verify we're still in the correct chat; re-navigate up to MAX_VERIFY_ATTEMPTS times
        const MAX_VERIFY_ATTEMPTS = 5;
        let chatVerified = false;
        let verifyAttempt = 0;
        while (!chatVerified) {
          const chatCheck = await this.verifyCurrentChat(next.phone);
          if (chatCheck.match) {
            chatVerified = true;
            break;
          }
          verifyAttempt++;
          if (verifyAttempt > MAX_VERIFY_ATTEMPTS) {
            throw new Error(`Chat incorrecto tras ${MAX_VERIFY_ATTEMPTS} intentos de verificación (esperado: ${next.phone}, actual: "${chatCheck.actual}")`);
          }
          console.warn(`[BulkSender] Chat changed (attempt ${verifyAttempt}/${MAX_VERIFY_ATTEMPTS})! Expected ${next.phone}, found "${chatCheck.actual}" — re-navigating`);
          const reNav = await this.navigateToChat(next.phone);
          if (!reNav.success) {
            throw new Error(`Re-navegación falló: ${reNav.error}`);
          }
          await this.sleep(300);
        }

        // Send message (with or without attachment) — retry on CHAT_CHANGED (max 3 retries)
        const MAX_SEND_RETRIES = 3;
        if (hasAttachment) {
          // Download attachment from backend to local temp (server path is not accessible on Windows)
          const localAttachmentPath = await this.downloadAttachment(
            this.bulkSendId!,
            next.attachment_original_name || path.basename(next.attachment_path)
          );
          let mediaSendResult: { success: boolean; error?: string };
          let mediaSendAttempt = 0;
          while (true) {
            mediaSendResult = await this.sendMediaWithCaption(
              localAttachmentPath,
              content,
              next.attachment_type || 'document',
              next.phone
            );
            if (mediaSendResult.success || mediaSendResult.error !== 'CHAT_CHANGED') break;
            mediaSendAttempt++;
            if (mediaSendAttempt >= MAX_SEND_RETRIES) {
              mediaSendResult = { success: false, error: `Chat cambió ${MAX_SEND_RETRIES} veces durante envío de media` };
              break;
            }
            console.warn(`[BulkSender] Chat changed inside sendMediaWithCaption (retry ${mediaSendAttempt}/${MAX_SEND_RETRIES}) — re-navigating`);
            await this.navigateToChat(next.phone);
            await this.sleep(300);
          }
          if (!mediaSendResult.success) {
            throw new Error(`Failed to send media: ${mediaSendResult.error}`);
          }
        } else {
          let textSendResult: { success: boolean; error?: string };
          let textSendAttempt = 0;
          while (true) {
            textSendResult = await this.sendAndSubmit(content, next.phone);
            if (textSendResult.success || (textSendResult.error !== 'CHAT_CHANGED' && textSendResult.error !== 'RATE_LIMITED')) break;
            if (textSendResult.error === 'RATE_LIMITED') break;
            textSendAttempt++;
            if (textSendAttempt >= MAX_SEND_RETRIES) {
              textSendResult = { success: false, error: `Chat cambió ${MAX_SEND_RETRIES} veces durante envío de texto` };
              break;
            }
            console.warn(`[BulkSender] Chat changed inside sendAndSubmit (retry ${textSendAttempt}/${MAX_SEND_RETRIES}) — re-navigating`);
            await this.navigateToChat(next.phone);
            await this.sleep(300);
          }
          if (textSendResult.error === 'RATE_LIMITED') {
            await this.reportResult(recipientId, false, 'Rate limit de WhatsApp detectado');
            this.failedCount++;
            this.isPaused = true;
            this._state = 'paused';
            this.lastError = 'WhatsApp ha limitado el envío. Se reanudará automáticamente en ~15 minutos.';
            // Notify backend so other Electron instances also stop
            try {
              await fetch(`${this.apiBaseUrl}/app/bulk_sends/report-rate-limit?cooldownMinutes=15`, {
                method: 'POST',
                headers: this.getHeaders()
              });
            } catch (e) { /* ignore */ }
            await this.notifyBackend('pause');
            this.scheduleRateLimitResume(15 * 60 * 1000);
            this.emitOverlayUpdate();
            return;
          }
          if (!textSendResult.success) {
            throw new Error(`Failed to send message: ${textSendResult.error}`);
          }
        }

        // Report success
        await this.reportResult(recipientId, true);
        this.sentCount++;
        this.dailySentCount++;
        this.consecutiveFailures = 0;
        messagesSinceLastPause++;

        this.emitOverlayUpdate();
        console.log(`[BulkSender] Sent to ${next.phone} (${this.sentCount} total)`);

      } catch (err: any) {
        const errorMsg = err.message || String(err);
        console.error(`[BulkSender] Send failed for ${next.phone}: ${errorMsg}`);

        await this.reportResult(recipientId, false, errorMsg);
        this.failedCount++;
        this.consecutiveFailures++;
        this.lastError = errorMsg;
        this.emitOverlayUpdate();

        // Check if WhatsApp is rate-limiting us
        const rateLimited = await this.detectWhatsAppRateLimit();
        if (rateLimited) {
          console.warn('[BulkSender] WhatsApp rate limit detected - auto-pausing');
          this.isPaused = true;
          this._state = 'paused';
          this.lastError = 'WhatsApp ha limitado el envío. Se reanudará automáticamente en ~15 minutos.';
          // Notify backend so other Electron instances also stop
          try {
            await fetch(`${this.apiBaseUrl}/app/bulk_sends/report-rate-limit?cooldownMinutes=15`, {
              method: 'POST',
              headers: this.getHeaders()
            });
          } catch (e) { /* ignore */ }
          await this.notifyBackend('pause');
          this.scheduleRateLimitResume(15 * 60 * 1000);
          this.emitOverlayUpdate();
          return;
        }

        // Backoff on consecutive failures
        if (this.consecutiveFailures >= 5) {
          console.warn('[BulkSender] 5 consecutive failures - auto-pausing');
          this.isPaused = true;
          this._state = 'paused';
          this.lastError = 'Pausado automáticamente tras 5 fallos consecutivos';
          this.notifyBackend('pause');
          this.emitOverlayUpdate();
          return;
        }

        if (this.consecutiveFailures >= 3) {
          const backoffDelay = this.getRandomDelay() * 2;
          console.log(`[BulkSender] Backoff: waiting ${backoffDelay}ms`);
          await this.sleep(backoffDelay);
          continue;
        }
      }

      // Periodic pause (anti-ban) — interruptible, emits countdown
      if (messagesSinceLastPause >= this.rules.pause_after_count && (this.sentCount + this.failedCount) < this.totalRecipients) {
        let remainingSec = this.rules.pause_duration_minutes * 60;
        console.log(`[BulkSender] Periodic pause: ${this.rules.pause_duration_minutes} minutes`);

        // Notify backend so status is visible to other users in real-time
        await this.notifyBackend('periodic_pause');

        // Hide WhatsApp overlay — allow user interaction during pause
        await this.hideOverlay();

        let sessionLostDuringPause = false;

        while (remainingSec > 0 && !this.isPaused && !this.isCancelled) {
          // Check WhatsApp session every iteration (~1s) — lightweight (2 DOM queries)
          const sessionOk = await this.checkWhatsAppSession();
          if (!sessionOk) {
            console.warn('[BulkSender] WhatsApp disconnected during periodic pause');
            sessionLostDuringPause = true;
            break;  // Exit countdown → main loop detects session loss and auto-pauses
          }

          // Re-check pause/cancel después de cada operación async — pueden haber
          // llegado vía IPC durante el await.
          if (this.isPaused || this.isCancelled) break;

          // Emit countdown directly (skip persistState/updateOverlay)
          if (this.onOverlayUpdate) {
            this.onOverlayUpdate({
              state: this._state,
              sentCount: this.sentCount,
              failedCount: this.failedCount,
              totalRecipients: this.totalRecipients,
              currentPhone: this.currentPhone,
              periodicPauseRemaining: remainingSec
            });
          }
          await this.sleep(1000);
          if (this.isPaused || this.isCancelled) break;
          remainingSec--;
        }

        // Guard explícito: si pause/cancel llegó durante la pausa anti-ban,
        // salir directamente del processLoop sin pasar por continue. El
        // continue + while-exterior funcionaba en teoría pero deja una
        // ventana donde el bulk podría emitir periodic_resume al backend
        // antes de que el exterior detecte la pausa, dejando estados
        // inconsistentes ("se chanca el flujo").
        if (this.isPaused || this.isCancelled) {
          console.log(`[BulkSender] Pausa anti-ban interrumpida — isPaused=${this.isPaused} isCancelled=${this.isCancelled}, saliendo del processLoop`);
          if (this.isCancelled) {
            this._state = 'cancelled';
          } else {
            this._state = 'paused';
            await this.notifyBackend('pause'); // idempotente con el pause() que ya pudo haber notificado
          }
          this.emitOverlayUpdate();
          return; // ← sale del processLoop, no continue
        }

        // Pausa periódica terminó naturalmente: emit resume y continuar.
        if (!sessionLostDuringPause) {
          await this.notifyBackend('periodic_resume');
          await this.showOverlay();
          if (this.onOverlayUpdate) {
            this.onOverlayUpdate({
              state: this._state,
              sentCount: this.sentCount,
              failedCount: this.failedCount,
              totalRecipients: this.totalRecipients,
              currentPhone: this.currentPhone
            });
          }
          console.log(`[BulkSender] Periodic pause ended, resuming`);
        }
        messagesSinceLastPause = 0;
        continue; // Skip inter-message delay after periodic pause
      }

      // Random delay between messages. Durante esta espera pre-cargamos y
      // pre-navegamos al siguiente destinatario: solapa ~5s de trabajo con
      // los ~30-90s de espera. Navegar/buscar chats NO dispara baneo; el
      // anti-ban es la espera entre envíos, que no se toca.
      const delay = this.getRandomDelay();
      console.log(`[BulkSender] Waiting ${Math.round(delay / 1000)}s before next...`);
      const prefetchPromise = this.prefetchNext();
      await this.sleepWithCountdown(delay);
      this.prefetched = await prefetchPromise;
    }
  }

  /**
   * Espera entre mensajes emitiendo la cuenta regresiva al overlay.
   *
   * La duración total es EXACTAMENTE la misma que un sleep(totalMs) — el fin se
   * calcula una sola vez y se duerme a tramos hasta llegar a él, así que no hay
   * deriva ni se acorta la espera. Sólo se agrega el aviso visual: sin él, los
   * 30-90s entre mensajes se ven idénticos a la app colgada.
   *
   * NO toca el anti-ban.
   */
  private async sleepWithCountdown(totalMs: number): Promise<void> {
    const end = Date.now() + totalMs;
    let remainingMs = totalMs;

    while (remainingMs > 0) {
      if (this.onOverlayUpdate && !this.isPaused && !this.isCancelled) {
        this.onOverlayUpdate({
          state: this._state,
          sentCount: this.sentCount,
          failedCount: this.failedCount,
          totalRecipients: this.totalRecipients,
          // null y no this.currentPhone: durante la espera no se está enviando
          // a nadie. Mostrar el número anterior hacía parecer que ese envío
          // seguía en curso cuando ya estaba terminado.
          currentPhone: null,
          nextMessageInSeconds: Math.ceil(remainingMs / 1000)
        });
      }
      await this.sleep(Math.min(1000, remainingMs));
      remainingMs = end - Date.now();
    }
  }

  /**
   * Pre-carga el siguiente destinatario y pre-navega a su chat, para solapar
   * ese trabajo (~5s) con la espera entre mensajes (~30-90s).
   *
   * Devuelve null si no hay un siguiente destinatario "limpio" (no hay más,
   * error de red, teléfono inválido): en ese caso el loop principal hace el
   * fetch fresco y maneja esos casos con su lógica robusta.
   *
   * Si el envío se pausa/cancela tras el prefetch, el destinatario queda
   * IN_PROGRESS en el backend; resumeBulkSend() lo resetea a PENDING al
   * reanudar, así que no se pierde ni se duplica.
   */
  private async prefetchNext(): Promise<{ next: any; navResult: NavResult } | null> {
    try {
      if (this.isPaused || this.isCancelled) return null;
      const next = await this.fetchNextRecipient();
      // Solo pre-navegamos destinatarios "limpios"; el resto (no hay más,
      // error de red, teléfono inválido) lo resuelve el loop con fetch fresco.
      if (!next || !next.has_next) return null;
      if (!next.phone || next.phone.trim().length < 5) return null;
      if (this.isPaused || this.isCancelled) return null;
      const navResult = await this.navigateToChat(next.phone);
      return { next, navResult };
    } catch (err: any) {
      console.warn('[BulkSender] prefetchNext falló, el loop hará fetch fresco:', err?.message || err);
      return null;
    }
  }

  // --- Chat Verification ---

  /**
   * Verify that the currently active WhatsApp chat matches the expected phone.
   * Compares the last 8 digits of the expected phone against the chat header text.
   */
  private async verifyCurrentChat(expectedPhone: string): Promise<{ match: boolean; actual: string }> {
    if (!this.whatsappView) return { match: false, actual: 'no_view' };
    const phoneSuffix = expectedPhone.replace(/\D/g, '').slice(-8);
    const headerInfo = await this.whatsappView.webContents.executeJavaScript(`
      (function() {
        // DOM nuevo: el título es un span con data-testid="conversation-info-header-chat-title"
        var titleEl = document.querySelector('[data-testid="conversation-info-header-chat-title"]');
        if (titleEl) return (titleEl.textContent || '').trim();
        // Fallback DOM viejo
        var header = document.querySelector('#main header span[title]') ||
                     document.querySelector('#main header span[dir="auto"]');
        if (!header) return '';
        return header.getAttribute('title') || header.textContent || '';
      })()
    `, true);
    const headerStr = String(headerInfo);
    // If no header element found at all (e.g. WhatsApp Business different DOM),
    // trust the navigation — it already verified via search + compose box
    if (!headerStr) return { match: true, actual: 'no_header_element' };
    const headerDigits = headerStr.replace(/\D/g, '');
    // If header has fewer than 8 digits, it's a saved contact name (e.g. "Juan Pérez")
    // — can't verify by phone, trust the navigation
    if (headerDigits.length < 8) return { match: true, actual: headerStr };
    return { match: headerDigits.includes(phoneSuffix), actual: headerStr };
  }

  // --- WhatsApp Interaction ---

  /**
   * Poll a JS expression in the WebView until it returns a truthy value or timeout.
   * Returns the truthy value, or null on timeout.
   */
  private async waitForCondition(jsExpression: string, timeoutMs = 5000, intervalMs = 200): Promise<any> {
    if (!this.whatsappView) return null;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const result = await this.whatsappView.webContents.executeJavaScript(
          `(function() { try { var __r = (${jsExpression.trim()}); return __r; } catch(e) { return null; } })()`,
          true
        );
        if (result) return result;
      } catch { /* ignore */ }
      await this.sleep(intervalMs);
    }
    return null;
  }

  /**
   * Reset WhatsApp to main screen between recipients.
   * Presses Escape to close panels, waits for chat list to be visible.
   */
  private async resetToMainScreen(): Promise<boolean> {
    if (!this.whatsappView) return false;
    try {
      // Press Escape 3 times to close any open panels/modals/search
      // Use CDP for focus-independent keyboard events
      for (let i = 0; i < 3; i++) {
        await this.cdpKey('Escape', 'Escape', 27);
        await this.sleep(300);
      }

      // Wait for chat list (#pane-side) to be visible
      const paneSide = await this.waitForCondition(
        `document.querySelector('#pane-side') ? true : null`,
        3000,
        300
      );

      if (!paneSide) {
        console.warn('[BulkSender] resetToMainScreen: #pane-side not found after Escape');
        return false;
      }

      // Clear any residual text in search input via real input events
      const hasSearchText = await this.whatsappView.webContents.executeJavaScript(`
        (function() {
          var searchInput = document.querySelector('[data-testid="chat-list-search-input"]') ||
                            document.querySelector('#side div[contenteditable="true"]');
          if (searchInput && searchInput.textContent && searchInput.textContent.trim()) {
            searchInput.focus();
            searchInput.click();
            return true;
          }
          return false;
        })()
      `, true);

      if (hasSearchText) {
        // Clear search text via CDP (focus-independent)
        await this.cdpClear();
      }

      await this.sleep(300);
      return true;
    } catch (err: any) {
      console.warn('[BulkSender] resetToMainScreen error:', err.message);
      return false;
    }
  }

  private async navigateToChat(phone: string): Promise<{ success: boolean; error?: string; errorType?: 'not_registered' | 'not_found' | 'timeout' | 'selector' | 'unknown' }> {
    if (!this.whatsappView) {
      return { success: false, error: 'Vista de WhatsApp no disponible', errorType: 'unknown' };
    }

    // Normalize phone: strip +, -, (, ), spaces
    const normalizedPhone = phone.replace(/[+\-() \s]/g, '');
    // Last 8 digits for matching (handles country code variations)
    const phoneSuffix = normalizedPhone.slice(-8);

    try {
      // --- PHASE 1: Reset to main screen ---
      const resetOk = await this.resetToMainScreen();
      if (!resetOk) {
        console.warn('[BulkSender] resetToMainScreen failed, continuing anyway...');
      }

      // --- PHASE 2A: Focus the search input via JS ---
      // DOM nuevo de WA (mayo 2026): el buscador es <input data-tab="3"> visible siempre,
      // no requiere click previo para abrirlo. Fallback al div contenteditable del DOM viejo.
      const searchFocus = await this.whatsappView.webContents.executeJavaScript(`
        (async function() {
          try {
            // 1. Intentar el input nativo nuevo
            var input = document.querySelector('input[data-tab="3"]');
            if (!input) {
              // Fallback DOM viejo: requiere abrir el buscador con click
              var searchBox = document.querySelector('[data-testid="chat-list-search"]') ||
                              document.querySelector('[data-icon="search"]')?.closest('button') ||
                              document.querySelector('#side [contenteditable="true"]');
              if (searchBox) {
                searchBox.click();
                await new Promise(function(r) { setTimeout(r, 400); });
              }
              input = document.querySelector('input[data-tab="3"]') ||
                      document.querySelector('[data-testid="chat-list-search-input"]') ||
                      document.querySelector('#side div[contenteditable="true"]') ||
                      document.querySelector('[data-testid="search-input"]');
            }
            if (!input) return { success: false, error: 'Campo de búsqueda no encontrado' };

            input.focus();
            input.click();

            var focusInfo = document.activeElement ?
              (document.activeElement.tagName + ' editable=' + document.activeElement.getAttribute('contenteditable') + ' testid=' + document.activeElement.getAttribute('data-testid') + ' tab=' + document.activeElement.getAttribute('data-tab')) : 'null';
            return { success: true, focusInfo: focusInfo };
          } catch(e) {
            return { success: false, error: e.message || 'search_focus_error' };
          }
        })()
      `, true);

      if (!searchFocus.success) {
        return { success: false, error: searchFocus.error, errorType: 'selector' };
      }

      console.log(`[BulkSender] Search focused: ${searchFocus.focusInfo}`);

      // --- PHASE 2B: Type phone via CDP (focus-independent) ---
      await this.sleep(100);

      // Clear any existing text in the search input
      await this.cdpClear();

      // Type phone number character by character via CDP
      await this.cdpType(normalizedPhone);

      // Wait for WhatsApp to process the search query
      await this.sleep(500);

      // Verify text was typed
      const verifyResult = await this.whatsappView.webContents.executeJavaScript(`
        (function() {
          var input = document.querySelector('input[data-tab="3"]') ||
                      document.querySelector('[data-testid="chat-list-search-input"]') ||
                      document.querySelector('#side div[contenteditable="true"]');
          var content = '';
          if (input) {
            // input nativo: leer .value; contenteditable: leer .textContent
            content = input.tagName === 'INPUT' ? (input.value || '').trim() : (input.textContent || '').trim();
          }
          return { content: content };
        })()
      `, true);

      if (verifyResult.content.length > 0) {
        console.log(`[BulkSender] Typed ${normalizedPhone} via keyboard (verified: ${verifyResult.content})`);
      } else {
        console.warn(`[BulkSender] Keyboard typing may have failed — search input content: "${verifyResult.content}"`);
      }

      // --- PHASE 4: Check search results (with retry if not filtered) ---
      let searchCheck: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        // Wait for WhatsApp to process search query
        await this.sleep(2000);

        searchCheck = await this.whatsappView.webContents.executeJavaScript(`
          (function() {
            var noResults = document.querySelector('[data-testid="search-no-results-title"]');
            if (noResults) return { status: 'no_results' };

            var searchPanel = document.querySelector('#pane-side') || document.querySelector('#side');
            if (searchPanel) {
              var panelText = searchPanel.innerText || '';
              if (panelText.indexOf('No se encontraron') !== -1 ||
                  panelText.indexOf('No results found') !== -1 ||
                  panelText.indexOf('No contacts found') !== -1 ||
                  panelText.indexOf('No se encontró') !== -1) {
                return { status: 'no_results' };
              }
            }

            // Contar SOLO cell-frame-container: en DOM mayo 2026 cada chat
            // tiene además [role="listitem"] y [role="row"] como etiquetas
            // separadas, y los dedupe por elemento NO funciona (son nodos
            // distintos: la celda y el wrapper-row). Sumar los 3 selectores
            // inflaba el conteo por encima del threshold y rompía el filter
            // aunque el filter sí hubiera ocurrido (caso Samuel: 7 cells →
            // sumaban 21+ con listitem/row/tabs y el código abortaba).
            // Si testid cambiara en el futuro, los demás caminos del flujo
            // (no_results, navegación) ya cubren los fallos.
            var cells = document.querySelectorAll('[data-testid="cell-frame-container"]');
            var count = cells.length;
            // Fallback: si por algún motivo cell-frame-container no aparece
            // (testid cambió), caer a [role="listitem"] que también marca
            // chats individuales.
            if (count === 0) {
              count = document.querySelectorAll('#pane-side [role="listitem"]').length;
            }
            return { status: 'has_results', count: count };
          })()
        `, true);

        if (searchCheck.status === 'no_results') break;
        if (searchCheck.count <= 15) break; // Filtered OK

        // Diagnóstico: volcar estado real del DOM cuando el filter falla.
        // Útil para saber si el typing llegó al input, si hay pestañas
        // (Chats/Contactos), y si el target aparece entre los resultados.
        try {
          const diag = await this.whatsappView.webContents.executeJavaScript(`
            (function() {
              var input = document.querySelector('input[data-tab="3"]') ||
                          document.querySelector('[data-testid="chat-list-search-input"]') ||
                          document.querySelector('#side div[contenteditable="true"]');
              var inputContent = input ? (input.tagName === 'INPUT' ? (input.value || '') : (input.textContent || '')).trim() : '';
              var ae = document.activeElement;
              var cells = Array.prototype.slice.call(
                document.querySelectorAll('[data-testid="cell-frame-container"]')
              );
              var firstResults = cells.slice(0, 5).map(function(el) {
                var titleEl = el.querySelector('[data-testid="cell-frame-title"]') || el.querySelector('span[title]');
                return {
                  title: titleEl ? ((titleEl.textContent || titleEl.getAttribute('title') || '')).substring(0, 60) : null,
                  excerpt: (el.textContent || '').substring(0, 80)
                };
              });
              var phoneSuffix = ${JSON.stringify(normalizedPhone.slice(-7))};
              var matchByPhone = cells.filter(function(el) {
                return (el.textContent || '').indexOf(phoneSuffix) > -1;
              }).length;
              var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'))
                .map(function(t) { return t.textContent && t.textContent.trim(); })
                .filter(Boolean);
              var activeTab = document.querySelector('[role="tab"][aria-selected="true"]');
              return {
                attempt: ${attempt},
                inputContent: inputContent,
                expected: ${JSON.stringify(normalizedPhone)},
                contentMatches: inputContent === ${JSON.stringify(normalizedPhone)},
                activeElementTag: ae ? ae.tagName : null,
                activeElementTestid: ae ? ae.getAttribute('data-testid') : null,
                activeElementTab: ae ? ae.getAttribute('data-tab') : null,
                cellCount: cells.length,
                firstResults: firstResults,
                tabs: tabs,
                activeTab: activeTab ? activeTab.textContent.trim() : null,
                matchByPhoneSuffix: matchByPhone
              };
            })()
          `, true);
          console.log('[BulkSender] Diag filter fail:', JSON.stringify(diag));
          // Reenviar al renderer Angular (DevTools de la ventana principal con
          // F12 / Ctrl+Shift+I). El log del main process no se ve sin esto.
          this.sendDiagToRenderer(diag);
        } catch (diagErr) {
          console.warn('[BulkSender] Diag filter fail: error capturando estado:', diagErr);
        }

        // Too many results — search didn't filter. Retry: clear, escape, re-enter search
        if (attempt < 2) {
          console.warn(`[BulkSender] Búsqueda no filtró (${searchCheck.count} items), reintentando (${attempt + 1}/2)...`);
          await this.cdpClear();
          await this.sleep(300);
          // Press Escape to exit search mode (CDP — focus-independent)
          await this.cdpKey('Escape', 'Escape', 27);
          await this.sleep(500);
          // Re-focus input directamente (el input nativo nuevo no necesita re-click previo)
          await this.whatsappView.webContents.executeJavaScript(`
            (function() {
              var input = document.querySelector('input[data-tab="3"]') ||
                          document.querySelector('[data-testid="chat-list-search-input"]') ||
                          document.querySelector('#side div[contenteditable="true"]');
              if (!input) {
                // DOM viejo: abrir el buscador con click
                var searchBox = document.querySelector('[data-testid="chat-list-search"]') ||
                                document.querySelector('[data-icon="search"]')?.closest('button');
                if (searchBox) searchBox.click();
              }
            })()
          `, true);
          await this.sleep(500);
          // Re-focus input and re-type
          await this.whatsappView.webContents.executeJavaScript(`
            (function() {
              var input = document.querySelector('input[data-tab="3"]') ||
                          document.querySelector('[data-testid="chat-list-search-input"]') ||
                          document.querySelector('#side div[contenteditable="true"]');
              if (input) { input.focus(); input.click(); }
            })()
          `, true);
          await this.sleep(200);
          await this.cdpClear();
          await this.sleep(200);
          await this.cdpType(normalizedPhone);
        }
      }

      // Final check after retries
      if (searchCheck.status === 'no_results') {
        // El buscador de WhatsApp solo ve chats existentes y contactos agendados,
        // así que con cartera nueva SIEMPRE cae acá. Antes de descartar el
        // número, intentar por el panel "Nuevo chat", que sí resuelve números sueltos.
        console.log(`[BulkSender] Buscador sin resultados para ${phone} — probando "Nuevo chat"`);
        return await this.navigateViaNewChat(phone);
      }

      if (searchCheck.count > 15) {
        console.warn(`[BulkSender] Búsqueda no filtró tras 3 intentos (${searchCheck.count} resultados) para ${normalizedPhone}`);
        return { success: false, error: `Búsqueda no filtró tras 3 intentos (${searchCheck.count} resultados)`, errorType: 'timeout' };
      }

      console.log(`[BulkSender] Search filtered to ${searchCheck.count} items, selecting via keyboard`);

      // Select first result via ArrowDown, then open via Enter (CDP — focus-independent)
      await this.cdpKey('ArrowDown', 'ArrowDown', 40);
      await this.sleep(200);
      await this.cdpKey('Enter', 'Enter', 13);

      // --- PHASE 5: Verify the correct chat loaded ---
      // Wait for compose box to appear (try multiple selectors for different WhatsApp versions)
      const composeReady = await this.waitForCondition(`
        (function() {
          var box = document.querySelector('[data-testid="conversation-compose-box-input"]') ||
                    document.querySelector('footer div[contenteditable="true"]') ||
                    document.querySelector('#main div[contenteditable="true"][role="textbox"]') ||
                    document.querySelector('#main div[contenteditable="true"][data-tab]') ||
                    document.querySelector('#main div[contenteditable="true"]');
          return box ? true : null;
        })()
      `, COMPOSE_BOX_TIMEOUT_MS, 300);

      if (!composeReady) {
        // Diagnostic: log what's in #main to debug selector issues
        try {
          const diag = await this.whatsappView.webContents.executeJavaScript(`
            (function() {
              var main = document.querySelector('div#main');
              if (!main) return { hasMain: false };
              var editables = main.querySelectorAll('[contenteditable="true"]');
              var info = [];
              for (var i = 0; i < editables.length; i++) {
                var el = editables[i];
                info.push({
                  tag: el.tagName,
                  testid: el.getAttribute('data-testid'),
                  role: el.getAttribute('role'),
                  tab: el.getAttribute('data-tab'),
                  parent: el.parentElement ? el.parentElement.tagName : null
                });
              }
              return { hasMain: true, editables: info };
            })()
          `, true);
          console.warn('[BulkSender] Compose box not found. Diagnostic:', JSON.stringify(diag));
        } catch { /* ignore */ }

        // Que no aparezca el cuadro de texto NO prueba que el contacto no
        // tenga WhatsApp — solo que este chat no terminó de abrir. Antes se
        // reportaba como "Contacto no registrado en WhatsApp", que es falso y
        // además hace que el destinatario se saltee sin reintento.
        //
        // No se reintenta por "Nuevo chat": si el chat ya existe (que es el
        // caso cuando el buscador gana este camino), ese panel devuelve lo
        // mismo. Se reporta el timeout tal cual y el loop sigue.
        return {
          success: false,
          error: `El chat de ${phone} no terminó de abrir (${Math.round(COMPOSE_BOX_TIMEOUT_MS / 1000)}s)`,
          errorType: 'timeout'
        };
      }

      // Verify header contains phone suffix (soft check — warning only)
      const headerCheck = await this.whatsappView.webContents.executeJavaScript(`
        (function() {
          // DOM nuevo: data-testid="conversation-info-header-chat-title"
          var titleEl = document.querySelector('[data-testid="conversation-info-header-chat-title"]');
          if (titleEl) return (titleEl.textContent || '').trim() || 'no_header';
          // Fallback DOM viejo
          var header = document.querySelector('#main header span[title]') ||
                       document.querySelector('#main header span[dir="auto"]');
          if (!header) return 'no_header';
          return header.getAttribute('title') || header.textContent || '';
        })()
      `, true);

      if (headerCheck !== 'no_header' && !String(headerCheck).includes(phoneSuffix)) {
        console.warn(`[BulkSender] Header "${headerCheck}" does not match phone suffix "${phoneSuffix}" — proceeding (WhatsApp may show generic text)`);
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error de ejecución', errorType: 'unknown' };
    }
  }

  /**
   * Normaliza a formato internacional para "Nuevo chat", que necesita
   * código de país. Las tramas de cartera traen el celular local de 9 dígitos,
   * así que se antepone el código por defecto sólo cuando falta.
   */
  private toInternationalPhone(phone: string): string {
    const digits = (phone || '').replace(/\D/g, '');
    if (digits.length > LOCAL_PHONE_LENGTH) return digits; // ya trae código de país
    return DEFAULT_COUNTRY_CODE + digits;
  }

  /**
   * Fallback cuando el buscador de la lista de chats no encuentra el número.
   *
   * Ese buscador sólo alcanza conversaciones existentes y contactos agendados
   * en el teléfono vinculado, así que en una campaña sobre cartera nueva falla
   * siempre. El panel "Nuevo chat" tiene su propio buscador, que sí resuelve
   * números sueltos.
   *
   * IMPORTANTE: todo ocurre dentro de la SPA, sin navegar el frame principal.
   * La versión anterior de este fallback usaba el deep-link
   * (web.whatsapp.com/send?phone=...) y en producción las 2 veces que corrió
   * terminó con WhatsApp cerrando la sesión ~1 minuto después, obligando a
   * re-escanear el QR. Perder la sesión es mucho peor que saltear un número:
   * no volver a introducir una navegación de nivel superior acá.
   */
  private async navigateViaNewChat(phone: string): Promise<NavResult> {
    if (!this.whatsappView) {
      return { success: false, error: 'Vista de WhatsApp no disponible', errorType: 'unknown' };
    }

    const intlPhone = this.toInternationalPhone(phone);

    // 1. Abrir el panel "Nuevo chat".
    const opened = await this.whatsappView.webContents.executeJavaScript(`
      (function() {
        var btn = document.querySelector('[data-testid="chat"]') ||
                  document.querySelector('[data-icon="new-chat-outline"]') ||
                  document.querySelector('[data-icon="chat"]') ||
                  document.querySelector('[aria-label="Nuevo chat"]') ||
                  document.querySelector('[aria-label="New chat"]') ||
                  document.querySelector('[title="Nuevo chat"]');
        if (!btn) return false;
        (btn.closest('button') || btn).click();
        return true;
      })()
    `, true);

    if (!opened) {
      return {
        success: false,
        error: `No se encontró el botón "Nuevo chat" para ${phone}`,
        errorType: 'selector'
      };
    }

    // 2. Esperar el buscador del panel y escribir el número.
    const typed = await this.waitForCondition(`
      (function() {
        var input = document.querySelector('[data-testid="chat-list-search"]') ||
                    document.querySelector('[data-testid="search-input"]') ||
                    document.querySelector('input[data-tab="3"]') ||
                    document.querySelector('div[contenteditable="true"][data-tab="3"]');
        if (!input) return null;
        input.focus();
        input.click();
        return true;
      })()
    `, NEW_CHAT_TIMEOUT_MS, 300);

    if (!typed) {
      await this.cdpKey('Escape', 'Escape', 27);
      return {
        success: false,
        error: `El panel "Nuevo chat" no abrió para ${phone}`,
        errorType: 'timeout'
      };
    }

    await this.cdpClear();
    await this.cdpType(intlPhone);
    await this.sleep(2000);

    // 3. ¿Hay algún resultado seleccionable? WhatsApp muestra el número como
    //    contacto nuevo cuando existe, y un aviso cuando no está en WhatsApp.
    const outcome = await this.waitForCondition(`
      (function() {
        var body = (document.body && document.body.innerText) || '';
        if (body.indexOf('no está en WhatsApp') !== -1 ||
            body.indexOf('no figura en WhatsApp') !== -1 ||
            body.indexOf("isn't on WhatsApp") !== -1 ||
            body.indexOf('is not on WhatsApp') !== -1) {
          return 'not_registered';
        }
        var cell = document.querySelector('[data-testid="cell-frame-container"]') ||
                   document.querySelector('#pane-side [role="listitem"]');
        return cell ? 'has_result' : null;
      })()
    `, NEW_CHAT_TIMEOUT_MS, 400);

    if (outcome === 'not_registered') {
      await this.cdpKey('Escape', 'Escape', 27);
      return {
        success: false,
        error: `El número ${phone} no está en WhatsApp`,
        errorType: 'not_registered'
      };
    }

    if (outcome !== 'has_result') {
      await this.cdpKey('Escape', 'Escape', 27);
      return {
        success: false,
        error: `"Nuevo chat" no devolvió resultados para ${phone}`,
        errorType: 'not_found'
      };
    }

    // 4. Abrir el primer resultado y esperar el cuadro de texto.
    await this.cdpKey('ArrowDown', 'ArrowDown', 40);
    await this.sleep(200);
    await this.cdpKey('Enter', 'Enter', 13);

    const composeReady = await this.waitForCondition(`
      (function() {
        var box = document.querySelector('[data-testid="conversation-compose-box-input"]') ||
                  document.querySelector('footer div[contenteditable="true"]') ||
                  document.querySelector('#main div[contenteditable="true"][role="textbox"]') ||
                  document.querySelector('#main div[contenteditable="true"]');
        return box ? true : null;
      })()
    `, COMPOSE_BOX_TIMEOUT_MS, 300);

    if (!composeReady) {
      await this.cdpKey('Escape', 'Escape', 27);
      return {
        success: false,
        error: `El chat de ${phone} no terminó de abrir desde "Nuevo chat"`,
        errorType: 'timeout'
      };
    }

    console.log(`[BulkSender] Chat de ${intlPhone} abierto vía "Nuevo chat"`);
    return { success: true };
  }

  private async sendAndSubmit(text: string, expectedPhone?: string): Promise<{ success: boolean; error?: string }> {
    if (!this.whatsappView) {
      return { success: false, error: 'Vista de WhatsApp no disponible' };
    }

    try {
      // Step 1: Focus compose box via JS
      const focusResult = await this.whatsappView.webContents.executeJavaScript(`
        (function() {
          var input = document.querySelector('[data-testid="conversation-compose-box-input"]') ||
                      document.querySelector('footer div[contenteditable="true"]') ||
                      document.querySelector('#main div[contenteditable="true"][role="textbox"]') ||
                      document.querySelector('#main div[contenteditable="true"][data-tab]') ||
                      document.querySelector('#main div[contenteditable="true"]');
          if (!input) return { success: false, error: 'Cuadro de texto no encontrado' };
          input.focus();
          input.click();
          return { success: true };
        })()
      `, true);

      if (!focusResult.success) {
        return focusResult;
      }

      // Step 2: Clear and type message via CDP (focus-independent)
      await this.sleep(100);

      await this.cdpClear();
      await this.cdpType(text);

      // Wait for React to process
      await this.sleep(300);

      // Verify text was typed
      const textCheck = await this.whatsappView.webContents.executeJavaScript(`
        (function() {
          var input = document.querySelector('[data-testid="conversation-compose-box-input"]') ||
                      document.querySelector('footer div[contenteditable="true"]') ||
                      document.querySelector('#main div[contenteditable="true"][role="textbox"]') ||
                      document.querySelector('#main div[contenteditable="true"][data-tab]') ||
                      document.querySelector('#main div[contenteditable="true"]');
          return input ? (input.textContent || '').trim().length > 0 : false;
        })()
      `, true);

      if (!textCheck) {
        return { success: false, error: 'No se pudo escribir el texto en el chat' };
      }

      // Step 3: breve asentamiento antes de enviar (no es anti-ban)
      await this.sleep(150);

      // Step 3.5: Final chat verification before sending
      if (expectedPhone) {
        const finalCheck = await this.verifyCurrentChat(expectedPhone);
        if (!finalCheck.match) {
          console.warn(`[BulkSender] Chat changed right before Enter! Expected ${expectedPhone}, found "${finalCheck.actual}" — aborting send`);
          await this.cdpClear();
          return { success: false, error: 'CHAT_CHANGED' };
        }
      }

      // Step 4: Send via Enter key (CDP — focus-independent)
      await this.cdpKey('Enter', 'Enter', 13);

      // Step 5: Poll — verify compose box is empty after send (message was sent)
      const sentOk = await this.waitForCondition(`
        (function() {
          var input = document.querySelector('[data-testid="conversation-compose-box-input"]') ||
                      document.querySelector('footer div[contenteditable="true"]') ||
                      document.querySelector('#main div[contenteditable="true"][role="textbox"]') ||
                      document.querySelector('#main div[contenteditable="true"][data-tab]') ||
                      document.querySelector('#main div[contenteditable="true"]');
          if (!input) return null;
          var text = (input.textContent || '').trim();
          return text.length === 0 ? true : null;
        })()
      `, 5000, 300);

      if (!sentOk) {
        const rateLimited = await this.detectWhatsAppRateLimit();
        if (rateLimited) {
          return { success: false, error: 'RATE_LIMITED' };
        }
        return { success: false, error: 'Mensaje no enviado: el cuadro de texto aún tiene contenido' };
      }

      // Step 6: Soft-check — verify last outgoing message has a tick (warning only)
      await this.sleep(200);
      try {
        const hasTick = await this.whatsappView.webContents.executeJavaScript(`
          (function() {
            var msgs = document.querySelectorAll('[data-testid="msg-container"] [data-icon="msg-check"], [data-testid="msg-container"] [data-icon="msg-dblcheck"], [data-testid="msg-container"] [data-icon="msg-time"]');
            return msgs.length > 0;
          })()
        `, true);
        if (!hasTick) {
          console.warn('[BulkSender] No message tick found after send — may be slow network');
        }
      } catch { /* ignore tick check errors */ }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'js_execution_error' };
    }
  }

  // --- Media Sending ---

  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
      '.gif': 'image/gif', '.webp': 'image/webp', '.mp4': 'video/mp4',
      '.avi': 'video/x-msvideo', '.mov': 'video/quicktime',
      '.pdf': 'application/pdf', '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  private async sendMediaWithCaption(
    filePath: string,
    caption: string,
    mediaType: string,
    expectedPhone?: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.whatsappView) {
      return { success: false, error: 'Vista de WhatsApp no disponible' };
    }
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `Archivo no encontrado: ${filePath}` };
    }

    // Detect image by extension OR magic bytes (files may have wrong extension)
    const ext = path.extname(filePath).toLowerCase();
    let isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext);
    if (!isImage) {
      try {
        const header = Buffer.alloc(8);
        const fd = fs.openSync(filePath, 'r');
        fs.readSync(fd, header, 0, 8, 0);
        fs.closeSync(fd);
        const hex = header.toString('hex');
        isImage = hex.startsWith('ffd8ff') || hex.startsWith('89504e47') ||
                  hex.startsWith('47494638') || hex.startsWith('52494646');
      } catch { /* ignore, treat as non-image */ }
    }

    // Images must use clipboard (WhatsApp ignores untrusted DragEvents for images).
    // Non-images use drag-drop.
    if (isImage) {
      return this.sendImageViaClipboard(filePath, caption, expectedPhone);
    } else {
      return this.sendFileViaDragDrop(filePath, caption, expectedPhone);
    }
  }

  /**
   * Send an image via native clipboard + Ctrl+V.
   * Caption is typed FIRST in the compose box — WhatsApp auto-transfers it
   * to the caption field when the image is pasted.
   */
  private async sendImageViaClipboard(
    filePath: string,
    caption: string,
    expectedPhone?: string
  ): Promise<{ success: boolean; error?: string }> {
    // Helper to log in RENDERER (WhatsApp DevTools) instead of main process
    const rlog = (msg: string) => {
      if (!this.whatsappView) return;
      const safe = msg.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
      this.whatsappView.webContents.executeJavaScript(`console.log('[IMG] ${safe}')`, true).catch(() => {});
    };

    try {
      // 1. Load image and validate — detect real format from magic bytes, not extension
      const fileBuffer = fs.readFileSync(filePath);
      const headerHex = fileBuffer.subarray(0, 8).toString('hex');
      rlog(`Step 1: file=${filePath}, size=${fileBuffer.length} bytes, header=${headerHex}`);

      let mime = 'image/jpeg';
      if (headerHex.startsWith('89504e47')) mime = 'image/png';
      else if (headerHex.startsWith('47494638')) mime = 'image/gif';
      else if (headerHex.startsWith('52494646')) mime = 'image/webp';

      let image = nativeImage.createFromBuffer(fileBuffer);
      if (image.isEmpty()) {
        rlog(`Step 1 WARN: createFromBuffer failed, trying dataURL with mime=${mime}...`);
        image = nativeImage.createFromDataURL(`data:${mime};base64,${fileBuffer.toString('base64')}`);
      }
      if (image.isEmpty() && this.whatsappView) {
        // nativeImage can't decode (e.g. WebP) — convert via renderer canvas (Chromium CAN decode it)
        rlog('Step 1 WARN: nativeImage failed, converting via renderer canvas...');
        const base64 = fileBuffer.toString('base64');
        const pngDataUrl: string | null = await this.whatsappView.webContents.executeJavaScript(`
          (function() {
            return new Promise(function(resolve) {
              var img = new Image();
              img.onload = function() {
                var c = document.createElement('canvas');
                c.width = img.naturalWidth;
                c.height = img.naturalHeight;
                c.getContext('2d').drawImage(img, 0, 0);
                resolve(c.toDataURL('image/png'));
              };
              img.onerror = function() { resolve(null); };
              img.src = 'data:${mime};base64,${base64}';
            });
          })()
        `, true);
        if (pngDataUrl) {
          image = nativeImage.createFromDataURL(pngDataUrl);
          rlog('Step 1 OK: converted via canvas, size=' + image.getSize().width + 'x' + image.getSize().height);
        }
      }
      if (image.isEmpty()) {
        rlog('Step 1 FAIL: all methods failed');
        return { success: false, error: `No se pudo cargar la imagen (size=${fileBuffer.length}, mime=${mime})` };
      }
      rlog('Step 1 OK: image loaded, size=' + image.getSize().width + 'x' + image.getSize().height);

      // 2. Focus compose box (same selectors as sendAndSubmit)
      const focusResult = await this.whatsappView!.webContents.executeJavaScript(`
        (function() {
          console.log('[IMG] Step 2: focusing compose box...');
          var input = document.querySelector('[data-testid="conversation-compose-box-input"]') ||
                      document.querySelector('footer div[contenteditable="true"]') ||
                      document.querySelector('#main div[contenteditable="true"][role="textbox"]') ||
                      document.querySelector('#main div[contenteditable="true"][data-tab]') ||
                      document.querySelector('#main div[contenteditable="true"]');
          if (!input) {
            console.log('[IMG] Step 2 FAIL: compose box not found');
            return { success: false, error: 'Cuadro de texto no encontrado' };
          }
          input.focus();
          input.click();
          console.log('[IMG] Step 2 OK: compose box focused, tag=' + input.tagName + ' testid=' + input.getAttribute('data-testid'));
          return { success: true };
        })()
      `, true);

      if (!focusResult.success) {
        return focusResult;
      }

      // 3. Brief pause before typing (CDP doesn't need OS focus)
      await this.sleep(100);
      rlog('Step 3 OK: ready for CDP input');

      // 4. Clear and type caption FIRST via CDP (before pasting image)
      await this.cdpClear();
      if (caption) {
        await this.cdpType(caption);
        await this.sleep(300);
        rlog('Step 4 OK: caption typed (' + caption.length + ' chars)');
      } else {
        rlog('Step 4 OK: no caption to type');
      }

      // 5. Save clipboard, write image, paste, then restore clipboard
      const prevText = clipboard.readText();
      const prevImage = clipboard.readImage();
      const hadImage = !prevImage.isEmpty();

      clipboard.writeImage(image);
      await this.cdpKey('v', 'KeyV', 86, 2);  // 2 = Ctrl modifier

      // Restore previous clipboard content after a brief delay for paste to register
      await this.sleep(150);
      if (hadImage) {
        clipboard.writeImage(prevImage);
      } else if (prevText) {
        clipboard.writeText(prevText);
      } else {
        clipboard.clear();
      }
      rlog('Step 5 OK: clipboard.writeImage + CDP Ctrl+V + clipboard restored');

      // 6. Wait for media preview to appear
      // WhatsApp uses "Remove attachment" and "Add file" buttons in the media editor
      rlog('Step 6: waiting for media preview...');
      const previewReady = await this.waitForCondition(`
        (function() {
          // Aria-label flexibles (case-insensitive, español + inglés).
          var el = document.querySelector('[aria-label*="remove" i],[aria-label*="eliminar" i],[aria-label*="quitar" i]') ||
                   document.querySelector('[aria-label*="add file" i],[aria-label*="agregar archivo" i]') ||
                   document.querySelector('[aria-label*="crop" i],[aria-label*="recortar" i]') ||
                   document.querySelector('[data-testid="media-caption-input-container"]') ||
                   document.querySelector('span[data-icon="wds-ic-send-filled"], span[data-icon="wds-ic-send"], span[data-icon="send"]');
          return el ? true : null;
        })()
      `, 10000, 300);

      if (!previewReady) {
        rlog('Step 6 FAIL: preview timeout after 10s');
        return { success: false, error: 'Tiempo agotado esperando vista previa de imagen' };
      }
      rlog('Step 6 OK: media preview detected');

      await this.sleep(500);

      // 6.5. Final chat verification before sending media
      if (expectedPhone) {
        const finalCheck = await this.verifyCurrentChat(expectedPhone);
        if (!finalCheck.match) {
          console.warn(`[BulkSender] Chat changed before media send! Expected ${expectedPhone}, found "${finalCheck.actual}" — aborting`);
          // Press Escape to dismiss media preview without sending
          await this.cdpKey('Escape', 'Escape', 27);
          await this.sleep(300);
          return { success: false, error: 'CHAT_CHANGED' };
        }
      }

      // 7. Hide blocker + click send button
      const sendResult = await this.whatsappView!.webContents.executeJavaScript(`
        (async function() {
          try {
            console.log('[IMG] Step 7: starting send sequence...');

            // Hide chat blocker if present
            var blocker = document.getElementById('hablape-chat-blocker');
            if (blocker) {
              blocker.classList.add('hidden');
              console.log('[IMG] Chat blocker hidden');
            }

            // Find the Send button INSIDE the media editor (not the compose area one).
            // Strategy: find "Remove attachment" button, walk up DOM to find a shared
            // container that also has a Send button.
            var sendBtn = null;
            // Selectors aria-label flexibles (case-insensitive, español + inglés + variantes).
            var REMOVE_BTN_SEL = '[aria-label*="remove" i],[aria-label*="eliminar" i],[aria-label*="quitar" i],[aria-label*="add file" i],[aria-label*="agregar archivo" i]';
            var SEND_BTN_SEL = '[aria-label*="send" i],[aria-label*="enviar" i]';
            var removeBtn = document.querySelector('button' + REMOVE_BTN_SEL.replace(/,/g, ',button')) ||
                            document.querySelector(REMOVE_BTN_SEL);

            if (removeBtn) {
              console.log('[IMG] Found Remove/Add button, searching for Send in same container...');
              var container = removeBtn.parentElement;
              for (var depth = 0; depth < 10 && container; depth++) {
                var candidates = container.querySelectorAll(
                  'button' + SEND_BTN_SEL.replace(/,/g, ',button') + ',' +
                  '[role="button"]' + SEND_BTN_SEL.replace(/,/g, ',[role="button"]')
                );
                if (candidates.length > 0) {
                  sendBtn = candidates[0];
                  console.log('[IMG] Found Send button at depth ' + depth + ' from Remove/Add button');
                  break;
                }
                container = container.parentElement;
              }
            }

            // Fallback 1: wds-ic-send-filled icon (pick the one NOT in compose footer).
            // Acepta también wds-ic-send y data-icon="send" del DOM más viejo.
            if (!sendBtn) {
              var icons = document.querySelectorAll('span[data-icon="wds-ic-send-filled"], span[data-icon="wds-ic-send"], span[data-icon="send"]');
              console.log('[IMG] Fallback: found ' + icons.length + ' send icons');
              for (var i = 0; i < icons.length; i++) {
                var btn = icons[i].closest('button') || icons[i].closest('[role="button"]') || icons[i].parentElement;
                if (btn) {
                  var inFooter = btn.closest('footer');
                  var r = btn.getBoundingClientRect();
                  console.log('[IMG]   icon[' + i + ']: ' + Math.round(r.x) + ',' + Math.round(r.y) + ' inFooter=' + !!inFooter);
                  if (!inFooter && r.width > 0 && r.height > 0) {
                    sendBtn = btn;
                    console.log('[IMG] Using non-footer send icon at ' + Math.round(r.x) + ',' + Math.round(r.y));
                    break;
                  }
                }
              }
            }

            // Fallback 2: cualquier botón/role con aria-label send/enviar fuera del footer.
            if (!sendBtn) {
              var allSends = document.querySelectorAll(
                'button' + SEND_BTN_SEL.replace(/,/g, ',button') + ',' +
                '[role="button"]' + SEND_BTN_SEL.replace(/,/g, ',[role="button"]')
              );
              console.log('[IMG] Fallback 2: found ' + allSends.length + ' Send buttons/roles');
              for (var i = 0; i < allSends.length; i++) {
                var inFooter = allSends[i].closest('footer');
                var r = allSends[i].getBoundingClientRect();
                console.log('[IMG]   Send[' + i + ']: ' + Math.round(r.x) + ',' + Math.round(r.y) + ' inFooter=' + !!inFooter + ' aria=' + allSends[i].getAttribute('aria-label'));
                if (!inFooter && r.width > 0 && r.height > 0) {
                  sendBtn = allSends[i];
                  break;
                }
              }
            }

            if (!sendBtn) {
              console.error('[IMG] Step 7 FAIL: NO media editor send button found. Ejecuta __hablapeDebugMediaEditor() para diagnóstico.');
              return { success: false, error: 'Botón de enviar no encontrado en media preview' };
            }

            var btnRect = sendBtn.getBoundingClientRect();
            console.log('[IMG] Step 7: clicking Send at ' + Math.round(btnRect.x) + ',' + Math.round(btnRect.y) + ' tag=' + sendBtn.tagName + ' role=' + sendBtn.getAttribute('role'));
            sendBtn.click();
            console.log('[IMG] Step 7: click() dispatched');

            // Wait for media editor to close: el "Remove attachment" desaparece
            // o el caption-input-container ya no existe.
            var timeout = 8000;
            var start = Date.now();
            while (Date.now() - start < timeout) {
              var stillOpen = document.querySelector(REMOVE_BTN_SEL) ||
                              document.querySelector('[data-testid="media-caption-input-container"]');
              if (!stillOpen) {
                console.log('[IMG] Step 7 OK: media editor closed after ' + (Date.now() - start) + 'ms');
                return { success: true };
              }
              await new Promise(function(r) { setTimeout(r, 300); });
            }

            console.warn('[IMG] Step 7 WARN: media editor did NOT close after 8s');
            return { success: true };
          } catch(e) {
            console.error('[IMG] Step 7 ERROR:', e.message || e);
            return { success: false, error: e.message || 'send_click_error' };
          }
        })()
      `, true);

      rlog('Step 8: sendResult=' + JSON.stringify(sendResult));

      if (!sendResult.success) {
        return sendResult;
      }

      await this.sleep(500);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'clipboard_send_error' };
    }
  }

  /**
   * Send a non-image file via drag-and-drop simulation (fallback).
   * Uses untrusted DragEvents — may not work for all file types if WhatsApp
   * ignores untrusted drops, but covers the main image path via clipboard above.
   */
  private async sendFileViaDragDrop(
    filePath: string,
    caption: string,
    expectedPhone?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Verify chat before starting drag-drop (can't check mid-JS)
      if (expectedPhone) {
        const finalCheck = await this.verifyCurrentChat(expectedPhone);
        if (!finalCheck.match) {
          console.warn(`[BulkSender] Chat changed before file send! Expected ${expectedPhone}, found "${finalCheck.actual}" — aborting`);
          return { success: false, error: 'CHAT_CHANGED' };
        }
      }

      const fileBuffer = fs.readFileSync(filePath);
      const base64Data = fileBuffer.toString('base64');
      const mimeType = this.getMimeType(filePath);
      const fileName = path.basename(filePath);

      const result = await this.whatsappView!.webContents.executeJavaScript(`
        (async function() {
          try {
            // --- Create File from base64 ---
            var base64 = ${JSON.stringify(base64Data)};
            var binaryStr = atob(base64);
            var bytes = new Uint8Array(binaryStr.length);
            for (var i = 0; i < binaryStr.length; i++) {
              bytes[i] = binaryStr.charCodeAt(i);
            }
            var file = new File([bytes], ${JSON.stringify(fileName)}, { type: ${JSON.stringify(mimeType)} });

            // --- Simulate drag-and-drop onto chat area ---
            var dt = new DataTransfer();
            dt.items.add(file);

            var dropTarget = document.querySelector('#main .copyable-area') ||
                             document.querySelector('div#main') ||
                             document.querySelector('[data-testid="conversation-panel-wrapper"]');

            if (!dropTarget) {
              return { success: false, error: 'Área de chat no encontrada para enviar archivo' };
            }

            dropTarget.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
            await new Promise(function(r) { setTimeout(r, 100); });
            dropTarget.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
            await new Promise(function(r) { setTimeout(r, 100); });
            dropTarget.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));

            // --- Wait for WhatsApp to process and show preview ---
            var previewTimeout = 8000;
            var previewInterval = 300;
            var previewStart = Date.now();
            var previewReady = false;
            while (Date.now() - previewStart < previewTimeout) {
              var previewEl = document.querySelector('[data-testid="media-caption-input-container"]') ||
                              document.querySelector('[data-testid="send"]') ||
                              document.querySelector('span[data-icon="send"]');
              if (previewEl) { previewReady = true; break; }
              await new Promise(function(r) { setTimeout(r, previewInterval); });
            }
            if (!previewReady) {
              return { success: false, error: 'Tiempo agotado esperando vista previa del archivo' };
            }

            // --- Write caption if present ---
            var captionText = ${JSON.stringify(caption)};
            if (captionText) {
              var captionInput = document.querySelector('[data-testid="media-caption-input-container"] div[contenteditable="true"]') ||
                                 document.querySelector('div[data-testid="media-caption-input"]') ||
                                 document.querySelector('.copyable-area div[contenteditable="true"][data-tab]');
              if (captionInput) {
                captionInput.focus();
                captionInput.textContent = '';
                document.execCommand('insertText', false, captionText);
                captionInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
                await new Promise(function(r) { setTimeout(r, 500); });
              }
            }

            // --- Click send ---
            var sendBtn = document.querySelector('[data-testid="send"]') ||
                          document.querySelector('span[data-icon="send"]')?.closest('button');

            if (!sendBtn) {
              return { success: false, error: 'Botón de enviar no encontrado después de adjuntar' };
            }

            sendBtn.click();

            // Poll for media preview overlay to disappear (confirms send started)
            var sendTimeout = 5000;
            var sendInterval = 300;
            var sendStart = Date.now();
            while (Date.now() - sendStart < sendTimeout) {
              var overlay = document.querySelector('[data-testid="media-caption-input-container"]');
              if (!overlay) break;
              await new Promise(function(r) { setTimeout(r, sendInterval); });
            }

            // Extra brief wait for message to register
            await new Promise(function(r) { setTimeout(r, 500); });

            return { success: true };
          } catch(e) {
            return { success: false, error: e.message || 'media_send_error' };
          }
        })()
      `, true);

      return result;
    } catch (err: any) {
      return { success: false, error: err.message || 'media_send_error' };
    }
  }

  // --- Overlay ---

  private async showOverlay(): Promise<void> {
    if (!this.whatsappView) return;
    try {
      await this.whatsappView.webContents.executeJavaScript(`
        (function() {
          // Remove existing overlay if any
          const existing = document.getElementById('bulk-send-overlay');
          if (existing) existing.remove();

          const overlay = document.createElement('div');
          overlay.id = 'bulk-send-overlay';
          overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;pointer-events:auto;';
          overlay.innerHTML = \`
            <div style="background:white;border-radius:16px;padding:32px;text-align:center;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
              <div style="width:60px;height:60px;border-radius:50%;background:#4361ee;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                </svg>
              </div>
              <h3 style="margin:0 0 8px;font-size:20px;color:#1a1a2e;">Envío masivo en curso</h3>
              <p id="bulk-overlay-status" style="margin:0 0 16px;font-size:14px;color:#6c757d;">Iniciando...</p>
              <div style="background:#e9ecef;border-radius:8px;height:8px;overflow:hidden;margin-bottom:8px;">
                <div id="bulk-overlay-progress" style="height:100%;background:#4361ee;border-radius:8px;transition:width 0.3s;width:0%"></div>
              </div>
              <p id="bulk-overlay-count" style="margin:0 0 20px;font-size:13px;color:#999;">0 / 0 enviados</p>
              <p style="font-size:12px;color:#aaa;margin:0;">WhatsApp está bloqueado durante el envío masivo</p>
            </div>
          \`;
          document.body.appendChild(overlay);
        })()
      `);
    } catch (err) {
      console.warn('[BulkSender] Failed to show overlay:', err);
    }
  }

  async dismissOverlay(): Promise<void> {
    await this.hideOverlay();
  }

  private async hideOverlay(): Promise<void> {
    if (!this.whatsappView) return;
    try {
      await this.whatsappView.webContents.executeJavaScript(`
        (function() {
          const overlay = document.getElementById('bulk-send-overlay');
          if (overlay) overlay.remove();
        })()
      `);
    } catch (err) {
      console.warn('[BulkSender] Failed to hide overlay:', err);
    }
  }

  private async updateOverlay(): Promise<void> {
    if (!this.whatsappView) return;
    const pct = this.totalRecipients > 0 ? Math.round((this.sentCount + this.failedCount) * 100 / this.totalRecipients) : 0;
    try {
      await this.whatsappView.webContents.executeJavaScript(`
        (function() {
          const status = document.getElementById('bulk-overlay-status');
          const progress = document.getElementById('bulk-overlay-progress');
          const count = document.getElementById('bulk-overlay-count');
          if (status) status.textContent = 'Enviando a ${(this.currentPhone || '').replace(/'/g, "\\'")}...';
          if (progress) progress.style.width = '${pct}%';
          if (count) count.textContent = '${this.sentCount} / ${this.totalRecipients} enviados' + (${this.failedCount} > 0 ? ' (${this.failedCount} fallidos)' : '');
        })()
      `);
    } catch { /* ignore */ }
  }

  // --- API Communication ---

  private async fetchRules(): Promise<void> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/app/bulk_sends/${this.bulkSendId}/rules`, {
        headers: this.getHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        if (data.rules) {
          const enabled = data.rules.enabled !== false;
          if (enabled) {
            this.rules = {
              min_delay_seconds: data.rules.min_delay_seconds ?? DEFAULT_RULES.min_delay_seconds,
              max_delay_seconds: data.rules.max_delay_seconds ?? DEFAULT_RULES.max_delay_seconds,
              pause_after_count: data.rules.pause_after_count ?? DEFAULT_RULES.pause_after_count,
              pause_duration_minutes: data.rules.pause_duration_minutes ?? DEFAULT_RULES.pause_duration_minutes,
              send_hour_start: data.rules.send_hour_start ?? DEFAULT_RULES.send_hour_start,
              send_hour_end: data.rules.send_hour_end ?? DEFAULT_RULES.send_hour_end,
              max_daily_messages: data.rules.max_daily_messages ?? DEFAULT_RULES.max_daily_messages,
              enabled: true
            };
          } else {
            // Rules disabled — use permissive values (minimal delays to avoid WhatsApp ban)
            this.rules = {
              min_delay_seconds: 5,
              max_delay_seconds: 10,
              pause_after_count: Number.MAX_SAFE_INTEGER,
              pause_duration_minutes: 0,
              send_hour_start: 0,
              send_hour_end: 24,
              max_daily_messages: Number.MAX_SAFE_INTEGER,
              enabled: false
            };
          }
          console.log(`[BulkSender] Reglas cargadas del servidor (enabled=${enabled}):`, JSON.stringify(this.rules));
        }
      } else {
        console.error(`[BulkSender] Error al obtener reglas (HTTP ${response.status}) — usando valores por defecto`);
      }
    } catch (err) {
      console.error('[BulkSender] Error al obtener reglas, usando valores por defecto:', err);
    }
  }

  private async fetchNextRecipient(): Promise<any> {
    if (!this.bulkSendId) {
      console.warn('[BulkSender] bulkSendId is null, skipping fetchNextRecipient');
      return null;
    }
    try {
      const response = await fetch(`${this.apiBaseUrl}/app/bulk_sends/${this.bulkSendId}/next-recipient`, {
        headers: this.getHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        if (data.total_recipients !== undefined) {
          this.totalRecipients = data.total_recipients;
        }
        return data;
      }
      return null;
    } catch (err) {
      console.error('[BulkSender] Failed to fetch next recipient:', err);
      return null;
    }
  }

  private async reportResult(recipientId: number, success: boolean, errorMessage?: string, action?: string): Promise<void> {
    if (!this.bulkSendId) {
      console.warn('[BulkSender] bulkSendId is null, skipping reportResult');
      return;
    }
    try {
      await fetch(`${this.apiBaseUrl}/app/bulk_sends/${this.bulkSendId}/recipient-result`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ recipientId, success, errorMessage: errorMessage || null, action: action || null })
      });
    } catch (err) {
      console.error('[BulkSender] Failed to report result:', err);
    }
  }

  private async notifyBackend(action: 'pause' | 'resume' | 'cancel' | 'periodic_pause' | 'periodic_resume'): Promise<void> {
    if (!this.bulkSendId) {
      console.warn(`[BulkSender] bulkSendId is null, skipping notifyBackend(${action})`);
      return;
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      await fetch(`${this.apiBaseUrl}/app/bulk_sends/${this.bulkSendId}/${action}`, {
        method: 'POST',
        headers: this.getHeaders(),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
    } catch (err) {
      console.error(`[BulkSender] Failed to notify backend (${action}):`, err);
    }
  }

  /**
   * Download the bulk send attachment from the backend to a local temp directory.
   * Reuses the local file if already downloaded (same bulk send, multiple recipients).
   */
  private async downloadAttachment(bulkSendId: number, originalName: string): Promise<string> {
    const tempDir = path.join(app.getPath('temp'), `bulk_send_${bulkSendId}`);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const localPath = path.join(tempDir, originalName);

    // Reuse if already downloaded for this bulk send
    if (fs.existsSync(localPath)) {
      return localPath;
    }

    console.log(`[BulkSender] Downloading attachment from backend for bulk send ${bulkSendId}...`);
    const response = await net.fetch(`${this.apiBaseUrl}/app/bulk_sends/${bulkSendId}/attachment/download`, {
      headers: { 'Authorization': `Bearer ${this.authToken}` }
    });

    if (!response.ok) {
      throw new Error(`Error descargando adjunto: HTTP ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(localPath, buffer);
    console.log(`[BulkSender] Attachment downloaded to ${localPath} (${buffer.length} bytes)`);
    return localPath;
  }

  // --- Bulk Send Active Flag (disables chat blocker) ---

  private async setBulkSendActiveFlag(active: boolean): Promise<void> {
    if (!this.whatsappView) return;
    try {
      await this.whatsappView.webContents.executeJavaScript(
        `window.__hablapeBulkSendActive = ${active};`
      );
    } catch { /* ignore */ }
  }

  // --- Session Check ---

  private async checkWhatsAppSession(): Promise<boolean> {
    if (!this.whatsappView) return false;
    try {
      return await this.whatsappView.webContents.executeJavaScript(`
        (function() {
          var qr = document.querySelector('[data-testid="qrcode"]') || document.querySelector('canvas[aria-label]');
          var chatList = document.querySelector('#pane-side');
          return !qr && !!chatList;
        })()
      `, true);
    } catch {
      return false;
    }
  }

  // --- Rate Limit Detection ---

  private async detectWhatsAppRateLimit(): Promise<boolean> {
    try {
      const result = await this.whatsappView?.webContents.executeJavaScript(`
        (() => {
          const popups = document.querySelectorAll('[data-testid="popup-overlay"], [role="dialog"], [data-testid="drawer"]');
          for (const popup of popups) {
            const text = (popup.textContent || '').toLowerCase();
            if (text.includes('too many') || text.includes('demasiados') ||
                text.includes('wait') || text.includes('espera') ||
                text.includes('try again later') || text.includes('intenta más tarde') ||
                text.includes('temporarily blocked') || text.includes('bloqueado temporalmente')) {
              return true;
            }
          }
          return false;
        })()
      `);
      return result === true;
    } catch {
      return false;
    }
  }

  // --- Helpers ---

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.authToken}`
    };
  }

  private getRandomDelay(): number {
    const min = this.rules.min_delay_seconds * 1000;
    const max = this.rules.max_delay_seconds * 1000;
    return min + Math.random() * (max - min);
  }

  private isWithinSendHours(): boolean {
    // Check Lima timezone (UTC-5)
    const now = new Date();
    const limaOffset = -5 * 60;
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    const limaTime = new Date(utcMs + limaOffset * 60000);
    const hour = limaTime.getHours();
    return hour >= this.rules.send_hour_start && hour < this.rules.send_hour_end;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Type text character by character using Electron's sendInputEvent.
   * Generates real Chromium keyboard events (keyDown/char/keyUp) that React detects.
   */
  private async typeViaKeyboard(text: string): Promise<void> {
    if (!this.whatsappView) return;
    for (const char of text) {
      this.whatsappView.webContents.sendInputEvent({ type: 'keyDown', keyCode: char });
      this.whatsappView.webContents.sendInputEvent({ type: 'char', keyCode: char });
      this.whatsappView.webContents.sendInputEvent({ type: 'keyUp', keyCode: char });
      await this.sleep(30 + Math.random() * 20);
    }
  }

  /**
   * @deprecated Use cdpClear() instead — works without OS window focus.
   */
  private async clearInputViaKeyboard(): Promise<void> {
    if (!this.whatsappView) return;
    this.whatsappView.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'a', modifiers: ['control'] });
    this.whatsappView.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'a', modifiers: ['control'] });
    await this.sleep(50);
    this.whatsappView.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Backspace' });
    this.whatsappView.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Backspace' });
    await this.sleep(50);
  }

  // --- CDP (Chrome DevTools Protocol) keyboard helpers ---
  // These generate isTrusted=true events that work WITHOUT OS window focus.

  private async ensureCdpAttached(): Promise<void> {
    if (this.cdpAttached || !this.whatsappView) return;
    try {
      this.whatsappView.webContents.debugger.attach('1.3');
      this.cdpAttached = true;
    } catch (e: any) {
      if (e.message?.includes('Already attached')) this.cdpAttached = true;
      else throw e;
    }
  }

  private async cdpKey(key: string, code: string, vkCode: number, modifiers = 0): Promise<void> {
    if (!this.whatsappView) return;
    await this.ensureCdpAttached();
    const dbg = this.whatsappView.webContents.debugger;
    const base = { key, code, windowsVirtualKeyCode: vkCode, nativeVirtualKeyCode: vkCode, modifiers };
    await dbg.sendCommand('Input.dispatchKeyEvent', { ...base, type: 'keyDown' });
    await dbg.sendCommand('Input.dispatchKeyEvent', { ...base, type: 'keyUp' });
  }

  private async cdpType(text: string): Promise<void> {
    if (!this.whatsappView) return;
    await this.ensureCdpAttached();
    const dbg = this.whatsappView.webContents.debugger;
    // Sin sleep entre teclas: la escritura va lo más rápido posible. El await
    // de cada sendCommand ya serializa los eventos en orden. El anti-ban real
    // es la demora aleatoria de 30-90 s ENTRE mensajes, no la velocidad de
    // tecleo (un paste sería instantáneo de todas formas).
    for (const char of text) {
      const code = char >= 'a' && char <= 'z' ? 'Key' + char.toUpperCase()
                 : char >= '0' && char <= '9' ? 'Digit' + char : '';
      await dbg.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyDown', key: char, code, text: char,
        windowsVirtualKeyCode: char.charCodeAt(0), nativeVirtualKeyCode: char.charCodeAt(0)
      });
      await dbg.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyUp', key: char, code,
        windowsVirtualKeyCode: char.charCodeAt(0), nativeVirtualKeyCode: char.charCodeAt(0)
      });
    }
  }

  private async cdpClear(): Promise<void> {
    await this.cdpKey('a', 'KeyA', 65, 2);  // 2 = Ctrl modifier
    await this.sleep(50);
    await this.cdpKey('Backspace', 'Backspace', 8);
    await this.sleep(50);
  }

  detachCdp(): void {
    if (!this.cdpAttached || !this.whatsappView) return;
    try {
      this.whatsappView.webContents.debugger.detach();
    } catch { /* ignore */ }
    this.cdpAttached = false;
  }
}