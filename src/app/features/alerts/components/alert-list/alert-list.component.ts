/**
 * AlertListComponent
 * PARIDAD: Rails admin/alerts/_alert.html.erb (list-group style)
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
import { UserRole } from '../../../../core/models/user.model';

@Component({
  selector: 'app-alert-list',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="container-fluid py-4">
      <!-- Page Header -->
      <div class="page-header mb-4">
        <div class="row align-items-center">
          <div class="col">
            <h1 class="h3 mb-0">Alertas</h1>
          </div>
          <div class="col-auto">
            @if (alerts().length > 0 && hasUnread()) {
              <button
                type="button"
                class="btn btn-outline-primary"
                (click)="markAllAsRead()"
                [disabled]="isMarkingAll()">
                @if (isMarkingAll()) {
                  <span class="spinner-border spinner-border-sm me-1"></span>
                }
                Marcar todas como leídas
              </button>
            }
          </div>
        </div>
      </div>

      <!-- Filter Tabs -->
      <div class="card mb-4">
        <div class="card-body py-2">
          <ul class="nav nav-pills">
            <li class="nav-item">
              <button
                type="button"
                class="nav-link"
                [class.active]="currentFilter() === 'all'"
                (click)="setFilter('all')">
                Todas
                @if (totalCount() > 0) {
                  <span class="badge bg-secondary ms-1">{{ totalCount() }}</span>
                }
              </button>
            </li>
            <li class="nav-item">
              <button
                type="button"
                class="nav-link"
                [class.active]="currentFilter() === 'unread'"
                (click)="setFilter('unread')">
                Sin leer
                @if (unreadCount() > 0) {
                  <span class="badge bg-danger ms-1">{{ unreadCount() }}</span>
                }
              </button>
            </li>
            <li class="nav-item">
              <button
                type="button"
                class="nav-link"
                [class.active]="currentFilter() === 'read'"
                (click)="setFilter('read')">
                Leídas
              </button>
            </li>
          </ul>
        </div>
      </div>

      <!-- Loading -->
      @if (isLoading()) {
        <div class="text-center py-5">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Cargando...</span>
          </div>
        </div>
      }

      <!-- Alert List -->
      @if (!isLoading()) {
        @if (alerts().length === 0) {
          <div class="card">
            <div class="card-body text-center py-5">
              <i class="bi bi-bell-slash fs-1 text-muted mb-3 d-block"></i>
              <p class="text-muted mb-0">No hay alertas</p>
            </div>
          </div>
        } @else {
          <div class="list-group">
            @for (alert of alerts(); track alert.id) {
              <div
                class="list-group-item list-group-item-action"
                [class.unread-alert]="!alert.acknowledged"
                [class.bg-light]="!alert.acknowledged">
                <div class="row g-0 align-items-center">
                  <!-- Severity Icon -->
                  <div class="col-auto me-3">
                    <i
                      class="bi bi-exclamation-circle fs-4"
                      [ngClass]="getSeverityClass(alert.severity)">
                    </i>
                  </div>

                  <!-- Content -->
                  <div class="col">
                    <div class="d-flex justify-content-between align-items-start">
                      <div>
                        <div class="fw-semibold" [class.text-dark]="!alert.acknowledged">
                          {{ alert.title }}
                        </div>
                        <div class="text-muted small mt-1">{{ alert.message }}</div>
                        <div class="text-muted small mt-1">
                          <i class="bi bi-clock me-1"></i>
                          Hace {{ getRelativeTime(alert.created_at) }}
                        </div>
                      </div>

                      <!-- Actions -->
                      <div class="ms-3 d-flex align-items-center gap-2">
                        @if (alert.ticket_id) {
                          <a
                            [routerLink]="['/app/tickets', alert.ticket_id]"
                            class="btn btn-sm btn-outline-secondary"
                            title="Ver ticket">
                            <i class="bi bi-eye"></i>
                          </a>
                        }
                        @if (!alert.acknowledged) {
                          <button
                            type="button"
                            class="btn btn-sm btn-outline-primary"
                            (click)="markAsRead(alert)"
                            [disabled]="isMarkingRead().has(alert.id)"
                            title="Marcar como leída">
                            @if (isMarkingRead().has(alert.id)) {
                              <span class="spinner-border spinner-border-sm"></span>
                            } @else {
                              <i class="bi bi-check2"></i>
                            }
                          </button>
                        } @else {
                          <span class="badge bg-success">
                            <i class="bi bi-check2"></i> Leída
                          </span>
                        }
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            }
          </div>

          <!-- Pagination -->
          @if (totalPages() > 1) {
            <nav class="mt-4">
              <ul class="pagination justify-content-center">
                <li class="page-item" [class.disabled]="currentPage() === 0">
                  <button class="page-link" (click)="goToPage(currentPage() - 1)">
                    <i class="bi bi-chevron-left"></i>
                  </button>
                </li>
                @for (page of getPageNumbers(); track page) {
                  <li class="page-item" [class.active]="page === currentPage()">
                    <button class="page-link" (click)="goToPage(page)">
                      {{ page + 1 }}
                    </button>
                  </li>
                }
                <li class="page-item" [class.disabled]="currentPage() >= totalPages() - 1">
                  <button class="page-link" (click)="goToPage(currentPage() + 1)">
                    <i class="bi bi-chevron-right"></i>
                  </button>
                </li>
              </ul>
            </nav>
          }
        }
      }
    </div>
  `,
  styles: [`
    .unread-alert {
      border-left: 4px solid var(--bs-primary);
    }

    .list-group-item {
      transition: background-color 0.2s ease;
    }

    .list-group-item:hover {
      background-color: var(--bs-gray-100);
    }

    .nav-pills .nav-link {
      cursor: pointer;
    }
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
  currentPage = signal(0);
  totalCount = signal(0);
  totalPages = signal(0);

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
      page: this.currentPage(),
      size: 20
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
    this.currentPage.set(0);
    this.loadAlerts();
  }

  goToPage(page: number): void {
    if (page >= 0 && page < this.totalPages()) {
      this.currentPage.set(page);
      this.loadAlerts();
    }
  }

  getPageNumbers(): number[] {
    const total = this.totalPages();
    const current = this.currentPage();
    const pages: number[] = [];

    // Show max 5 pages around current
    const start = Math.max(0, current - 2);
    const end = Math.min(total, start + 5);

    for (let i = start; i < end; i++) {
      pages.push(i);
    }

    return pages;
  }

  markAsRead(alert: Alert): void {
    const marking = new Set(this.isMarkingRead());
    marking.add(alert.id);
    this.isMarkingRead.set(marking);

    this.alertService.acknowledgeAlert(alert.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          // Update alert in list
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
          // Update all alerts in list
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

  getSeverityClass(severity: string): string {
    return this.alertService.getSeverityClass(severity);
  }

  /**
   * Get relative time in Spanish
   * PARIDAD: Rails time_ago_in_words
   */
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
