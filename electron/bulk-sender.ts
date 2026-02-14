/**
 * BulkSender - Electron bulk messaging engine with anti-ban measures
 * Polls the backend for next recipient, navigates to chat, sends message,
 * and reports result. Respects configurable rate limiting and pauses.
 */

import { app, BrowserView, clipboard, net, nativeImage } from 'electron';
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
}

export interface BulkSenderStatus {
  bulkSendId: number | null;
  state: 'idle' | 'running' | 'paused' | 'cancelled' | 'completed' | 'error';
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
}) => void;

const DEFAULT_RULES: BulkSendRules = {
  min_delay_seconds: 30,
  max_delay_seconds: 90,
  pause_after_count: 20,
  pause_duration_minutes: 5,
  send_hour_start: 8,
  send_hour_end: 20,
  max_daily_messages: 200
};

export class BulkSender {
  private bulkSendId: number | null = null;
  private apiBaseUrl: string;
  private authToken: string = '';
  private rules: BulkSendRules = { ...DEFAULT_RULES };
  private whatsappView: BrowserView | null = null;
  private onOverlayUpdate: OverlayUpdateCallback | null = null;

  private _state: 'idle' | 'running' | 'paused' | 'cancelled' | 'completed' | 'error' = 'idle';
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
        currentPhone: this.currentPhone
      });
    }
    this.persistState();
    this.updateOverlay();
  }

  setWhatsAppView(view: BrowserView | null): void {
    this.whatsappView = view;
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
    await this.processLoop();

    // Hide overlay when done
    await this.hideOverlay();

    // Re-enable chat blocker
    await this.setBulkSendActiveFlag(false);

    return { success: true };
  }

  pause(): void {
    console.log(`[BulkSender] Pausing bulk send ${this.bulkSendId}`);
    this.isPaused = true;
    this._state = 'paused';
    this.notifyBackend('pause');
    this.emitOverlayUpdate();
    this.hideOverlay();
  }

  resume(): void {
    if (this._state !== 'paused') return;
    console.log(`[BulkSender] Resuming bulk send ${this.bulkSendId}`);
    this.isPaused = false;
    this._state = 'running';
    this.notifyBackend('resume');
    this.showOverlay();
    this.processLoop().then(() => this.hideOverlay());
  }

  cancel(): void {
    console.log(`[BulkSender] Cancelling bulk send ${this.bulkSendId}`);
    this.isCancelled = true;
    this._state = 'cancelled';
    this.notifyBackend('cancel');
    this.emitOverlayUpdate();
    this.clearPersistedState();
    this.cleanupTempAttachment();
    this.hideOverlay();
    this.setBulkSendActiveFlag(false);
  }

  private async processLoop(): Promise<void> {
    let messagesSinceLastPause = 0;

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
        this.emitOverlayUpdate();
        return;
      }

      // Fetch next recipient
      const next = await this.fetchNextRecipient();
      if (!next || !next.has_next) {
        this._state = 'completed';
        this.emitOverlayUpdate();
        this.clearPersistedState();
        this.cleanupTempAttachment();
        console.log(`[BulkSender] Bulk send ${this.bulkSendId} completed: ${this.sentCount} sent, ${this.failedCount} failed`);
        return;
      }

      this.currentPhone = next.phone;
      const content = next.content || '';
      const recipientId = next.recipient_id;
      const hasAttachment = !!next.attachment_path;

      // Validate phone
      if (!next.phone || next.phone.trim().length < 5) {
        console.warn(`[BulkSender] Invalid phone "${next.phone}" for recipient ${recipientId} — skipping`);
        await this.reportResult(recipientId, false, 'Teléfono inválido: vacío o muy corto', 'SKIP');
        this.failedCount++;
        this.emitOverlayUpdate();
        await this.sleep(1000);
        continue;
      }

      this.emitOverlayUpdate();

      console.log(`[BulkSender] Sending to ${next.phone} (${next.recipient_name || 'Unknown'})`);

      // Navigate to chat
      const navResult = await this.navigateToChat(next.phone);

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

          // Short delay before next (no need to wait full inter-message delay)
          const skipDelay = 2000 + Math.random() * 3000;
          console.log(`[BulkSender] Skip delay: ${Math.round(skipDelay / 1000)}s`);
          await this.sleep(skipDelay);
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
        // Random delay to simulate typing
        const typingDelay = 500 + Math.random() * 1000;
        await this.sleep(typingDelay);

        // Send message (with or without attachment)
        if (hasAttachment) {
          // Download attachment from backend to local temp (server path is not accessible on Windows)
          const localAttachmentPath = await this.downloadAttachment(
            this.bulkSendId!,
            next.attachment_original_name || path.basename(next.attachment_path)
          );
          const sendResult = await this.sendMediaWithCaption(
            localAttachmentPath,
            content,
            next.attachment_type || 'document'
          );
          if (!sendResult.success) {
            throw new Error(`Failed to send media: ${sendResult.error}`);
          }
        } else {
          const sendResult = await this.sendAndSubmit(content);
          if (!sendResult.success) {
            throw new Error(`Failed to send message: ${sendResult.error}`);
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

        // Backoff on consecutive failures
        if (this.consecutiveFailures >= 5) {
          console.warn('[BulkSender] 5 consecutive failures - auto-pausing');
          this.isPaused = true;
          this._state = 'paused';
          this.lastError = 'Pausado automáticamente tras 5 fallos consecutivos';
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

      // Periodic pause (anti-ban)
      if (messagesSinceLastPause >= this.rules.pause_after_count) {
        const pauseMs = this.rules.pause_duration_minutes * 60 * 1000;
        console.log(`[BulkSender] Periodic pause: ${this.rules.pause_duration_minutes} minutes`);
        await this.sleep(pauseMs);
        messagesSinceLastPause = 0;
      }

      // Random delay between messages
      const delay = this.getRandomDelay();
      console.log(`[BulkSender] Waiting ${Math.round(delay / 1000)}s before next...`);
      await this.sleep(delay);
    }
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
      // Use executeJavaScript to dispatch KeyboardEvent (works without OS-level focus)
      for (let i = 0; i < 3; i++) {
        await this.whatsappView.webContents.executeJavaScript(`
          (function() {
            var el = document.activeElement || document.body;
            el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
          })()
        `);
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
        // Clear search text via real keyboard events (Ctrl+A, Backspace)
        this.whatsappView.webContents.focus();
        await this.clearInputViaKeyboard();
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

      // --- PHASE 2A: Click search box and focus the search input via JS ---
      const searchFocus = await this.whatsappView.webContents.executeJavaScript(`
        (async function() {
          try {
            // Click search box to open search
            var searchBox = document.querySelector('[data-testid="chat-list-search"]');
            if (!searchBox) {
              searchBox = document.querySelector('[data-icon="search"]')?.closest('button') ||
                          document.querySelector('#side [contenteditable="true"]');
            }
            if (!searchBox) return { success: false, error: 'Buscador no encontrado' };

            searchBox.click();
            await new Promise(function(r) { setTimeout(r, 400); });

            // Find and focus the search input
            var input = document.querySelector('[data-testid="chat-list-search-input"]');
            if (!input) {
              input = document.querySelector('#side div[contenteditable="true"]') ||
                      document.querySelector('[data-testid="search-input"]');
            }
            if (!input) return { success: false, error: 'Campo de búsqueda no encontrado' };

            input.focus();
            input.click();

            var focusInfo = document.activeElement ?
              (document.activeElement.tagName + ' editable=' + document.activeElement.getAttribute('contenteditable') + ' testid=' + document.activeElement.getAttribute('data-testid')) : 'null';
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

      // --- PHASE 2B: Give BrowserView Chromium-level focus, then type via real keyboard events ---
      this.whatsappView.webContents.focus();
      await this.sleep(100);

      // Clear any existing text in the search input
      await this.clearInputViaKeyboard();

      // Type phone number character by character (real Chromium keyDown/char/keyUp events)
      await this.typeViaKeyboard(normalizedPhone);

      // Wait for WhatsApp to process the search query
      await this.sleep(500);

      // Verify text was typed
      const verifyResult = await this.whatsappView.webContents.executeJavaScript(`
        (function() {
          var input = document.querySelector('[data-testid="chat-list-search-input"]') ||
                      document.querySelector('#side div[contenteditable="true"]');
          var content = input ? (input.textContent || '').trim() : '';
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

            var selectors = [
              '[data-testid="cell-frame-container"]',
              '#pane-side [role="listitem"]',
              '#pane-side [role="row"]'
            ];
            var seen = new Set();
            var count = 0;
            for (var s = 0; s < selectors.length; s++) {
              var els = document.querySelectorAll(selectors[s]);
              for (var j = 0; j < els.length; j++) {
                if (!seen.has(els[j])) { seen.add(els[j]); count++; }
              }
            }
            return { status: 'has_results', count: count };
          })()
        `, true);

        if (searchCheck.status === 'no_results') break;
        if (searchCheck.count <= 15) break; // Filtered OK

        // Too many results — search didn't filter. Retry: clear, escape, re-enter search
        if (attempt < 2) {
          console.warn(`[BulkSender] Búsqueda no filtró (${searchCheck.count} items), reintentando (${attempt + 1}/2)...`);
          await this.clearInputViaKeyboard();
          await this.sleep(300);
          // Press Escape to exit search mode (via JS dispatch, works without OS focus)
          await this.whatsappView.webContents.executeJavaScript(`
            (function() {
              var el = document.activeElement || document.body;
              el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
              el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
            })()
          `);
          await this.sleep(500);
          // Re-click search box
          await this.whatsappView.webContents.executeJavaScript(`
            (function() {
              var searchBox = document.querySelector('[data-testid="chat-list-search"]') ||
                              document.querySelector('[data-icon="search"]')?.closest('button') ||
                              document.querySelector('#side [contenteditable="true"]');
              if (searchBox) searchBox.click();
            })()
          `, true);
          await this.sleep(500);
          // Re-focus input and re-type
          await this.whatsappView.webContents.executeJavaScript(`
            (function() {
              var input = document.querySelector('[data-testid="chat-list-search-input"]') ||
                          document.querySelector('#side div[contenteditable="true"]');
              if (input) { input.focus(); input.click(); }
            })()
          `, true);
          this.whatsappView.webContents.focus();
          await this.sleep(200);
          await this.clearInputViaKeyboard();
          await this.sleep(200);
          await this.typeViaKeyboard(normalizedPhone);
        }
      }

      // Final check after retries
      if (searchCheck.status === 'no_results') {
        console.log(`[BulkSender] Phone ${phone} not registered in WhatsApp`);
        return { success: false, error: `No se encontraron resultados para ${phone}`, errorType: 'not_registered' };
      }

      if (searchCheck.count > 15) {
        console.warn(`[BulkSender] Búsqueda no filtró tras 3 intentos (${searchCheck.count} resultados) para ${normalizedPhone}`);
        return { success: false, error: `Búsqueda no filtró tras 3 intentos (${searchCheck.count} resultados)`, errorType: 'timeout' };
      }

      console.log(`[BulkSender] Search filtered to ${searchCheck.count} items, selecting via keyboard`);

      // Click the first matching search result directly (avoids isTrusted issues with keyboard events)
      const clickResult = await this.whatsappView.webContents.executeJavaScript(`
        (function() {
          var results = document.querySelectorAll('[data-testid="cell-frame-container"]');
          if (results.length === 0) results = document.querySelectorAll('#pane-side [role="listitem"]');
          if (results.length === 0) results = document.querySelectorAll('#pane-side [role="row"]');
          var target = null;
          var phone = '${normalizedPhone}';
          var suffix = phone.slice(-8);
          // Priority 1: result containing the phone number
          for (var i = 0; i < results.length; i++) {
            var text = (results[i].textContent || '');
            if (text.indexOf(phone) !== -1 || text.indexOf(suffix) !== -1) {
              target = results[i];
              break;
            }
          }
          // Priority 2: first result that's NOT "Message yourself"
          if (!target) {
            for (var i = 0; i < results.length; i++) {
              var text = (results[i].textContent || '').toLowerCase();
              if (text.indexOf('message yourself') === -1 &&
                  text.indexOf('envíate') === -1 &&
                  text.indexOf('tú') === -1) {
                target = results[i];
                break;
              }
            }
          }
          // Priority 3: first result
          if (!target && results.length > 0) target = results[0];
          if (target) target.click();
          return target ? true : false;
        })()
      `);

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
      `, 5000, 300);

      if (!composeReady) {
        // Diagnostic: log what's in #main to debug selector issues
        try {
          const diag = await this.whatsappView.webContents.executeJavaScript(`
            (function() {
              var main = document.querySelector('#main');
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
        return { success: false, error: 'Contacto no registrado en WhatsApp', errorType: 'not_registered' };
      }

      // Verify header contains phone suffix (soft check — warning only)
      const headerCheck = await this.whatsappView.webContents.executeJavaScript(`
        (function() {
          var header = document.querySelector('#main header span[title]');
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

  private async sendAndSubmit(text: string): Promise<{ success: boolean; error?: string }> {
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

      // Step 2: Give BrowserView Chromium-level focus, clear, and type message
      this.whatsappView.webContents.focus();
      await this.sleep(100);

      await this.clearInputViaKeyboard();
      await this.typeViaKeyboard(text);

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

      // Step 3: Typing simulation delay
      await this.sleep(500 + Math.random() * 1000);

      // Step 4: Send via Enter key (JS dispatch, works without OS focus)
      await this.whatsappView.webContents.executeJavaScript(`
        (function() {
          var input = document.querySelector('[data-testid="conversation-compose-box-input"]') ||
                      document.querySelector('footer div[contenteditable="true"]') ||
                      document.querySelector('#main div[contenteditable="true"]');
          if (input) {
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
          }
        })()
      `);

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
        return { success: false, error: 'Mensaje no enviado: el cuadro de texto aún tiene contenido' };
      }

      // Step 6: Soft-check — verify last outgoing message has a tick (warning only)
      await this.sleep(500);
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
    mediaType: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.whatsappView) {
      return { success: false, error: 'Vista de WhatsApp no disponible' };
    }
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `Archivo no encontrado: ${filePath}` };
    }

    const ext = path.extname(filePath).toLowerCase();
    const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext);

    if (isImage) {
      return this.sendImageViaClipboard(filePath, caption);
    } else {
      return this.sendFileViaDragDrop(filePath, caption);
    }
  }

  /**
   * Send an image via native clipboard + Ctrl+V.
   * Caption is typed FIRST in the compose box — WhatsApp auto-transfers it
   * to the caption field when the image is pasted.
   */
  private async sendImageViaClipboard(
    filePath: string,
    caption: string
  ): Promise<{ success: boolean; error?: string }> {
    // Helper to log in RENDERER (WhatsApp DevTools) instead of main process
    const rlog = (msg: string) => {
      if (!this.whatsappView) return;
      const safe = msg.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
      this.whatsappView.webContents.executeJavaScript(`console.log('[IMG] ${safe}')`, true).catch(() => {});
    };

    try {
      // 1. Load image and validate
      const image = nativeImage.createFromPath(filePath);
      if (image.isEmpty()) {
        rlog('Step 1 FAIL: image is empty');
        return { success: false, error: 'No se pudo cargar la imagen desde disco' };
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

      // 3. Give BrowserView Chromium-level focus
      this.whatsappView!.webContents.focus();
      await this.sleep(100);
      rlog('Step 3 OK: BrowserView focused');

      // 4. Clear and type caption FIRST (before pasting image)
      await this.clearInputViaKeyboard();
      if (caption) {
        await this.typeViaKeyboard(caption);
        await this.sleep(300);
        rlog('Step 4 OK: caption typed (' + caption.length + ' chars)');
      } else {
        rlog('Step 4 OK: no caption to type');
      }

      // 5. Write image to system clipboard and paste via native Ctrl+V (trusted event)
      clipboard.writeImage(image);
      this.whatsappView!.webContents.paste();
      rlog('Step 5 OK: clipboard.writeImage + paste() dispatched');

      // 6. Wait for media preview to appear
      // WhatsApp uses "Remove attachment" and "Add file" buttons in the media editor
      rlog('Step 6: waiting for media preview...');
      const previewReady = await this.waitForCondition(`
        (function() {
          var el = document.querySelector('button[aria-label="Remove attachment"]') ||
                   document.querySelector('button[aria-label="Add file"]') ||
                   document.querySelector('button[aria-label="Crop and rotate"]') ||
                   document.querySelector('span[data-icon="wds-ic-send-filled"]');
          return el ? true : null;
        })()
      `, 10000, 300);

      if (!previewReady) {
        rlog('Step 6 FAIL: preview timeout after 10s');
        return { success: false, error: 'Tiempo agotado esperando vista previa de imagen' };
      }
      rlog('Step 6 OK: media preview detected');

      await this.sleep(500);

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
            var removeBtn = document.querySelector('button[aria-label="Remove attachment"]') ||
                            document.querySelector('button[aria-label="Add file"]');

            if (removeBtn) {
              console.log('[IMG] Found Remove/Add button, searching for Send in same container...');
              var container = removeBtn.parentElement;
              for (var depth = 0; depth < 10 && container; depth++) {
                // Search for Send button (could be <button> or [role="button"])
                var candidates = container.querySelectorAll('button[aria-label="Send"], [role="button"][aria-label="Send"]');
                if (candidates.length > 0) {
                  sendBtn = candidates[0];
                  console.log('[IMG] Found Send button at depth ' + depth + ' from Remove/Add button');
                  break;
                }
                container = container.parentElement;
              }
            }

            // Fallback 1: wds-ic-send-filled icon (pick the one NOT in compose footer)
            if (!sendBtn) {
              var icons = document.querySelectorAll('span[data-icon="wds-ic-send-filled"]');
              console.log('[IMG] Fallback: found ' + icons.length + ' wds-ic-send-filled icons');
              for (var i = 0; i < icons.length; i++) {
                var btn = icons[i].closest('button') || icons[i].closest('[role="button"]') || icons[i].parentElement;
                if (btn) {
                  // Skip if it's inside footer (the compose send button)
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

            // Fallback 2: all Send buttons/roles, pick the one NOT in footer
            if (!sendBtn) {
              var allSends = document.querySelectorAll('button[aria-label="Send"], [role="button"][aria-label="Send"]');
              console.log('[IMG] Fallback 2: found ' + allSends.length + ' Send buttons/roles');
              for (var i = 0; i < allSends.length; i++) {
                var inFooter = allSends[i].closest('footer');
                var r = allSends[i].getBoundingClientRect();
                console.log('[IMG]   Send[' + i + ']: ' + Math.round(r.x) + ',' + Math.round(r.y) + ' inFooter=' + !!inFooter + ' tag=' + allSends[i].tagName + ' role=' + allSends[i].getAttribute('role'));
                if (!inFooter && r.width > 0 && r.height > 0) {
                  sendBtn = allSends[i];
                  break;
                }
              }
            }

            if (!sendBtn) {
              console.error('[IMG] Step 7 FAIL: NO media editor send button found');
              return { success: false, error: 'Botón de enviar no encontrado en media preview' };
            }

            var btnRect = sendBtn.getBoundingClientRect();
            console.log('[IMG] Step 7: clicking Send at ' + Math.round(btnRect.x) + ',' + Math.round(btnRect.y) + ' tag=' + sendBtn.tagName + ' role=' + sendBtn.getAttribute('role'));
            sendBtn.click();
            console.log('[IMG] Step 7: click() dispatched');

            // Wait for media editor to close (Remove attachment button disappears)
            var timeout = 8000;
            var start = Date.now();
            while (Date.now() - start < timeout) {
              var removeBtn = document.querySelector('button[aria-label="Remove attachment"]');
              if (!removeBtn) {
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
    caption: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
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
                             document.querySelector('#main') ||
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
            <div style="text-align:center;color:white;">
              <div style="width:56px;height:56px;border-radius:50%;background:#4361ee;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                </svg>
              </div>
              <p style="margin:0;font-size:16px;font-weight:600;">Envío masivo en curso</p>
              <p style="margin:8px 0 0;font-size:13px;opacity:0.7;">Los controles están en el panel izquierdo</p>
            </div>
          \`;
          document.body.appendChild(overlay);
        })()
      `);
    } catch (err) {
      console.warn('[BulkSender] Failed to show overlay:', err);
    }
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
    // Progress is shown in Angular overlay; WhatsApp overlay is just a blocker
  }

  // --- API Communication ---

  private async fetchRules(): Promise<void> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/app/bulk_sends/rules`, {
        headers: this.getHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        if (data.rules) {
          this.rules = {
            min_delay_seconds: data.rules.min_delay_seconds ?? DEFAULT_RULES.min_delay_seconds,
            max_delay_seconds: data.rules.max_delay_seconds ?? DEFAULT_RULES.max_delay_seconds,
            pause_after_count: data.rules.pause_after_count ?? DEFAULT_RULES.pause_after_count,
            pause_duration_minutes: data.rules.pause_duration_minutes ?? DEFAULT_RULES.pause_duration_minutes,
            send_hour_start: data.rules.send_hour_start ?? DEFAULT_RULES.send_hour_start,
            send_hour_end: data.rules.send_hour_end ?? DEFAULT_RULES.send_hour_end,
            max_daily_messages: data.rules.max_daily_messages ?? DEFAULT_RULES.max_daily_messages
          };
          console.log(`[BulkSender] Reglas cargadas del servidor:`, JSON.stringify(this.rules));
        }
      } else {
        console.error(`[BulkSender] Error al obtener reglas (HTTP ${response.status}) — usando valores por defecto`);
      }
    } catch (err) {
      console.error('[BulkSender] Error al obtener reglas, usando valores por defecto:', err);
    }
  }

  private async fetchNextRecipient(): Promise<any> {
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

  private async notifyBackend(action: 'pause' | 'resume' | 'cancel'): Promise<void> {
    try {
      await fetch(`${this.apiBaseUrl}/app/bulk_sends/${this.bulkSendId}/${action}`, {
        method: 'POST',
        headers: this.getHeaders()
      });
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
   * Type text character by character using webContents.insertText().
   * Works without OS-level window focus (unlike sendInputEvent).
   */
  private async typeViaKeyboard(text: string): Promise<void> {
    if (!this.whatsappView) return;
    for (const char of text) {
      await this.whatsappView.webContents.executeJavaScript(
        `document.execCommand('insertText', false, ${JSON.stringify(char)})`
      );
      await this.sleep(30 + Math.random() * 20);
    }
  }

  /**
   * Clear focused input via selectAll + delete using webContents APIs.
   * Works without OS-level window focus (unlike sendInputEvent).
   */
  private async clearInputViaKeyboard(): Promise<void> {
    if (!this.whatsappView) return;
    await this.whatsappView.webContents.executeJavaScript(`
      document.execCommand('selectAll');
      document.execCommand('delete');
    `);
    await this.sleep(50);
  }
}
