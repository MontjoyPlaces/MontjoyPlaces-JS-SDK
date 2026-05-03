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
