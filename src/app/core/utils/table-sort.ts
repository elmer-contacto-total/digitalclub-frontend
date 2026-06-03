/**
 * Ordenamiento client-side reutilizable para tablas.
 *
 * Ordena únicamente las filas que ya están en memoria (la página visible),
 * replicando el orden por columna asc/descendente que tenía el DataTable de Rails.
 *
 * Uso típico en un componente:
 *   sort = signal<SortState>({ column: null, dir: 'asc' });
 *   sortedRows = computed(() => sortRows(this.rows(), this.sort()));
 *   onSort(col: string) { this.sort.set(toggleSort(this.sort(), col)); }
 *
 * Y en el template, sobre cada <th> ordenable:
 *   <th [appSort]="'email'" [appSortState]="sort()" (appSortChange)="onSort($event)">Email</th>
 */

export type SortDir = 'asc' | 'desc';

export interface SortState {
  column: string | null;
  dir: SortDir;
}

/** Alterna el estado de orden al hacer clic en una columna. */
export function toggleSort(state: SortState, column: string): SortState {
  if (state.column === column) {
    return { column, dir: state.dir === 'asc' ? 'desc' : 'asc' };
  }
  return { column, dir: 'asc' };
}

/** Acceso por defecto al valor de una columna (propiedad directa de la fila). */
export type SortAccessor<T> = (row: T, column: string) => unknown;

/**
 * Devuelve una copia ordenada de `rows` según `state`.
 * Si no hay columna seleccionada, devuelve el arreglo original sin copiar.
 */
export function sortRows<T>(
  rows: T[],
  state: SortState,
  accessor?: SortAccessor<T>
): T[] {
  if (!state.column || !rows || rows.length < 2) return rows;
  const column = state.column;
  const get = accessor ?? ((row: T, col: string) => (row as Record<string, unknown>)[col]);
  const factor = state.dir === 'asc' ? 1 : -1;

  return [...rows].sort((a, b) => compareValues(get(a, column), get(b, column)) * factor);
}

/**
 * Comparador genérico: maneja null/vacío (van al final), números, booleanos
 * y cadenas (con orden natural y sin distinción de mayúsculas/tildes).
 */
function compareValues(a: unknown, b: unknown): number {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;  // vacíos al final
  if (bEmpty) return -1;

  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return a === b ? 0 : a ? 1 : -1;

  return String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' });
}
