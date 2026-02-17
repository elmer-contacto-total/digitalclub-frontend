import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { BulkSendService, BulkSend } from '../../../../core/services/bulk-send.service';
import { ElectronService } from '../../../../core/services/electron.service';
import { AuthService } from '../../../../core/services/auth.service';
import { UserRole } from '../../../../core/models/user.model';
import { ToastService } from '../../../../core/services/toast.service';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';

@Component({
  selector: 'app-envio-list',
  standalone: true,
  imports: [CommonModule, RouterLink, LoadingSpinnerComponent, DatePipe, PaginationComponent],
  template: `
    <div class="envio-list-container">
      <div class="page-header">
        <div class="header-left">
          <h1>Envíos Masivos</h1>
          <p class="subtitle">Historial de envíos masivos via WhatsApp</p>
        </div>
        <div class="header-actions">
          @if (isSupervisor() && canCreateSends()) {
            <a routerLink="/app/bulk_sends/rules" class="btn btn-outline">
              <i class="ph ph-sliders"></i> Reglas
            </a>
          }
          @if (canCreateSends()) {
            <a routerLink="/app/bulk_sends/new" class="btn btn-primary">
              <i class="ph ph-plus"></i> Nuevo Envío
            </a>
          }
        </div>
      </div>

      <!-- Status filter -->
      <div class="filter-bar">
        <button class="filter-btn" [class.active]="!statusFilter()" (click)="filterByStatus('')">Todos</button>
        <button class="filter-btn" [class.active]="statusFilter() === 'PENDING'" (click)="filterByStatus('PENDING')">Pendientes</button>
        <button class="filter-btn" [class.active]="statusFilter() === 'PROCESSING'" (click)="filterByStatus('PROCESSING')">En proceso</button>
        <button class="filter-btn" [class.active]="statusFilter() === 'PAUSED'" (click)="filterByStatus('PAUSED')">Pausados</button>
        <button class="filter-btn" [class.active]="statusFilter() === 'COMPLETED'" (click)="filterByStatus('COMPLETED')">Completados</button>
        <button class="filter-btn" [class.active]="statusFilter() === 'CANCELLED'" (click)="filterByStatus('CANCELLED')">Cancelados</button>
      </div>

      @if (loadError()) {
        <div class="error-panel">
          <p><i class="ph ph-warning"></i> {{ loadError() }}</p>
          <button class="btn btn-outline btn-sm" (click)="loadBulkSends()">
            <i class="ph ph-arrows-clockwise"></i> Reintentar
          </button>
        </div>
      }

      @if (isLoading()) {
        <app-loading-spinner message="Cargando envíos..." />
      } @else if (bulkSends().length === 0 && !loadError()) {
        <div class="empty-state">
          <i class="ph ph-paper-plane-tilt"></i>
          <h3>No hay envíos masivos</h3>
          <p>{{ canCreateSends() ? 'Crea tu primer envío masivo subiendo un CSV con destinatarios' : 'No se encontraron envíos masivos' }}</p>
          @if (canCreateSends()) {
            <a routerLink="/app/bulk_sends/new" class="btn btn-primary">
              Nuevo Envío
            </a>
          }
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
                      <span class="attach-badge"><i class="ph ph-paperclip"></i> {{ bs.attachment_original_name }}</span>
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
                      <i class="ph ph-eye"></i>
                    </a>
                    @if (bs.status === 'PROCESSING') {
                      <button class="action-btn warn" (click)="pause(bs)" title="Pausar">
                        <i class="ph ph-pause"></i>
                      </button>
                    }
                    @if (bs.status === 'PENDING' && electronService.isElectron && isAssignedToMe(bs)) {
                      <button class="action-btn success" (click)="start(bs)" title="Iniciar">
                        <i class="ph ph-play"></i>
                      </button>
                    }
                    @if (bs.status === 'PAUSED') {
                      <button class="action-btn success" (click)="resume(bs)" title="Reanudar">
                        <i class="ph ph-play"></i>
                      </button>
                    }
                    @if (bs.status === 'PROCESSING' || bs.status === 'PAUSED' || bs.status === 'PENDING') {
                      <button class="action-btn danger" (click)="cancel(bs)" title="Cancelar">
                        <i class="ph ph-x"></i>
                      </button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (totalPages() > 1) {
          <app-pagination
            [currentPage]="currentPage()"
            [totalItems]="totalItems()"
            [pageSize]="pageSize()"
            [pageSizeOptions]="[10, 20, 50]"
            (pageChange)="onPageChange($event)"
            (pageSizeChange)="onPageSizeChange($event)"
          />
        }
      }
    </div>
  `,
  styles: [`
    .envio-list-container { padding: var(--space-6); }
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--space-5); }
    .header-left h1 { font-size: var(--text-2xl); font-weight: var(--font-semibold); margin: 0; color: var(--fg-default); }
    .subtitle { font-size: var(--text-base); color: var(--fg-muted); margin: var(--space-1) 0 0; }
    .header-actions { display: flex; gap: var(--space-2); }

    .filter-bar {
      display: flex; gap: var(--space-1); margin-bottom: var(--space-4); flex-wrap: wrap;
    }
    .filter-btn {
      padding: 6px 14px; border: 1px solid var(--border-default); border-radius: var(--radius-full);
      background: var(--card-bg); color: var(--fg-default); font-size: var(--text-sm); cursor: pointer; transition: all var(--duration-normal);
      &:hover { border-color: var(--accent-default); color: var(--accent-default); }
      &.active { background: var(--accent-default); color: white; border-color: var(--accent-default); }
    }

    .empty-state {
      text-align: center; padding: 60px var(--space-5); background: var(--card-bg); border: 1px solid var(--card-border); border-radius: var(--radius-lg);
      > i { font-size: 48px; color: var(--fg-subtle); }
      h3 { margin: var(--space-4) 0 var(--space-2); font-size: var(--text-xl); color: var(--fg-default); }
      p { color: var(--fg-muted); margin-bottom: var(--space-4); }
    }

    .table-wrapper { overflow-x: auto; }
    .data-table {
      width: 100%; border-collapse: collapse; background: var(--card-bg); border-radius: var(--radius-xl); overflow: hidden;
      border: 1px solid var(--card-border);
      th, td { padding: var(--space-3) var(--space-4); text-align: left; border-bottom: 1px solid var(--border-muted); }
      th { background: var(--table-header-bg); font-size: var(--text-sm); font-weight: var(--font-semibold); text-transform: uppercase; color: var(--fg-muted); letter-spacing: 0.3px; }
      tbody tr:hover td { background: var(--table-row-hover); }
    }
    .id-cell { font-weight: var(--font-semibold); color: var(--accent-default); font-size: var(--text-sm); }
    .msg-cell {
      max-width: 200px;
      .msg-preview { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: var(--text-base); color: var(--fg-default); }
      .attach-badge {
        display: inline-flex; align-items: center; gap: var(--space-1); font-size: var(--text-xs); color: var(--fg-muted);
        background: var(--bg-muted); padding: 2px 6px; border-radius: var(--radius-sm); margin-top: var(--space-1);
      }
    }
    .agent-cell { font-size: var(--text-sm); color: var(--fg-muted); white-space: nowrap; }
    .num-cell { font-weight: var(--font-semibold); text-align: center; color: var(--fg-default); }
    .progress-cell { min-width: 120px; }
    .progress-bar {
      width: 100%; height: 6px; background: var(--bg-muted); border-radius: var(--radius-sm); overflow: hidden;
    }
    .progress-fill {
      height: 100%; background: var(--accent-default); border-radius: var(--radius-sm); transition: width 0.3s;
      &.complete { background: var(--success-default); }
      &.failed { background: var(--error-default); }
    }
    .progress-text { font-size: var(--text-sm); color: var(--fg-muted); }
    .failed-text { font-size: var(--text-xs); color: var(--error-default); }
    .date-cell { font-size: var(--text-sm); color: var(--fg-muted); white-space: nowrap; }

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

    .actions-cell { white-space: nowrap; }
    .action-btn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 32px; height: 32px; border-radius: var(--radius-md); border: 1px solid var(--border-default);
      background: var(--card-bg); cursor: pointer; font-size: 16px; color: var(--fg-muted);
      text-decoration: none; transition: all var(--duration-normal); margin-right: var(--space-1);
      &:hover { border-color: var(--accent-default); color: var(--accent-default); }
      &.warn:hover { border-color: var(--warning-default); color: var(--warning-default); }
      &.success:hover { border-color: var(--success-default); color: var(--success-default); }
      &.danger:hover { border-color: var(--error-default); color: var(--error-default); }
    }

    .btn {
      display: inline-flex; align-items: center; gap: 6px; padding: 10px 20px;
      border: none; border-radius: var(--radius-lg); font-size: var(--text-base); font-weight: var(--font-medium);
      cursor: pointer; text-decoration: none; transition: all var(--duration-normal);
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }
    .btn-sm { padding: 6px 12px; font-size: var(--text-sm); }
    .btn-primary { background: var(--accent-default); color: white; &:hover:not(:disabled) { background: var(--accent-emphasis); } }
    .btn-outline { background: var(--card-bg); color: var(--accent-default); border: 1px solid var(--accent-default); &:hover { background: var(--accent-subtle); } }

    .error-panel {
      background: var(--error-subtle); border: 1px solid var(--error-default); border-radius: var(--radius-lg);
      padding: var(--space-4); margin-bottom: var(--space-4); display: flex; align-items: center; justify-content: space-between; gap: var(--space-3);
      p { margin: 0; font-size: var(--text-base); color: var(--error-text); display: flex; align-items: center; gap: var(--space-2); }
    }
  `]
})
export class EnvioListComponent implements OnInit, OnDestroy {
  bulkSendService = inject(BulkSendService);
  electronService = inject(ElectronService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private destroy$ = new Subject<void>();

  isLoading = signal(false);
  loadError = signal('');
  bulkSends = signal<BulkSend[]>([]);
  statusFilter = signal('');
  currentPage = signal(1);
  totalPages = signal(0);
  totalItems = signal(0);
  pageSize = signal(20);

  isSupervisor(): boolean {
    const user = this.authService.currentUser();
    if (!user) return false;
    const role = user.role;
    return role === UserRole.SUPER_ADMIN || role === UserRole.ADMIN ||
           role === UserRole.MANAGER_LEVEL_1 || role === UserRole.MANAGER_LEVEL_2 ||
           role === UserRole.MANAGER_LEVEL_3 || role === UserRole.MANAGER_LEVEL_4;
  }

  canCreateSends(): boolean {
    const user = this.authService.currentUser();
    if (!user) return false;
    return user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN;
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
    this.currentPage.set(1);
    this.loadBulkSends();
  }

  onPageChange(page: number): void {
    this.currentPage.set(page);
    this.loadBulkSends();
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
    this.loadBulkSends();
  }

  loadBulkSends(): void {
    this.isLoading.set(true);
    this.loadError.set('');
    const status = this.statusFilter() || undefined;
    this.bulkSendService.getBulkSends(this.currentPage() - 1, this.pageSize(), status).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (res) => {
        this.bulkSends.set(res.bulk_sends);
        this.totalPages.set(res.totalPages);
        this.totalItems.set(res.total);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading bulk sends:', err);
        this.isLoading.set(false);
        this.loadError.set('Error al cargar envíos. Verifica tu conexión.');
      }
    });
  }

  pause(bs: BulkSend): void {
    if (this.electronService.isElectron) {
      this.electronService.pauseBulkSend();
      this.toast.success('Envío pausado');
      this.loadBulkSends();
    } else {
      this.bulkSendService.pauseBulkSend(bs.id).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => { this.toast.success('Envío pausado'); this.loadBulkSends(); },
        error: (err) => this.toast.error(err.error?.message || 'Error al pausar')
      });
    }
  }

  async resume(bs: BulkSend): Promise<void> {
    if (this.electronService.isElectron) {
      await this.router.navigate(['/app/electron_clients']);
      await new Promise(resolve => setTimeout(resolve, 500));
      this.electronService.resumeBulkSend();
      this.toast.success('Envío reanudado');
    } else {
      this.bulkSendService.resumeBulkSend(bs.id).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => { this.toast.success('Envío reanudado'); this.loadBulkSends(); },
        error: (err) => this.toast.error(err.error?.message || 'Error al reanudar')
      });
    }
  }

  isAssignedToMe(bs: BulkSend): boolean {
    const currentUserId = this.authService.currentUser()?.id;
    return !bs.assigned_agent_id || bs.assigned_agent_id === currentUserId;
  }

  async start(bs: BulkSend): Promise<void> {
    const token = this.authService.getToken();
    if (!token) return;
    await this.router.navigate(['/app/electron_clients']);
    await new Promise(resolve => setTimeout(resolve, 500));
    const started = await this.electronService.startBulkSend(bs.id, token);
    if (started) {
      this.toast.success('Envío masivo completado');
      this.loadBulkSends();
    } else {
      this.toast.error('No se pudo iniciar el envío');
    }
  }

  cancel(bs: BulkSend): void {
    if (!confirm('¿Estás seguro de cancelar este envío?')) return;
    if (this.electronService.isElectron) {
      this.electronService.cancelBulkSend();
    }
    this.bulkSendService.cancelBulkSend(bs.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.toast.success('Envío cancelado'); this.loadBulkSends(); },
      error: (err) => this.toast.error(err.error?.message || 'Error al cancelar')
    });
  }
}
