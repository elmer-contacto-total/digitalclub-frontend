import { Injectable, signal, computed } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class LoadingService {
  private activeRequests = signal(0);

  /**
   * Whether any requests are currently loading
   */
  readonly isLoading = computed(() => this.activeRequests() > 0);

  /**
   * Current number of active requests
   */
  readonly requestCount = this.activeRequests.asReadonly();

  /**
   * Start loading (increment active requests)
   */
  start(): void {
    this.activeRequests.update(count => count + 1);
  }

  /**
   * Stop loading (decrement active requests)
   */
  stop(): void {
    this.activeRequests.update(count => Math.max(0, count - 1));
  }

  /**
   * Force stop all loading
   */
  reset(): void {
    this.activeRequests.set(0);
  }
}
