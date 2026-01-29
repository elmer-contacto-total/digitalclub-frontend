/**
 * Standard REST pagination response from backend
 * PARIDAD SPRING BOOT: PagedResponse.java
 */
export interface PagedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface PaginationMeta {
  totalItems: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Pagination request parameters
 */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

/**
 * DataTables parameters (for components using DataTable)
 * @deprecated Use PaginationParams instead
 */
export interface DataTableParams extends PaginationParams {
  // Backwards compatibility - these map to page/pageSize
  start?: number;
  length?: number;
  draw?: number;
}

/**
 * Convert PagedResponse meta to DataTable-friendly format
 */
export function toDataTablePagination(meta: PaginationMeta) {
  return {
    recordsTotal: meta.totalItems,
    recordsFiltered: meta.totalItems,
    page: meta.page,
    pageSize: meta.pageSize,
    totalPages: meta.totalPages
  };
}

/**
 * Get total items from PagedResponse (convenience accessor)
 */
export function getTotalItems<T>(response: PagedResponse<T>): number {
  return response.meta.totalItems;
}
