/**
 * threads-data-client
 * -------------------
 * A tiny, dependency-free client for pulling public Threads (Meta) data:
 * posts, replies, profiles, keyword search and creator discovery.
 *
 * It talks to three Actors on the Apify platform. You need a free Apify
 * account and an API token: https://console.apify.com/settings/integrations
 *
 * Design notes:
 *  - No dependencies. Node 18+ ships a global fetch.
 *  - Every method returns plain JSON records, already flattened.
 *  - `maxItems` is always honoured and caps billing, so a typo in a keyword
 *    list can never turn into a surprise bill.
 *
 * MIT licensed. Not affiliated with or endorsed by Meta.
 */

const API = 'https://api.apify.com/v2';

/** Actor IDs on the Apify platform. */
export const ACTORS = {
  /** Posts, replies, profiles and keyword search in one run. */
  scraper: 'bSNS2gMYKPKVJsz94',
  /** Keyword search only, with cross-keyword deduplication. */
  search: '9zImgTLV4Y9r6K1Tt',
  /** Creator/influencer discovery ranked by topic engagement. */
  creators: 'B4TWrq5C6iKFJEqX3',
};

/** Price per 1,000 delivered records, in USD. Used by `estimateCost`. */
export const PRICE_PER_1K = {
  [ACTORS.scraper]: 5.0,
  [ACTORS.search]: 5.0,
  [ACTORS.creators]: 20.0,
};

export class ThreadsApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'ThreadsApiError';
    this.status = status;
    this.body = body;
  }
}

export class ThreadsClient {
  /**
   * @param {string} token Apify API token.
   * @param {object} [opts]
   * @param {number} [opts.timeoutMs=600000] Give up on a run after this long.
   * @param {number} [opts.pollMs=3000] How often to poll run status.
   */
  constructor(token, { timeoutMs = 600_000, pollMs = 3_000 } = {}) {
    if (!token) throw new Error('An Apify API token is required.');
    this.token = token;
    this.timeoutMs = timeoutMs;
    this.pollMs = pollMs;
  }

  /**
   * Posts, replies and profiles. Mix URLs, @usernames and keywords freely.
   *
   * @param {object} input
   * @param {Array<string|{url:string}>} [input.startUrls] Post/profile/search URLs.
   * @param {string[]} [input.usernames] Bare usernames, with or without `@`.
   * @param {string[]} [input.searchQueries] Keywords.
   * @param {boolean} [input.includeReplies=true]
   * @param {number} [input.maxRepliesPerPost=25] Meta caps this near 20 logged out.
   * @param {'deep'|'standard'} [input.searchDepth='deep'] `deep` merges 5 search surfaces.
   * @param {'deep'|'standard'} [input.profileDepth='deep'] `deep` merges 4 profile tabs.
   * @param {number} [input.maxItems] Hard cap on billed records.
   * @returns {Promise<object[]>}
   */
  scrape(input = {}) {
    return this.run(ACTORS.scraper, normaliseStartUrls(input));
  }

  /**
   * Keyword search. A post matching several keywords is returned — and billed — once.
   *
   * @param {string[]|string} queries
   * @param {object} [opts] See `scrape` for shared fields.
   * @returns {Promise<object[]>}
   */
  search(queries, opts = {}) {
    return this.run(ACTORS.search, { searchQueries: toArray(queries), ...opts });
  }

  /**
   * Find creators posting about a topic, ranked by engagement *on that topic*
   * rather than by follower count.
   *
   * @param {string[]|string} topics
   * @param {object} [opts]
   * @param {boolean} [opts.enrichProfiles=true] Fetch each creator's profile too.
   * @returns {Promise<object[]>}
   */
  findCreators(topics, opts = {}) {
    return this.run(ACTORS.creators, { searchQueries: toArray(topics), ...opts });
  }

  /**
   * Run any of the Actors and return its dataset items.
   * Prefer the named helpers above; this is the escape hatch.
   */
  async run(actorId, input) {
    const started = await this.postJson(`/acts/${actorId}/runs`, input);
    const runId = started.data.id;
    const finished = await this.waitForRun(runId);

    if (finished.status !== 'SUCCEEDED') {
      throw new ThreadsApiError(
        `Run ${runId} finished with status ${finished.status}.`,
        { body: finished },
      );
    }
    return this.datasetItems(finished.defaultDatasetId);
  }

  /**
   * Read the `RUN_SUMMARY` an Actor writes to its key-value store. It carries
   * `itemsPushed`, `failedTasks`, `failureRate` and `renderPct`, so you can
   * audit reliability yourself instead of trusting the README.
   */
  async runSummary(runId) {
    const run = await this.getJson(`/actor-runs/${runId}`);
    const storeId = run.data.defaultKeyValueStoreId;
    const res = await fetch(
      `${API}/key-value-stores/${storeId}/records/RUN_SUMMARY?token=${this.token}`,
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new ThreadsApiError('Could not read RUN_SUMMARY.', { status: res.status });
    return res.json();
  }

  /**
   * What a run of `records` records costs, in USD. Pricing is pay-per-result,
   * so this is exact rather than a guess at compute time.
   */
  static estimateCost(actorId, records) {
    const per1k = PRICE_PER_1K[actorId];
    if (per1k === undefined) throw new Error(`Unknown actor id: ${actorId}`);
    return (records / 1000) * per1k;
  }

  // ---- internals -------------------------------------------------------

  async waitForRun(runId) {
    const deadline = Date.now() + this.timeoutMs;
    // Terminal states in the Apify run lifecycle.
    const done = new Set(['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT']);
    for (;;) {
      const { data } = await this.getJson(`/actor-runs/${runId}`);
      if (done.has(data.status)) return data;
      if (Date.now() > deadline) {
        throw new ThreadsApiError(`Run ${runId} still ${data.status} after ${this.timeoutMs}ms.`);
      }
      await sleep(this.pollMs);
    }
  }

  async datasetItems(datasetId) {
    // Apify paginates at 1,000 by default; walk until a short page comes back.
    const out = [];
    const limit = 1000;
    for (let offset = 0; ; offset += limit) {
      const res = await fetch(
        `${API}/datasets/${datasetId}/items?token=${this.token}&offset=${offset}&limit=${limit}&clean=true`,
      );
      if (!res.ok) throw new ThreadsApiError('Could not read dataset.', { status: res.status });
      const page = await res.json();
      out.push(...page);
      if (page.length < limit) return out;
    }
  }

  async getJson(path) {
    const res = await fetch(`${API}${path}?token=${this.token}`);
    if (!res.ok) {
      throw new ThreadsApiError(`GET ${path} failed.`, {
        status: res.status,
        body: await safeText(res),
      });
    }
    return res.json();
  }

  async postJson(path, body) {
    const res = await fetch(`${API}${path}?token=${this.token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    if (!res.ok) {
      throw new ThreadsApiError(`POST ${path} failed.`, {
        status: res.status,
        body: await safeText(res),
      });
    }
    return res.json();
  }
}

// ---- helpers -----------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const toArray = (v) => (Array.isArray(v) ? v : [v]);
const safeText = (res) => res.text().catch(() => undefined);

/** Let callers pass plain URL strings instead of `{ url }` objects. */
function normaliseStartUrls(input) {
  if (!input.startUrls) return input;
  return {
    ...input,
    startUrls: toArray(input.startUrls).map((u) => (typeof u === 'string' ? { url: u } : u)),
  };
}

export default ThreadsClient;
