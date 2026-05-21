import { Component, OnInit, OnDestroy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface FeatureStatus {
  ok: boolean;
  note?: string;
  usedFallback?: boolean;
}

interface HealthReport {
  timestamp: number;
  appVersion: string;
  waLoaded: boolean;
  features: Record<string, FeatureStatus>;
  error?: string;
  userId?: number;
  userName?: string;
  userEmail?: string;
}

const STALE_MS = 10 * 60 * 1000;

@Component({
  selector: 'app-wa-health',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="wa-health-page">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">Diagnóstico WhatsApp Web</h1>
          <p class="page-subtitle">Estado de los selectores DOM por asesor</p>
        </div>
        <div class="page-actions">
          <span class="last-refresh">Actualiza cada 60s</span>
        </div>
      </div>

      @if (reports().length === 0) {
        <div class="empty-state">
          <i class="ph ph-hourglass"></i>
          <p>Sin reportes aún. Los asesores reportan automáticamente cuando WhatsApp está abierto.</p>
        </div>
      } @else {
        <div class="table-card">
          <table class="data-table">
            <thead>
              <tr>
                <th>Asesor</th>
                <th>Versión App</th>
                <th class="text-center">WA Cargado</th>
                <th class="text-center">OK</th>
                <th class="text-center">Fallback</th>
                <th class="text-center">Rotos</th>
                <th>Última actualización</th>
              </tr>
            </thead>
            <tbody>
              @for (report of reports(); track report.userId) {
                <tr [class.stale]="isStale(report)">
                  <td>
                    <div class="agent-name">{{ report.userName || report.userEmail || '—' }}</div>
                    <div class="agent-email">{{ report.userEmail }}</div>
                  </td>
                  <td>{{ report.appVersion || '—' }}</td>
                  <td class="text-center">
                    @if (report.waLoaded) {
                      <i class="ph ph-check-circle text-success"></i>
                    } @else {
                      <i class="ph ph-x-circle text-danger"></i>
                    }
                  </td>
                  @if (isStale(report)) {
                    <td colspan="3" class="text-center">
                      <span class="badge badge-secondary">Sin actividad</span>
                    </td>
                  } @else {
                    <td class="text-center fw-bold text-success">{{ okCount(report) }}</td>
                    <td class="text-center fw-bold text-warning">{{ fallbackCount(report) }}</td>
                    <td class="text-center fw-bold text-danger">{{ failCount(report) }}</td>
                  }
                  <td class="text-subtle">{{ relativeTime(report.timestamp) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [`
    .wa-health-page {
      padding: var(--space-6);
      max-width: 1200px;
      margin: 0 auto;
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: var(--space-6);
    }
    .page-title {
      margin: 0;
      font-size: var(--text-2xl);
      font-weight: var(--font-semibold);
      color: var(--fg-default);
    }
    .page-subtitle {
      margin: var(--space-1) 0 0;
      font-size: var(--text-sm);
      color: var(--fg-muted);
    }
    .last-refresh {
      font-size: var(--text-sm);
      color: var(--fg-subtle);
    }
    .empty-state {
      text-align: center;
      padding: var(--space-12);
      color: var(--fg-muted);
      i { font-size: 48px; display: block; margin-bottom: var(--space-3); }
    }
    .table-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius-lg);
      overflow: hidden;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: var(--text-base);
    }
    .data-table thead th {
      padding: var(--space-3) var(--space-4);
      background: var(--table-header-bg);
      color: var(--fg-muted);
      font-size: var(--text-sm);
      font-weight: var(--font-semibold);
      text-transform: uppercase;
      text-align: left;
      border-bottom: 1px solid var(--table-border);
    }
    .data-table tbody td {
      padding: var(--space-3) var(--space-4);
      border-bottom: 1px solid var(--table-border);
      vertical-align: middle;
    }
    .data-table tbody tr:last-child td { border-bottom: none; }
    .data-table tbody tr:hover { background: var(--table-row-hover); }
    .data-table tbody tr.stale { opacity: 0.5; }
    .text-center { text-align: center; }
    .text-success { color: var(--success-text); }
    .text-warning { color: var(--warning-text); }
    .text-danger { color: var(--error-text); }
    .text-subtle { color: var(--fg-subtle); font-size: var(--text-sm); }
    .fw-bold { font-weight: var(--font-semibold); }
    .agent-name { font-weight: var(--font-medium); }
    .agent-email { font-size: var(--text-xs); color: var(--fg-subtle); }
    .badge { display: inline-block; padding: 2px var(--space-2); border-radius: var(--radius-sm); font-size: var(--text-xs); }
    .badge-secondary { background: var(--bg-muted); color: var(--fg-muted); }
    i { font-size: 18px; }
  `]
})
export class WaHealthComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  reports = signal<HealthReport[]>([]);

  ngOnInit(): void {
    this.fetchReports();
    this.pollInterval = setInterval(() => this.fetchReports(), 60_000);
  }

  ngOnDestroy(): void {
    if (this.pollInterval) clearInterval(this.pollInterval);
  }

  private fetchReports(): void {
    this.http.get<HealthReport[]>(`${environment.apiUrl}/app/wa_health_reports`)
      .subscribe({ next: (data) => this.reports.set(data) });
  }

  isStale(report: HealthReport): boolean {
    return Date.now() - report.timestamp > STALE_MS;
  }

  okCount(report: HealthReport): number {
    return Object.values(report.features || {}).filter(f => f.ok && !f.usedFallback).length;
  }

  fallbackCount(report: HealthReport): number {
    return Object.values(report.features || {}).filter(f => f.ok && !!f.usedFallback).length;
  }

  failCount(report: HealthReport): number {
    return Object.values(report.features || {}).filter(f => !f.ok).length;
  }

  relativeTime(timestamp: number): string {
    if (!timestamp) return '—';
    const sec = Math.round((Date.now() - timestamp) / 1000);
    if (sec < 60) return 'hace un momento';
    if (sec < 3600) return `hace ${Math.round(sec / 60)} min`;
    return `hace ${Math.round(sec / 3600)} h`;
  }
}
