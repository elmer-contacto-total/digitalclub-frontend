/**
 * AlertListComponent
 * PARIDAD: Rails admin/alerts/_alert.html.erb
 *
 * Shows alerts in a list format with:
 * - Severity icon (color-coded)
 * - Title and body
 * - Relative time ("Hace X minutos")
 * - Unread styling
 * - Mark as read functionality
 */
import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AlertService } from '../../../../core/services/alert.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../core/services/toast.service';
import { Alert, AlertType } from '../../../../core/models/alert.model';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';

@Component({
  selector: 'app-alert-list',
  standalone: true,
  imports: [CommonModule, RouterModule, LoadingSpinnerComponent, PaginationComponent],
  template: `
    <div class="alert-list-container">
      <!-- Page Header -->
      <div class="page-header">
        <div class="header-left">
          <h1>Alertas</h1>
          <p class="subtitle">Historial de alertas y notificaciones</p>
        </div>
        <div class="header-actions">
          @if (alerts().length > 0 && hasUnread()) {
            <button class="btn btn-outline" (click)="markAllAsRead()" [disabled]="isMarkingAll()">
              @if (isMarkingAll()) {
                <i class="ph ph-circle-notch ph-spin"></i>
              } @else {
                <i class="ph ph-checks"></i>
              }
              Marcar todas como leídas
            </button>
          }
        </div>
      </div>

      <!-- Filter Bar -->
      <div class="filter-bar">
        <button class="filter-btn" [class.active]="currentFilter() === 'all'" (click)="setFilter('all')">
          Todas
          @if (totalCount() > 0) {
            <span class="filter-count">{{ totalCount() }}</span>
          }
        </button>
        <button class="filter-btn" [class.active]="currentFilter() === 'unread'" (click)="setFilter('unread')">
          Sin leer
          @if (unreadCount() > 0) {
            <span class="filter-count danger">{{ unreadCount() }}</span>
          }
        </button>
        <button class="filter-btn" [class.active]="currentFilter() === 'read'" (click)="setFilter('read')">
          Leídas
        </button>
      </div>

      <!-- Loading -->
      @if (isLoading()) {
        <app-loading-spinner message="Cargando alertas..." />
      } @else if (alerts().length === 0) {
        <!-- Empty State -->
        <div class="empty-state">
          <i class="ph ph-bell-slash"></i>
          <h3>No hay alertas</h3>
          <p>No se encontraron alertas con el filtro seleccionado</p>
        </div>
      } @else {
        <!-- Alert List -->
        <div class="alerts-card">
          @for (alert of alerts(); track alert.id) {
            <div class="alert-item" [class.unread]="!alert.acknowledged">
              <div class="alert-icon" [ngClass]="getSeverityIconClass(alert.severity)">
                <i class="ph ph-warning-circle"></i>
              </div>
              <div class="alert-content">
                <div class="alert-title" [class.fw-bold]="!alert.acknowledged">{{ alert.title }}</div>
                <div class="alert-message">{{ alert.message }}</div>
                <div class="alert-time">
                  <i class="ph ph-clock"></i>
                  Hace {{ getRelativeTime(alert.created_at) }}
                </div>
              </div>
              <div class="alert-actions">
                @if (alert.ticket_id) {
                  <a [routerLink]="['/app/tickets', alert.ticket_id]" class="action-btn" title="Ver ticket">
                    <i class="ph ph-eye"></i>
                  </a>
                }
                @if (!alert.acknowledged) {
                  <button class="action-btn success"
                          (click)="markAsRead(alert)"
                          [disabled]="isMarkingRead().has(alert.id)"
                          title="Marcar como leída">
                    @if (isMarkingRead().has(alert.id)) {
                      <i class="ph ph-circle-notch ph-spin"></i>
                    } @else {
                      <i class="ph ph-check"></i>
                    }
                  </button>
                } @else {
                  <span class="status-badge badge-success">
                    <i class="ph ph-check"></i> Leída
                  </span>
                }
              </div>
            </div>
          }
        </div>

        <!-- Pagination -->
        @if (totalPages() > 1) {
          <app-pagination
            [currentPage]="currentPage()"
            [totalItems]="totalCount()"
            [pageSize]="pageSize"
            [showPageSize]="false"
            (pageChange)="onPageChange($event)"
          />
        }
      }
    </div>
  `,
  styles: [`
    .alert-list-container { padding: var(--space-6); }

    .page-header {
      display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--space-5);
    }
    .header-left h1 { font-size: var(--text-2xl); font-weight: var(--font-semibold); margin: 0; color: var(--fg-default); }
    .subtitle { font-size: var(--text-base); color: var(--fg-muted); margin: var(--space-1) 0 0; }
    .header-actions { display: flex; gap: var(--space-2); }

    .filter-bar {
      display: flex; gap: var(--space-1); margin-bottom: var(--space-4); flex-wrap: wrap;
    }
    .filter-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 14px; border: 1px solid var(--border-default); border-radius: var(--radius-full);
      background: var(--card-bg); color: var(--fg-default); font-size: var(--text-sm); cursor: pointer;
      transition: all var(--duration-normal);
      &:hover { border-color: var(--accent-default); color: var(--accent-default); }
      &.active { background: var(--accent-default); color: white; border-color: var(--accent-default); }
    }
    .filter-count {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 20px; height: 20px; padding: 0 5px;
      border-radius: var(--radius-full); font-size: var(--text-xs); font-weight: var(--font-semibold);
      background: var(--bg-muted); color: var(--fg-muted);
      .active > & { background: rgba(255,255,255,0.25); color: white; }
      &.danger { background: var(--error-subtle); color: var(--error-text); }
      .active > &.danger { background: rgba(255,255,255,0.25); color: white; }
    }

    .empty-state {
      text-align: center; padding: 60px var(--space-5); background: var(--card-bg);
      border: 1px solid var(--card-border); border-radius: var(--radius-lg);
      > i { font-size: 48px; color: var(--fg-subtle); }
      h3 { margin: var(--space-4) 0 var(--space-2); font-size: var(--text-xl); color: var(--fg-default); }
      p { color: var(--fg-muted); margin-bottom: 0; }
    }

    .alerts-card {
      background: var(--card-bg); border: 1px solid var(--card-border);
      border-radius: var(--radius-xl); overflow: hidden;
    }

    .alert-item {
      display: flex; align-items: flex-start; gap: var(--space-3);
      padding: var(--space-4) var(--space-5);
      border-bottom: 1px solid var(--border-muted);
      transition: background-color var(--duration-normal);
      &:last-child { border-bottom: none; }
      &:hover { background: var(--table-row-hover); }
      &.unread { background: var(--accent-subtle); border-left: 3px solid var(--accent-default); }
    }

    .alert-icon {
      flex-shrink: 0; font-size: 22px; margin-top: 2px;
      &.severity-warning { color: var(--warning-default); }
      &.severity-danger { color: var(--error-default); }
      &.severity-success { color: var(--success-default); }
      &.severity-info { color: var(--fg-muted); }
    }

    .alert-content { flex: 1; min-width: 0; }
    .alert-title {
      font-size: var(--text-base); color: var(--fg-default); margin-bottom: 2px;
      &.fw-bold { font-weight: var(--font-semibold); }
    }
    .alert-message {
      font-size: var(--text-sm); color: var(--fg-muted); margin-bottom: var(--space-1);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .alert-time {
      display: flex; align-items: center; gap: 4px;
      font-size: var(--text-xs); color: var(--fg-subtle);
    }

    .alert-actions {
      display: flex; align-items: center; gap: var(--space-1); flex-shrink: 0;
    }

    .action-btn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 32px; height: 32px; border-radius: var(--radius-md); border: 1px solid var(--border-default);
      background: var(--card-bg); cursor: pointer; font-size: 16px; color: var(--fg-muted);
      text-decoration: none; transition: all var(--duration-normal);
      &:hover { border-color: var(--accent-default); color: var(--accent-default); }
      &.success:hover { border-color: var(--success-default); color: var(--success-default); }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }

    .status-badge {
      display: inline-flex; align-items: center; gap: 4px;
      height: var(--badge-height); padding: 0 var(--space-3);
      border-radius: var(--radius-full); font-size: var(--text-xs); font-weight: var(--font-medium);
      white-space: nowrap;
    }
    .badge-success { background: var(--success-subtle); color: var(--success-text); }

    .btn {
      display: inline-flex; align-items: center; gap: 6px; padding: 10px 20px;
      border: none; border-radius: var(--radius-lg); font-size: var(--text-base); font-weight: var(--font-medium);
      cursor: pointer; text-decoration: none; transition: all var(--duration-normal);
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }
    .btn-outline {
      background: var(--card-bg); color: var(--accent-default); border: 1px solid var(--accent-default);
      &:hover:not(:disabled) { background: var(--accent-subtle); }
    }

    .ph-spin { animation: spin 1s linear infinite; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  `]
})
export class AlertListComponent implements OnInit, OnDestroy {
  private alertService = inject(AlertService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  private destroy$ = new Subject<void>();

  // State signals
  alerts = signal<Alert[]>([]);
  isLoading = signal(true);
  isMarkingAll = signal(false);
  isMarkingRead = signal<Set<number>>(new Set());
  currentFilter = signal<'all' | 'unread' | 'read'>('all');
  currentPage = signal(1);  // 1-based for PaginationComponent
  totalCount = signal(0);
  totalPages = signal(0);
  readonly pageSize = 20;

  // Computed
  unreadCount = computed(() =>
    this.alerts().filter(a => !a.acknowledged).length
  );

  hasUnread = computed(() => this.unreadCount() > 0);

  ngOnInit(): void {
    this.loadAlerts();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadAlerts(): void {
    this.isLoading.set(true);

    const acknowledged = this.currentFilter() === 'all'
      ? undefined
      : this.currentFilter() === 'read';

    this.alertService.getAlerts({
      acknowledged,
      page: this.currentPage() - 1,  // API is 0-based
      size: this.pageSize
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.alerts.set(response.alerts);
          this.totalCount.set(response.total);
          this.totalPages.set(response.totalPages);
          this.isLoading.set(false);
        },
        error: (error) => {
          console.error('Error loading alerts:', error);
          this.toastService.error('Error al cargar las alertas');
          this.isLoading.set(false);
        }
      });
  }

  setFilter(filter: 'all' | 'unread' | 'read'): void {
    this.currentFilter.set(filter);
    this.currentPage.set(1);
    this.loadAlerts();
  }

  onPageChange(page: number): void {
    this.currentPage.set(page);
    this.loadAlerts();
  }

  markAsRead(alert: Alert): void {
    const marking = new Set(this.isMarkingRead());
    marking.add(alert.id);
    this.isMarkingRead.set(marking);

    this.alertService.acknowledgeAlert(alert.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.alerts.update(alerts =>
            alerts.map(a => a.id === alert.id ? { ...a, acknowledged: true } : a)
          );
          this.toastService.success('Alerta marcada como leída');

          const marking = new Set(this.isMarkingRead());
          marking.delete(alert.id);
          this.isMarkingRead.set(marking);
        },
        error: (error) => {
          console.error('Error marking alert as read:', error);
          this.toastService.error('Error al marcar la alerta');

          const marking = new Set(this.isMarkingRead());
          marking.delete(alert.id);
          this.isMarkingRead.set(marking);
        }
      });
  }

  markAllAsRead(): void {
    const unreadIds = this.alerts()
      .filter(a => !a.acknowledged)
      .map(a => a.id);

    if (unreadIds.length === 0) return;

    this.isMarkingAll.set(true);

    this.alertService.acknowledgeAlerts(unreadIds)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.alerts.update(alerts =>
            alerts.map(a => ({ ...a, acknowledged: true }))
          );
          this.toastService.success('Todas las alertas marcadas como leídas');
          this.isMarkingAll.set(false);
        },
        error: (error) => {
          console.error('Error marking all alerts as read:', error);
          this.toastService.error('Error al marcar las alertas');
          this.isMarkingAll.set(false);
        }
      });
  }

  getSeverityIconClass(severity: string): string {
    switch (severity) {
      case 'success': return 'severity-success';
      case 'priority':
      case 'high': return 'severity-danger';
      case 'warning': return 'severity-warning';
      default: return 'severity-info';
    }
  }

  getRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) {
      return 'menos de un minuto';
    } else if (diffMins === 1) {
      return '1 minuto';
    } else if (diffMins < 60) {
      return `${diffMins} minutos`;
    } else if (diffHours === 1) {
      return '1 hora';
    } else if (diffHours < 24) {
      return `${diffHours} horas`;
    } else if (diffDays === 1) {
      return '1 día';
    } else {
      return `${diffDays} días`;
    }
  }
}
