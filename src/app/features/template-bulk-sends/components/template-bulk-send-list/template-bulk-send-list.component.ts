/**
 * Template Bulk Send List Component
 * PARIDAD: Rails admin/template_bulk_sends/index.html.erb
 * Lista de envíos masivos de plantillas
 */
import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { TemplateBulkSendService, BulkSendJobSummary } from '../../../../core/services/template-bulk-send.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../core/services/toast.service';
import { UserRole } from '../../../../core/models/user.model';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';

@Component({
  selector: 'app-template-bulk-send-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    LoadingSpinnerComponent,
    EmptyStateComponent
  ],
  template: `
    <div class="template-bulk-send-list-container">
      <!-- Header - PARIDAD: Rails admin/template_bulk_sends/index.html.erb -->
      <div class="page-header">
        <div class="row">
          <div class="view-index-title-container col">
            <h1>Lista de Mensajes Masivos</h1>
          </div>
          @if (canCreate()) {
            <div class="view-index-button-container col">
              <a routerLink="new" class="btn btn-primary">
                <i class="ph ph-plus"></i>
                <span>Crear Mensaje Masivo</span>
              </a>
            </div>
          }
        </div>
      </div>

      <!-- Content -->
      @if (isLoading()) {
        <app-loading-spinner [overlay]="false" message="Cargando envíos..." />
      } @else if (jobs().length === 0) {
        <app-empty-state
          icon="ph-paper-plane-tilt"
          title="No hay envíos masivos"
          description="Cree un nuevo envío masivo de plantillas"
        >
          @if (canCreate()) {
            <a routerLink="new" class="btn btn-primary">
              <i class="ph ph-plus"></i>
              Crear Mensaje Masivo
            </a>
          }
        </app-empty-state>
      } @else {
        <!-- Table - PARIDAD: Rails DataTable -->
        <div class="table-responsive">
          <table class="table table-striped table-bordered table-hover">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Estado</th>
                <th>Cant Planificada</th>
                <th>Cant Enviada</th>
                <th>Fallidos</th>
                <th>Fecha de Envío</th>
              </tr>
            </thead>
            <tbody>
              @for (job of jobs(); track job.job_id) {
                <tr>
                  <td class="job-id-cell">{{ job.job_id.substring(0, 8) }}...</td>
                  <td>
                    <span class="badge" [ngClass]="getStatusClass(job.status)">
                      {{ getStatusLabel(job.status) }}
                    </span>
                  </td>
                  <td>{{ job.total }}</td>
                  <td>{{ job.sent }}</td>
                  <td>{{ job.failed }}</td>
                  <td>{{ formatDate(job.started_at) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Records count -->
        <div class="table-footer">
          <div class="records-info">
            {{ jobs().length }} envío(s) masivo(s)
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .template-bulk-send-list-container {
      padding: 24px;
    }

    .page-header {
      margin-bottom: 24px;
    }

    .page-header .row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }

    .view-index-title-container h1 {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 500;
      color: var(--text-primary, #212529);
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border: 1px solid transparent;
      border-radius: 4px;
      font-size: 14px;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.15s;
    }

    .btn-primary {
      background-color: var(--primary-color, #0d6efd);
      border-color: var(--primary-color, #0d6efd);
      color: white;

      &:hover {
        background-color: var(--primary-dark, #0b5ed7);
      }
    }

    /* Table */
    .table-responsive {
      background: white;
      border-radius: 4px;
      overflow: auto;
    }

    .table {
      width: 100%;
      margin: 0;
      border-collapse: collapse;
      font-size: 14px;
    }

    .table th,
    .table td {
      padding: 12px;
      border: 1px solid var(--border-color, #dee2e6);
      vertical-align: middle;
    }

    .table thead th {
      background: var(--bg-light, #f8f9fa);
      font-weight: 600;
      color: var(--text-primary, #212529);
      text-align: left;
      white-space: nowrap;
    }

    .table-striped tbody tr:nth-of-type(odd) {
      background: rgba(0, 0, 0, 0.02);
    }

    .table-hover tbody tr:hover {
      background: rgba(0, 0, 0, 0.05);
    }

    .job-id-cell {
      font-family: monospace;
      font-size: 13px;
    }

    /* Badge */
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
    }

    .badge-secondary { background: #e9ecef; color: #495057; }
    .badge-success { background: #d1fae5; color: #065f46; }
    .badge-danger { background: #fee2e2; color: #991b1b; }
    .badge-warning { background: #fff3cd; color: #856404; }

    .table-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: white;
      border: 1px solid var(--border-color, #dee2e6);
      border-top: none;
      font-size: 13px;
    }

    .records-info {
      color: var(--text-secondary, #6c757d);
    }

    @media (max-width: 768px) {
      .template-bulk-send-list-container { padding: 16px; }
      .page-header .row { flex-direction: column; align-items: flex-start; }
      .table-responsive { overflow-x: auto; }
      .table { min-width: 600px; }
    }
  `]
})
export class TemplateBulkSendListComponent implements OnInit, OnDestroy {
  private templateBulkSendService = inject(TemplateBulkSendService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private destroy$ = new Subject<void>();

  // Data
  jobs = signal<BulkSendJobSummary[]>([]);
  isLoading = signal(false);

  // Permissions
  canCreate = signal(false);

  ngOnInit(): void {
    this.checkPermissions();
    this.loadJobs();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    const user = this.authService.currentUser();
    if (user) {
      const canManage = user.role === UserRole.ADMIN ||
                        user.role === UserRole.SUPER_ADMIN ||
                        user.role === UserRole.STAFF ||
                        user.role === UserRole.MANAGER_LEVEL_4 ||
                        user.role === UserRole.AGENT;
      this.canCreate.set(canManage);
    }
  }

  loadJobs(): void {
    this.isLoading.set(true);

    this.templateBulkSendService.getJobs().pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        this.jobs.set(response.jobs || []);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading jobs:', err);
        this.toast.error('Error al cargar envíos');
        this.isLoading.set(false);
      }
    });
  }

  getStatusLabel(status: string): string {
    return this.templateBulkSendService.getStatusLabel(status);
  }

  getStatusClass(status: string): string {
    return this.templateBulkSendService.getStatusClass(status);
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-PE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
