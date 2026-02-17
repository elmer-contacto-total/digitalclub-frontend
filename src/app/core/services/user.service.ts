/**
 * User Service
 * Comunicacion con Spring Boot /app/users endpoints
 * PARIDAD: digitalgroup-web-main-spring-boot/.../web/admin/UserAdminController.java
 */
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { User, UserListItem, UserOption, UserRole, UserStatus } from '../models/user.model';
import { PagedResponse, PaginationParams, DataTableParams } from '../models/pagination.model';

// Re-export types for backwards compatibility
export type { DataTableParams, PaginationParams, PagedResponse } from '../models/pagination.model';

// ===== REQUEST DTOs =====

export interface CreateUserRequest {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  password: string;
  role: UserRole;
  managerId?: number;
  importString?: string;  // PARIDAD RAILS: import_string field
}

export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  phone?: string;
  role?: UserRole;
  status?: UserStatus;
  managerId?: number;
  importString?: string;  // PARIDAD RAILS: import_string field
}

// Maps for converting numeric enums to string names for backend
const ROLE_TO_STRING: Record<UserRole, string> = {
  [UserRole.STANDARD]: 'STANDARD',
  [UserRole.SUPER_ADMIN]: 'SUPER_ADMIN',
  [UserRole.ADMIN]: 'ADMIN',
  [UserRole.MANAGER_LEVEL_1]: 'MANAGER_LEVEL_1',
  [UserRole.MANAGER_LEVEL_2]: 'MANAGER_LEVEL_2',
  [UserRole.MANAGER_LEVEL_3]: 'MANAGER_LEVEL_3',
  [UserRole.MANAGER_LEVEL_4]: 'MANAGER_LEVEL_4',
  [UserRole.AGENT]: 'AGENT',
  [UserRole.STAFF]: 'STAFF',
  [UserRole.WHATSAPP_BUSINESS]: 'WHATSAPP_BUSINESS'
};

const STATUS_TO_STRING: Record<UserStatus, string> = {
  [UserStatus.ACTIVE]: 'ACTIVE',
  [UserStatus.INACTIVE]: 'INACTIVE',
  [UserStatus.PENDING]: 'PENDING'
};

export interface AssignUserRequest {
  agentId: number;
}

export interface ReassignBulkRequest {
  userIds: number[];
  newAgentId: number;
}

/**
 * Additional params for agent clients endpoint
 * PARIDAD: Rails UsersController#agent_clients filters
 */
export interface AgentClientsParams {
  activeOnly?: boolean;
  ticketStatus?: 'all' | 'open' | 'closed';
  messageStatus?: 'all' | 'to_respond' | 'responded';
}

/**
 * Additional params for supervisor clients endpoint
 * PARIDAD: Rails UsersController#supervisor_clients filters
 */
export interface SupervisorClientsParams extends AgentClientsParams {
  managerId?: number;  // Filter by specific agent
}

export interface UpdateTempPasswordRequest {
  password: string;
  passwordConfirmation: string;
}

// ===== RESPONSE DTOs =====

export interface UserDetailResponse {
  user: User;
  manager?: UserOption;
  subordinates?: UserListItem[];
}

export interface LoginAsResponse {
  token: string;
  user: User;
  originalUserId: number;
}

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/app/users`;

  /**
   * Build HTTP params from pagination params
   */
  private buildPaginationParams(params: PaginationParams): HttpParams {
    let httpParams = new HttpParams();

    if (params.page !== undefined) httpParams = httpParams.set('page', params.page.toString());
    if (params.pageSize !== undefined) httpParams = httpParams.set('pageSize', params.pageSize.toString());
    if (params.search) httpParams = httpParams.set('search', params.search);
    if (params.sortBy) httpParams = httpParams.set('sortBy', params.sortBy);
    if (params.sortDir) httpParams = httpParams.set('sortDir', params.sortDir);

    return httpParams;
  }

  /**
   * Get users list with pagination
   */
  getUsers(params: PaginationParams = {}): Observable<PagedResponse<UserListItem>> {
    const httpParams = this.buildPaginationParams(params);
    return this.http.get<PagedResponse<UserListItem>>(this.baseUrl, { params: httpParams });
  }

  /**
   * Get single user by ID
   */
  getUser(id: number): Observable<UserDetailResponse> {
    return this.http.get<UserDetailResponse>(`${this.baseUrl}/${id}`);
  }

  /**
   * Get paginated subordinates of a user
   */
  getUserSubordinates(userId: number, params: PaginationParams = {}): Observable<PagedResponse<UserListItem>> {
    const httpParams = this.buildPaginationParams(params);
    return this.http.get<PagedResponse<UserListItem>>(`${this.baseUrl}/${userId}/subordinates`, { params: httpParams });
  }

  /**
   * Create new user
   * Converts numeric role to string name for backend
   */
  createUser(request: CreateUserRequest): Observable<User> {
    // Convert numeric role to string name for Spring Boot backend
    const backendRequest: Record<string, unknown> = {
      email: request.email,
      firstName: request.firstName,
      lastName: request.lastName,
      phone: request.phone,
      password: request.password,
      managerId: request.managerId,
      importString: request.importString,
      role: ROLE_TO_STRING[request.role] || 'STANDARD'
    };

    return this.http.post<User>(this.baseUrl, backendRequest);
  }

  /**
   * Update existing user
   * Converts numeric role/status to string names for backend
   */
  updateUser(id: number, request: UpdateUserRequest): Observable<User> {
    // Convert numeric enums to string names for Spring Boot backend
    const backendRequest: Record<string, unknown> = {
      firstName: request.firstName,
      lastName: request.lastName,
      phone: request.phone,
      managerId: request.managerId,
      importString: request.importString
    };

    if (request.role !== undefined) {
      backendRequest['role'] = ROLE_TO_STRING[request.role] || 'STANDARD';
    }
    if (request.status !== undefined) {
      backendRequest['status'] = STATUS_TO_STRING[request.status] || 'ACTIVE';
    }

    return this.http.put<User>(`${this.baseUrl}/${id}`, backendRequest);
  }

  /**
   * Delete (deactivate) user
   */
  deleteUser(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  /**
   * Get internal users (non-standard roles)
   */
  getInternalUsers(params: PaginationParams = {}): Observable<PagedResponse<UserListItem>> {
    const httpParams = this.buildPaginationParams(params);
    return this.http.get<PagedResponse<UserListItem>>(`${this.baseUrl}/internal`, { params: httpParams });
  }

  /**
   * Get available managers for role
   */
  getAvailableManagers(role?: UserRole): Observable<PagedResponse<UserOption>> {
    let httpParams = new HttpParams();
    if (role !== undefined) httpParams = httpParams.set('role', role.toString());

    return this.http.get<PagedResponse<UserOption>>(`${this.baseUrl}/available_managers`, { params: httpParams });
  }

  /**
   * Get clients for specific agent
   * PARIDAD: Rails UsersController#agent_clients
   */
  getAgentClients(params: PaginationParams & AgentClientsParams = {}): Observable<PagedResponse<UserListItem>> {
    let httpParams = this.buildPaginationParams(params);

    // Additional filters for agent clients
    if (params.activeOnly) {
      httpParams = httpParams.set('activeOnly', 'true');
    }
    if (params.ticketStatus && params.ticketStatus !== 'all') {
      httpParams = httpParams.set('ticketStatus', params.ticketStatus);
    }
    if (params.messageStatus && params.messageStatus !== 'all') {
      httpParams = httpParams.set('messageStatus', params.messageStatus);
    }

    return this.http.get<PagedResponse<UserListItem>>(`${this.baseUrl}/agent_clients`, { params: httpParams });
  }

  /**
   * Get clients of agents under supervisor
   * PARIDAD: Rails UsersController#supervisor_clients with filters
   */
  getSupervisorClients(params: PaginationParams & SupervisorClientsParams = {}): Observable<PagedResponse<UserListItem>> {
    let httpParams = this.buildPaginationParams(params);

    // Additional filters for supervisor clients
    if (params.managerId) {
      httpParams = httpParams.set('managerId', params.managerId.toString());
    }
    if (params.activeOnly) {
      httpParams = httpParams.set('activeOnly', 'true');
    }
    if (params.ticketStatus && params.ticketStatus !== 'all') {
      httpParams = httpParams.set('ticketStatus', params.ticketStatus);
    }
    if (params.messageStatus && params.messageStatus !== 'all') {
      httpParams = httpParams.set('messageStatus', params.messageStatus);
    }

    return this.http.get<PagedResponse<UserListItem>>(`${this.baseUrl}/supervisor_clients`, { params: httpParams });
  }

  /**
   * Get agents under supervisor
   */
  getSupervisorAgents(params: PaginationParams = {}): Observable<PagedResponse<UserListItem>> {
    const httpParams = this.buildPaginationParams(params);
    return this.http.get<PagedResponse<UserListItem>>(`${this.baseUrl}/supervisor_agents`, { params: httpParams });
  }

  /**
   * Get prospects assigned to agent
   */
  getAgentProspects(params: PaginationParams = {}): Observable<PagedResponse<UserListItem>> {
    const httpParams = this.buildPaginationParams(params);
    return this.http.get<PagedResponse<UserListItem>>(`${this.baseUrl}/agent_prospects`, { params: httpParams });
  }

  /**
   * Get unassigned prospects
   */
  getUnassignedProspects(params: PaginationParams = {}): Observable<PagedResponse<UserListItem>> {
    const httpParams = this.buildPaginationParams(params);
    return this.http.get<PagedResponse<UserListItem>>(`${this.baseUrl}/unassigned_prospects`, { params: httpParams });
  }

  /**
   * Get users requiring response
   */
  getRequireResponse(params: PaginationParams = {}): Observable<PagedResponse<UserListItem>> {
    const httpParams = this.buildPaginationParams(params);
    return this.http.get<PagedResponse<UserListItem>>(`${this.baseUrl}/require_response`, { params: httpParams });
  }

  /**
   * Assign user to agent
   */
  assignUser(userId: number, agentId: number): Observable<User> {
    return this.http.post<User>(`${this.baseUrl}/${userId}/assign`, { agentId });
  }

  /**
   * Login as another user (impersonation)
   */
  loginAs(userId: number): Observable<LoginAsResponse> {
    return this.http.post<LoginAsResponse>(`${this.baseUrl}/${userId}/login_as`, {});
  }

  /**
   * Return from impersonation
   */
  returnFromImpersonation(): Observable<LoginAsResponse> {
    return this.http.post<LoginAsResponse>(`${this.baseUrl}/return_from_impersonation`, {});
  }

  /**
   * Reassign users from one agent to another
   * PARIDAD RAILS: managers#update (assign_managers)
   */
  reassignBulk(request: ReassignBulkRequest): Observable<{ result: string; message: string; reassigned_count: number }> {
    return this.http.post<{ result: string; message: string; reassigned_count: number }>(`${this.baseUrl}/reassign_bulk`, request);
  }

  /**
   * Export client messages to CSV
   */
  exportClientMessages(clientId: number): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/export_client_messages`, {
      params: new HttpParams().set('clientId', clientId.toString()),
      responseType: 'blob'
    });
  }

  /**
   * Get agent's clients for supervisor view
   */
  getSupervisorGetAgentClients(managerId: number, params: PaginationParams = {}): Observable<PagedResponse<UserListItem>> {
    let httpParams = this.buildPaginationParams(params);
    httpParams = httpParams.set('managerId', managerId.toString());
    return this.http.get<PagedResponse<UserListItem>>(`${this.baseUrl}/supervisor_get_agent_clients`, { params: httpParams });
  }

  /**
   * Get subordinates (agents) for current user
   * PARIDAD RAILS: current_user.subordinates
   */
  getSubordinates(): Observable<UserOption[]> {
    return this.http.get<UserOption[]>(`${this.baseUrl}/subordinates`);
  }

  /**
   * Get clients of subordinates (subordinates of subordinates)
   * PARIDAD RAILS: managers#index JSON response
   */
  getSubordinatesClients(params: PaginationParams = {}): Observable<PagedResponse<UserListItem>> {
    const httpParams = this.buildPaginationParams(params);
    return this.http.get<PagedResponse<UserListItem>>(`${this.baseUrl}/subordinates_clients`, { params: httpParams });
  }

  /**
   * Upload avatar for a user
   * PARIDAD RAILS: Shrine avatar upload
   */
  uploadAvatar(userId: number, file: File): Observable<{ avatarUrl: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ avatarUrl: string }>(
      `${this.baseUrl}/${userId}/avatar`, formData
    );
  }

  /**
   * Send password reset instructions
   */
  sendResetPassword(userId: number): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.baseUrl}/send_reset_password`, { userId });
  }

  /**
   * Update temporary password
   */
  updateTempPassword(userId: number, request: UpdateTempPasswordRequest): Observable<User> {
    return this.http.post<User>(`${this.baseUrl}/update_temp_password`, {
      userId,
      ...request
    });
  }
}
