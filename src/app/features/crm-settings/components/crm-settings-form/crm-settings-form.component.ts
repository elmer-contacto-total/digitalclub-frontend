/**
 * CrmSettingsFormComponent
 * PARIDAD: Rails admin/crm_info_settings/_form.html.erb
 *
 * Form fields:
 * - column_position: "Posición de columna en archivo de importación"
 * - column_label: "Etiqueta de columna en archivo de importación"
 * - column_visible: "Visible en CRM" (checkbox)
 *
 * Buttons: "Grabar" (submit), "Cancelar"
 */
import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { CrmInfoSettingService } from '../../../../core/services/crm-info-setting.service';
import { ClientService } from '../../../../core/services/client.service';
import { ToastService } from '../../../../core/services/toast.service';
import {
  CrmInfoSetting,
  CreateCrmInfoSettingRequest,
  UpdateCrmInfoSettingRequest,
  ColumnType
} from '../../../../core/models/crm-info-setting.model';
import { HasUnsavedChanges } from '../../../../core/guards/unsaved-changes.guard';

@Component({
  selector: 'app-crm-settings-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './crm-settings-form.component.html',
  styleUrl: './crm-settings-form.component.scss'
})
export class CrmSettingsFormComponent implements OnInit, OnDestroy, HasUnsavedChanges {
  private crmService = inject(CrmInfoSettingService);
  private clientService = inject(ClientService);
  private toastService = inject(ToastService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private destroy$ = new Subject<void>();

  // State signals
  isLoading = signal(true);
  isSaving = signal(false);
  isEditMode = signal(false);
  clientId = signal<number>(0);
  clientName = signal<string>('');
  settingId = signal<number | null>(null);
  errorMessage = signal<string>('');

  // Track if form has been modified
  private formModified = false;
  private initialFormData = '';

  // Form data
  formData = {
    columnPosition: 1,
    columnLabel: '',
    columnType: ColumnType.TEXT as string,
    columnVisible: false
  };

  // Column type options
  columnTypeOptions = this.crmService.getColumnTypeOptions();

  ngOnInit(): void {
    // Get client ID from route
    const clientIdParam = this.route.snapshot.paramMap.get('clientId') ||
                          this.route.parent?.snapshot.paramMap.get('clientId');

    if (clientIdParam) {
      this.clientId.set(+clientIdParam);
      this.loadClient();
    }

    // Check if edit mode
    const settingIdParam = this.route.snapshot.paramMap.get('id');
    if (settingIdParam) {
      this.isEditMode.set(true);
      this.settingId.set(+settingIdParam);
      this.loadSetting();
    } else {
      this.loadNextPosition();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Check if there are unsaved changes
   * Used by unsavedChangesGuard
   */
  hasUnsavedChanges(): boolean {
    const currentFormData = JSON.stringify(this.formData);
    return this.formModified && currentFormData !== this.initialFormData;
  }

  private saveInitialFormData(): void {
    this.initialFormData = JSON.stringify(this.formData);
    this.formModified = true;
  }

  loadClient(): void {
    this.clientService.getClient(this.clientId())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (client) => {
          this.clientName.set(client.name);
        },
        error: (error) => {
          console.error('Error loading client:', error);
        }
      });
  }

  loadSetting(): void {
    this.isLoading.set(true);
    const id = this.settingId();

    if (!id) {
      this.isLoading.set(false);
      return;
    }

    this.crmService.getCrmInfoSetting(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (setting) => {
          this.formData.columnPosition = setting.column_position;
          this.formData.columnLabel = setting.column_label;
          this.formData.columnType = setting.column_type;
          this.formData.columnVisible = setting.column_visible;
          this.isLoading.set(false);
          this.saveInitialFormData();
        },
        error: (error) => {
          console.error('Error loading CRM setting:', error);
          this.toastService.error('Error al cargar la configuración');
          this.isLoading.set(false);
        }
      });
  }

  loadNextPosition(): void {
    // Get current settings count to calculate next position
    this.crmService.getCrmInfoSettings()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          const settings = response.crm_info_settings || [];
          this.formData.columnPosition = settings.length + 1;
          this.isLoading.set(false);
          this.saveInitialFormData();
        },
        error: (error) => {
          console.error('Error loading settings count:', error);
          this.formData.columnPosition = 1;
          this.isLoading.set(false);
          this.saveInitialFormData();
        }
      });
  }

  onSubmit(): void {
    this.errorMessage.set('');
    this.isSaving.set(true);

    if (this.isEditMode()) {
      this.updateSetting();
    } else {
      this.createSetting();
    }
  }

  createSetting(): void {
    const request: CreateCrmInfoSettingRequest = {
      columnLabel: this.formData.columnLabel,
      columnType: this.formData.columnType,
      columnVisible: this.formData.columnVisible
    };

    this.crmService.createCrmInfoSetting(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          // Reset form modified flag before navigation
          this.formModified = false;
          this.toastService.success('Configuración creada correctamente');
          this.router.navigate(['/app/clients', this.clientId(), 'crm_info_settings']);
        },
        error: (error) => {
          console.error('Error creating CRM setting:', error);
          this.errorMessage.set(error.error?.message || 'Error al crear la configuración');
          this.isSaving.set(false);
        }
      });
  }

  updateSetting(): void {
    const id = this.settingId();
    if (!id) return;

    const request: UpdateCrmInfoSettingRequest = {
      columnLabel: this.formData.columnLabel,
      columnType: this.formData.columnType,
      columnVisible: this.formData.columnVisible
    };

    this.crmService.updateCrmInfoSetting(id, request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          // Reset form modified flag before navigation
          this.formModified = false;
          this.toastService.success('Configuración actualizada correctamente');
          this.router.navigate(['/app/clients', this.clientId(), 'crm_info_settings']);
        },
        error: (error) => {
          console.error('Error updating CRM setting:', error);
          this.errorMessage.set(error.error?.message || 'Error al actualizar la configuración');
          this.isSaving.set(false);
        }
      });
  }
}
