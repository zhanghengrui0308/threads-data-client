# threads-data-client

A tiny, dependency-free JavaScript client for pulling **public Threads (Meta)** data as clean JSON — posts, replies, profiles, keyword search and creator discovery.

**No login. No cookies. No account of yours is ever used.**

```bash
npm install github:zhanghengrui0308/threads-data-client
```

> Installing from GitHub because the npm package is not published yet. The
> command above is tested and works today; this line changes the moment
> `npm install threads-data-client` does.

```js
import { ThreadsClient } from 'threads-data-client';

const threads = new ThreadsClient(process.env.APIFY_TOKEN);

const posts = await threads.search(['ai agents', 'climate tech'], { maxItems: 200 });
console.log(posts[0].text, posts[0].like_count);
```

Node 18+. No dependencies — it is a few hundred lines over `fetch`.

---

## What it does

| Method | What you get |
|---|---|
| `threads.scrape({ startUrls, usernames, searchQueries })` | Posts, replies and profiles — mix inputs freely in one run |
| `threads.search(keywords)` | Keyword search, deduplicated across keywords |
| `threads.findCreators(topics)` | Creators ranked by engagement **on your topic**, not follower count |
| `threads.runSummary(runId)` | The run's own reliability report |
| `ThreadsClient.estimateCost(actorId, n, tier)` | USD cost before you run anything — tier-aware |

Execution happens on [Apify](https://apify.com), so you need a free account and an API token. The client handles starting the run, polling it, paginating the dataset and surfacing errors.

---

## Honest limitations — read this before you build on it

Meta caps what is visible without logging in. Measured August 2026:

| Surface | Logged-out ceiling |
|---|---|
| Replies to a post | ~20, then Threads shows *"Log in to see more replies."* |
| Keyword search | ~20 **per surface** — merged across 5 surfaces for ~50 |
| Posts on a profile | ~5 **per tab** — merged across 4 tabs for 16–22 |

**Replies cannot exceed this.** It is enforced by Meta, not by this client.

Search and profiles are the exceptions, because Meta caps each *entry point* rather than the total:

- Threads exposes five public search surfaces (`default`, `recent`, `top`, `users`, `tags`). Querying all five and merging measured **47 posts for `ai agents`** and **54 for `climate tech`**, against ~20 from the default surface alone.
- A profile has four public tabs (`threads`, `replies`, `media`, `reposts`). Merging all four measured **16 posts for `@nasa`** and **22 for `@mkbhd`**, against 5–6 from the main tab.

Neither is a bypass — every surface is the same public endpoint the Threads website itself uses, read logged out.

**If a tool promises you "all 800 replies" without an account, it is either driving logged-in accounts (against Threads' terms, and those accounts get banned) or it is not telling you the truth.**

📄 **[What Threads actually returns when you are not logged in](https://zhanghengrui0308.github.io/threads-data-client/)**
— the full measured reference behind these numbers, including the five search
surfaces, the four profile tabs, and why Meta serves a 255 KB empty shell to
datacenter IPs and a 906 KB server-rendered page to everyone else.

This is built for **per-target lookup at volume**: point it at 1,000 posts and get the top ~20 replies for each, reliably. It is not a bulk archive crawler.

---

## Reliability

The engine behind this client measured **0% failure across a 24-task benchmark** — 8 profiles, 10 posts, 6 keyword searches, **647 records delivered, 72 fetches with zero render fallbacks**, averaging 5.5 s per task.

Every run writes a `RUN_SUMMARY` you can read yourself:

```js
const summary = await threads.runSummary(runId);
// { tasks, itemsPushed, failedTasks, notFoundTargets, failureRate, renderPct }
```

Two details that matter in production:

- **Dead handles are not counted as failures.** Feed in 40 brand accounts and some will not exist on Threads (in our own test: `tesla`, `spacex`, `apple`, `stripe`, `vercel`, `anthropicai`). Those are reported separately in `notFoundTargets`, with the names listed, so `failureRate` stays honest *and* you learn which inputs to clean.
- **Recommended posts are filtered out of replies.** Threads serves *recommended* posts in the same payload as genuine replies. Unfiltered, you think you have 30 replies and 10 are strangers talking about something else. Each returned reply carries `root_post_author` and `replied_to_username` so you can verify the thread it belongs to.

---

## Examples

```js
// Replies to one post
const replies = await threads.scrape({
  startUrls: ['https://www.threads.com/@natgeo/post/Db5pTtZFAmB'],
  includeReplies: true,
});

// Everything a profile has published, across all four tabs
const profile = await threads.scrape({ usernames: ['mkbhd'], profileDepth: 'deep' });

// Micro-creators in a niche, with contact links
const creators = await threads.findCreators(['sustainable fashion'], {
  enrichProfiles: true,
  maxItems: 100,
});

// Know the bill before you run it
ThreadsClient.estimateCost('search', 500);             // 2.50 — FREE tier
ThreadsClient.estimateCost('search', 500, 'DIAMOND');  // 1.25 — top tier
```

Runnable versions live in [`examples/`](examples).

---

## Cost

Pay per delivered record. `maxItems` is a hard cap, so a typo in a keyword list cannot become a surprise bill.

Price per 1,000 delivered records, in USD. **Your Apify plan tier discounts it**
(verified against the published Actor pricing, 2026-08-20):

| Actor | FREE | BRONZE | SILVER | GOLD | PLATINUM | DIAMOND |
|---|---|---|---|---|---|---|
| Threads Scraper | $5.00 | $4.50 | $4.00 | $3.50 | $3.00 | $2.50 |
| Threads Search Scraper | $5.00 | $4.50 | $4.00 | $3.50 | $3.00 | $2.50 |
| Threads Creator Finder | $20.00 | $18.00 | $16.00 | $14.00 | $12.00 | $10.00 |

Each run also carries a flat start charge of $0.00003–$0.00005, which buys the
first five seconds of compute. `estimateCost` includes it, and **defaults to the
FREE tier** so an unspecified estimate is never an under-quote.

Duplicates within a run are never billed twice.

---

## The Actors behind this client

Source for the client is here; the scraping engines run on Apify:

- **[Threads Scraper — Posts, Profiles, Replies & Search](https://apify.com/northbound-data/threads-scraper)**
- **[Threads Search Scraper — Keyword Search to Clean JSON](https://apify.com/northbound-data/threads-search-scraper)**
- **[Threads Creator Finder — Micro-Influencer Discovery](https://apify.com/northbound-data/threads-creator-finder)**

### Ready-made configurations

Each of these is a pre-filled example you can run without writing any input JSON:

**Posts, replies & profiles**
- [Replies to any post](https://apify.com/northbound-data/threads-scraper/examples/threads-replies-for-a-post)
- [All posts from a profile](https://apify.com/northbound-data/threads-scraper/examples/threads-profile-posts)
- [Brand monitoring](https://apify.com/northbound-data/threads-scraper/examples/threads-brand-monitoring)
- [Export post comments](https://apify.com/northbound-data/threads-scraper/examples/threads-post-comments-export)
- [Competitor tracking](https://apify.com/northbound-data/threads-scraper/examples/threads-competitor-tracking)
- [Sentiment analysis dataset](https://apify.com/northbound-data/threads-scraper/examples/threads-sentiment-dataset)

**Keyword search**
- [Keyword search](https://apify.com/northbound-data/threads-search-scraper/examples/threads-keyword-search)
- [Hashtag monitoring](https://apify.com/northbound-data/threads-search-scraper/examples/threads-hashtag-monitoring)
- [Social listening](https://apify.com/northbound-data/threads-search-scraper/examples/threads-social-listening)
- [Trend research](https://apify.com/northbound-data/threads-search-scraper/examples/threads-trend-research)

**Creator discovery**
- [Influencer search](https://apify.com/northbound-data/threads-creator-finder/examples/threads-influencer-search)
- [Micro-influencers with contact links](https://apify.com/northbound-data/threads-creator-finder/examples/threads-micro-influencers)
- [Brand ambassador discovery](https://apify.com/northbound-data/threads-creator-finder/examples/threads-brand-ambassadors)
- [UGC creator search](https://apify.com/northbound-data/threads-creator-finder/examples/threads-ugc-creator-search)
- [Niche community mapping](https://apify.com/northbound-data/threads-creator-finder/examples/threads-niche-community-mapping)

---

## Legal & scope

Reads **public** Threads pages only. No login, no cookies, no CAPTCHA solving, no access-control circumvention. Threads publishes no `robots.txt` restriction for these paths.

You are responsible for how you use the data, including GDPR/CCPA obligations where personal data is involved.

Not affiliated with, endorsed by, or sponsored by Meta Platforms, Inc. "Threads" is a trademark of Meta Platforms, Inc.

## License

MIT — see [LICENSE](LICENSE).
