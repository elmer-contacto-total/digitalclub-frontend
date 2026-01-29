/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts,scss}",
  ],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['SF Mono', 'Consolas', 'monospace'],
      },
      colors: {
        // These map to CSS variables for theme support
        'bg-base': 'var(--bg-base)',
        'bg-subtle': 'var(--bg-subtle)',
        'bg-muted': 'var(--bg-muted)',
        'bg-emphasis': 'var(--bg-emphasis)',
        'fg-default': 'var(--fg-default)',
        'fg-muted': 'var(--fg-muted)',
        'fg-subtle': 'var(--fg-subtle)',
        'accent-default': 'var(--accent-default)',
        'accent-emphasis': 'var(--accent-emphasis)',
        'accent-subtle': 'var(--accent-subtle)',
        'accent-muted': 'var(--accent-muted)',
        'success-default': 'var(--success-default)',
        'success-subtle': 'var(--success-subtle)',
        'warning-default': 'var(--warning-default)',
        'warning-subtle': 'var(--warning-subtle)',
        'error-default': 'var(--error-default)',
        'error-subtle': 'var(--error-subtle)',
        'border-default': 'var(--border-default)',
        'border-muted': 'var(--border-muted)',
        'border-emphasis': 'var(--border-emphasis)',
      },
      spacing: {
        'sidebar': 'var(--sidebar-width)',
        'sidebar-collapsed': 'var(--sidebar-collapsed)',
        'header': 'var(--header-height)',
      },
      borderRadius: {
        'sm': 'var(--radius-sm)',
        'md': 'var(--radius-md)',
        'lg': 'var(--radius-lg)',
        'xl': 'var(--radius-xl)',
      },
      transitionDuration: {
        'fast': 'var(--duration-fast)',
        'normal': 'var(--duration-normal)',
        'slow': 'var(--duration-slow)',
      },
    },
  },
  plugins: [],
}
