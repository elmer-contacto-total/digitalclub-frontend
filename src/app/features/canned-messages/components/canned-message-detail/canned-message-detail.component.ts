/**
 * Canned Message Detail Component
 * PARIDAD: Rails admin/canned_messages/show.html.erb
 * Vista de detalle de mensaje enlatado
 */
import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { CannedMessageService, CannedMessage } from '../../../../core/services/canned-message.service';
import { ToastService } from '../../../../core/services/toast.service';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-canned-message-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    LoadingSpinnerComponent
  ],
  template: `
    <div class="canned-message-detail-container">
      <!-- Header - PARIDAD: Rails admin/canned_messages/show.html.erb -->
      <div class="page-header">
        <a routerLink="/app/canned_messages" class="btn btn-secondary">
          <i class="ph ph-list"></i>
          Volver
        </a>
        @if (cannedMessage()) {
          <a [routerLink]="['/app/canned_messages', cannedMessage()?.id, 'edit']" class="btn btn-primary">
            <i class="ph ph-pencil-simple"></i>
            Editar
          </a>
        }
        <div class="title-container">
          <h1>Ver mensaje enlatado</h1>
        </div>
      </div>

      @if (isLoading()) {
        <app-loading-spinner [overlay]="false" message="Cargando..." />
      } @else if (cannedMessage()) {
        <!-- Details - PARIDAD: Rails dl-horizontal -->
        <dl class="dl-horizontal">
          <dt>Usuario:</dt>
          <dd>{{ cannedMessage()?.user_id || '-' }}</dd>
        </dl>

        <dl class="dl-horizontal">
          <dt>Mensaje:</dt>
          <dd class="message-content">{{ cannedMessage()?.message }}</dd>
        </dl>

        <dl class="dl-horizontal">
          <dt>Disponible para Todos:</dt>
          <dd>
            <span class="badge" [class.badge-success]="cannedMessage()?.client_global" [class.badge-secondary]="!cannedMessage()?.client_global">
              {{ cannedMessage()?.client_global ? 'Sí' : 'No' }}
            </span>
          </dd>
        </dl>

        <dl class="dl-horizontal">
          <dt>Estado:</dt>
          <dd>
            <span class="badge badge-success">
              {{ cannedMessage()?.status || 'active' }}
            </span>
          </dd>
        </dl>

        <dl class="dl-horizontal">
          <dt>Creado:</dt>
          <dd>{{ formatDate(cannedMessage()?.created_at) }}</dd>
        </dl>

        <dl class="dl-horizontal">
          <dt>Actualizado:</dt>
          <dd>{{ formatDate(cannedMessage()?.updated_at) }}</dd>
        </dl>
      }
    </div>
  `,
  styles: [`
    .canned-message-detail-container {
      padding: 24px;
    }

    .page-header {
      margin-bottom: 24px;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: flex-start;
    }

    .title-container {
      width: 100%;
      margin-top: 16px;

      h1 {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 500;
        color: var(--text-primary, #212529);
      }
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

    .btn-secondary {
      background-color: var(--secondary-color, #6c757d);
      border-color: var(--secondary-color, #6c757d);
      color: white;

      &:hover {
        background-color: #5c636a;
      }
    }

    /* DL Horizontal - PARIDAD: Rails dl-horizontal */
    .dl-horizontal {
      display: flex;
      margin: 0 0 12px 0;
      padding: 12px 16px;
      background: white;
      border: 1px solid var(--border-color, #dee2e6);
      border-radius: 4px;

      dt {
        min-width: 180px;
        font-weight: 600;
        color: var(--text-primary, #212529);
      }

      dd {
        margin: 0;
        color: var(--text-secondary, #6c757d);
        flex: 1;
      }

      .message-content {
        white-space: pre-wrap;
        word-break: break-word;
      }
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

    @media (max-width: 768px) {
      .canned-message-detail-container { padding: 16px; }
      .dl-horizontal { flex-direction: column; }
      .dl-horizontal dt { margin-bottom: 4px; }
    }
  `]
})
export class CannedMessageDetailComponent implements OnInit, OnDestroy {
  private cannedMessageService = inject(CannedMessageService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);
  private destroy$ = new Subject<void>();

  // Data
  cannedMessage = signal<CannedMessage | null>(null);
  isLoading = signal(true);

  ngOnInit(): void {
    this.route.params.pipe(
      takeUntil(this.destroy$)
    ).subscribe(params => {
      if (params['id']) {
        this.loadCannedMessage(+params['id']);
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadCannedMessage(id: number): void {
    this.isLoading.set(true);

    this.cannedMessageService.getCannedMessage(id).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (message) => {
        this.cannedMessage.set(message);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading canned message:', err);
        this.toast.error('Error al cargar mensaje');
        this.isLoading.set(false);
        this.router.navigate(['/app/canned_messages']);
      }
    });
  }

  formatDate(dateStr: string | undefined): string {
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
