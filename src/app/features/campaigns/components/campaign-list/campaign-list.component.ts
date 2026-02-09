import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { Campaign, CampaignService } from '../../../../core/services/campaign.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../core/services/toast.service';
import { UserRole } from '../../../../core/models/user.model';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';

@Component({
  selector: 'app-campaign-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, LoadingSpinnerComponent, EmptyStateComponent],
  template: `
    <div class="campaign-list-container">
      <!-- Header -->
      <div class="page-header">
        <div class="header-left">
          <h1>Campañas de Envío Masivo</h1>
          <span class="record-count">{{ campaigns().length }} campañas</span>
        </div>
        <div class="header-actions">
          @if (isSupervisor()) {
            <a routerLink="rules" class="btn btn-outline">
              <i class="ph-gear"></i> Reglas de Envío
            </a>
          }
          <a routerLink="new" class="btn btn-primary">
            <i class="ph-plus"></i> Nueva Campaña
          </a>
        </div>
      </div>

      <!-- Filters -->
      <div class="filters-bar">
        <div class="filter-group">
          <label>Estado:</label>
          <select [(ngModel)]="filterStatus" (change)="loadCampaigns()">
            <option value="">Todos</option>
            <option value="PENDING">Pendiente</option>
            <option value="PROCESSING">En proceso</option>
            <option value="PAUSED">Pausada</option>
            <option value="COMPLETED">Completada</option>
            <option value="CANCELLED">Cancelada</option>
            <option value="FAILED">Fallida</option>
          </select>
        </div>
      </div>

      @if (isLoading()) {
        <app-loading-spinner message="Cargando campañas..." />
      } @else if (campaigns().length === 0) {
        <app-empty-state
          icon="ph-broadcast"
          title="No hay campañas"
          description="Crea una nueva campaña para enviar mensajes masivos" />
      } @else {
        <!-- Table -->
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Mensaje</th>
                <th>Método</th>
                <th>Estado</th>
                <th>Progreso</th>
                <th>Enviados / Fallidos</th>
                <th>Creado por</th>
                <th>Fecha</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              @for (campaign of campaigns(); track campaign.id) {
                <tr>
                  <td>{{ campaign.id }}</td>
                  <td class="message-cell">
                    @if (campaign.template_name) {
                      <span class="template-tag">{{ campaign.template_name }}</span>
                    } @else if (campaign.message_preview) {
                      <span class="message-preview">{{ campaign.message_preview }}</span>
                    }
                  </td>
                  <td>
                    <span class="method-badge" [class.cloud]="campaign.send_method === 'CLOUD_API'" [class.electron]="campaign.send_method === 'ELECTRON'">
                      {{ campaignService.getMethodLabel(campaign.send_method) }}
                    </span>
                  </td>
                  <td>
                    <span class="status-badge" [ngClass]="campaignService.getStatusClass(campaign.status)">
                      {{ campaignService.getStatusLabel(campaign.status) }}
                    </span>
                  </td>
                  <td>
                    <div class="progress-bar-container">
                      <div class="progress-bar" [style.width.%]="campaign.progress_percent"
                           [class.complete]="campaign.status === 'COMPLETED'"
                           [class.failed]="campaign.status === 'FAILED'"></div>
                    </div>
                    <span class="progress-text">{{ campaign.progress_percent }}%</span>
                  </td>
                  <td>
                    <span class="sent-count">{{ campaign.sent_count }}</span> /
                    <span class="failed-count">{{ campaign.failed_count }}</span>
                    <span class="total-count">({{ campaign.total_recipients }})</span>
                  </td>
                  <td>{{ campaign.user_name || '-' }}</td>
                  <td>{{ campaign.created_at | date:'dd/MM/yyyy HH:mm' }}</td>
                  <td class="actions-cell">
                    <a [routerLink]="[campaign.id]" class="btn-icon" title="Ver detalle">
                      <i class="ph-eye"></i>
                    </a>
                    @if (campaign.status === 'PROCESSING') {
                      <button (click)="pauseCampaign(campaign)" class="btn-icon" title="Pausar">
                        <i class="ph-pause"></i>
                      </button>
                    }
                    @if (campaign.status === 'PAUSED') {
                      <button (click)="resumeCampaign(campaign)" class="btn-icon" title="Reanudar">
                        <i class="ph-play"></i>
                      </button>
                    }
                    @if (campaign.status === 'PROCESSING' || campaign.status === 'PAUSED' || campaign.status === 'PENDING') {
                      <button (click)="confirmCancel(campaign)" class="btn-icon btn-danger" title="Cancelar">
                        <i class="ph-x-circle"></i>
                      </button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!-- Cancel modal -->
      @if (showCancelModal()) {
        <div class="modal-backdrop" (click)="showCancelModal.set(false)"></div>
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h3>Cancelar Campaña</h3>
              <button class="btn-close" (click)="showCancelModal.set(false)">
                <i class="ph-x"></i>
              </button>
            </div>
            <div class="modal-body">
              <p>¿Estás seguro de que deseas cancelar esta campaña?</p>
              <p>Los mensajes ya enviados no se pueden revertir.</p>
            </div>
            <div class="modal-footer">
              <button class="btn btn-outline" (click)="showCancelModal.set(false)">No, mantener</button>
              <button class="btn btn-danger" (click)="cancelCampaign()" [disabled]="isCancelling()">
                {{ isCancelling() ? 'Cancelando...' : 'Sí, cancelar' }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .campaign-list-container {
      padding: 24px;
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      flex-wrap: wrap;
      gap: 12px;
    }
    .page-header h1 {
      font-size: 24px;
      font-weight: 600;
      margin: 0;
      color: #1a1a2e;
    }
    .record-count {
      font-size: 13px;
      color: #6c757d;
      margin-left: 12px;
    }
    .header-actions {
      display: flex;
      gap: 8px;
    }
    .filters-bar {
      display: flex;
      gap: 16px;
      margin-bottom: 16px;
      padding: 12px 16px;
      background: #f8f9fa;
      border-radius: 8px;
    }
    .filter-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .filter-group label {
      font-size: 13px;
      font-weight: 500;
      color: #6c757d;
    }
    .filter-group select {
      padding: 6px 12px;
      border: 1px solid #dee2e6;
      border-radius: 6px;
      font-size: 13px;
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
      text-decoration: none;
      transition: all 0.2s;
    }
    .btn-primary {
      background: #4361ee;
      color: white;
      &:hover { background: #3a56d4; }
    }
    .btn-outline {
      background: white;
      color: #4361ee;
      border: 1px solid #4361ee;
      &:hover { background: #f0f3ff; }
    }
    .btn-danger {
      background: #ef233c;
      color: white;
      &:hover { background: #d90429; }
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
      padding: 12px 16px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      color: #6c757d;
      text-align: left;
      border-bottom: 2px solid #e9ecef;
    }
    .data-table td {
      padding: 12px 16px;
      font-size: 14px;
      border-bottom: 1px solid #f0f0f0;
      color: #333;
    }
    .data-table tbody tr:hover {
      background: #f8f9ff;
    }
    .message-cell {
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .template-tag {
      display: inline-block;
      padding: 2px 8px;
      background: #e8f0fe;
      color: #1967d2;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
    }
    .message-preview {
      color: #6c757d;
      font-size: 13px;
    }
    .method-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      &.cloud { background: #d4edda; color: #155724; }
      &.electron { background: #fff3cd; color: #856404; }
    }
    .status-badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
    }
    .badge-warning { background: #fff3cd; color: #856404; }
    .badge-info { background: #d1ecf1; color: #0c5460; }
    .badge-secondary { background: #e2e3e5; color: #383d41; }
    .badge-success { background: #d4edda; color: #155724; }
    .badge-dark { background: #d6d8d9; color: #1b1e21; }
    .badge-danger { background: #f8d7da; color: #721c24; }
    .progress-bar-container {
      width: 80px;
      height: 6px;
      background: #e9ecef;
      border-radius: 3px;
      overflow: hidden;
      display: inline-block;
      vertical-align: middle;
    }
    .progress-bar {
      height: 100%;
      background: #4361ee;
      border-radius: 3px;
      transition: width 0.3s;
      &.complete { background: #28a745; }
      &.failed { background: #ef233c; }
    }
    .progress-text {
      font-size: 12px;
      color: #6c757d;
      margin-left: 6px;
    }
    .sent-count { color: #28a745; font-weight: 500; }
    .failed-count { color: #ef233c; font-weight: 500; }
    .total-count { color: #6c757d; font-size: 12px; }
    .actions-cell {
      white-space: nowrap;
      display: flex;
      gap: 4px;
    }
    .btn-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: #6c757d;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.2s;
      &:hover { background: #f0f0f0; color: #333; }
      &.btn-danger:hover { background: #fde8ea; color: #ef233c; }
    }
    .modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      z-index: 1000;
    }
    .modal-dialog {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 1001;
      width: 90%;
      max-width: 450px;
    }
    .modal-content {
      background: white;
      border-radius: 12px;
      overflow: hidden;
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid #e9ecef;
      h3 { margin: 0; font-size: 18px; }
    }
    .btn-close {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 18px;
      color: #6c757d;
    }
    .modal-body {
      padding: 20px;
      p { margin: 0 0 8px; font-size: 14px; color: #333; }
    }
    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 16px 20px;
      border-top: 1px solid #e9ecef;
    }
  `]
})
export class CampaignListComponent implements OnInit, OnDestroy {
  campaignService = inject(CampaignService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private destroy$ = new Subject<void>();

  campaigns = signal<Campaign[]>([]);
  isLoading = signal(false);

  showCancelModal = signal(false);
  campaignToCancel = signal<Campaign | null>(null);
  isCancelling = signal(false);

  filterStatus = '';

  isSupervisor = signal(false);

  ngOnInit(): void {
    this.checkPermissions();
    this.loadCampaigns();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    const user = this.authService.currentUser();
    if (user) {
      this.isSupervisor.set(
        user.role === UserRole.ADMIN ||
        user.role === UserRole.SUPER_ADMIN ||
        user.role === UserRole.MANAGER_LEVEL_1 ||
        user.role === UserRole.MANAGER_LEVEL_2 ||
        user.role === UserRole.MANAGER_LEVEL_3 ||
        user.role === UserRole.MANAGER_LEVEL_4
      );
    }
  }

  loadCampaigns(): void {
    this.isLoading.set(true);
    this.campaignService.getCampaigns(0, 100, this.filterStatus || undefined).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        this.campaigns.set(response.campaigns || []);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading campaigns:', err);
        this.toast.error('Error al cargar campañas');
        this.isLoading.set(false);
      }
    });
  }

  pauseCampaign(campaign: Campaign): void {
    this.campaignService.pauseCampaign(campaign.id).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.toast.success('Campaña pausada');
        this.loadCampaigns();
      },
      error: (err) => {
        this.toast.error(err.error?.message || 'Error al pausar campaña');
      }
    });
  }

  resumeCampaign(campaign: Campaign): void {
    this.campaignService.resumeCampaign(campaign.id).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.toast.success('Campaña reanudada');
        this.loadCampaigns();
      },
      error: (err) => {
        this.toast.error(err.error?.message || 'Error al reanudar campaña');
      }
    });
  }

  confirmCancel(campaign: Campaign): void {
    this.campaignToCancel.set(campaign);
    this.showCancelModal.set(true);
  }

  cancelCampaign(): void {
    const campaign = this.campaignToCancel();
    if (!campaign) return;

    this.isCancelling.set(true);
    this.campaignService.cancelCampaign(campaign.id).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.isCancelling.set(false);
        this.showCancelModal.set(false);
        this.campaignToCancel.set(null);
        this.toast.success('Campaña cancelada');
        this.loadCampaigns();
      },
      error: (err) => {
        this.isCancelling.set(false);
        this.toast.error(err.error?.message || 'Error al cancelar campaña');
      }
    });
  }
}
