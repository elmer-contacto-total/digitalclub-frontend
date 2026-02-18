/**
 * Global Search Models
 * Interfaces for the header global search dropdown
 */

/**
 * A single search result item
 */
export interface SearchResultItem {
  id: number;
  title: string;
  subtitle: string;
  route: string;
}

/**
 * A group of results for one entity category
 */
export interface SearchResultGroup {
  category: string;
  icon: string;
  items: SearchResultItem[];
  totalCount: number;
  viewAllRoute: string;
  viewAllQueryParams?: Record<string, string>;
}

/**
 * Full search response with all groups
 */
export interface GlobalSearchResult {
  groups: SearchResultGroup[];
  totalResults: number;
  query: string;
}
