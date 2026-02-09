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
          <i class="ph-arrow-left"></i> Volver a envíos
        </a>
        <div class="header-row">
          <h1>Envío #{{ bulkSendId }}</h1>
          @if (detail()) {
            <span class="status-badge" [class]="bulkSendService.getStatusClass(detail()!.status)">
              {{ bulkSendService.getStatusLabel(detail()!.status) }}
            </span>
          }
        </div>
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
                <i class="ph-pause"></i> Pausar
              </button>
            }
            @if (detail()!.status === 'PAUSED') {
              <button class="btn btn-success" (click)="resume()">
                <i class="ph-play"></i> Reanudar
              </button>
            }
            @if (detail()!.status === 'PENDING' && electronService.isElectron) {
              <button class="btn btn-primary" (click)="startSending()">
                <i class="ph-paper-plane-tilt"></i> Iniciar Envío
              </button>
            }
            <button class="btn btn-danger" (click)="cancel()">
              <i class="ph-x"></i> Cancelar
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
                <i class="ph-paperclip"></i>
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
                <i class="ph-caret-left"></i>
              </button>
              <span>Página {{ recipientPage() + 1 }} de {{ detail()!.recipients_total_pages }}</span>
              <button class="btn btn-sm" [disabled]="recipientPage() >= detail()!.recipients_total_pages - 1"
                      (click)="loadRecipientPage(recipientPage() + 1)">
                <i class="ph-caret-right"></i>
              </button>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .envio-detail-container { padding: 24px; max-width: 900px; margin: 0 auto; }
    .page-header { margin-bottom: 20px; }
    .back-link {
      display: inline-flex; align-items: center; gap: 4px;
      color: #6c757d; text-decoration: none; font-size: 14px; margin-bottom: 8px;
      &:hover { color: #4361ee; }
    }
    .header-row {
      display: flex; align-items: center; gap: 12px;
      h1 { font-size: 24px; font-weight: 600; margin: 0; color: #1a1a2e; }
    }

    .progress-section {
      background: white; border: 1px solid #e9ecef; border-radius: 12px; padding: 20px; margin-bottom: 16px;
    }
    .progress-bar-lg { width: 100%; height: 12px; background: #e9ecef; border-radius: 6px; overflow: hidden; margin-bottom: 16px; }
    .progress-fill {
      height: 100%; background: #4361ee; border-radius: 6px; transition: width 0.5s;
      &.complete { background: #10b981; }
      &.failed { background: #ef4444; }
    }
    .progress-stats {
      display: flex; justify-content: space-around;
      .stat {
        text-align: center;
        .stat-value { display: block; font-size: 24px; font-weight: 700; color: #1a1a2e; }
        .stat-label { font-size: 12px; color: #6c757d; }
        &.success .stat-value { color: #10b981; }
        &.danger .stat-value { color: #ef4444; }
      }
    }

    .action-bar {
      display: flex; gap: 8px; margin-bottom: 16px;
    }

    .card {
      background: white; border: 1px solid #e9ecef; border-radius: 12px; margin-bottom: 16px; overflow: hidden;
    }
    .card-header {
      display: flex; align-items: center; justify-content: space-between; padding: 14px 20px;
      border-bottom: 1px solid #f0f0f0;
      h3 { margin: 0; font-size: 16px; font-weight: 600; }
      .count { font-size: 13px; color: #6c757d; }
    }
    .card-body { padding: 16px 20px; }
    .message-content {
      background: #f8f9fa; border-radius: 8px; padding: 14px; font-size: 14px;
      white-space: pre-wrap; word-wrap: break-word; font-family: inherit; margin: 0;
    }
    .attachment-info {
      display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 14px; color: #495057;
      i { color: #4361ee; }
      .file-size { color: #999; font-size: 12px; }
    }

    .table-wrapper { overflow-x: auto; }
    .data-table {
      width: 100%; border-collapse: collapse;
      th, td { padding: 10px 16px; text-align: left; border-bottom: 1px solid #f0f0f0; }
      th { background: #f8f9fa; font-size: 12px; font-weight: 600; text-transform: uppercase; color: #6c757d; }
    }
    .phone-cell { font-family: monospace; font-size: 13px; }
    .date-cell { font-size: 13px; color: #6c757d; }
    .error-cell { font-size: 12px; color: #ef4444; max-width: 200px; overflow: hidden; text-overflow: ellipsis; }

    .recipient-badge {
      display: inline-block; padding: 3px 8px; border-radius: 10px; font-size: 11px; font-weight: 500;
    }
    .rb-pending { background: #fff3cd; color: #856404; }
    .rb-sent { background: #d4edda; color: #155724; }
    .rb-failed { background: #f8d7da; color: #721c24; }
    .rb-skipped { background: #e2e3e5; color: #383d41; }

    .status-badge {
      display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 500;
    }
    .badge-warning { background: #fff3cd; color: #856404; }
    .badge-info { background: #d1ecf1; color: #0c5460; }
    .badge-secondary { background: #e2e3e5; color: #383d41; }
    .badge-success { background: #d4edda; color: #155724; }
    .badge-dark { background: #d6d8d9; color: #1b1e21; }
    .badge-danger { background: #f8d7da; color: #721c24; }

    .pagination {
      display: flex; justify-content: center; align-items: center; gap: 12px; padding: 12px;
      span { font-size: 14px; color: #6c757d; }
    }

    .btn {
      display: inline-flex; align-items: center; gap: 6px; padding: 10px 20px;
      border: none; border-radius: 8px; font-size: 14px; font-weight: 500;
      cursor: pointer; transition: all 0.2s;
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }
    .btn-sm { padding: 6px 12px; font-size: 13px; }
    .btn-primary { background: #4361ee; color: white; &:hover:not(:disabled) { background: #3a56d4; } }
    .btn-success { background: #10b981; color: white; &:hover:not(:disabled) { background: #059669; } }
    .btn-warning { background: #f59e0b; color: white; &:hover:not(:disabled) { background: #d97706; } }
    .btn-danger { background: #ef4444; color: white; &:hover:not(:disabled) { background: #dc2626; } }
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
  detail = signal<BulkSendDetail | null>(null);
  recipientPage = signal(0);

  ngOnInit(): void {
    this.bulkSendId = Number(this.route.snapshot.paramMap.get('id'));
    this.loadDetail();

    // Poll every 3s while processing
    interval(3000).pipe(
      takeUntil(this.destroy$),
      filter(() => {
        const d = this.detail();
        return d !== null && (d.status === 'PROCESSING' || d.status === 'PENDING');
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
    this.bulkSendService.pauseBulkSend(this.bulkSendId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.toast.success('Envío pausado'); this.loadDetail(); },
      error: (err) => this.toast.error(err.error?.message || 'Error')
    });
  }

  resume(): void {
    this.bulkSendService.resumeBulkSend(this.bulkSendId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.toast.success('Envío reanudado'); this.loadDetail(); },
      error: (err) => this.toast.error(err.error?.message || 'Error')
    });
  }

  cancel(): void {
    if (!confirm('¿Cancelar este envío?')) return;
    this.bulkSendService.cancelBulkSend(this.bulkSendId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.toast.success('Envío cancelado'); this.loadDetail(); },
      error: (err) => this.toast.error(err.error?.message || 'Error')
    });
  }

  async startSending(): Promise<void> {
    if (!this.electronService.isElectron) {
      this.toast.error('Solo disponible en la aplicación de escritorio');
      return;
    }
    const token = this.authService.getToken();
    if (token) {
      const ok = await this.electronService.startBulkSend(this.bulkSendId, token);
      if (ok) {
        this.toast.success('Envío iniciado');
        this.loadDetail();
      } else {
        this.toast.error('No se pudo iniciar el envío');
      }
    }
  }
}
