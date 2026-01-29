import { Component } from '@angular/core';

@Component({
  selector: 'app-logo',
  standalone: true,
  template: `
    <svg viewBox="0 0 180 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="logo">
      <!-- Icon: Chat bubble with signal waves -->
      <g>
        <!-- Main bubble -->
        <rect x="4" y="8" width="28" height="24" rx="6" fill="#25D366"/>
        <!-- Bubble tail -->
        <path d="M8 32 L4 40 L14 32" fill="#25D366"/>
        <!-- Signal waves -->
        <path d="M36 14 Q42 20, 36 26" stroke="#25D366" stroke-width="2.5" stroke-linecap="round" fill="none" opacity="0.7"/>
        <path d="M42 10 Q52 20, 42 30" stroke="#25D366" stroke-width="2.5" stroke-linecap="round" fill="none" opacity="0.4"/>
      </g>
      <!-- Text: MWS -->
      <text x="62" y="30" font-family="Inter, system-ui, sans-serif" font-size="22" font-weight="700" class="logo-text">MWS</text>
      <!-- Separator -->
      <line x1="123" y1="12" x2="123" y2="36" class="logo-separator"/>
      <!-- Subtext -->
      <text x="128" y="22" font-family="Inter, system-ui, sans-serif" font-size="9" font-weight="500" class="logo-subtext">Monitor</text>
      <text x="128" y="34" font-family="Inter, system-ui, sans-serif" font-size="9" font-weight="500" class="logo-subtext">WhatsApp</text>
    </svg>
  `,
  styles: [`
    :host {
      display: flex;
      justify-content: center;
    }
    .logo {
      height: 48px;
      width: auto;
    }
    .logo-text {
      fill: var(--fg-default);
    }
    .logo-separator {
      stroke: var(--fg-default);
      stroke-width: 1;
      opacity: 0.2;
    }
    .logo-subtext {
      fill: var(--fg-muted);
    }
  `]
})
export class LogoComponent {}
