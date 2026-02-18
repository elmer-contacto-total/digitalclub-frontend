/**
 * Global Search Service
 * Orchestrates parallel search across multiple endpoints based on user role
 */
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, forkJoin, of, map, catchError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { UserRole, RoleUtils } from '../models/user.model';
import { SearchResultGroup, SearchResultItem, GlobalSearchResult } from '../models/search.model';
import { PagedResponse } from '../models/pagination.model';
import { ProspectListResponse } from './prospect.service';

const SEARCH_PAGE_SIZE = 5;

@Injectable({
  providedIn: 'root'
})
export class SearchService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private baseUrl = environment.apiUrl;

  /**
   * Execute global search across all permitted entity types
   */
  search(term: string): Observable<GlobalSearchResult> {
    const role = this.authService.userRole();
    if (role === null) {
      return of({ groups: [], totalResults: 0, query: term });
    }

    const searches = this.getSearchesForRole(role, term);

    if (searches.length === 0) {
      return of({ groups: [], totalResults: 0, query: term });
    }

    return forkJoin(searches).pipe(
      map(groups => {
        const nonEmpty = groups.filter(g => g.items.length > 0);
        const total = nonEmpty.reduce((sum, g) => sum + g.totalCount, 0);
        return { groups: nonEmpty, totalResults: total, query: term };
      })
    );
  }

  private getSearchesForRole(role: UserRole, term: string): Observable<SearchResultGroup>[] {
    const searches: Observable<SearchResultGroup>[] = [];

    if (RoleUtils.isSuperAdmin(role)) {
      searches.push(this.searchClients(term));
      searches.push(this.searchUsers(term));
      searches.push(this.searchInternalUsers(term));
    } else if (role === UserRole.ADMIN) {
      searches.push(this.searchUsers(term));
      searches.push(this.searchInternalUsers(term));
    } else if (RoleUtils.isManager(role)) {
      searches.push(this.searchUsers(term));
      searches.push(this.searchSupervisorClients(term));
      searches.push(this.searchProspects(term));
    } else if (RoleUtils.isAgent(role)) {
      searches.push(this.searchAgentClients(term));
      searches.push(this.searchProspects(term));
    } else if (RoleUtils.isStaff(role)) {
      searches.push(this.searchUsers(term));
    } else if (role === UserRole.WHATSAPP_BUSINESS) {
      searches.push(this.searchAgentClients(term));
      searches.push(this.searchProspects(term));
    }

    return searches;
  }

  // --- Individual search methods ---

  private searchUsers(term: string): Observable<SearchResultGroup> {
    const params = new HttpParams()
      .set('search', term)
      .set('page', '1')
      .set('pageSize', SEARCH_PAGE_SIZE.toString());

    return this.http.get<PagedResponse<any>>(`${this.baseUrl}/app/users`, { params }).pipe(
      map(response => this.mapToGroup(
        'Usuarios', 'ph-users', '/app/users',
        response, term,
        (item: any) => ({
          id: item.id,
          title: `${item.firstName || ''} ${item.lastName || ''}`.trim() || item.email,
          subtitle: [item.email, item.phone].filter(Boolean).join(' · '),
          route: `/app/users/${item.id}`
        })
      )),
      catchError(() => of(this.emptyGroup('Usuarios', 'ph-users', '/app/users')))
    );
  }

  private searchInternalUsers(term: string): Observable<SearchResultGroup> {
    const params = new HttpParams()
      .set('search', term)
      .set('page', '1')
      .set('pageSize', SEARCH_PAGE_SIZE.toString());

    return this.http.get<PagedResponse<any>>(`${this.baseUrl}/app/users/internal`, { params }).pipe(
      map(response => this.mapToGroup(
        'Usuarios Internos', 'ph-user-gear', '/app/internal_users',
        response, term,
        (item: any) => ({
          id: item.id,
          title: `${item.firstName || ''} ${item.lastName || ''}`.trim() || item.email,
          subtitle: [item.email, RoleUtils.getDisplayName(item.role)].filter(Boolean).join(' · '),
          route: `/app/users/${item.id}`
        })
      )),
      catchError(() => of(this.emptyGroup('Usuarios Internos', 'ph-user-gear', '/app/internal_users')))
    );
  }

  private searchClients(term: string): Observable<SearchResultGroup> {
    // /app/clients does NOT support ?search= — fetch and filter client-side
    const params = new HttpParams()
      .set('page', '1')
      .set('pageSize', '50');

    return this.http.get<PagedResponse<any>>(`${this.baseUrl}/app/clients`, { params }).pipe(
      map(response => {
        const lowerTerm = term.toLowerCase();
        const filtered = (response.data || [])
          .filter((c: any) => {
            const name = (c.name || '').toLowerCase();
            const company = (c.companyName || '').toLowerCase();
            const docNumber = (c.docNumber || '').toLowerCase();
            return name.includes(lowerTerm) || company.includes(lowerTerm) || docNumber.includes(lowerTerm);
          })
          .slice(0, SEARCH_PAGE_SIZE);

        return {
          category: 'Organizaciones',
          icon: 'ph-buildings',
          items: filtered.map((c: any) => ({
            id: c.id,
            title: c.name || c.companyName || `Org #${c.id}`,
            subtitle: [c.companyName !== c.name ? c.companyName : null, c.docNumber].filter(Boolean).join(' · '),
            route: `/app/clients/${c.id}`
          })),
          totalCount: filtered.length,
          viewAllRoute: '/app/clients',
          viewAllQueryParams: {}
        } as SearchResultGroup;
      }),
      catchError(() => of(this.emptyGroup('Organizaciones', 'ph-buildings', '/app/clients')))
    );
  }

  private searchAgentClients(term: string): Observable<SearchResultGroup> {
    const params = new HttpParams()
      .set('search', term)
      .set('page', '1')
      .set('pageSize', SEARCH_PAGE_SIZE.toString());

    return this.http.get<PagedResponse<any>>(`${this.baseUrl}/app/users/agent_clients`, { params }).pipe(
      map(response => this.mapToGroup(
        'Clientes', 'ph-identification-card', '/app/agent_clients',
        response, term,
        (item: any) => ({
          id: item.id,
          title: item.fullName || `${item.firstName || ''} ${item.lastName || ''}`.trim() || item.email,
          subtitle: [item.phone, item.email].filter(Boolean).join(' · '),
          route: '/app/agent_clients'
        })
      )),
      catchError(() => of(this.emptyGroup('Clientes', 'ph-identification-card', '/app/agent_clients')))
    );
  }

  private searchSupervisorClients(term: string): Observable<SearchResultGroup> {
    const params = new HttpParams()
      .set('search', term)
      .set('page', '1')
      .set('pageSize', SEARCH_PAGE_SIZE.toString());

    return this.http.get<PagedResponse<any>>(`${this.baseUrl}/app/users/supervisor_clients`, { params }).pipe(
      map(response => this.mapToGroup(
        'Clientes', 'ph-identification-card', '/app/supervisor_clients',
        response, term,
        (item: any) => ({
          id: item.id,
          title: item.fullName || `${item.firstName || ''} ${item.lastName || ''}`.trim() || item.email,
          subtitle: [item.phone, item.managerName ? `Agente: ${item.managerName}` : null].filter(Boolean).join(' · '),
          route: '/app/supervisor_clients'
        })
      )),
      catchError(() => of(this.emptyGroup('Clientes', 'ph-identification-card', '/app/supervisor_clients')))
    );
  }

  private searchProspects(term: string): Observable<SearchResultGroup> {
    const params = new HttpParams()
      .set('search', term)
      .set('page', '0')
      .set('size', SEARCH_PAGE_SIZE.toString());

    return this.http.get<ProspectListResponse>(`${this.baseUrl}/app/prospects`, { params }).pipe(
      map(response => {
        const prospects = response.prospects || [];
        const total = response.total || prospects.length;
        return {
          category: 'Prospectos',
          icon: 'ph-user-plus',
          items: prospects.slice(0, SEARCH_PAGE_SIZE).map((p: any) => ({
            id: p.id,
            title: p.name || p.phone || `Prospecto #${p.id}`,
            subtitle: [p.phone, p.managerName ? `Agente: ${p.managerName}` : null].filter(Boolean).join(' · '),
            route: '/app/agent_prospects'
          })),
          totalCount: total,
          viewAllRoute: '/app/agent_prospects',
          viewAllQueryParams: { search: term }
        } as SearchResultGroup;
      }),
      catchError(() => of(this.emptyGroup('Prospectos', 'ph-user-plus', '/app/agent_prospects')))
    );
  }

  // --- Utilities ---

  private mapToGroup(
    category: string,
    icon: string,
    viewAllRoute: string,
    response: PagedResponse<any>,
    term: string,
    mapper: (item: any) => SearchResultItem
  ): SearchResultGroup {
    return {
      category,
      icon,
      items: (response.data || []).map(mapper),
      totalCount: response.meta?.totalItems || 0,
      viewAllRoute,
      viewAllQueryParams: { search: term }
    };
  }

  private emptyGroup(category: string, icon: string, viewAllRoute: string): SearchResultGroup {
    return { category, icon, items: [], totalCount: 0, viewAllRoute };
  }
}
