/**
 * Prospect Detail Component
 * PARIDAD: Rails admin/prospects/show.html.erb
 * Vista de detalle de prospecto
 */
import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ProspectService, Prospect, ProspectStatus } from '../../../../core/services/prospect.service';
import { ToastService } from '../../../../core/services/toast.service';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-prospect-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    LoadingSpinnerComponent,
    ConfirmDialogComponent
  ],
  template: `
    <div class="prospect-detail-container">
      <!-- Header - PARIDAD: Rails admin/prospects/show.html.erb -->
      <div class="page-header">
        <a routerLink="/app/prospects" class="btn btn-secondary">
          <i class="ph ph-list"></i>
          Volver
        </a>
        @if (prospect()) {
          <a [routerLink]="['/app/prospects', prospect()!.id, 'edit']" class="btn btn-primary">
            <i class="ph ph-pencil"></i>
            Editar
          </a>
          @if (!prospect()!.upgradedToUser) {
            <button type="button" class="btn btn-success" (click)="showUpgradeDialog.set(true)">
              <i class="ph ph-user-plus"></i>
              Convertir a Usuario
            </button>
          }
        }
        <div class="title-container">
          <h1>Ver prospecto</h1>
        </div>
      </div>

      @if (isLoading()) {
        <app-loading-spinner [overlay]="false" message="Cargando..." />
      } @else if (prospect()) {
        <!-- Detail Fields - PARIDAD: Rails dl-horizontal -->
        <dl class="dl-horizontal">
          <dt>Manager:</dt>
          <dd>{{ prospect()?.managerName || '-' }}</dd>
        </dl>

        <dl class="dl-horizontal">
          <dt>Nombre:</dt>
          <dd>{{ prospect()?.name || '-' }}</dd>
        </dl>

        <dl class="dl-horizontal">
          <dt>Teléfono:</dt>
          <dd>{{ prospect()?.phone || '-' }}</dd>
        </dl>

        <dl class="dl-horizontal">
          <dt>Cliente:</dt>
          <dd>{{ prospect()?.clientId || '-' }}</dd>
        </dl>

        <dl class="dl-horizontal">
          <dt>Estado:</dt>
          <dd>
            <span class="badge" [ngClass]="getStatusClass(prospect()!.status)">
              {{ getStatusLabel(prospect()!.status) }}
            </span>
          </dd>
        </dl>

        <dl class="dl-horizontal">
          <dt>Convertido a Usuario:</dt>
          <dd>
            @if (prospect()?.upgradedToUser) {
              <span class="badge badge-success">Sí</span>
            } @else {
              <span class="badge badge-secondary">No</span>
            }
          </dd>
        </dl>

        <dl class="dl-horizontal">
          <dt>Fecha de Creación:</dt>
          <dd>{{ formatDate(prospect()?.createdAt) }}</dd>
        </dl>

        <dl class="dl-horizontal">
          <dt>Última Actualización:</dt>
          <dd>{{ formatDate(prospect()?.updatedAt) }}</dd>
        </dl>
      }

      <!-- Upgrade to User Confirmation Dialog -->
      @if (showUpgradeDialog()) {
        <app-confirm-dialog
          title="Convertir a Usuario"
          message="¿Estás seguro de convertir este prospecto en usuario? Esta acción creará un nuevo usuario con los datos del prospecto."
          confirmText="Convertir"
          confirmClass="btn-success"
          (confirm)="upgradeToUser()"
          (cancel)="showUpgradeDialog.set(false)"
        />
      }
    </div>
  `,
  styles: [`
    .prospect-detail-container {
      padding: 24px;
    }

    .page-header {
      margin-bottom: 24px;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: flex-start;
    }

    .title-container {
      flex-basis: 100%;
      margin-top: 8px;

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

    .btn-success {
      background-color: #10b981;
      border-color: #10b981;
      color: white;

      &:hover {
        background-color: #059669;
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
    .badge-danger { background: #fee2e2; color: #991b1b; }
    .badge-warning { background: #fff3cd; color: #856404; }

    @media (max-width: 768px) {
      .prospect-detail-container { padding: 16px; }
      .page-header { flex-direction: column; align-items: stretch; }
      .page-header .btn { justify-content: center; }
      .dl-horizontal { flex-direction: column; }
      .dl-horizontal dt { margin-bottom: 4px; }
    }
  `]
})
export class ProspectDetailComponent implements OnInit, OnDestroy {
  private prospectService = inject(ProspectService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);
  private destroy$ = new Subject<void>();

  // Data
  prospect = signal<Prospect | null>(null);
  isLoading = signal(true);
  showUpgradeDialog = signal(false);

  ngOnInit(): void {
    this.route.params.pipe(
      takeUntil(this.destroy$)
    ).subscribe(params => {
      if (params['id']) {
        this.loadProspect(+params['id']);
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadProspect(id: number): void {
    this.isLoading.set(true);

    this.prospectService.getProspect(id).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (prospect) => {
        this.prospect.set(prospect);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading prospect:', err);
        this.toast.error('Error al cargar prospecto');
        this.isLoading.set(false);
        this.router.navigate(['/app/prospects']);
      }
    });
  }

  upgradeToUser(): void {
    const prospectData = this.prospect();
    if (!prospectData) return;

    this.showUpgradeDialog.set(false);

    this.prospectService.upgradeToUser(prospectData.id).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        this.toast.success('Prospecto convertido a usuario exitosamente');
        // Navigate to the new user
        this.router.navigate(['/app/users', response.user_id]);
      },
      error: (err) => {
        console.error('Error upgrading prospect:', err);
        this.toast.error('Error al convertir prospecto a usuario');
      }
    });
  }

  getStatusLabel(status: ProspectStatus): string {
    return this.prospectService.getStatusLabel(status);
  }

  getStatusClass(status: ProspectStatus): string {
    return this.prospectService.getStatusClass(status);
  }

  formatDate(dateStr: string | undefined): string {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-PE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
