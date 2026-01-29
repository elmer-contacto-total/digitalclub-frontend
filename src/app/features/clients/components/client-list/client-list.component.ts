/**
 * Client List Component
 * Lista de clientes/organizaciones con DataTable
 * PARIDAD RAILS: admin/clients/index.html.erb
 */
import { Component, inject, signal, OnInit, OnDestroy, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { ClientService } from '../../../../core/services/client.service';
import { Client, ClientStatus } from '../../../../core/models/client.model';
import { ToastService } from '../../../../core/services/toast.service';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-client-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FormsModule,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    ConfirmDialogComponent
  ],
  templateUrl: './client-list.component.html',
  styleUrl: './client-list.component.scss'
})
export class ClientListComponent implements OnInit, OnDestroy {
  private clientService = inject(ClientService);
  private toast = inject(ToastService);
  private destroy$ = new Subject<void>();

  // Enums for template
  ClientStatus = ClientStatus;

  // Data
  clients = signal<Client[]>([]);
  isLoading = signal(false);
  searchTerm = signal('');
  filteredClients = signal<Client[]>([]);

  // Dialogs
  clientToDelete = signal<Client | null>(null);
  clientToDeleteProspects = signal<Client | null>(null);

  // Dropdown state
  openDropdownId: number | null = null;
  dropdownStyle: { top?: string; bottom?: string; left?: string; right?: string } = {};

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    // Close dropdown when clicking outside
    const target = event.target as HTMLElement;
    if (!target.closest('.dropdown')) {
      this.closeDropdown();
    }
  }

  @HostListener('window:scroll')
  @HostListener('window:resize')
  onWindowChange(): void {
    // Close dropdown on scroll or resize to avoid misalignment
    if (this.openDropdownId !== null) {
      this.closeDropdown();
    }
  }

  toggleDropdown(clientId: number, event: Event): void {
    event.stopPropagation();

    if (this.openDropdownId === clientId) {
      this.closeDropdown();
      return;
    }

    // Get button position
    const button = (event.target as HTMLElement).closest('.dropdown-toggle') as HTMLElement;
    if (!button) return;

    const buttonRect = button.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const dropdownHeight = 280; // Approximate height of dropdown menu
    const dropdownWidth = 200; // Approximate width of dropdown menu

    // Calculate position
    const spaceBelow = viewportHeight - buttonRect.bottom;
    const spaceAbove = buttonRect.top;
    const spaceRight = viewportWidth - buttonRect.right;

    // Determine vertical position (open up or down)
    if (spaceBelow >= dropdownHeight || spaceBelow >= spaceAbove) {
      // Open downward
      this.dropdownStyle = {
        top: `${buttonRect.bottom + 4}px`,
        bottom: 'auto'
      };
    } else {
      // Open upward
      this.dropdownStyle = {
        top: 'auto',
        bottom: `${viewportHeight - buttonRect.top + 4}px`
      };
    }

    // Determine horizontal position (align left or right of button)
    if (spaceRight >= dropdownWidth) {
      // Align to right edge of button
      this.dropdownStyle.right = `${viewportWidth - buttonRect.right}px`;
      this.dropdownStyle.left = 'auto';
    } else {
      // Align to left edge of button
      this.dropdownStyle.left = `${buttonRect.left}px`;
      this.dropdownStyle.right = 'auto';
    }

    this.openDropdownId = clientId;
  }

  closeDropdown(): void {
    this.openDropdownId = null;
    this.dropdownStyle = {};
  }

  ngOnInit(): void {
    this.loadClients();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadClients(): void {
    this.isLoading.set(true);
    this.clientService.getClients().pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        this.clients.set(response.data);
        this.filterClients();
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading clients:', err);
        this.toast.error('Error al cargar organizaciones');
        this.isLoading.set(false);
      }
    });
  }

  onSearch(): void {
    this.filterClients();
  }

  private filterClients(): void {
    const term = this.searchTerm().toLowerCase();
    if (!term) {
      this.filteredClients.set(this.clients());
    } else {
      this.filteredClients.set(
        this.clients().filter(c =>
          c.name.toLowerCase().includes(term) ||
          c.companyName?.toLowerCase().includes(term) ||
          c.docNumber?.toLowerCase().includes(term)
        )
      );
    }
  }

  /**
   * Get document type label - PARIDAD: Rails I18n enum
   */
  getDocTypeLabel(docType: string | undefined): string {
    if (!docType) return '-';
    const labels: Record<string, string> = {
      'ruc': 'RUC',
      'dni': 'DNI'
    };
    return labels[docType] || docType.toUpperCase();
  }

  /**
   * Get client type label - PARIDAD: Rails I18n enum (labels completos)
   */
  getClientTypeLabel(clientType: string | undefined): string {
    if (!clientType) return '-';
    const labels: Record<string, string> = {
      'whatsapp_app': 'WhatsApp Punto a Punto / WhatsApp Business Centralizado',
      'whatsapp_business': 'Solo WhatsApp Business Centralizado',
      'point_to_point_only': 'Solo WhatsApp Punto a Punto'
    };
    return labels[clientType] || clientType;
  }

  /**
   * Confirm delete prospects
   * PARIDAD: Rails destroy_prospects with confirmation
   */
  confirmDeleteProspects(client: Client): void {
    this.clientToDeleteProspects.set(client);
  }

  deleteProspects(): void {
    const client = this.clientToDeleteProspects();
    if (!client) return;

    this.clientService.deleteProspects(client.id).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.clientToDeleteProspects.set(null);
        this.toast.success('Prospectos eliminados correctamente');
      },
      error: (err: unknown) => {
        console.error('Error deleting prospects:', err);
        this.toast.error('Error al eliminar prospectos');
        this.clientToDeleteProspects.set(null);
      }
    });
  }

  /**
   * Confirm delete client
   * PARIDAD: Rails delete with confirmation
   */
  confirmDelete(client: Client): void {
    this.clientToDelete.set(client);
  }

  deleteClient(): void {
    const client = this.clientToDelete();
    if (!client) return;

    this.clientService.deleteClient(client.id).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.clientToDelete.set(null);
        this.toast.success('Organización eliminada correctamente');
        this.loadClients();
      },
      error: (err: unknown) => {
        console.error('Error deleting client:', err);
        this.toast.error('Error al eliminar organización');
        this.clientToDelete.set(null);
      }
    });
  }
}
