import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { BulkSendService, BulkSend } from '../../../../core/services/bulk-send.service';
import { AuthService } from '../../../../core/services/auth.service';
import { UserRole } from '../../../../core/models/user.model';
import { ToastService } from '../../../../core/services/toast.service';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-envio-list',
  standalone: true,
  imports: [CommonModule, RouterLink, LoadingSpinnerComponent, DatePipe],
  template: `
    <div class="envio-list-container">
      <div class="page-header">
        <div class="header-left">
          <h1>Envíos Masivos</h1>
          <p class="subtitle">Historial de envíos masivos via WhatsApp</p>
        </div>
        <div class="header-actions">
          @if (isSupervisor()) {
            <a routerLink="/app/bulk_sends/rules" class="btn btn-outline">
              <i class="ph-sliders"></i> Reglas
            </a>
          }
          <a routerLink="/app/bulk_sends/new" class="btn btn-primary">
            <i class="ph-plus"></i> Nuevo Envío
          </a>
        </div>
      </div>

      <!-- Status filter -->
      <div class="filter-bar">
        <button class="filter-btn" [class.active]="!statusFilter()" (click)="filterByStatus('')">Todos</button>
        <button class="filter-btn" [class.active]="statusFilter() === 'PROCESSING'" (click)="filterByStatus('PROCESSING')">En proceso</button>
        <button class="filter-btn" [class.active]="statusFilter() === 'PAUSED'" (click)="filterByStatus('PAUSED')">Pausados</button>
        <button class="filter-btn" [class.active]="statusFilter() === 'COMPLETED'" (click)="filterByStatus('COMPLETED')">Completados</button>
        <button class="filter-btn" [class.active]="statusFilter() === 'CANCELLED'" (click)="filterByStatus('CANCELLED')">Cancelados</button>
      </div>

      @if (isLoading()) {
        <app-loading-spinner message="Cargando envíos..." />
      } @else if (bulkSends().length === 0) {
        <div class="empty-state">
          <i class="ph-paper-plane-tilt" style="font-size: 48px; color: #ccc;"></i>
          <h3>No hay envíos masivos</h3>
          <p>Crea tu primer envío masivo subiendo un CSV con destinatarios</p>
          <a routerLink="/app/bulk_sends/new" class="btn btn-primary">
            <i class="ph-plus"></i> Nuevo Envío
          </a>
        </div>
      } @else {
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Mensaje</th>
                <th>Agente</th>
                @if (isSupervisor()) {
                  <th>Creador</th>
                }
                <th>Destinatarios</th>
                <th>Progreso</th>
                <th>Estado</th>
                <th>Fecha</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              @for (bs of bulkSends(); track bs.id) {
                <tr>
                  <td class="id-cell">#{{ bs.id }}</td>
                  <td class="msg-cell">
                    <span class="msg-preview">{{ bs.message_preview || '—' }}</span>
                    @if (bs.attachment_original_name) {
                      <span class="attach-badge"><i class="ph-paperclip"></i> {{ bs.attachment_original_name }}</span>
                    }
                  </td>
                  <td class="agent-cell">{{ bs.assigned_agent_name || '—' }}</td>
                  @if (isSupervisor()) {
                    <td class="agent-cell">{{ bs.user_name || '—' }}</td>
                  }
                  <td class="num-cell">{{ bs.total_recipients }}</td>
                  <td class="progress-cell">
                    <div class="progress-bar">
                      <div class="progress-fill"
                           [style.width.%]="bs.progress_percent"
                           [class.complete]="bs.status === 'COMPLETED'"
                           [class.failed]="bs.status === 'FAILED'">
                      </div>
                    </div>
                    <span class="progress-text">{{ bs.sent_count }}/{{ bs.total_recipients }}</span>
                    @if (bs.failed_count > 0) {
                      <span class="failed-text">({{ bs.failed_count }} fallidos)</span>
                    }
                  </td>
                  <td>
                    <span class="status-badge" [class]="bulkSendService.getStatusClass(bs.status)">
                      {{ bulkSendService.getStatusLabel(bs.status) }}
                    </span>
                  </td>
                  <td class="date-cell">{{ bs.created_at | date:'dd/MM/yy HH:mm' }}</td>
                  <td class="actions-cell">
                    <a [routerLink]="['/app/bulk_sends', bs.id]" class="action-btn" title="Ver detalle">
                      <i class="ph-eye"></i>
                    </a>
                    @if (bs.status === 'PROCESSING') {
                      <button class="action-btn warn" (click)="pause(bs)" title="Pausar">
                        <i class="ph-pause"></i>
                      </button>
                    }
                    @if (bs.status === 'PAUSED') {
                      <button class="action-btn success" (click)="resume(bs)" title="Reanudar">
                        <i class="ph-play"></i>
                      </button>
                    }
                    @if (bs.status === 'PROCESSING' || bs.status === 'PAUSED' || bs.status === 'PENDING') {
                      <button class="action-btn danger" (click)="cancel(bs)" title="Cancelar">
                        <i class="ph-x"></i>
                      </button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (totalPages() > 1) {
          <div class="pagination">
            <button class="btn btn-sm" [disabled]="currentPage() === 0" (click)="loadPage(currentPage() - 1)">
              <i class="ph-caret-left"></i>
            </button>
            <span>Página {{ currentPage() + 1 }} de {{ totalPages() }}</span>
            <button class="btn btn-sm" [disabled]="currentPage() >= totalPages() - 1" (click)="loadPage(currentPage() + 1)">
              <i class="ph-caret-right"></i>
            </button>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .envio-list-container { padding: 24px; }
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
    .header-left h1 { font-size: 24px; font-weight: 600; margin: 0; color: #1a1a2e; }
    .subtitle { font-size: 14px; color: #6c757d; margin: 4px 0 0; }
    .header-actions { display: flex; gap: 8px; }

    .filter-bar {
      display: flex; gap: 4px; margin-bottom: 16px; flex-wrap: wrap;
    }
    .filter-btn {
      padding: 6px 14px; border: 1px solid #dee2e6; border-radius: 20px;
      background: white; font-size: 13px; cursor: pointer; transition: all 0.2s;
      &:hover { border-color: #4361ee; color: #4361ee; }
      &.active { background: #4361ee; color: white; border-color: #4361ee; }
    }

    .empty-state {
      text-align: center; padding: 60px 20px;
      h3 { margin: 16px 0 8px; font-size: 18px; color: #333; }
      p { color: #6c757d; margin-bottom: 16px; }
    }

    .table-wrapper { overflow-x: auto; }
    .data-table {
      width: 100%; border-collapse: collapse; background: white; border-radius: 12px; overflow: hidden;
      border: 1px solid #e9ecef;
      th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #f0f0f0; }
      th { background: #f8f9fa; font-size: 12px; font-weight: 600; text-transform: uppercase; color: #6c757d; }
      tr:hover td { background: #fafbfc; }
    }
    .id-cell { font-weight: 600; color: #4361ee; font-size: 13px; }
    .msg-cell {
      max-width: 200px;
      .msg-preview { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 14px; }
      .attach-badge {
        display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: #6c757d;
        background: #f0f0f0; padding: 2px 6px; border-radius: 4px; margin-top: 4px;
      }
    }
    .agent-cell { font-size: 13px; color: #495057; white-space: nowrap; }
    .num-cell { font-weight: 600; text-align: center; }
    .progress-cell { min-width: 120px; }
    .progress-bar {
      width: 100%; height: 6px; background: #e9ecef; border-radius: 3px; overflow: hidden;
    }
    .progress-fill {
      height: 100%; background: #4361ee; border-radius: 3px; transition: width 0.3s;
      &.complete { background: #10b981; }
      &.failed { background: #ef4444; }
    }
    .progress-text { font-size: 12px; color: #6c757d; }
    .failed-text { font-size: 11px; color: #ef4444; }
    .date-cell { font-size: 13px; color: #6c757d; white-space: nowrap; }

    .status-badge {
      display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 500;
    }
    .badge-warning { background: #fff3cd; color: #856404; }
    .badge-info { background: #d1ecf1; color: #0c5460; }
    .badge-secondary { background: #e2e3e5; color: #383d41; }
    .badge-success { background: #d4edda; color: #155724; }
    .badge-dark { background: #d6d8d9; color: #1b1e21; }
    .badge-danger { background: #f8d7da; color: #721c24; }

    .actions-cell { white-space: nowrap; }
    .action-btn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 32px; height: 32px; border-radius: 6px; border: 1px solid #dee2e6;
      background: white; cursor: pointer; font-size: 16px; color: #495057;
      text-decoration: none; transition: all 0.2s; margin-right: 4px;
      &:hover { border-color: #4361ee; color: #4361ee; }
      &.warn:hover { border-color: #f59e0b; color: #f59e0b; }
      &.success:hover { border-color: #10b981; color: #10b981; }
      &.danger:hover { border-color: #ef4444; color: #ef4444; }
    }

    .pagination {
      display: flex; justify-content: center; align-items: center; gap: 12px; margin-top: 16px;
      span { font-size: 14px; color: #6c757d; }
    }

    .btn {
      display: inline-flex; align-items: center; gap: 6px; padding: 10px 20px;
      border: none; border-radius: 8px; font-size: 14px; font-weight: 500;
      cursor: pointer; text-decoration: none; transition: all 0.2s;
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }
    .btn-sm { padding: 6px 12px; font-size: 13px; }
    .btn-primary { background: #4361ee; color: white; &:hover:not(:disabled) { background: #3a56d4; } }
    .btn-outline { background: white; color: #4361ee; border: 1px solid #4361ee; &:hover { background: #f0f3ff; } }
  `]
})
export class EnvioListComponent implements OnInit, OnDestroy {
  bulkSendService = inject(BulkSendService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private destroy$ = new Subject<void>();

  isLoading = signal(false);
  bulkSends = signal<BulkSend[]>([]);
  statusFilter = signal('');
  currentPage = signal(0);
  totalPages = signal(0);

  isSupervisor(): boolean {
    const user = this.authService.currentUser();
    if (!user) return false;
    const role = user.role;
    return role === UserRole.SUPER_ADMIN || role === UserRole.ADMIN ||
           role === UserRole.MANAGER_LEVEL_1 || role === UserRole.MANAGER_LEVEL_2 ||
           role === UserRole.MANAGER_LEVEL_3 || role === UserRole.MANAGER_LEVEL_4;
  }

  ngOnInit(): void {
    this.loadBulkSends();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  filterByStatus(status: string): void {
    this.statusFilter.set(status);
    this.currentPage.set(0);
    this.loadBulkSends();
  }

  loadPage(page: number): void {
    this.currentPage.set(page);
    this.loadBulkSends();
  }

  private loadBulkSends(): void {
    this.isLoading.set(true);
    const status = this.statusFilter() || undefined;
    this.bulkSendService.getBulkSends(this.currentPage(), 20, status).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (res) => {
        this.bulkSends.set(res.bulk_sends);
        this.totalPages.set(res.totalPages);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading bulk sends:', err);
        this.isLoading.set(false);
      }
    });
  }

  pause(bs: BulkSend): void {
    this.bulkSendService.pauseBulkSend(bs.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.toast.success('Envío pausado'); this.loadBulkSends(); },
      error: (err) => this.toast.error(err.error?.message || 'Error al pausar')
    });
  }

  resume(bs: BulkSend): void {
    this.bulkSendService.resumeBulkSend(bs.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.toast.success('Envío reanudado'); this.loadBulkSends(); },
      error: (err) => this.toast.error(err.error?.message || 'Error al reanudar')
    });
  }

  cancel(bs: BulkSend): void {
    if (!confirm('¿Estás seguro de cancelar este envío?')) return;
    this.bulkSendService.cancelBulkSend(bs.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.toast.success('Envío cancelado'); this.loadBulkSends(); },
      error: (err) => this.toast.error(err.error?.message || 'Error al cancelar')
    });
  }
}
