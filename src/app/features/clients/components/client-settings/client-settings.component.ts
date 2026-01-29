/**
 * Client Settings Component
 * Configuraciones del cliente con capacidad de edición
 * PARIDAD: Rails admin/client_settings/index.html.erb
 */
import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ClientService, ClientSettings } from '../../../../core/services/client.service';
import { Client } from '../../../../core/models/client.model';
import { ToastService } from '../../../../core/services/toast.service';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { HasUnsavedChanges } from '../../../../core/guards/unsaved-changes.guard';

interface SettingItem {
  key: string;
  value: unknown;
  type: string;
  isEditing: boolean;
  editValue: string;
}

@Component({
  selector: 'app-client-settings',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, LoadingSpinnerComponent],
  templateUrl: './client-settings.component.html',
  styleUrl: './client-settings.component.scss'
})
export class ClientSettingsComponent implements OnInit, HasUnsavedChanges {
  private route = inject(ActivatedRoute);
  private clientService = inject(ClientService);
  private toast = inject(ToastService);

  clientId = signal<number | null>(null);
  client = signal<Client | null>(null);
  settings = signal<SettingItem[]>([]);

  isLoading = signal(true);
  isSaving = signal(false);

  ngOnInit(): void {
    const id = this.route.snapshot.params['id'];
    if (id) {
      this.clientId.set(parseInt(id, 10));
      this.loadData();
    }
  }

  private loadData(): void {
    const id = this.clientId();
    if (!id) return;

    this.isLoading.set(true);

    // Load client info
    this.clientService.getClient(id).subscribe({
      next: (client) => this.client.set(client),
      error: () => this.toast.error('Error al cargar cliente')
    });

    // Load settings
    this.clientService.getClientSettings(id).subscribe({
      next: (settings) => {
        this.settings.set(this.transformSettings(settings));
        this.isLoading.set(false);
      },
      error: () => {
        this.toast.error('Error al cargar configuraciones');
        this.isLoading.set(false);
      }
    });
  }

  private transformSettings(settings: ClientSettings): SettingItem[] {
    return Object.entries(settings).map(([key, value]) => ({
      key,
      value,
      type: this.getValueType(value),
      isEditing: false,
      editValue: this.formatValueForEdit(value)
    }));
  }

  private getValueType(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'float';
    if (typeof value === 'string') return 'string';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    return 'unknown';
  }

  private formatValueForEdit(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  }

  // Filter methods for grouped display
  getBooleanSettings(): SettingItem[] {
    return this.settings().filter(s => s.type === 'boolean');
  }

  getTextSettings(): SettingItem[] {
    return this.settings().filter(s => ['string', 'integer', 'float', 'null'].includes(s.type));
  }

  getComplexSettings(): SettingItem[] {
    return this.settings().filter(s => ['object', 'array'].includes(s.type));
  }

  getActiveCount(): number {
    return this.settings().filter(s => s.type === 'boolean' && s.value === true).length;
  }

  formatKey(key: string): string {
    // Convert snake_case to Title Case
    return key
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  formatDisplayValue(item: SettingItem): string {
    if (item.value === null || item.value === undefined) return '-';
    if (typeof item.value === 'boolean') return item.value ? 'Sí' : 'No';
    if (typeof item.value === 'object') {
      const json = JSON.stringify(item.value);
      return json.length > 100 ? json.substring(0, 100) + '...' : json;
    }
    return String(item.value);
  }

  getTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      'string': 'Texto',
      'integer': 'Entero',
      'float': 'Decimal',
      'boolean': 'Booleano',
      'object': 'Objeto',
      'array': 'Lista',
      'null': 'Nulo',
      'unknown': 'Desconocido'
    };
    return labels[type] || type;
  }

  getTypeIcon(type: string): string {
    const icons: Record<string, string> = {
      'string': 'ph-text-aa',
      'integer': 'ph-number-square-one',
      'float': 'ph-percent',
      'boolean': 'ph-toggle-left',
      'object': 'ph-brackets-curly',
      'array': 'ph-brackets-square',
      'null': 'ph-minus',
      'unknown': 'ph-question'
    };
    return icons[type] || 'ph-question';
  }

  startEdit(item: SettingItem): void {
    // Close any other editing
    this.settings().forEach(s => s.isEditing = false);
    item.isEditing = true;
    item.editValue = this.formatValueForEdit(item.value);
  }

  cancelEdit(item: SettingItem): void {
    item.isEditing = false;
    item.editValue = this.formatValueForEdit(item.value);
  }

  saveEdit(item: SettingItem): void {
    const id = this.clientId();
    if (!id) return;

    this.isSaving.set(true);

    // Parse value based on type
    let parsedValue: unknown;
    try {
      if (item.type === 'boolean') {
        parsedValue = item.editValue.toLowerCase() === 'true' || item.editValue === '1' || item.editValue.toLowerCase() === 'sí';
      } else if (item.type === 'integer') {
        parsedValue = parseInt(item.editValue, 10);
      } else if (item.type === 'float') {
        parsedValue = parseFloat(item.editValue);
      } else if (item.type === 'object' || item.type === 'array') {
        parsedValue = JSON.parse(item.editValue);
      } else {
        parsedValue = item.editValue;
      }
    } catch {
      this.toast.error('Formato de valor inválido');
      this.isSaving.set(false);
      return;
    }

    const settings: Record<string, unknown> = {
      [item.key]: parsedValue
    };

    this.clientService.updateClientSettings(id, { settings }).subscribe({
      next: () => {
        item.value = parsedValue;
        item.isEditing = false;
        this.isSaving.set(false);
        this.toast.success('Configuración actualizada');
      },
      error: () => {
        this.isSaving.set(false);
        this.toast.error('Error al guardar configuración');
      }
    });
  }

  toggleBoolean(item: SettingItem): void {
    if (item.type !== 'boolean') return;
    item.editValue = item.value === true ? 'false' : 'true';
    this.saveEdit(item);
  }

  /**
   * Check if there are unsaved changes (items in editing mode)
   * Used by unsavedChangesGuard
   */
  hasUnsavedChanges(): boolean {
    return this.settings().some(item => item.isEditing);
  }
}
