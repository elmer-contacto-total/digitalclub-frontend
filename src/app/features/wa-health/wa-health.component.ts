import { Component, OnInit, OnDestroy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface FeatureStatus {
  ok: boolean;
  note?: string;
  usedFallback?: boolean;
  category?: string;
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

const FEATURE_LABELS: Record<string, string> = {
  session_main:         'Panel principal',
  login_state:          'Estado de login',
  chat_header:          'Header del chat',
  chat_title:           'Título del chat',
  compose_box:          'Caja de composición',
  search_input:         'Buscador de chats',
  msg_panel:            'Panel de mensajes',
  msg_items:            'Items de mensajes',
  msg_direction:        'Dirección de mensajes',
  msg_text:             'Texto de mensajes',
  msg_audio:            'Audio en chat',
  msg_image:            'Imágenes en chat',
  contact_drawer:       'Panel de contacto',
  inject_security:      'Scripts de seguridad inyectados',
  inject_media_queue:   'Cola de captura de media',
  inject_chat_blocker:  'Overlay bloqueador de chat',
  inject_audit_queue:   'Cola de auditoría',
  msg_timestamp:        'Formato de timestamps',
  msg_id_format:        'Formato de IDs de mensajes',
  download_block_css:   'CSS bloqueo de descargas',
  chat_context_phone:   'Teléfono de chat activo (IPC)',
  chat_list_items:      'Lista de chats (navegación)',
};

const CATEGORY_LABELS: Record<string, string> = {
  session:    'Sesión',
  chat:       'Chat activo',
  messages:   'Mensajes',
  inject:     'Inyecciones',
  security:   'Seguridad',
  navigation: 'Navegación',
  context:    'Contexto IPC',
  other:      'Otros',
};

const FEATURE_CATEGORY: Record<string, string> = {
  session_main: 'session', login_state: 'session',
  chat_header: 'chat', chat_title: 'chat', compose_box: 'chat', search_input: 'chat', contact_drawer: 'chat',
  msg_panel: 'messages', msg_items: 'messages', msg_direction: 'messages',
  msg_text: 'messages', msg_audio: 'messages', msg_image: 'messages',
  msg_timestamp: 'messages', msg_id_format: 'messages',
  inject_security: 'inject', inject_media_queue: 'inject',
  inject_chat_blocker: 'inject', inject_audit_queue: 'inject',
  download_block_css: 'security',
  chat_context_phone: 'context',
  chat_list_items: 'navigation',
};

const NOTE_LABELS: Record<string, string> = {
  no_chat_open:          'sin chat abierto',
  no_messages_visible:   'sin mensajes visibles',
  requires_interaction:  'requiere interacción del usuario',
  no_msg_panel:          'panel de mensajes no encontrado',
  selector_missing:      'selector no encontrado en el DOM',
  not_reported:          'no reportado',
  no_audio_visible:      'sin audio visible',
  no_image_visible:      'sin imagen visible',
  attr_missing:          'atributo ausente en el DOM',
  format_changed:        'formato cambió — revisar selector',
  css_not_applied:       'CSS no aplicado — botón visible',
  btn_not_in_dom:        'botón no en DOM (posiblemente oculto)',
  no_active_chat:        'ningún chat abierto actualmente',
  no_chats_in_list:      'sin chats en la lista lateral',
};

@Component({
  selector: 'app-wa-health',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="wa-health-page">
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">Diagnóstico WhatsApp Web</h1>
          <p class="page-subtitle">Estado de selectores DOM e inyecciones por asesor · actualiza cada 60s</p>
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
                <th class="col-expand"></th>
                <th>Asesor</th>
                <th>Versión</th>
                <th class="text-center">WA</th>
                <th class="text-center">OK</th>
                <th class="text-center">Fallback</th>
                <th class="text-center">Rotos</th>
                <th>Última actualización</th>
              </tr>
            </thead>
            <tbody>
              @for (report of reports(); track report.userId) {
                <!-- Fila resumen -->
                <tr [class.stale]="isStale(report)" [class.expanded]="isExpanded(report.userId)">
                  <td class="col-expand">
                    @if (!isStale(report)) {
                      <button class="expand-btn" (click)="toggleExpand(report.userId)">
                        <i class="ph" [class.ph-caret-right]="!isExpanded(report.userId)" [class.ph-caret-down]="isExpanded(report.userId)"></i>
                      </button>
                    }
                  </td>
                  <td>
                    <div class="agent-name">{{ report.userName || report.userEmail || '—' }}</div>
                    <div class="agent-email">{{ report.userEmail }}</div>
                  </td>
                  <td class="text-subtle">{{ report.appVersion || '—' }}</td>
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

                <!-- Fila detalle expandida -->
                @if (isExpanded(report.userId) && !isStale(report)) {
                  <tr class="detail-row">
                    <td colspan="8" class="detail-cell">
                      <div class="category-grid">
                        @for (cat of getCategories(report); track cat.key) {
                          <div class="category-block">
                            <div class="category-title">{{ cat.label }}</div>
                            @for (f of cat.features; track f.key) {
                              <div class="feature-row">
                                @if (f.status.ok && !f.status.usedFallback) {
                                  <i class="ph ph-check-circle text-success"></i>
                                } @else if (f.status.ok && f.status.usedFallback) {
                                  <i class="ph ph-warning text-warning"></i>
                                } @else {
                                  <i class="ph ph-x-circle text-danger"></i>
                                }
                                <span class="feature-label">{{ f.label }}</span>
                                @if (f.status.note) {
                                  <span class="feature-note">{{ noteLabel(f.status.note) }}</span>
                                }
                              </div>
                            }
                          </div>
                        }
                      </div>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [`
    .wa-health-page { padding: var(--space-6); max-width: 1200px; margin: 0 auto; }
    .page-header { margin-bottom: var(--space-6); }
    .page-title { margin: 0; font-size: var(--text-2xl); font-weight: var(--font-semibold); color: var(--fg-default); }
    .page-subtitle { margin: var(--space-1) 0 0; font-size: var(--text-sm); color: var(--fg-muted); }
    .empty-state { text-align: center; padding: var(--space-12); color: var(--fg-muted); i { font-size: 48px; display: block; margin-bottom: var(--space-3); } }
    .table-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: var(--radius-lg); overflow: hidden; }
    .data-table { width: 100%; border-collapse: collapse; font-size: var(--text-base); }
    .data-table thead th { padding: var(--space-3) var(--space-4); background: var(--table-header-bg); color: var(--fg-muted); font-size: var(--text-sm); font-weight: var(--font-semibold); text-transform: uppercase; text-align: left; border-bottom: 1px solid var(--table-border); }
    .data-table tbody td { padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--table-border); vertical-align: middle; }
    .data-table tbody tr:last-child td { border-bottom: none; }
    .data-table tbody tr:not(.detail-row):hover { background: var(--table-row-hover); }
    .data-table tbody tr.stale { opacity: 0.5; }
    .col-expand { width: 40px; text-align: center; }
    .expand-btn { background: none; border: none; cursor: pointer; color: var(--fg-muted); padding: 4px; border-radius: var(--radius-sm); &:hover { color: var(--fg-default); background: var(--bg-muted); } }
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

    /* Detail row */
    .detail-row td { padding: 0; }
    .detail-cell { padding: var(--space-4) var(--space-6) !important; background: var(--bg-subtle, var(--bg-muted)); border-top: 1px solid var(--table-border); }
    .category-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--space-4); }
    .category-block { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: var(--radius-md); padding: var(--space-3); }
    .category-title { font-size: var(--text-xs); font-weight: var(--font-semibold); text-transform: uppercase; color: var(--fg-muted); margin-bottom: var(--space-2); letter-spacing: 0.4px; }
    .feature-row { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-1) 0; i { font-size: 14px; flex-shrink: 0; } }
    .feature-label { font-size: var(--text-sm); color: var(--fg-default); flex: 1; }
    .feature-note { font-size: var(--text-xs); color: var(--fg-subtle); white-space: nowrap; }
  `]
})
export class WaHealthComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  reports = signal<HealthReport[]>([]);
  expandedRows = signal<Set<number | undefined>>(new Set());

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

  isExpanded(userId?: number): boolean {
    return this.expandedRows().has(userId);
  }

  toggleExpand(userId?: number): void {
    this.expandedRows.update(set => {
      const next = new Set(set);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
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

  getCategories(report: HealthReport): { key: string; label: string; features: { key: string; label: string; status: FeatureStatus }[] }[] {
    const grouped: Record<string, { key: string; label: string; status: FeatureStatus }[]> = {};
    for (const [key, status] of Object.entries(report.features || {})) {
      const cat = status.category || FEATURE_CATEGORY[key] || 'other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push({ key, label: FEATURE_LABELS[key] || key, status });
    }
    return Object.entries(grouped).map(([key, features]) => ({
      key, label: CATEGORY_LABELS[key] || key, features
    }));
  }

  noteLabel(note: string): string {
    return NOTE_LABELS[note] || note;
  }

  relativeTime(timestamp: number): string {
    if (!timestamp) return '—';
    const sec = Math.round((Date.now() - timestamp) / 1000);
    if (sec < 60) return 'hace un momento';
    if (sec < 3600) return `hace ${Math.round(sec / 60)} min`;
    return `hace ${Math.round(sec / 3600)} h`;
  }
}
