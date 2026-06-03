import { Directive, EventEmitter, HostBinding, HostListener, Input, Output } from '@angular/core';
import { SortState } from '../../core/utils/table-sort';

/**
 * Directiva para encabezados de tabla ordenables (client-side).
 *
 * Se aplica sobre un <th>. Marca la columna como ordenable (clic + flechas),
 * refleja el estado de orden actual y emite la columna clickeada.
 *
 * Las flechas se dibujan vía CSS global (ver styles/_components.scss):
 *   th.app-sort::after        -> ↕ (ordenable)
 *   th.app-sort--asc::after   -> ↑
 *   th.app-sort--desc::after  -> ↓
 *
 * Ejemplo:
 *   <th [appSort]="'email'" [appSortState]="sort()" (appSortChange)="onSort($event)">Email</th>
 */
@Directive({
  selector: '[appSort]',
  standalone: true
})
export class SortHeaderDirective {
  /** Clave de la columna (la que se pasa al accessor de orden). */
  @Input('appSort') column = '';

  /** Estado de orden actual de la tabla. */
  @Input() appSortState: SortState | null = null;

  /** Emite la clave de columna al hacer clic. */
  @Output() appSortChange = new EventEmitter<string>();

  @HostBinding('class.app-sort') readonly sortable = true;

  @HostBinding('class.app-sort--asc') get isAsc(): boolean {
    return this.appSortState?.column === this.column && this.appSortState?.dir === 'asc';
  }

  @HostBinding('class.app-sort--desc') get isDesc(): boolean {
    return this.appSortState?.column === this.column && this.appSortState?.dir === 'desc';
  }

  @HostListener('click')
  onClick(): void {
    if (this.column) {
      this.appSortChange.emit(this.column);
    }
  }
}
