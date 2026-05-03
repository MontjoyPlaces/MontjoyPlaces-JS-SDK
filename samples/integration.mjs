import { MontjoyPlaces } from "../src/index.js";

const apiKey = process.env.MONTJOY_PLACES_API_KEY;

if (!apiKey) {
  throw new Error("Set MONTJOY_PLACES_API_KEY before running the sample.");
}

const client = new MontjoyPlaces({ apiKey });
const suffix = Date.now();
const groupName = `sdk-js-${suffix}`;

let groupId;
let customPlaceId;

try {
  const plans = await client.listBillingPlans();
  console.log("billing plans:", plans.plans.map((plan) => plan.code));

  const createdGroup = await client.createGroup({ name: groupName });
  groupId = createdGroup.row.group_id;
  console.log("created group:", createdGroup.row);

  const createdPlace = await client.createCustomPlace({
    groupId,
    name: `SDK JS Test Place ${suffix}`,
    latitude: 42.3601,
    longitude: -71.0589,
    address: "1 Beacon St",
    locality: "Boston",
    region: "MA",
    postcode: "02108",
    country: "US",
    website: "https://example.com/js",
    tags: ["sdk", "javascript"],
    meta: { source: "integration-sample" }
  });
  customPlaceId = createdPlace.row.custom_place_id;
  console.log("created custom place:", createdPlace.row);

  const fetchedPlace = await client.getCustomPlace(customPlaceId);
  console.log("fetched custom place:", fetchedPlace.row);

  const updatedPlace = await client.updateCustomPlace(customPlaceId, {
    name: `SDK JS Updated Place ${suffix}`,
    website: "https://example.com/js-updated",
    meta: { source: "integration-sample", updated: true }
  });
  console.log("updated custom place:", updatedPlace.row);

  const hiddenPlace = await client.hideCustomPlace(customPlaceId, { hidden: true });
  console.log("hidden custom place:", hiddenPlace.row);

  const unhiddenPlace = await client.hideCustomPlace(customPlaceId, { hidden: false });
  console.log("unhidden custom place:", unhiddenPlace.row);

  const customPlaces = await client.listCustomPlaces({
    groupId,
    limit: 10,
    includeHidden: true
  });
  console.log("group custom places:", customPlaces.rows.map((row) => row.name));

  const exportedPlaces = await client.exportCustomPlaces({
    groupId,
    limit: 10,
    includeHidden: true
  });
  console.log("exported custom places:", exportedPlaces.count);

  const importedPlaces = await client.importCustomPlaces({
    mode: "upsert",
    rows: exportedPlaces.rows.map((row) => ({
      custom_place_id: row.custom_place_id,
      group_id: row.group_id,
      fsq_place_id: row.fsq_place_id,
      owner_user_id: row.owner_user_id,
      source: row.source,
      name: row.name,
      latitude: row.latitude,
      longitude: row.longitude,
      address: row.address,
      locality: row.locality,
      region: row.region,
      postcode: row.postcode,
      country: row.country,
      website: row.website,
      tel: row.tel,
      email: row.email,
      tags: row.tags,
      meta: row.meta
    }))
  });
  console.log("imported custom places:", importedPlaces.imported);

  const search = await client.searchPlaces({
    q: "coffee near Boston MA",
    limit: 3
  });
  const firstPlaceId = search.rows.find((row) => row._source === "global")?.fsq_place_id;
  if (firstPlaceId) {
    const place = await client.getPlace(firstPlaceId);
    console.log("direct place lookup:", place.row);
  }
} finally {
  if (customPlaceId) {
    try {
      const deletedPlace = await client.deleteCustomPlace(customPlaceId);
      console.log("deleted custom place:", deletedPlace);
    } catch (error) {
      console.error("cleanup failed for custom place:", error);
    }
  }

  if (groupId) {
    try {
      const deletedGroup = await client.deleteGroup(groupId);
      console.log("deleted group:", deletedGroup);
    } catch (error) {
      console.error("cleanup failed for group:", error);
    }
  }
}
