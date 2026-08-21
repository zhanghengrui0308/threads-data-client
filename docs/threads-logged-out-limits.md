# What Threads actually returns when you are not logged in

**A measured reference. August 2026.**

Every number here came from a real request against `threads.com`, logged out, and
is dated. Where we could not establish something, it says so. If you find a
number that no longer holds, [open an issue](https://github.com/zhanghengrui0308/threads-data-client/issues)
— a stale measurement presented as current is the same as a wrong one.

---

## Summary

| Surface | Ceiling without an account |
|---|---|
| Replies to a post | **~20**, hard |
| Keyword search | **~20 per surface**, and there are **5 surfaces** |
| Posts on a profile | **~5 per tab**, and there are **4 tabs** |

The second and third rows are the interesting ones. Meta caps each *entry point*
rather than the total, so querying every public entry point and merging returns
substantially more than any single one — without an account, and without touching
anything that is not already public.

---

## 1. Replies really are capped at ~20

Request a post page logged out and you get the post plus roughly its first 20
replies. Past that, Threads renders one of:

```
Log in to see more replies.
Log in to see more from <username>
```

Both strings are **client-side rendered**. They are not in the HTML you receive,
which is why a naive scraper reports success and silently hands you a truncated
thread. Detecting the wall means rendering the page or inferring it from the
reply count in the payload.

**This ceiling cannot be raised without an account.** Any tool promising you
"all 800 replies" logged out is either driving logged-in accounts — against
Threads' terms, and those accounts get banned — or it is not telling you the truth.

---

## 2. Search has five public surfaces, not one

Threads' own website queries several different search endpoints:

| Surface | Query |
|---|---|
| Default | `serp_type=default` |
| Recent | `serp_type=default&filter=recent` |
| Top | `serp_type=default&filter=top` |
| Users | `serp_type=users` |
| Tags | `serp_type=tags` |

Each is capped around 20. **Each returns a different result set.** Measured,
deduplicated by post ID:

| Keyword | Default surface alone | All five merged |
|---|---|---|
| `ai agents` | 20 | **47** |
| `climate tech` | 21 | **54** |

That is **2.4–2.7x** more unique posts, from public endpoints the Threads website
itself uses.

---

## 3. Profiles have four public tabs

| Tab | Path |
|---|---|
| Threads | `/@user` |
| Replies | `/@user/replies` |
| Media | `/@user/media` |
| Reposts | `/@user/reposts` |

Each holds roughly 5 posts logged out, and they hold *different* posts. Measured:

| Profile | Main tab alone | All four merged |
|---|---|---|
| `@nasa` | 5 | **16** |
| `@mkbhd` | 6 | **22** |

**A caveat worth knowing**: `replies`, `media` and `reposts` are legitimately
empty for many accounts. Treating an empty secondary tab as a failure and
retrying it is expensive and pointless — `@nasa` has no reposts, and confirming
that by rendering the page cost us 32 seconds and raised one run's cost from
$0.079 to $0.125 to learn nothing.

---

## 4. Meta serves different pages to different IPs

This is the part that surprised us, and it is not documented anywhere we could find.

Request the same profile two ways on the same day:

| Client | Response |
|---|---|
| Browser-grade TLS fingerprint, residential IP | **~906 KB**, full server-rendered JSON in `<script type="application/json">` blocks |
| Plain `curl`, or a datacenter IP | **~255 KB** empty shell, no post data |

The shell is a valid HTTP 200. Nothing signals failure. A scraper that parses
whatever it gets will report "0 posts found" and call it a successful run.

The practical consequences, measured on the Apify platform, same target, same day
(2026-08-19):

| Proxy | Path taken | Time per profile | Compute cost per run |
|---|---|---|---|
| Datacenter | forced to full browser rendering | **150 s** | $0.127 |
| Residential | direct fetch, no rendering | **3.3 s** | $0.0086 |

**45x slower and 15x more expensive**, for identical output. If your Threads
scraping suddenly got slow and expensive, this is very likely why.

Two things follow:

- **Size is a usable signal.** We treat a response under ~500 KB that yields no
  posts as "the target genuinely does not exist" and stop immediately, and a
  large response that yields no posts as a transient failure worth retrying.
  Getting this backwards burns money on missing targets and gives up on
  recoverable ones.
- **Watch your render ratio.** We log what fraction of fetches fell back to
  rendering. When that number climbs, Meta has started serving shells to the IP
  range you are on. It is the earliest warning you get.

---

## 5. Structure changes, signatures do not

Most Threads scrapers hard-code GraphQL `doc_id` values or fixed JSON paths.
Both change without notice, and when they do the scraper returns zero rows
rather than an error.

We identify a post by **structural signature** instead: a node carrying `pk` and
`user.username` and at least one of `caption`, `text_post_app_info` or `taken_at`.
A refactor that moves the data degrades the result instead of killing the run.

One thing to filter explicitly: Threads returns **recommended posts in the same
payload as genuine replies**. Keys like `relatedPosts`, `recommendedPosts` and
`suggestedUsers` sit alongside the real thread. Parse the payload naively and
your "30 replies to my post" quietly include 10 strangers discussing something
else.

---

## 6. Not every brand is on Threads

Worth checking before you blame your scraper. Of 40 well-known brand handles we
tested, these had **no Threads account** as of August 2026:

`tesla` · `spacex` · `apple` · `stripe` · `vercel` · `anthropicai`

A missing target is not a failure, and a tool that counts it as one is inflating
its own error rate while telling you nothing useful. Separate the two, and report
which inputs were bad.

---

## Method

Measurements were taken via the Actors this client wraps, running on Apify with
residential proxies, reading only public pages — no login, no cookies, no CAPTCHA
solving, no access-control circumvention. **On `robots.txt`, stated plainly:** `threads.com/robots.txt` runs an allowlist. Named crawlers
(Googlebot, Bingbot, GPTBot, ClaudeBot and others) are granted specific access; for every other user
agent the file says `Disallow: /`, and its opening notice states that automated collection requires
express written permission from Meta. **This client is not on that allowlist.** We say so because you
should decide with the real facts rather than a comfortable summary, and because you are the party
accountable for how the data is collected and used under Meta's terms and applicable law.

Benchmark referenced above: 24 tasks (8 profiles, 10 posts, 6 keyword searches),
**647 records, 0 failed tasks**, 5.5 s average per task, 72 fetches with zero
render fallbacks.

---

## If you want this data without building it

The three Actors behind these measurements are public:

- **[Threads Scraper](https://apify.com/northbound-data/threads-scraper)** — posts, replies, profiles and search in one run
- **[Threads Search Scraper](https://apify.com/northbound-data/threads-search-scraper)** — keyword search, deduplicated across keywords
- **[Threads Creator Finder](https://apify.com/northbound-data/threads-creator-finder)** — creators ranked by engagement on your topic

Or read [the client](https://github.com/zhanghengrui0308/threads-data-client) and
do it yourself. The limits above apply either way — they are Meta's, not ours.
