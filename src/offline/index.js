import { MontjoyPlacesError } from "../index.js";

const DEFAULT_READ_POLICY = "stale-while-revalidate";
const DEFAULT_WRITE_POLICY = "queue-if-offline";
const DEFAULT_STORE_NAME = "montjoy-places";
const STORE_NAMES = ["metadata", "groups", "custom_places", "places", "searches", "lookups", "mutations"];

export class MontjoyPlacesOfflineError extends Error {
  constructor(code, message, { cause } = {}) {
    super(message);
    this.name = "MontjoyPlacesOfflineError";
    this.code = code;
    this.cause = cause;
  }
}

export class MemoryStore {
  constructor() {
    this.metadata = new Map();
    this.groups = new Map();
    this.customPlaces = new Map();
    this.places = new Map();
    this.searches = new Map();
    this.lookups = new Map();
    this.mutations = new Map();
  }

  async getMetadata(key) {
    return clone(this.metadata.get(key) ?? null);
  }

  async setMetadata(key, value) {
    this.metadata.set(key, clone(value));
  }

  async putGroup(row) {
    this.groups.set(row.group_id, clone(row));
  }

  async getGroup(groupId) {
    return clone(this.groups.get(groupId) ?? null);
  }

  async deleteGroup(groupId) {
    this.groups.delete(groupId);
  }

  async listGroups() {
    return Array.from(this.groups.values()).map(clone).sort(compareBy("name", "group_id"));
  }

  async putCustomPlace(row) {
    this.customPlaces.set(row.custom_place_id, clone(row));
  }

  async getCustomPlace(customPlaceId) {
    return clone(this.customPlaces.get(customPlaceId) ?? null);
  }

  async deleteCustomPlace(customPlaceId) {
    this.customPlaces.delete(customPlaceId);
  }

  async listCustomPlaces() {
    return Array.from(this.customPlaces.values()).map(clone).sort(compareBy("custom_place_id"));
  }

  async putPlace(row) {
    this.places.set(readPlaceKey(row), clone(row));
  }

  async getPlace(placeId) {
    return clone(this.places.get(placeId) ?? null);
  }

  async putSearch(key, value) {
    this.searches.set(key, clone(value));
  }

  async getSearch(key) {
    return clone(this.searches.get(key) ?? null);
  }

  async putLookup(key, value) {
    this.lookups.set(key, clone(value));
  }

  async getLookup(key) {
    return clone(this.lookups.get(key) ?? null);
  }

  async enqueueMutation(mutation) {
    this.mutations.set(mutation.mutationId, clone(mutation));
  }

  async updateMutation(mutation) {
    this.mutations.set(mutation.mutationId, clone(mutation));
  }

  async removeMutation(mutationId) {
    this.mutations.delete(mutationId);
  }

  async listMutations() {
    return Array.from(this.mutations.values()).map(clone).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async clear() {
    this.metadata.clear();
    this.groups.clear();
    this.customPlaces.clear();
    this.places.clear();
    this.searches.clear();
    this.lookups.clear();
    this.mutations.clear();
  }
}

export class IndexedDbStore {
  constructor({ name = DEFAULT_STORE_NAME, version = 1, indexedDB: indexedDbImpl } = {}) {
    const resolvedIndexedDb = indexedDbImpl ?? globalThis.indexedDB;
    if (!resolvedIndexedDb) {
      throw new MontjoyPlacesOfflineError("offline_store_error", "indexedDB is not available in this runtime");
    }

    this.name = name;
    this.version = version;
    this.indexedDB = resolvedIndexedDb;
    this.dbPromise = null;
  }

  async getMetadata(key) {
    const record = await this.#get("metadata", key);
    return record?.value ?? null;
  }

  async setMetadata(key, value) {
    await this.#put("metadata", { key, value });
  }

  async putGroup(row) {
    await this.#put("groups", row);
  }

  async getGroup(groupId) {
    return this.#get("groups", groupId);
  }

  async deleteGroup(groupId) {
    await this.#delete("groups", groupId);
  }

  async listGroups() {
    return (await this.#all("groups")).sort(compareBy("name", "group_id"));
  }

  async putCustomPlace(row) {
    await this.#put("custom_places", row);
  }

  async getCustomPlace(customPlaceId) {
    return this.#get("custom_places", customPlaceId);
  }

  async deleteCustomPlace(customPlaceId) {
    await this.#delete("custom_places", customPlaceId);
  }

  async listCustomPlaces() {
    return (await this.#all("custom_places")).sort(compareBy("custom_place_id"));
  }

  async putPlace(row) {
    await this.#put("places", { ...row, __offline_key: readPlaceKey(row) });
  }

  async getPlace(placeId) {
    const row = await this.#get("places", placeId);
    if (!row) {
      return null;
    }

    const { __offline_key: _key, ...place } = row;
    return place;
  }

  async putSearch(key, value) {
    await this.#put("searches", { key, value });
  }

  async getSearch(key) {
    const record = await this.#get("searches", key);
    return record?.value ?? null;
  }

  async putLookup(key, value) {
    await this.#put("lookups", { key, value });
  }

  async getLookup(key) {
    const record = await this.#get("lookups", key);
    return record?.value ?? null;
  }

  async enqueueMutation(mutation) {
    await this.#put("mutations", mutation);
  }

  async updateMutation(mutation) {
    await this.#put("mutations", mutation);
  }

  async removeMutation(mutationId) {
    await this.#delete("mutations", mutationId);
  }

  async listMutations() {
    return (await this.#all("mutations")).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async clear() {
    const db = await this.#db();
    await Promise.all(STORE_NAMES.map((name) => requestToPromise(db.transaction(name, "readwrite").objectStore(name).clear())));
  }

  async #db() {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = this.indexedDB.open(this.name, this.version);

      request.onupgradeneeded = () => {
        const db = request.result;
        ensureObjectStore(db, "metadata", "key");
        ensureObjectStore(db, "groups", "group_id");
        ensureObjectStore(db, "custom_places", "custom_place_id");
        ensureObjectStore(db, "places", "__offline_key");
        ensureObjectStore(db, "searches", "key");
        ensureObjectStore(db, "lookups", "key");
        ensureObjectStore(db, "mutations", "mutationId");
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  async #get(storeName, key) {
    const db = await this.#db();
    return requestToPromise(db.transaction(storeName, "readonly").objectStore(storeName).get(key));
  }

  async #put(storeName, value) {
    const db = await this.#db();
    return requestToPromise(db.transaction(storeName, "readwrite").objectStore(storeName).put(clone(value)));
  }

  async #delete(storeName, key) {
    const db = await this.#db();
    return requestToPromise(db.transaction(storeName, "readwrite").objectStore(storeName).delete(key));
  }

  async #all(storeName) {
    const db = await this.#db();
    return requestToPromise(db.transaction(storeName, "readonly").objectStore(storeName).getAll());
  }
}

export class SyncController {
  constructor(offlineClient) {
    this.offlineClient = offlineClient;
    this.running = false;
    this.timer = null;
  }

  start() {
    if (this.running) {
      return;
    }

    this.running = true;
    this.#schedule(0);
    this.offlineClient.emit({ type: "statusChanged", online: this.offlineClient.isOnline(), syncing: false });
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  async flush({ includeFailed = false } = {}) {
    const mutations = await this.offlineClient.store.listMutations();
    const pending = mutations.filter((mutation) => mutation.status === "queued" || (includeFailed && mutation.status === "failed"));
    const summary = { ok: true, applied: 0, failed: 0, conflicts: 0, remaining: 0 };

    if (pending.length === 0) {
      summary.remaining = mutations.filter((mutation) => mutation.status !== "applied").length;
      return summary;
    }

    this.offlineClient.emit({ type: "statusChanged", online: this.offlineClient.isOnline(), syncing: true });

    for (const mutation of pending) {
      const syncingMutation = {
        ...mutation,
        status: "syncing",
        attemptCount: mutation.attemptCount + 1,
        lastAttemptAt: new Date().toISOString()
      };

      await this.offlineClient.store.updateMutation(syncingMutation);

      try {
        await this.offlineClient.applyQueuedMutation(syncingMutation);
        await this.offlineClient.store.removeMutation(syncingMutation.mutationId);
        summary.applied += 1;
        this.offlineClient.emit({ type: "mutationApplied", mutation: syncingMutation });
      } catch (error) {
        const status = isConflictError(error) ? "conflict" : "failed";
        const failedMutation = {
          ...syncingMutation,
          status,
          lastError: serializeError(error)
        };

        await this.offlineClient.store.updateMutation(failedMutation);

        if (status === "conflict") {
          summary.conflicts += 1;
          this.offlineClient.emit({ type: "conflict", mutation: failedMutation, error });
        } else {
          summary.failed += 1;
          this.offlineClient.emit({ type: "mutationFailed", mutation: failedMutation, error });
        }
      }
    }

    const remaining = await this.offlineClient.store.listMutations();
    summary.ok = summary.failed === 0 && summary.conflicts === 0;
    summary.remaining = remaining.length;
    this.offlineClient.emit({ type: "statusChanged", online: this.offlineClient.isOnline(), syncing: false });
    return summary;
  }

  async retryMutation(mutationId) {
    const mutations = await this.offlineClient.store.listMutations();
    const mutation = mutations.find((candidate) => candidate.mutationId === mutationId);
    if (!mutation) {
      return { ok: true, applied: 0, failed: 0, conflicts: 0, remaining: mutations.length };
    }

    await this.offlineClient.store.updateMutation({ ...mutation, status: "queued", lastError: undefined });
    return this.flush();
  }

  async discardMutation(mutationId) {
    await this.offlineClient.store.removeMutation(mutationId);
  }

  async listMutations(filter = {}) {
    const mutations = await this.offlineClient.store.listMutations();
    if (!filter.status) {
      return mutations;
    }

    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
    return mutations.filter((mutation) => statuses.includes(mutation.status));
  }

  #schedule(delayMs) {
    if (!this.running) {
      return;
    }

    this.timer = setTimeout(async () => {
      try {
        if (this.offlineClient.isOnline()) {
          await this.flush();
        }
      } finally {
        const delay = this.offlineClient.nextRetryDelay();
        this.#schedule(delay);
      }
    }, delayMs);
  }
}

export class MontjoyPlacesOffline {
  constructor({
    client,
    store = new MemoryStore(),
    readPolicy = DEFAULT_READ_POLICY,
    writePolicy = DEFAULT_WRITE_POLICY,
    sync = {},
    online,
    idGenerator,
    now
  } = {}) {
    if (!client) {
      throw new Error("client is required");
    }

    this.client = client;
    this.store = store;
    this.readPolicy = readPolicy;
    this.writePolicy = writePolicy;
    this.online = online;
    this.idGenerator = idGenerator ?? createId;
    this.now = now ?? (() => new Date().toISOString());
    this.listeners = new Set();
    this.retry = {
      minDelayMs: sync.retry?.minDelayMs ?? 1000,
      maxDelayMs: sync.retry?.maxDelayMs ?? 60000
    };
    this.sync = new SyncController(this);

    if (sync.autoStart) {
      this.sync.start();
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  isOnline() {
    if (typeof this.online === "function") {
      return Boolean(this.online());
    }

    if (typeof navigator !== "undefined" && "onLine" in navigator) {
      return navigator.onLine;
    }

    return true;
  }

  nextRetryDelay() {
    return this.retry.maxDelayMs;
  }

  async getStatus() {
    const mutations = await this.store.listMutations();
    return {
      online: this.isOnline(),
      queuedMutations: mutations.filter((mutation) => mutation.status === "queued").length,
      failedMutations: mutations.filter((mutation) => mutation.status === "failed").length,
      conflictMutations: mutations.filter((mutation) => mutation.status === "conflict").length
    };
  }

  async clearCache() {
    await this.store.clear();
    this.emit({ type: "cacheUpdated", keys: ["*"] });
  }

  async hydrate(options = {}) {
    const result = { ok: true, groups: 0, customPlaces: 0, searches: 0, lookups: 0 };

    if (options.groups) {
      const response = await this.client.listGroups(typeof options.groups === "object" ? options.groups : {});
      await this.#cacheGroups(response.rows);
      result.groups = response.rows.length;
    }

    if (options.customPlaces) {
      const params = typeof options.customPlaces === "object" ? { ...options.customPlaces } : {};
      let cursor = params.cursor ?? null;

      do {
        const response = await this.client.exportCustomPlaces({ ...params, cursor });
        await this.#cacheCustomPlaces(response.rows);
        result.customPlaces += response.rows.length;
        cursor = response.nextCursor;
      } while (cursor);
    }

    if (Array.isArray(options.searches)) {
      for (const params of options.searches) {
        const response = await this.client.searchPlaces(params);
        await this.cacheSearch(response, params);
        result.searches += 1;
      }
    }

    await this.store.setMetadata("lastHydrateAt", this.now());
    this.emit({ type: "cacheUpdated", keys: ["hydrate"] });
    return result;
  }

  listBillingPlans() {
    return this.client.listBillingPlans();
  }

  whoAmI() {
    return this.client.whoAmI();
  }

  async listGroups(params = {}) {
    const { offline, networkParams } = splitOfflineOptions(params);
    return this.#readResponse({
      policy: offline.readPolicy,
      cacheRead: async () => ({ ok: true, rows: applyLimit(await this.store.listGroups(), networkParams.limit) }),
      networkRead: () => this.client.listGroups(networkParams),
      cacheWrite: (response) => this.#cacheGroups(response.rows)
    });
  }

  createGroup(body, options = {}) {
    const localId = `local_group_${this.idGenerator()}`;
    const row = {
      group_id: localId,
      tenant_id: "offline",
      name: body.name,
      created_at: this.now(),
      _offline: { optimistic: true, dirty: true }
    };

    return this.#write({
      methodName: "createGroup",
      args: [body],
      entityType: "group",
      entityId: localId,
      options,
      optimistic: async () => {
        await this.store.putGroup(row);
        return { ok: true, row };
      },
      network: () => this.client.createGroup(body),
      persist: (response) => this.#cacheGroups([response.row])
    });
  }

  updateGroup(groupId, body, options = {}) {
    return this.#write({
      methodName: "updateGroup",
      args: [groupId, body],
      entityType: "group",
      entityId: groupId,
      options,
      optimistic: async () => {
        const existing = await this.store.getGroup(groupId);
        const row = { ...(existing ?? { group_id: groupId, tenant_id: "offline", created_at: this.now() }), ...body };
        row._offline = { optimistic: true, dirty: true };
        await this.store.putGroup(row);
        return { ok: true, row };
      },
      network: () => this.client.updateGroup(groupId, body),
      persist: (response) => this.#cacheGroups([response.row])
    });
  }

  deleteGroup(groupId, options = {}) {
    return this.#write({
      methodName: "deleteGroup",
      args: [groupId],
      entityType: "group",
      entityId: groupId,
      options,
      optimistic: async () => {
        await this.store.deleteGroup(groupId);
        return { ok: true, deleted: true };
      },
      network: () => this.client.deleteGroup(groupId)
    });
  }

  async listCustomPlaces(params = {}) {
    const { offline, networkParams } = splitOfflineOptions(params);
    return this.#readResponse({
      policy: offline.readPolicy,
      cacheRead: () => this.#customPlacesFromCache(networkParams, false),
      networkRead: () => this.client.listCustomPlaces(networkParams),
      cacheWrite: (response) => this.#cacheCustomPlaces(response.rows)
    });
  }

  async exportCustomPlaces(params = {}) {
    const { offline, networkParams } = splitOfflineOptions(params);
    return this.#readResponse({
      policy: offline.readPolicy,
      cacheRead: () => this.#customPlacesFromCache(networkParams, true),
      networkRead: () => this.client.exportCustomPlaces(networkParams),
      cacheWrite: (response) => this.#cacheCustomPlaces(response.rows)
    });
  }

  importCustomPlaces(body, options = {}) {
    const rows = body.rows ?? body.places ?? [];
    const groupId = body.groupId ?? null;

    return this.#write({
      methodName: "importCustomPlaces",
      args: [body],
      entityType: "bulk_import",
      options,
      optimistic: async () => {
        const optimisticRows = rows.map((row) =>
          normalizeCustomPlace({
            ...row,
            custom_place_id: row.customPlaceId ?? row.custom_place_id ?? `local_custom_place_${this.idGenerator()}`,
            group_id: row.groupId ?? row.group_id ?? groupId,
            fsq_place_id: row.fsqPlaceId ?? row.fsq_place_id ?? null,
            owner_user_id: row.ownerUserId ?? row.owner_user_id ?? null,
            tenant_id: "offline",
            app_id: null,
            source: row.source ?? "tenant",
            created_at: this.now(),
            updated_at: this.now(),
            _offline: { optimistic: true, dirty: true }
          })
        );

        await this.#cacheCustomPlaces(optimisticRows);
        return { ok: true, imported: optimisticRows.length, created: optimisticRows.length, updated: 0, rows: optimisticRows };
      },
      network: () => this.client.importCustomPlaces(body),
      persist: (response) => this.#cacheCustomPlaces(response.rows)
    });
  }

  createCustomPlace(body, options = {}) {
    const localId = body.customPlaceId ?? body.custom_place_id ?? `local_custom_place_${this.idGenerator()}`;
    const row = normalizeCustomPlace({
      ...body,
      custom_place_id: localId,
      group_id: body.groupId ?? body.group_id ?? null,
      fsq_place_id: body.fsqPlaceId ?? body.fsq_place_id ?? null,
      owner_user_id: body.ownerUserId ?? body.owner_user_id ?? null,
      tenant_id: "offline",
      app_id: null,
      source: body.source ?? "tenant",
      created_at: this.now(),
      updated_at: this.now(),
      _offline: { optimistic: true, dirty: true }
    });

    return this.#write({
      methodName: "createCustomPlace",
      args: [body],
      entityType: "custom_place",
      entityId: localId,
      groupId: row.group_id,
      options,
      optimistic: async () => {
        await this.store.putCustomPlace(row);
        return { ok: true, row };
      },
      network: () => this.client.createCustomPlace(body),
      persist: async (response) => {
        if (response.row.custom_place_id !== localId) {
          await this.#rememberLocalId(localId, response.row.custom_place_id);
          await this.store.deleteCustomPlace(localId);
        }

        await this.#cacheCustomPlaces([response.row]);
      }
    });
  }

  async getCustomPlace(customPlaceId, options = {}) {
    const { offline } = splitOfflineOptions(options);
    return this.#readResponse({
      policy: offline.readPolicy,
      cacheRead: async () => {
        const row = await this.store.getCustomPlace(customPlaceId);
        if (!row) {
          throw new MontjoyPlacesOfflineError("offline_cache_miss", `Custom place ${customPlaceId} is not cached`);
        }
        return { ok: true, row };
      },
      networkRead: () => this.client.getCustomPlace(customPlaceId),
      cacheWrite: (response) => this.#cacheCustomPlaces([response.row])
    });
  }

  updateCustomPlace(customPlaceId, body, options = {}) {
    return this.#write({
      methodName: "updateCustomPlace",
      args: [customPlaceId, body],
      entityType: "custom_place",
      entityId: customPlaceId,
      options,
      optimistic: async () => {
        const existing = await this.store.getCustomPlace(customPlaceId);
        if (!existing) {
          throw new MontjoyPlacesOfflineError("offline_cache_miss", `Custom place ${customPlaceId} is not cached`);
        }

        const row = normalizeCustomPlace({ ...existing, ...body, updated_at: this.now(), _offline: { optimistic: true, dirty: true } });
        await this.store.putCustomPlace(row);
        return { ok: true, row };
      },
      network: () => this.client.updateCustomPlace(customPlaceId, body),
      persist: (response) => this.#cacheCustomPlaces([response.row])
    });
  }

  deleteCustomPlace(customPlaceId, options = {}) {
    return this.#write({
      methodName: "deleteCustomPlace",
      args: [customPlaceId],
      entityType: "custom_place",
      entityId: customPlaceId,
      options,
      optimistic: async () => {
        await this.store.deleteCustomPlace(customPlaceId);
        return { ok: true, deleted: true };
      },
      network: () => this.client.deleteCustomPlace(customPlaceId)
    });
  }

  hideCustomPlace(customPlaceId, body, options = {}) {
    return this.#write({
      methodName: "hideCustomPlace",
      args: [customPlaceId, body],
      entityType: "custom_place",
      entityId: customPlaceId,
      options,
      optimistic: async () => {
        const existing = await this.store.getCustomPlace(customPlaceId);
        if (!existing) {
          throw new MontjoyPlacesOfflineError("offline_cache_miss", `Custom place ${customPlaceId} is not cached`);
        }

        const meta = mergeJsonObject(existing.meta, { hidden: Boolean(body.hidden) });
        const row = normalizeCustomPlace({ ...existing, meta, updated_at: this.now(), _offline: { optimistic: true, dirty: true } });
        await this.store.putCustomPlace(row);
        return { ok: true, row };
      },
      network: () => this.client.hideCustomPlace(customPlaceId, body),
      persist: (response) => this.#cacheCustomPlaces([response.row])
    });
  }

  async getPlace(placeId, options = {}) {
    const { offline } = splitOfflineOptions(options);
    return this.#readResponse({
      policy: offline.readPolicy,
      cacheRead: async () => {
        const row = await this.store.getPlace(placeId);
        if (!row) {
          throw new MontjoyPlacesOfflineError("offline_cache_miss", `Place ${placeId} is not cached`);
        }
        return { ok: true, row };
      },
      networkRead: () => this.client.getPlace(placeId),
      cacheWrite: async (response) => {
        if (response.row) {
          await this.store.putPlace(response.row);
        }
      }
    });
  }

  overridePlace(fsqPlaceId, body, options = {}) {
    return this.#write({
      methodName: "overridePlace",
      args: [fsqPlaceId, body],
      entityType: "override",
      entityId: fsqPlaceId,
      groupId: body.groupId ?? null,
      options,
      optimistic: async () => {
        const existing = await this.store.getCustomPlace(fsqPlaceId);
        const row = normalizeCustomPlace({
          ...(existing ?? {}),
          ...body,
          custom_place_id: fsqPlaceId,
          fsq_place_id: fsqPlaceId,
          group_id: body.groupId ?? existing?.group_id ?? null,
          tenant_id: existing?.tenant_id ?? "offline",
          app_id: existing?.app_id ?? null,
          source: existing?.source ?? "tenant",
          name: body.name ?? existing?.name ?? fsqPlaceId,
          latitude: body.latitude ?? existing?.latitude ?? 0,
          longitude: body.longitude ?? existing?.longitude ?? 0,
          created_at: existing?.created_at ?? this.now(),
          updated_at: this.now(),
          meta: body.hide === undefined ? body.meta ?? existing?.meta ?? null : mergeJsonObject(body.meta ?? existing?.meta, { hidden: Boolean(body.hide) }),
          _offline: { optimistic: true, dirty: true }
        });
        await this.store.putCustomPlace(row);
        return { ok: true, action: existing ? "updated" : "created", row };
      },
      network: () => this.client.overridePlace(fsqPlaceId, body),
      persist: (response) => this.#cacheCustomPlaces([response.row])
    });
  }

  async searchPlaces(params) {
    const { offline, networkParams } = splitOfflineOptions(params);
    const key = searchKey("searchPlaces", networkParams);
    const policy = offline.readPolicy ?? this.readPolicy;

    const cacheRead = async () => {
      const cached = await this.store.getSearch(key);
      if (cached) {
        return withOffline(cached.response, "cache");
      }

      return this.#localSearch(networkParams);
    };

    if (policy === "network-only") {
      return this.#searchNetwork(networkParams, key);
    }

    if (policy === "cache-only" || !this.isOnline()) {
      return cacheRead();
    }

    if (policy === "cache-first") {
      try {
        return await cacheRead();
      } catch (error) {
        if (!isCacheMiss(error)) {
          throw error;
        }
        return this.#searchNetwork(networkParams, key);
      }
    }

    if (policy === "network-first") {
      try {
        return await this.#searchNetwork(networkParams, key);
      } catch (error) {
        if (!shouldFallbackToCache(error)) {
          throw error;
        }
        return cacheRead();
      }
    }

    try {
      const cached = await cacheRead();
      this.#searchNetwork(networkParams, key).catch(() => {});
      return cached;
    } catch (error) {
      if (!isCacheMiss(error)) {
        throw error;
      }
      return this.#searchNetwork(networkParams, key);
    }
  }

  lookupNearestUsCities(params) {
    return this.#lookup("lookupNearestUsCities", params, () => this.client.lookupNearestUsCities(params));
  }

  searchUsCities(params) {
    return this.#lookup("searchUsCities", params, () => this.client.searchUsCities(params));
  }

  lookupUsZipcode(zipcode, options = {}) {
    return this.#lookup("lookupUsZipcode", { zipcode, ...options }, () => this.client.lookupUsZipcode(zipcode));
  }

  searchCategories(params = {}) {
    return this.#lookup("searchCategories", params, () => this.client.searchCategories(stripOfflineOptions(params)));
  }

  getCategory(categoryId, options = {}) {
    return this.#lookup("getCategory", { categoryId, ...options }, () => this.client.getCategory(categoryId));
  }

  getCategoryChildren(categoryId, params = {}) {
    return this.#lookup("getCategoryChildren", { categoryId, ...params }, () => this.client.getCategoryChildren(categoryId, stripOfflineOptions(params)));
  }

  async cachePlace(place) {
    if ("custom_place_id" in place) {
      await this.store.putCustomPlace(place);
    } else {
      await this.store.putPlace(place);
    }
    this.emit({ type: "cacheUpdated", keys: [readPlaceKey(place)] });
  }

  async cacheSearch(response, params) {
    const key = searchKey("searchPlaces", params);
    await this.store.putSearch(key, { response, params, cachedAt: this.now() });
    await this.#cacheSearchRows(response.rows);
  }

  async applyQueuedMutation(mutation) {
    const args = await this.#resolveMutationArgs(mutation);
    let response;

    switch (mutation.methodName) {
      case "createGroup":
        response = await this.client.createGroup(args[0]);
        await this.#rememberLocalId(mutation.entityId, response.row.group_id);
        await this.store.deleteGroup(mutation.entityId);
        await this.#cacheGroups([response.row]);
        return response;
      case "updateGroup":
        response = await this.client.updateGroup(args[0], args[1]);
        await this.#cacheGroups([response.row]);
        return response;
      case "deleteGroup":
        response = await this.client.deleteGroup(args[0]);
        await this.store.deleteGroup(args[0]);
        return response;
      case "createCustomPlace":
        response = await this.client.createCustomPlace(args[0]);
        await this.#rememberLocalId(mutation.entityId, response.row.custom_place_id);
        await this.store.deleteCustomPlace(mutation.entityId);
        await this.#cacheCustomPlaces([response.row]);
        return response;
      case "importCustomPlaces":
        response = await this.client.importCustomPlaces(args[0]);
        await this.#cacheCustomPlaces(response.rows);
        return response;
      case "updateCustomPlace":
        response = await this.client.updateCustomPlace(args[0], args[1]);
        await this.#cacheCustomPlaces([response.row]);
        return response;
      case "deleteCustomPlace":
        response = await this.client.deleteCustomPlace(args[0]);
        await this.store.deleteCustomPlace(args[0]);
        return response;
      case "hideCustomPlace":
        response = await this.client.hideCustomPlace(args[0], args[1]);
        await this.#cacheCustomPlaces([response.row]);
        return response;
      case "overridePlace":
        response = await this.client.overridePlace(args[0], args[1]);
        await this.#cacheCustomPlaces([response.row]);
        return response;
      default:
        throw new MontjoyPlacesOfflineError("offline_sync_failed", `Unsupported queued mutation ${mutation.methodName}`);
    }
  }

  async #lookup(methodName, params, networkRead) {
    const { offline } = splitOfflineOptions(params);
    const networkParams = stripOfflineOptions(params);
    const key = searchKey(methodName, networkParams);
    return this.#readResponse({
      policy: offline.readPolicy,
      cacheRead: async () => {
        const cached = await this.store.getLookup(key);
        if (!cached) {
          throw new MontjoyPlacesOfflineError("offline_cache_miss", `${methodName} result is not cached`);
        }
        return cached.response;
      },
      networkRead,
      cacheWrite: (response) => this.store.putLookup(key, { response, params: networkParams, cachedAt: this.now() })
    });
  }

  async #readResponse({ policy, cacheRead, networkRead, cacheWrite }) {
    const readPolicy = policy ?? this.readPolicy;

    if (readPolicy === "network-only") {
      const response = await networkRead();
      await cacheWrite?.(response);
      return withOffline(response, "network");
    }

    if (readPolicy === "cache-only" || !this.isOnline()) {
      return withOffline(await cacheRead(), "cache");
    }

    if (readPolicy === "cache-first") {
      try {
        return withOffline(await cacheRead(), "cache");
      } catch (error) {
        if (!isCacheMiss(error)) {
          throw error;
        }
        const response = await networkRead();
        await cacheWrite?.(response);
        return withOffline(response, "network");
      }
    }

    if (readPolicy === "network-first") {
      try {
        const response = await networkRead();
        await cacheWrite?.(response);
        return withOffline(response, "network");
      } catch (error) {
        if (!shouldFallbackToCache(error)) {
          throw error;
        }
        return withOffline(await cacheRead(), "cache");
      }
    }

    try {
      const cached = await cacheRead();
      networkRead()
        .then(async (response) => {
          await cacheWrite?.(response);
          this.emit({ type: "cacheUpdated", keys: ["stale-while-revalidate"] });
        })
        .catch(() => {});
      return withOffline(cached, "cache");
    } catch (error) {
      if (!isCacheMiss(error)) {
        throw error;
      }
      const response = await networkRead();
      await cacheWrite?.(response);
      return withOffline(response, "network");
    }
  }

  async #write({ methodName, args, entityType, entityId, groupId, options, optimistic, network, persist }) {
    const policy = options.writePolicy ?? this.writePolicy;

    if (policy !== "queue-always" && this.isOnline()) {
      try {
        const response = await network();
        await persist?.(response);
        return { ok: true, queued: false, optimistic: false, response, row: response?.row };
      } catch (error) {
        if (policy === "network-only" || !shouldQueueError(error)) {
          throw error;
        }
      }
    } else if (policy === "network-only") {
      const response = await network();
      await persist?.(response);
      return { ok: true, queued: false, optimistic: false, response, row: response?.row };
    }

    const optimisticResponse = await optimistic();
    const mutation = {
      mutationId: `mutation_${this.idGenerator()}`,
      idempotencyKey: options.idempotencyKey ?? `idem_${this.idGenerator()}`,
      methodName,
      args: clone(args),
      entityType,
      entityId,
      groupId,
      createdAt: this.now(),
      attemptCount: 0,
      status: "queued"
    };

    await this.store.enqueueMutation(mutation);
    this.emit({ type: "mutationQueued", mutation });
    this.emit({ type: "cacheUpdated", keys: [entityId].filter(Boolean) });
    return {
      ok: true,
      queued: true,
      optimistic: true,
      mutationId: mutation.mutationId,
      response: optimisticResponse,
      row: optimisticResponse?.row
    };
  }

  async #customPlacesFromCache(params, includeCount) {
    const includeHidden = normalizeIncludeHidden(params.includeHidden);
    let rows = await this.store.listCustomPlaces();
    rows = rows.filter((row) => matchesGroup(row, params.groupId));
    rows = rows.filter((row) => includeHidden || !isHidden(row));

    const start = params.cursor ? rows.findIndex((row) => row.custom_place_id === params.cursor) + 1 : 0;
    const limit = params.limit ?? 200;
    const count = rows.length;
    const paged = rows.slice(Math.max(0, start), Math.max(0, start) + limit);
    const next = rows[start + limit]?.custom_place_id ?? null;

    return includeCount
      ? { ok: true, count, rows: paged, nextCursor: next }
      : { ok: true, rows: paged, nextCursor: next };
  }

  async #localSearch(params) {
    const q = String(params.q ?? "").trim().toLowerCase();
    if (!q) {
      throw new MontjoyPlacesOfflineError("offline_cache_miss", "Search query is empty and no cached network search exists");
    }

    let rows = await this.store.listCustomPlaces();
    rows = rows.filter((row) => matchesGroup(row, params.groupId));
    rows = rows.filter((row) => !isHidden(row));
    rows = rows.filter((row) => customPlaceMatchesQuery(row, q));

    if (typeof params.lat === "number" && typeof params.lon === "number") {
      rows = rows
        .map((row) => ({ ...row, dist_m: distanceMeters(params.lat, params.lon, row.latitude, row.longitude), _source: "custom" }))
        .filter((row) => !params.radiusMeters || row.dist_m <= params.radiusMeters)
        .sort((a, b) => a.dist_m - b.dist_m);
    } else {
      rows = rows.map((row) => ({ ...row, _source: "custom" }));
    }

    const limitedRows = rows.slice(0, params.limit ?? 50);
    return withOffline(
      {
        ok: true,
        mode: "search",
        q: params.q,
        resolved: {
          mode: "typeahead",
          reason: "offline-cache",
          groupId: params.groupId ?? null,
          customOnly: true
        },
        count: limitedRows.length,
        rows: limitedRows
      },
      "local"
    );
  }

  async #searchNetwork(params, key) {
    const response = await this.client.searchPlaces(params);
    await this.store.putSearch(key, { response, params, cachedAt: this.now() });
    await this.#cacheSearchRows(response.rows);
    return withOffline(response, "network");
  }

  async #cacheGroups(rows = []) {
    await Promise.all(rows.map((row) => this.store.putGroup(row)));
  }

  async #cacheCustomPlaces(rows = []) {
    await Promise.all(rows.map((row) => this.store.putCustomPlace(row)));
  }

  async #cacheSearchRows(rows = []) {
    await Promise.all(
      rows.map((row) => {
        if (row._source === "custom" || "custom_place_id" in row) {
          return this.store.putCustomPlace(row);
        }

        return this.store.putPlace(row);
      })
    );
  }

  async #rememberLocalId(localId, serverId) {
    if (!localId || !serverId || localId === serverId || !String(localId).startsWith("local_")) {
      return;
    }

    const mappings = (await this.store.getMetadata("localIdMappings")) ?? {};
    mappings[localId] = serverId;
    await this.store.setMetadata("localIdMappings", mappings);
  }

  async #resolveMutationArgs(mutation) {
    const mappings = (await this.store.getMetadata("localIdMappings")) ?? {};
    const resolveId = (value) => mappings[value] ?? value;
    const args = clone(mutation.args);

    if (mutation.methodName === "createCustomPlace") {
      args[0] = resolveBodyReferences(args[0], resolveId);
      return args;
    }

    if (mutation.methodName === "importCustomPlaces") {
      args[0] = resolveImportBodyReferences(args[0], resolveId);
      return args;
    }

    if (mutation.methodName === "overridePlace") {
      args[1] = resolveBodyReferences(args[1], resolveId);
      return args;
    }

    if (typeof args[0] === "string") {
      args[0] = resolveId(args[0]);
    }

    if (args[1] && typeof args[1] === "object") {
      args[1] = resolveBodyReferences(args[1], resolveId);
    }

    return args;
  }
}

function ensureObjectStore(db, name, keyPath) {
  if (!db.objectStoreNames.contains(name)) {
    db.createObjectStore(name, { keyPath });
  }
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function splitOfflineOptions(params = {}) {
  const { readPolicy, maxAgeMs, allowStale, writePolicy, conflict, idempotencyKey, ...networkParams } = params;
  return {
    offline: { readPolicy, maxAgeMs, allowStale, writePolicy, conflict, idempotencyKey },
    networkParams
  };
}

function stripOfflineOptions(params = {}) {
  return splitOfflineOptions(params).networkParams;
}

function withOffline(response, source) {
  if (!response || typeof response !== "object") {
    return response;
  }

  return {
    ...response,
    _offline: {
      source,
      cached: source !== "network"
    }
  };
}

function applyLimit(rows, limit) {
  return typeof limit === "number" ? rows.slice(0, limit) : rows;
}

function normalizeIncludeHidden(value) {
  return value === true || value === "1";
}

function matchesGroup(row, groupId) {
  return groupId === undefined || groupId === null ? true : row.group_id === groupId;
}

function isHidden(row) {
  const meta = parseJsonObject(row.meta);
  return Boolean(meta?.hidden);
}

function customPlaceMatchesQuery(row, q) {
  return [row.name, row.address, row.locality, row.region, row.postcode, row.country]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q));
}

function normalizeCustomPlace(row) {
  return {
    ...row,
    group_id: row.group_id ?? row.groupId ?? null,
    owner_user_id: row.owner_user_id ?? row.ownerUserId ?? null,
    fsq_place_id: row.fsq_place_id ?? row.fsqPlaceId ?? null,
    source: row.source ?? "tenant",
    address: row.address ?? null,
    locality: row.locality ?? null,
    region: row.region ?? null,
    postcode: row.postcode ?? null,
    country: row.country ?? null,
    website: row.website ?? null,
    tel: row.tel ?? null,
    email: row.email ?? null,
    tags: row.tags ?? null,
    meta: row.meta ?? null
  };
}

function resolveBodyReferences(body, resolveId) {
  const resolved = { ...body };
  if (resolved.groupId) {
    resolved.groupId = resolveId(resolved.groupId);
  }
  if (resolved.group_id) {
    resolved.group_id = resolveId(resolved.group_id);
  }
  return resolved;
}

function resolveImportBodyReferences(body, resolveId) {
  const resolved = resolveBodyReferences(body, resolveId);
  for (const key of ["rows", "places"]) {
    if (Array.isArray(resolved[key])) {
      resolved[key] = resolved[key].map((row) => resolveBodyReferences(row, resolveId));
    }
  }
  return resolved;
}

function mergeJsonObject(value, patch) {
  return { ...parseJsonObject(value), ...patch };
}

function parseJsonObject(value) {
  if (!value) {
    return {};
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  return {};
}

function searchKey(methodName, params) {
  return `${methodName}:${stableStringify(params)}`;
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function compareBy(...keys) {
  return (left, right) => {
    for (const key of keys) {
      const result = String(left[key] ?? "").localeCompare(String(right[key] ?? ""));
      if (result !== 0) {
        return result;
      }
    }
    return 0;
  };
}

function readPlaceKey(row) {
  return row.custom_place_id ?? row.fsq_place_id;
}

function clone(value) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID().replaceAll("-", "");
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

function shouldFallbackToCache(error) {
  return isCacheMiss(error) || shouldQueueError(error);
}

function shouldQueueError(error) {
  if (!(error instanceof MontjoyPlacesError)) {
    return true;
  }

  return [408, 425, 429, 500, 502, 503, 504].includes(error.status);
}

function isConflictError(error) {
  return error instanceof MontjoyPlacesError && [404, 409, 412].includes(error.status);
}

function isCacheMiss(error) {
  return error instanceof MontjoyPlacesOfflineError && error.code === "offline_cache_miss";
}

function serializeError(error) {
  return {
    name: error?.name ?? "Error",
    message: error?.message ?? String(error),
    code: error?.code,
    status: error?.status,
    body: error?.body
  };
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const radius = 6371000;
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const deltaPhi = toRadians(lat2 - lat1);
  const deltaLambda = toRadians(lon2 - lon1);
  const a = Math.sin(deltaPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}
