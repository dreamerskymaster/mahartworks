// GitHub's own cron for sync.yml is best-effort and in practice fired only every 4–8 hours.
// This Worker's cron is reliable: it asks GitHub to run the Drive sync every 20 minutes.
// Each run takes ~1 min and only commits when Drive actually changed.
const DISPATCH =
  "https://api.github.com/repos/dreamerskymaster/mahartworks/actions/workflows/sync.yml/dispatches";

export default {
  async scheduled(event, env) {
    const r = await fetch(DISPATCH, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "mah-artworks-scheduler",
      },
      body: JSON.stringify({ ref: "main" }),
    });
    if (r.status !== 204) console.log(`dispatch failed: ${r.status} ${await r.text()}`);
  },
};
