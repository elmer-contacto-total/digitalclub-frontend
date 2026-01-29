/**
 * Dashboard KPI Models
 * PARIDAD RAILS: Basado en Admin::DashboardController#calculate_kpis
 */

// ===== PERIOD TYPES =====

export type PeriodType = 'today' | 'last_7' | 'last_30' | 'last_180' | 'last_custom';

export interface DateRange {
  fromDate: string; // YYYY-MM-DD
  toDate: string;   // YYYY-MM-DD
}

// ===== KPI OBJECT TYPES =====

export type KpiObjectType = 'agent' | 'manager_level_4' | 'Cliente';

// ===== OVERALL KPIS =====

export interface OverallKpiValues {
  unique_clients: number;         // Clientes Únicos
  new_cases_period: number;       // Nuevos Casos
  open_cases: number;             // Total Casos Abiertos
  first_response_time: number;    // Tiempo 1era Respuesta (min)
  tmo: number;                    // Tiempo TMO (min)
  users_created?: number;         // Clientes Creados (solo admin/manager_level_4)
  contact_ratio?: number;         // Tasa de Respuesta % (solo admin/manager_level_4)
}

export interface OverallKpiPercentages {
  unique_clients: number;
  new_cases_period: number;
  open_cases: number;
  first_response_time: number;
  tmo: number;
  users_created?: number;
  contact_ratio?: number;
}

export interface OverallKpis {
  values: OverallKpiValues;
  percentages: OverallKpiPercentages;
}

// ===== INDIVIDUAL KPIS (per agent) =====

export interface IndividualKpis {
  client_responded_rate: number;        // Adherencia %
  new_cases: number;                    // Casos de Clientes
  client_cases_to_close_period: number; // Casos por Cerrar en Período
  closed_con_acuerdo_cases: number;     // Casos Cerrados con Acuerdo
  closed_sin_acuerdo_cases: number;     // Casos Cerrados sin Acuerdo
  client_unique_responded_to: number;   // Conversaciones Respondidas
  clients_to_respond_to: number;        // Conversaciones Por Responder
  client_total_sent_messages: number;   // Mensajes Enviados Totales
}

export interface IndividualKpiRow {
  userId: number;
  userName: string;
  kpis: IndividualKpis;
}

// ===== DROPDOWN OPTIONS =====

export interface DropdownOption {
  label: string;
  value: string | number;
}

// ===== API RESPONSE =====

export interface KpiResponse {
  overall_kpis: OverallKpis;
  individual_kpis: Record<number, IndividualKpis>;
  comparison_label: string;
  dropdown_options: [string, string, string | number][];
  show_close_type_kpis: boolean; // Determined by client_settings.ticket_close_types
}

// ===== REQUEST PARAMS =====

export interface KpiRequestParams {
  button_id: PeriodType;
  object?: KpiObjectType;
  object_option?: string | number;
  from_date?: string;
  to_date?: string;
}

export interface ExportKpiParams {
  last_x_days?: number;
  from_date?: string;
  to_date?: string;
  object?: KpiObjectType;
  object_option?: string | number;
}

// ===== KPI CARD CONFIG =====

export interface KpiCardConfig {
  key: keyof OverallKpiValues;
  title: string;
  tooltip: string;
  unit?: string;
  invertColor?: boolean; // Para KPIs donde incremento es negativo (ej: tiempo respuesta)
  icon?: string;
  visibleFor?: ('admin' | 'manager_level_4' | 'agent')[];
}

export const KPI_CARDS_CONFIG: KpiCardConfig[] = [
  {
    key: 'unique_clients',
    title: 'Clientes Únicos',
    tooltip: 'Cant de clientes únicos que abrieron casos en el período',
    icon: 'ph-users'
  },
  {
    key: 'new_cases_period',
    title: 'Nuevos Casos',
    tooltip: 'Cant de nuevos casos abiertos en el período',
    icon: 'ph-ticket'
  },
  {
    key: 'open_cases',
    title: 'Total Casos Abiertos',
    tooltip: 'Total global de casos abiertos hasta hoy',
    icon: 'ph-folder-open',
    invertColor: true
  },
  {
    key: 'first_response_time',
    title: 'Tiempo 1era Respuesta',
    tooltip: 'Tiempo en minutos que el agente demoró en responder el primer mensaje',
    unit: 'min',
    icon: 'ph-clock',
    invertColor: true
  },
  {
    key: 'tmo',
    title: 'Tiempo TMO',
    tooltip: 'Tiempo en minutos que el agente demoró en cerrar un caso',
    unit: 'min',
    icon: 'ph-timer',
    invertColor: true
  },
  {
    key: 'users_created',
    title: 'Clientes Creados',
    tooltip: 'Cantidad de nuevos clientes creados en el período',
    icon: 'ph-user-plus',
    visibleFor: ['admin', 'manager_level_4']
  },
  {
    key: 'contact_ratio',
    title: 'Tasa de Respuesta',
    tooltip: '% de Clientes que nos contactaron / Clientes Creados',
    unit: '%',
    icon: 'ph-chart-line-up',
    visibleFor: ['admin', 'manager_level_4']
  }
];

// ===== PERIOD CONFIG =====

export interface PeriodConfig {
  id: PeriodType;
  label: string;
  comparisonLabel: string;
}

export const PERIODS_CONFIG: PeriodConfig[] = [
  { id: 'today', label: 'Hoy', comparisonLabel: 'Desde ayer' },
  { id: 'last_7', label: 'Últimos 7 días', comparisonLabel: 'Desde la semana anterior' },
  { id: 'last_30', label: 'Últimos 30 días', comparisonLabel: 'Desde el mes anterior' },
  { id: 'last_180', label: 'Últimos 6 meses', comparisonLabel: 'Desde el semestre anterior' }
];

// ===== TABLE COLUMNS CONFIG =====

export interface TableColumnConfig {
  key: keyof IndividualKpis | 'userName';
  label: string;
  tooltip?: string;
  unit?: string;
}

export const INDIVIDUAL_KPI_COLUMNS: TableColumnConfig[] = [
  { key: 'userName', label: 'Nombre' },
  { key: 'client_responded_rate', label: 'Adherencia', tooltip: '% de Mensajes respondidos / Mensajes por Responder', unit: '%' },
  { key: 'new_cases', label: 'Casos de Clientes', tooltip: 'Total de Casos abiertos en el período' },
  { key: 'client_cases_to_close_period', label: 'Casos por Cerrar en Período', tooltip: 'Total de Casos por cerrar en el período' },
  { key: 'closed_con_acuerdo_cases', label: 'Casos Cerrados con Acuerdo', tooltip: 'Total de Casos cerrados con Acuerdo' },
  { key: 'closed_sin_acuerdo_cases', label: 'Casos Cerrados sin Acuerdo', tooltip: 'Total de Casos cerrados sin Acuerdo' },
  { key: 'client_unique_responded_to', label: 'Conversaciones Respondidas', tooltip: 'Cant de Mensajes Únicos respondidos' },
  { key: 'clients_to_respond_to', label: 'Conversaciones Por Responder', tooltip: 'Cant de mensajes únicos pendientes de respuesta' },
  { key: 'client_total_sent_messages', label: 'Mensajes Enviados Totales', tooltip: 'Total de mensajes enviados por el Agente' }
];

// ===== HELPER FUNCTIONS =====

export function getPeriodDays(periodId: PeriodType): number {
  switch (periodId) {
    case 'today': return 1;
    case 'last_7': return 7;
    case 'last_30': return 30;
    case 'last_180': return 180;
    case 'last_custom': return 0;
    default: return 1;
  }
}

export function formatPercentageChange(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return 'N/A';
  }
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

export function getPercentageChangeClass(value: number | null | undefined, invertColor: boolean = false): string {
  if (value === null || value === undefined) {
    return 'badge-neutral';
  }

  const isPositive = value >= 0;
  const isGood = invertColor ? !isPositive : isPositive;

  return isGood ? 'badge-success' : 'badge-danger';
}

export function calculateTableTotals(rows: IndividualKpiRow[]): IndividualKpis {
  const totals: IndividualKpis = {
    client_responded_rate: 0,
    new_cases: 0,
    client_cases_to_close_period: 0,
    closed_con_acuerdo_cases: 0,
    closed_sin_acuerdo_cases: 0,
    client_unique_responded_to: 0,
    clients_to_respond_to: 0,
    client_total_sent_messages: 0
  };

  if (rows.length === 0) return totals;

  let rateCount = 0;

  rows.forEach(row => {
    if (row.kpis.client_responded_rate > 0) {
      totals.client_responded_rate += row.kpis.client_responded_rate;
      rateCount++;
    }
    totals.new_cases += row.kpis.new_cases;
    totals.client_cases_to_close_period += row.kpis.client_cases_to_close_period;
    totals.closed_con_acuerdo_cases += row.kpis.closed_con_acuerdo_cases;
    totals.closed_sin_acuerdo_cases += row.kpis.closed_sin_acuerdo_cases;
    totals.client_unique_responded_to += row.kpis.client_unique_responded_to;
    totals.clients_to_respond_to += row.kpis.clients_to_respond_to;
    totals.client_total_sent_messages += row.kpis.client_total_sent_messages;
  });

  if (rateCount > 0) {
    totals.client_responded_rate = Math.round(totals.client_responded_rate / rateCount);
  }

  return totals;
}
