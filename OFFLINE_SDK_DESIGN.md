# Montjoy Places Offline JavaScript SDK Design

This design layers an offline-first client on top of the current
`@montjoyplaces/sdk` package. The published package is `@montjoyplaces/sdk@1.0.3`
and the local source in this repository is `MontjoyPlaces-JS-SDK`.

The existing SDK should remain a small typed HTTP client. Offline behavior is a
separate adapter that composes the existing `MontjoyPlaces` class and owns local
storage, cached reads, mutation queuing, conflict handling, and sync state.

## Goals

- Read cached places, custom places, groups, categories, cities, and previous
  searches while offline.
- Queue mutating operations while offline and push them when connectivity
  returns.
- Preserve the current SDK mental model: methods such as `searchPlaces`,
  `createCustomPlace`, and `updateCustomPlace` still exist.
- Return optimistic results immediately for local user edits.
- Support browser, React Native, Electron, and Node through storage adapters.
- Keep cache and sync policy explicit so app teams can choose freshness,
  durability, and conflict behavior.

## Non-goals

- Full offline global place search across the entire Montjoy/Foursquare index.
  The SDK can search cached subsets only. Server search remains authoritative.
- Replacing the HTTP SDK.
- Inventing a database dependency for every runtime. The offline package should
  provide adapters and interfaces, not force one storage engine everywhere.

## Package Shape

Two packaging options are viable:

1. Add offline exports to `@montjoyplaces/sdk`.
2. Publish a companion package, `@montjoyplaces/offline-sdk`, that depends on
   `@montjoyplaces/sdk`.

The companion package is cleaner initially because it avoids adding storage
dependencies to the core SDK. It can be folded into the core package later via
subpath exports:

```json
{
  "exports": {
    ".": {
      "import": "./src/index.js",
      "require": "./src/index.cjs",
      "types": "./src/index.d.ts"
    },
    "./offline": {
      "import": "./src/offline/index.js",
      "types": "./src/offline/index.d.ts"
    }
  }
}
```

Usage with a subpath export:

```js
import { MontjoyPlaces } from "@montjoyplaces/sdk";
import { MontjoyPlacesOffline, IndexedDbStore } from "@montjoyplaces/sdk/offline";

const online = new MontjoyPlaces({ apiKey });
const places = new MontjoyPlacesOffline({
  client: online,
  store: new IndexedDbStore({ name: "montjoy-places" }),
  sync: {
    autoStart: true,
    retry: { minDelayMs: 1000, maxDelayMs: 60000 }
  }
});
```

## Public API

The offline client mirrors the current SDK where practical:

```ts
class MontjoyPlacesOffline {
  constructor(options: MontjoyPlacesOfflineOptions);

  readonly client: MontjoyPlaces;
  readonly store: OfflineStore;
  readonly sync: SyncController;

  hydrate(options?: HydrateOptions): Promise<HydrateResult>;
  clearCache(options?: ClearCacheOptions): Promise<void>;
  getStatus(): Promise<OfflineStatus>;
  subscribe(listener: OfflineEventListener): () => void;

  listGroups(params?: ListGroupsParams & OfflineReadOptions): Promise<GroupsListResponse>;
  createGroup(body: GroupCreateRequest, options?: OfflineWriteOptions): Promise<OfflineMutationResponse<GroupSingleResponse>>;
  updateGroup(groupId: string, body: GroupUpdateRequest, options?: OfflineWriteOptions): Promise<OfflineMutationResponse<GroupSingleResponse>>;
  deleteGroup(groupId: string, options?: OfflineWriteOptions): Promise<OfflineMutationResponse<GroupDeleteResponse>>;

  listCustomPlaces(params?: ListCustomPlacesParams & OfflineReadOptions): Promise<CustomPlacesListResponse>;
  exportCustomPlaces(params?: ExportCustomPlacesParams & OfflineReadOptions): Promise<CustomPlacesExportResponse>;
  createCustomPlace(body: CustomPlaceCreateRequest, options?: OfflineWriteOptions): Promise<OfflineMutationResponse<CustomPlaceSingleResponse>>;
  getCustomPlace(customPlaceId: string, options?: OfflineReadOptions): Promise<CustomPlaceSingleResponse>;
  updateCustomPlace(customPlaceId: string, body: CustomPlaceUpdateRequest, options?: OfflineWriteOptions): Promise<OfflineMutationResponse<CustomPlaceSingleResponse>>;
  deleteCustomPlace(customPlaceId: string, options?: OfflineWriteOptions): Promise<OfflineMutationResponse<{ ok: boolean; deleted?: boolean }>>;
  hideCustomPlace(customPlaceId: string, body: CustomPlaceHideRequest, options?: OfflineWriteOptions): Promise<OfflineMutationResponse<CustomPlaceSingleResponse>>;

  getPlace(placeId: string, options?: OfflineReadOptions): Promise<PlaceSingleResponse>;
  overridePlace(fsqPlaceId: string, body: OverrideRequest, options?: OfflineWriteOptions): Promise<OfflineMutationResponse<OverrideResponse>>;

  searchPlaces(params: SearchPlacesParams & OfflineReadOptions): Promise<SearchResponse & OfflineMetadata>;

  cachePlace(place: Place | CustomPlace): Promise<void>;
  cacheSearch(response: SearchResponse, params: SearchPlacesParams): Promise<void>;
}
```

Read options:

```ts
type ReadPolicy = "cache-first" | "network-first" | "cache-only" | "network-only" | "stale-while-revalidate";

interface OfflineReadOptions {
  readPolicy?: ReadPolicy;
  maxAgeMs?: number;
  allowStale?: boolean;
}
```

Write options:

```ts
type WritePolicy = "queue-if-offline" | "queue-always" | "network-only";

interface OfflineWriteOptions {
  writePolicy?: WritePolicy;
  idempotencyKey?: string;
  conflict?: "server-wins" | "client-wins" | "manual";
}

interface OfflineMutationResponse<T> {
  ok: boolean;
  queued: boolean;
  optimistic: boolean;
  mutationId?: string;
  response?: T;
  row?: unknown;
}
```

## Storage Model

The SDK should define a narrow storage interface and ship adapters:

- `IndexedDbStore` for browsers and Electron renderers.
- `SqliteStore` for React Native, Electron main, and Node.
- `MemoryStore` for tests and ephemeral sessions.
- Optional `LocalStorageStore` only for tiny demos; it is not appropriate for
  durable offline data.

Core tables/collections:

- `metadata`: schema version, tenant id, app id, last hydrate, last sync.
- `groups`: group rows by `group_id`.
- `custom_places`: custom place rows by `custom_place_id`.
- `places`: global/address place rows by `fsq_place_id` or place id.
- `searches`: search params hash, response ids, resolved metadata, timestamp.
- `lookup_us_cities`: cached city lookups by query/zipcode/nearest hash.
- `lookup_categories`: categories by `category_id`, plus query result indexes.
- `mutations`: queued writes in order.
- `tombstones`: local deletes/hides that must affect offline reads before sync.

Stored rows should include SDK metadata next to API data:

```ts
interface OfflineRecord<T> {
  key: string;
  value: T;
  tenantId: string;
  appId: string | null;
  groupId?: string | null;
  updatedAt?: string | null;
  cachedAt: string;
  dirty: boolean;
  deleted: boolean;
  pendingMutationIds: string[];
}
```

Queued mutations:

```ts
interface QueuedMutation {
  mutationId: string;
  idempotencyKey: string;
  methodName:
    | "createGroup"
    | "updateGroup"
    | "deleteGroup"
    | "createCustomPlace"
    | "updateCustomPlace"
    | "deleteCustomPlace"
    | "hideCustomPlace"
    | "overridePlace"
    | "importCustomPlaces";
  args: unknown[];
  entityType: "group" | "custom_place" | "override" | "bulk_import";
  entityId?: string;
  groupId?: string | null;
  createdAt: string;
  attemptCount: number;
  lastAttemptAt?: string;
  lastError?: SerializedError;
  status: "queued" | "syncing" | "conflict" | "failed" | "applied";
}
```

## Read Behavior

Default read policy should be `stale-while-revalidate`:

1. Return matching cache immediately when available.
2. Start a network request in the background when online.
3. Update local records from the network response.
4. Emit `cacheUpdated` so UI integrations can refresh.

Suggested method behavior:

- `searchPlaces`: cache and replay previous search responses. Offline search can
  also do lightweight local filtering over cached custom places by name, group,
  source, radius, and `customOnly`/`onlyCustom`.
- `listCustomPlaces` and `exportCustomPlaces`: serve from `custom_places`,
  including optimistic local rows and excluding local tombstones unless
  `includeHidden` asks for hidden rows.
- `getCustomPlace`: serve exact row from cache or throw a typed cache miss error.
- `getPlace`: serve cached global/address place from `places`.
- lookup endpoints: cache by normalized params and TTL because category/city data
  is relatively static.
- billing and `whoAmI`: network-first only, with optional cached fallback for
  status displays.

## Write Behavior

Default write policy should be `queue-if-offline`:

1. Try the network when online.
2. If the request succeeds, write the authoritative response into the cache.
3. If the network is unavailable or times out, create a queued mutation.
4. Apply an optimistic local projection so reads reflect the user action.
5. Emit `mutationQueued`.

Optimistic IDs:

- `createCustomPlace` should generate a local id such as
  `local_custom_place_<uuid>` until the server returns a permanent
  `custom_place_id`.
- `createGroup` should generate `local_group_<uuid>`.
- Updates and deletes reference server ids when possible; local ids are remapped
  after their create mutation succeeds.

Mutation compaction should run before sync:

- Create followed by update becomes one create with merged body.
- Create followed by delete can be dropped.
- Multiple updates to the same entity merge in order.
- Hide/unhide collapses to the latest hidden state.
- Delete wins over pending update/hide for the same entity.

## Sync Controller

```ts
class SyncController {
  start(): void;
  stop(): void;
  flush(options?: FlushOptions): Promise<SyncSummary>;
  retryMutation(mutationId: string): Promise<SyncSummary>;
  discardMutation(mutationId: string): Promise<void>;
  listMutations(filter?: MutationFilter): Promise<QueuedMutation[]>;
}
```

Sync loop:

1. Detect online state through `navigator.onLine`, failed fetches, and optional
   custom `connectivity` probe.
2. Acquire a store lock so only one browser tab/process flushes at a time.
3. Compact queued mutations.
4. Apply mutations in dependency order:
   - groups before places that reference those groups
   - creates before updates/deletes for the same local entity
   - imports as independent bulk jobs
5. Persist every successful server response and mark the mutation applied.
6. On transient errors, retry with exponential backoff.
7. On validation, auth, or conflict errors, mark the mutation failed/conflict and
   keep it visible to the app.
8. After a successful flush, refresh changed groups/custom places from the
   server.

Events:

```ts
type OfflineEvent =
  | { type: "statusChanged"; online: boolean; syncing: boolean }
  | { type: "cacheUpdated"; keys: string[] }
  | { type: "mutationQueued"; mutation: QueuedMutation }
  | { type: "mutationApplied"; mutation: QueuedMutation }
  | { type: "mutationFailed"; mutation: QueuedMutation; error: Error }
  | { type: "conflict"; mutation: QueuedMutation; serverRow?: unknown };
```

## Conflict Handling

The current API does not expose row versions, ETags, `updated_since`, or
server-side idempotency keys. The SDK can still support useful offline behavior,
but robust conflict detection requires small API additions.

Client-only conflict strategy for v1:

- Treat successful server responses as authoritative.
- If an update/delete returns 404, mark the queued mutation as conflict.
- If an update returns validation errors, mark failed and preserve the local row.
- Compare local `updated_at` captured at queue time with server `updated_at`
  when a fresh row can be fetched.

Recommended API additions:

- Add `version` or `revision` to groups and custom places.
- Accept `If-Match` or `expectedRevision` on update/delete/hide/override.
- Return `409 Conflict` with the current server row.
- Accept `Idempotency-Key` on mutating endpoints.
- Add `GET /v1/custom-places/changes?since=<cursor>` returning changed rows and
  tombstones.
- Add `GET /v1/groups/changes?since=<cursor>`.

Those additions make offline sync safe across multiple devices and tabs.

## Hydration

Hydration preloads the local cache:

```js
await places.hydrate({
  groups: true,
  customPlaces: {
    groupId: "group_123",
    includeHidden: true
  },
  categories: {
    roots: true,
    levels: [1, 2]
  },
  searches: [
    { q: "coffee", lat: 42.3601, lon: -71.0589, radiusMeters: 5000, limit: 50 }
  ]
});
```

Implementation:

- `listGroups` for group cache.
- `exportCustomPlaces` paginated by `nextCursor` for custom place cache.
- `searchCategories`/`getCategoryChildren` for selected category subsets.
- Optional saved searches for map areas the app expects offline.

## React Integration

The React Leaflet package can consume the offline client without changing map
semantics:

```jsx
<MontjoyPlacesMap
  client={offlinePlaces}
  q="coffee"
  center={[42.3601, -71.0589]}
  readPolicy="stale-while-revalidate"
/>
```

The map package currently constructs `new MontjoyPlaces({ apiKey, baseUrl,
fetch })` internally. Add an optional `client` prop so applications can pass a
plain online client or an offline client with the same `searchPlaces` method.

## Security and Privacy

- Do not store API keys in SDK-managed persistent storage.
- Store tenant/app metadata, not secrets.
- Allow apps to encrypt storage by wrapping an adapter.
- Provide `clearCache()` and `clearTenant(tenantId)` for logout.
- Scope all cache keys by tenant/app/group to avoid cross-account data leakage.

## Error Types

Add offline-specific errors without changing `MontjoyPlacesError`:

```ts
class MontjoyPlacesOfflineError extends Error {
  code:
    | "offline_cache_miss"
    | "offline_write_rejected"
    | "offline_conflict"
    | "offline_store_error"
    | "offline_sync_failed";
  cause?: unknown;
}
```

## Implementation Phases

### Phase 1: Cache reads

- Add offline package/export.
- Add `OfflineStore`, `MemoryStore`, and `IndexedDbStore`.
- Implement cached `searchPlaces`, `getPlace`, `listCustomPlaces`,
  `exportCustomPlaces`, `getCustomPlace`, and lookup caching.
- Add hydration through existing export/list/search APIs.

### Phase 2: Queued writes

- Add mutation queue and optimistic projections for groups and custom places.
- Implement `flush()`, retry/backoff, event subscription, and mutation listing.
- Add mutation compaction.
- Add React Leaflet `client` prop so maps can use the offline client.

### Phase 3: Conflict-aware sync

- Add API support for revisions, idempotency keys, and changes cursors.
- Implement revision-aware update/delete/hide/override.
- Add manual conflict resolver hooks.

### Phase 4: Production polish

- Add multi-tab locks, storage migrations, quota handling, and cache pruning.
- Add React hooks such as `useMontjoyPlacesOfflineStatus` and
  `useMontjoyPlacesSync`.
- Add browser, Node, and React Native examples.

## Minimal First Cut

The smallest valuable offline SDK can be:

- `MontjoyPlacesOffline`
- `IndexedDbStore`
- `MemoryStore`
- `hydrate({ customPlaces: ... })`
- Offline `listCustomPlaces`, `getCustomPlace`, `exportCustomPlaces`,
  `searchPlaces` over cached custom places
- Queued `createCustomPlace`, `updateCustomPlace`, `deleteCustomPlace`,
  `hideCustomPlace`
- Manual `sync.flush()`

That first cut solves the main product promise: apps can keep custom places on
device, let users add or edit them without connectivity, and push changes later
through the same `@montjoyplaces/sdk` API surface.
