import { Injectable, signal, effect } from '@angular/core';

export type Theme = 'light' | 'dark';

const THEME_KEY = 'holape-theme';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  /** Current theme signal */
  theme = signal<Theme>(this.getInitialTheme());

  /** Computed property for checking dark mode */
  isDarkMode = () => this.theme() === 'dark';

  constructor() {
    // Effect to apply theme changes to DOM and persist to localStorage
    effect(() => {
      const currentTheme = this.theme();
      document.body.setAttribute('data-theme', currentTheme);
      localStorage.setItem(THEME_KEY, currentTheme);
    });

    // Listen for system theme changes
    this.watchSystemTheme();
  }

  /**
   * Toggle between light and dark themes
   */
  toggleTheme(): void {
    this.theme.update(current => current === 'light' ? 'dark' : 'light');
  }

  /**
   * Set a specific theme
   */
  setTheme(theme: Theme): void {
    this.theme.set(theme);
  }

  /**
   * Get the initial theme based on:
   * 1. Stored preference in localStorage
   * 2. System preference (prefers-color-scheme)
   * 3. Default to 'light'
   */
  private getInitialTheme(): Theme {
    // Check localStorage first
    const storedTheme = localStorage.getItem(THEME_KEY) as Theme | null;
    if (storedTheme && (storedTheme === 'light' || storedTheme === 'dark')) {
      return storedTheme;
    }

    // Check system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }

    // Default to light
    return 'light';
  }

  /**
   * Watch for system theme changes and update if no stored preference
   */
  private watchSystemTheme(): void {
    if (window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

      mediaQuery.addEventListener('change', (e) => {
        // Only auto-switch if user hasn't set a preference
        const storedTheme = localStorage.getItem(THEME_KEY);
        if (!storedTheme) {
          this.theme.set(e.matches ? 'dark' : 'light');
        }
      });
    }
  }
}
