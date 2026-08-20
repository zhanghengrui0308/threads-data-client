// Search several keywords at once. A post matching more than one keyword is
// returned — and billed — only once.
//
//   APIFY_TOKEN=... node examples/search-keywords.mjs
import { ThreadsClient } from '../src/index.mjs';

const threads = new ThreadsClient(process.env.APIFY_TOKEN);

const posts = await threads.search(['ai agents', 'climate tech'], {
  searchDepth: 'deep',   // all five public search surfaces, merged
  maxItems: 100,         // hard cap on what you are billed for
});

console.log(`${posts.length} posts`);
for (const p of posts.slice(0, 5)) {
  console.log(`  @${p.author.username}  ♥${p.like_count}  [${p.query}]  ${p.text.slice(0, 70)}`);
}
