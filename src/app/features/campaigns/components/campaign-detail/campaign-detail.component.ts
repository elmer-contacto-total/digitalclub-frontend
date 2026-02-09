import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subject, takeUntil, interval, switchMap, filter } from 'rxjs';
import { CampaignService, CampaignDetail, CampaignRecipient } from '../../../../core/services/campaign.service';
import { ToastService } from '../../../../core/services/toast.service';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-campaign-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, LoadingSpinnerComponent],
  template: `
    <div class="campaign-detail-container">
      <div class="page-header">
        <a routerLink="/app/campaigns" class="back-link">
          <i class="ph-arrow-left"></i> Volver a campañas
        </a>
        <h1>Campaña #{{ campaign()?.id }}</h1>
      </div>

      @if (isLoading()) {
        <app-loading-spinner message="Cargando campaña..." />
      } @else if (campaign()) {
        <!-- Status Card -->
        <div class="status-card">
          <div class="status-header">
            <div class="status-info">
              <span class="status-badge" [ngClass]="campaignService.getStatusClass(campaign()!.status)">
                {{ campaignService.getStatusLabel(campaign()!.status) }}
              </span>
              <span class="method-badge" [class.cloud]="campaign()!.send_method === 'CLOUD_API'" [class.electron]="campaign()!.send_method === 'ELECTRON'">
                {{ campaignService.getMethodLabel(campaign()!.send_method) }}
              </span>
            </div>
            <div class="status-actions">
              @if (campaign()!.status === 'PROCESSING') {
                <button class="btn btn-warning" (click)="pause()">
                  <i class="ph-pause"></i> Pausar
                </button>
              }
              @if (campaign()!.status === 'PAUSED') {
                <button class="btn btn-primary" (click)="resume()">
                  <i class="ph-play"></i> Reanudar
                </button>
              }
              @if (campaign()!.status === 'PROCESSING' || campaign()!.status === 'PAUSED' || campaign()!.status === 'PENDING') {
                <button class="btn btn-danger" (click)="cancel()">
                  <i class="ph-x-circle"></i> Cancelar
                </button>
              }
            </div>
          </div>

          <!-- Progress -->
          <div class="progress-section">
            <div class="progress-bar-lg">
              <div class="progress-fill"
                   [style.width.%]="campaign()!.progress_percent"
                   [class.complete]="campaign()!.status === 'COMPLETED'"
                   [class.failed]="campaign()!.status === 'FAILED'">
              </div>
            </div>
            <div class="progress-label">{{ campaign()!.progress_percent }}% completado</div>
          </div>

          <!-- Stats -->
          <div class="stats-grid">
            <div class="stat-card">
              <span class="stat-value total">{{ campaign()!.total_recipients }}</span>
              <span class="stat-label">Total</span>
            </div>
            <div class="stat-card">
              <span class="stat-value sent">{{ campaign()!.sent_count }}</span>
              <span class="stat-label">Enviados</span>
            </div>
            <div class="stat-card">
              <span class="stat-value failed">{{ campaign()!.failed_count }}</span>
              <span class="stat-label">Fallidos</span>
            </div>
            <div class="stat-card">
              <span class="stat-value pending">{{ campaign()!.total_recipients - campaign()!.sent_count - campaign()!.failed_count }}</span>
              <span class="stat-label">Pendientes</span>
            </div>
          </div>

          <!-- Details -->
          <div class="details-grid">
            @if (campaign()!.template_name) {
              <div class="detail-row">
                <span class="detail-label">Plantilla:</span>
                <span class="detail-value">{{ campaign()!.template_name }}</span>
              </div>
            }
            @if (campaign()!.message_preview) {
              <div class="detail-row">
                <span class="detail-label">Mensaje:</span>
                <span class="detail-value">{{ campaign()!.message_preview }}</span>
              </div>
            }
            <div class="detail-row">
              <span class="detail-label">Creado por:</span>
              <span class="detail-value">{{ campaign()!.user_name || '-' }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Creado:</span>
              <span class="detail-value">{{ campaign()!.created_at | date:'dd/MM/yyyy HH:mm' }}</span>
            </div>
            @if (campaign()!.started_at) {
              <div class="detail-row">
                <span class="detail-label">Iniciado:</span>
                <span class="detail-value">{{ campaign()!.started_at | date:'dd/MM/yyyy HH:mm:ss' }}</span>
              </div>
            }
            @if (campaign()!.completed_at) {
              <div class="detail-row">
                <span class="detail-label">Completado:</span>
                <span class="detail-value">{{ campaign()!.completed_at | date:'dd/MM/yyyy HH:mm:ss' }}</span>
              </div>
            }
            @if (campaign()!.error_summary) {
              <div class="detail-row error-row">
                <span class="detail-label">Error:</span>
                <span class="detail-value">{{ campaign()!.error_summary }}</span>
              </div>
            }
          </div>
        </div>

        <!-- Recipients Table -->
        <div class="recipients-section">
          <h2>Destinatarios</h2>
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Teléfono</th>
                  <th>Estado</th>
                  <th>Enviado</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                @for (r of recipients(); track r.id) {
                  <tr>
                    <td>{{ r.user_name || '-' }}</td>
                    <td>{{ r.phone }}</td>
                    <td>
                      <span class="recipient-status" [ngClass]="getRecipientStatusClass(r.status)">
                        {{ campaignService.getRecipientStatusLabel(r.status) }}
                      </span>
                    </td>
                    <td>{{ r.sent_at ? (r.sent_at | date:'HH:mm:ss') : '-' }}</td>
                    <td class="error-cell">{{ r.error_message || '-' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .campaign-detail-container {
      padding: 24px;
      max-width: 1000px;
      margin: 0 auto;
    }
    .page-header {
      margin-bottom: 24px;
    }
    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: #6c757d;
      text-decoration: none;
      font-size: 14px;
      margin-bottom: 8px;
      &:hover { color: #4361ee; }
    }
    .page-header h1 {
      font-size: 24px;
      font-weight: 600;
      margin: 0;
      color: #1a1a2e;
    }
    .status-card {
      background: white;
      border: 1px solid #e9ecef;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
    }
    .status-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      flex-wrap: wrap;
      gap: 12px;
    }
    .status-info {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 500;
    }
    .badge-warning { background: #fff3cd; color: #856404; }
    .badge-info { background: #d1ecf1; color: #0c5460; }
    .badge-secondary { background: #e2e3e5; color: #383d41; }
    .badge-success { background: #d4edda; color: #155724; }
    .badge-dark { background: #d6d8d9; color: #1b1e21; }
    .badge-danger { background: #f8d7da; color: #721c24; }
    .method-badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      &.cloud { background: #d4edda; color: #155724; }
      &.electron { background: #fff3cd; color: #856404; }
    }
    .status-actions {
      display: flex;
      gap: 8px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-primary { background: #4361ee; color: white; &:hover { background: #3a56d4; } }
    .btn-warning { background: #ffc107; color: #333; &:hover { background: #e0a800; } }
    .btn-danger { background: #ef233c; color: white; &:hover { background: #d90429; } }
    .progress-section {
      margin-bottom: 20px;
    }
    .progress-bar-lg {
      width: 100%;
      height: 12px;
      background: #e9ecef;
      border-radius: 6px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      background: #4361ee;
      border-radius: 6px;
      transition: width 0.5s ease;
      &.complete { background: #28a745; }
      &.failed { background: #ef233c; }
    }
    .progress-label {
      text-align: center;
      font-size: 14px;
      font-weight: 500;
      color: #6c757d;
      margin-top: 6px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }
    .stat-card {
      text-align: center;
      padding: 16px;
      background: #f8f9fa;
      border-radius: 10px;
    }
    .stat-value {
      display: block;
      font-size: 28px;
      font-weight: 700;
      &.total { color: #333; }
      &.sent { color: #28a745; }
      &.failed { color: #ef233c; }
      &.pending { color: #ffc107; }
    }
    .stat-label {
      font-size: 12px;
      color: #6c757d;
      text-transform: uppercase;
      font-weight: 500;
    }
    .details-grid {
      border-top: 1px solid #e9ecef;
      padding-top: 16px;
    }
    .detail-row {
      display: flex;
      padding: 6px 0;
      &.error-row .detail-value { color: #ef233c; }
    }
    .detail-label {
      width: 120px;
      flex-shrink: 0;
      font-weight: 500;
      color: #6c757d;
      font-size: 13px;
    }
    .detail-value {
      font-size: 14px;
      color: #333;
    }
    .recipients-section {
      background: white;
      border: 1px solid #e9ecef;
      border-radius: 12px;
      padding: 24px;
      h2 { font-size: 18px; font-weight: 600; margin: 0 0 16px; color: #1a1a2e; }
    }
    .table-container {
      overflow-x: auto;
      border-radius: 8px;
      border: 1px solid #e9ecef;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
    }
    .data-table th {
      background: #f8f9fa;
      padding: 10px 14px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      color: #6c757d;
      text-align: left;
      border-bottom: 2px solid #e9ecef;
    }
    .data-table td {
      padding: 8px 14px;
      font-size: 13px;
      border-bottom: 1px solid #f0f0f0;
    }
    .recipient-status {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 500;
    }
    .recipient-pending { background: #fff3cd; color: #856404; }
    .recipient-sent { background: #d4edda; color: #155724; }
    .recipient-failed { background: #f8d7da; color: #721c24; }
    .recipient-skipped { background: #e2e3e5; color: #383d41; }
    .error-cell {
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #ef233c;
      font-size: 12px;
    }
    @media (max-width: 768px) {
      .stats-grid { grid-template-columns: repeat(2, 1fr); }
    }
  `]
})
export class CampaignDetailComponent implements OnInit, OnDestroy {
  campaignService = inject(CampaignService);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);
  private destroy$ = new Subject<void>();

  campaign = signal<CampaignDetail | null>(null);
  recipients = signal<CampaignRecipient[]>([]);
  isLoading = signal(false);

  private campaignId: number | null = null;

  ngOnInit(): void {
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
      if (params['id']) {
        this.campaignId = +params['id'];
        this.loadCampaign();
        this.startPolling();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadCampaign(): void {
    if (!this.campaignId) return;
    this.isLoading.set(true);

    this.campaignService.getCampaign(this.campaignId).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (data) => {
        this.campaign.set(data);
        this.recipients.set(data.recipients || []);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading campaign:', err);
        this.toast.error('Error al cargar campaña');
        this.isLoading.set(false);
      }
    });
  }

  private startPolling(): void {
    interval(3000).pipe(
      takeUntil(this.destroy$),
      filter(() => {
        const c = this.campaign();
        return c !== null && (c.status === 'PROCESSING' || c.status === 'PENDING');
      }),
      switchMap(() => this.campaignService.getCampaign(this.campaignId!))
    ).subscribe({
      next: (data) => {
        this.campaign.set(data);
        this.recipients.set(data.recipients || []);
      }
    });
  }

  pause(): void {
    if (!this.campaignId) return;
    this.campaignService.pauseCampaign(this.campaignId).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.toast.success('Campaña pausada');
        this.loadCampaign();
      },
      error: (err) => this.toast.error(err.error?.message || 'Error al pausar')
    });
  }

  resume(): void {
    if (!this.campaignId) return;
    this.campaignService.resumeCampaign(this.campaignId).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.toast.success('Campaña reanudada');
        this.loadCampaign();
      },
      error: (err) => this.toast.error(err.error?.message || 'Error al reanudar')
    });
  }

  cancel(): void {
    if (!this.campaignId) return;
    this.campaignService.cancelCampaign(this.campaignId).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.toast.success('Campaña cancelada');
        this.loadCampaign();
      },
      error: (err) => this.toast.error(err.error?.message || 'Error al cancelar')
    });
  }

  getRecipientStatusClass(status: string): string {
    const classes: Record<string, string> = {
      'PENDING': 'recipient-pending',
      'SENT': 'recipient-sent',
      'FAILED': 'recipient-failed',
      'SKIPPED': 'recipient-skipped'
    };
    return classes[status] || '';
  }
}
