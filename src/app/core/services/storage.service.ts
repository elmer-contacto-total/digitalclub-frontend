import { Injectable } from '@angular/core';

// Version for cache invalidation - increment when storage schema changes
const STORAGE_VERSION = '1.0.0';
const VERSION_KEY = 'holape_storage_version';

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private prefix = 'holape_';

  constructor() {
    this.checkStorageVersion();
  }

  /**
   * Check storage version and clear if outdated
   */
  private checkStorageVersion(): void {
    try {
      const storedVersion = localStorage.getItem(VERSION_KEY);
      if (storedVersion !== STORAGE_VERSION) {
        console.log('[Storage] Version mismatch, clearing old data...');
        this.clear();
        localStorage.setItem(VERSION_KEY, STORAGE_VERSION);
      }
    } catch (e) {
      console.error('[Storage] Error checking version:', e);
    }
  }

  /**
   * Get an item from localStorage
   */
  get<T>(key: string): T | null {
    try {
      const item = localStorage.getItem(this.prefix + key);
      if (!item) return null;

      const parsed = JSON.parse(item);
      return parsed;
    } catch (e) {
      // Corrupted data - remove it
      console.warn(`[Storage] Corrupted data for key "${key}", removing...`);
      this.remove(key);
      return null;
    }
  }

  /**
   * Set an item in localStorage
   */
  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(value));
    } catch (e) {
      console.error('Error saving to localStorage:', e);
    }
  }

  /**
   * Remove an item from localStorage
   */
  remove(key: string): void {
    localStorage.removeItem(this.prefix + key);
  }

  /**
   * Clear all items with the prefix
   */
  clear(): void {
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.prefix)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key));
  }

  /**
   * Get a raw string value (without JSON parsing)
   */
  getString(key: string): string | null {
    return localStorage.getItem(this.prefix + key);
  }

  /**
   * Set a raw string value (without JSON stringifying)
   */
  setString(key: string, value: string): void {
    localStorage.setItem(this.prefix + key, value);
  }
}
