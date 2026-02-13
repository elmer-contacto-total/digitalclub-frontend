import { Component, inject, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { BulkSendService, CsvPreviewResponse, AssignableAgent } from '../../../../core/services/bulk-send.service';
import { ElectronService } from '../../../../core/services/electron.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../core/services/toast.service';
import { UserRole, RoleUtils } from '../../../../core/models/user.model';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';

interface ParsedCsv {
  headers: string[];
  rows: string[][];
  totalRows: number;
  phoneColumn: number;
  nameColumn: number;
}

@Component({
  selector: 'app-envio-create',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LoadingSpinnerComponent],
  template: `
    <div class="envio-create-container">
      <div class="page-header">
        <a routerLink="/app/bulk_sends" class="back-link">
          <i class="ph ph-arrow-left"></i> Volver a envíos
        </a>
        <h1>Nuevo Envío Masivo</h1>
        <p class="subtitle">Sube un CSV, escribe tu mensaje con variables, adjunta un archivo y envía</p>
      </div>

      @if (errors().length > 0) {
        <div class="error-panel">
          @for (error of errors(); track error) {
            <p>{{ error }}</p>
          }
        </div>
      }

      <!-- STEP 1: CSV Upload -->
      <div class="card">
        <div class="card-header">
          <span class="step-badge">1</span>
          <h3>Destinatarios (CSV)</h3>
          @if (csv()) {
            <span class="check-badge"><i class="ph-fill ph-check-circle"></i></span>
          }
        </div>

        @if (!csv()) {
          <div class="drop-zone"
               [class.drag-over]="isDragging()"
               (dragover)="onDragOver($event)"
               (dragleave)="isDragging.set(false)"
               (drop)="onDrop($event)"
               (click)="csvInput.click()">
            <i class="ph ph-file-csv"></i>
            <p>Arrastra tu archivo CSV aquí o <strong>haz clic para seleccionar</strong></p>
            <span class="help-text">Debe contener al menos una columna con teléfonos</span>
            <input #csvInput type="file" accept=".csv,.txt" style="display: none" (change)="onCsvSelected($event)">
          </div>
        } @else {
          <div class="csv-preview">
            <div class="csv-info">
              <span class="file-name"><i class="ph ph-file-csv"></i> {{ csvFileName() }}</span>
              <span class="recipient-count">{{ csv()!.totalRows }} destinatarios</span>
              <button class="btn-icon" (click)="removeCsv()" title="Quitar CSV">
                <i class="ph ph-x-circle"></i>
              </button>
            </div>

            <div class="column-selectors">
              <div class="selector">
                <label>Columna de teléfono:</label>
                <select [(ngModel)]="selectedPhoneColumn" class="form-select">
                  @for (header of csv()!.headers; track $index) {
                    <option [value]="$index">{{ header }}</option>
                  }
                </select>
              </div>
              <div class="selector">
                <label>Columna de nombre (opcional):</label>
                <select [(ngModel)]="selectedNameColumn" class="form-select">
                  <option [value]="-1">— No usar —</option>
                  @for (header of csv()!.headers; track $index) {
                    <option [value]="$index">{{ header }}</option>
                  }
                </select>
              </div>
            </div>

            <div class="variable-chips">
              <span class="chip-label">Variables disponibles:</span>
              @if (selectedNameColumn >= 0) {
                <button class="chip" (click)="insertVariable('[name]')">[name]</button>
              }
              @for (header of getExtraVariables(); track header) {
                <button class="chip" (click)="insertVariable('[' + header + ']')">[{{ header }}]</button>
              }
            </div>

            <div class="preview-table-wrapper">
              <table class="preview-table">
                <thead>
                  <tr>
                    @for (header of csv()!.headers; track $index) {
                      <th [class.col-phone]="$index === +selectedPhoneColumn"
                          [class.col-name]="$index === +selectedNameColumn">
                        {{ header }}
                        @if ($index === +selectedPhoneColumn) { <i class="ph ph-phone" title="Teléfono"></i> }
                        @if ($index === +selectedNameColumn) { <i class="ph ph-user" title="Nombre"></i> }
                      </th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (row of csv()!.rows; track $index) {
                    <tr>
                      @for (cell of row; track $index) {
                        <td>{{ cell }}</td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            @if (csv()!.totalRows > 5) {
              <p class="more-rows">... y {{ csv()!.totalRows - 5 }} filas más</p>
            }
          </div>
        }
      </div>

      <!-- STEP 2: Message -->
      <div class="card">
        <div class="card-header">
          <span class="step-badge">2</span>
          <h3>Mensaje</h3>
          @if (messageContent().length > 0) {
            <span class="check-badge"><i class="ph-fill ph-check-circle"></i></span>
          }
        </div>
        <div class="message-section">
          <textarea #messageArea
                    [(ngModel)]="messageContentValue"
                    (ngModelChange)="messageContent.set($event)"
                    placeholder="Escribe tu mensaje aquí. Usa [name] para el nombre, [variable] para columnas del CSV..."
                    class="message-input"
                    rows="5"></textarea>
          <div class="message-footer">
            <span class="char-count">{{ messageContent().length }} caracteres</span>
          </div>

          @if (csv() && messageContent().length > 0 && csv()!.rows.length > 0) {
            <div class="live-preview">
              <strong>Vista previa (primer destinatario):</strong>
              <p class="preview-text">{{ getPreviewMessage() }}</p>
            </div>
          }
        </div>
      </div>

      <!-- STEP 3: Attachment -->
      <div class="card">
        <div class="card-header">
          <span class="step-badge">3</span>
          <h3>Adjunto (Opcional)</h3>
          @if (attachmentFile()) {
            <span class="check-badge"><i class="ph-fill ph-check-circle"></i></span>
          }
        </div>
        <div class="attachment-section">
          @if (!attachmentFile()) {
            <div class="attach-zone" (click)="attachInput.click()">
              <i class="ph ph-paperclip"></i>
              <p>Clic para adjuntar imagen, video o documento</p>
              <span class="help-text">Formatos: jpg, png, gif, mp4, pdf, doc, docx, xls, xlsx</span>
              <input #attachInput type="file"
                     accept=".jpg,.jpeg,.png,.gif,.mp4,.pdf,.doc,.docx,.xls,.xlsx"
                     style="display: none"
                     (change)="onAttachmentSelected($event)">
            </div>
          } @else {
            <div class="attachment-preview">
              @if (attachmentPreview()) {
                <img [src]="attachmentPreview()!" alt="Preview" class="thumb">
              } @else {
                <div class="file-icon">
                  <i [class]="getFileIcon(attachmentFile()!.name)"></i>
                </div>
              }
              <div class="attach-info">
                <span class="file-name">{{ attachmentFile()!.name }}</span>
                <span class="file-size">{{ formatSize(attachmentFile()!.size) }}</span>
              </div>
              <button class="btn-icon" (click)="removeAttachment()" title="Quitar adjunto">
                <i class="ph ph-x-circle"></i>
              </button>
            </div>
          }
        </div>
      </div>

      <!-- STEP 4: Agent Assignment (supervisors only) -->
      @if (isSupervisor()) {
        <div class="card">
          <div class="card-header">
            <span class="step-badge">4</span>
            <h3>Asignar Agente</h3>
            @if (selectedAgentId()) {
              <span class="check-badge"><i class="ph-fill ph-check-circle"></i></span>
            }
          </div>
          <div class="agent-section">
            @if (isLoadingAgents()) {
              <p class="help-text">Cargando agentes...</p>
            } @else if (assignableAgents().length === 0) {
              <p class="help-text">No hay agentes disponibles para asignar</p>
            } @else {
              <label>Selecciona el agente que ejecutará el envío:</label>
              <select [(ngModel)]="selectedAgentIdValue"
                      (ngModelChange)="onAgentSelected($event)"
                      class="form-select">
                <option [value]="0">— Seleccionar agente —</option>
                @for (agent of assignableAgents(); track agent.id) {
                  <option [value]="agent.id">{{ agent.name }} ({{ agent.email }})</option>
                }
              </select>
            }
          </div>
        </div>
      }

      <!-- STEP 5: Actions -->
      <div class="card">
        <div class="card-header">
          <span class="step-badge">{{ isSupervisor() ? '5' : '4' }}</span>
          <h3>Enviar</h3>
        </div>

        @if (!showConfirmation()) {
          <div class="action-section">
            <button class="btn btn-primary btn-lg"
                    (click)="prepare()"
                    [disabled]="!canPrepare()">
              <i class="ph ph-check-square"></i> Preparar Envío
            </button>
            @if (!canPrepare()) {
              <span class="help-text">
                {{ isSupervisor() ? 'Sube un CSV, escribe un mensaje y selecciona un agente para continuar' : 'Sube un CSV y escribe un mensaje para continuar' }}
              </span>
            }
          </div>
        } @else {
          <div class="confirmation-panel">
            <h4><i class="ph ph-info"></i> Confirmar Envío</h4>
            <div class="confirm-stats">
              <div class="stat">
                <span class="stat-label">Destinatarios</span>
                <span class="stat-value">{{ csv()!.totalRows }}</span>
              </div>
              @if (getSelectedAgentName()) {
                <div class="stat">
                  <span class="stat-label">Agente</span>
                  <span class="stat-value">{{ getSelectedAgentName() }}</span>
                </div>
              }
              @if (attachmentFile()) {
                <div class="stat">
                  <span class="stat-label">Adjunto</span>
                  <span class="stat-value">{{ attachmentFile()!.name }}</span>
                </div>
              }
            </div>

            <div class="preview-messages">
              <strong>Primeros mensajes:</strong>
              @for (msg of getPreviewMessages(3); track $index) {
                <div class="preview-msg">
                  <span class="preview-phone">{{ msg.phone }}</span>
                  <p>{{ msg.text }}</p>
                </div>
              }
            </div>

            <div class="confirm-actions">
              <button class="btn btn-outline" (click)="showConfirmation.set(false)">
                <i class="ph ph-arrow-left"></i> Editar
              </button>
              <button class="btn btn-success btn-lg" (click)="send()" [disabled]="isSending()">
                @if (isSending()) {
                  <i class="ph ph-spinner ph-spin"></i> Enviando...
                } @else {
                  <i class="ph ph-paper-plane-tilt"></i> Iniciar Envío
                }
              </button>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .envio-create-container { padding: var(--space-6); max-width: 800px; margin: 0 auto; }
    .page-header { margin-bottom: var(--space-6); }
    .back-link {
      display: inline-flex; align-items: center; gap: var(--space-1);
      color: var(--fg-muted); text-decoration: none; font-size: var(--text-base); margin-bottom: var(--space-2);
      &:hover { color: var(--accent-default); }
    }
    .page-header h1 { font-size: var(--text-2xl); font-weight: var(--font-semibold); margin: 0; color: var(--fg-default); }
    .subtitle { font-size: var(--text-base); color: var(--fg-muted); margin: var(--space-1) 0 0; }

    .error-panel {
      background: var(--error-subtle); border: 1px solid var(--error-default); border-radius: var(--radius-lg);
      padding: var(--space-3) var(--space-4); margin-bottom: var(--space-4);
      p { margin: 0; font-size: var(--text-base); color: var(--error-text); }
    }

    .card {
      background: var(--card-bg); border: 1px solid var(--card-border); border-radius: var(--radius-xl);
      margin-bottom: var(--space-4); overflow: hidden;
    }
    .card-header {
      display: flex; align-items: center; gap: var(--space-3); padding: var(--space-4) var(--space-5);
      border-bottom: 1px solid var(--border-muted);
      h3 { margin: 0; font-size: var(--text-lg); font-weight: var(--font-semibold); flex: 1; color: var(--fg-default); }
    }
    .step-badge {
      width: 28px; height: 28px; border-radius: 50%; background: var(--accent-default); color: white;
      display: flex; align-items: center; justify-content: center; font-size: var(--text-base); font-weight: var(--font-semibold); flex-shrink: 0;
    }
    .check-badge { color: var(--success-default); font-size: 22px; }

    .drop-zone {
      margin: var(--space-5); padding: 40px; border: 2px dashed var(--border-default); border-radius: var(--radius-xl);
      text-align: center; cursor: pointer; transition: all var(--duration-normal);
      i { font-size: 48px; color: var(--accent-default); }
      &:hover, &.drag-over { border-color: var(--accent-default); background: var(--accent-subtle); }
      p { margin: var(--space-2) 0 0; font-size: var(--text-base); color: var(--fg-muted); }
      .help-text { font-size: var(--text-sm); color: var(--fg-subtle); }
    }

    .csv-preview { padding: var(--space-4) var(--space-5); }
    .csv-info {
      display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-3);
      .file-name { font-weight: var(--font-medium); display: flex; align-items: center; gap: var(--space-1); color: var(--fg-default); }
      .recipient-count { color: var(--accent-default); font-weight: var(--font-semibold); font-size: var(--text-base); }
    }
    .column-selectors {
      display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); margin-bottom: var(--space-3);
      .selector { label { font-size: var(--text-sm); font-weight: var(--font-medium); margin-bottom: var(--space-1); display: block; color: var(--fg-default); } }
    }
    .form-select {
      width: 100%; padding: var(--space-2) var(--space-3); border: 1px solid var(--input-border); border-radius: var(--radius-lg);
      font-size: var(--text-base); background: var(--input-bg); color: var(--fg-default);
      &:focus { outline: none; border-color: var(--input-border-focus); box-shadow: 0 0 0 3px var(--accent-subtle); }
    }
    .variable-chips {
      display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; margin-bottom: var(--space-3);
      .chip-label { font-size: var(--text-sm); color: var(--fg-muted); }
    }
    .chip {
      display: inline-block; padding: 4px 10px; background: var(--accent-subtle); color: var(--accent-emphasis);
      border-radius: var(--radius-full); font-size: var(--text-sm); font-family: var(--font-mono); cursor: pointer;
      border: 1px solid transparent; transition: all var(--duration-normal);
      &:hover { background: var(--accent-default); color: white; }
    }

    .preview-table-wrapper { overflow-x: auto; margin-bottom: var(--space-2); }
    .preview-table {
      width: 100%; border-collapse: collapse; font-size: var(--text-sm);
      th, td { padding: var(--space-2) var(--space-3); text-align: left; border: 1px solid var(--border-muted); color: var(--fg-default); }
      th { background: var(--table-header-bg); font-weight: var(--font-semibold); font-size: var(--text-sm); text-transform: uppercase; color: var(--fg-muted); }
      .col-phone { background: var(--success-subtle); }
      .col-name { background: var(--accent-subtle); }
      th i { margin-left: var(--space-1); }
    }
    .more-rows { font-size: var(--text-sm); color: var(--fg-subtle); text-align: center; margin: var(--space-1) 0 0; }

    .message-section { padding: var(--space-4) var(--space-5); }
    .message-input {
      width: 100%; padding: var(--space-3) var(--space-4); border: 1px solid var(--input-border); border-radius: var(--radius-lg);
      font-size: var(--text-base); font-family: inherit; resize: vertical; box-sizing: border-box;
      background: var(--input-bg); color: var(--fg-default);
      &::placeholder { color: var(--fg-subtle); }
      &:focus { outline: none; border-color: var(--input-border-focus); box-shadow: 0 0 0 3px var(--accent-subtle); }
    }
    .message-footer {
      display: flex; justify-content: flex-end; margin-top: var(--space-1);
      .char-count { font-size: var(--text-sm); color: var(--fg-subtle); }
    }
    .live-preview {
      margin-top: var(--space-3); padding: var(--space-3); background: var(--success-subtle); border-radius: var(--radius-lg); border: 1px solid var(--success-default);
      strong { font-size: var(--text-sm); color: var(--success-text); }
      .preview-text { margin: var(--space-1) 0 0; font-size: var(--text-base); color: var(--fg-default); white-space: pre-wrap; }
    }

    .attachment-section { padding: var(--space-4) var(--space-5); }
    .attach-zone {
      padding: var(--space-6); border: 2px dashed var(--border-default); border-radius: var(--radius-xl);
      text-align: center; cursor: pointer; transition: all var(--duration-normal);
      i { font-size: 32px; color: var(--fg-muted); }
      &:hover { border-color: var(--accent-default); background: var(--accent-subtle); }
      p { margin: var(--space-2) 0 0; font-size: var(--text-base); color: var(--fg-muted); }
      .help-text { font-size: var(--text-sm); color: var(--fg-subtle); }
    }
    .attachment-preview {
      display: flex; align-items: center; gap: var(--space-3);
      .thumb { width: 60px; height: 60px; object-fit: cover; border-radius: var(--radius-lg); }
      .file-icon {
        width: 60px; height: 60px; border-radius: var(--radius-lg); background: var(--accent-subtle);
        display: flex; align-items: center; justify-content: center;
        i { font-size: 28px; color: var(--accent-default); }
      }
      .attach-info { flex: 1; .file-name { display: block; font-weight: var(--font-medium); color: var(--fg-default); } .file-size { font-size: var(--text-sm); color: var(--fg-subtle); } }
    }

    .agent-section {
      padding: var(--space-4) var(--space-5);
      label { font-size: var(--text-base); font-weight: var(--font-medium); margin-bottom: var(--space-2); display: block; color: var(--fg-default); }
    }

    .action-section { padding: var(--space-5); text-align: center; }
    .confirmation-panel { padding: var(--space-5); }
    .confirmation-panel h4 {
      display: flex; align-items: center; gap: var(--space-2); margin: 0 0 var(--space-4); font-size: var(--text-xl); color: var(--fg-default);
      i { color: var(--accent-default); }
    }
    .confirm-stats {
      display: flex; gap: var(--space-6); margin-bottom: var(--space-4);
      .stat { .stat-label { font-size: var(--text-sm); color: var(--fg-subtle); display: block; } .stat-value { font-size: 20px; font-weight: 700; color: var(--accent-default); } }
    }
    .preview-messages {
      margin-bottom: var(--space-4);
      strong { font-size: var(--text-base); display: block; margin-bottom: var(--space-2); color: var(--fg-default); }
    }
    .preview-msg {
      background: var(--bg-subtle); border-radius: var(--radius-lg); padding: 10px 14px; margin-bottom: var(--space-2);
      .preview-phone { font-size: var(--text-sm); color: var(--accent-default); font-weight: var(--font-semibold); }
      p { margin: var(--space-1) 0 0; font-size: var(--text-sm); white-space: pre-wrap; color: var(--fg-default); }
    }
    .confirm-actions { display: flex; justify-content: flex-end; gap: var(--space-2); }

    .btn {
      display: inline-flex; align-items: center; gap: 6px; padding: 10px 20px;
      border: none; border-radius: var(--radius-lg); font-size: var(--text-base); font-weight: var(--font-medium);
      cursor: pointer; text-decoration: none; transition: all var(--duration-normal);
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }
    .btn-lg { padding: 12px 28px; font-size: var(--text-lg); }
    .btn-primary { background: var(--accent-default); color: white; &:hover:not(:disabled) { background: var(--accent-emphasis); } }
    .btn-success { background: var(--success-default); color: white; &:hover:not(:disabled) { filter: brightness(0.85); } }
    .btn-outline { background: var(--card-bg); color: var(--accent-default); border: 1px solid var(--accent-default); &:hover { background: var(--accent-subtle); } }
    .btn-icon { background: none; border: none; cursor: pointer; font-size: 22px; color: var(--fg-subtle); &:hover { color: var(--error-default); } }
    .help-text { font-size: var(--text-sm); color: var(--fg-subtle); display: block; margin-top: var(--space-1); }

    .ph-spin { animation: spin 1s linear infinite; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

    @media (max-width: 768px) {
      .column-selectors { grid-template-columns: 1fr; }
    }
  `]
})
export class EnvioCreateComponent implements OnDestroy {
  private bulkSendService = inject(BulkSendService);
  private electronService = inject(ElectronService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private destroy$ = new Subject<void>();

  // State
  csv = signal<ParsedCsv | null>(null);
  csvFile = signal<File | null>(null);
  csvFileName = signal('');
  isDragging = signal(false);
  messageContent = signal('');
  messageContentValue = '';
  attachmentFile = signal<File | null>(null);
  attachmentPreview = signal<string | null>(null);
  showConfirmation = signal(false);
  isSending = signal(false);
  errors = signal<string[]>([]);
  selectedPhoneColumn = 0;
  selectedNameColumn = -1;

  // Agent assignment
  assignableAgents = signal<AssignableAgent[]>([]);
  isLoadingAgents = signal(false);
  selectedAgentId = signal<number>(0);
  selectedAgentIdValue = 0;

  constructor() {
    if (this.isSupervisor()) {
      this.loadAssignableAgents();
    }
  }

  isSupervisor(): boolean {
    const user = this.authService.currentUser();
    if (!user) return false;
    return RoleUtils.isAdmin(user.role) || RoleUtils.isManager(user.role);
  }

  private loadAssignableAgents(): void {
    this.isLoadingAgents.set(true);
    this.bulkSendService.getAssignableAgents().pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (res) => {
        this.assignableAgents.set(res.agents);
        this.isLoadingAgents.set(false);
      },
      error: () => this.isLoadingAgents.set(false)
    });
  }

  onAgentSelected(value: string | number): void {
    const id = +value;
    this.selectedAgentId.set(id);
  }

  getSelectedAgentName(): string {
    const id = this.selectedAgentId();
    if (!id) return '';
    const agent = this.assignableAgents().find(a => a.id === id);
    return agent?.name || '';
  }

  ngOnDestroy(): void {
    this.attachmentPreview.set(null);
    this.destroy$.next();
    this.destroy$.complete();
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(true);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
    const file = event.dataTransfer?.files[0];
    if (file && (file.name.endsWith('.csv') || file.name.endsWith('.txt'))) {
      this.processCsvFile(file);
    }
  }

  onCsvSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.[0]) {
      this.processCsvFile(input.files[0]);
    }
  }

  private processCsvFile(file: File): void {
    this.csvFile.set(file);
    this.csvFileName.set(file.name);
    this.errors.set([]);

    this.bulkSendService.previewCsv(file).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (res) => {
        if (res.error) {
          this.errors.set([res.error]);
          return;
        }
        this.csv.set({
          headers: res.headers,
          rows: res.preview_rows,
          totalRows: res.total_rows,
          phoneColumn: res.phone_column,
          nameColumn: res.name_column
        });
        this.selectedPhoneColumn = res.phone_column >= 0 ? res.phone_column : 0;
        this.selectedNameColumn = res.name_column;
      },
      error: (err) => {
        this.errors.set([err.error?.error || 'Error al procesar CSV']);
      }
    });
  }

  removeCsv(): void {
    this.csv.set(null);
    this.csvFile.set(null);
    this.csvFileName.set('');
    this.selectedPhoneColumn = 0;
    this.selectedNameColumn = -1;
  }

  getExtraVariables(): string[] {
    const csv = this.csv();
    if (!csv) return [];
    return csv.headers
      .filter((_, i) => i !== +this.selectedPhoneColumn && i !== +this.selectedNameColumn)
      .map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  }

  insertVariable(variable: string): void {
    this.messageContentValue += variable;
    this.messageContent.set(this.messageContentValue);
  }

  getPreviewMessage(): string {
    const csv = this.csv();
    if (!csv || csv.rows.length === 0) return '';
    const row = csv.rows[0];
    let msg = this.messageContent();

    if (this.selectedNameColumn >= 0 && this.selectedNameColumn < row.length) {
      msg = msg.replace(/\[name\]/g, row[this.selectedNameColumn]);
    }
    msg = msg.replace(/\[phone\]/g, row[+this.selectedPhoneColumn] || '');

    csv.headers.forEach((header, i) => {
      if (i !== +this.selectedPhoneColumn && i !== +this.selectedNameColumn && i < row.length) {
        const varName = header.trim().toLowerCase().replace(/\s+/g, '_');
        msg = msg.replace(new RegExp('\\[' + varName + '\\]', 'g'), row[i]);
      }
    });
    return msg;
  }

  getPreviewMessages(count: number): { phone: string; text: string }[] {
    const csv = this.csv();
    if (!csv) return [];
    return csv.rows.slice(0, count).map(row => {
      let msg = this.messageContent();
      if (this.selectedNameColumn >= 0 && this.selectedNameColumn < row.length) {
        msg = msg.replace(/\[name\]/g, row[this.selectedNameColumn]);
      }
      msg = msg.replace(/\[phone\]/g, row[+this.selectedPhoneColumn] || '');
      csv.headers.forEach((header, i) => {
        if (i !== +this.selectedPhoneColumn && i !== +this.selectedNameColumn && i < row.length) {
          const varName = header.trim().toLowerCase().replace(/\s+/g, '_');
          msg = msg.replace(new RegExp('\\[' + varName + '\\]', 'g'), row[i]);
        }
      });
      return { phone: row[+this.selectedPhoneColumn] || '', text: msg };
    });
  }

  // Attachment
  onAttachmentSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.[0]) {
      const file = input.files[0];
      this.attachmentFile.set(file);
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => this.attachmentPreview.set(e.target?.result as string);
        reader.readAsDataURL(file);
      } else {
        this.attachmentPreview.set(null);
      }
    }
  }

  removeAttachment(): void {
    this.attachmentFile.set(null);
    this.attachmentPreview.set(null);
  }

  getFileIcon(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return 'ph ph-file-pdf';
    if (['doc', 'docx'].includes(ext || '')) return 'ph ph-file-doc';
    if (['xls', 'xlsx'].includes(ext || '')) return 'ph ph-file-xls';
    if (ext === 'mp4') return 'ph ph-file-video';
    return 'ph ph-file';
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  canPrepare(): boolean {
    const hasBasics = !!this.csv() && this.messageContent().length > 0;
    if (this.isSupervisor()) {
      return hasBasics && this.selectedAgentId() > 0;
    }
    return hasBasics;
  }

  prepare(): void {
    this.errors.set([]);
    if (!this.csv() || this.messageContent().length === 0) {
      this.errors.set(['Sube un CSV y escribe un mensaje']);
      return;
    }
    this.showConfirmation.set(true);
  }

  send(): void {
    const file = this.csvFile();
    if (!file) return;

    this.isSending.set(true);
    this.errors.set([]);

    const agentId = this.isSupervisor() ? this.selectedAgentId() || undefined : undefined;

    this.bulkSendService.createFromCsv(
      file,
      this.messageContent(),
      +this.selectedPhoneColumn,
      +this.selectedNameColumn,
      this.attachmentFile() || undefined,
      agentId
    ).pipe(takeUntil(this.destroy$)).subscribe({
      next: async (res) => {
        this.toast.success('Envío masivo creado');
        const bulkSendId = res.bulk_send.id;
        const currentUserId = this.authService.currentUser()?.id;
        const assignedToSelf = !agentId || agentId === currentUserId;

        // Auto-start via Electron only if assigned to self
        if (assignedToSelf && this.electronService.isElectron) {
          const token = this.authService.getToken();
          if (token) {
            const started = await this.electronService.startBulkSend(bulkSendId, token);
            if (started) {
              this.toast.success('Envío masivo iniciado automáticamente');
            }
          }
        }

        this.isSending.set(false);
        this.attachmentPreview.set(null);
        this.router.navigate(['/app/bulk_sends', bulkSendId]);
      },
      error: (err) => {
        this.isSending.set(false);
        this.errors.set([err.error?.error || err.error?.message || 'Error al crear envío']);
      }
    });
  }
}
