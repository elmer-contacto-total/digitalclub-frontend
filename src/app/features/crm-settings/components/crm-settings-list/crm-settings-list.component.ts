/**
 * CrmSettingsListComponent
 * PARIDAD: Rails admin/crm_info_settings/index.html.erb
 *
 * DataTable with columns:
 * - Num de Columna (column_position)
 * - Etiqueta de Columna (column_label)
 * - Visible en CRM (column_visible)
 * - Acciones (Editar, Eliminar)
 */
import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { CrmInfoSettingService } from '../../../../core/services/crm-info-setting.service';
import { ClientService } from '../../../../core/services/client.service';
import { ToastService } from '../../../../core/services/toast.service';
import { CrmInfoSetting, CreateCrmInfoSettingRequest, ColumnType } from '../../../../core/models/crm-info-setting.model';
import { Client } from '../../../../core/models/client.model';

@Component({
  selector: 'app-crm-settings-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './crm-settings-list.component.html',
  styleUrl: './crm-settings-list.component.scss'
})
export class CrmSettingsListComponent implements OnInit, OnDestroy {
  private crmService = inject(CrmInfoSettingService);
  private clientService = inject(ClientService);
  private toastService = inject(ToastService);
  private route = inject(ActivatedRoute);
  private destroy$ = new Subject<void>();

  // State signals
  settings = signal<CrmInfoSetting[]>([]);
  isLoading = signal(true);
  isDeleting = signal<Set<number>>(new Set());
  clientId = signal<number>(0);
  clientName = signal<string>('');

  // Delete modal
  showDeleteModal = signal(false);
  settingToDelete = signal<CrmInfoSetting | null>(null);

  // Create modal
  showCreateModal = signal(false);
  isCreating = signal(false);
  createFormData = {
    columnLabel: '',
    columnType: ColumnType.TEXT as string,
    columnVisible: false
  };
  columnTypeOptions = this.crmService.getColumnTypeOptions();

  ngOnInit(): void {
    // Get client ID from route - could be parent route param
    const id = this.route.snapshot.paramMap.get('clientId') ||
               this.route.parent?.snapshot.paramMap.get('clientId');

    if (id) {
      this.clientId.set(+id);
      this.loadClient();
      this.loadSettings();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadClient(): void {
    this.clientService.getClient(this.clientId())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (client: Client) => {
          this.clientName.set(client.name);
        },
        error: (error) => {
          console.error('Error loading client:', error);
        }
      });
  }

  loadSettings(): void {
    this.isLoading.set(true);

    this.crmService.getCrmInfoSettings()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.settings.set(response.crm_info_settings || []);
          this.isLoading.set(false);
        },
        error: (error) => {
          console.error('Error loading CRM settings:', error);
          this.toastService.error('Error al cargar las configuraciones de CRM');
          this.isLoading.set(false);
        }
      });
  }

  getColumnTypeLabel(type: string): string {
    return this.crmService.getColumnTypeLabel(type);
  }

  getVisibleCount(): number {
    return this.settings().filter(s => s.column_visible).length;
  }

  confirmDelete(setting: CrmInfoSetting): void {
    this.settingToDelete.set(setting);
    this.showDeleteModal.set(true);
  }

  cancelDelete(): void {
    this.showDeleteModal.set(false);
    this.settingToDelete.set(null);
  }

  deleteSetting(): void {
    const setting = this.settingToDelete();
    if (!setting) return;

    const deleting = new Set(this.isDeleting());
    deleting.add(setting.id);
    this.isDeleting.set(deleting);

    this.crmService.deleteCrmInfoSetting(setting.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.settings.update(settings =>
            settings.filter(s => s.id !== setting.id)
          );
          this.toastService.success('Configuración eliminada correctamente');
          this.cancelDelete();

          const deleting = new Set(this.isDeleting());
          deleting.delete(setting.id);
          this.isDeleting.set(deleting);
        },
        error: (error) => {
          console.error('Error deleting CRM setting:', error);
          this.toastService.error('Error al eliminar la configuración');

          const deleting = new Set(this.isDeleting());
          deleting.delete(setting.id);
          this.isDeleting.set(deleting);
        }
      });
  }

  // Create modal methods
  openCreateModal(): void {
    this.createFormData = {
      columnLabel: '',
      columnType: ColumnType.TEXT,
      columnVisible: false
    };
    this.showCreateModal.set(true);
  }

  cancelCreate(): void {
    this.showCreateModal.set(false);
    this.createFormData = {
      columnLabel: '',
      columnType: ColumnType.TEXT,
      columnVisible: false
    };
  }

  createSetting(): void {
    if (!this.createFormData.columnLabel.trim()) {
      this.toastService.error('La etiqueta de columna es requerida');
      return;
    }

    this.isCreating.set(true);

    const request: CreateCrmInfoSettingRequest = {
      columnLabel: this.createFormData.columnLabel.trim(),
      columnType: this.createFormData.columnType,
      columnVisible: this.createFormData.columnVisible
    };

    this.crmService.createCrmInfoSetting(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.settings.update(settings => [...settings, response.crm_info_setting]);
          this.toastService.success('Configuración creada correctamente');
          this.isCreating.set(false);
          this.cancelCreate();
        },
        error: (error) => {
          console.error('Error creating CRM setting:', error);
          this.toastService.error(error.error?.message || 'Error al crear la configuración');
          this.isCreating.set(false);
        }
      });
  }

  getNextPosition(): number {
    return this.settings().length + 1;
  }
}
