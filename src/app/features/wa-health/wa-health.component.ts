import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
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

type Severity = 'critical' | 'warning' | 'ok';

interface FeatureRow {
  key: string;
  label: string;
  status: FeatureStatus;
  severity: Severity;
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
  session: 'Sesión', chat: 'Chat activo', messages: 'Mensajes',
  inject: 'Inyecciones', security: 'Seguridad', navigation: 'Navegación',
  context: 'Contexto IPC', other: 'Otros',
};

const FEATURE_CATEGORY: Record<string, string> = {
  session_main: 'session', login_state: 'session',
  chat_header: 'chat', chat_title: 'chat', compose_box: 'chat',
  search_input: 'chat', contact_drawer: 'chat',
  msg_panel: 'messages', msg_items: 'messages', msg_direction: 'messages',
  msg_text: 'messages', msg_audio: 'messages', msg_image: 'messages',
  msg_timestamp: 'messages', msg_id_format: 'messages',
  inject_security: 'inject', inject_media_queue: 'inject',
  inject_chat_blocker: 'inject', inject_audit_queue: 'inject',
  download_block_css: 'security',
  chat_context_phone: 'context',
  chat_list_items: 'navigation',
};

const FEATURE_SEVERITY_MAP: Record<string, Severity> = {
  inject_security: 'critical', inject_media_queue: 'critical',
  inject_chat_blocker: 'critical', login_state: 'critical',
  session_main: 'critical', msg_panel: 'critical',
  compose_box: 'critical', search_input: 'critical',
  msg_timestamp: 'critical', msg_id_format: 'critical',
  download_block_css: 'critical',
  inject_audit_queue: 'warning', chat_header: 'warning',
  chat_title: 'warning', msg_items: 'warning',
  msg_direction: 'warning', msg_text: 'warning',
  chat_list_items: 'warning',
};

const FEATURE_ACTION: Record<string, string | ((note?: string) => string)> = {
  inject_security:     'Reinstalar la app Electron en el equipo del asesor',
  inject_media_queue:  'Reinstalar la app Electron en el equipo del asesor',
  inject_chat_blocker: 'Reinstalar la app Electron en el equipo del asesor',
  inject_audit_queue:  'Reinstalar la app Electron en el equipo del asesor',
  login_state:         'El asesor debe iniciar sesión en WhatsApp desde la app',
  session_main:        'WhatsApp no cargó — verificar conexión del asesor',
  compose_box:         'WhatsApp cambió el selector del campo de texto — actualizar wa-selectors.ts',
  search_input:        'WhatsApp cambió el selector de búsqueda — actualizar wa-selectors.ts',
  msg_panel:           'WhatsApp cambió el selector del panel — actualizar wa-selectors.ts',
  msg_items:           'WhatsApp cambió el selector de mensajes — actualizar wa-selectors.ts',
  msg_timestamp:       (note) => note === 'format_changed'
    ? 'WhatsApp cambió el formato de timestamps — revisar data-pre-plain-text en wa-selectors.ts'
    : 'Atributo data-pre-plain-text ausente en el DOM — WhatsApp cambió la estructura',
  msg_id_format:       'WhatsApp cambió el formato de data-id — actualizar MSG_ID_OUT/IN en wa-selectors.ts',
  download_block_css:  'CSS de bloqueo de descargas no aplicó — revisar HIDE_DOWNLOAD_CSS en media-security.ts',
  chat_header:         'WhatsApp cambió el selector del header — actualizar wa-selectors.ts',
  chat_list_items:     'Sin chats en la lista o WhatsApp cambió el selector de filas del sidebar',
};

const NOTE_LABELS: Record<string, string> = {
  no_chat_open: 'sin chat abierto', no_messages_visible: 'sin mensajes visibles',
  requires_interaction: 'requiere interacción', no_msg_panel: 'panel no encontrado',
  selector_missing: 'selector no encontrado', attr_missing: 'atributo ausente en DOM',
  format_changed: 'formato cambió', css_not_applied: 'CSS no aplicado',
  btn_not_in_dom: 'botón no en DOM', no_active_chat: 'sin chat activo',
  no_chats_in_list: 'sin chats en lista', no_audio_visible: 'sin audio visible',
  no_image_visible: 'sin imagen visible',
};

function featureSeverity(key: string, status: FeatureStatus): Severity {
  if (status.ok) return status.usedFallback ? 'warning' : 'ok';
  return FEATURE_SEVERITY_MAP[key] ?? 'warning';
}

function getAction(key: string, note?: string): string | undefined {
  const a = FEATURE_ACTION[key];
  if (!a) return undefined;
  return typeof a === 'function' ? a(note) : a;
}

function reportSeverity(report: HealthReport): Severity {
  for (const [k, s] of Object.entries(report.features || {}))
    if (!s.ok && featureSeverity(k, s) === 'critical') return 'critical';
  for (const [k, s] of Object.entries(report.features || {}))
    if (!s.ok || s.usedFallback) return 'warning';
  return 'ok';
}

@Component({
  selector: 'app-wa-health',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="wa-health-page">
      <div class="page-header">
        <h1 class="page-title">Diagnóstico WhatsApp Web</h1>
        <p class="page-subtitle">Estado de selectores DOM e inyecciones por asesor · actualiza cada 60s</p>
      </div>

      <!-- Banner resumen -->
      @if (criticalCount() > 0) {
        <div class="summary-banner banner-critical">
          <i class="ph ph-warning-circle"></i>
          <strong>{{ criticalCount() }} {{ criticalCount() === 1 ? 'asesor con problemas críticos' : 'asesores con problemas críticos' }}</strong>
          <span>— Expandí cada fila para ver qué hacer.</span>
        </div>
      } @else if (warningCount() > 0) {
        <div class="summary-banner banner-warning">
          <i class="ph ph-warning"></i>
          <strong>{{ warningCount() }} {{ warningCount() === 1 ? 'asesor con advertencias' : 'asesores con advertencias' }}</strong>
          <span>— Funcionando con fallbacks o selectores degradados.</span>
        </div>
      } @else if (sortedReports().length > 0) {
        <div class="summary-banner banner-ok">
          <i class="ph ph-check-circle"></i>
          <strong>Todo OK</strong>
          <span>— Todos los asesores reportan estado normal.</span>
        </div>
      }

      @if (sortedReports().length === 0) {
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
                <th class="text-center">Estado</th>
                <th class="text-center">Críticos</th>
                <th class="text-center">Warnings</th>
                <th>Última actualización</th>
              </tr>
            </thead>
            <tbody>
              @for (report of sortedReports(); track report.userId) {
                <tr [class.stale]="isStale(report)">
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
                    @if (isStale(report)) {
                      <span class="badge badge-secondary">Sin actividad</span>
                    } @else {
                      @switch (severity(report)) {
                        @case ('critical') { <span class="badge badge-danger">Crítico</span> }
                        @case ('warning')  { <span class="badge badge-warning">Warning</span> }
                        @default           { <span class="badge badge-success">OK</span> }
                      }
                    }
                  </td>
                  @if (isStale(report)) {
                    <td colspan="2"></td>
                  } @else {
                    <td class="text-center fw-bold text-danger">{{ criticalFeatures(report) || '—' }}</td>
                    <td class="text-center fw-bold text-warning">{{ warningFeatures(report) || '—' }}</td>
                  }
                  <td class="text-subtle">{{ relativeTime(report.timestamp) }}</td>
                </tr>

                @if (isExpanded(report.userId) && !isStale(report)) {
                  <tr class="detail-row">
                    <td colspan="7" class="detail-cell">

                      <!-- Acciones requeridas -->
                      @if (actionsRequired(report).length > 0) {
                        <div class="actions-section">
                          <div class="section-title"><i class="ph ph-wrench"></i> Acciones requeridas</div>
                          @for (item of actionsRequired(report); track item.key) {
                            <div class="action-item" [class.action-critical]="item.severity === 'critical'" [class.action-warning]="item.severity === 'warning'">
                              <i class="ph" [class.ph-warning-circle]="item.severity === 'critical'" [class.ph-warning]="item.severity === 'warning'"></i>
                              <div>
                                <div class="action-feature">{{ item.label }}</div>
                                <div class="action-text">{{ item.action }}</div>
                              </div>
                            </div>
                          }
                        </div>
                      }

                      <!-- Grid por categoría -->
                      <div class="category-grid">
                        @for (cat of categories(report); track cat.key) {
                          <div class="category-block">
                            <div class="category-title">{{ cat.label }}</div>
                            @for (f of cat.features; track f.key) {
                              <div class="feature-row">
                                @if (!f.status.ok && f.severity === 'critical') {
                                  <i class="ph ph-warning-circle text-danger"></i>
                                } @else if (!f.status.ok || f.status.usedFallback) {
                                  <i class="ph ph-warning text-warning"></i>
                                } @else {
                                  <i class="ph ph-check-circle text-success"></i>
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
    .page-header { margin-bottom: var(--space-4); }
    .page-title { margin: 0; font-size: var(--text-2xl); font-weight: var(--font-semibold); color: var(--fg-default); }
    .page-subtitle { margin: var(--space-1) 0 0; font-size: var(--text-sm); color: var(--fg-muted); }

    .summary-banner { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); margin-bottom: var(--space-4); font-size: var(--text-sm); i { font-size: 18px; flex-shrink: 0; } }
    .banner-critical { background: var(--error-subtle); color: var(--error-text); border: 1px solid var(--error-default, #f87171); }
    .banner-warning  { background: var(--warning-subtle); color: var(--warning-text); border: 1px solid var(--warning-default, #fbbf24); }
    .banner-ok       { background: var(--success-subtle); color: var(--success-text); border: 1px solid var(--success-default, #34d399); }

    .empty-state { text-align: center; padding: var(--space-12); color: var(--fg-muted); i { font-size: 48px; display: block; margin-bottom: var(--space-3); } }
    .table-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: var(--radius-lg); overflow: hidden; }
    .data-table { width: 100%; border-collapse: collapse; font-size: var(--text-base); }
    .data-table thead th { padding: var(--space-3) var(--space-4); background: var(--table-header-bg); color: var(--fg-muted); font-size: var(--text-sm); font-weight: var(--font-semibold); text-transform: uppercase; text-align: left; border-bottom: 1px solid var(--table-border); }
    .data-table tbody td { padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--table-border); vertical-align: middle; }
    .data-table tbody tr:not(.detail-row):last-child td { border-bottom: none; }
    .data-table tbody tr:not(.detail-row):hover { background: var(--table-row-hover); }
    .data-table tbody tr.stale { opacity: 0.5; }
    .col-expand { width: 40px; text-align: center; }
    .expand-btn { background: none; border: none; cursor: pointer; color: var(--fg-muted); padding: 4px; border-radius: var(--radius-sm); &:hover { color: var(--fg-default); background: var(--bg-muted); } }
    .text-center { text-align: center; }
    .text-success { color: var(--success-text); }
    .text-warning { color: var(--warning-text); }
    .text-danger  { color: var(--error-text); }
    .text-subtle  { color: var(--fg-subtle); font-size: var(--text-sm); }
    .fw-bold { font-weight: var(--font-semibold); }
    .agent-name { font-weight: var(--font-medium); }
    .agent-email { font-size: var(--text-xs); color: var(--fg-subtle); }
    .badge { display: inline-block; padding: 2px var(--space-3); border-radius: var(--radius-full); font-size: var(--text-xs); font-weight: var(--font-medium); white-space: nowrap; }
    .badge-danger    { background: var(--error-subtle);   color: var(--error-text); }
    .badge-warning   { background: var(--warning-subtle); color: var(--warning-text); }
    .badge-success   { background: var(--success-subtle); color: var(--success-text); }
    .badge-secondary { background: var(--bg-muted);       color: var(--fg-muted); }

    .detail-row td { padding: 0; }
    .detail-cell { padding: var(--space-4) var(--space-6) !important; background: var(--bg-subtle, var(--bg-muted)); border-top: 1px solid var(--table-border); }

    .actions-section { margin-bottom: var(--space-4); }
    .section-title { font-size: var(--text-xs); font-weight: var(--font-semibold); text-transform: uppercase; color: var(--fg-muted); letter-spacing: 0.4px; margin-bottom: var(--space-2); display: flex; align-items: center; gap: var(--space-1); i { font-size: 14px; } }
    .action-item { display: flex; align-items: flex-start; gap: var(--space-3); padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); margin-bottom: var(--space-2); i { font-size: 16px; flex-shrink: 0; margin-top: 2px; } }
    .action-critical { background: var(--error-subtle); color: var(--error-text); }
    .action-warning  { background: var(--warning-subtle); color: var(--warning-text); }
    .action-feature  { font-size: var(--text-sm); font-weight: var(--font-medium); }
    .action-text     { font-size: var(--text-sm); opacity: 0.85; }

    .category-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--space-3); }
    .category-block { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: var(--radius-md); padding: var(--space-3); }
    .category-title { font-size: var(--text-xs); font-weight: var(--font-semibold); text-transform: uppercase; color: var(--fg-muted); margin-bottom: var(--space-2); letter-spacing: 0.4px; }
    .feature-row { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-1) 0; i { font-size: 14px; flex-shrink: 0; } }
    .feature-label { font-size: var(--text-sm); color: var(--fg-default); flex: 1; }
    .feature-note  { font-size: var(--text-xs); color: var(--fg-subtle); white-space: nowrap; }
  `]
})
export class WaHealthComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  reports = signal<HealthReport[]>([]);
  expandedRows = signal<Set<number | undefined>>(new Set());

  sortedReports = computed(() =>
    [...this.reports()].sort((a, b) => {
      const order: Record<string, number> = { critical: 0, warning: 1, ok: 2, stale: 3 };
      const sa = this.isStale(a) ? 3 : order[reportSeverity(a)];
      const sb = this.isStale(b) ? 3 : order[reportSeverity(b)];
      return sa - sb;
    })
  );

  criticalCount = computed(() =>
    this.reports().filter(r => !this.isStale(r) && reportSeverity(r) === 'critical').length
  );
  warningCount = computed(() =>
    this.reports().filter(r => !this.isStale(r) && reportSeverity(r) === 'warning').length
  );

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

  isStale(r: HealthReport): boolean { return Date.now() - r.timestamp > STALE_MS; }
  isExpanded(userId?: number): boolean { return this.expandedRows().has(userId); }

  toggleExpand(userId?: number): void {
    this.expandedRows.update(set => {
      const next = new Set(set);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  }

  severity(r: HealthReport): Severity { return reportSeverity(r); }

  criticalFeatures(r: HealthReport): number {
    return Object.entries(r.features || {}).filter(([k, s]) => !s.ok && featureSeverity(k, s) === 'critical').length;
  }
  warningFeatures(r: HealthReport): number {
    return Object.entries(r.features || {}).filter(([k, s]) => !s.ok && featureSeverity(k, s) === 'warning' || !!s.usedFallback).length;
  }

  actionsRequired(r: HealthReport): { key: string; label: string; severity: Severity; action: string }[] {
    return Object.entries(r.features || {})
      .filter(([, s]) => !s.ok)
      .map(([key, status]) => {
        const sev = featureSeverity(key, status);
        const action = getAction(key, status.note);
        return action ? { key, label: FEATURE_LABELS[key] || key, severity: sev, action } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => (a.severity === 'critical' ? 0 : 1) - (b.severity === 'critical' ? 0 : 1));
  }

  categories(r: HealthReport): { key: string; label: string; features: FeatureRow[] }[] {
    const grouped: Record<string, FeatureRow[]> = {};
    for (const [key, status] of Object.entries(r.features || {})) {
      const cat = status.category || FEATURE_CATEGORY[key] || 'other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push({ key, label: FEATURE_LABELS[key] || key, status, severity: featureSeverity(key, status) });
    }
    return Object.entries(grouped)
      .map(([key, features]) => ({ key, label: CATEGORY_LABELS[key] || key, features }))
      .sort((a, b) => {
        const worst = (fs: FeatureRow[]) =>
          fs.some(f => f.severity === 'critical') ? 0 : fs.some(f => f.severity === 'warning') ? 1 : 2;
        return worst(a.features) - worst(b.features);
      });
  }

  noteLabel(note: string): string { return NOTE_LABELS[note] || note; }

  relativeTime(ts: number): string {
    if (!ts) return '—';
    const sec = Math.round((Date.now() - ts) / 1000);
    if (sec < 60) return 'hace un momento';
    if (sec < 3600) return `hace ${Math.round(sec / 60)} min`;
    return `hace ${Math.round(sec / 3600)} h`;
  }
}
