// Pull the replies to a specific post. Recommended posts are filtered out, so
// what you get back are actually replies.
//
//   APIFY_TOKEN=... node examples/post-replies.mjs
import { ThreadsClient } from '../src/index.mjs';

const threads = new ThreadsClient(process.env.APIFY_TOKEN);

const records = await threads.scrape({
  startUrls: ['https://www.threads.com/@natgeo/post/Db5pTtZFAmB'],
  includeReplies: true,
  maxItems: 50,
});

const replies = records.filter((r) => r.is_reply);
console.log(`${replies.length} replies to @${records[0]?.root_post_author}`);
for (const r of replies.slice(0, 5)) {
  console.log(`  @${r.author.username}: ${r.text.slice(0, 70)}`);
}
