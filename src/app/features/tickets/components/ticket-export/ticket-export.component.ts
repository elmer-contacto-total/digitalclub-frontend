/**
 * Ticket Export Component
 * PARIDAD: Rails admin/tickets/export.html.erb
 */
import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TicketService } from '../../../chat/services/ticket.service';
import { UserService } from '../../../../core/services/user.service';
import { UserListItem, UserRole } from '../../../../core/models/user.model';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-ticket-export',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, LoadingSpinnerComponent],
  template: `
    <div class="ticket-export-container">
      <div class="page-header">
        <div class="header-left">
          <a routerLink="/app/tickets" class="back-link">
            <i class="ph ph-arrow-left"></i>
            Volver a Tickets
          </a>
          <h1>Exportar Transcripts de Tickets</h1>
          <p class="subtitle">Genera un archivo ZIP con las transcripciones de tickets</p>
        </div>
      </div>

      <div class="export-card">
        <div class="card-header">
          <i class="ph ph-file-zip"></i>
          <h2>Configurar Exportación</h2>
        </div>

        <div class="export-form">
          <div class="form-row">
            <div class="form-group">
              <label>Estado</label>
              <select [(ngModel)]="exportParams.status">
                <option value="all">Todos</option>
                <option value="open">Abiertos</option>
                <option value="closed">Cerrados</option>
              </select>
            </div>

            <div class="form-group">
              <label>Agente</label>
              <select [(ngModel)]="exportParams.agentId">
                <option value="">Todos los agentes</option>
                @for (agent of agents(); track agent.id) {
                  <option [value]="agent.id">{{ agent.firstName }} {{ agent.lastName }}</option>
                }
              </select>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Fecha Desde</label>
              <input type="date" [(ngModel)]="exportParams.dateFrom" />
            </div>

            <div class="form-group">
              <label>Fecha Hasta</label>
              <input type="date" [(ngModel)]="exportParams.dateTo" />
            </div>
          </div>

          <div class="export-info">
            <i class="ph ph-info"></i>
            <div class="info-content">
              <p><strong>Formato de exportación:</strong> ZIP con archivos TXT</p>
              <p>Cada ticket se exportará como un archivo de texto con el formato:</p>
              <code>ticket_[ID]_[cliente]_[fecha].txt</code>
            </div>
          </div>

          <div class="form-actions">
            <button
              class="btn btn-primary btn-lg"
              (click)="exportTickets()"
              [disabled]="isExporting()"
            >
              @if (isExporting()) {
                <i class="ph ph-spinner ph-spin"></i>
                Generando ZIP...
              } @else {
                <i class="ph ph-download-simple"></i>
                Descargar Transcripts
              }
            </button>
          </div>
        </div>
      </div>

      <div class="recent-exports">
        <h3>Contenido del Export</h3>
        <p class="help-text">El archivo ZIP incluirá:</p>
        <ul class="export-contents">
          <li>
            <i class="ph ph-file-text"></i>
            <div>
              <strong>Transcripciones individuales</strong>
              <span>Un archivo por ticket con todos los mensajes</span>
            </div>
          </li>
          <li>
            <i class="ph ph-user"></i>
            <div>
              <strong>Información del cliente</strong>
              <span>Nombre, teléfono y datos de contacto</span>
            </div>
          </li>
          <li>
            <i class="ph ph-clock"></i>
            <div>
              <strong>Timestamps</strong>
              <span>Fecha y hora de cada mensaje</span>
            </div>
          </li>
          <li>
            <i class="ph ph-chat-circle"></i>
            <div>
              <strong>Dirección del mensaje</strong>
              <span>Indicador de entrada/salida</span>
            </div>
          </li>
        </ul>
      </div>
    </div>
  `,
  styles: [`
    .ticket-export-container { padding: 24px; max-width: 800px; margin: 0 auto; }

    .page-header { margin-bottom: 32px; }
    .back-link { display: flex; align-items: center; gap: 8px; color: var(--text-secondary); text-decoration: none; font-size: 14px; margin-bottom: 16px; }
    .back-link:hover { color: var(--primary-color); }
    .page-header h1 { margin: 0 0 8px 0; font-size: 28px; font-weight: 600; }
    .subtitle { margin: 0; color: var(--text-secondary); font-size: 16px; }

    .export-card { background: white; border-radius: 16px; border: 1px solid var(--border-color); overflow: hidden; margin-bottom: 32px; }
    .card-header { display: flex; align-items: center; gap: 12px; padding: 20px 24px; background: var(--bg-secondary); border-bottom: 1px solid var(--border-color); }
    .card-header i { font-size: 24px; color: var(--primary-color); }
    .card-header h2 { margin: 0; font-size: 18px; font-weight: 600; }

    .export-form { padding: 24px; }

    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }

    .form-group { display: flex; flex-direction: column; gap: 8px; }
    .form-group label { font-size: 14px; font-weight: 500; color: var(--text-primary); }
    .form-group select,
    .form-group input { padding: 12px 14px; border: 1px solid var(--border-color); border-radius: 8px; font-size: 14px; background: white; }
    .form-group select:focus,
    .form-group input:focus { outline: none; border-color: var(--primary-color); }

    .export-info { display: flex; gap: 14px; padding: 16px; background: #eff6ff; border-radius: 10px; margin-bottom: 24px; }
    .export-info > i { font-size: 24px; color: #3b82f6; flex-shrink: 0; }
    .info-content p { margin: 0 0 8px 0; font-size: 14px; color: #1e40af; }
    .info-content p:last-child { margin-bottom: 0; }
    .info-content code { display: inline-block; padding: 4px 10px; background: #dbeafe; border-radius: 6px; font-size: 13px; color: #1e40af; margin-top: 4px; }

    .form-actions { display: flex; justify-content: center; }

    .btn { display: inline-flex; align-items: center; gap: 10px; padding: 12px 24px; border-radius: 10px; font-size: 15px; font-weight: 500; cursor: pointer; border: none; transition: all 0.2s; }
    .btn-primary { background: var(--primary-color); color: white; }
    .btn-primary:hover { background: var(--primary-hover); }
    .btn-primary:disabled { background: #9ca3af; cursor: not-allowed; }
    .btn-lg { padding: 14px 32px; font-size: 16px; }

    .recent-exports { background: white; border-radius: 16px; border: 1px solid var(--border-color); padding: 24px; }
    .recent-exports h3 { margin: 0 0 8px 0; font-size: 18px; font-weight: 600; }
    .help-text { margin: 0 0 20px 0; color: var(--text-secondary); font-size: 14px; }

    .export-contents { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 16px; }
    .export-contents li { display: flex; align-items: flex-start; gap: 14px; padding: 16px; background: var(--bg-secondary); border-radius: 10px; }
    .export-contents li i { font-size: 24px; color: var(--primary-color); flex-shrink: 0; }
    .export-contents li div { display: flex; flex-direction: column; gap: 4px; }
    .export-contents li strong { font-size: 14px; }
    .export-contents li span { font-size: 13px; color: var(--text-secondary); }

    .ph-spin { animation: spin 1s linear infinite; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

    @media (max-width: 640px) {
      .form-row { grid-template-columns: 1fr; }
    }
  `]
})
export class TicketExportComponent implements OnInit {
  private ticketService = inject(TicketService);
  private userService = inject(UserService);

  agents = signal<UserListItem[]>([]);
  isExporting = signal(false);

  exportParams = {
    status: 'all' as 'all' | 'open' | 'closed',
    agentId: '',
    dateFrom: '',
    dateTo: ''
  };

  ngOnInit(): void {
    this.loadAgents();
    this.setDefaultDates();
  }

  loadAgents(): void {
    // Get internal users and filter for agents
    this.userService.getInternalUsers({ pageSize: 1000 }).subscribe({
      next: (response) => {
        const agentUsers = response.data.filter(u => u.role === UserRole.AGENT);
        this.agents.set(agentUsers);
      }
    });
  }

  setDefaultDates(): void {
    // Default to last 30 days
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);

    this.exportParams.dateTo = today.toISOString().split('T')[0];
    this.exportParams.dateFrom = thirtyDaysAgo.toISOString().split('T')[0];
  }

  exportTickets(): void {
    this.isExporting.set(true);

    this.ticketService.exportTranscripts({
      status: this.exportParams.status,
      agentId: this.exportParams.agentId ? parseInt(this.exportParams.agentId, 10) : undefined,
      dateFrom: this.exportParams.dateFrom || undefined,
      dateTo: this.exportParams.dateTo || undefined
    }).subscribe({
      next: (blob) => {
        // Download the file
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ticket_transcripts_${new Date().toISOString().split('T')[0]}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        this.isExporting.set(false);
      },
      error: (err) => {
        console.error('Error exporting tickets:', err);
        this.isExporting.set(false);
      }
    });
  }
}
