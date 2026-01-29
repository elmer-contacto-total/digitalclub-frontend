/**
 * Client Form Component
 * Formulario para crear/editar organizaciones
 * PARIDAD: Rails admin/clients/_form.html.erb
 */
import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { ClientService, CreateClientRequest, UpdateClientRequest, ClientStructureRequest } from '../../../../core/services/client.service';
import { ToastService } from '../../../../core/services/toast.service';
import {
  Client,
  ClientStatus,
  DocTypeLabels,
  ClientTypeLabelsFull,
  StatusLabels,
  ClientStructure,
  DEFAULT_CLIENT_STRUCTURE
} from '../../../../core/models/client.model';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-client-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LoadingSpinnerComponent],
  templateUrl: './client-form.component.html',
  styleUrl: './client-form.component.scss'
})
export class ClientFormComponent implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private clientService = inject(ClientService);
  private toast = inject(ToastService);

  isLoading = signal(false);
  isSaving = signal(false);
  isEditMode = signal(false);
  clientId = signal<number | null>(null);

  // Feature flag for structure section
  clientsHaveStructure = true; // TODO: Get from settings

  // Form data
  form = {
    name: '',
    companyName: '',
    docType: '',
    docNumber: '',
    clientType: '',
    status: 'active'
  };

  // Structure form
  structure: ClientStructure = { ...DEFAULT_CLIENT_STRUCTURE };

  errors: Record<string, string> = {};

  // Helper methods for template
  get errorCount(): number {
    return Object.keys(this.errors).length;
  }

  get errorMessages(): string[] {
    return Object.values(this.errors);
  }

  get hasErrors(): boolean {
    return this.errorCount > 0;
  }

  // Options for dropdowns - PARIDAD: Rails es.yml
  docTypes = Object.entries(DocTypeLabels).map(([value, label]) => ({ value, label }));
  clientTypes = Object.entries(ClientTypeLabelsFull).map(([value, label]) => ({ value, label }));
  statuses = Object.entries(StatusLabels).map(([value, label]) => ({ value, label }));

  ngOnInit(): void {
    const id = this.route.snapshot.params['id'];
    if (id && id !== 'new') {
      this.isEditMode.set(true);
      this.clientId.set(parseInt(id, 10));
      this.loadClient(this.clientId()!);
    }
  }

  private loadClient(id: number): void {
    this.isLoading.set(true);
    this.clientService.getClient(id).subscribe({
      next: (client: Client & { clientStructure?: ClientStructure }) => {
        this.form.name = client.name;
        this.form.companyName = client.companyName || '';
        this.form.docType = client.docType || '';
        this.form.docNumber = client.docNumber || '';
        this.form.clientType = client.clientType || '';
        this.form.status = client.status === ClientStatus.ACTIVE ? 'active' : 'inactive';

        // Load structure if exists
        if (client.clientStructure) {
          this.structure = { ...client.clientStructure };
        }

        this.isLoading.set(false);
      },
      error: () => {
        this.toast.error('Error al cargar la organización');
        this.isLoading.set(false);
        this.router.navigate(['/app/clients']);
      }
    });
  }

  /**
   * Handle Manager Level 1 checkbox change
   * PARIDAD: Rails jQuery logic
   */
  onManagerLevel1Change(): void {
    if (!this.structure.existsManagerLevel1) {
      this.structure.managerLevel1 = '';
      this.structure.existsManagerLevel2 = false;
      this.structure.managerLevel2 = '';
      this.structure.existsManagerLevel3 = false;
      this.structure.managerLevel3 = '';
    }
  }

  /**
   * Handle Manager Level 2 checkbox change
   * PARIDAD: Rails jQuery logic
   */
  onManagerLevel2Change(): void {
    if (this.structure.existsManagerLevel2) {
      this.structure.existsManagerLevel1 = true;
    } else {
      this.structure.managerLevel2 = '';
      this.structure.existsManagerLevel3 = false;
      this.structure.managerLevel3 = '';
    }
  }

  /**
   * Handle Manager Level 3 checkbox change
   * PARIDAD: Rails jQuery logic
   */
  onManagerLevel3Change(): void {
    if (this.structure.existsManagerLevel3) {
      this.structure.existsManagerLevel1 = true;
      this.structure.existsManagerLevel2 = true;
    } else {
      this.structure.managerLevel3 = '';
    }
  }

  onSubmit(): void {
    this.errors = {};

    // Validation - PARIDAD: Rails activerecord.errors.models.client
    this.validateForm();

    if (this.hasErrors) {
      return;
    }

    this.isSaving.set(true);

    if (this.isEditMode()) {
      this.updateClient();
    } else {
      this.createClient();
    }
  }

  /**
   * Validate all form fields
   * PARIDAD: Rails model validations
   */
  private validateForm(): void {
    // Nombre - requerido
    if (!this.form.name.trim()) {
      this.errors['name'] = 'El nombre de la organización no puede estar en blanco';
    }

    // Nombre de la Empresa - requerido
    if (!this.form.companyName.trim()) {
      this.errors['companyName'] = 'El nombre de la empresa no puede estar en blanco';
    }

    // Tipo de Documento - requerido
    if (!this.form.docType) {
      this.errors['docType'] = 'Debe seleccionar un Tipo de Documento';
    }

    // Número de Documento - requerido si hay tipo de documento
    if (this.form.docType && !this.form.docNumber.trim()) {
      this.errors['docNumber'] = 'El Número de Documento no puede estar en blanco';
    }

    // Validar formato de RUC (11 dígitos) o DNI (8 dígitos)
    if (this.form.docNumber.trim()) {
      const docNumber = this.form.docNumber.trim();
      if (this.form.docType === 'ruc' && !/^\d{11}$/.test(docNumber)) {
        this.errors['docNumber'] = 'El RUC debe tener 11 dígitos numéricos';
      } else if (this.form.docType === 'dni' && !/^\d{8}$/.test(docNumber)) {
        this.errors['docNumber'] = 'El DNI debe tener 8 dígitos numéricos';
      }
    }

    // Tipo de Plataforma - requerido
    if (!this.form.clientType) {
      this.errors['clientType'] = 'Debe seleccionar un Tipo de Plataforma';
    }

    // Validar estructura si está habilitada
    if (this.clientsHaveStructure) {
      this.validateStructure();
    }
  }

  /**
   * Validate structure fields
   */
  private validateStructure(): void {
    // Si Manager Level 1 está activo, debe tener nomenclatura
    if (this.structure.existsManagerLevel1 && !this.structure.managerLevel1.trim()) {
      this.errors['managerLevel1'] = 'La nomenclatura del Gerente Nivel 1 no puede estar en blanco';
    }

    // Si Manager Level 2 está activo, debe tener nomenclatura
    if (this.structure.existsManagerLevel2 && !this.structure.managerLevel2.trim()) {
      this.errors['managerLevel2'] = 'La nomenclatura del Gerente Nivel 2 no puede estar en blanco';
    }

    // Si Manager Level 3 está activo, debe tener nomenclatura
    if (this.structure.existsManagerLevel3 && !this.structure.managerLevel3.trim()) {
      this.errors['managerLevel3'] = 'La nomenclatura del Gerente Nivel 3 no puede estar en blanco';
    }
  }

  private buildStructureRequest(): ClientStructureRequest {
    return {
      existsAdminLevel0: this.structure.existsAdminLevel0,
      adminLevel0: this.structure.adminLevel0,
      existsManagerLevel1: this.structure.existsManagerLevel1,
      managerLevel1: this.structure.managerLevel1,
      existsManagerLevel2: this.structure.existsManagerLevel2,
      managerLevel2: this.structure.managerLevel2,
      existsManagerLevel3: this.structure.existsManagerLevel3,
      managerLevel3: this.structure.managerLevel3,
      existsManagerLevel4: this.structure.existsManagerLevel4,
      managerLevel4: this.structure.managerLevel4,
      existsAgent: this.structure.existsAgent,
      agent: this.structure.agent,
      existsClientLevel6: this.structure.existsClientLevel6,
      clientLevel6: this.structure.clientLevel6
    };
  }

  private createClient(): void {
    const request: CreateClientRequest = {
      name: this.form.name.trim(),
      companyName: this.form.companyName.trim() || undefined,
      docType: this.form.docType || undefined,
      docNumber: this.form.docNumber.trim() || undefined,
      clientType: this.form.clientType || undefined,
      status: this.form.status,
      clientStructure: this.clientsHaveStructure ? this.buildStructureRequest() : undefined
    };

    this.clientService.createClient(request).subscribe({
      next: (client) => {
        this.toast.success('Organización creada correctamente');
        this.router.navigate(['/app/clients', client.id]);
      },
      error: (err) => {
        this.isSaving.set(false);
        const message = err.error?.message || 'Error al crear la organización';
        this.toast.error(message);
      }
    });
  }

  private updateClient(): void {
    const request: UpdateClientRequest = {
      name: this.form.name.trim(),
      companyName: this.form.companyName.trim() || undefined,
      docType: this.form.docType || undefined,
      docNumber: this.form.docNumber.trim() || undefined,
      clientType: this.form.clientType || undefined,
      status: this.form.status,
      active: this.form.status === 'active',
      clientStructure: this.clientsHaveStructure ? this.buildStructureRequest() : undefined
    };

    this.clientService.updateClient(this.clientId()!, request).subscribe({
      next: (client) => {
        this.toast.success('Organización actualizada correctamente');
        this.router.navigate(['/app/clients', client.id]);
      },
      error: (err) => {
        this.isSaving.set(false);
        const message = err.error?.message || 'Error al actualizar la organización';
        this.toast.error(message);
      }
    });
  }
}
