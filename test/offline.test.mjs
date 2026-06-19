import assert from "node:assert/strict";
import test from "node:test";

import { MontjoyPlacesError } from "../src/index.js";
import { MemoryStore, MontjoyPlacesOffline } from "../src/offline/index.js";

test("createCustomPlace queues while offline and is visible to cache-only search", async () => {
  const ids = idSequence();
  const offline = new MontjoyPlacesOffline({
    client: {},
    store: new MemoryStore(),
    online: () => false,
    idGenerator: ids.next,
    now: fixedNow
  });

  const created = await offline.createCustomPlace({
    name: "Offline Coffee",
    latitude: 42.36,
    longitude: -71.05,
    locality: "Boston"
  });

  assert.equal(created.queued, true);
  assert.equal(created.optimistic, true);
  assert.equal(created.row.custom_place_id, "local_custom_place_id_1");

  const search = await offline.searchPlaces({
    q: "coffee",
    readPolicy: "cache-only"
  });

  assert.equal(search._offline.source, "local");
  assert.equal(search.rows.length, 1);
  assert.equal(search.rows[0].name, "Offline Coffee");

  const mutations = await offline.sync.listMutations();
  assert.equal(mutations.length, 1);
  assert.equal(mutations[0].methodName, "createCustomPlace");
});

test("flush applies queued custom place creates and replaces local ids", async () => {
  let online = false;
  const serverRows = new Map();
  const client = {
    async createCustomPlace(body) {
      const row = customPlace({ custom_place_id: "server_place_1", name: body.name });
      serverRows.set(row.custom_place_id, row);
      return { ok: true, row };
    }
  };
  const offline = new MontjoyPlacesOffline({
    client,
    store: new MemoryStore(),
    online: () => online,
    idGenerator: idSequence().next,
    now: fixedNow
  });

  const created = await offline.createCustomPlace({
    name: "Queued Place",
    latitude: 1,
    longitude: 2
  });

  assert.equal(created.row.custom_place_id, "local_custom_place_id_1");

  online = true;
  const summary = await offline.sync.flush();

  assert.deepEqual(summary, { ok: true, applied: 1, failed: 0, conflicts: 0, remaining: 0 });
  assert.equal(serverRows.size, 1);
  assert.equal(await offline.store.getCustomPlace("local_custom_place_id_1"), null);
  assert.equal((await offline.store.getCustomPlace("server_place_1")).name, "Queued Place");
});

test("flush remaps local group ids before dependent custom place creates", async () => {
  let online = false;
  const groups = new Map();
  const places = new Map();
  const client = {
    async createGroup(body) {
      const row = {
        group_id: "group_server_1",
        tenant_id: "tenant_1",
        name: body.name,
        created_at: fixedNow()
      };
      groups.set(row.group_id, row);
      return { ok: true, row };
    },
    async createCustomPlace(body) {
      assert.equal(body.groupId, "group_server_1");
      const row = customPlace({
        custom_place_id: "place_server_1",
        group_id: body.groupId,
        name: body.name
      });
      places.set(row.custom_place_id, row);
      return { ok: true, row };
    }
  };
  const offline = new MontjoyPlacesOffline({
    client,
    store: new MemoryStore(),
    online: () => online,
    idGenerator: idSequence().next,
    now: fixedNow
  });

  const group = await offline.createGroup({ name: "Offline Group" });
  await offline.createCustomPlace({
    groupId: group.row.group_id,
    name: "Dependent Place",
    latitude: 1,
    longitude: 2
  });

  online = true;
  const summary = await offline.sync.flush();

  assert.equal(summary.ok, true);
  assert.equal(summary.applied, 2);
  assert.deepEqual([...groups.keys()], ["group_server_1"]);
  assert.deepEqual([...places.values()].map((row) => row.group_id), ["group_server_1"]);
});

test("failed queued mutations remain inspectable", async () => {
  let online = false;
  const store = new MemoryStore();
  await store.putCustomPlace(customPlace({ custom_place_id: "server_place_1", name: "Original" }));

  const client = {
    async updateCustomPlace() {
      throw new MontjoyPlacesError("Validation failed", { status: 400, body: { error: "invalid" } });
    }
  };
  const offline = new MontjoyPlacesOffline({
    client,
    store,
    online: () => online,
    idGenerator: idSequence().next,
    now: fixedNow
  });

  await offline.updateCustomPlace("server_place_1", { name: "Queued Update" });

  online = true;
  const summary = await offline.sync.flush();
  const failed = await offline.sync.listMutations({ status: "failed" });

  assert.equal(summary.ok, false);
  assert.equal(summary.failed, 1);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].lastError.status, 400);
});

test("importCustomPlaces queues bulk rows and flushes later", async () => {
  let online = false;
  const imports = [];
  const client = {
    async importCustomPlaces(body) {
      imports.push(body);
      return {
        ok: true,
        imported: body.rows.length,
        created: body.rows.length,
        updated: 0,
        rows: body.rows.map((row, index) =>
          customPlace({
            custom_place_id: `server_import_${index + 1}`,
            group_id: row.groupId ?? null,
            name: row.name
          })
        )
      };
    }
  };
  const offline = new MontjoyPlacesOffline({
    client,
    store: new MemoryStore(),
    online: () => online,
    idGenerator: idSequence().next,
    now: fixedNow
  });

  const imported = await offline.importCustomPlaces({
    rows: [{ name: "Bulk Place", latitude: 1, longitude: 2 }]
  });

  assert.equal(imported.queued, true);
  assert.equal(imported.row, undefined);

  online = true;
  const summary = await offline.sync.flush();

  assert.equal(summary.ok, true);
  assert.equal(imports.length, 1);
  assert.equal((await offline.store.getCustomPlace("server_import_1")).name, "Bulk Place");
});

function idSequence() {
  let count = 0;
  return {
    next() {
      count += 1;
      return `id_${count}`;
    }
  };
}

function fixedNow() {
  return "2026-05-14T12:00:00.000Z";
}

function customPlace(overrides = {}) {
  return {
    custom_place_id: "place_1",
    tenant_id: "tenant_1",
    app_id: "app_1",
    group_id: null,
    owner_user_id: null,
    source: "tenant",
    fsq_place_id: null,
    name: "Place",
    latitude: 42.36,
    longitude: -71.05,
    address: null,
    locality: null,
    region: null,
    postcode: null,
    country: null,
    website: null,
    tel: null,
    email: null,
    tags: null,
    meta: null,
    created_at: fixedNow(),
    updated_at: fixedNow(),
    ...overrides
  };
}
