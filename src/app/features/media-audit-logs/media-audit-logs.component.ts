/**
 * MediaAuditLogsComponent - Security Dashboard
 * PARIDAD: Vista de auditoría de medios para supervisores
 *
 * Features:
 * - Stats cards (Total, Bloqueados, Capturados, Vistos, Videos Bloq.)
 * - Quick date filters (Hoy, 7d, 30d, Todo)
 * - Action dropdown filter
 * - Agent dropdown filter (subordinates)
 * - Paginated data table with colored badges
 * - Detail modal on row click
 */
import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, forkJoin } from 'rxjs';
import { MediaAuditService } from '../../core/services/media-audit.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { MediaAuditLog, MediaAuditStatsResponse } from '../../core/models/media-audit.model';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface Agent {
  id: number;
  name: string;
}

@Component({
  selector: 'app-media-audit-logs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="container-fluid py-4">
      <!-- Page Header -->
      <div class="page-header mb-4">
        <div class="row align-items-center">
          <div class="col">
            <h1 class="h3 mb-1">
              <i class="ph ph-shield-check me-2"></i>Auditoría de Medios
            </h1>
            <p class="text-muted mb-0">Monitoreo de seguridad de archivos multimedia</p>
          </div>
        </div>
      </div>

      <!-- Stats Cards -->
      <div class="row mb-4 g-3">
        <!-- Total -->
        <div class="col">
          <div class="card stat-card h-100" [class.active]="!activeStatFilter()"
               (click)="filterByStat(null)" role="button">
            <div class="card-body text-center py-3">
              <i class="ph ph-shield-check fs-3 text-secondary mb-1 d-block"></i>
              <div class="fs-4 fw-bold">{{ stats()?.total ?? '-' }}</div>
              <div class="small text-muted">Total</div>
            </div>
          </div>
        </div>
        <!-- Bloqueados -->
        <div class="col">
          <div class="card stat-card h-100" [class.active]="activeStatFilter() === 'blocked'"
               (click)="filterByStat('blocked')" role="button">
            <div class="card-body text-center py-3">
              <i class="ph ph-prohibit fs-3 text-danger mb-1 d-block"></i>
              <div class="fs-4 fw-bold text-danger">{{ blockedCount() }}</div>
              <div class="small text-muted">Bloqueados</div>
            </div>
          </div>
        </div>
        <!-- Capturados -->
        <div class="col">
          <div class="card stat-card h-100" [class.active]="activeStatFilter() === 'captured'"
               (click)="filterByStat('captured')" role="button">
            <div class="card-body text-center py-3">
              <i class="ph ph-camera fs-3 text-info mb-1 d-block"></i>
              <div class="fs-4 fw-bold text-info">{{ stats()?.MEDIA_CAPTURED ?? '-' }}</div>
              <div class="small text-muted">Capturados</div>
            </div>
          </div>
        </div>
        <!-- Vistos -->
        <div class="col">
          <div class="card stat-card h-100" [class.active]="activeStatFilter() === 'viewed'"
               (click)="filterByStat('viewed')" role="button">
            <div class="card-body text-center py-3">
              <i class="ph ph-eye fs-3 text-success mb-1 d-block"></i>
              <div class="fs-4 fw-bold text-success">{{ stats()?.MEDIA_VIEWED ?? '-' }}</div>
              <div class="small text-muted">Vistos</div>
            </div>
          </div>
        </div>
        <!-- Videos Bloqueados -->
        <div class="col">
          <div class="card stat-card h-100" [class.active]="activeStatFilter() === 'video_blocked'"
               (click)="filterByStat('video_blocked')" role="button">
            <div class="card-body text-center py-3">
              <i class="ph ph-video-camera-slash fs-3 text-warning mb-1 d-block"></i>
              <div class="fs-4 fw-bold text-warning">{{ stats()?.VIDEO_BLOCKED ?? '-' }}</div>
              <div class="small text-muted">Videos Bloq.</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Filters -->
      <div class="card mb-4">
        <div class="card-body py-2">
          <div class="d-flex gap-2 flex-wrap align-items-center">
            <!-- Quick date filters -->
            <button type="button" class="btn btn-sm"
              [class.btn-primary]="selectedDateFilter() === 'today'"
              [class.btn-outline-secondary]="selectedDateFilter() !== 'today'"
              (click)="setDateFilter('today')">Hoy</button>
            <button type="button" class="btn btn-sm"
              [class.btn-primary]="selectedDateFilter() === '7d'"
              [class.btn-outline-secondary]="selectedDateFilter() !== '7d'"
              (click)="setDateFilter('7d')">7 días</button>
            <button type="button" class="btn btn-sm"
              [class.btn-primary]="selectedDateFilter() === '30d'"
              [class.btn-outline-secondary]="selectedDateFilter() !== '30d'"
              (click)="setDateFilter('30d')">30 días</button>
            <button type="button" class="btn btn-sm"
              [class.btn-primary]="selectedDateFilter() === 'all'"
              [class.btn-outline-secondary]="selectedDateFilter() !== 'all'"
              (click)="setDateFilter('all')">Todo</button>

            <span class="border-start mx-2" style="height:24px;"></span>

            <!-- Action filter -->
            <select class="form-select form-select-sm" style="width:auto;"
                    [(ngModel)]="selectedAction" (ngModelChange)="onFilterChange()">
              <option value="">Todas las acciones</option>
              <option value="DOWNLOAD_BLOCKED">Bloqueado</option>
              <option value="MEDIA_CAPTURED">Capturado</option>
              <option value="MEDIA_VIEWED">Visto</option>
              <option value="BLOCKED_FILE_ATTEMPT">Intento Bloq.</option>
              <option value="VIDEO_BLOCKED">Video Bloq.</option>
            </select>

            <!-- Agent filter -->
            @if (agents().length > 0) {
              <select class="form-select form-select-sm" style="width:auto;"
                      [(ngModel)]="selectedAgentId" (ngModelChange)="onFilterChange()">
                <option [ngValue]="null">Todos los agentes</option>
                @for (agent of agents(); track agent.id) {
                  <option [ngValue]="agent.id">{{ agent.name }}</option>
                }
              </select>
            }
          </div>
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

      <!-- Data Table -->
      @if (!isLoading()) {
        <div class="card">
          <div class="table-responsive">
            <table class="table table-striped table-bordered table-hover mb-0">
              <thead class="table-light">
                <tr>
                  <th style="width:50px;">#</th>
                  <th>Agente</th>
                  <th>Acción</th>
                  <th>Archivo</th>
                  <th>Tipo</th>
                  <th>Chat</th>
                  <th>IP</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                @if (logs().length === 0) {
                  <tr>
                    <td colspan="8" class="text-center py-4 text-muted">
                      No hay registros de auditoría
                    </td>
                  </tr>
                } @else {
                  @for (log of logs(); track log.id) {
                    <tr class="cursor-pointer" (click)="showDetail(log)">
                      <td>{{ log.id }}</td>
                      <td>{{ log.agentName || '-' }}</td>
                      <td>
                        <span class="badge" [ngClass]="getActionBadgeClass(log.action)">
                          {{ getActionLabel(log.action) }}
                        </span>
                      </td>
                      <td class="text-truncate" style="max-width:200px;" [title]="log.fileName || ''">
                        {{ log.fileName || '-' }}
                      </td>
                      <td>{{ formatFileType(log.fileType) }}</td>
                      <td>{{ log.chatPhone || '-' }}</td>
                      <td>{{ log.clientIp || '-' }}</td>
                      <td class="text-nowrap">{{ formatDate(log.eventTimestamp) }}</td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          @if (totalPages() > 1) {
            <div class="card-footer">
              <div class="d-flex justify-content-between align-items-center">
                <div class="text-muted small">
                  Mostrando {{ (currentPage() * pageSize) + 1 }} -
                  {{ mathMin((currentPage() + 1) * pageSize, totalCount()) }}
                  de {{ totalCount() }} registros
                </div>
                <nav>
                  <ul class="pagination pagination-sm mb-0">
                    <li class="page-item" [class.disabled]="currentPage() === 0">
                      <button class="page-link" (click)="goToPage(currentPage() - 1)">
                        <i class="ph ph-caret-left"></i>
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
                        <i class="ph ph-caret-right"></i>
                      </button>
                    </li>
                  </ul>
                </nav>
              </div>
            </div>
          }
        </div>
      }

      <!-- Detail Modal -->
      @if (showDetailModal()) {
        <div class="modal fade show d-block" tabindex="-1" style="background-color: rgba(0,0,0,0.5);"
             (click)="closeDetail()">
          <div class="modal-dialog modal-lg" (click)="$event.stopPropagation()">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">
                  <i class="ph ph-shield-check me-2"></i>
                  Detalle de Auditoría #{{ selectedLog()?.id }}
                </h5>
                <button type="button" class="btn-close" (click)="closeDetail()"></button>
              </div>
              <div class="modal-body">
                @if (selectedLog(); as log) {
                  <div class="row g-3">
                    <div class="col-md-6">
                      <div class="mb-3">
                        <label class="form-label fw-bold text-muted small">Agente</label>
                        <div>{{ log.agentName || '-' }} <span class="text-muted small">(ID: {{ log.agentId || '-' }})</span></div>
                      </div>
                      <div class="mb-3">
                        <label class="form-label fw-bold text-muted small">Cliente</label>
                        <div>{{ log.clientUserName || '-' }} <span class="text-muted small">(ID: {{ log.clientUserId || '-' }})</span></div>
                      </div>
                      <div class="mb-3">
                        <label class="form-label fw-bold text-muted small">Acción</label>
                        <div>
                          <span class="badge" [ngClass]="getActionBadgeClass(log.action)">
                            {{ getActionLabel(log.action) }}
                          </span>
                        </div>
                      </div>
                      <div class="mb-3">
                        <label class="form-label fw-bold text-muted small">Descripción</label>
                        <div>{{ log.description || '-' }}</div>
                      </div>
                      <div class="mb-3">
                        <label class="form-label fw-bold text-muted small">Chat (Teléfono)</label>
                        <div>{{ log.chatPhone || '-' }}</div>
                      </div>
                    </div>
                    <div class="col-md-6">
                      <div class="mb-3">
                        <label class="form-label fw-bold text-muted small">Archivo</label>
                        <div>{{ log.fileName || '-' }}</div>
                      </div>
                      <div class="mb-3">
                        <label class="form-label fw-bold text-muted small">Tipo de Archivo</label>
                        <div>{{ log.fileType || '-' }}</div>
                      </div>
                      <div class="mb-3">
                        <label class="form-label fw-bold text-muted small">Tamaño</label>
                        <div>{{ formatSize(log.sizeBytes) }}</div>
                      </div>
                      <div class="mb-3">
                        <label class="form-label fw-bold text-muted small">IP</label>
                        <div>{{ log.clientIp || '-' }}</div>
                      </div>
                      <div class="mb-3">
                        <label class="form-label fw-bold text-muted small">Fingerprint</label>
                        <div class="text-break small font-monospace">{{ log.userFingerprint || '-' }}</div>
                      </div>
                      <div class="mb-3">
                        <label class="form-label fw-bold text-muted small">Fecha del Evento</label>
                        <div>{{ formatDateFull(log.eventTimestamp) }}</div>
                      </div>
                    </div>
                  </div>

                  <!-- Original URL -->
                  @if (log.originalUrl) {
                    <div class="mb-3">
                      <label class="form-label fw-bold text-muted small">URL Original</label>
                      <div class="text-break small font-monospace bg-light p-2 rounded">{{ log.originalUrl }}</div>
                    </div>
                  }

                  <!-- Extra Metadata -->
                  @if (log.extraMetadata && hasKeys(log.extraMetadata)) {
                    <div class="mb-3">
                      <label class="form-label fw-bold text-muted small">Metadata Extra</label>
                      <pre class="bg-light p-3 rounded overflow-auto small" style="max-height:200px;">{{ formatJson(log.extraMetadata) }}</pre>
                    </div>
                  }
                }
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" (click)="closeDetail()">Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .stat-card {
      cursor: pointer;
      transition: box-shadow 0.2s, border-color 0.2s;
      border: 2px solid transparent;
    }
    .stat-card:hover {
      box-shadow: 0 0.25rem 0.5rem rgba(0,0,0,0.1);
    }
    .stat-card.active {
      border-color: var(--bs-primary);
      box-shadow: 0 0.25rem 0.5rem rgba(13,110,253,0.15);
    }
    .cursor-pointer {
      cursor: pointer;
    }
    pre {
      font-size: 0.85rem;
      white-space: pre-wrap;
      word-break: break-word;
    }
  `]
})
export class MediaAuditLogsComponent implements OnInit, OnDestroy {
  private mediaAuditService = inject(MediaAuditService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  private http = inject(HttpClient);
  private destroy$ = new Subject<void>();

  // State
  logs = signal<MediaAuditLog[]>([]);
  stats = signal<MediaAuditStatsResponse | null>(null);
  agents = signal<Agent[]>([]);
  isLoading = signal(true);
  currentPage = signal(0);
  pageSize = 20;
  totalCount = signal(0);
  totalPages = signal(0);

  // Filters
  selectedDateFilter = signal<'today' | '7d' | '30d' | 'all'>('30d');
  activeStatFilter = signal<string | null>(null);
  selectedAction = '';
  selectedAgentId: number | null = null;
  fromDate = '';
  toDate = '';

  // Modal
  showDetailModal = signal(false);
  selectedLog = signal<MediaAuditLog | null>(null);

  // Computed
  blockedCount = computed(() => {
    const s = this.stats();
    if (!s) return '-';
    return (s.DOWNLOAD_BLOCKED || 0) + (s.BLOCKED_FILE_ATTEMPT || 0);
  });

  ngOnInit(): void {
    this.setDateFilter('30d');
    this.loadAgents();
    this.loadStats();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadLogs(): void {
    this.isLoading.set(true);

    const params: Record<string, unknown> = {
      page: this.currentPage(),
      size: this.pageSize
    };

    if (this.selectedAction) {
      params['action'] = this.selectedAction;
    }
    if (this.selectedAgentId) {
      params['agentId'] = this.selectedAgentId;
    }
    if (this.fromDate) {
      params['from'] = this.fromDate;
    }
    if (this.toDate) {
      params['to'] = this.toDate;
    }

    this.mediaAuditService.getAuditLogs(params as any)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.logs.set(response.data);
          this.totalCount.set(response.meta.totalItems);
          this.totalPages.set(response.meta.totalPages);
          this.isLoading.set(false);
        },
        error: (error) => {
          console.error('Error loading media audit logs:', error);
          this.toastService.error('Error al cargar los registros de auditoría');
          this.isLoading.set(false);
        }
      });
  }

  loadStats(): void {
    this.mediaAuditService.getStats()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats) => this.stats.set(stats as MediaAuditStatsResponse),
        error: (error) => console.error('Error loading stats:', error)
      });
  }

  loadAgents(): void {
    // Load subordinates for agent filter
    this.http.get<any[]>(`${environment.apiUrl}/app/users/subordinates`)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (users) => {
          this.agents.set(users.map(u => ({
            id: u.id,
            name: u.firstName ? `${u.firstName} ${u.lastName || ''}`.trim() : u.email
          })));
        },
        error: () => {
          // Not critical, agent filter just won't show
        }
      });
  }

  // --- Filters ---

  setDateFilter(filter: 'today' | '7d' | '30d' | 'all'): void {
    this.selectedDateFilter.set(filter);
    const today = new Date();

    switch (filter) {
      case 'today':
        this.fromDate = this.formatDateInput(today);
        this.toDate = this.formatDateInput(today);
        break;
      case '7d': {
        const d = new Date(today);
        d.setDate(today.getDate() - 7);
        this.fromDate = this.formatDateInput(d);
        this.toDate = this.formatDateInput(today);
        break;
      }
      case '30d': {
        const d = new Date(today);
        d.setDate(today.getDate() - 30);
        this.fromDate = this.formatDateInput(d);
        this.toDate = this.formatDateInput(today);
        break;
      }
      case 'all':
        this.fromDate = '';
        this.toDate = '';
        break;
    }

    this.currentPage.set(0);
    this.loadLogs();
  }

  filterByStat(stat: string | null): void {
    this.activeStatFilter.set(stat);

    switch (stat) {
      case 'blocked':
        // We can only filter by one action at a time via API,
        // so filter by DOWNLOAD_BLOCKED (primary block action)
        this.selectedAction = 'DOWNLOAD_BLOCKED';
        break;
      case 'captured':
        this.selectedAction = 'MEDIA_CAPTURED';
        break;
      case 'viewed':
        this.selectedAction = 'MEDIA_VIEWED';
        break;
      case 'video_blocked':
        this.selectedAction = 'VIDEO_BLOCKED';
        break;
      default:
        this.selectedAction = '';
        break;
    }

    this.currentPage.set(0);
    this.loadLogs();
  }

  onFilterChange(): void {
    this.activeStatFilter.set(null);
    this.currentPage.set(0);
    this.loadLogs();
  }

  // --- Pagination ---

  goToPage(page: number): void {
    if (page >= 0 && page < this.totalPages()) {
      this.currentPage.set(page);
      this.loadLogs();
    }
  }

  getPageNumbers(): number[] {
    const total = this.totalPages();
    const current = this.currentPage();
    const start = Math.max(0, current - 2);
    const end = Math.min(total, start + 5);
    const pages: number[] = [];
    for (let i = start; i < end; i++) {
      pages.push(i);
    }
    return pages;
  }

  // --- Detail Modal ---

  showDetail(log: MediaAuditLog): void {
    this.selectedLog.set(log);
    this.showDetailModal.set(true);
  }

  closeDetail(): void {
    this.showDetailModal.set(false);
    this.selectedLog.set(null);
  }

  // --- Formatting ---

  getActionLabel(action: string): string {
    return this.mediaAuditService.getActionLabel(action);
  }

  getActionBadgeClass(action: string): string {
    return this.mediaAuditService.getActionBadgeClass(action);
  }

  formatDate(dateString: string): string {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('es-ES', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatDateFull(dateString: string): string {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  formatFileType(mimeType: string | null): string {
    if (!mimeType) return '-';
    // Show short type: image/jpeg → jpeg
    const parts = mimeType.split('/');
    return parts.length > 1 ? parts[1] : mimeType;
  }

  formatSize(bytes: number | null): string {
    if (!bytes) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  formatJson(obj: Record<string, unknown> | null): string {
    if (!obj) return '-';
    return JSON.stringify(obj, null, 2);
  }

  hasKeys(obj: Record<string, unknown> | null): boolean {
    return obj !== null && Object.keys(obj).length > 0;
  }

  mathMin(a: number, b: number): number {
    return Math.min(a, b);
  }

  private formatDateInput(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
