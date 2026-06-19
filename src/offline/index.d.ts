import type {
  CategoryChildrenResponse,
  CategoryResponse,
  CategorySearchResponse,
  CustomPlace,
  CustomPlaceCreateRequest,
  CustomPlaceHideRequest,
  CustomPlaceSingleResponse,
  CustomPlaceUpdateRequest,
  CustomPlacesImportRequest,
  CustomPlacesImportResponse,
  CustomPlacesExportResponse,
  CustomPlacesListResponse,
  ExportCustomPlacesParams,
  GetCategoryChildrenParams,
  Group,
  GroupCreateRequest,
  GroupDeleteResponse,
  GroupSingleResponse,
  GroupUpdateRequest,
  GroupsListResponse,
  ListCustomPlacesParams,
  ListGroupsParams,
  LookupNearestUsCitiesParams,
  MontjoyPlaces,
  OverrideRequest,
  OverrideResponse,
  Place,
  PlaceSingleResponse,
  SearchCategoriesParams,
  SearchPlacesParams,
  SearchResponse,
  SearchUsCitiesParams,
  UsCityListResponse,
  UsCitySearchResponse,
  UsZipLookupResponse
} from "../index.js";

export type ReadPolicy = "cache-first" | "network-first" | "cache-only" | "network-only" | "stale-while-revalidate";
export type WritePolicy = "queue-if-offline" | "queue-always" | "network-only";
export type ConflictPolicy = "server-wins" | "client-wins" | "manual";
export type MutationStatus = "queued" | "syncing" | "conflict" | "failed" | "applied";

export interface OfflineReadOptions {
  readPolicy?: ReadPolicy;
  maxAgeMs?: number;
  allowStale?: boolean;
}

export interface OfflineWriteOptions {
  writePolicy?: WritePolicy;
  idempotencyKey?: string;
  conflict?: ConflictPolicy;
}

export interface OfflineMetadata {
  _offline?: {
    source: "network" | "cache" | "local";
    cached: boolean;
  };
}

export interface OfflineMutationResponse<T> {
  ok: boolean;
  queued: boolean;
  optimistic: boolean;
  mutationId?: string;
  response?: T;
  row?: unknown;
}

export interface SerializedError {
  name: string;
  message: string;
  code?: string;
  status?: number | null;
  body?: unknown;
}

export interface QueuedMutation {
  mutationId: string;
  idempotencyKey: string;
  methodName:
    | "createGroup"
    | "updateGroup"
    | "deleteGroup"
    | "createCustomPlace"
    | "importCustomPlaces"
    | "updateCustomPlace"
    | "deleteCustomPlace"
    | "hideCustomPlace"
    | "overridePlace";
  args: unknown[];
  entityType: "group" | "custom_place" | "override" | "bulk_import";
  entityId?: string;
  groupId?: string | null;
  createdAt: string;
  attemptCount: number;
  lastAttemptAt?: string;
  lastError?: SerializedError;
  status: MutationStatus;
}

export interface SyncSummary {
  ok: boolean;
  applied: number;
  failed: number;
  conflicts: number;
  remaining: number;
}

export interface MutationFilter {
  status?: MutationStatus | MutationStatus[];
}

export interface OfflineStatus {
  online: boolean;
  queuedMutations: number;
  failedMutations: number;
  conflictMutations: number;
}

export type OfflineEvent =
  | { type: "statusChanged"; online: boolean; syncing: boolean }
  | { type: "cacheUpdated"; keys: string[] }
  | { type: "mutationQueued"; mutation: QueuedMutation }
  | { type: "mutationApplied"; mutation: QueuedMutation }
  | { type: "mutationFailed"; mutation: QueuedMutation; error: unknown }
  | { type: "conflict"; mutation: QueuedMutation; error: unknown; serverRow?: unknown };

export type OfflineEventListener = (event: OfflineEvent) => void;

export interface OfflineStore {
  getMetadata(key: string): Promise<unknown>;
  setMetadata(key: string, value: unknown): Promise<void>;
  putGroup(row: Group): Promise<void>;
  getGroup(groupId: string): Promise<Group | null>;
  deleteGroup(groupId: string): Promise<void>;
  listGroups(): Promise<Group[]>;
  putCustomPlace(row: CustomPlace): Promise<void>;
  getCustomPlace(customPlaceId: string): Promise<CustomPlace | null>;
  deleteCustomPlace(customPlaceId: string): Promise<void>;
  listCustomPlaces(): Promise<CustomPlace[]>;
  putPlace(row: Place): Promise<void>;
  getPlace(placeId: string): Promise<Place | null>;
  putSearch(key: string, value: unknown): Promise<void>;
  getSearch(key: string): Promise<unknown>;
  putLookup(key: string, value: unknown): Promise<void>;
  getLookup(key: string): Promise<unknown>;
  enqueueMutation(mutation: QueuedMutation): Promise<void>;
  updateMutation(mutation: QueuedMutation): Promise<void>;
  removeMutation(mutationId: string): Promise<void>;
  listMutations(): Promise<QueuedMutation[]>;
  clear(): Promise<void>;
}

export interface IndexedDbStoreOptions {
  name?: string;
  version?: number;
  indexedDB?: IDBFactory;
}

export interface SyncOptions {
  autoStart?: boolean;
  retry?: {
    minDelayMs?: number;
    maxDelayMs?: number;
  };
}

export interface MontjoyPlacesOfflineOptions {
  client: MontjoyPlaces;
  store?: OfflineStore;
  readPolicy?: ReadPolicy;
  writePolicy?: WritePolicy;
  sync?: SyncOptions;
  online?: () => boolean;
  idGenerator?: () => string;
  now?: () => string;
}

export interface HydrateOptions {
  groups?: boolean | ListGroupsParams;
  customPlaces?: boolean | ExportCustomPlacesParams;
  searches?: SearchPlacesParams[];
}

export interface HydrateResult {
  ok: boolean;
  groups: number;
  customPlaces: number;
  searches: number;
  lookups: number;
}

export class MontjoyPlacesOfflineError extends Error {
  code:
    | "offline_cache_miss"
    | "offline_write_rejected"
    | "offline_conflict"
    | "offline_store_error"
    | "offline_sync_failed";
  cause?: unknown;
  constructor(code: MontjoyPlacesOfflineError["code"], message: string, options?: { cause?: unknown });
}

export class MemoryStore implements OfflineStore {
  constructor();
  getMetadata(key: string): Promise<unknown>;
  setMetadata(key: string, value: unknown): Promise<void>;
  putGroup(row: Group): Promise<void>;
  getGroup(groupId: string): Promise<Group | null>;
  deleteGroup(groupId: string): Promise<void>;
  listGroups(): Promise<Group[]>;
  putCustomPlace(row: CustomPlace): Promise<void>;
  getCustomPlace(customPlaceId: string): Promise<CustomPlace | null>;
  deleteCustomPlace(customPlaceId: string): Promise<void>;
  listCustomPlaces(): Promise<CustomPlace[]>;
  putPlace(row: Place): Promise<void>;
  getPlace(placeId: string): Promise<Place | null>;
  putSearch(key: string, value: unknown): Promise<void>;
  getSearch(key: string): Promise<unknown>;
  putLookup(key: string, value: unknown): Promise<void>;
  getLookup(key: string): Promise<unknown>;
  enqueueMutation(mutation: QueuedMutation): Promise<void>;
  updateMutation(mutation: QueuedMutation): Promise<void>;
  removeMutation(mutationId: string): Promise<void>;
  listMutations(): Promise<QueuedMutation[]>;
  clear(): Promise<void>;
}

export class IndexedDbStore implements OfflineStore {
  constructor(options?: IndexedDbStoreOptions);
  getMetadata(key: string): Promise<unknown>;
  setMetadata(key: string, value: unknown): Promise<void>;
  putGroup(row: Group): Promise<void>;
  getGroup(groupId: string): Promise<Group | null>;
  deleteGroup(groupId: string): Promise<void>;
  listGroups(): Promise<Group[]>;
  putCustomPlace(row: CustomPlace): Promise<void>;
  getCustomPlace(customPlaceId: string): Promise<CustomPlace | null>;
  deleteCustomPlace(customPlaceId: string): Promise<void>;
  listCustomPlaces(): Promise<CustomPlace[]>;
  putPlace(row: Place): Promise<void>;
  getPlace(placeId: string): Promise<Place | null>;
  putSearch(key: string, value: unknown): Promise<void>;
  getSearch(key: string): Promise<unknown>;
  putLookup(key: string, value: unknown): Promise<void>;
  getLookup(key: string): Promise<unknown>;
  enqueueMutation(mutation: QueuedMutation): Promise<void>;
  updateMutation(mutation: QueuedMutation): Promise<void>;
  removeMutation(mutationId: string): Promise<void>;
  listMutations(): Promise<QueuedMutation[]>;
  clear(): Promise<void>;
}

export class SyncController {
  start(): void;
  stop(): void;
  flush(options?: { includeFailed?: boolean }): Promise<SyncSummary>;
  retryMutation(mutationId: string): Promise<SyncSummary>;
  discardMutation(mutationId: string): Promise<void>;
  listMutations(filter?: MutationFilter): Promise<QueuedMutation[]>;
}

export class MontjoyPlacesOffline {
  readonly client: MontjoyPlaces;
  readonly store: OfflineStore;
  readonly sync: SyncController;
  readonly readPolicy: ReadPolicy;
  readonly writePolicy: WritePolicy;

  constructor(options: MontjoyPlacesOfflineOptions);
  subscribe(listener: OfflineEventListener): () => void;
  isOnline(): boolean;
  getStatus(): Promise<OfflineStatus>;
  clearCache(): Promise<void>;
  hydrate(options?: HydrateOptions): Promise<HydrateResult>;

  listBillingPlans(): ReturnType<MontjoyPlaces["listBillingPlans"]>;
  whoAmI(): ReturnType<MontjoyPlaces["whoAmI"]>;

  listGroups(params?: ListGroupsParams & OfflineReadOptions): Promise<GroupsListResponse & OfflineMetadata>;
  createGroup(body: GroupCreateRequest, options?: OfflineWriteOptions): Promise<OfflineMutationResponse<GroupSingleResponse>>;
  updateGroup(groupId: string, body: GroupUpdateRequest, options?: OfflineWriteOptions): Promise<OfflineMutationResponse<GroupSingleResponse>>;
  deleteGroup(groupId: string, options?: OfflineWriteOptions): Promise<OfflineMutationResponse<GroupDeleteResponse>>;

  listCustomPlaces(params?: ListCustomPlacesParams & OfflineReadOptions): Promise<CustomPlacesListResponse & OfflineMetadata>;
  exportCustomPlaces(params?: ExportCustomPlacesParams & OfflineReadOptions): Promise<CustomPlacesExportResponse & OfflineMetadata>;
  importCustomPlaces(body: CustomPlacesImportRequest, options?: OfflineWriteOptions): Promise<OfflineMutationResponse<CustomPlacesImportResponse>>;
  createCustomPlace(body: CustomPlaceCreateRequest, options?: OfflineWriteOptions): Promise<OfflineMutationResponse<CustomPlaceSingleResponse>>;
  getCustomPlace(customPlaceId: string, options?: OfflineReadOptions): Promise<CustomPlaceSingleResponse & OfflineMetadata>;
  updateCustomPlace(customPlaceId: string, body: CustomPlaceUpdateRequest, options?: OfflineWriteOptions): Promise<OfflineMutationResponse<CustomPlaceSingleResponse>>;
  deleteCustomPlace(customPlaceId: string, options?: OfflineWriteOptions): Promise<OfflineMutationResponse<{ ok: boolean; deleted?: boolean }>>;
  hideCustomPlace(customPlaceId: string, body: CustomPlaceHideRequest, options?: OfflineWriteOptions): Promise<OfflineMutationResponse<CustomPlaceSingleResponse>>;

  getPlace(placeId: string, options?: OfflineReadOptions): Promise<PlaceSingleResponse & OfflineMetadata>;
  overridePlace(fsqPlaceId: string, body: OverrideRequest, options?: OfflineWriteOptions): Promise<OfflineMutationResponse<OverrideResponse>>;

  searchPlaces(params: SearchPlacesParams & OfflineReadOptions): Promise<SearchResponse & OfflineMetadata>;
  lookupNearestUsCities(params: LookupNearestUsCitiesParams & OfflineReadOptions): Promise<UsCityListResponse & OfflineMetadata>;
  searchUsCities(params: SearchUsCitiesParams & OfflineReadOptions): Promise<UsCitySearchResponse & OfflineMetadata>;
  lookupUsZipcode(zipcode: string, options?: OfflineReadOptions): Promise<UsZipLookupResponse & OfflineMetadata>;
  searchCategories(params?: SearchCategoriesParams & OfflineReadOptions): Promise<CategorySearchResponse & OfflineMetadata>;
  getCategory(categoryId: string, options?: OfflineReadOptions): Promise<CategoryResponse & OfflineMetadata>;
  getCategoryChildren(categoryId: string, params?: GetCategoryChildrenParams & OfflineReadOptions): Promise<CategoryChildrenResponse & OfflineMetadata>;

  cachePlace(place: Place | CustomPlace): Promise<void>;
  cacheSearch(response: SearchResponse, params: SearchPlacesParams): Promise<void>;
}
