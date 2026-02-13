import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subject, interval, takeUntil, switchMap, filter } from 'rxjs';
import { BulkSendService, BulkSendDetail, BulkSendRecipient } from '../../../../core/services/bulk-send.service';
import { ElectronService } from '../../../../core/services/electron.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../core/services/toast.service';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-envio-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, LoadingSpinnerComponent, DatePipe],
  template: `
    <div class="envio-detail-container">
      <div class="page-header">
        <a routerLink="/app/bulk_sends" class="back-link">
          <i class="ph ph-arrow-left"></i> Volver a envíos
        </a>
        <div class="header-row">
          <h1>Envío #{{ bulkSendId }}</h1>
          @if (detail()) {
            <span class="status-badge" [class]="bulkSendService.getStatusClass(detail()!.status)">
              {{ bulkSendService.getStatusLabel(detail()!.status) }}
            </span>
          }
        </div>
        @if (detail()) {
          <div class="agent-info-row">
            @if (detail()!.assigned_agent_name) {
              <span class="info-tag"><i class="ph ph-user"></i> Agente: <strong>{{ detail()!.assigned_agent_name }}</strong></span>
            }
            @if (detail()!.user_name && detail()!.user_name !== detail()!.assigned_agent_name) {
              <span class="info-tag"><i class="ph ph-user-circle"></i> Creado por: <strong>{{ detail()!.user_name }}</strong></span>
            }
          </div>
        }
      </div>

      @if (isLoading()) {
        <app-loading-spinner message="Cargando detalle..." />
      } @else if (detail()) {
        <!-- Progress Bar -->
        <div class="progress-section">
          <div class="progress-bar-lg">
            <div class="progress-fill"
                 [style.width.%]="detail()!.progress_percent"
                 [class.complete]="detail()!.status === 'COMPLETED'"
                 [class.failed]="detail()!.status === 'FAILED'">
            </div>
          </div>
          <div class="progress-stats">
            <div class="stat">
              <span class="stat-value">{{ detail()!.total_recipients }}</span>
              <span class="stat-label">Total</span>
            </div>
            <div class="stat success">
              <span class="stat-value">{{ detail()!.sent_count }}</span>
              <span class="stat-label">Enviados</span>
            </div>
            <div class="stat danger">
              <span class="stat-value">{{ detail()!.failed_count }}</span>
              <span class="stat-label">Fallidos</span>
            </div>
            <div class="stat">
              <span class="stat-value">{{ detail()!.total_recipients - detail()!.sent_count - detail()!.failed_count }}</span>
              <span class="stat-label">Pendientes</span>
            </div>
          </div>
        </div>

        <!-- Actions -->
        @if (detail()!.status === 'PROCESSING' || detail()!.status === 'PAUSED' || detail()!.status === 'PENDING') {
          <div class="action-bar">
            @if (detail()!.status === 'PROCESSING') {
              <button class="btn btn-warning" (click)="pause()">
                <i class="ph ph-pause"></i> Pausar
              </button>
            }
            @if (detail()!.status === 'PAUSED') {
              <button class="btn btn-success" (click)="resume()">
                <i class="ph ph-play"></i> Reanudar
              </button>
            }
            @if (detail()!.status === 'PENDING' && electronService.isElectron && isAssignedAgent()) {
              <button class="btn btn-primary" (click)="startSending()" [disabled]="isStarting()">
                @if (isStarting()) {
                  <i class="ph ph-spinner ph-spin"></i> Iniciando...
                } @else {
                  <i class="ph ph-paper-plane-tilt"></i> Iniciar Envío
                }
              </button>
            }
            <button class="btn btn-danger" (click)="cancel()">
              <i class="ph ph-x"></i> Cancelar
            </button>
          </div>
        }

        <!-- Message Content -->
        <div class="card">
          <div class="card-header"><h3>Mensaje</h3></div>
          <div class="card-body">
            <pre class="message-content">{{ detail()!.message_content }}</pre>
            @if (detail()!.attachment_original_name) {
              <div class="attachment-info">
                <i class="ph ph-paperclip"></i>
                <span>{{ detail()!.attachment_original_name }}</span>
                @if (detail()!.attachment_size) {
                  <span class="file-size">({{ bulkSendService.formatFileSize(detail()!.attachment_size) }})</span>
                }
              </div>
            }
          </div>
        </div>

        <!-- Recipients Table -->
        <div class="card">
          <div class="card-header">
            <h3>Destinatarios</h3>
            <span class="count">{{ detail()!.recipients_total }} total</span>
          </div>
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Teléfono</th>
                  <th>Estado</th>
                  <th>Hora Envío</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                @for (r of detail()!.recipients; track r.id) {
                  <tr>
                    <td>{{ r.recipient_name || '—' }}</td>
                    <td class="phone-cell">{{ r.phone }}</td>
                    <td>
                      <span class="recipient-badge" [class]="getRecipientClass(r.status)">
                        {{ bulkSendService.getRecipientStatusLabel(r.status) }}
                      </span>
                    </td>
                    <td class="date-cell">{{ r.sent_at ? (r.sent_at | date:'HH:mm:ss') : '—' }}</td>
                    <td class="error-cell">{{ r.error_message || '' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          @if (detail()!.recipients_total_pages > 1) {
            <div class="pagination">
              <button class="btn btn-sm" [disabled]="recipientPage() === 0" (click)="loadRecipientPage(recipientPage() - 1)">
                <i class="ph ph-caret-left"></i>
              </button>
              <span>Página {{ recipientPage() + 1 }} de {{ detail()!.recipients_total_pages }}</span>
              <button class="btn btn-sm" [disabled]="recipientPage() >= detail()!.recipients_total_pages - 1"
                      (click)="loadRecipientPage(recipientPage() + 1)">
                <i class="ph ph-caret-right"></i>
              </button>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .envio-detail-container { padding: var(--space-6); max-width: 900px; margin: 0 auto; }
    .page-header { margin-bottom: var(--space-5); }
    .back-link {
      display: inline-flex; align-items: center; gap: var(--space-1);
      color: var(--fg-muted); text-decoration: none; font-size: var(--text-base); margin-bottom: var(--space-2);
      &:hover { color: var(--accent-default); }
    }
    .header-row {
      display: flex; align-items: center; gap: var(--space-3);
      h1 { font-size: var(--text-2xl); font-weight: var(--font-semibold); margin: 0; color: var(--fg-default); }
    }
    .agent-info-row {
      display: flex; gap: var(--space-4); margin-top: var(--space-2); flex-wrap: wrap;
      .info-tag {
        display: inline-flex; align-items: center; gap: var(--space-1);
        font-size: var(--text-sm); color: var(--fg-muted); background: var(--accent-subtle);
        padding: var(--space-1) var(--space-3); border-radius: var(--radius-md);
        i { color: var(--accent-default); }
        strong { color: var(--fg-default); }
      }
    }

    .progress-section {
      background: var(--card-bg); border: 1px solid var(--card-border); border-radius: var(--radius-xl); padding: var(--space-5); margin-bottom: var(--space-4);
    }
    .progress-bar-lg { width: 100%; height: 12px; background: var(--bg-muted); border-radius: var(--radius-md); overflow: hidden; margin-bottom: var(--space-4); }
    .progress-fill {
      height: 100%; background: var(--accent-default); border-radius: var(--radius-md); transition: width 0.5s;
      &.complete { background: var(--success-default); }
      &.failed { background: var(--error-default); }
    }
    .progress-stats {
      display: flex; justify-content: space-around;
      .stat {
        text-align: center;
        .stat-value { display: block; font-size: var(--text-2xl); font-weight: 700; color: var(--fg-default); }
        .stat-label { font-size: var(--text-sm); color: var(--fg-muted); }
        &.success .stat-value { color: var(--success-default); }
        &.danger .stat-value { color: var(--error-default); }
      }
    }

    .action-bar {
      display: flex; gap: var(--space-2); margin-bottom: var(--space-4);
    }

    .card {
      background: var(--card-bg); border: 1px solid var(--card-border); border-radius: var(--radius-xl); margin-bottom: var(--space-4); overflow: hidden;
    }
    .card-header {
      display: flex; align-items: center; justify-content: space-between; padding: 14px var(--space-5);
      border-bottom: 1px solid var(--border-muted);
      h3 { margin: 0; font-size: var(--text-lg); font-weight: var(--font-semibold); color: var(--fg-default); }
      .count { font-size: var(--text-sm); color: var(--fg-muted); }
    }
    .card-body { padding: var(--space-4) var(--space-5); }
    .message-content {
      background: var(--bg-subtle); border-radius: var(--radius-lg); padding: 14px; font-size: var(--text-base);
      white-space: pre-wrap; word-wrap: break-word; font-family: inherit; margin: 0; color: var(--fg-default);
    }
    .attachment-info {
      display: flex; align-items: center; gap: var(--space-2); margin-top: 10px; font-size: var(--text-base); color: var(--fg-muted);
      i { color: var(--accent-default); }
      .file-size { color: var(--fg-subtle); font-size: var(--text-sm); }
    }

    .table-wrapper { overflow-x: auto; }
    .data-table {
      width: 100%; border-collapse: collapse;
      th, td { padding: 10px var(--space-4); text-align: left; border-bottom: 1px solid var(--border-muted); color: var(--fg-default); }
      th { background: var(--table-header-bg); font-size: var(--text-sm); font-weight: var(--font-semibold); text-transform: uppercase; color: var(--fg-muted); letter-spacing: 0.3px; }
      tbody tr:hover td { background: var(--table-row-hover); }
    }
    .phone-cell { font-family: var(--font-mono); font-size: var(--text-sm); }
    .date-cell { font-size: var(--text-sm); color: var(--fg-muted); }
    .error-cell { font-size: var(--text-sm); color: var(--error-default); max-width: 200px; overflow: hidden; text-overflow: ellipsis; }

    .recipient-badge {
      display: inline-flex; align-items: center; height: 22px; padding: 0 var(--space-2); border-radius: var(--radius-full); font-size: var(--text-xs); font-weight: var(--font-medium);
    }
    .rb-pending { background: var(--warning-subtle); color: var(--warning-text); }
    .rb-sent { background: var(--success-subtle); color: var(--success-text); }
    .rb-failed { background: var(--error-subtle); color: var(--error-text); }
    .rb-skipped { background: var(--bg-muted); color: var(--fg-muted); }

    .status-badge {
      display: inline-flex; align-items: center; height: var(--badge-height); padding: 0 var(--space-3);
      border-radius: var(--radius-full); font-size: var(--text-sm); font-weight: var(--font-medium);
    }
    .badge-warning { background: var(--warning-subtle); color: var(--warning-text); }
    .badge-info { background: var(--accent-subtle); color: var(--accent-emphasis); }
    .badge-secondary { background: var(--bg-muted); color: var(--fg-muted); }
    .badge-success { background: var(--success-subtle); color: var(--success-text); }
    .badge-dark { background: var(--bg-emphasis); color: var(--fg-muted); }
    .badge-danger { background: var(--error-subtle); color: var(--error-text); }

    .pagination {
      display: flex; justify-content: center; align-items: center; gap: var(--space-3); padding: var(--space-3);
      span { font-size: var(--text-base); color: var(--fg-muted); }
    }

    .btn {
      display: inline-flex; align-items: center; gap: 6px; padding: 10px 20px;
      border: none; border-radius: var(--radius-lg); font-size: var(--text-base); font-weight: var(--font-medium);
      cursor: pointer; transition: all var(--duration-normal);
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }
    .btn-sm { padding: 6px 12px; font-size: var(--text-sm); }
    .btn-primary { background: var(--accent-default); color: white; &:hover:not(:disabled) { background: var(--accent-emphasis); } }
    .btn-success { background: var(--success-default); color: white; &:hover:not(:disabled) { filter: brightness(0.85); } }
    .btn-warning { background: var(--warning-default); color: white; &:hover:not(:disabled) { filter: brightness(0.85); } }
    .btn-danger { background: var(--error-default); color: white; &:hover:not(:disabled) { filter: brightness(0.85); } }

    .ph-spin { animation: spin 1s linear infinite; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  `]
})
export class EnvioDetailComponent implements OnInit, OnDestroy {
  bulkSendService = inject(BulkSendService);
  electronService = inject(ElectronService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  private destroy$ = new Subject<void>();

  bulkSendId = 0;
  isLoading = signal(false);
  isStarting = signal(false);
  detail = signal<BulkSendDetail | null>(null);
  recipientPage = signal(0);

  isAssignedAgent(): boolean {
    const d = this.detail();
    const user = this.authService.currentUser();
    if (!d || !user) return false;
    // If no assigned agent, fall back to creator (backward compat)
    const agentId = d.assigned_agent_id ?? d.user_id;
    return agentId === user.id;
  }

  ngOnInit(): void {
    this.bulkSendId = Number(this.route.snapshot.paramMap.get('id'));
    this.loadDetail();

    // Poll every 3s while processing
    interval(3000).pipe(
      takeUntil(this.destroy$),
      filter(() => {
        const d = this.detail();
        return d !== null && d.status !== 'COMPLETED' && d.status !== 'CANCELLED' && d.status !== 'FAILED';
      }),
      switchMap(() => this.bulkSendService.getBulkSend(this.bulkSendId, this.recipientPage()))
    ).subscribe({
      next: (d) => this.detail.set(d)
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadDetail(): void {
    this.isLoading.set(true);
    this.bulkSendService.getBulkSend(this.bulkSendId, this.recipientPage()).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (d) => { this.detail.set(d); this.isLoading.set(false); },
      error: (err) => { console.error('Error loading detail:', err); this.isLoading.set(false); }
    });
  }

  loadRecipientPage(page: number): void {
    this.recipientPage.set(page);
    this.loadDetail();
  }

  getRecipientClass(status: string): string {
    const map: Record<string, string> = {
      'PENDING': 'rb-pending', 'SENT': 'rb-sent', 'FAILED': 'rb-failed', 'SKIPPED': 'rb-skipped'
    };
    return map[status] || 'rb-pending';
  }

  pause(): void {
    if (this.electronService.isElectron) {
      this.electronService.pauseBulkSend();
    }
    this.bulkSendService.pauseBulkSend(this.bulkSendId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.toast.success('Envío pausado'); this.loadDetail(); },
      error: (err) => this.toast.error(err.error?.message || 'Error al pausar')
    });
  }

  resume(): void {
    if (this.electronService.isElectron) {
      this.electronService.resumeBulkSend();
    }
    this.bulkSendService.resumeBulkSend(this.bulkSendId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.toast.success('Envío reanudado'); this.loadDetail(); },
      error: (err) => this.toast.error(err.error?.message || 'Error al reanudar')
    });
  }

  cancel(): void {
    if (!confirm('¿Cancelar este envío?')) return;
    if (this.electronService.isElectron) {
      this.electronService.cancelBulkSend();
    }
    this.bulkSendService.cancelBulkSend(this.bulkSendId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.toast.success('Envío cancelado'); this.loadDetail(); },
      error: (err) => this.toast.error(err.error?.message || 'Error al cancelar')
    });
  }

  async startSending(): Promise<void> {
    if (!this.electronService.isElectron) {
      this.toast.error('Solo disponible en la aplicación de escritorio');
      return;
    }
    if (this.isStarting()) return;

    const token = this.authService.getToken();
    if (!token) {
      this.toast.error('Sesión expirada. Vuelve a iniciar sesión.');
      return;
    }

    this.isStarting.set(true);
    try {
      const ok = await this.electronService.startBulkSend(this.bulkSendId, token);
      if (ok) {
        this.toast.success('Envío masivo iniciado');
        this.loadDetail();
      } else {
        this.toast.error('No se pudo iniciar. Verifica que WhatsApp esté conectado.');
      }
    } catch {
      this.toast.error('Error al comunicarse con WhatsApp');
    } finally {
      this.isStarting.set(false);
    }
  }
}
