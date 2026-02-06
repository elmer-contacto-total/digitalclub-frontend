import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { inject } from '@angular/core';
import { LogoComponent } from '../../shared/components/logo/logo.component';
import { environment } from '../../../environments/environment';

interface VersionDto {
  version: string;
  downloadUrl: string;
  platform: string;
  releaseNotes: string | null;
  fileSize: number | null;
  mandatory: boolean;
  publishedAt: string;
}

@Component({
  selector: 'app-download',
  standalone: true,
  imports: [CommonModule, RouterLink, LogoComponent],
  template: `
    <!-- Background -->
    <div class="download-bg">
      <div class="pattern-dots"></div>
    </div>

    <!-- Content -->
    <div class="download-content">
      <div class="download-card">
        <!-- Logo -->
        <app-logo />

        <!-- Title -->
        <h1 class="title">MWS Desktop</h1>
        <p class="subtitle">Monitor WhatsApp Service</p>

        <!-- Loading -->
        @if (isLoading()) {
          <div class="loading">
            <div class="spinner"></div>
            <p>Cargando información de descarga...</p>
          </div>
        }

        <!-- Error -->
        @if (error()) {
          <div class="error-box">
            <i class="ph ph-warning-circle"></i>
            <p>{{ error() }}</p>
            <button class="retry-btn" (click)="loadVersion()">Reintentar</button>
          </div>
        }

        <!-- Version info -->
        @if (versionInfo(); as v) {
          <!-- Version badge -->
          <div class="version-badges">
            <span class="badge">
              <i class="ph ph-tag"></i>
              v{{ v.version }}
            </span>
            <span class="badge">
              <i class="ph ph-windows-logo"></i>
              {{ v.platform | titlecase }}
            </span>
            @if (v.fileSize) {
              <span class="badge">
                <i class="ph ph-file-arrow-down"></i>
                {{ formatFileSize(v.fileSize) }}
              </span>
            }
            <span class="badge">
              <i class="ph ph-calendar"></i>
              {{ formatDate(v.publishedAt) }}
            </span>
          </div>

          <!-- Download button -->
          <button class="download-btn" (click)="download()">
            <i class="ph ph-download-simple"></i>
            Descargar Instalador
          </button>

          <!-- Release notes -->
          @if (v.releaseNotes) {
            <details class="release-notes">
              <summary>
                <i class="ph ph-note"></i>
                Notas de la versión
              </summary>
              <div class="release-notes-content">
                {{ v.releaseNotes }}
              </div>
            </details>
          }
        }

        <!-- Installation steps -->
        <div class="install-steps">
          <h3>Instalación</h3>
          <div class="steps">
            <div class="step">
              <div class="step-icon">
                <i class="ph ph-download-simple"></i>
              </div>
              <div class="step-text">
                <strong>1. Descargar</strong>
                <span>Haz clic en el botón para obtener el instalador (.exe)</span>
              </div>
            </div>
            <div class="step">
              <div class="step-icon">
                <i class="ph ph-cursor-click"></i>
              </div>
              <div class="step-text">
                <strong>2. Ejecutar</strong>
                <span>Abre el archivo descargado y sigue las instrucciones</span>
              </div>
            </div>
            <div class="step">
              <div class="step-icon">
                <i class="ph ph-sign-in"></i>
              </div>
              <div class="step-text">
                <strong>3. Iniciar sesión</strong>
                <span>Usa tus credenciales de MWS para acceder</span>
              </div>
            </div>
          </div>
        </div>

        <!-- System requirements -->
        <div class="requirements">
          <h3>Requisitos del sistema</h3>
          <ul>
            <li><i class="ph ph-windows-logo"></i> Windows 10 o superior</li>
            <li><i class="ph ph-memory"></i> 4 GB de RAM mínimo</li>
            <li><i class="ph ph-wifi-high"></i> Conexión a Internet</li>
          </ul>
        </div>

        <!-- Login link -->
        <div class="login-link">
          <a routerLink="/auth/login">
            <i class="ph ph-sign-in"></i>
            ¿Ya tienes cuenta? Iniciar sesión
          </a>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="download-footer">
      <p>&copy; {{ currentYear }} MWS - Monitor WhatsApp Service. Todos los derechos reservados.</p>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      position: relative;
      overflow: hidden;
    }

    /* Background */
    .download-bg {
      position: fixed;
      inset: 0;
      z-index: 0;
      background: linear-gradient(135deg, var(--bg-default) 0%, var(--bg-subtle) 100%);
    }

    .pattern-dots {
      position: absolute;
      inset: 0;
      background-image: radial-gradient(var(--border-default) 1px, transparent 1px);
      background-size: 24px 24px;
      opacity: 0.5;
    }

    /* Content */
    .download-content {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      z-index: 1;
      padding: var(--space-4);
    }

    .download-card {
      background: var(--bg-default);
      border: 1px solid var(--border-default);
      border-radius: 16px;
      padding: 2.5rem;
      width: 100%;
      max-width: 520px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
    }

    /* Title */
    .title {
      text-align: center;
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--fg-default);
      margin: 1.25rem 0 0.25rem;
    }

    .subtitle {
      text-align: center;
      font-size: 0.95rem;
      color: var(--fg-muted);
      margin: 0 0 1.5rem;
    }

    /* Loading */
    .loading {
      text-align: center;
      padding: 2rem 0;
      color: var(--fg-muted);

      p {
        margin-top: 0.75rem;
        font-size: 0.875rem;
      }
    }

    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--border-default);
      border-top-color: #25D366;
      border-radius: 50%;
      margin: 0 auto;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Error */
    .error-box {
      text-align: center;
      padding: 1.5rem;
      background: var(--bg-subtle);
      border-radius: 8px;
      margin-bottom: 1.5rem;

      i {
        font-size: 2rem;
        color: var(--fg-danger, #dc3545);
      }

      p {
        margin: 0.5rem 0 1rem;
        font-size: 0.875rem;
        color: var(--fg-muted);
      }
    }

    .retry-btn {
      padding: 0.5rem 1.25rem;
      border: 1px solid var(--border-default);
      border-radius: 6px;
      background: var(--bg-default);
      color: var(--fg-default);
      cursor: pointer;
      font-size: 0.875rem;
      transition: background 0.15s;

      &:hover {
        background: var(--bg-subtle);
      }
    }

    /* Version badges */
    .version-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      justify-content: center;
      margin-bottom: 1.5rem;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.35rem 0.75rem;
      background: var(--bg-subtle);
      border: 1px solid var(--border-default);
      border-radius: 20px;
      font-size: 0.8rem;
      color: var(--fg-muted);

      i {
        font-size: 0.9rem;
      }
    }

    /* Download button */
    .download-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      width: 100%;
      padding: 0.875rem;
      border: none;
      border-radius: 10px;
      background: #25D366;
      color: #fff;
      font-size: 1.05rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s, transform 0.1s;
      margin-bottom: 1.5rem;

      i {
        font-size: 1.25rem;
      }

      &:hover {
        background: #1ebe5a;
      }

      &:active {
        transform: scale(0.98);
      }
    }

    /* Release notes */
    .release-notes {
      margin-bottom: 1.5rem;
      border: 1px solid var(--border-default);
      border-radius: 8px;
      overflow: hidden;

      summary {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.75rem 1rem;
        cursor: pointer;
        font-size: 0.875rem;
        color: var(--fg-muted);
        background: var(--bg-subtle);
        user-select: none;

        &:hover {
          color: var(--fg-default);
        }
      }
    }

    .release-notes-content {
      padding: 1rem;
      font-size: 0.85rem;
      color: var(--fg-muted);
      line-height: 1.6;
      white-space: pre-wrap;
    }

    /* Installation steps */
    .install-steps {
      margin-bottom: 1.5rem;

      h3 {
        font-size: 0.9rem;
        font-weight: 600;
        color: var(--fg-default);
        margin: 0 0 0.75rem;
      }
    }

    .steps {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .step {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
    }

    .step-icon {
      flex-shrink: 0;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(37, 211, 102, 0.1);
      border-radius: 8px;
      color: #25D366;

      i {
        font-size: 1.1rem;
      }
    }

    .step-text {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      padding-top: 0.15rem;

      strong {
        font-size: 0.85rem;
        color: var(--fg-default);
      }

      span {
        font-size: 0.8rem;
        color: var(--fg-muted);
      }
    }

    /* Requirements */
    .requirements {
      margin-bottom: 1.5rem;
      padding: 1rem;
      background: var(--bg-subtle);
      border-radius: 8px;

      h3 {
        font-size: 0.9rem;
        font-weight: 600;
        color: var(--fg-default);
        margin: 0 0 0.5rem;
      }

      ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
      }

      li {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.825rem;
        color: var(--fg-muted);

        i {
          font-size: 1rem;
          color: var(--fg-default);
          width: 1.25rem;
          text-align: center;
        }
      }
    }

    /* Login link */
    .login-link {
      text-align: center;

      a {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        font-size: 0.875rem;
        color: #25D366;
        text-decoration: none;
        transition: opacity 0.15s;

        &:hover {
          opacity: 0.8;
        }
      }
    }

    /* Footer */
    .download-footer {
      position: relative;
      z-index: 1;
      text-align: center;
      padding: var(--space-4);

      p {
        font-size: 0.75rem;
        color: var(--fg-muted);
        margin: 0;
      }
    }

    /* Dark mode */
    :host-context([data-theme='dark']) {
      .download-bg {
        background: linear-gradient(135deg, var(--bg-default) 0%, hsl(222, 47%, 8%) 100%);
      }

      .pattern-dots {
        opacity: 0.3;
      }
    }
  `]
})
export class DownloadComponent implements OnInit {
  private http = inject(HttpClient);

  versionInfo = signal<VersionDto | null>(null);
  isLoading = signal(true);
  error = signal<string | null>(null);
  currentYear = new Date().getFullYear();

  ngOnInit(): void {
    this.loadVersion();
  }

  loadVersion(): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.http.get<VersionDto>(
      `${environment.apiUrl}/api/v1/app/version`,
      { params: { platform: 'windows' } }
    ).subscribe({
      next: (data) => {
        this.versionInfo.set(data);
        this.isLoading.set(false);
      },
      error: () => {
        this.error.set('No se pudo obtener la información de descarga. Intenta de nuevo más tarde.');
        this.isLoading.set(false);
      }
    });
  }

  download(): void {
    const url = this.versionInfo()?.downloadUrl;
    if (url) {
      window.open(url, '_blank');
    }
  }

  formatFileSize(bytes: number | null): string {
    if (!bytes) return '-';
    const units = ['B', 'KB', 'MB', 'GB'];
    let unitIndex = 0;
    let size = bytes;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
