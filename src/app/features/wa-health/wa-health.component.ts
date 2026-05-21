import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

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
}

const FEATURE_LABELS: Record<string, string> = {
  session_main:    'Panel principal',
  login_state:     'Estado de login',
  chat_header:     'Header del chat',
  chat_title:      'Título del chat',
  compose_box:     'Caja de composición',
  search_input:    'Buscador de chats',
  msg_panel:       'Panel de mensajes',
  msg_items:       'Items de mensajes',
  msg_direction:   'Dirección de mensajes',
  msg_text:        'Texto de mensajes',
  msg_audio:       'Audio en chat',
  msg_image:       'Imágenes en chat',
  contact_drawer:  'Panel de contacto',
};

@Component({
  selector: 'app-wa-health',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="container-fluid py-4">
      <!-- Header -->
      <div class="page-header mb-4">
        <div class="row align-items-center">
          <div class="col">
            <h1 class="h3 mb-1">
              <i class="ph ph-heartbeat me-2"></i>Diagnóstico WhatsApp Web
            </h1>
            <p class="text-muted mb-0">Estado de los selectores DOM en la sesión activa</p>
          </div>
          <div class="col-auto d-flex align-items-center gap-3">
            @if (report()) {
              <span class="text-muted small">
                v{{ report()!.appVersion }} &middot; {{ relativeTime() }}
              </span>
            }
            <button class="btn btn-primary btn-sm" (click)="runProbe()" [disabled]="running()">
              @if (running()) {
                <span class="spinner-border spinner-border-sm me-1"></span>Verificando...
              } @else {
                <i class="ph ph-arrows-clockwise me-1"></i>Verificar ahora
              }
            </button>
          </div>
        </div>
      </div>

      <!-- Not in Electron -->
      @if (!isElectron) {
        <div class="alert alert-warning d-flex align-items-center gap-2">
          <i class="ph ph-warning fs-5"></i>
          <span>Este diagnóstico solo está disponible en la aplicación de escritorio.</span>
        </div>
      }

      <!-- No report yet -->
      @else if (!report()) {
        <div class="card">
          <div class="card-body text-center py-5 text-muted">
            <i class="ph ph-hourglass fs-1 d-block mb-2"></i>
            <p class="mb-0">Esperando el primer reporte de salud&hellip;</p>
            <p class="small mb-0">El probe corre automáticamente cuando WhatsApp está abierto.</p>
          </div>
        </div>
      }

      <!-- WA not loaded -->
      @else if (!report()!.waLoaded) {
        <div class="alert alert-secondary d-flex align-items-center gap-2">
          <i class="ph ph-wifi-slash fs-5"></i>
          <span>
            WhatsApp no está cargado o el agente no ha iniciado sesión todavía.
            @if (report()!.error) {
              <br><code class="small">{{ report()!.error }}</code>
            }
          </span>
        </div>
      }

      <!-- Feature table -->
      @else {
        <div class="card">
          <div class="card-body p-0">
            <table class="table table-hover mb-0">
              <thead class="table-light">
                <tr>
                  <th class="ps-3">Feature</th>
                  <th class="text-center" style="width:120px">Estado</th>
                  <th>Nota</th>
                </tr>
              </thead>
              <tbody>
                @for (row of featureRows(); track row.key) {
                  <tr>
                    <td class="ps-3 align-middle">{{ row.label }}</td>
                    <td class="text-center align-middle">
                      @if (row.status.ok) {
                        @if (row.status.usedFallback) {
                          <span class="badge bg-warning text-dark">
                            <i class="ph ph-warning me-1"></i>Fallback
                          </span>
                        } @else {
                          <i class="ph ph-check-circle text-success fs-5"></i>
                        }
                      } @else {
                        <i class="ph ph-x-circle text-danger fs-5"></i>
                      }
                    </td>
                    <td class="align-middle text-muted small">{{ noteLabel(row.status) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <!-- Summary -->
        <div class="row mt-3 g-3">
          <div class="col-auto">
            <div class="card text-center px-4 py-3">
              <div class="fs-4 fw-bold text-success">{{ okCount() }}</div>
              <div class="small text-muted">OK</div>
            </div>
          </div>
          <div class="col-auto">
            <div class="card text-center px-4 py-3">
              <div class="fs-4 fw-bold text-warning">{{ fallbackCount() }}</div>
              <div class="small text-muted">Fallback</div>
            </div>
          </div>
          <div class="col-auto">
            <div class="card text-center px-4 py-3">
              <div class="fs-4 fw-bold text-danger">{{ failCount() }}</div>
              <div class="small text-muted">Rotos</div>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class WaHealthComponent implements OnInit, OnDestroy {
  readonly isElectron = typeof (window as any).electronAPI !== 'undefined';

  report = signal<HealthReport | null>(null);
  running = signal(false);

  featureRows = computed(() => {
    const r = this.report();
    if (!r) return [];
    return Object.entries(FEATURE_LABELS).map(([key, label]) => ({
      key,
      label,
      status: r.features[key] ?? { ok: false, note: 'not_reported' },
    }));
  });

  okCount = computed(() =>
    this.featureRows().filter(r => r.status.ok && !r.status.usedFallback).length
  );
  fallbackCount = computed(() =>
    this.featureRows().filter(r => r.status.ok && r.status.usedFallback).length
  );
  failCount = computed(() =>
    this.featureRows().filter(r => !r.status.ok).length
  );

  relativeTime = computed(() => {
    const r = this.report();
    if (!r) return '';
    const sec = Math.round((Date.now() - r.timestamp) / 1000);
    if (sec < 60) return 'hace un momento';
    if (sec < 3600) return `hace ${Math.round(sec / 60)} min`;
    return `hace ${Math.round(sec / 3600)} h`;
  });

  private tickInterval: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    if (!this.isElectron) return;

    (window as any).electronAPI.getWhatsappHealth().then((r: HealthReport | null) => {
      if (r) this.report.set(r);
    });

    (window as any).electronAPI.onWhatsappHealthUpdate((r: HealthReport) => {
      this.report.set(r);
      this.running.set(false);
    });

    // Refresh relative-time label every 30s
    this.tickInterval = setInterval(() => {
      if (this.report()) this.report.update(r => r ? { ...r } : r);
    }, 30_000);
  }

  ngOnDestroy(): void {
    if (this.tickInterval) clearInterval(this.tickInterval);
    (window as any).electronAPI?.removeAllListeners?.('whatsapp:health-update');
  }

  async runProbe(): Promise<void> {
    if (!this.isElectron || this.running()) return;
    this.running.set(true);
    const result = await (window as any).electronAPI.runHealthProbe();
    if (result) {
      this.report.set(result);
    }
    this.running.set(false);
  }

  noteLabel(status: FeatureStatus): string {
    if (!status.note) return '';
    const map: Record<string, string> = {
      no_chat_open:         'sin chat abierto',
      no_messages_visible:  'sin mensajes visibles',
      requires_interaction: 'requiere interacción del usuario',
      no_msg_panel:         'panel de mensajes no encontrado',
      selector_missing:     'selector no encontrado en el DOM',
      not_reported:         'no reportado',
      no_audio_visible:     'sin audio visible',
      no_image_visible:     'sin imagen visible',
    };
    return map[status.note] ?? status.note;
  }
}
