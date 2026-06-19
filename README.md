# MontjoyPlaces JavaScript SDK

Official JavaScript SDK for the Montjoy Places API with bundled TypeScript definitions.

- Homepage: https://montjoyplaces.com
- Support: paul@montjoyapp.com
- License: MIT

## React integration

The core SDK is framework-agnostic. The React Leaflet wrapper lives in the companion package `@montjoyplaces/react-leaflet`.

## Bulk custom places

```js
import { MontjoyPlaces } from "@montjoyplaces/sdk";

const client = new MontjoyPlaces({ apiKey: process.env.MONTJOY_PLACES_API_KEY });

const exported = await client.exportCustomPlaces({
  groupId: "group_123",
  includeHidden: true
});

const imported = await client.importCustomPlaces({
  mode: "upsert",
  rows: exported.rows.map((row) => ({
    custom_place_id: row.custom_place_id,
    group_id: row.group_id,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude
  }))
});
```

## Offline custom places

The offline client is available as an ESM subpath export. It wraps the regular
SDK client, caches reads, queues supported writes while offline, and flushes
them later.

```js
import { MontjoyPlaces } from "@montjoyplaces/sdk";
import { IndexedDbStore, MontjoyPlacesOffline } from "@montjoyplaces/sdk/offline";

const online = new MontjoyPlaces({ apiKey: process.env.MONTJOY_PLACES_API_KEY });
const places = new MontjoyPlacesOffline({
  client: online,
  store: new IndexedDbStore({ name: "montjoy-places" }),
  sync: { autoStart: true }
});

await places.hydrate({
  customPlaces: { groupId: "group_123", includeHidden: true }
});

const created = await places.createCustomPlace({
  groupId: "group_123",
  name: "Cached Field Note",
  latitude: 42.3601,
  longitude: -71.0589
});

if (created.queued) {
  console.log("Saved locally and queued for sync:", created.mutationId);
}
```

Supported offline writes are group create/update/delete, custom place
create/update/delete/hide, and global place overrides. Cached search works
against previous network results and locally cached custom places.
