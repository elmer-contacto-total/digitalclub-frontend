import { Component, inject, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { BulkSendService, CsvPreviewResponse } from '../../../../core/services/bulk-send.service';
import { ElectronService } from '../../../../core/services/electron.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../core/services/toast.service';
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
          <i class="ph-arrow-left"></i> Volver a envíos
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
            <span class="check-badge"><i class="ph-check-circle-fill"></i></span>
          }
        </div>

        @if (!csv()) {
          <div class="drop-zone"
               [class.drag-over]="isDragging()"
               (dragover)="onDragOver($event)"
               (dragleave)="isDragging.set(false)"
               (drop)="onDrop($event)"
               (click)="csvInput.click()">
            <i class="ph-file-csv" style="font-size: 48px; color: #4361ee;"></i>
            <p>Arrastra tu archivo CSV aquí o <strong>haz clic para seleccionar</strong></p>
            <span class="help-text">Debe contener al menos una columna con teléfonos</span>
            <input #csvInput type="file" accept=".csv,.txt" style="display: none" (change)="onCsvSelected($event)">
          </div>
        } @else {
          <div class="csv-preview">
            <div class="csv-info">
              <span class="file-name"><i class="ph-file-csv"></i> {{ csvFileName() }}</span>
              <span class="recipient-count">{{ csv()!.totalRows }} destinatarios</span>
              <button class="btn-icon" (click)="removeCsv()" title="Quitar CSV">
                <i class="ph-x-circle"></i>
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
                        @if ($index === +selectedPhoneColumn) { <i class="ph-phone" title="Teléfono"></i> }
                        @if ($index === +selectedNameColumn) { <i class="ph-user" title="Nombre"></i> }
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
            <span class="check-badge"><i class="ph-check-circle-fill"></i></span>
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
            <span class="check-badge"><i class="ph-check-circle-fill"></i></span>
          }
        </div>
        <div class="attachment-section">
          @if (!attachmentFile()) {
            <div class="attach-zone" (click)="attachInput.click()">
              <i class="ph-paperclip" style="font-size: 32px; color: #6c757d;"></i>
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
                <i class="ph-x-circle"></i>
              </button>
            </div>
          }
        </div>
      </div>

      <!-- STEP 4: Actions -->
      <div class="card">
        <div class="card-header">
          <span class="step-badge">4</span>
          <h3>Enviar</h3>
        </div>

        @if (!showConfirmation()) {
          <div class="action-section">
            <button class="btn btn-primary btn-lg"
                    (click)="prepare()"
                    [disabled]="!canPrepare()">
              <i class="ph-check-square"></i> Preparar Envío
            </button>
            @if (!canPrepare()) {
              <span class="help-text">Sube un CSV y escribe un mensaje para continuar</span>
            }
          </div>
        } @else {
          <div class="confirmation-panel">
            <h4><i class="ph-info"></i> Confirmar Envío</h4>
            <div class="confirm-stats">
              <div class="stat">
                <span class="stat-label">Destinatarios</span>
                <span class="stat-value">{{ csv()!.totalRows }}</span>
              </div>
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
                <i class="ph-arrow-left"></i> Editar
              </button>
              <button class="btn btn-success btn-lg" (click)="send()" [disabled]="isSending()">
                @if (isSending()) {
                  <i class="ph-spinner ph-spin"></i> Enviando...
                } @else {
                  <i class="ph-paper-plane-tilt"></i> Iniciar Envío
                }
              </button>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .envio-create-container { padding: 24px; max-width: 800px; margin: 0 auto; }
    .page-header { margin-bottom: 24px; }
    .back-link {
      display: inline-flex; align-items: center; gap: 4px;
      color: #6c757d; text-decoration: none; font-size: 14px; margin-bottom: 8px;
      &:hover { color: #4361ee; }
    }
    .page-header h1 { font-size: 24px; font-weight: 600; margin: 0; color: #1a1a2e; }
    .subtitle { font-size: 14px; color: #6c757d; margin: 4px 0 0; }

    .error-panel {
      background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 8px;
      padding: 12px 16px; margin-bottom: 16px;
      p { margin: 0; font-size: 14px; color: #721c24; }
    }

    .card {
      background: white; border: 1px solid #e9ecef; border-radius: 12px;
      margin-bottom: 16px; overflow: hidden;
    }
    .card-header {
      display: flex; align-items: center; gap: 12px; padding: 16px 20px;
      border-bottom: 1px solid #f0f0f0;
      h3 { margin: 0; font-size: 16px; font-weight: 600; flex: 1; }
    }
    .step-badge {
      width: 28px; height: 28px; border-radius: 50%; background: #4361ee; color: white;
      display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600;
    }
    .check-badge { color: #10b981; font-size: 22px; }

    .drop-zone {
      margin: 20px; padding: 40px; border: 2px dashed #dee2e6; border-radius: 12px;
      text-align: center; cursor: pointer; transition: all 0.2s;
      &:hover, &.drag-over { border-color: #4361ee; background: #f0f3ff; }
      p { margin: 8px 0 0; font-size: 14px; color: #495057; }
      .help-text { font-size: 12px; color: #999; }
    }

    .csv-preview { padding: 16px 20px; }
    .csv-info {
      display: flex; align-items: center; gap: 12px; margin-bottom: 12px;
      .file-name { font-weight: 500; display: flex; align-items: center; gap: 4px; }
      .recipient-count { color: #4361ee; font-weight: 600; font-size: 14px; }
    }
    .column-selectors {
      display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;
      .selector { label { font-size: 13px; font-weight: 500; margin-bottom: 4px; display: block; } }
    }
    .form-select {
      width: 100%; padding: 8px 12px; border: 1px solid #dee2e6; border-radius: 8px;
      font-size: 14px; background: white;
      &:focus { outline: none; border-color: #4361ee; }
    }
    .variable-chips {
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px;
      .chip-label { font-size: 13px; color: #6c757d; }
    }
    .chip {
      display: inline-block; padding: 4px 10px; background: #e8ecff; color: #4361ee;
      border-radius: 12px; font-size: 12px; font-family: monospace; cursor: pointer;
      border: 1px solid transparent; transition: all 0.2s;
      &:hover { background: #4361ee; color: white; }
    }

    .preview-table-wrapper { overflow-x: auto; margin-bottom: 8px; }
    .preview-table {
      width: 100%; border-collapse: collapse; font-size: 13px;
      th, td { padding: 8px 12px; text-align: left; border: 1px solid #e9ecef; }
      th { background: #f8f9fa; font-weight: 600; font-size: 12px; text-transform: uppercase; }
      .col-phone { background: #e8f5e9; }
      .col-name { background: #e3f2fd; }
      th i { margin-left: 4px; }
    }
    .more-rows { font-size: 12px; color: #999; text-align: center; margin: 4px 0 0; }

    .message-section { padding: 16px 20px; }
    .message-input {
      width: 100%; padding: 12px 14px; border: 1px solid #dee2e6; border-radius: 8px;
      font-size: 14px; font-family: inherit; resize: vertical; box-sizing: border-box;
      &:focus { outline: none; border-color: #4361ee; box-shadow: 0 0 0 3px rgba(67,97,238,0.1); }
    }
    .message-footer {
      display: flex; justify-content: flex-end; margin-top: 4px;
      .char-count { font-size: 12px; color: #999; }
    }
    .live-preview {
      margin-top: 12px; padding: 12px; background: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0;
      strong { font-size: 13px; color: #166534; }
      .preview-text { margin: 4px 0 0; font-size: 14px; color: #333; white-space: pre-wrap; }
    }

    .attachment-section { padding: 16px 20px; }
    .attach-zone {
      padding: 24px; border: 2px dashed #dee2e6; border-radius: 12px;
      text-align: center; cursor: pointer; transition: all 0.2s;
      &:hover { border-color: #4361ee; background: #f0f3ff; }
      p { margin: 8px 0 0; font-size: 14px; color: #495057; }
      .help-text { font-size: 12px; color: #999; }
    }
    .attachment-preview {
      display: flex; align-items: center; gap: 12px;
      .thumb { width: 60px; height: 60px; object-fit: cover; border-radius: 8px; }
      .file-icon {
        width: 60px; height: 60px; border-radius: 8px; background: #f0f3ff;
        display: flex; align-items: center; justify-content: center;
        i { font-size: 28px; color: #4361ee; }
      }
      .attach-info { flex: 1; .file-name { display: block; font-weight: 500; } .file-size { font-size: 12px; color: #999; } }
    }

    .action-section { padding: 20px; text-align: center; }
    .confirmation-panel { padding: 20px; }
    .confirmation-panel h4 {
      display: flex; align-items: center; gap: 8px; margin: 0 0 16px; font-size: 18px; color: #1a1a2e;
      i { color: #4361ee; }
    }
    .confirm-stats {
      display: flex; gap: 24px; margin-bottom: 16px;
      .stat { .stat-label { font-size: 12px; color: #999; display: block; } .stat-value { font-size: 20px; font-weight: 700; color: #4361ee; } }
    }
    .preview-messages {
      margin-bottom: 16px;
      strong { font-size: 14px; display: block; margin-bottom: 8px; }
    }
    .preview-msg {
      background: #f8f9fa; border-radius: 8px; padding: 10px 14px; margin-bottom: 8px;
      .preview-phone { font-size: 12px; color: #4361ee; font-weight: 600; }
      p { margin: 4px 0 0; font-size: 13px; white-space: pre-wrap; }
    }
    .confirm-actions { display: flex; justify-content: flex-end; gap: 8px; }

    .btn {
      display: inline-flex; align-items: center; gap: 6px; padding: 10px 20px;
      border: none; border-radius: 8px; font-size: 14px; font-weight: 500;
      cursor: pointer; text-decoration: none; transition: all 0.2s;
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }
    .btn-lg { padding: 12px 28px; font-size: 16px; }
    .btn-primary { background: #4361ee; color: white; &:hover:not(:disabled) { background: #3a56d4; } }
    .btn-success { background: #10b981; color: white; &:hover:not(:disabled) { background: #059669; } }
    .btn-outline { background: white; color: #4361ee; border: 1px solid #4361ee; &:hover { background: #f0f3ff; } }
    .btn-icon { background: none; border: none; cursor: pointer; font-size: 22px; color: #999; &:hover { color: #e74c3c; } }
    .help-text { font-size: 12px; color: #999; display: block; margin-top: 4px; }

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

  ngOnDestroy(): void {
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
    if (ext === 'pdf') return 'ph-file-pdf';
    if (['doc', 'docx'].includes(ext || '')) return 'ph-file-doc';
    if (['xls', 'xlsx'].includes(ext || '')) return 'ph-file-xls';
    if (ext === 'mp4') return 'ph-file-video';
    return 'ph-file';
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  canPrepare(): boolean {
    return !!this.csv() && this.messageContent().length > 0;
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

    this.bulkSendService.createFromCsv(
      file,
      this.messageContent(),
      +this.selectedPhoneColumn,
      +this.selectedNameColumn,
      this.attachmentFile() || undefined
    ).pipe(takeUntil(this.destroy$)).subscribe({
      next: async (res) => {
        this.toast.success('Envío masivo creado');
        const bulkSendId = res.bulk_send.id;

        // Start via Electron if available
        if (this.electronService.isElectron) {
          const token = this.authService.getToken();
          if (token) {
            await this.electronService.startBulkSend(bulkSendId, token);
          }
        }

        this.router.navigate(['/app/bulk_sends', bulkSendId]);
      },
      error: (err) => {
        this.isSending.set(false);
        this.errors.set([err.error?.error || err.error?.message || 'Error al crear envío']);
      }
    });
  }
}
