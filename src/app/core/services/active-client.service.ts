import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, catchError, of, map, throwError } from 'rxjs';
import { StorageService } from './storage.service';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';
import { environment } from '../../../environments/environment';

/**
 * Interface para cliente/organización activa
 * PARIDAD: Rails @current_client
 */
export interface ActiveClient {
  id: number;
  name: string;
  companyName?: string;
  status: string;
}

interface SetCurrentClientResponse {
  token: string;
  refreshToken: string;
  client: {
    id: number;
    name: string;
  };
  message: string;
}

const ACTIVE_CLIENT_KEY = 'active_client';

/**
 * Servicio para manejar la organización activa (solo Super Admin)
 * PARIDAD: Rails session[:current_client_id] y select_current_client_controller.js
 */
@Injectable({
  providedIn: 'root'
})
export class ActiveClientService {
  private http = inject(HttpClient);
  private storage = inject(StorageService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);

  // State
  private _activeClient = signal<ActiveClient | null>(null);
  private _availableClients = signal<ActiveClient[]>([]);
  private _loading = signal(false);

  // Public signals
  readonly activeClient = this._activeClient.asReadonly();
  readonly availableClients = this._availableClients.asReadonly();
  readonly loading = this._loading.asReadonly();

  readonly activeClientName = computed(() => {
    const client = this._activeClient();
    return client?.name || 'Sin organización';
  });

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Cargar cliente activo desde storage
   */
  private loadFromStorage(): void {
    const stored = this.storage.getString(ACTIVE_CLIENT_KEY);
    if (stored) {
      try {
        const client = JSON.parse(stored) as ActiveClient;
        this._activeClient.set(client);
      } catch {
        this.storage.remove(ACTIVE_CLIENT_KEY);
      }
    }
  }

  /**
   * Cargar lista de clientes disponibles
   * PARIDAD: Rails Client.active
   */
  loadAvailableClients(): Observable<void> {
    this._loading.set(true);
    return this.http.get<{ data: ActiveClient[] }>(`${environment.apiUrl}/app/clients`, {
      params: { status: 'active', pageSize: '1000' }
    }).pipe(
      tap(response => {
        const clients = response.data || [];
        this._availableClients.set(clients);

        // Si no hay cliente activo, seleccionar el primero (sin llamar al backend)
        if (!this._activeClient() && clients.length > 0) {
          this.setActiveClientLocal(clients[0]);
        }
        this._loading.set(false);
      }),
      catchError(error => {
        console.error('Error loading clients:', error);
        this._loading.set(false);
        return of(void 0);
      }),
      // Map to void since we store results in signals
      tap(() => {})
    ) as Observable<void>;
  }

  /**
   * Establecer cliente activo (solo Super Admin)
   * PARIDAD: Rails Admin::AdminController#set_current_client
   *
   * Llama al backend para obtener un nuevo JWT token con el clientId seleccionado.
   * El backend valida que el usuario sea Super Admin y que el cliente exista.
   */
  setActiveClient(client: ActiveClient, reload = true): Observable<void> {
    this._loading.set(true);

    return this.http.post<SetCurrentClientResponse>(
      `${environment.apiUrl}/app/set_current_client/${client.id}`,
      {}
    ).pipe(
      tap(response => {
        // Verificar que la respuesta tenga token
        if (!response.token) {
          throw new Error('No se recibió token del servidor');
        }

        // Actualizar el token con el nuevo clientId
        this.authService.updateToken(response.token, response.refreshToken);

        // Guardar cliente activo en localStorage
        this._activeClient.set(client);
        this.storage.setString(ACTIVE_CLIENT_KEY, JSON.stringify(client));

        this._loading.set(false);
        this.toast.success(`Organización cambiada a: ${client.name}`);

        if (reload) {
          // Pequeño delay para asegurar que el token se guardó
          setTimeout(() => {
            window.location.reload();
          }, 100);
        }
      }),
      catchError(error => {
        console.error('Error setting active client:', error);
        this._loading.set(false);

        // Mostrar error al usuario - NO hacer reload si falla
        const errorMsg = error?.error?.error || error?.message || 'Error al cambiar organización';
        this.toast.error(errorMsg);

        // NO hacer fallback al localStorage si el backend falla
        // Esto evita estados inconsistentes
        return throwError(() => error);
      }),
      map(() => void 0)
    );
  }

  /**
   * Establecer cliente activo sin llamar al backend (para inicialización)
   */
  setActiveClientLocal(client: ActiveClient): void {
    this._activeClient.set(client);
    this.storage.setString(ACTIVE_CLIENT_KEY, JSON.stringify(client));
  }

  /**
   * Obtener ID del cliente activo (para queries)
   */
  getActiveClientId(): number | null {
    return this._activeClient()?.id || null;
  }

  /**
   * Limpiar cliente activo (logout)
   */
  clear(): void {
    this._activeClient.set(null);
    this._availableClients.set([]);
    this.storage.remove(ACTIVE_CLIENT_KEY);
  }
}
