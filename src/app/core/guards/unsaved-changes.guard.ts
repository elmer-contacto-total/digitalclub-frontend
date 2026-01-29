/**
 * Unsaved Changes Guard
 * Notifica al usuario si hay cambios sin guardar antes de navegar
 * PARIDAD: Rails confirmación antes de salir de formularios
 */
import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';

/**
 * Interface que deben implementar los componentes con formularios editables
 */
export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

/**
 * Guard que verifica si hay cambios sin guardar
 */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component) => {
  if (component.hasUnsavedChanges && component.hasUnsavedChanges()) {
    return window.confirm('Tienes cambios sin guardar. ¿Estás seguro de que deseas salir? Los cambios se perderán.');
  }
  return true;
};
