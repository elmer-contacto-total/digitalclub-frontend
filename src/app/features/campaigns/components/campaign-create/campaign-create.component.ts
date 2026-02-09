import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { CampaignService } from '../../../../core/services/campaign.service';
import { BulkMessageService, BulkMessage } from '../../../../core/services/bulk-message.service';
import { ToastService } from '../../../../core/services/toast.service';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { environment } from '../../../../../environments/environment';
import { HttpClient, HttpParams } from '@angular/common/http';

interface Recipient {
  id: number;
  name: string;
  phone: string;
  email: string;
  selected: boolean;
}

interface Template {
  id: number;
  name: string;
  body_content: string;
  language: string;
}

@Component({
  selector: 'app-campaign-create',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, LoadingSpinnerComponent],
  template: `
    <div class="campaign-create-container">
      <div class="page-header">
        <a routerLink="/app/campaigns" class="back-link">
          <i class="ph-arrow-left"></i> Volver a campañas
        </a>
        <h1>Nueva Campaña</h1>
      </div>

      <!-- Wizard Steps Indicator -->
      <div class="wizard-steps">
        <div class="step" [class.active]="currentStep() === 1" [class.completed]="currentStep() > 1">
          <span class="step-number">1</span>
          <span class="step-label">Método y Mensaje</span>
        </div>
        <div class="step-connector"></div>
        <div class="step" [class.active]="currentStep() === 2" [class.completed]="currentStep() > 2">
          <span class="step-number">2</span>
          <span class="step-label">Destinatarios</span>
        </div>
        <div class="step-connector"></div>
        <div class="step" [class.active]="currentStep() === 3">
          <span class="step-number">3</span>
          <span class="step-label">Confirmar</span>
        </div>
      </div>

      @if (errors().length > 0) {
        <div class="error-panel">
          @for (error of errors(); track error) {
            <p>{{ error }}</p>
          }
        </div>
      }

      <!-- Step 1: Method & Message -->
      @if (currentStep() === 1) {
        <div class="wizard-card">
          <h2>Selecciona método de envío y mensaje</h2>

          <div class="form-group">
            <label>Método de envío</label>
            <div class="method-selector">
              <div class="method-option" [class.selected]="sendMethod === 'CLOUD_API'" (click)="sendMethod = 'CLOUD_API'">
                <i class="ph-cloud"></i>
                <div>
                  <strong>Cloud API</strong>
                  <p>Plantillas aprobadas por WhatsApp. Seguro y confiable.</p>
                </div>
              </div>
              <div class="method-option" [class.selected]="sendMethod === 'ELECTRON'" (click)="sendMethod = 'ELECTRON'">
                <i class="ph-desktop"></i>
                <div>
                  <strong>Electron (WhatsApp Web)</strong>
                  <p>Mensajes de texto libre via app de escritorio.</p>
                </div>
              </div>
            </div>
          </div>

          @if (sendMethod === 'CLOUD_API') {
            <div class="form-group">
              <label>Seleccionar plantilla aprobada</label>
              @if (isLoadingTemplates()) {
                <p class="loading-text">Cargando plantillas...</p>
              } @else if (templates().length === 0) {
                <p class="empty-text">No hay plantillas aprobadas disponibles.</p>
              } @else {
                <select [(ngModel)]="selectedTemplateId" class="form-control">
                  <option [ngValue]="null">-- Seleccionar plantilla --</option>
                  @for (t of templates(); track t.id) {
                    <option [ngValue]="t.id">{{ t.name }}</option>
                  }
                </select>
                @if (selectedTemplate()) {
                  <div class="message-preview-box">
                    <label>Vista previa:</label>
                    <p>{{ selectedTemplate()!.body_content }}</p>
                  </div>
                }
              }
            </div>
          }

          @if (sendMethod === 'ELECTRON') {
            <div class="form-group">
              <label>Seleccionar mensaje predefinido</label>
              @if (isLoadingMessages()) {
                <p class="loading-text">Cargando mensajes...</p>
              } @else if (bulkMessages().length === 0) {
                <p class="empty-text">No hay mensajes masivos disponibles.</p>
              } @else {
                <select [(ngModel)]="selectedMessageId" class="form-control">
                  <option [ngValue]="null">-- Seleccionar mensaje --</option>
                  @for (m of bulkMessages(); track m.id) {
                    <option [ngValue]="m.id">{{ m.message | slice:0:80 }}{{ m.message.length > 80 ? '...' : '' }}</option>
                  }
                </select>
                @if (selectedMessage()) {
                  <div class="message-preview-box">
                    <label>Vista previa:</label>
                    <p>{{ selectedMessage()!.message }}</p>
                  </div>
                }
              }
            </div>
          }

          <div class="wizard-actions">
            <a routerLink="/app/campaigns" class="btn btn-outline">Cancelar</a>
            <button class="btn btn-primary" (click)="goToStep2()" [disabled]="!canGoToStep2()">
              Siguiente <i class="ph-arrow-right"></i>
            </button>
          </div>
        </div>
      }

      <!-- Step 2: Recipients -->
      @if (currentStep() === 2) {
        <div class="wizard-card">
          <h2>Seleccionar destinatarios</h2>

          <div class="recipients-toolbar">
            <div class="search-box">
              <i class="ph-magnifying-glass"></i>
              <input type="text" [(ngModel)]="recipientSearch" (input)="filterRecipients()"
                     placeholder="Buscar por nombre o teléfono..." class="form-control">
            </div>
            <div class="select-actions">
              <button class="btn btn-sm btn-outline" (click)="selectAll()">Seleccionar todos</button>
              <button class="btn btn-sm btn-outline" (click)="deselectAll()">Deseleccionar todos</button>
              <span class="selected-count">{{ selectedCount() }} seleccionados</span>
            </div>
          </div>

          @if (isLoadingRecipients()) {
            <app-loading-spinner message="Cargando destinatarios..." />
          } @else {
            <div class="recipients-table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th class="check-col">
                      <input type="checkbox" [checked]="allVisibleSelected()" (change)="toggleAllVisible()">
                    </th>
                    <th>Nombre</th>
                    <th>Teléfono</th>
                    <th>Email</th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of filteredRecipients(); track r.id) {
                    <tr (click)="r.selected = !r.selected" [class.selected-row]="r.selected">
                      <td class="check-col">
                        <input type="checkbox" [(ngModel)]="r.selected" (click)="$event.stopPropagation()">
                      </td>
                      <td>{{ r.name }}</td>
                      <td>{{ r.phone }}</td>
                      <td>{{ r.email }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }

          <div class="wizard-actions">
            <button class="btn btn-outline" (click)="currentStep.set(1)">
              <i class="ph-arrow-left"></i> Anterior
            </button>
            <button class="btn btn-primary" (click)="goToStep3()" [disabled]="selectedCount() === 0">
              Siguiente <i class="ph-arrow-right"></i>
            </button>
          </div>
        </div>
      }

      <!-- Step 3: Confirm -->
      @if (currentStep() === 3) {
        <div class="wizard-card">
          <h2>Confirmar Envío</h2>

          <div class="confirm-summary">
            <div class="summary-row">
              <span class="summary-label">Método:</span>
              <span class="summary-value">
                <span class="method-badge" [class.cloud]="sendMethod === 'CLOUD_API'" [class.electron]="sendMethod === 'ELECTRON'">
                  {{ sendMethod === 'CLOUD_API' ? 'Cloud API' : 'Electron' }}
                </span>
              </span>
            </div>
            <div class="summary-row">
              <span class="summary-label">Mensaje:</span>
              <span class="summary-value">
                @if (sendMethod === 'CLOUD_API' && selectedTemplate()) {
                  Plantilla: <strong>{{ selectedTemplate()!.name }}</strong>
                } @else if (sendMethod === 'ELECTRON' && selectedMessage()) {
                  {{ selectedMessage()!.message | slice:0:100 }}{{ selectedMessage()!.message && selectedMessage()!.message.length > 100 ? '...' : '' }}
                }
              </span>
            </div>
            <div class="summary-row">
              <span class="summary-label">Destinatarios:</span>
              <span class="summary-value"><strong>{{ selectedCount() }}</strong> contactos</span>
            </div>
            @if (sendMethod === 'CLOUD_API') {
              <div class="summary-note">
                <i class="ph-info"></i>
                Los mensajes se enviarán automáticamente via Cloud API.
              </div>
            } @else {
              <div class="summary-note">
                <i class="ph-info"></i>
                Inicia el envío desde la aplicación de escritorio (Electron).
              </div>
            }
          </div>

          <div class="wizard-actions">
            <button class="btn btn-outline" (click)="currentStep.set(2)">
              <i class="ph-arrow-left"></i> Anterior
            </button>
            <button class="btn btn-primary btn-lg" (click)="submit()" [disabled]="isSaving()">
              {{ isSaving() ? 'Creando campaña...' : 'Iniciar Envío' }}
              <i class="ph-paper-plane-tilt"></i>
            </button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .campaign-create-container {
      padding: 24px;
      max-width: 900px;
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
    .wizard-steps {
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 24px;
      gap: 0;
    }
    .step {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border-radius: 20px;
      background: #f0f0f0;
      color: #999;
      font-size: 14px;
      transition: all 0.3s;
      &.active { background: #4361ee; color: white; }
      &.completed { background: #d4edda; color: #155724; }
    }
    .step-number {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: rgba(255,255,255,0.3);
      font-size: 12px;
      font-weight: 600;
    }
    .step-connector {
      width: 40px;
      height: 2px;
      background: #e0e0e0;
    }
    .wizard-card {
      background: white;
      border: 1px solid #e9ecef;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
      h2 { font-size: 18px; font-weight: 600; margin: 0 0 20px; color: #1a1a2e; }
    }
    .form-group {
      margin-bottom: 20px;
      label { display: block; font-size: 14px; font-weight: 500; margin-bottom: 6px; color: #333; }
    }
    .form-control {
      width: 100%;
      padding: 10px 14px;
      border: 1px solid #dee2e6;
      border-radius: 8px;
      font-size: 14px;
      transition: border-color 0.2s;
      box-sizing: border-box;
      &:focus { outline: none; border-color: #4361ee; box-shadow: 0 0 0 3px rgba(67,97,238,0.1); }
    }
    .method-selector {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .method-option {
      display: flex;
      gap: 12px;
      padding: 16px;
      border: 2px solid #e9ecef;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s;
      &:hover { border-color: #a0b4ff; }
      &.selected { border-color: #4361ee; background: #f0f3ff; }
      i { font-size: 28px; color: #4361ee; margin-top: 2px; }
      strong { display: block; font-size: 14px; margin-bottom: 4px; }
      p { margin: 0; font-size: 12px; color: #6c757d; }
    }
    .message-preview-box {
      margin-top: 12px;
      padding: 12px 16px;
      background: #f8f9fa;
      border-radius: 8px;
      border-left: 3px solid #4361ee;
      label { font-size: 12px; color: #6c757d; margin-bottom: 4px; }
      p { margin: 0; font-size: 14px; color: #333; white-space: pre-wrap; }
    }
    .loading-text, .empty-text {
      font-size: 14px;
      color: #6c757d;
      padding: 12px 0;
    }
    .recipients-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      gap: 12px;
      flex-wrap: wrap;
    }
    .search-box {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
      max-width: 400px;
      i { color: #6c757d; }
      .form-control { flex: 1; }
    }
    .select-actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .selected-count {
      font-size: 13px;
      font-weight: 500;
      color: #4361ee;
    }
    .btn-sm {
      padding: 4px 10px;
      font-size: 12px;
    }
    .recipients-table-container {
      max-height: 400px;
      overflow-y: auto;
      border: 1px solid #e9ecef;
      border-radius: 8px;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
    }
    .data-table th {
      background: #f8f9fa;
      padding: 10px 12px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      color: #6c757d;
      text-align: left;
      border-bottom: 2px solid #e9ecef;
      position: sticky;
      top: 0;
      z-index: 1;
    }
    .data-table td {
      padding: 8px 12px;
      font-size: 13px;
      border-bottom: 1px solid #f0f0f0;
    }
    .data-table tbody tr {
      cursor: pointer;
      &:hover { background: #f8f9ff; }
    }
    .selected-row { background: #e8f0fe !important; }
    .check-col { width: 40px; text-align: center; }
    .confirm-summary {
      padding: 20px;
      background: #f8f9fa;
      border-radius: 10px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #e9ecef;
      &:last-of-type { border-bottom: none; }
    }
    .summary-label { font-weight: 500; color: #6c757d; }
    .summary-value { color: #333; }
    .method-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      &.cloud { background: #d4edda; color: #155724; }
      &.electron { background: #fff3cd; color: #856404; }
    }
    .summary-note {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 16px;
      padding: 12px;
      background: #e8f0fe;
      border-radius: 8px;
      font-size: 13px;
      color: #1967d2;
      i { font-size: 18px; }
    }
    .wizard-actions {
      display: flex;
      justify-content: space-between;
      margin-top: 24px;
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
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }
    .btn-primary {
      background: #4361ee;
      color: white;
      &:hover:not(:disabled) { background: #3a56d4; }
    }
    .btn-outline {
      background: white;
      color: #4361ee;
      border: 1px solid #4361ee;
      &:hover { background: #f0f3ff; }
    }
    .btn-lg { padding: 12px 24px; font-size: 16px; }
    .error-panel {
      background: #f8d7da;
      border: 1px solid #f5c6cb;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 16px;
      p { margin: 0; font-size: 14px; color: #721c24; }
    }
    @media (max-width: 768px) {
      .method-selector { grid-template-columns: 1fr; }
      .wizard-steps { flex-wrap: wrap; gap: 4px; }
      .step-connector { display: none; }
    }
  `]
})
export class CampaignCreateComponent implements OnInit, OnDestroy {
  private campaignService = inject(CampaignService);
  private bulkMessageService = inject(BulkMessageService);
  private http = inject(HttpClient);
  private router = inject(Router);
  private toast = inject(ToastService);
  private destroy$ = new Subject<void>();

  currentStep = signal(1);
  errors = signal<string[]>([]);
  isSaving = signal(false);

  // Step 1
  sendMethod = 'CLOUD_API';
  templates = signal<Template[]>([]);
  isLoadingTemplates = signal(false);
  selectedTemplateId: number | null = null;

  bulkMessages = signal<BulkMessage[]>([]);
  isLoadingMessages = signal(false);
  selectedMessageId: number | null = null;

  // Step 2
  recipients = signal<Recipient[]>([]);
  isLoadingRecipients = signal(false);
  recipientSearch = '';

  selectedTemplate = computed(() => {
    const id = this.selectedTemplateId;
    return this.templates().find(t => t.id === id) || null;
  });

  selectedMessage = computed(() => {
    const id = this.selectedMessageId;
    return this.bulkMessages().find(m => m.id === id) || null;
  });

  filteredRecipients = computed(() => {
    const search = this.recipientSearch.toLowerCase();
    if (!search) return this.recipients();
    return this.recipients().filter(r =>
      r.name.toLowerCase().includes(search) ||
      r.phone.includes(search)
    );
  });

  selectedCount = computed(() => {
    return this.recipients().filter(r => r.selected).length;
  });

  allVisibleSelected = computed(() => {
    const visible = this.filteredRecipients();
    return visible.length > 0 && visible.every(r => r.selected);
  });

  ngOnInit(): void {
    this.loadTemplates();
    this.loadBulkMessages();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadTemplates(): void {
    this.isLoadingTemplates.set(true);
    this.http.get<{ templates: Template[] }>(
      `${environment.apiUrl}/app/template_bulk_sends/templates`
    ).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.templates.set(res.templates || []);
        this.isLoadingTemplates.set(false);
      },
      error: () => {
        this.isLoadingTemplates.set(false);
      }
    });
  }

  private loadBulkMessages(): void {
    this.isLoadingMessages.set(true);
    this.bulkMessageService.getBulkMessages(0, 100).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (res) => {
        this.bulkMessages.set(res.bulk_messages || []);
        this.isLoadingMessages.set(false);
      },
      error: () => {
        this.isLoadingMessages.set(false);
      }
    });
  }

  private loadRecipients(): void {
    this.isLoadingRecipients.set(true);
    this.http.get<{ recipients: any[]; total: number }>(
      `${environment.apiUrl}/app/template_bulk_sends/recipients`,
      { params: new HttpParams().set('filter', 'with_phone').set('size', '500') }
    ).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.recipients.set((res.recipients || []).map((r: any) => ({
          id: r.id,
          name: r.name,
          phone: r.phone,
          email: r.email || '',
          selected: false
        })));
        this.isLoadingRecipients.set(false);
      },
      error: () => {
        this.isLoadingRecipients.set(false);
      }
    });
  }

  canGoToStep2(): boolean {
    if (this.sendMethod === 'CLOUD_API') return this.selectedTemplateId !== null;
    return this.selectedMessageId !== null;
  }

  goToStep2(): void {
    this.errors.set([]);
    if (!this.canGoToStep2()) return;
    this.loadRecipients();
    this.currentStep.set(2);
  }

  goToStep3(): void {
    this.errors.set([]);
    if (this.selectedCount() === 0) {
      this.errors.set(['Selecciona al menos un destinatario']);
      return;
    }
    this.currentStep.set(3);
  }

  selectAll(): void {
    this.recipients.update(list => list.map(r => ({ ...r, selected: true })));
  }

  deselectAll(): void {
    this.recipients.update(list => list.map(r => ({ ...r, selected: false })));
  }

  toggleAllVisible(): void {
    const allSelected = this.allVisibleSelected();
    const visibleIds = new Set(this.filteredRecipients().map(r => r.id));
    this.recipients.update(list =>
      list.map(r => visibleIds.has(r.id) ? { ...r, selected: !allSelected } : r)
    );
  }

  filterRecipients(): void {
    // Triggers recomputation via computed signal
  }

  submit(): void {
    this.errors.set([]);
    this.isSaving.set(true);

    const selectedIds = this.recipients().filter(r => r.selected).map(r => r.id);

    this.campaignService.createCampaign({
      sendMethod: this.sendMethod,
      bulkMessageId: this.sendMethod === 'ELECTRON' ? this.selectedMessageId! : undefined,
      messageTemplateId: this.sendMethod === 'CLOUD_API' ? this.selectedTemplateId! : undefined,
      recipientIds: selectedIds
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.isSaving.set(false);
        this.toast.success(res.message || 'Campaña creada exitosamente');
        this.router.navigate(['/app/campaigns', res.campaign.id]);
      },
      error: (err) => {
        this.isSaving.set(false);
        this.errors.set([err.error?.message || 'Error al crear campaña']);
      }
    });
  }
}
