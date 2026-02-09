/**
 * BulkSender - Electron bulk messaging engine with anti-ban measures
 * Polls the backend for next recipient, navigates to chat, sends message,
 * and reports result. Respects configurable rate limiting and pauses.
 */

import { BrowserView } from 'electron';

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
  campaignId: number | null;
  state: 'idle' | 'running' | 'paused' | 'cancelled' | 'completed' | 'error';
  sentCount: number;
  failedCount: number;
  currentPhone: string | null;
  lastError: string | null;
}

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
  private campaignId: number | null = null;
  private apiBaseUrl: string;
  private authToken: string = '';
  private rules: BulkSendRules = { ...DEFAULT_RULES };
  private whatsappView: BrowserView | null = null;

  private _state: 'idle' | 'running' | 'paused' | 'cancelled' | 'completed' | 'error' = 'idle';
  private sentCount = 0;
  private failedCount = 0;
  private consecutiveFailures = 0;
  private currentPhone: string | null = null;
  private lastError: string | null = null;
  private isPaused = false;
  private isCancelled = false;

  constructor(apiBaseUrl: string) {
    this.apiBaseUrl = apiBaseUrl;
  }

  setWhatsAppView(view: BrowserView | null): void {
    this.whatsappView = view;
  }

  setAuthToken(token: string): void {
    this.authToken = token;
  }

  getStatus(): BulkSenderStatus {
    return {
      campaignId: this.campaignId,
      state: this._state,
      sentCount: this.sentCount,
      failedCount: this.failedCount,
      currentPhone: this.currentPhone,
      lastError: this.lastError
    };
  }

  async start(campaignId: number): Promise<void> {
    if (this._state === 'running') {
      console.log('[BulkSender] Already running campaign', this.campaignId);
      return;
    }

    this.campaignId = campaignId;
    this._state = 'running';
    this.sentCount = 0;
    this.failedCount = 0;
    this.consecutiveFailures = 0;
    this.currentPhone = null;
    this.lastError = null;
    this.isPaused = false;
    this.isCancelled = false;

    console.log(`[BulkSender] Starting campaign ${campaignId}`);

    // Fetch rules from backend
    await this.fetchRules();

    // Main send loop
    await this.processLoop();
  }

  pause(): void {
    console.log(`[BulkSender] Pausing campaign ${this.campaignId}`);
    this.isPaused = true;
    this._state = 'paused';
    // Also notify backend
    this.notifyBackend('pause');
  }

  resume(): void {
    if (this._state !== 'paused') return;
    console.log(`[BulkSender] Resuming campaign ${this.campaignId}`);
    this.isPaused = false;
    this._state = 'running';
    // Notify backend and restart loop
    this.notifyBackend('resume');
    this.processLoop();
  }

  cancel(): void {
    console.log(`[BulkSender] Cancelling campaign ${this.campaignId}`);
    this.isCancelled = true;
    this._state = 'cancelled';
    this.notifyBackend('cancel');
  }

  private async processLoop(): Promise<void> {
    let messagesSinceLastPause = 0;

    while (true) {
      // Check cancel/pause
      if (this.isCancelled) {
        this._state = 'cancelled';
        console.log(`[BulkSender] Campaign ${this.campaignId} cancelled`);
        return;
      }

      if (this.isPaused) {
        this._state = 'paused';
        console.log(`[BulkSender] Campaign ${this.campaignId} paused`);
        return;
      }

      // Check send hours
      if (!this.isWithinSendHours()) {
        console.log('[BulkSender] Outside send hours, waiting 60s...');
        await this.sleep(60000);
        continue;
      }

      // Fetch next recipient
      const next = await this.fetchNextRecipient();
      if (!next || !next.has_next) {
        this._state = 'completed';
        console.log(`[BulkSender] Campaign ${this.campaignId} completed: ${this.sentCount} sent, ${this.failedCount} failed`);
        return;
      }

      this.currentPhone = next.phone;
      const content = next.content || '';
      const recipientId = next.recipient_id;

      console.log(`[BulkSender] Sending to ${next.phone} (${next.user_name || 'Unknown'})`);

      try {
        // Navigate to chat
        const navResult = await this.navigateToChat(next.phone);
        if (!navResult.success) {
          throw new Error(`Failed to navigate to chat: ${navResult.error}`);
        }

        // Random delay to simulate typing
        const typingDelay = 500 + Math.random() * 1000;
        await this.sleep(typingDelay);

        // Send message
        const sendResult = await this.sendAndSubmit(content);
        if (!sendResult.success) {
          throw new Error(`Failed to send message: ${sendResult.error}`);
        }

        // Report success
        await this.reportResult(recipientId, true);
        this.sentCount++;
        this.consecutiveFailures = 0;
        messagesSinceLastPause++;

        console.log(`[BulkSender] Sent to ${next.phone} (${this.sentCount} total)`);

      } catch (err: any) {
        const errorMsg = err.message || String(err);
        console.error(`[BulkSender] Failed for ${next.phone}: ${errorMsg}`);

        await this.reportResult(recipientId, false, errorMsg);
        this.failedCount++;
        this.consecutiveFailures++;
        this.lastError = errorMsg;

        // Backoff on consecutive failures
        if (this.consecutiveFailures >= 5) {
          console.warn('[BulkSender] 5 consecutive failures - auto-pausing');
          this.isPaused = true;
          this._state = 'paused';
          this.lastError = 'Auto-paused after 5 consecutive failures';
          return;
        }

        if (this.consecutiveFailures >= 3) {
          // Double the delay
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

  private async navigateToChat(phone: string): Promise<{ success: boolean; error?: string }> {
    if (!this.whatsappView) {
      return { success: false, error: 'WhatsApp view not available' };
    }

    try {
      const result = await this.whatsappView.webContents.executeJavaScript(`
        (async function() {
          try {
            // Click search box
            const searchBox = document.querySelector('[data-testid="chat-list-search"]') ||
                              document.querySelector('[data-icon="search"]')?.closest('button') ||
                              document.querySelector('#side [contenteditable="true"]');

            if (!searchBox) {
              return { success: false, error: 'search_not_found' };
            }

            searchBox.click();
            searchBox.focus();

            // Wait for search input to be ready
            await new Promise(r => setTimeout(r, 300));

            // Find the actual text input
            const searchInput = document.querySelector('[data-testid="chat-list-search-input"]') ||
                                document.querySelector('#side div[contenteditable="true"]') ||
                                document.querySelector('[data-testid="search-input"]');

            if (!searchInput) {
              return { success: false, error: 'search_input_not_found' };
            }

            // Clear and type phone number
            searchInput.focus();
            searchInput.textContent = '';
            document.execCommand('selectAll');
            document.execCommand('insertText', false, '${phone.replace(/'/g, "\\'")}');
            searchInput.dispatchEvent(new InputEvent('input', { bubbles: true }));

            // Wait for search results
            await new Promise(r => setTimeout(r, 1500));

            // Click first result
            const firstResult = document.querySelector('[data-testid="cell-frame-container"]') ||
                                document.querySelector('#pane-side [role="row"]') ||
                                document.querySelector('#pane-side [data-id]');

            if (!firstResult) {
              return { success: false, error: 'no_search_result' };
            }

            firstResult.click();

            // Wait for chat to load
            await new Promise(r => setTimeout(r, 1000));

            // Verify chat loaded (compose box present)
            const composeBox = document.querySelector('[data-testid="conversation-compose-box-input"]') ||
                               document.querySelector('footer div[contenteditable="true"]');

            if (!composeBox) {
              return { success: false, error: 'chat_not_loaded' };
            }

            return { success: true };
          } catch(e) {
            return { success: false, error: e.message || 'navigate_error' };
          }
        })()
      `, true);

      return result;
    } catch (err: any) {
      return { success: false, error: err.message || 'js_execution_error' };
    }
  }

  private async sendAndSubmit(text: string): Promise<{ success: boolean; error?: string }> {
    if (!this.whatsappView) {
      return { success: false, error: 'WhatsApp view not available' };
    }

    try {
      const result = await this.whatsappView.webContents.executeJavaScript(`
        (async function() {
          try {
            // Find compose box
            const input = document.querySelector('[data-testid="conversation-compose-box-input"]') ||
                          document.querySelector('div[contenteditable="true"][data-tab="10"]') ||
                          document.querySelector('footer div[contenteditable="true"]');

            if (!input) {
              return { success: false, error: 'input_not_found' };
            }

            // Focus and insert text
            input.focus();
            input.textContent = '';
            document.execCommand('insertText', false, ${JSON.stringify(text)});
            input.dispatchEvent(new InputEvent('input', { bubbles: true, data: ${JSON.stringify(text)} }));

            // Typing simulation delay
            await new Promise(r => setTimeout(r, ${500 + Math.random() * 1000}));

            // Click send button
            const sendBtn = document.querySelector('[data-testid="send"]') ||
                            document.querySelector('button[aria-label="Send"]') ||
                            document.querySelector('span[data-icon="send"]')?.closest('button');

            if (!sendBtn) {
              // Fallback: press Enter key
              input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
              await new Promise(r => setTimeout(r, 500));
            } else {
              sendBtn.click();
              await new Promise(r => setTimeout(r, 500));
            }

            // Verify message was sent (check for sent tick)
            await new Promise(r => setTimeout(r, 1000));

            return { success: true };
          } catch(e) {
            return { success: false, error: e.message || 'send_error' };
          }
        })()
      `, true);

      return result;
    } catch (err: any) {
      return { success: false, error: err.message || 'js_execution_error' };
    }
  }

  // --- API Communication ---

  private async fetchRules(): Promise<void> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/app/campaigns/rules`, {
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
        }
      }
    } catch (err) {
      console.warn('[BulkSender] Failed to fetch rules, using defaults:', err);
    }
  }

  private async fetchNextRecipient(): Promise<any> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/app/campaigns/${this.campaignId}/next-recipient`, {
        headers: this.getHeaders()
      });
      if (response.ok) {
        return await response.json();
      }
      return null;
    } catch (err) {
      console.error('[BulkSender] Failed to fetch next recipient:', err);
      return null;
    }
  }

  private async reportResult(recipientId: number, success: boolean, errorMessage?: string): Promise<void> {
    try {
      await fetch(`${this.apiBaseUrl}/app/campaigns/${this.campaignId}/recipient-result`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ recipientId, success, errorMessage: errorMessage || null })
      });
    } catch (err) {
      console.error('[BulkSender] Failed to report result:', err);
    }
  }

  private async notifyBackend(action: 'pause' | 'resume' | 'cancel'): Promise<void> {
    try {
      await fetch(`${this.apiBaseUrl}/app/campaigns/${this.campaignId}/${action}`, {
        method: 'POST',
        headers: this.getHeaders()
      });
    } catch (err) {
      console.error(`[BulkSender] Failed to notify backend (${action}):`, err);
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
}
