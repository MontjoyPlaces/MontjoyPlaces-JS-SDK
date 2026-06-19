import { MontjoyPlacesOffline, MemoryStore } from "../src/offline/index.js";

let online = false;
const createdRows = new Map();

const mockClient = {
  createCustomPlace(body) {
    const id = `server_${createdRows.size + 1}`;
    const row = {
      custom_place_id: id,
      tenant_id: "tenant_demo",
      app_id: "app_demo",
      group_id: body.groupId ?? null,
      owner_user_id: body.ownerUserId ?? null,
      source: body.source ?? "tenant",
      fsq_place_id: body.fsqPlaceId ?? null,
      name: body.name,
      latitude: body.latitude,
      longitude: body.longitude,
      address: body.address ?? null,
      locality: body.locality ?? null,
      region: body.region ?? null,
      postcode: body.postcode ?? null,
      country: body.country ?? null,
      website: body.website ?? null,
      tel: body.tel ?? null,
      email: body.email ?? null,
      tags: body.tags ?? null,
      meta: body.meta ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    createdRows.set(id, row);
    return Promise.resolve({ ok: true, row });
  },

  updateCustomPlace(id, body) {
    const row = {
      ...createdRows.get(id),
      ...body,
      updated_at: new Date().toISOString()
    };
    createdRows.set(id, row);
    return Promise.resolve({ ok: true, row });
  },

  deleteCustomPlace(id) {
    createdRows.delete(id);
    return Promise.resolve({ ok: true, deleted: true });
  },

  hideCustomPlace(id, body) {
    const row = createdRows.get(id);
    const next = {
      ...row,
      meta: { ...(row.meta ?? {}), hidden: body.hidden },
      updated_at: new Date().toISOString()
    };
    createdRows.set(id, next);
    return Promise.resolve({ ok: true, row: next });
  },

  searchPlaces() {
    return Promise.resolve({
      ok: true,
      mode: "search",
      q: "",
      resolved: { mode: "typeahead" },
      count: createdRows.size,
      rows: Array.from(createdRows.values()).map((row) => ({ ...row, _source: "custom" }))
    });
  }
};

const places = new MontjoyPlacesOffline({
  client: mockClient,
  store: new MemoryStore(),
  online: () => online
});

const created = await places.createCustomPlace({
  name: "Offline demo place",
  latitude: 42.3601,
  longitude: -71.0589,
  locality: "Boston",
  region: "MA",
  country: "US"
});

console.log("queued:", created.queued, created.row.custom_place_id);

const cached = await places.searchPlaces({
  q: "demo",
  readPolicy: "cache-only"
});

console.log("cached rows:", cached.rows.length);

online = true;
const sync = await places.sync.flush();

console.log("sync:", sync);
console.log("server rows:", Array.from(createdRows.values()).map((row) => row.name));
