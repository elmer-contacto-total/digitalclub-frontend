import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { DashboardService } from './services/dashboard.service';
import { KpiCardComponent } from './components/kpi-card/kpi-card.component';
import { PeriodSelectorComponent } from './components/period-selector/period-selector.component';
import { ObjectFilterComponent, ObjectOption } from './components/object-filter/object-filter.component';
import { KpiTableComponent } from './components/kpi-table/kpi-table.component';
import {
  PeriodType,
  KpiObjectType,
  DateRange,
  OverallKpis,
  IndividualKpiRow,
  KPI_CARDS_CONFIG,
  KpiCardConfig,
  getPeriodDays,
  PERIODS_CONFIG
} from '../../core/models/dashboard.model';
import { UserRole, RoleUtils } from '../../core/models/user.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    KpiCardComponent,
    PeriodSelectorComponent,
    ObjectFilterComponent,
    KpiTableComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  private authService = inject(AuthService);
  private dashboardService = inject(DashboardService);
  private toastService = inject(ToastService);

  // User info
  readonly currentUser = this.authService.currentUser;
  readonly isAdmin = this.authService.isAdmin;
  readonly isManager = this.authService.isManager;

  // Check if user is manager level 4 specifically
  isManagerLevel4 = computed(() => {
    const role = this.currentUser()?.role;
    return role !== undefined && RoleUtils.isManagerLevel4(role);
  });

  // Loading state
  isLoading = signal(false);
  hasError = signal(false);

  // Filter state
  selectedPeriod = signal<PeriodType>('today');
  customDateRange = signal<DateRange | null>(null);
  selectedObject = signal<KpiObjectType>('agent');
  selectedOption = signal<string | number>('Todos');
  comparisonLabel = signal('Desde ayer');

  // Data state
  overallKpis = signal<OverallKpis | null>(null);
  individualKpiRows = signal<IndividualKpiRow[]>([]);
  dropdownOptions = signal<ObjectOption[]>([{ label: 'Todos', value: 'Todos' }]);
  // Controlled by client_settings.ticket_close_types (from backend), NOT user toggle
  showCloseTypeKpis = signal(false);

  // Role labels
  private roleLabels: Record<string, string> = {
    'SUPER_ADMIN': 'Super Admin',
    'ADMIN': 'Administrador',
    'MANAGER_LEVEL_1': 'Gerente Nivel 1',
    'MANAGER_LEVEL_2': 'Gerente Nivel 2',
    'MANAGER_LEVEL_3': 'Gerente Nivel 3',
    'MANAGER_LEVEL_4': 'Supervisor',
    'AGENT': 'Agente',
    'STAFF': 'Staff',
    'STANDARD': 'Cliente',
    'WHATSAPP_BUSINESS': 'WhatsApp Business'
  };

  // Object types based on user role (matches Rails Utils.get_kpi_objects_from_client)
  availableObjectTypes = computed<KpiObjectType[]>(() => {
    const role = this.currentUser()?.role;
    if (role === undefined) return ['agent'];

    // Super_Admin: Cliente + Supervisor + Agente
    if (RoleUtils.isSuperAdmin(role)) {
      return ['Cliente', 'manager_level_4', 'agent'];
    }
    // Admin: Supervisor + Agente
    if (RoleUtils.isAdmin(role)) {
      return ['manager_level_4', 'agent'];
    }
    // Manager_Level_4: Solo Agente
    if (RoleUtils.isManagerLevel4(role)) {
      return ['agent'];
    }
    // Agent: Sin filtros
    return [];
  });

  // Filter visible KPI cards based on user role
  visibleKpiCards = computed<KpiCardConfig[]>(() => {
    const role = this.currentUser()?.role;
    if (role === undefined) return KPI_CARDS_CONFIG.filter(c => !c.visibleFor);

    return KPI_CARDS_CONFIG.filter(card => {
      if (!card.visibleFor) return true;
      if (RoleUtils.isAdmin(role) && card.visibleFor.includes('admin')) return true;
      if (RoleUtils.isManagerLevel4(role) && card.visibleFor.includes('manager_level_4')) return true;
      return false;
    });
  });

  // Note: showCloseTypeKpis is determined by client settings from backend, not a toggle

  // Check if user can export (only Admin and Manager_Level_4, NOT Super_Admin or other managers)
  canExport = computed(() => {
    const role = this.currentUser()?.role;
    if (role === undefined) return false;
    // Super_Admin cannot export, only Admin and Manager_Level_4
    if (RoleUtils.isSuperAdmin(role)) return false;
    return RoleUtils.isAdmin(role) || RoleUtils.isManagerLevel4(role);
  });

  ngOnInit(): void {
    // Set initial object selection based on role (matches Rails initially_selected? helper)
    const role = this.currentUser()?.role;
    if (role !== undefined) {
      if (RoleUtils.isSuperAdmin(role)) {
        // Super_Admin defaults to 'Cliente' view
        this.selectedObject.set('Cliente');
      } else if (RoleUtils.isAdmin(role)) {
        // Admin defaults to 'manager_level_4' (Supervisor) view
        this.selectedObject.set('manager_level_4');
      }
      // Manager_Level_4 defaults to 'agent' (already set in signal initialization)
      // Agent has no object selection (empty availableObjectTypes)
    }

    this.loadKpis();
  }

  getRoleLabel(role: UserRole | string | undefined): string {
    if (!role) return '';
    const roleStr = typeof role === 'string' ? role : UserRole[role];
    return this.roleLabels[roleStr] || roleStr;
  }

  onPeriodChange(period: PeriodType): void {
    this.selectedPeriod.set(period);
    if (period !== 'last_custom') {
      this.customDateRange.set(null);
      // Update comparison label
      const config = PERIODS_CONFIG.find(p => p.id === period);
      if (config) {
        this.comparisonLabel.set(config.comparisonLabel);
      }
      this.loadKpis();
    }
  }

  onCustomRangeChange(range: DateRange): void {
    this.customDateRange.set(range);
    const days = this.calculateDaysDiff(range.fromDate, range.toDate);
    this.comparisonLabel.set(`Desde el período anterior (${days} días)`);
    this.loadKpis();
  }

  onObjectChange(obj: KpiObjectType): void {
    this.selectedObject.set(obj);
    this.selectedOption.set('Todos');
    this.loadKpis();
  }

  onOptionChange(option: string | number): void {
    this.selectedOption.set(option);
    this.loadKpis();
  }

  onExport(): void {
    const period = this.selectedPeriod();
    const range = this.customDateRange();

    this.dashboardService.downloadExport({
      last_x_days: period !== 'last_custom' ? getPeriodDays(period) : undefined,
      from_date: range?.fromDate,
      to_date: range?.toDate,
      object: this.selectedObject(),
      object_option: this.selectedOption()
    });

    this.toastService.success('Exportando KPIs...');
  }

  onExportContacts(): void {
    this.dashboardService.downloadContacts();
    this.toastService.success('Exportando contactos...');
  }

  loadKpis(): void {
    this.isLoading.set(true);
    this.hasError.set(false);

    const period = this.selectedPeriod();
    const range = this.customDateRange();

    this.dashboardService.getKpis({
      button_id: period,
      object: this.selectedObject(),
      object_option: this.selectedOption(),
      from_date: range?.fromDate,
      to_date: range?.toDate
    }).subscribe({
      next: (response) => {
        this.overallKpis.set(response.overall_kpis);

        // Transform individual KPIs to row format
        // We need to get user names from the dropdown options
        const userNameMap = new Map<number, string>();
        response.dropdown_options.forEach(([firstName, lastName, id]) => {
          if (id !== 'Todos' && id !== '') {
            userNameMap.set(Number(id), `${firstName} ${lastName}`.trim());
          }
        });

        const rows = this.dashboardService.transformIndividualKpis(
          response.individual_kpis,
          userNameMap
        );
        this.individualKpiRows.set(rows);

        // Update dropdown options
        const options = this.dashboardService.parseDropdownOptions(response.dropdown_options);
        this.dropdownOptions.set(options);

        // Update comparison label from response
        if (response.comparison_label) {
          this.comparisonLabel.set(response.comparison_label);
        }

        // Update close type KPIs visibility from client settings
        // This is determined by client_settings.ticket_close_types in backend
        if (response.show_close_type_kpis !== undefined) {
          this.showCloseTypeKpis.set(response.show_close_type_kpis);
        }

        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading KPIs:', err);
        this.hasError.set(true);
        this.isLoading.set(false);
        this.toastService.error('Error al cargar los KPIs. Intente nuevamente.');
      }
    });
  }

  private calculateDaysDiff(fromDate: string, toDate: string): number {
    const from = new Date(fromDate);
    const to = new Date(toDate);
    const diffTime = Math.abs(to.getTime() - from.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  getKpiValue(key: string): number | null | undefined {
    const values = this.overallKpis()?.values;
    if (!values) return null;
    return (values as any)[key];
  }

  getKpiPercentage(key: string): number | null | undefined {
    const percentages = this.overallKpis()?.percentages;
    if (!percentages) return null;
    return (percentages as any)[key];
  }
}
