// Find small creators who actually drive engagement on a topic. Ranked by
// engagement on the topic, not by follower count.
//
//   APIFY_TOKEN=... node examples/find-creators.mjs
import { ThreadsClient, ACTORS } from '../src/index.mjs';

const threads = new ThreadsClient(process.env.APIFY_TOKEN);

console.log(`100 creators will cost $${ThreadsClient.estimateCost(ACTORS.creators, 100)}`);

const creators = await threads.findCreators(['sustainable fashion'], {
  enrichProfiles: true,
  maxItems: 100,
});

for (const c of creators.slice(0, 10)) {
  console.log(`  @${c.username}  followers=${c.follower_count}  topic♥=${c.likes_on_topic}  ${c.bio_link ?? ''}`);
}
