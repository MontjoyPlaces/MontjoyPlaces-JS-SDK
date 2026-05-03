export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface PlanCatalogEntry {
  code: string;
  label: string;
  monthlyRequests: number | null;
  maxTenants: number | null;
  maxApps: number | null;
  maxApiKeys: number | null;
  overageAllowed: boolean;
  overageBlockRequests: number;
  overageBlockPriceCents: number;
  maxUsageMultiplier: number | null;
  hardCapByDefault: boolean;
}

export interface BillingPlansResponse {
  ok: boolean;
  plans: PlanCatalogEntry[];
}

export interface WhoAmIResponse {
  ok: boolean;
  apiKeyId: string;
  tenantId: string;
  appId: string;
  keyName: string;
  prefix: string;
  readOnly: boolean;
}

export interface Place {
  fsq_place_id: string;
  place_source: "fsq" | "address";
  name: string;
  latitude: number;
  longitude: number;
  address: string | null;
  locality: string | null;
  region: string | null;
  postcode: string | null;
  country: string | null;
  website: string | null;
  tel: string | null;
  email: string | null;
  formatted_address: string | null;
  geocode_provider: string | null;
  geocode_confidence: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface PlaceSingleResponse {
  ok: boolean;
  row: Place | null;
}

export interface Group {
  group_id: string;
  tenant_id: string;
  name: string;
  created_at: string;
}

export interface GroupCreateRequest {
  name: string;
}

export interface GroupUpdateRequest {
  name: string;
}

export interface GroupsListResponse {
  ok: boolean;
  rows: Group[];
}

export interface GroupSingleResponse {
  ok: boolean;
  row: Group;
}

export interface GroupDeleteResponse {
  ok: boolean;
  deleted: boolean;
}

export interface GroupInUseResponse {
  error: "group_in_use";
  count: number;
  message: string;
}

export interface CustomPlace {
  custom_place_id: string;
  tenant_id: string;
  app_id: string | null;
  group_id: string | null;
  owner_user_id: string | null;
  source: "tenant" | "user";
  fsq_place_id: string | null;
  name: string;
  latitude: number;
  longitude: number;
  address: string | null;
  locality: string | null;
  region: string | null;
  postcode: string | null;
  country: string | null;
  website: string | null;
  tel: string | null;
  email: string | null;
  tags: JsonValue | null;
  meta: JsonValue | null;
  created_at: string;
  updated_at: string;
  dist_m?: number | null;
}

export interface CustomPlacesListResponse {
  ok: boolean;
  rows: CustomPlace[];
  nextCursor: string | null;
}

export interface CustomPlacesExportResponse {
  ok: boolean;
  count: number;
  rows: CustomPlace[];
  nextCursor: string | null;
}

export interface CustomPlaceSingleResponse {
  ok: boolean;
  row: CustomPlace;
}

export interface CustomPlaceCreateRequest {
  groupId?: string | null;
  source?: "tenant" | "user";
  ownerUserId?: string | null;
  fsqPlaceId?: string | null;
  name: string;
  latitude: number;
  longitude: number;
  address?: string | null;
  locality?: string | null;
  region?: string | null;
  postcode?: string | null;
  country?: string | null;
  website?: string | null;
  tel?: string | null;
  email?: string | null;
  tags?: JsonValue | null;
  meta?: JsonValue | null;
}

export interface CustomPlaceImportRow extends CustomPlaceCreateRequest {
  customPlaceId?: string | null;
  custom_place_id?: string | null;
  group_id?: string | null;
  fsq_place_id?: string | null;
  owner_user_id?: string | null;
}

export interface CustomPlacesImportRequest {
  mode?: "upsert" | "create";
  groupId?: string | null;
  rows?: CustomPlaceImportRow[];
  places?: CustomPlaceImportRow[];
}

export interface ImportedCustomPlace extends CustomPlace {
  _import_action?: "created" | "updated";
}

export interface CustomPlacesImportResponse {
  ok: boolean;
  imported: number;
  created: number;
  updated: number;
  rows: ImportedCustomPlace[];
}

export interface CustomPlaceUpdateRequest {
  name?: string;
  latitude?: number;
  longitude?: number;
  address?: string | null;
  locality?: string | null;
  region?: string | null;
  postcode?: string | null;
  country?: string | null;
  website?: string | null;
  tel?: string | null;
  email?: string | null;
  tags?: JsonValue | null;
  meta?: JsonValue | null;
}

export interface CustomPlaceHideRequest {
  hidden: boolean;
}

export interface SearchRowGlobal {
  fsq_place_id: string;
  name: string;
  latitude: number;
  longitude: number;
  dist_m: number;
  category_name: string | null;
  _source: "global";
}

export interface SearchRowCustom extends CustomPlace {
  _source: "custom";
}

export type SearchRow = SearchRowGlobal | SearchRowCustom;

export interface SearchResolvedCenter {
  lat: number;
  lon: number;
  source: "request" | "locality" | "address_cache" | "address_geocode";
  kind: string;
  label: string;
}

export interface SearchResolved {
  mode: "address" | "nearby" | "typeahead" | "category";
  reason?: string;
  prefix?: string | null;
  categoryName?: string | null;
  groupId?: string | null;
  customOnly?: boolean | null;
  localityText?: string | null;
  addressQuery?: string | null;
  addressPlaceId?: string | null;
  formattedAddress?: string | null;
  geocodeProvider?: string | null;
  geocodeCacheHit?: boolean | null;
  addressRadiusMeters?: number | null;
  addressCandidateCount?: number | null;
  addressFilteredCount?: number | null;
  center?: SearchResolvedCenter;
}

export interface SearchResponse {
  ok: boolean;
  mode: "search";
  q: string;
  resolved: SearchResolved;
  count: number;
  rows: SearchRow[];
}

export interface UsCity {
  id: number;
  city: string;
  state_id: string;
  state_name: string;
  zipcode: string;
  lat: number;
  lon: number;
  dist_m?: number | null;
}

export interface UsCityListResponse {
  ok: boolean;
  count: number;
  rows: UsCity[];
}

export interface UsCitySearchResponse extends UsCityListResponse {
  q: string;
  state: string | null;
}

export interface UsZipLookupResponse extends UsCityListResponse {
  zipcode: string;
}

export interface CategoryHierarchyNode {
  level: number;
  category_id: string | null;
  category_name: string | null;
}

export interface CategoryLookupRow {
  category_id: string;
  category_name?: string | null;
  category_label?: string | null;
  category_level?: number | null;
  hierarchy: CategoryHierarchyNode[];
}

export interface CategorySearchResponse {
  ok: boolean;
  q: string | null;
  level: number | null;
  parentId: string | null;
  count: number;
  rows: CategoryLookupRow[];
}

export interface CategoryResponse {
  ok: boolean;
  row: CategoryLookupRow;
}

export interface CategoryChildrenResponse {
  ok: boolean;
  parent: CategoryLookupRow;
  count: number;
  rows: CategoryLookupRow[];
}

export interface OverrideRequest {
  groupId?: string | null;
  hide?: boolean;
  name?: string;
  latitude?: number;
  longitude?: number;
  address?: string | null;
  locality?: string | null;
  region?: string | null;
  postcode?: string | null;
  country?: string | null;
  website?: string | null;
  tel?: string | null;
  email?: string | null;
  tags?: JsonValue | null;
  meta?: JsonValue | null;
}

export interface OverrideResponse {
  ok: boolean;
  action: "created" | "updated";
  row: CustomPlace;
}

export interface ErrorResponse {
  error: string;
}

export interface ListGroupsParams {
  limit?: number;
}

export interface ListCustomPlacesParams {
  groupId?: string | null;
  limit?: number;
  cursor?: string | null;
  includeHidden?: "0" | "1" | boolean;
}

export interface ExportCustomPlacesParams {
  groupId?: string | null;
  limit?: number;
  cursor?: string | null;
  includeHidden?: "0" | "1" | boolean;
}

export interface LookupNearestUsCitiesParams {
  lat: number;
  lon: number;
  limit?: number;
}

export interface SearchUsCitiesParams {
  q: string;
  state?: string;
  limit?: number;
}

export interface SearchCategoriesParams {
  q?: string;
  level?: number;
  parentId?: string;
  limit?: number;
}

export interface GetCategoryChildrenParams {
  limit?: number;
}

export interface SearchPlacesParams {
  q: string;
  lat?: number;
  lon?: number;
  radiusMeters?: number;
  limit?: number;
  excludeCategoryMatch?: boolean;
  forceTypeahead?: boolean;
  customOnly?: boolean;
  onlyCustom?: boolean;
  isAddress?: boolean;
  groupId?: string | null;
}

export interface MontjoyPlacesOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export class MontjoyPlacesError extends Error {
  status: number | null;
  body: unknown;
  constructor(message: string, options?: { status?: number; body?: unknown });
}

export class MontjoyPlaces {
  constructor(options: MontjoyPlacesOptions);
  listBillingPlans(): Promise<BillingPlansResponse>;
  whoAmI(): Promise<WhoAmIResponse>;
  listGroups(params?: ListGroupsParams): Promise<GroupsListResponse>;
  createGroup(body: GroupCreateRequest): Promise<GroupSingleResponse>;
  updateGroup(groupId: string, body: GroupUpdateRequest): Promise<GroupSingleResponse>;
  deleteGroup(groupId: string): Promise<GroupDeleteResponse>;
  listCustomPlaces(params?: ListCustomPlacesParams): Promise<CustomPlacesListResponse>;
  exportCustomPlaces(params?: ExportCustomPlacesParams): Promise<CustomPlacesExportResponse>;
  importCustomPlaces(body: CustomPlacesImportRequest): Promise<CustomPlacesImportResponse>;
  createCustomPlace(body: CustomPlaceCreateRequest): Promise<CustomPlaceSingleResponse>;
  getCustomPlace(customPlaceId: string): Promise<CustomPlaceSingleResponse>;
  updateCustomPlace(customPlaceId: string, body: CustomPlaceUpdateRequest): Promise<CustomPlaceSingleResponse>;
  deleteCustomPlace(customPlaceId: string): Promise<{ ok: boolean; deleted?: boolean }>;
  hideCustomPlace(customPlaceId: string, body: CustomPlaceHideRequest): Promise<CustomPlaceSingleResponse>;
  getPlace(placeId: string): Promise<PlaceSingleResponse>;
  overridePlace(fsqPlaceId: string, body: OverrideRequest): Promise<OverrideResponse>;
  lookupNearestUsCities(params: LookupNearestUsCitiesParams): Promise<UsCityListResponse>;
  searchUsCities(params: SearchUsCitiesParams): Promise<UsCitySearchResponse>;
  lookupUsZipcode(zipcode: string): Promise<UsZipLookupResponse>;
  searchCategories(params?: SearchCategoriesParams): Promise<CategorySearchResponse>;
  getCategory(categoryId: string): Promise<CategoryResponse>;
  getCategoryChildren(categoryId: string, params?: GetCategoryChildrenParams): Promise<CategoryChildrenResponse>;
  searchPlaces(params: SearchPlacesParams): Promise<SearchResponse>;
}
