const DEFAULT_BASE_URL = "https://api.montjoyplaces.com";

export class MontjoyPlacesError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = "MontjoyPlacesError";
    this.status = status ?? null;
    this.body = body ?? null;
  }
}

export class MontjoyPlaces {
  constructor({ apiKey, baseUrl = DEFAULT_BASE_URL, fetch: fetchImpl } = {}) {
    if (!apiKey) {
      throw new Error("apiKey is required");
    }

    const resolvedFetch = fetchImpl ?? globalThis.fetch?.bind(globalThis);
    if (typeof resolvedFetch !== "function") {
      throw new Error("A fetch implementation is required");
    }

    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.fetch = resolvedFetch;
  }

  listBillingPlans() {
    return this.#request("GET", "/billing/plans");
  }

  whoAmI() {
    return this.#request("GET", "/v1/whoami");
  }

  listGroups(params = {}) {
    return this.#request("GET", "/v1/groups", { query: params });
  }

  createGroup(body) {
    return this.#request("POST", "/v1/groups", { body });
  }

  updateGroup(groupId, body) {
    return this.#request("PUT", `/v1/groups/${encodeURIComponent(groupId)}`, { body });
  }

  deleteGroup(groupId) {
    return this.#request("DELETE", `/v1/groups/${encodeURIComponent(groupId)}`);
  }

  listCustomPlaces(params = {}) {
    return this.#request("GET", "/v1/custom-places", { query: params });
  }

  exportCustomPlaces(params = {}) {
    return this.#request("GET", "/v1/custom-places/export", { query: params });
  }

  importCustomPlaces(body) {
    return this.#request("POST", "/v1/custom-places/import", { body });
  }

  createCustomPlace(body) {
    return this.#request("POST", "/v1/custom-places", { body });
  }

  getCustomPlace(customPlaceId) {
    return this.#request("GET", `/v1/custom-places/${encodeURIComponent(customPlaceId)}`);
  }

  updateCustomPlace(customPlaceId, body) {
    return this.#request("PUT", `/v1/custom-places/${encodeURIComponent(customPlaceId)}`, { body });
  }

  deleteCustomPlace(customPlaceId) {
    return this.#request("DELETE", `/v1/custom-places/${encodeURIComponent(customPlaceId)}`);
  }

  hideCustomPlace(customPlaceId, body) {
    return this.#request("POST", `/v1/custom-places/${encodeURIComponent(customPlaceId)}/hide`, { body });
  }

  getPlace(placeId) {
    return this.#request("GET", `/v1/places/${encodeURIComponent(placeId)}`);
  }

  overridePlace(fsqPlaceId, body) {
    return this.#request("PUT", `/v1/places/${encodeURIComponent(fsqPlaceId)}/override`, { body });
  }

  lookupNearestUsCities(params) {
    return this.#request("GET", "/v1/lookup/us-cities/nearest", { query: params });
  }

  searchUsCities(params) {
    return this.#request("GET", "/v1/lookup/us-cities/search", { query: params });
  }

  lookupUsZipcode(zipcode) {
    return this.#request("GET", `/v1/lookup/us-cities/zip/${encodeURIComponent(zipcode)}`);
  }

  searchCategories(params = {}) {
    return this.#request("GET", "/v1/lookup/categories/search", { query: params });
  }

  getCategory(categoryId) {
    return this.#request("GET", `/v1/lookup/categories/${encodeURIComponent(categoryId)}`);
  }

  getCategoryChildren(categoryId, params = {}) {
    return this.#request("GET", `/v1/lookup/categories/${encodeURIComponent(categoryId)}/children`, {
      query: params
    });
  }

  searchPlaces(params) {
    return this.#request("GET", "/v1/search", { query: params });
  }

  async #request(method, path, { query, body } = {}) {
    const url = new URL(`${this.baseUrl}${path}`);
    appendQuery(url, query);

    const response = await this.fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-API-Key": this.apiKey
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    const payload = await parseJson(response);

    if (!response.ok) {
      throw new MontjoyPlacesError(readErrorMessage(payload, response), {
        status: response.status,
        body: payload
      });
    }

    return payload;
  }
}

function appendQuery(url, query) {
  if (!query) {
    return;
  }

  for (const [key, rawValue] of Object.entries(query)) {
    if (rawValue === undefined || rawValue === null) {
      continue;
    }

    if (key === "includeHidden" && typeof rawValue === "boolean") {
      url.searchParams.set(key, rawValue ? "1" : "0");
      continue;
    }

    if (Array.isArray(rawValue)) {
      for (const item of rawValue) {
        if (item !== undefined && item !== null) {
          url.searchParams.append(key, String(item));
        }
      }
      continue;
    }

    url.searchParams.set(key, String(rawValue));
  }
}

async function parseJson(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function readErrorMessage(payload, response) {
  if (payload && typeof payload === "object" && typeof payload.error === "string") {
    return payload.error;
  }

  return `Request failed with status ${response.status}`;
}
