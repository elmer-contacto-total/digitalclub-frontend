/**
 * Client Detail Component
 * Detalle de cliente con configuraciones, estructura y WhatsApp
 * PARIDAD: Rails admin/clients/show.html.erb, admin/client_settings/*
 */
import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ClientService, ClientSettings, WhatsAppConfig } from '../../../../core/services/client.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../core/services/toast.service';
import { Client, ClientStatus, DocType, ClientType, DocTypeLabels, ClientTypeLabels, ClientTypeLabelsFull } from '../../../../core/models/client.model';
import { UserRole } from '../../../../core/models/user.model';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';

type TabType = 'info' | 'structure' | 'settings' | 'whatsapp';

@Component({
  selector: 'app-client-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, LoadingSpinnerComponent],
  templateUrl: './client-detail.component.html',
  styleUrl: './client-detail.component.scss'
})
export class ClientDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private clientService = inject(ClientService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);

  // Make enums available in template
  ClientStatus = ClientStatus;
  DocType = DocType;
  ClientType = ClientType;

  client = signal<Client | null>(null);
  settings = signal<ClientSettings | null>(null);
  whatsappConfig = signal<WhatsAppConfig | null>(null);

  isLoading = signal(true);
  isLoadingSettings = signal(false);
  isLoadingWhatsApp = signal(false);

  activeTab = signal<TabType>('info');

  ngOnInit(): void {
    const id = this.route.snapshot.params['id'];
    if (id) {
      this.loadClient(parseInt(id, 10));
    } else {
      // Load current user's client
      this.loadCurrentClient();
    }
  }

  private loadClient(id: number): void {
    this.isLoading.set(true);
    this.clientService.getClient(id).subscribe({
      next: (client) => {
        this.client.set(client);
        this.isLoading.set(false);
      },
      error: () => {
        this.toast.error('Error al cargar cliente');
        this.isLoading.set(false);
      }
    });
  }

  private loadCurrentClient(): void {
    this.isLoading.set(true);
    this.clientService.getCurrentClient().subscribe({
      next: (client) => {
        this.client.set(client);
        this.isLoading.set(false);
      },
      error: () => {
        this.toast.error('Error al cargar cliente');
        this.isLoading.set(false);
      }
    });
  }

  loadSettings(): void {
    const client = this.client();
    if (!client || this.settings()) return;

    this.isLoadingSettings.set(true);
    this.clientService.getClientSettings(client.id).subscribe({
      next: (settings) => {
        this.settings.set(settings);
        this.isLoadingSettings.set(false);
      },
      error: () => {
        this.toast.error('Error al cargar configuraciones');
        this.isLoadingSettings.set(false);
      }
    });
  }

  loadWhatsAppConfig(): void {
    const client = this.client();
    if (!client || this.whatsappConfig()) return;

    this.isLoadingWhatsApp.set(true);
    this.clientService.getWhatsAppConfig(client.id).subscribe({
      next: (config) => {
        this.whatsappConfig.set(config);
        this.isLoadingWhatsApp.set(false);
      },
      error: () => {
        this.toast.error('Error al cargar configuración WhatsApp');
        this.isLoadingWhatsApp.set(false);
      }
    });
  }

  isSuperAdmin(): boolean {
    return this.authService.currentUser()?.role === UserRole.SUPER_ADMIN;
  }

  canEdit(): boolean {
    const user = this.authService.currentUser();
    return user?.role === UserRole.SUPER_ADMIN || user?.role === UserRole.ADMIN;
  }

  isClientActive(): boolean {
    const client = this.client();
    return client?.status === ClientStatus.ACTIVE;
  }

  getDocTypeLabel(docType?: string): string {
    if (!docType) return '-';
    return DocTypeLabels[docType] || docType;
  }

  getClientTypeLabel(clientType?: string): string {
    if (!clientType) return '-';
    return ClientTypeLabelsFull[clientType] || ClientTypeLabels[clientType] || clientType;
  }

  getSettingsKeys(): string[] {
    const s = this.settings();
    return s ? Object.keys(s) : [];
  }

  formatSettingValue(value: unknown): string {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'boolean') return value ? 'Sí' : 'No';
    if (typeof value === 'object') {
      const json = JSON.stringify(value);
      return json.length > 50 ? json.substring(0, 50) + '...' : json;
    }
    return String(value);
  }

  getSettingType(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'boolean') return 'booleano';
    if (typeof value === 'number') return Number.isInteger(value) ? 'entero' : 'decimal';
    if (typeof value === 'string') return 'texto';
    if (Array.isArray(value)) return 'lista';
    if (typeof value === 'object') return 'objeto';
    return typeof value;
  }

  formatDateTime(dateStr: string): string {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('es-PE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
