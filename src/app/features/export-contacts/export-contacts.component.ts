/**
 * Export Contacts Component
 * PARIDAD: Rails Admin::DashboardController#export_contacts
 * Descarga CSV con los contactos subordinados del usuario
 */
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardService } from '../dashboard/services/dashboard.service';

@Component({
  selector: 'app-export-contacts',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="export-page">
      <div class="page-header">
        <h1>Exportar Contactos</h1>
        <p class="subtitle">Descarga un archivo CSV con todos los contactos de tu equipo</p>
      </div>

      <div class="export-card">
        <div class="card-icon">
          <i class="ph ph-file-csv"></i>
        </div>

        <div class="card-body">
          <h2>Contactos en CSV</h2>
          <p>El archivo incluye nombre, teléfono, correo y datos de todos los contactos asignados a tu equipo.</p>

          @if (exportError()) {
            <div class="alert alert-error">
              <i class="ph ph-warning-circle"></i>
              <span>{{ exportError() }}</span>
            </div>
          }

          @if (exportSuccess()) {
            <div class="alert alert-success">
              <i class="ph ph-check-circle"></i>
              <span>Archivo descargado correctamente</span>
            </div>
          }

          <button
            class="btn btn-primary"
            (click)="onExport()"
            [disabled]="isExporting()"
          >
            @if (isExporting()) {
              <i class="ph ph-spinner spinning"></i>
              Generando archivo...
            } @else {
              <i class="ph ph-download-simple"></i>
              Descargar CSV
            }
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .export-page {
      min-height: 100%;
      padding: 24px;
      max-width: 600px;
      margin: 0 auto;
    }

    .page-header {
      margin-bottom: 32px;

      h1 {
        margin: 0 0 8px 0;
        font-size: 24px;
        font-weight: 600;
        color: var(--fg-default);
      }

      .subtitle {
        margin: 0;
        font-size: 14px;
        color: var(--fg-muted);
      }
    }

    .export-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 32px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .card-icon {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: var(--accent-subtle);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 20px;

      i {
        font-size: 32px;
        color: var(--accent-default);
      }
    }

    .card-body {
      display: flex;
      flex-direction: column;
      align-items: center;

      h2 {
        margin: 0 0 8px 0;
        font-size: 18px;
        font-weight: 600;
        color: var(--fg-default);
      }

      p {
        margin: 0 0 24px 0;
        font-size: 14px;
        color: var(--fg-muted);
        line-height: 1.5;
        max-width: 400px;
      }
    }

    .alert {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 16px;
      font-size: 14px;
      width: 100%;

      i { font-size: 18px; flex-shrink: 0; }

      &.alert-error {
        background: var(--error-subtle);
        color: var(--error-text);
      }

      &.alert-success {
        background: var(--success-subtle);
        color: var(--success-text);
      }
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: all 0.2s;

      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      i { font-size: 18px; }
    }

    .btn-primary {
      background: var(--accent-default);
      color: white;

      &:hover:not(:disabled) {
        background: var(--accent-emphasis);
      }
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .spinning {
      animation: spin 1s linear infinite;
    }
  `]
})
export class ExportContactsComponent {
  private dashboardService = inject(DashboardService);

  isExporting = signal(false);
  exportSuccess = signal(false);
  exportError = signal('');

  onExport(): void {
    this.isExporting.set(true);
    this.exportSuccess.set(false);
    this.exportError.set('');

    this.dashboardService.exportContacts().subscribe({
      next: (blob) => {
        this.downloadBlob(blob, `contactos_${new Date().toISOString().split('T')[0]}.csv`);
        this.isExporting.set(false);
        this.exportSuccess.set(true);
        setTimeout(() => this.exportSuccess.set(false), 4000);
      },
      error: (err) => {
        console.error('Error exporting contacts:', err);
        this.isExporting.set(false);
        this.exportError.set('Error al generar el archivo. Intenta de nuevo.');
      }
    });
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }
}
